use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use tauri::{AppHandle, Emitter};

static NODE_PROCESS: Mutex<Option<Child>> = Mutex::new(None);
static STRATUM_PROCESS: Mutex<Option<Child>> = Mutex::new(None);

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct NodeConfig {
    pub datadir: Option<String>,
    pub http_port: u16,
    pub ws_port: u16,
    pub p2p_port: u16,
    pub bootnodes: Option<String>,
    pub mine: bool,
    pub miner_threads: u32,
    pub fast_mode: bool,
    pub coinbase: Option<String>,
}

impl Default for NodeConfig {
    fn default() -> Self {
        Self {
            datadir: Some("./nodes-local/node-desktop".to_string()),
            http_port: 38849,
            ws_port: 38850,
            p2p_port: 38890,
            bootnodes: Some("enode://3bfcd978ea35fc817c5573b03e7b76cb7367720d4ff7a1fdb7ddcb83ec2ad6cba997029305678d49e1dbfccc83a20ecea0d4920a483a8e4d86ebe212b06bcefc@127.0.0.1:38888".to_string()),
            mine: false,
            miner_threads: 2,
            fast_mode: false,
            coinbase: None,
        }
    }
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ProcessStatus {
    pub running: bool,
    pub pid: Option<u32>,
}

fn resolve_binary(bin_name: &str) -> Result<PathBuf, String> {
    let candidates = [
        // 1. From src-tauri during development (cwd is rogue-desktop-client/src-tauri)
        Path::new("../../rogue-core-chain/build/bin").join(bin_name),
        // 2. From rogue-desktop-client directory
        Path::new("../rogue-core-chain/build/bin").join(bin_name),
        // 3. From workspace root
        Path::new("rogue-core-chain/build/bin").join(bin_name),
        // 4. Legacy directory fallbacks
        Path::new("../../rogue-geth/build/bin").join(bin_name),
        Path::new("../rogue-geth/build/bin").join(bin_name),
    ];

    for candidate in &candidates {
        if candidate.exists() {
            if let Ok(canonical) = candidate.canonicalize() {
                return Ok(canonical);
            }
            return Ok(candidate.clone());
        }
    }

    // 5. Fallback to system PATH
    Ok(PathBuf::from(bin_name))
}

fn resolve_datadir(raw_path: &str) -> PathBuf {
    let p = Path::new(raw_path);
    if p.is_absolute() {
        return p.to_path_buf();
    }
    // 1. If cwd is src-tauri (tauri dev mode) -> workspace root is ../..
    if Path::new("../../rogue-core-chain").exists() {
        let target = Path::new("../..").join(p);
        if let Ok(abs) = target.canonicalize() {
            return abs;
        }
        return target;
    }
    // 2. If cwd is rogue-desktop-client -> workspace root is ..
    if Path::new("../rogue-core-chain").exists() {
        let target = Path::new("..").join(p);
        if let Ok(abs) = target.canonicalize() {
            return abs;
        }
        return target;
    }
    // 3. If cwd is workspace root
    if Path::new("rogue-core-chain").exists() {
        if let Ok(abs) = p.canonicalize() {
            return abs;
        }
        return p.to_path_buf();
    }
    p.to_path_buf()
}

#[tauri::command]
pub async fn start_node(app: AppHandle, config: NodeConfig) -> Result<String, String> {
    let mut proc_lock = NODE_PROCESS.lock().unwrap();
    if proc_lock.is_some() {
        return Err("Node is already running".to_string());
    }

    let geth_bin = resolve_binary("geth")?;
    let mut cmd = Command::new(&geth_bin);
    cmd.arg("--rogue");

    if let Some(ref raw_datadir) = config.datadir {
        let datadir = resolve_datadir(raw_datadir);
        let _ = std::fs::create_dir_all(&datadir);
        cmd.arg("--datadir").arg(&datadir);
    }

    cmd.arg("--syncmode").arg("full");

    cmd.arg("--http")
        .arg("--http.addr")
        .arg("0.0.0.0")
        .arg("--http.port")
        .arg(config.http_port.to_string())
        .arg("--http.api")
        .arg("eth,net,web3,miner,personal,txpool,admin")
        .arg("--http.corsdomain")
        .arg("*")
        .arg("--ws")
        .arg("--ws.addr")
        .arg("0.0.0.0")
        .arg("--ws.port")
        .arg(config.ws_port.to_string())
        .arg("--ws.api")
        .arg("eth,net,web3,miner,personal,admin")
        .arg("--ws.origins")
        .arg("*")
        .arg("--port")
        .arg(config.p2p_port.to_string())
        .arg("--authrpc.port")
        .arg("8553")
        .arg("--nat")
        .arg("extip:127.0.0.1")
        .arg("--metrics");

    if let Some(ref bootnodes) = config.bootnodes {
        let trimmed = bootnodes.trim();
        if !trimmed.is_empty() {
            cmd.arg("--bootnodes").arg(trimmed);
        }
    }

    if config.fast_mode {
        cmd.arg("--randomx.fast");
    }

    if config.mine {
        cmd.arg("--mine");
        cmd.arg("--miner.threads").arg(config.miner_threads.to_string());
        if let Some(ref coinbase) = config.coinbase {
            cmd.arg("--miner.etherbase").arg(coinbase);
        }
    }

    cmd.stdout(Stdio::piped()).stderr(Stdio::piped());

    let mut child = cmd.spawn().map_err(|e| format!("Failed to start geth node at {:?}: {}", geth_bin, e))?;
    let pid = child.id();

    // Stream logs in background (Geth primarily outputs to stderr)
    if let Some(stderr) = child.stderr.take() {
        let app_handle = app.clone();
        std::thread::spawn(move || {
            use std::io::{BufRead, BufReader};
            let reader = BufReader::new(stderr);
            for line in reader.lines().flatten() {
                let _ = app_handle.emit("node-log", line);
            }
        });
    }

    *proc_lock = Some(child);
    Ok(format!("Node started successfully (PID: {}) on ports P2P:{} HTTP:{}", pid, config.p2p_port, config.http_port))
}

#[tauri::command]
pub async fn stop_node() -> Result<String, String> {
    let mut proc_lock = NODE_PROCESS.lock().unwrap();
    if let Some(mut child) = proc_lock.take() {
        let _ = child.kill();
        let _ = child.wait();
        Ok("Node stopped".to_string())
    } else {
        Err("Node is not running".to_string())
    }
}

#[tauri::command]
pub async fn get_node_status() -> Result<ProcessStatus, String> {
    let mut proc_lock = NODE_PROCESS.lock().unwrap();
    if let Some(ref mut child) = *proc_lock {
        match child.try_wait() {
            Ok(Some(_status)) => {
                *proc_lock = None;
                Ok(ProcessStatus { running: false, pid: None })
            }
            Ok(None) => Ok(ProcessStatus {
                running: true,
                pid: Some(child.id()),
            }),
            Err(e) => Err(e.to_string()),
        }
    } else {
        Ok(ProcessStatus { running: false, pid: None })
    }
}

#[tauri::command]
pub async fn start_stratum(app: AppHandle, listen_port: u16, rpc_url: String) -> Result<String, String> {
    let mut proc_lock = STRATUM_PROCESS.lock().unwrap();
    if proc_lock.is_some() {
        return Err("Stratum is already running".to_string());
    }

    let stratum_bin = resolve_binary("rogue-stratum")?;
    let mut cmd = Command::new(&stratum_bin);
    cmd.arg("-stratum.port")
        .arg(listen_port.to_string())
        .arg("-node.rpc")
        .arg(rpc_url)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    let mut child = cmd.spawn().map_err(|e| format!("Failed to start rogue-stratum at {:?}: {}", stratum_bin, e))?;
    let pid = child.id();

    if let Some(stderr) = child.stderr.take() {
        let app_handle = app.clone();
        std::thread::spawn(move || {
            use std::io::{BufRead, BufReader};
            let reader = BufReader::new(stderr);
            for line in reader.lines().flatten() {
                let _ = app_handle.emit("stratum-log", line);
            }
        });
    }

    *proc_lock = Some(child);
    Ok(format!("Stratum bridge started (PID: {})", pid))
}

#[tauri::command]
pub async fn stop_stratum() -> Result<String, String> {
    let mut proc_lock = STRATUM_PROCESS.lock().unwrap();
    if let Some(mut child) = proc_lock.take() {
        let _ = child.kill();
        let _ = child.wait();
        Ok("Stratum bridge stopped".to_string())
    } else {
        Err("Stratum is not running".to_string())
    }
}

