use aes_gcm::aead::Aead;
use aes_gcm::{Aes256Gcm, KeyInit, Nonce};
use argon2::Argon2;
use bip39::{Language, Mnemonic};
use hmac::{Hmac, Mac};
use rand::RngCore;
use secp256k1::{Message, PublicKey, Secp256k1, SecretKey};
use serde::{Deserialize, Serialize};
use sha2::Sha512;
use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;
use tiny_keccak::{Hasher, Keccak};

type HmacSha512 = Hmac<Sha512>;

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct WalletItem {
    pub id: String,
    pub name: String,
    pub mnemonic: String,
    pub derived_count: u32,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct WalletSummary {
    pub id: String,
    pub name: String,
    pub primary_address: String,
    pub derived_count: u32,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct AccountInfo {
    pub address: String,
    pub index: u32,
    pub path: String,
}

#[derive(Serialize, Deserialize)]
pub struct EncryptedVault {
    pub salt: String,
    pub nonce: String,
    pub ciphertext: String,
}

static UNLOCKED_MASTER_KEY: Mutex<Option<[u8; 32]>> = Mutex::new(None);
static UNLOCKED_SALT: Mutex<Option<[u8; 16]>> = Mutex::new(None);
static UNLOCKED_WALLETS: Mutex<Vec<WalletItem>> = Mutex::new(Vec::new());
static ACTIVE_WALLET_ID: Mutex<Option<String>> = Mutex::new(None);

fn secure_zero_bytes(buf: &mut [u8]) {
    for b in buf.iter_mut() {
        unsafe {
            std::ptr::write_volatile(b, 0);
        }
    }
    std::sync::atomic::compiler_fence(std::sync::atomic::Ordering::SeqCst);
}

fn secure_zero_string(s: &mut String) {
    unsafe {
        secure_zero_bytes(s.as_bytes_mut());
    }
    s.clear();
}

fn lock_master_key() -> std::sync::MutexGuard<'static, Option<[u8; 32]>> {
    UNLOCKED_MASTER_KEY.lock().unwrap_or_else(|e| e.into_inner())
}

fn lock_salt() -> std::sync::MutexGuard<'static, Option<[u8; 16]>> {
    UNLOCKED_SALT.lock().unwrap_or_else(|e| e.into_inner())
}

fn lock_wallets() -> std::sync::MutexGuard<'static, Vec<WalletItem>> {
    UNLOCKED_WALLETS.lock().unwrap_or_else(|e| e.into_inner())
}

fn lock_active_wallet_id() -> std::sync::MutexGuard<'static, Option<String>> {
    ACTIVE_WALLET_ID.lock().unwrap_or_else(|e| e.into_inner())
}

fn verify_master_password(password: &str) -> Result<(), String> {
    let master_key = lock_master_key()
        .ok_or_else(|| "Wallet is locked".to_string())?;
    let salt = lock_salt()
        .ok_or_else(|| "Wallet is locked".to_string())?;

    let mut derived = [0u8; 32];
    Argon2::default()
        .hash_password_into(password.as_bytes(), &salt, &mut derived)
        .map_err(|e| format!("Argon2 error: {}", e))?;

    let mut diff: u8 = 0;
    for (a, b) in derived.iter().zip(master_key.iter()) {
        diff |= a ^ b;
    }
    secure_zero_bytes(&mut derived);

    if diff != 0 {
        return Err("Invalid master password".to_string());
    }
    Ok(())
}

#[tauri::command]
pub fn generate_mnemonic(words: Option<u32>) -> Result<String, String> {
    let mut rng = rand::thread_rng();
    let word_count = words.unwrap_or(12);
    let entropy_len = if word_count == 24 { 32 } else { 16 };
    let mut entropy = vec![0u8; entropy_len];
    rng.fill_bytes(&mut entropy);
    let mnemonic = Mnemonic::from_entropy_in(Language::English, &entropy)
        .map_err(|e| format!("Failed to generate mnemonic: {:?}", e))?;
    Ok(mnemonic.to_string())
}

fn derive_bip32_child(
    secp: &Secp256k1<secp256k1::All>,
    parent_key: &SecretKey,
    parent_chain_code: &[u8; 32],
    index: u32,
) -> Result<(SecretKey, [u8; 32]), String> {
    let mut mac = <HmacSha512 as hmac::Mac>::new_from_slice(parent_chain_code).map_err(|e| e.to_string())?;

    if index >= 0x8000_0000 {
        // Hardened child: 0x00 || parent_key (32 bytes) || index (4 bytes BE)
        mac.update(&[0u8]);
        mac.update(&parent_key.secret_bytes());
        mac.update(&index.to_be_bytes());
    } else {
        // Normal child: compressed pubkey (33 bytes) || index (4 bytes BE)
        let pubkey = PublicKey::from_secret_key(secp, parent_key);
        mac.update(&pubkey.serialize());
        mac.update(&index.to_be_bytes());
    }

    let result = mac.finalize().into_bytes();
    let mut il = [0u8; 32];
    il.copy_from_slice(&result[0..32]);
    let mut child_chain_code = [0u8; 32];
    child_chain_code.copy_from_slice(&result[32..64]);

    let scalar = secp256k1::Scalar::from_be_bytes(il)
        .map_err(|_| "IL is greater than or equal to curve order".to_string())?;
    let child_key = parent_key
        .add_tweak(&scalar)
        .map_err(|e| format!("Tweaking secret key failed: {:?}", e))?;

    Ok((child_key, child_chain_code))
}

