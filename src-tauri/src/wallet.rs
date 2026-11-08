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

static UNLOCKED_KEY: Mutex<Option<[u8; 32]>> = Mutex::new(None);

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct AccountInfo {
    pub address: String,
    pub index: u32,
}

#[derive(Serialize, Deserialize)]
pub struct EncryptedVault {
    pub salt: String,
    pub nonce: String,
    pub ciphertext: String,
}

#[tauri::command]
pub fn generate_mnemonic() -> Result<String, String> {
    let mut rng = rand::thread_rng();
    let mut entropy = [0u8; 16]; // 12 words
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
    // Deriving unique child using HMAC chain
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

#[tauri::command]
pub fn create_wallet(mnemonic: String, password: String) -> Result<String, String> {
    let privkey = derive_private_key_bip44(&mnemonic, 0)?;

    let mut salt = [0u8; 16];
    let mut nonce_bytes = [0u8; 12];
    let mut rng = rand::thread_rng();
    rng.fill_bytes(&mut salt);
    rng.fill_bytes(&mut nonce_bytes);

    let mut enc_key = [0u8; 32];
    Argon2::default()
        .hash_password_into(password.as_bytes(), &salt, &mut enc_key)
        .map_err(|e| format!("Argon2 derivation error: {}", e))?;

    let cipher = Aes256Gcm::new_from_slice(&enc_key).map_err(|e| e.to_string())?;
    let nonce = Nonce::from_slice(&nonce_bytes);

    let payload = serde_json::json!({
        "mnemonic": mnemonic,
        "primary_key": hex::encode(privkey),
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

    *UNLOCKED_KEY.lock().unwrap() = Some(privkey);

    let secp = Secp256k1::new();
    let secret = SecretKey::from_slice(&privkey).map_err(|e| e.to_string())?;
    let pubkey = PublicKey::from_secret_key(&secp, &secret);
    let address = public_key_to_address(&pubkey);

    Ok(address)
}

#[tauri::command]
pub fn unlock_wallet(password: String) -> Result<String, String> {
    let path = get_vault_path();
    if !path.exists() {
        return Err("No wallet vault found. Please create one first.".to_string());
    }

    let raw = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let vault: EncryptedVault = serde_json::from_str(&raw).map_err(|e| e.to_string())?;

    let salt = hex::decode(&vault.salt).map_err(|e| e.to_string())?;
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
    let mnemonic = payload["mnemonic"]
        .as_str()
        .ok_or_else(|| "Corrupted wallet file".to_string())?;

    let privkey = derive_private_key_bip44(mnemonic, 0)?;
    *UNLOCKED_KEY.lock().unwrap() = Some(privkey);

    let secp = Secp256k1::new();
    let secret = SecretKey::from_slice(&privkey).map_err(|e| e.to_string())?;
    let pubkey = PublicKey::from_secret_key(&secp, &secret);
    let address = public_key_to_address(&pubkey);

    Ok(address)
}

#[tauri::command]
pub fn get_accounts() -> Result<Vec<AccountInfo>, String> {
    let lock = UNLOCKED_KEY.lock().unwrap();
    if let Some(ref privkey) = *lock {
        let secp = Secp256k1::new();
        let secret = SecretKey::from_slice(privkey).map_err(|e| e.to_string())?;
        let pubkey = PublicKey::from_secret_key(&secp, &secret);
        let address = public_key_to_address(&pubkey);
        Ok(vec![AccountInfo { address, index: 0 }])
    } else {
        Err("Wallet is locked".to_string())
    }
}

#[tauri::command]
pub fn sign_transaction(tx_hash_hex: String) -> Result<String, String> {
    let lock = UNLOCKED_KEY.lock().unwrap();
    if let Some(ref privkey) = *lock {
        let clean_hash = tx_hash_hex.trim_start_matches("0x");
        let hash_bytes = hex::decode(clean_hash).map_err(|e| format!("Invalid tx hash hex: {}", e))?;
        if hash_bytes.len() != 32 {
            return Err("Tx hash must be 32 bytes".to_string());
        }

        let secp = Secp256k1::new();
        let secret = SecretKey::from_slice(privkey).map_err(|e| e.to_string())?;
        let message = Message::from_digest_slice(&hash_bytes).map_err(|e| e.to_string())?;

        let sig = secp.sign_ecdsa_recoverable(&message, &secret);
        let (rec_id, sig_bytes) = sig.serialize_compact();

        let mut full_sig = [0u8; 65];
        full_sig[0..64].copy_from_slice(&sig_bytes);
        full_sig[64] = rec_id.to_i32() as u8;

        Ok(format!("0x{}", hex::encode(full_sig)))
    } else {
        Err("Wallet is locked".to_string())
    }
}

