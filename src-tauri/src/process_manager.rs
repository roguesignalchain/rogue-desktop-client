use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use tauri::{AppHandle, Emitter};

static NODE_PROCESS: Mutex<Option<Child>> = Mutex::new(None);

const EMBEDDED_GENESIS: &str = include_str!("../../../genesis.json");

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
    pub cache: Option<u32>,
    pub syncmode: Option<String>,
    pub verbosity: Option<u32>,
}

impl Default for NodeConfig {
    fn default() -> Self {
        Self {
            datadir: Some("./nodes-local/node-desktop".to_string()),
            http_port: 38849,
            ws_port: 0,
            p2p_port: 38890,
            bootnodes: Some("enode://5d505bf99dd8281ad884688ca9f0079622a1df4229ba30e59b0aeb0fd64977d2629cfd906d6600b1ef3ff4eb50881fd6d5c449cca34d511b5c34803e344e2285@127.0.0.1:38888".to_string()),
            mine: false,
            miner_threads: 2,
            fast_mode: false,
            coinbase: None,
            cache: Some(256),
            syncmode: Some("full".to_string()),
            verbosity: Some(3),
        }
    }
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ProcessStatus {
    pub running: bool,
    pub pid: Option<u32>,
}

fn resolve_binary(bin_name: &str) -> Result<PathBuf, String> {
    // 1. Production Sidecar (next to current executable)
    if let Ok(exe_path) = std::env::current_exe() {
        if let Some(exe_dir) = exe_path.parent() {
            let sidecar_candidates = [
                exe_dir.join(bin_name),
                exe_dir.join(format!("{}-x86_64-unknown-linux-gnu", bin_name)),
                exe_dir.join(format!("{}.exe", bin_name)),
                exe_dir.join(format!("{}-x86_64-pc-windows-msvc.exe", bin_name)),
            ];
            for sc in &sidecar_candidates {
                if sc.exists() {
                    return Ok(sc.clone());
                }
            }
        }
    }

    let candidates = [
        // 2. From src-tauri during development (cwd is rogue-desktop-client/src-tauri)
        Path::new("../../rogue-core-chain/build/bin").join(bin_name),
        // 3. From rogue-desktop-client directory
        Path::new("../rogue-core-chain/build/bin").join(bin_name),
        // 4. From workspace root
        Path::new("rogue-core-chain/build/bin").join(bin_name),
        // 5. Legacy directory fallbacks
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

    // 6. Fallback to system PATH
    Ok(PathBuf::from(bin_name))
}

fn resolve_datadir(raw_path: Option<&str>) -> PathBuf {
    if let Some(raw) = raw_path {
        let p = Path::new(raw);
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
        return p.to_path_buf();
    }

    #[cfg(debug_assertions)]
    {
        resolve_datadir(Some("./nodes-local/node-desktop"))
    }
    #[cfg(not(debug_assertions))]
    {
        if let Some(data_home) = std::env::var_os("XDG_DATA_HOME") {
            PathBuf::from(data_home).join("rogue-signal").join("chaindata")
        } else if let Some(home) = std::env::var_os("HOME") {
            PathBuf::from(home).join(".local").join("share").join("rogue-signal").join("chaindata")
        } else if let Some(appdata) = std::env::var_os("APPDATA") {
            PathBuf::from(appdata).join("rogue-signal").join("chaindata")
        } else {
            resolve_datadir(Some("./nodes-local/node-desktop"))
        }
    }
}

fn ensure_genesis_init(geth_bin: &Path, datadir: &Path) -> Result<(), String> {
    let chaindata = datadir.join("geth").join("chaindata");
    if chaindata.exists() && chaindata.read_dir().map(|mut d| d.next().is_some()).unwrap_or(false) {
        return Ok(());
    }

    let _ = std::fs::create_dir_all(datadir);
    let genesis_file = datadir.join("genesis.json");
    std::fs::write(&genesis_file, EMBEDDED_GENESIS)
        .map_err(|e| format!("Failed to write embedded genesis.json: {}", e))?;

    let mut cmd = Command::new(geth_bin);
    cmd.arg("--rogue")
        .arg("--datadir")
        .arg(datadir)
        .arg("init")
        .arg(&genesis_file)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    let output = cmd.output().map_err(|e| format!("Failed to execute geth init: {}", e))?;
    if !output.status.success() {
        let err_msg = String::from_utf8_lossy(&output.stderr);
        return Err(format!("geth init failed: {}", err_msg));
    }

    Ok(())
}

fn is_rpc_active(port: u16) -> bool {
    use std::net::{SocketAddr, TcpStream};
    let addr = SocketAddr::from(([127, 0, 0, 1], port));
    TcpStream::connect_timeout(&addr, std::time::Duration::from_millis(300)).is_ok()
}

#[tauri::command]
pub async fn start_node(app: AppHandle, config: NodeConfig) -> Result<String, String> {
    let mut proc_lock = NODE_PROCESS.lock().unwrap();
    if proc_lock.is_some() {
        return Ok("Node is already managed and running".to_string());
    }

    if is_rpc_active(config.http_port) {
        return Ok(format!(
            "Node is already responding on RPC port {}. Reusing active instance.",
            config.http_port
        ));
    }

    let geth_bin = resolve_binary("core-rogue")
        .or_else(|_| resolve_binary("geth"))?;
    let datadir = resolve_datadir(config.datadir.as_deref());

    // Ensure genesis block is initialized if chaindata does not exist
    ensure_genesis_init(&geth_bin, &datadir)?;

    let mut cmd = Command::new(&geth_bin);
    cmd.arg("--rogue");
    cmd.arg("--datadir").arg(&datadir);

    // Enforce full sync mode for Rogue Signal RandomX PoW to avoid snap-sync state corruption
    let sync_mode = match config.syncmode.as_deref() {
        Some("snap") => "full",
        Some(m) => m,
        None => "full",
    };
    cmd.arg("--syncmode").arg(sync_mode);

    let cache_size = config.cache.unwrap_or(256);
    cmd.arg("--cache").arg(cache_size.to_string());

    let verbosity_level = config.verbosity.unwrap_or(3);
    cmd.arg("--verbosity").arg(verbosity_level.to_string());

    cmd.arg("--http")
        .arg("--http.addr")
        .arg("127.0.0.1")
        .arg("--http.port")
        .arg(config.http_port.to_string())
        .arg("--http.api")
        .arg("eth,net,web3,miner,txpool,admin,randomx,rogue")
        .arg("--http.corsdomain")
        .arg("tauri://localhost,http://tauri.localhost,http://localhost:1420,http://127.0.0.1:1420");

    if config.ws_port > 0 && config.ws_port != config.http_port {
        cmd.arg("--ws")
            .arg("--ws.addr")
            .arg("127.0.0.1")
            .arg("--ws.port")
            .arg(config.ws_port.to_string())
            .arg("--ws.api")
            .arg("eth,net,web3,miner,admin,randomx,rogue")
            .arg("--ws.origins")
            .arg("tauri://localhost,http://tauri.localhost,http://localhost:1420,http://127.0.0.1:1420");
    }

    cmd.arg("--port")
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

    cmd.stdout(Stdio::null()).stderr(Stdio::piped());

    let mut child = cmd
        .spawn()
        .map_err(|e| format!("Failed to start geth node at {:?}: {}", geth_bin, e))?;
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
    Ok(format!(
        "Node started successfully (PID: {}) on ports P2P:{} HTTP:{}",
        pid, config.p2p_port, config.http_port
    ))
}

#[tauri::command]
pub async fn stop_node() -> Result<String, String> {
    let mut proc_lock = NODE_PROCESS.lock().unwrap();
    if let Some(mut child) = proc_lock.take() {
        let pid = child.id();

        #[cfg(unix)]
        {
            unsafe {
                libc::kill(pid as i32, libc::SIGTERM);
            }
        }
        #[cfg(not(unix))]
        {
            let _ = child.kill();
        }

        let start = std::time::Instant::now();
        loop {
            match child.try_wait() {
                Ok(Some(status)) => {
                    return Ok(format!("Node stopped cleanly with status: {:?}", status));
                }
                Ok(None) => {
                    if start.elapsed() >= std::time::Duration::from_secs(10) {
                        let _ = child.kill();
                        let _ = child.wait();
                        return Ok("Node forcefully killed after graceful shutdown timeout (10s)".to_string());
                    }
                    std::thread::sleep(std::time::Duration::from_millis(100));
                }
                Err(e) => {
                    let _ = child.kill();
                    return Err(format!("Error while waiting for node shutdown: {}", e));
                }
            }
        }
    } else {
        Ok("Node is not running".to_string())
    }
}

#[tauri::command]
pub async fn exit_app(app: AppHandle) -> Result<(), String> {
    let _ = stop_node().await;
    app.exit(0);
    Ok(())
}

#[tauri::command]
pub async fn clean_chaindata(datadir: Option<String>) -> Result<String, String> {
    let _ = stop_node().await;

    let resolved = resolve_datadir(datadir.as_deref());
    let geth_dir = resolved.join("geth");
    if geth_dir.exists() {
        std::fs::remove_dir_all(&geth_dir)
            .map_err(|e| format!("Failed to delete geth directory at {:?}: {}", geth_dir, e))?;
    }

    let geth_bin = resolve_binary("core-rogue")
        .or_else(|_| resolve_binary("geth"))?;
    ensure_genesis_init(&geth_bin, &resolved)?;

    Ok(format!(
        "Chaindata reset and genesis reinitialized successfully at {:?}",
        resolved
    ))
}

#[tauri::command]
pub async fn get_node_status() -> Result<ProcessStatus, String> {
    let mut proc_lock = NODE_PROCESS.lock().unwrap();
    if let Some(ref mut child) = *proc_lock {
        match child.try_wait() {
            Ok(Some(_status)) => {
                *proc_lock = None;
                Ok(ProcessStatus {
                    running: false,
                    pid: None,
                })
            }
            Ok(None) => Ok(ProcessStatus {
                running: true,
                pid: Some(child.id()),
            }),
            Err(e) => Err(e.to_string()),
        }
    } else {
        Ok(ProcessStatus {
            running: false,
            pid: None,
        })
    }
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SystemSpecs {
    pub cpu_model: String,
    pub cpu_cores: u32,
    pub total_ram_mb: u64,
    pub available_ram_mb: u64,
    pub recommended_threads: u32,
    pub can_run_fast_mode: bool,
    pub recommended_cache_mb: u32,
}

#[tauri::command]
pub async fn get_system_specs() -> Result<SystemSpecs, String> {
    let cpu_cores = std::thread::available_parallelism()
        .map(|n| n.get() as u32)
        .unwrap_or(4)
        .max(1);

    let mut cpu_model = "Standard Desktop CPU".to_string();
    let mut total_ram_mb: u64 = 8192;
    let mut available_ram_mb: u64 = 4096;

    #[cfg(target_os = "linux")]
    {
        if let Ok(cpuinfo) = std::fs::read_to_string("/proc/cpuinfo") {
            for line in cpuinfo.lines() {
                if line.starts_with("model name") || line.starts_with("Hardware") || line.starts_with("Model") {
                    if let Some((_, val)) = line.split_once(':') {
                        let trimmed = val.trim();
                        if !trimmed.is_empty() {
                            cpu_model = trimmed.to_string();
                            break;
                        }
                    }
                }
            }
        }

        if let Ok(meminfo) = std::fs::read_to_string("/proc/meminfo") {
            let mut total_kb: u64 = 0;
            let mut avail_kb: u64 = 0;
            let mut free_kb: u64 = 0;
            for line in meminfo.lines() {
                let parts: Vec<&str> = line.split_whitespace().collect();
                if parts.len() >= 2 {
                    match parts[0] {
                        "MemTotal:" => total_kb = parts[1].parse().unwrap_or(0),
                        "MemAvailable:" => avail_kb = parts[1].parse().unwrap_or(0),
                        "MemFree:" => free_kb = parts[1].parse().unwrap_or(0),
                        _ => {}
                    }
                }
            }
            if total_kb > 0 {
                total_ram_mb = total_kb / 1024;
            }
            if avail_kb > 0 {
                available_ram_mb = avail_kb / 1024;
            } else if free_kb > 0 {
                available_ram_mb = free_kb / 1024;
            }
        }
    }

    let recommended_threads = (cpu_cores / 2).max(1);
    let can_run_fast_mode = available_ram_mb >= 3072;
    let recommended_cache_mb = if total_ram_mb >= 16384 {
        1024
    } else if total_ram_mb >= 8192 {
        512
    } else {
        256
    };

    Ok(SystemSpecs {
        cpu_model,
        cpu_cores,
        total_ram_mb,
        available_ram_mb,
        recommended_threads,
        can_run_fast_mode,
        recommended_cache_mb,
    })
}