fn derive_private_key_bip44(mnemonic_str: &str, account_index: u32) -> Result<[u8; 32], String> {
    let mnemonic = Mnemonic::parse_in_normalized(Language::English, mnemonic_str)
        .map_err(|e| format!("Invalid mnemonic: {:?}", e))?;
    let seed = mnemonic.to_seed("");

    // BIP-32 Master key derivation: HMAC-SHA512("Bitcoin seed", seed)
    let mut mac = <HmacSha512 as hmac::Mac>::new_from_slice(b"Bitcoin seed").map_err(|e| e.to_string())?;
    mac.update(&seed);
    let result = mac.finalize().into_bytes();

    let mut master_key_bytes = [0u8; 32];
    master_key_bytes.copy_from_slice(&result[0..32]);
    let mut chain_code = [0u8; 32];
    chain_code.copy_from_slice(&result[32..64]);

    let secp = Secp256k1::new();
    let mut current_key = SecretKey::from_slice(&master_key_bytes).map_err(|e| e.to_string())?;

    // Standard BIP-44 EVM path: m / 44' / 60' / 0' / 0 / account_index
    let path = [
        0x8000_0000 + 44, // 44'
        0x8000_0000 + 60, // 60'
        0x8000_0000 + 0,  // 0'
        0,                 // 0 (external change)
        account_index,     // account index
    ];

    for &index in &path {
        let (next_key, next_chain_code) = derive_bip32_child(&secp, &current_key, &chain_code, index)?;
        current_key = next_key;
        chain_code = next_chain_code;
    }

    Ok(current_key.secret_bytes())
}

fn public_key_to_address(pubkey: &PublicKey) -> String {
    let uncompressed = pubkey.serialize_uncompressed();
    let mut hasher = Keccak::v256();
    let mut hash = [0u8; 32];
    hasher.update(&uncompressed[1..65]);
    hasher.finalize(&mut hash);
    format!("0x{}", hex::encode(&hash[12..32]))
}

fn get_vault_path() -> PathBuf {
    #[cfg(debug_assertions)]
    {
        #[cfg(target_os = "windows")]
        let base = std::env::var_os("USERPROFILE")
            .or_else(|| std::env::var_os("APPDATA"))
            .map(PathBuf::from)
            .unwrap_or_else(|| PathBuf::from("."));
        #[cfg(not(target_os = "windows"))]
        let base = std::env::var_os("HOME")
            .map(PathBuf::from)
            .unwrap_or_else(|| PathBuf::from("."));
        base.join(".rogue-wallet.vault")
    }
    #[cfg(not(debug_assertions))]
    {
        #[cfg(target_os = "windows")]
        let vault_dir = std::env::var_os("APPDATA")
            .or_else(|| std::env::var_os("USERPROFILE"))
            .map(|p| PathBuf::from(p).join("rogue-signal"))
            .unwrap_or_else(|| PathBuf::from(".rogue-signal"));

        #[cfg(not(target_os = "windows"))]
        let vault_dir = if let Some(data_home) = std::env::var_os("XDG_DATA_HOME") {
            PathBuf::from(data_home).join("rogue-signal")
        } else if let Some(home) = std::env::var_os("HOME") {
            PathBuf::from(home).join(".local").join("share").join("rogue-signal")
        } else {
            PathBuf::from(".rogue-signal")
        };

        let _ = std::fs::create_dir_all(&vault_dir);
        vault_dir.join("wallet.vault")
    }
}

