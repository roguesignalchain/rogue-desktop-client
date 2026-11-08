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
    pub mine: bool,
    pub miner_threads: u32,
    pub fast_mode: bool,
    pub coinbase: Option<String>,
}

impl Default for NodeConfig {
    fn default() -> Self {
        Self {
            datadir: None,
            http_port: 38845,
            ws_port: 38846,
            p2p_port: 38888,
            mine: false,
            miner_threads: 1,
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
    // 1. Look in adjacent rogue-geth build directory
    let relative_path = Path::new("../rogue-geth/build/bin").join(bin_name);
    if relative_path.exists() {
        return Ok(relative_path);
    }

    // 2. Look in workspace root
    let workspace_path = Path::new("rogue-geth/build/bin").join(bin_name);
    if workspace_path.exists() {
        return Ok(workspace_path);
    }

    // 3. Fallback to PATH
    Ok(PathBuf::from(bin_name))
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

    if let Some(ref datadir) = config.datadir {
        cmd.arg("--datadir").arg(datadir);
    }

    cmd.arg("--http")
        .arg("--http.port")
        .arg(config.http_port.to_string())
        .arg("--http.api")
        .arg("eth,net,web3,miner,personal,txpool")
        .arg("--http.corsdomain")
        .arg("*")
        .arg("--ws")
        .arg("--ws.port")
        .arg(config.ws_port.to_string())
        .arg("--ws.api")
        .arg("eth,net,web3,miner,personal")
        .arg("--port")
        .arg(config.p2p_port.to_string());

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

    // Stream logs in background
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
    Ok(format!("Node started successfully (PID: {})", pid))
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
    cmd.arg("-listen")
        .arg(format!("0.0.0.0:{}", listen_port))
        .arg("-node")
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

