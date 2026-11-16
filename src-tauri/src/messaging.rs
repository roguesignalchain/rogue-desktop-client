use aes_gcm::aead::Aead;
use aes_gcm::{Aes256Gcm, KeyInit, Nonce};
use base64::engine::general_purpose::STANDARD as B64;
use base64::Engine;
use futures_util::StreamExt;
use hkdf::Hkdf;
use rand::RngCore;
use secp256k1::{Message, PublicKey, Secp256k1, SecretKey};
use serde::{Deserialize, Serialize};
use sha2::Sha256;
use std::collections::{BTreeMap, HashMap};
use std::fs;
use std::path::PathBuf;
use std::sync::{Arc, OnceLock};
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter, Manager};
use tiny_keccak::{Hasher, Keccak};
use tokio::sync::{watch, Mutex};

use crate::wallet;

const ECIES_INFO: &[u8] = b"rogue-dm-ecies-v1";
const LOCAL_DM_INFO: &[u8] = b"rogue-local-dm-store-v1";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EncryptedPayload {
    pub v: i32,
    pub ephemeral_pubkey: String,
    pub nonce: String,
    pub ciphertext: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatMessageEnvelope {
    pub v: i32,
    pub id: String,
    #[serde(default)]
    pub seq: u64,
    pub room: String,
    pub sender: String,
    pub level: u32,
    pub kind: String,
    pub text: String,
    #[serde(default)]
    pub reply_to: String,
    pub ts: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeleteMessageEvent {
    pub room: String,
    pub seq: u64,
    pub deleted_by: String,
    pub ts: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ErrorEvent {
    pub code: String,
    pub message: String,
    #[serde(default)]
    pub room: String,
    pub ts: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChannelMeta {
    pub name: String,
    pub topic: String,
    pub system: bool,
    pub gated: bool,
    pub min_level: u32,
    pub admin_only_write: bool,
    pub pinned: bool,
    pub created_by: String,
    pub created_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RoomSummary {
    #[serde(flatten)]
    pub meta: ChannelMeta,
    pub member_count: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PresenceRecord {
    pub address: String,
    pub active_room: String,
    pub level: u32,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProfileRecord {
    pub address: String,
    pub pubkey: String,
    pub miner_level: u32,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DMEnvelope {
    pub v: i32,
    pub id: String,
    pub sender: String,
    pub dest: String,
    pub ts: i64,
    pub payload: EncryptedPayload,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DecryptedDM {
    pub id: String,
    pub sender: String,
    pub dest: String,
    pub text: String,
    pub ts: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MessagingStatus {
    pub status: String, // "disconnected" | "connecting" | "connected" | "reconnecting" | "auth_error"
    pub address: Option<String>,
    pub server_url: Option<String>,
    pub miner_level: Option<u32>,
    pub error: Option<String>,
}

#[derive(Debug, Deserialize)]
struct CommandResponse {
    ok: bool,
    data: Option<serde_json::Value>,
    error: Option<ErrorEvent>,
}

#[derive(Debug, Deserialize)]
struct NonceResponse {
    nonce: Option<String>,
    message: Option<String>,
    error: Option<String>,
}

struct MessagingState {
    client: Option<async_nats::Client>,
    js: Option<async_nats::jetstream::Context>,
    address: Option<String>,
    server_url: Option<String>,
    miner_level: Option<u32>,
    status: String,
    error: Option<String>,
    active_room: String,
    shutdown_tx: Option<watch::Sender<bool>>,
    app_data_dir: Option<PathBuf>,
}

static STATE: OnceLock<Arc<Mutex<MessagingState>>> = OnceLock::new();

fn state() -> &'static Arc<Mutex<MessagingState>> {
    STATE.get_or_init(|| {
        Arc::new(Mutex::new(MessagingState {
            client: None,
            js: None,
            address: None,
            server_url: None,
            miner_level: None,
            status: "disconnected".to_string(),
            error: None,
            active_room: "general".to_string(),
            shutdown_tx: None,
            app_data_dir: None,
        }))
    })
}

fn now_millis() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64
}

pub fn build_challenge_message(chain_id: u64, address: &str, nonce: &str) -> String {
    format!(
        "Rogue Signal Messaging Auth\nChainID: {}\nAddress: {}\nNonce: {}",
        chain_id,
        address.trim().to_lowercase(),
        nonce
    )
}

fn eip191_digest(message: &str) -> [u8; 32] {
    let prefix = format!("\x19Ethereum Signed Message:\n{}", message.len());
    let mut hasher = Keccak::v256();
    let mut digest = [0u8; 32];
    hasher.update(prefix.as_bytes());
    hasher.update(message.as_bytes());
    hasher.finalize(&mut digest);
    digest
}

pub fn sign_personal_message(secret_bytes: &[u8; 32], message: &str) -> Result<String, String> {
    let secp = Secp256k1::new();
    let sk = SecretKey::from_slice(secret_bytes).map_err(|e| format!("invalid secret key: {}", e))?;
    let digest = eip191_digest(message);
    let msg = Message::from_digest(digest);
    let rec_sig = secp.sign_ecdsa_recoverable(&msg, &sk);
    let (rec_id, sig_bytes) = rec_sig.serialize_compact();

    let mut out = [0u8; 65];
    out[..64].copy_from_slice(&sig_bytes);
    out[64] = (rec_id.to_i32() as u8) + 27;
    Ok(format!("0x{}", hex::encode(out)))
}

fn derive_ecies_aes_key(shared_x: &[u8]) -> Result<[u8; 32], String> {
    let hk = Hkdf::<Sha256>::new(None, shared_x);
    let mut okm = [0u8; 32];
    hk.expand(ECIES_INFO, &mut okm)
        .map_err(|e| format!("HKDF expand failed: {}", e))?;
    Ok(okm)
}

pub fn encrypt_ecies(recipient_pubkey_hex: &str, plaintext: &[u8]) -> Result<EncryptedPayload, String> {
    let clean = recipient_pubkey_hex.trim().trim_start_matches("0x");
    let raw_pub = hex::decode(clean).map_err(|e| format!("invalid pubkey hex: {}", e))?;
    let recipient_pub =
        PublicKey::from_slice(&raw_pub).map_err(|e| format!("invalid secp256k1 pubkey: {}", e))?;

    let secp = Secp256k1::new();
    let mut rng = rand::thread_rng();
    let (ephem_sk, ephem_pk) = secp.generate_keypair(&mut rng);

    let shared_point = secp256k1::ecdh::shared_secret_point(&recipient_pub, &ephem_sk);
    let aes_key = derive_ecies_aes_key(&shared_point[..32])?;

    let cipher = Aes256Gcm::new_from_slice(&aes_key).map_err(|e| e.to_string())?;
    let mut nonce_bytes = [0u8; 12];
    rng.fill_bytes(&mut nonce_bytes);
    let nonce = Nonce::from_slice(&nonce_bytes);
    let ct = cipher
        .encrypt(nonce, plaintext)
        .map_err(|e| format!("AES-GCM encrypt failed: {}", e))?;

    Ok(EncryptedPayload {
        v: 1,
        ephemeral_pubkey: format!("0x{}", hex::encode(ephem_pk.serialize())),
        nonce: format!("0x{}", hex::encode(nonce_bytes)),
        ciphertext: B64.encode(ct),
    })
}

pub fn decrypt_ecies(secret_bytes: &[u8; 32], payload: &EncryptedPayload) -> Result<Vec<u8>, String> {
    if payload.v != 1 {
        return Err(format!("unsupported ECIES version: {}", payload.v));
    }
    let clean_pub = payload.ephemeral_pubkey.trim().trim_start_matches("0x");
    let raw_ephem = hex::decode(clean_pub).map_err(|e| format!("invalid ephemeral pubkey: {}", e))?;
    let ephem_pub =
        PublicKey::from_slice(&raw_ephem).map_err(|e| format!("parse ephemeral pubkey: {}", e))?;

    let clean_nonce = payload.nonce.trim().trim_start_matches("0x");
    let raw_nonce = hex::decode(clean_nonce).map_err(|e| format!("invalid nonce hex: {}", e))?;
    if raw_nonce.len() != 12 {
        return Err("invalid AES-GCM nonce length".to_string());
    }
    let ct = B64
        .decode(&payload.ciphertext)
        .map_err(|e| format!("invalid base64 ciphertext: {}", e))?;

    let sk = SecretKey::from_slice(secret_bytes).map_err(|e| format!("invalid secret key: {}", e))?;
    let shared_point = secp256k1::ecdh::shared_secret_point(&ephem_pub, &sk);
    let aes_key = derive_ecies_aes_key(&shared_point[..32])?;

    let cipher = Aes256Gcm::new_from_slice(&aes_key).map_err(|e| e.to_string())?;
    let nonce = Nonce::from_slice(&raw_nonce);
    cipher
        .decrypt(nonce, ct.as_ref())
        .map_err(|e| format!("ECIES decrypt failed: {}", e))
}

fn local_dm_store_path(app_data_dir: &PathBuf, address: &str) -> PathBuf {
    let _ = fs::create_dir_all(app_data_dir);
    app_data_dir.join(format!("messaging_dm_{}.enc", address.to_lowercase()))
}

fn derive_local_dm_key(secret_bytes: &[u8; 32], address: &str) -> Result<[u8; 32], String> {
    let hk = Hkdf::<Sha256>::new(Some(address.as_bytes()), secret_bytes);
    let mut key = [0u8; 32];
    hk.expand(LOCAL_DM_INFO, &mut key)
        .map_err(|e| format!("local DM key derive failed: {}", e))?;
    Ok(key)
}

fn load_local_dms(app_data_dir: &PathBuf, address: &str, secret_bytes: &[u8; 32]) -> Vec<DecryptedDM> {
    let path = local_dm_store_path(app_data_dir, address);
    let raw = match fs::read(path) {
        Ok(b) if b.len() > 12 => b,
        _ => return Vec::new(),
    };
    let key = match derive_local_dm_key(secret_bytes, address) {
        Ok(k) => k,
        Err(_) => return Vec::new(),
    };
    let cipher = match Aes256Gcm::new_from_slice(&key) {
        Ok(c) => c,
        Err(_) => return Vec::new(),
    };
    let nonce = Nonce::from_slice(&raw[..12]);
    let plain = match cipher.decrypt(nonce, &raw[12..]) {
        Ok(p) => p,
        Err(_) => return Vec::new(),
    };
    serde_json::from_slice(&plain).unwrap_or_default()
}

fn save_local_dms(
    app_data_dir: &PathBuf,
    address: &str,
    secret_bytes: &[u8; 32],
    dms: &[DecryptedDM],
) -> Result<(), String> {
    let key = derive_local_dm_key(secret_bytes, address)?;
    let cipher = Aes256Gcm::new_from_slice(&key).map_err(|e| e.to_string())?;
    let mut nonce_bytes = [0u8; 12];
    rand::thread_rng().fill_bytes(&mut nonce_bytes);
    let plain = serde_json::to_vec(dms).map_err(|e| e.to_string())?;
    let ct = cipher
        .encrypt(Nonce::from_slice(&nonce_bytes), plain.as_ref())
        .map_err(|e| e.to_string())?;
    let mut out = Vec::with_capacity(12 + ct.len());
    out.extend_from_slice(&nonce_bytes);
    out.extend_from_slice(&ct);
    fs::write(local_dm_store_path(app_data_dir, address), out).map_err(|e| e.to_string())
}

async fn authenticate_nats(server_url: &str, address: &str, secret: &[u8; 32]) -> Result<async_nats::Client, String> {
    let guest = async_nats::ConnectOptions::with_token("challenge".to_string())
        .connect(server_url)
        .await
        .map_err(|e| format!("Failed to reach messaging server: {}", e))?;

    let req_bytes = serde_json::to_vec(&serde_json::json!({ "address": address }))
        .map_err(|e| e.to_string())?;
    let reply = tokio::time::timeout(
        Duration::from_secs(5),
        guest.request("rogue.auth.nonce", req_bytes.into()),
    )
    .await
    .map_err(|_| "Timeout requesting auth nonce".to_string())?
    .map_err(|e| format!("Nonce request failed: {}", e))?;

    let nr: NonceResponse =
        serde_json::from_slice(&reply.payload).map_err(|e| format!("Invalid nonce response: {}", e))?;
    if let Some(err) = nr.error {
        return Err(err);
    }
    let nonce = nr.nonce.ok_or_else(|| "Missing nonce".to_string())?;
    let msg = nr.message.ok_or_else(|| "Missing challenge message".to_string())?;
    let sig = sign_personal_message(secret, &msg)?;

    let cred = serde_json::json!({
        "address": address,
        "nonce": nonce,
        "signature": sig,
    })
    .to_string();

    async_nats::ConnectOptions::with_token(cred)
        .connect(server_url)
        .await
        .map_err(|e| format!("Authentication rejected: {}", e))
}

fn emit_status(app: &AppHandle, st: &MessagingState) {
    let _ = app.emit(
        "messaging://status",
        MessagingStatus {
            status: st.status.clone(),
            address: st.address.clone(),
            server_url: st.server_url.clone(),
            miner_level: st.miner_level,
            error: st.error.clone(),
        },
    );
}

#[tauri::command]
pub async fn messaging_disconnect(app: AppHandle) -> Result<(), String> {
    let mut guard = state().lock().await;
    if let Some(tx) = guard.shutdown_tx.take() {
        let _ = tx.send(true);
    }
    guard.client = None;
    guard.js = None;
    guard.status = "disconnected".to_string();
    guard.error = None;
    emit_status(&app, &guard);
    Ok(())
}

#[tauri::command]
pub async fn messaging_status() -> Result<MessagingStatus, String> {
    let guard = state().lock().await;
    Ok(MessagingStatus {
        status: guard.status.clone(),
        address: guard.address.clone(),
        server_url: guard.server_url.clone(),
        miner_level: guard.miner_level,
        error: guard.error.clone(),
    })
}

#[tauri::command]
pub async fn messaging_connect(app: AppHandle, server_url: String) -> Result<MessagingStatus, String> {
    messaging_disconnect(app.clone()).await?;

    let (addr, secret) = wallet::active_secret_bytes(0)?;
    let app_data_dir = app.path().app_data_dir().ok();

    {
        let mut guard = state().lock().await;
        guard.status = "connecting".to_string();
        guard.address = Some(addr.clone());
        guard.server_url = Some(server_url.clone());
        guard.error = None;
        guard.app_data_dir = app_data_dir;
        emit_status(&app, &guard);
    }

    let client = match authenticate_nats(&server_url, &addr, &secret).await {
        Ok(c) => c,
        Err(e) => {
            let mut guard = state().lock().await;
            guard.status = "auth_error".to_string();
            guard.error = Some(e.clone());
            emit_status(&app, &guard);
            return Err(e);
        }
    };

    let js = async_nats::jetstream::new(client.clone());

    // Fetch own profile to learn MinerLevel.
    let mut miner_level = Some(0u32);
    if let Ok(kv) = js.get_key_value("ROGUE_PROFILES").await {
        if let Ok(Some(raw)) = kv.get(&addr).await {
            if let Ok(prof) = serde_json::from_slice::<ProfileRecord>(&raw) {
                miner_level = Some(prof.miner_level);
            }
        }
    }

    let (shutdown_tx, mut shutdown_rx) = watch::channel(false);

    {
        let mut guard = state().lock().await;
        guard.client = Some(client.clone());
        guard.js = Some(js.clone());
        guard.miner_level = miner_level;
        guard.status = "connected".to_string();
        guard.error = None;
        guard.shutdown_tx = Some(shutdown_tx);
        emit_status(&app, &guard);
    }

    // Spawn live subscriptions (chat, gated, delete, dm, errors) & presence heartbeat.
    let app_bg = app.clone();
    let addr_bg = addr.clone();
    let server_bg = server_url.clone();
    tokio::spawn(async move {
        let mut chat_sub = client.subscribe("rogue.chat.*.msg").await.ok();
        let mut gated_sub = client.subscribe("rogue.gated.*.msg").await.ok();
        let mut del_sub = client.subscribe("rogue.chat.*.delete").await.ok();
        let mut dm_sub = client.subscribe(format!("rogue.dm.{}", addr_bg)).await.ok();
        let mut err_sub = client.subscribe(format!("rogue.err.{}", addr_bg)).await.ok();

        let mut hb_interval = tokio::time::interval(Duration::from_secs(15));
        let mut reauth_interval = tokio::time::interval(Duration::from_secs(12 * 60));
        reauth_interval.tick().await; // consume immediate tick

        loop {
            tokio::select! {
                _ = shutdown_rx.changed() => {
                    if *shutdown_rx.borrow() {
                        break;
                    }
                }
                _ = hb_interval.tick() => {
                    let active_room = { state().lock().await.active_room.clone() };
                    let rec = PresenceRecord {
                        address: addr_bg.clone(),
                        active_room,
                        level: miner_level.unwrap_or(0),
                        updated_at: now_millis(),
                    };
                    if let Ok(bytes) = serde_json::to_vec(&rec) {
                        if let Ok(kv) = js.get_key_value("ROGUE_PRESENCE").await {
                            let _ = kv.put(&addr_bg, bytes.into()).await;
                        }
                    }
                }
                _ = reauth_interval.tick() => {
                    // Transparently refresh session before 15m JWT expiry.
                    if let Ok((cur_addr, _)) = wallet::active_secret_bytes(0) {
                        if cur_addr == addr_bg {
                            let _ = app_bg.emit("messaging://session_refresh", &server_bg);
                        }
                    }
                }
                Some(msg) = async { match &mut chat_sub { Some(s) => s.next().await, None => None } } => {
                    if let Ok(env) = serde_json::from_slice::<ChatMessageEnvelope>(&msg.payload) {
                        let _ = app_bg.emit("messaging://chat", env);
                    }
                }
                Some(msg) = async { match &mut gated_sub { Some(s) => s.next().await, None => None } } => {
                    if let Ok(env) = serde_json::from_slice::<ChatMessageEnvelope>(&msg.payload) {
                        let _ = app_bg.emit("messaging://chat", env);
                    }
                }
                Some(msg) = async { match &mut del_sub { Some(s) => s.next().await, None => None } } => {
                    if let Ok(ev) = serde_json::from_slice::<DeleteMessageEvent>(&msg.payload) {
                        let _ = app_bg.emit("messaging://delete", ev);
                    }
                }
                Some(msg) = async { match &mut dm_sub { Some(s) => s.next().await, None => None } } => {
                    if let Ok(dm_env) = serde_json::from_slice::<DMEnvelope>(&msg.payload) {
                        if let Ok((_, sk)) = wallet::active_secret_bytes(0) {
                            if let Ok(plain) = decrypt_ecies(&sk, &dm_env.payload) {
                                if let Ok(text) = String::from_utf8(plain) {
                                    let dec = DecryptedDM {
                                        id: dm_env.id,
                                        sender: dm_env.sender,
                                        dest: dm_env.dest,
                                        text,
                                        ts: dm_env.ts,
                                    };
                                    let _ = app_bg.emit("messaging://dm", dec);
                                }
                            }
                        }
                    }
                }
                Some(msg) = async { match &mut err_sub { Some(s) => s.next().await, None => None } } => {
                    if let Ok(ev) = serde_json::from_slice::<ErrorEvent>(&msg.payload) {
                        let _ = app_bg.emit("messaging://error", ev);
                    }
                }
            }
        }
    });

    Ok(messaging_status().await?)
}

async fn get_active_client() -> Result<(async_nats::Client, async_nats::jetstream::Context, String), String> {
    let guard = state().lock().await;
    let client = guard.client.clone().ok_or_else(|| "Not connected to messaging server".to_string())?;
    let js = guard.js.clone().ok_or_else(|| "JetStream unavailable".to_string())?;
    let addr = guard.address.clone().ok_or_else(|| "No active messaging address".to_string())?;
    Ok((client, js, addr))
}

async fn rpc_ingress(subject_suffix: &str, body: serde_json::Value) -> Result<serde_json::Value, String> {
    let (client, _, addr) = get_active_client().await?;
    let subject = format!("rogue.in.{}.{}", addr, subject_suffix);
    let bytes = serde_json::to_vec(&body).map_err(|e| e.to_string())?;
    let reply = tokio::time::timeout(Duration::from_secs(6), client.request(subject, bytes.into()))
        .await
        .map_err(|_| "Request timed out".to_string())?
        .map_err(|e| e.to_string())?;
    let resp: CommandResponse = serde_json::from_slice(&reply.payload).map_err(|e| e.to_string())?;
    if !resp.ok {
        if let Some(err) = resp.error {
            return Err(format!("{}: {}", err.code, err.message));
        }
        return Err("Request rejected".to_string());
    }
    Ok(resp.data.unwrap_or(serde_json::Value::Null))
}

#[tauri::command]
pub async fn messaging_list_rooms() -> Result<Vec<RoomSummary>, String> {
    let data = rpc_ingress("cmd.rooms", serde_json::json!({})).await?;
    serde_json::from_value(data).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn messaging_set_active_room(room: String) -> Result<(), String> {
    let mut guard = state().lock().await;
    guard.active_room = room;
    Ok(())
}

#[tauri::command]
pub async fn messaging_send_message(room: String, text: String, reply_to: Option<String>) -> Result<ChatMessageEnvelope, String> {
    let data = rpc_ingress(
        &format!("chat.{}", room),
        serde_json::json!({
            "text": text,
            "reply_to": reply_to.unwrap_or_default(),
            "kind": "text",
        }),
    )
    .await?;
    serde_json::from_value(data).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn messaging_read_history(room: String, limit: Option<usize>, before_seq: Option<u64>) -> Result<Vec<ChatMessageEnvelope>, String> {
    let (_, js, _) = get_active_client().await?;
    let ch_kv = js.get_key_value("ROGUE_CHANNELS").await.map_err(|e| e.to_string())?;
    let raw_meta = ch_kv
        .get(&room)
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "Channel not found".to_string())?;
    let meta: ChannelMeta = serde_json::from_slice(&raw_meta).map_err(|e| e.to_string())?;

    let (stream_name, target_subj) = if meta.gated {
        ("ROGUE_GATED", format!("rogue.gated.{}.msg", room))
    } else {
        ("ROGUE_CHAT", format!("rogue.chat.{}.msg", room))
    };

    let stream = js.get_stream(stream_name).await.map_err(|e| e.to_string())?;
    let info = stream.cached_info();
    let max_items = limit.unwrap_or(200).max(1);
    if info.state.messages == 0 || info.state.last_sequence == 0 {
        return Ok(Vec::new());
    }

    let mut high = info.state.last_sequence;
    if let Some(bs) = before_seq {
        if bs <= 1 {
            return Ok(Vec::new());
        }
        if bs <= high {
            high = bs - 1;
        }
    }
    let low = info.state.first_sequence.max(1);
    let mut collected = Vec::new();
    let mut seq = high;
    while seq >= low && collected.len() < max_items {
        if let Ok(msg) = stream.get_raw_message(seq).await {
            if msg.subject.as_str() == target_subj {
                if let Ok(mut env) = serde_json::from_slice::<ChatMessageEnvelope>(&msg.payload) {
                    env.seq = seq;
                    collected.push(env);
                }
            }
        }
        if seq == 1 {
            break;
        }
        seq -= 1;
    }
    collected.reverse();
    Ok(collected)
}

#[tauri::command]
pub async fn messaging_create_room(name: String, topic: String) -> Result<ChannelMeta, String> {
    let data = rpc_ingress("cmd.create_room", serde_json::json!({ "name": name, "topic": topic })).await?;
    serde_json::from_value(data).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn messaging_delete_room(name: String) -> Result<(), String> {
    let _ = rpc_ingress("cmd.delete_room", serde_json::json!({ "name": name })).await?;
    Ok(())
}

#[tauri::command]
pub async fn messaging_update_topic(room: String, topic: String) -> Result<ChannelMeta, String> {
    let data = rpc_ingress("cmd.topic", serde_json::json!({ "name": room, "topic": topic })).await?;
    serde_json::from_value(data).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn messaging_delete_message(room: String, seq: u64) -> Result<(), String> {
    let _ = rpc_ingress("cmd.delete_msg", serde_json::json!({ "room": room, "seq": seq })).await?;
    Ok(())
}

#[tauri::command]
pub async fn messaging_send_dm(to: String, text: String) -> Result<DecryptedDM, String> {
    let (_, js, sender) = get_active_client().await?;
    let dest = to.trim().to_lowercase();
    let profiles = js.get_key_value("ROGUE_PROFILES").await.map_err(|e| e.to_string())?;
    let raw_prof = profiles
        .get(&dest)
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "ERR_RECIPIENT_PUBKEY_UNKNOWN: recipient has not connected yet".to_string())?;
    let prof: ProfileRecord = serde_json::from_slice(&raw_prof).map_err(|e| e.to_string())?;

    let enc = encrypt_ecies(&prof.pubkey, text.as_bytes())?;
    let data = rpc_ingress(&format!("dm.{}", dest), serde_json::to_value(&enc).map_err(|e| e.to_string())?).await?;

    let id = data.get("id").and_then(|v| v.as_str()).unwrap_or_default().to_string();
    let ts = data.get("ts").and_then(|v| v.as_i64()).unwrap_or_else(now_millis);
    let dec = DecryptedDM { id, sender: sender.clone(), dest, text, ts };

    if let (Some(dir), Ok((_, sk))) = (state().lock().await.app_data_dir.clone(), wallet::active_secret_bytes(0)) {
        let mut cached = load_local_dms(&dir, &sender, &sk);
        cached.push(dec.clone());
        let _ = save_local_dms(&dir, &sender, &sk, &cached);
    }
    Ok(dec)
}

#[tauri::command]
pub async fn messaging_list_dms() -> Result<Vec<DecryptedDM>, String> {
    let (_, js, self_addr) = get_active_client().await?;
    let (_, sk) = wallet::active_secret_bytes(0)?;
    let app_dir = state().lock().await.app_data_dir.clone();

    let mut by_id: BTreeMap<String, DecryptedDM> = BTreeMap::new();
    if let Some(ref dir) = app_dir {
        for dm in load_local_dms(dir, &self_addr, &sk) {
            by_id.insert(dm.id.clone(), dm);
        }
    }

    if let Ok(stream) = js.get_stream("ROGUE_DM").await {
        let info = stream.cached_info();
        let target_subj = format!("rogue.dm.{}", self_addr);
        if info.state.messages > 0 && info.state.last_sequence > 0 {
            let low = info.state.first_sequence.max(1);
            let mut seq = info.state.last_sequence;
            let mut count = 0usize;
            while seq >= low && count < 200 {
                if let Ok(msg) = stream.get_raw_message(seq).await {
                    if msg.subject.as_str() == target_subj {
                        if let Ok(env) = serde_json::from_slice::<DMEnvelope>(&msg.payload) {
                            if let Ok(plain) = decrypt_ecies(&sk, &env.payload) {
                                if let Ok(text) = String::from_utf8(plain) {
                                    by_id.insert(
                                        env.id.clone(),
                                        DecryptedDM {
                                            id: env.id,
                                            sender: env.sender,
                                            dest: env.dest,
                                            text,
                                            ts: env.ts,
                                        },
                                    );
                                    count += 1;
                                }
                            }
                        }
                    }
                }
                if seq == 1 {
                    break;
                }
                seq -= 1;
            }
        }
    }

    let mut all: Vec<DecryptedDM> = by_id.into_values().collect();
    all.sort_by_key(|m| m.ts);
    if let Some(ref dir) = app_dir {
        let _ = save_local_dms(dir, &self_addr, &sk, &all);
    }
    Ok(all)
}

#[tauri::command]
pub async fn messaging_list_online(room: Option<String>) -> Result<Vec<PresenceRecord>, String> {
    let (_, js, _) = get_active_client().await?;
    let kv = js.get_key_value("ROGUE_PRESENCE").await.map_err(|e| e.to_string())?;
    let mut keys = kv.keys().await.map_err(|e| e.to_string())?;
    let mut out = Vec::new();
    let mut seen: HashMap<String, PresenceRecord> = HashMap::new();
    while let Some(Ok(k)) = keys.next().await {
        if let Ok(Some(raw)) = kv.get(&k).await {
            if let Ok(rec) = serde_json::from_slice::<PresenceRecord>(&raw) {
                if room.as_ref().map(|r| r.is_empty() || r == &rec.active_room).unwrap_or(true) {
                    seen.insert(rec.address.clone(), rec);
                }
            }
        }
    }
    out.extend(seen.into_values());
    out.sort_by(|a, b| b.level.cmp(&a.level).then(a.address.cmp(&b.address)));
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_ecies_roundtrip_and_eip191_signature() {
        let secp = Secp256k1::new();
        let mut rng = rand::thread_rng();
        let (sk, pk) = secp.generate_keypair(&mut rng);
        let pub_hex = format!("0x{}", hex::encode(pk.serialize()));

        let plaintext = b"Rogue Signal Rust ECIES test";
        let enc = encrypt_ecies(&pub_hex, plaintext).expect("encrypt_ecies");
        let dec = decrypt_ecies(&sk.secret_bytes(), &enc).expect("decrypt_ecies");
        assert_eq!(dec, plaintext);

        let sig = sign_personal_message(&sk.secret_bytes(), "Rogue Signal Messaging Auth").expect("sign");
        assert!(sig.starts_with("0x"));
        assert_eq!(sig.len(), 132);
    }
}