fn save_vault_locked(wallets: &[WalletItem], active_id: &Option<String>) -> Result<(), String> {
    let master_key_opt = *lock_master_key();
    let master_key = master_key_opt.ok_or_else(|| "Vault is locked".to_string())?;

    let salt_opt = *lock_salt();
    let salt = salt_opt.unwrap_or([0u8; 16]);

    let mut nonce_bytes = [0u8; 12];
    let mut rng = rand::thread_rng();
    rng.fill_bytes(&mut nonce_bytes);

    let cipher = Aes256Gcm::new_from_slice(&master_key).map_err(|e| e.to_string())?;
    let nonce = Nonce::from_slice(&nonce_bytes);

    let payload = serde_json::json!({
        "wallets": wallets,
        "active_wallet_id": active_id,
    });

    let ciphertext = cipher
        .encrypt(nonce, payload.to_string().as_bytes())
        .map_err(|e| format!("Encryption failed: {}", e))?;

    let vault = EncryptedVault {
        salt: hex::encode(salt),
        nonce: hex::encode(nonce_bytes),
        ciphertext: hex::encode(ciphertext),
    };

    let json_data = serde_json::to_string_pretty(&vault).map_err(|e| e.to_string())?;
    let path = get_vault_path();
    if let Some(parent) = path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    let tmp_path = path.with_extension("vault.tmp");

    {
        use std::io::Write;
        let mut opts = fs::OpenOptions::new();
        opts.write(true).create(true).truncate(true);
        #[cfg(unix)]
        {
            use std::os::unix::fs::OpenOptionsExt;
            opts.mode(0o600);
        }
        let mut file = opts
            .open(&tmp_path)
            .map_err(|e| format!("Failed to open temp vault file: {}", e))?;
        file.write_all(json_data.as_bytes())
            .map_err(|e| format!("Failed to write temp vault file: {}", e))?;
        file.sync_all()
            .map_err(|e| format!("Failed to sync temp vault file: {}", e))?;
    }

    fs::rename(&tmp_path, &path)
        .map_err(|e| format!("Failed to atomically replace vault file: {}", e))?;

    Ok(())
}

#[tauri::command]
pub fn create_wallet(mnemonic: String, password: String, name: Option<String>) -> Result<WalletSummary, String> {
    let _ = Mnemonic::parse_in_normalized(Language::English, &mnemonic)
        .map_err(|e| format!("Invalid mnemonic: {:?}", e))?;

    let mut salt = [0u8; 16];
    let mut rng = rand::thread_rng();
    rng.fill_bytes(&mut salt);

    let mut enc_key = [0u8; 32];
    Argon2::default()
        .hash_password_into(password.as_bytes(), &salt, &mut enc_key)
        .map_err(|e| format!("Argon2 derivation error: {}", e))?;

    let wallet_id = format!(
        "wallet_{}",
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_millis()
    );
    let wallet_name = name.unwrap_or_else(|| "Billetera Principal".to_string());

    let item = WalletItem {
        id: wallet_id.clone(),
        name: wallet_name.clone(),
        mnemonic: mnemonic.clone(),
        derived_count: 1,
    };

    let wallets = vec![item];
    let active_id = Some(wallet_id.clone());

    *UNLOCKED_MASTER_KEY.lock().unwrap() = Some(enc_key);
    *UNLOCKED_SALT.lock().unwrap() = Some(salt);
    *UNLOCKED_WALLETS.lock().unwrap() = wallets.clone();
    *ACTIVE_WALLET_ID.lock().unwrap() = active_id.clone();

    save_vault_locked(&wallets, &active_id)?;

    let privkey = derive_private_key_bip44(&mnemonic, 0)?;
    let secp = Secp256k1::new();
    let secret = SecretKey::from_slice(&privkey).map_err(|e| e.to_string())?;
    let pubkey = PublicKey::from_secret_key(&secp, &secret);
    let address = public_key_to_address(&pubkey);

    Ok(WalletSummary {
        id: wallet_id,
        name: wallet_name,
        primary_address: address,
        derived_count: 1,
    })
}

