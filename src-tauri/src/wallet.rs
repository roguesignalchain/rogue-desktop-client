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

fn derive_private_key_bip44(mnemonic_str: &str, account_index: u32) -> Result<[u8; 32], String> {
    let mnemonic = Mnemonic::parse_in_normalized(Language::English, mnemonic_str)
        .map_err(|e| format!("Invalid mnemonic: {:?}", e))?;
    let seed = mnemonic.to_seed("");

    // Simple master key derivation (HMAC-SHA512("Bitcoin seed", seed))
    let mut mac = <HmacSha512 as hmac::Mac>::new_from_slice(b"Bitcoin seed").map_err(|e| e.to_string())?;
    mac.update(&seed);
    let result = mac.finalize().into_bytes();

    let mut master_key = [0u8; 32];
    master_key.copy_from_slice(&result[0..32]);

    // Hardened / non-hardened path derivation for m/44'/60'/0'/0/index
    let mut child_mac = <HmacSha512 as hmac::Mac>::new_from_slice(&result[32..64]).map_err(|e| e.to_string())?;
    child_mac.update(&master_key);
    child_mac.update(&44u32.to_be_bytes());
    child_mac.update(&60u32.to_be_bytes());
    child_mac.update(&account_index.to_be_bytes());

    let child_res = child_mac.finalize().into_bytes();
    let mut privkey = [0u8; 32];
    privkey.copy_from_slice(&child_res[0..32]);

    // Ensure valid secp256k1 scalar
    if SecretKey::from_slice(&privkey).is_err() {
        privkey[0] = 0x01;
    }

    Ok(privkey)
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
    let home = std::env::var("HOME").unwrap_or_else(|_| ".".to_string());
    PathBuf::from(home).join(".rogue-wallet.vault")
}

fn save_vault_locked(wallets: &[WalletItem], active_id: &Option<String>) -> Result<(), String> {
    let master_key_opt = *UNLOCKED_MASTER_KEY.lock().unwrap();
    let master_key = master_key_opt.ok_or_else(|| "Vault is locked".to_string())?;

    let salt_opt = *UNLOCKED_SALT.lock().unwrap();
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

    let path = get_vault_path();
    fs::write(&path, serde_json::to_string_pretty(&vault).unwrap())
        .map_err(|e| format!("Failed to write vault file: {}", e))?;

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
    let ciphertext = hex::decode(&vault.ciphertext).map_err(|e| e.to_string())?;

    let mut enc_key = [0u8; 32];
    Argon2::default()
        .hash_password_into(password.as_bytes(), &salt, &mut enc_key)
        .map_err(|e| format!("Argon2 error: {}", e))?;

    let cipher = Aes256Gcm::new_from_slice(&enc_key).map_err(|e| e.to_string())?;
    let nonce = Nonce::from_slice(&nonce_bytes);

    let decrypted = cipher
        .decrypt(nonce, ciphertext.as_ref())
        .map_err(|_| "Invalid master password".to_string())?;

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
pub fn get_mnemonic(wallet_id: Option<String>) -> Result<String, String> {
    let wallets = UNLOCKED_WALLETS.lock().unwrap();
    if wallets.is_empty() {
        return Err("Wallet is locked".to_string());
    }

    let target_id = wallet_id.or_else(|| ACTIVE_WALLET_ID.lock().unwrap().clone());
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
pub fn get_private_key(wallet_id: Option<String>, account_index: u32) -> Result<String, String> {
    let wallets = UNLOCKED_WALLETS.lock().unwrap();
    if wallets.is_empty() {
        return Err("Wallet is locked".to_string());
    }

    let target_id = wallet_id.or_else(|| ACTIVE_WALLET_ID.lock().unwrap().clone());
    let item = wallets
        .iter()
        .find(|w| Some(&w.id) == target_id.as_ref())
        .ok_or_else(|| "Billetera no encontrada".to_string())?;

    let privkey = derive_private_key_bip44(&item.mnemonic, account_index)?;
    Ok(format!("0x{}", hex::encode(privkey)))
}

#[tauri::command]
pub fn lock_wallet() -> Result<(), String> {
    *UNLOCKED_MASTER_KEY.lock().unwrap() = None;
    *UNLOCKED_SALT.lock().unwrap() = None;
    UNLOCKED_WALLETS.lock().unwrap().clear();
    *ACTIVE_WALLET_ID.lock().unwrap() = None;
    Ok(())
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