#[tauri::command]
pub fn unlock_wallet(password: String) -> Result<Vec<WalletSummary>, String> {
    let path = get_vault_path();
    if !path.exists() {
        return Err("No wallet vault found. Please create one first.".to_string());
    }

    let raw = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let vault: EncryptedVault = serde_json::from_str(&raw).map_err(|e| e.to_string())?;

    let salt_vec = hex::decode(&vault.salt).map_err(|e| e.to_string())?;
    if salt_vec.len() != 16 {
        return Err("Corrupted vault salt".to_string());
    }
    let mut salt = [0u8; 16];
    salt.copy_from_slice(&salt_vec);

    let nonce_bytes = hex::decode(&vault.nonce).map_err(|e| e.to_string())?;
    if nonce_bytes.len() != 12 {
        return Err("Corrupted vault nonce".to_string());
    }
    let ciphertext = hex::decode(&vault.ciphertext).map_err(|e| e.to_string())?;

    let mut enc_key = [0u8; 32];
    Argon2::default()
        .hash_password_into(password.as_bytes(), &salt, &mut enc_key)
        .map_err(|e| format!("Argon2 error: {}", e))?;

    let cipher = Aes256Gcm::new_from_slice(&enc_key).map_err(|e| e.to_string())?;
    let nonce = Nonce::from_slice(&nonce_bytes);

    let decrypted = cipher
        .decrypt(nonce, ciphertext.as_ref())
        .map_err(|_| {
            secure_zero_bytes(&mut enc_key);
            "Invalid master password".to_string()
        })?;

    let payload: serde_json::Value = serde_json::from_slice(&decrypted).map_err(|e| e.to_string())?;

    let mut wallets: Vec<WalletItem> = Vec::new();
    let mut active_wallet_id: Option<String> = None;

    if let Some(arr) = payload.get("wallets").and_then(|w| w.as_array()) {
        for w in arr {
            if let Ok(item) = serde_json::from_value::<WalletItem>(w.clone()) {
                wallets.push(item);
            }
        }
        active_wallet_id = payload.get("active_wallet_id").and_then(|id| id.as_str()).map(|s| s.to_string());
    } else if let Some(m) = payload.get("mnemonic").and_then(|m| m.as_str()) {
        // Migration from previous single-wallet vault format
        let item = WalletItem {
            id: "wallet_1".to_string(),
            name: "Billetera Principal".to_string(),
            mnemonic: m.to_string(),
            derived_count: 1,
        };
        active_wallet_id = Some("wallet_1".to_string());
        wallets.push(item);
    }

    if wallets.is_empty() {
        return Err("No wallets found in vault".to_string());
    }

    if active_wallet_id.is_none() || !wallets.iter().any(|w| Some(&w.id) == active_wallet_id.as_ref()) {
        active_wallet_id = Some(wallets[0].id.clone());
    }

    *UNLOCKED_MASTER_KEY.lock().unwrap() = Some(enc_key);
    *UNLOCKED_SALT.lock().unwrap() = Some(salt);
    *UNLOCKED_WALLETS.lock().unwrap() = wallets.clone();
    *ACTIVE_WALLET_ID.lock().unwrap() = active_wallet_id;

    let secp = Secp256k1::new();
    let mut summaries = Vec::new();
    for w in &wallets {
        let privkey = derive_private_key_bip44(&w.mnemonic, 0)?;
        let secret = SecretKey::from_slice(&privkey).map_err(|e| e.to_string())?;
        let pubkey = PublicKey::from_secret_key(&secp, &secret);
        let address = public_key_to_address(&pubkey);
        summaries.push(WalletSummary {
            id: w.id.clone(),
            name: w.name.clone(),
            primary_address: address,
            derived_count: w.derived_count,
        });
    }

    Ok(summaries)
}

#[tauri::command]
pub fn add_wallet(mnemonic: String, name: Option<String>) -> Result<WalletSummary, String> {
    let _ = Mnemonic::parse_in_normalized(Language::English, &mnemonic)
        .map_err(|e| format!("Invalid mnemonic: {:?}", e))?;

    let mut wallets = UNLOCKED_WALLETS.lock().unwrap();
    if wallets.is_empty() && UNLOCKED_MASTER_KEY.lock().unwrap().is_none() {
        return Err("Vault is locked".to_string());
    }

    let count = wallets.len() + 1;
    let wallet_id = format!(
        "wallet_{}_{}",
        count,
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_millis()
    );
    let wallet_name = name.unwrap_or_else(|| format!("Billetera {}", count));

    let item = WalletItem {
        id: wallet_id.clone(),
        name: wallet_name.clone(),
        mnemonic: mnemonic.clone(),
        derived_count: 1,
    };

    wallets.push(item);
    let active_id = ACTIVE_WALLET_ID.lock().unwrap().clone();
    save_vault_locked(&wallets, &active_id)?;

    let privkey = derive_private_key_bip44(&mnemonic, 0)?;
    let secp = Secp256k1::new();
    let secret = SecretKey::from_slice(&privkey).map_err(|e| e.to_string())?;
    let pubkey = PublicKey::from_secret_key(&secp, &secret);
    let address = public_key_to_address(&pubkey);

    Ok(WalletSummary {
        id: wallet_id,
        name: wallet_name,
        primary_address: address,
        derived_count: 1,
    })
}

#[tauri::command]
pub fn remove_wallet(wallet_id: String) -> Result<Vec<WalletSummary>, String> {
    let mut wallets = UNLOCKED_WALLETS.lock().unwrap();
    if wallets.len() <= 1 {
        return Err("No se puede eliminar la única billetera de la bóveda".to_string());
    }

    let pos = wallets
        .iter()
        .position(|w| w.id == wallet_id)
        .ok_or_else(|| "Billetera no encontrada".to_string())?;
    wallets.remove(pos);

    let mut active_lock = ACTIVE_WALLET_ID.lock().unwrap();
    if active_lock.as_deref() == Some(&wallet_id) {
        *active_lock = Some(wallets[0].id.clone());
    }
    let active_id = active_lock.clone();

    save_vault_locked(&wallets, &active_id)?;

    let secp = Secp256k1::new();
    let mut summaries = Vec::new();
    for w in wallets.iter() {
        let privkey = derive_private_key_bip44(&w.mnemonic, 0)?;
        let secret = SecretKey::from_slice(&privkey).map_err(|e| e.to_string())?;
        let pubkey = PublicKey::from_secret_key(&secp, &secret);
        let address = public_key_to_address(&pubkey);
        summaries.push(WalletSummary {
            id: w.id.clone(),
            name: w.name.clone(),
            primary_address: address,
            derived_count: w.derived_count,
        });
    }

    Ok(summaries)
}

#[tauri::command]
pub fn rename_wallet(wallet_id: String, new_name: String) -> Result<(), String> {
    let mut wallets = UNLOCKED_WALLETS.lock().unwrap();
    let item = wallets
        .iter_mut()
        .find(|w| w.id == wallet_id)
        .ok_or_else(|| "Billetera no encontrada".to_string())?;
    item.name = new_name;
    let active_id = ACTIVE_WALLET_ID.lock().unwrap().clone();
    save_vault_locked(&wallets, &active_id)?;
    Ok(())
}

#[tauri::command]
pub fn set_active_wallet(wallet_id: String) -> Result<WalletSummary, String> {
    let wallets = UNLOCKED_WALLETS.lock().unwrap();
    let item = wallets
        .iter()
        .find(|w| w.id == wallet_id)
        .ok_or_else(|| "Billetera no encontrada".to_string())?;

    *ACTIVE_WALLET_ID.lock().unwrap() = Some(wallet_id.clone());
    save_vault_locked(&wallets, &Some(wallet_id.clone()))?;

    let privkey = derive_private_key_bip44(&item.mnemonic, 0)?;
    let secp = Secp256k1::new();
    let secret = SecretKey::from_slice(&privkey).map_err(|e| e.to_string())?;
    let pubkey = PublicKey::from_secret_key(&secp, &secret);
    let address = public_key_to_address(&pubkey);

    Ok(WalletSummary {
        id: item.id.clone(),
        name: item.name.clone(),
        primary_address: address,
        derived_count: item.derived_count,
    })
}

#[tauri::command]
pub fn get_wallets() -> Result<Vec<WalletSummary>, String> {
    let wallets = UNLOCKED_WALLETS.lock().unwrap();
    if wallets.is_empty() {
        return Err("Wallet is locked".to_string());
    }

    let secp = Secp256k1::new();
    let mut summaries = Vec::new();
    for w in wallets.iter() {
        let privkey = derive_private_key_bip44(&w.mnemonic, 0)?;
        let secret = SecretKey::from_slice(&privkey).map_err(|e| e.to_string())?;
        let pubkey = PublicKey::from_secret_key(&secp, &secret);
        let address = public_key_to_address(&pubkey);
        summaries.push(WalletSummary {
            id: w.id.clone(),
            name: w.name.clone(),
            primary_address: address,
            derived_count: w.derived_count,
        });
    }

    Ok(summaries)
}

#[tauri::command]
pub fn get_mnemonic(password: String, wallet_id: Option<String>) -> Result<String, String> {
    verify_master_password(&password)?;
    let wallets = lock_wallets();
    if wallets.is_empty() {
        return Err("Wallet is locked".to_string());
    }

    let target_id = wallet_id.or_else(|| lock_active_wallet_id().clone());
    let item = wallets
        .iter()
        .find(|w| Some(&w.id) == target_id.as_ref())
        .ok_or_else(|| "Billetera no encontrada".to_string())?;

    Ok(item.mnemonic.clone())
}

#[tauri::command]
pub fn get_derived_accounts(wallet_id: Option<String>, count: Option<u32>) -> Result<Vec<AccountInfo>, String> {
    let mut wallets = UNLOCKED_WALLETS.lock().unwrap();
    if wallets.is_empty() {
        return Err("Wallet is locked".to_string());
    }

    let target_id = wallet_id.or_else(|| ACTIVE_WALLET_ID.lock().unwrap().clone());
    let (mnemonic, req_count) = {
        let item = wallets
            .iter_mut()
            .find(|w| Some(&w.id) == target_id.as_ref())
            .ok_or_else(|| "Billetera no encontrada".to_string())?;

        let req_count = count.unwrap_or(item.derived_count).max(1);
        if req_count > item.derived_count {
            item.derived_count = req_count;
        }
        (item.mnemonic.clone(), req_count)
    };

    let active_id = ACTIVE_WALLET_ID.lock().unwrap().clone();
    let _ = save_vault_locked(&wallets, &active_id);

    let mut accounts = Vec::new();
    let secp = Secp256k1::new();

    for i in 0..req_count {
        let privkey = derive_private_key_bip44(&mnemonic, i)?;
        let secret = SecretKey::from_slice(&privkey).map_err(|e| e.to_string())?;
        let pubkey = PublicKey::from_secret_key(&secp, &secret);
        let address = public_key_to_address(&pubkey);
        let path = format!("m/44'/60'/0'/0/{}", i);
        accounts.push(AccountInfo {
            address,
            index: i,
            path,
        });
    }

    Ok(accounts)
}

#[tauri::command]
pub fn get_accounts() -> Result<Vec<AccountInfo>, String> {
    get_derived_accounts(None, None)
}

#[tauri::command]
pub fn get_private_key(password: String, wallet_id: Option<String>, account_index: u32) -> Result<String, String> {
    verify_master_password(&password)?;
    let wallets = lock_wallets();
    if wallets.is_empty() {
        return Err("Wallet is locked".to_string());
    }

    let target_id = wallet_id.or_else(|| lock_active_wallet_id().clone());
    let item = wallets
        .iter()
        .find(|w| Some(&w.id) == target_id.as_ref())
        .ok_or_else(|| "Billetera no encontrada".to_string())?;

    let mut privkey = derive_private_key_bip44(&item.mnemonic, account_index)?;
    let hex_key = format!("0x{}", hex::encode(privkey));
    secure_zero_bytes(&mut privkey);
    Ok(hex_key)
}

#[tauri::command]
pub fn lock_wallet() -> Result<(), String> {
    if let Some(ref mut key) = *lock_master_key() {
        secure_zero_bytes(key);
    }
    *lock_master_key() = None;

    if let Some(ref mut salt) = *lock_salt() {
        secure_zero_bytes(salt);
    }
    *lock_salt() = None;

    {
        let mut wallets = lock_wallets();
        for w in wallets.iter_mut() {
            secure_zero_string(&mut w.mnemonic);
        }
        wallets.clear();
    }
    *lock_active_wallet_id() = None;
    Ok(())
}

fn be_bytes_trimmed(bytes: &[u8]) -> &[u8] {
    let first_non_zero = bytes.iter().position(|&b| b != 0).unwrap_or(bytes.len());
    &bytes[first_non_zero..]
}

fn rlp_length_prefix(len: usize, short_offset: u8, long_offset: u8) -> Vec<u8> {
    if len <= 55 {
        vec![short_offset + len as u8]
    } else {
        let len_be = len.to_be_bytes();
        let len_bytes = be_bytes_trimmed(&len_be);
        let mut out = Vec::with_capacity(1 + len_bytes.len());
        out.push(long_offset + len_bytes.len() as u8);
        out.extend_from_slice(len_bytes);
        out
    }
}

fn rlp_encode_bytes(data: &[u8]) -> Vec<u8> {
    if data.len() == 1 && data[0] < 0x80 {
        return vec![data[0]];
    }
    let mut out = rlp_length_prefix(data.len(), 0x80, 0xb7);
    out.extend_from_slice(data);
    out
}

fn rlp_encode_u64(val: u64) -> Vec<u8> {
    if val == 0 {
        return vec![0x80];
    }
    let be = val.to_be_bytes();
    rlp_encode_bytes(be_bytes_trimmed(&be))
}

fn parse_hex_bytes(hex_str: &str) -> Result<Vec<u8>, String> {
    let clean = hex_str.trim().trim_start_matches("0x").trim_start_matches("0X");
    if clean.is_empty() {
        return Ok(Vec::new());
    }
    let padded = if clean.len() % 2 == 1 {
        format!("0{}", clean)
    } else {
        clean.to_string()
    };
    hex::decode(&padded).map_err(|e| format!("Invalid hex '{}': {}", hex_str, e))
}

fn rlp_encode_hex_uint(hex_str: &str) -> Result<Vec<u8>, String> {
    let bytes = parse_hex_bytes(hex_str)?;
    Ok(rlp_encode_bytes(be_bytes_trimmed(&bytes)))
}

fn rlp_encode_list(items: &[Vec<u8>]) -> Vec<u8> {
    let payload_len: usize = items.iter().map(|i| i.len()).sum();
    let mut out = rlp_length_prefix(payload_len, 0xc0, 0xf7);
    for item in items {
        out.extend_from_slice(item);
    }
    out
}

fn keccak256(data: &[u8]) -> [u8; 32] {
    let mut hasher = Keccak::v256();
    let mut out = [0u8; 32];
    hasher.update(data);
    hasher.finalize(&mut out);
    out
}

/// Sign a Legacy (Type 0) EIP-155 transaction and return the RLP-encoded raw tx hex (`0x...`)
/// ready for `eth_sendRawTransaction`.
pub fn build_and_sign_legacy_tx(
    privkey: &[u8; 32],
    nonce: u64,
    gas_price_hex: &str,
    gas_limit: u64,
    to: &str,
    value_wei_hex: &str,
    data_hex: &str,
    chain_id: u64,
) -> Result<String, String> {
    let to_bytes = parse_hex_bytes(to)?;
    if !to_bytes.is_empty() && to_bytes.len() != 20 {
        return Err("Recipient address must be 20 bytes".to_string());
    }
    let data_bytes = parse_hex_bytes(data_hex)?;

    let rlp_nonce = rlp_encode_u64(nonce);
    let rlp_gas_price = rlp_encode_hex_uint(gas_price_hex)?;
    let rlp_gas_limit = rlp_encode_u64(gas_limit);
    let rlp_to = rlp_encode_bytes(&to_bytes);
    let rlp_value = rlp_encode_hex_uint(value_wei_hex)?;
    let rlp_data = rlp_encode_bytes(&data_bytes);

    // EIP-155 unsigned payload: [nonce, gasPrice, gasLimit, to, value, data, chainId, 0, 0]
    let unsigned_rlp = rlp_encode_list(&[
        rlp_nonce.clone(),
        rlp_gas_price.clone(),
        rlp_gas_limit.clone(),
        rlp_to.clone(),
        rlp_value.clone(),
        rlp_data.clone(),
        rlp_encode_u64(chain_id),
        rlp_encode_u64(0),
        rlp_encode_u64(0),
    ]);

    let sighash = keccak256(&unsigned_rlp);

    let secp = Secp256k1::new();
    let secret = SecretKey::from_slice(privkey).map_err(|e| e.to_string())?;
    let message = Message::from_digest_slice(&sighash).map_err(|e| e.to_string())?;
    let sig = secp.sign_ecdsa_recoverable(&message, &secret);
    let (rec_id, sig_bytes) = sig.serialize_compact();

    let v = (rec_id.to_i32() as u64) + chain_id * 2 + 35;
    let r = be_bytes_trimmed(&sig_bytes[0..32]);
    let s = be_bytes_trimmed(&sig_bytes[32..64]);

    let signed_rlp = rlp_encode_list(&[
        rlp_nonce,
        rlp_gas_price,
        rlp_gas_limit,
        rlp_to,
        rlp_value,
        rlp_data,
        rlp_encode_u64(v),
        rlp_encode_bytes(r),
        rlp_encode_bytes(s),
    ]);

    Ok(format!("0x{}", hex::encode(signed_rlp)))
}

#[tauri::command]
pub fn sign_raw_transaction(
    to: String,
    value_wei_hex: String,
    gas_limit: u64,
    gas_price_hex: String,
    nonce: u64,
    chain_id: u64,
    data_hex: Option<String>,
    wallet_id: Option<String>,
    account_index: Option<u32>,
) -> Result<String, String> {
    let wallets = UNLOCKED_WALLETS.lock().unwrap();
    if wallets.is_empty() {
        return Err("Wallet is locked".to_string());
    }

    let target_id = wallet_id.or_else(|| ACTIVE_WALLET_ID.lock().unwrap().clone());
    let item = wallets
        .iter()
        .find(|w| Some(&w.id) == target_id.as_ref())
        .ok_or_else(|| "Billetera no encontrada".to_string())?;

    let index = account_index.unwrap_or(0);
    let privkey = derive_private_key_bip44(&item.mnemonic, index)?;

    build_and_sign_legacy_tx(
        &privkey,
        nonce,
        &gas_price_hex,
        gas_limit,
        &to,
        &value_wei_hex,
        data_hex.as_deref().unwrap_or(""),
        chain_id,
    )
}

#[tauri::command]
pub fn sign_transaction(
    tx_hash_hex: String,
    wallet_id: Option<String>,
    account_index: Option<u32>,
) -> Result<String, String> {
    let wallets = UNLOCKED_WALLETS.lock().unwrap();
    if wallets.is_empty() {
        return Err("Wallet is locked".to_string());
    }

    let target_id = wallet_id.or_else(|| ACTIVE_WALLET_ID.lock().unwrap().clone());
    let item = wallets
        .iter()
        .find(|w| Some(&w.id) == target_id.as_ref())
        .ok_or_else(|| "Billetera no encontrada".to_string())?;

    let index = account_index.unwrap_or(0);
    let privkey = derive_private_key_bip44(&item.mnemonic, index)?;

    let clean_hash = tx_hash_hex.trim_start_matches("0x");
    let hash_bytes = hex::decode(clean_hash).map_err(|e| format!("Invalid tx hash hex: {}", e))?;
    if hash_bytes.len() != 32 {
        return Err("Tx hash must be 32 bytes".to_string());
    }

    let secp = Secp256k1::new();
    let secret = SecretKey::from_slice(&privkey).map_err(|e| e.to_string())?;
    let message = Message::from_digest_slice(&hash_bytes).map_err(|e| e.to_string())?;

    let sig = secp.sign_ecdsa_recoverable(&message, &secret);
    let (rec_id, sig_bytes) = sig.serialize_compact();

    let mut full_sig = [0u8; 65];
    full_sig[0..64].copy_from_slice(&sig_bytes);
    full_sig[64] = rec_id.to_i32() as u8;

    Ok(format!("0x{}", hex::encode(full_sig)))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_bip44_derivation_matches_metamask() {
        // Known BIP-39 / BIP-44 test vector for derivation verification - DO NOT USE FOR REAL FUNDS
        let mnemonic = "draft horse index reduce awkward black final airport velvet boy obvious during";
        let privkey = derive_private_key_bip44(mnemonic, 0).expect("derivation failed");
        let secp = Secp256k1::new();
        let secret = SecretKey::from_slice(&privkey).expect("invalid secret key");
        let pubkey = PublicKey::from_secret_key(&secp, &secret);
        let address = public_key_to_address(&pubkey);

        assert_eq!(address.to_lowercase(), "0x0544802665bc7c22124348e745a7abaa8420e197".to_lowercase());
    }

    #[test]
    fn test_rlp_and_eip155_legacy_tx_signing() {
        use secp256k1::ecdsa::{RecoverableSignature, RecoveryId};

        let mnemonic = "draft horse index reduce awkward black final airport velvet boy obvious during";
        let privkey = derive_private_key_bip44(mnemonic, 0).expect("derivation failed");
        let secp = Secp256k1::new();
        let secret = SecretKey::from_slice(&privkey).unwrap();
        let expected_addr = public_key_to_address(&PublicKey::from_secret_key(&secp, &secret));

        let chain_id: u64 = 800055;
        let raw_tx = build_and_sign_legacy_tx(
            &privkey,
            0,
            "0x3b9aca00", // 1 Gwei
            21000,
            "0x000000000000000000000000000000000000dead",
            "0x0de0b6b3a7640000", // 1 ROGUE
            "",
            chain_id,
        )
        .expect("signing failed");

        assert!(raw_tx.starts_with("0xf8") || raw_tx.starts_with("0xf9"));
        let raw_bytes = hex::decode(raw_tx.trim_start_matches("0x")).unwrap();
        assert!(raw_bytes.len() > 80);

        // Verify EIP-155 sighash & recoverable signature against expected address
        let unsigned = rlp_encode_list(&[
            rlp_encode_u64(0),
            rlp_encode_hex_uint("0x3b9aca00").unwrap(),
            rlp_encode_u64(21000),
            rlp_encode_bytes(&parse_hex_bytes("0x000000000000000000000000000000000000dead").unwrap()),
            rlp_encode_hex_uint("0x0de0b6b3a7640000").unwrap(),
            rlp_encode_bytes(&[]),
            rlp_encode_u64(chain_id),
            rlp_encode_u64(0),
            rlp_encode_u64(0),
        ]);
        let sighash = keccak256(&unsigned);
        let msg = Message::from_digest_slice(&sighash).unwrap();
        let sig = secp.sign_ecdsa_recoverable(&msg, &secret);
        let (rec_id, sig_bytes) = sig.serialize_compact();

        // Check EIP-155 v encoding: v = rec_id + chain_id * 2 + 35
        let expected_v = (rec_id.to_i32() as u64) + chain_id * 2 + 35;
        assert!(expected_v == 1600145 || expected_v == 1600146);

        let rec_sig = RecoverableSignature::from_compact(&sig_bytes, RecoveryId::from_i32(rec_id.to_i32()).unwrap()).unwrap();
        let recovered_pk = secp.recover_ecdsa(&msg, &rec_sig).unwrap();
        assert_eq!(public_key_to_address(&recovered_pk).to_lowercase(), expected_addr.to_lowercase());
    }

    #[test]
    fn test_zeroize_and_password_verification() {
        let mut secret_buf = [0xAAu8; 32];
        secure_zero_bytes(&mut secret_buf);
        assert_eq!(secret_buf, [0u8; 32]);

        let mut secret_str = String::from("test secret mnemonic");
        secure_zero_string(&mut secret_str);
        assert!(secret_str.is_empty());

        // Populate in-memory unlocked state and test verify_master_password & lock_wallet
        let salt = [0x11u8; 16];
        let mut key = [0u8; 32];
        Argon2::default()
            .hash_password_into(b"CorrectHorseBattery", &salt, &mut key)
            .unwrap();
        *lock_master_key() = Some(key);
        *lock_salt() = Some(salt);
        *lock_wallets() = vec![WalletItem {
            id: "w1".to_string(),
            name: "Test".to_string(),
            mnemonic: "draft horse index reduce awkward black final airport velvet boy obvious during".to_string(),
            derived_count: 1,
        }];
        *lock_active_wallet_id() = Some("w1".to_string());

        assert!(verify_master_password("WrongPassword").is_err());
        assert!(verify_master_password("CorrectHorseBattery").is_ok());

        lock_wallet().unwrap();
        assert!(lock_master_key().is_none());
        assert!(lock_salt().is_none());
        assert!(lock_wallets().is_empty());
        assert!(lock_active_wallet_id().is_none());
    }
}
