use serde::{Deserialize, Serialize};
use std::io::{Read, Write};
use std::net::{SocketAddr, TcpStream};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use tauri::{AppHandle, Emitter};

struct ManagedNode {
    child: Child,
    http_port: u16,
    pid_file: PathBuf,
}

static NODE_PROCESS: Mutex<Option<ManagedNode>> = Mutex::new(None);
static STARTING_NODE: AtomicBool = AtomicBool::new(false);

struct StartGuard;

impl Drop for StartGuard {
    fn drop(&mut self) {
        STARTING_NODE.store(false, Ordering::SeqCst);
    }
}

fn lock_node_process() -> std::sync::MutexGuard<'static, Option<ManagedNode>> {
    NODE_PROCESS.lock().unwrap_or_else(|e| e.into_inner())
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct NodeConfig {
    pub datadir: Option<String>,
    pub http_port: u16,
    pub ws_port: u16,
    pub p2p_port: u16,
    #[serde(default)]
    pub authrpc_port: Option<u16>,
    #[serde(default)]
    pub nat: Option<String>,
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
            datadir: None,
            http_port: 38845,
            ws_port: 0,
            p2p_port: 38888,
            authrpc_port: None,
            nat: None,
            bootnodes: None,
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
    if let Some(raw) = raw_path.map(str::trim).filter(|s| !s.is_empty()) {
        let p = Path::new(raw);
        if p.is_absolute() {
            return p.to_path_buf();
        }
        // Resolve relative custom paths against workspace or cwd
        if Path::new("../../rogue-core-chain").exists() {
            let target = Path::new("../..").join(p);
            if let Ok(abs) = target.canonicalize() {
                return abs;
            }
            return target;
        }
        if Path::new("../rogue-core-chain").exists() {
            let target = Path::new("..").join(p);
            if let Ok(abs) = target.canonicalize() {
                return abs;
            }
            return target;
        }
        if Path::new("rogue-core-chain").exists() {
            if let Ok(abs) = p.canonicalize() {
                return abs;
            }
            return p.to_path_buf();
        }
        return p.to_path_buf();
    }

    #[cfg(target_os = "windows")]
    {
        if let Some(appdata) = std::env::var_os("APPDATA") {
            return PathBuf::from(appdata).join("rogue-signal").join("chaindata");
        }
        if let Some(profile) = std::env::var_os("USERPROFILE") {
            return PathBuf::from(profile).join("rogue-signal").join("chaindata");
        }
    }

    #[cfg(not(target_os = "windows"))]
    {
        if let Some(data_home) = std::env::var_os("XDG_DATA_HOME") {
            return PathBuf::from(data_home).join("rogue-signal").join("chaindata");
        }
        if let Some(home) = std::env::var_os("HOME") {
            return PathBuf::from(home)
                .join(".local")
                .join("share")
                .join("rogue-signal")
                .join("chaindata");
        }
    }

    PathBuf::from("rogue-signal-chaindata")
}

pub fn default_logs_dir() -> PathBuf {
    resolve_datadir(None).join("logs")
}

fn ensure_genesis_init(geth_bin: &Path, datadir: &Path) -> Result<(), String> {
    let chaindata = datadir.join("geth").join("chaindata");
    if chaindata.exists() && chaindata.read_dir().map(|mut d| d.next().is_some()).unwrap_or(false) {
        return Ok(());
    }

    let _ = std::fs::create_dir_all(datadir);

    let mut cmd = Command::new(geth_bin);
    cmd.arg("--rogue")
        .arg("--datadir")
        .arg(datadir)
        .arg("init")
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    let output = cmd.output().map_err(|e| format!("Failed to execute geth init: {}", e))?;
    if !output.status.success() {
        let err_msg = String::from_utf8_lossy(&output.stderr);
        return Err(format!("geth init failed: {}", err_msg));
    }

    Ok(())
}

fn resolve_auth_port(config: &NodeConfig) -> u16 {
    config.authrpc_port.unwrap_or_else(|| {
        if config.http_port == 38845 {
            38851
        } else {
            config.http_port.saturating_add(6).max(1024)
        }
    })
}

fn is_rpc_active(port: u16) -> bool {
    let addr = SocketAddr::from(([127, 0, 0, 1], port));
    TcpStream::connect_timeout(&addr, std::time::Duration::from_millis(300)).is_ok()
}

fn is_tcp_port_available(ip: [u8; 4], port: u16) -> bool {
    std::net::TcpListener::bind(SocketAddr::from((ip, port))).is_ok()
}

fn is_udp_port_available(ip: [u8; 4], port: u16) -> bool {
    std::net::UdpSocket::bind(SocketAddr::from((ip, port))).is_ok()
}

fn find_busy_port(config: &NodeConfig) -> Option<String> {
    if !is_tcp_port_available([127, 0, 0, 1], config.http_port) {
        let hint = if is_rpc_active(config.http_port) {
            "active RPC service"
        } else {
            "socket in use or TIME_WAIT"
        };
        return Some(format!("HTTP RPC port {} (127.0.0.1 TCP: {})", config.http_port, hint));
    }
    if !is_tcp_port_available([0, 0, 0, 0], config.p2p_port)
        || !is_udp_port_available([0, 0, 0, 0], config.p2p_port)
    {
        return Some(format!("P2P port {} (TCP/UDP)", config.p2p_port));
    }
    let auth_port = resolve_auth_port(config);
    if !is_tcp_port_available([127, 0, 0, 1], auth_port) {
        return Some(format!("AuthRPC port {} (127.0.0.1 TCP)", auth_port));
    }
    if config.ws_port > 0 && !is_tcp_port_available([127, 0, 0, 1], config.ws_port) {
        return Some(format!("WebSocket port {} (127.0.0.1 TCP)", config.ws_port));
    }
    None
}

fn wait_for_ports_available(config: &NodeConfig, timeout: std::time::Duration) -> Result<(), String> {
    let deadline = std::time::Instant::now() + timeout;
    loop {
        match find_busy_port(config) {
            None => return Ok(()),
            Some(busy_desc) => {
                if std::time::Instant::now() >= deadline {
                    return Err(format!(
                        "{} is already in use by another process or pending socket close",
                        busy_desc
                    ));
                }
                std::thread::sleep(std::time::Duration::from_millis(250));
            }
        }
    }
}

fn pid_file_path(datadir: &Path) -> PathBuf {
    datadir.join("core-rogue.pid")
}

fn write_pid_file(path: &Path, pid: u32) {
    let _ = std::fs::write(path, pid.to_string());
}

fn remove_pid_file(path: &Path) {
    let _ = std::fs::remove_file(path);
}

fn read_pid_file(path: &Path) -> Option<u32> {
    std::fs::read_to_string(path)
        .ok()
        .and_then(|s| s.trim().parse::<u32>().ok())
        .filter(|&pid| pid > 0)
}

fn remove_stale_ipc(datadir: &Path) {
    let ipc_path = datadir.join("geth.ipc");
    if ipc_path.exists() {
        let _ = std::fs::remove_file(&ipc_path);
    }
}

fn is_rogue_binary_name(exe: &str) -> bool {
    let trimmed = exe.trim().trim_matches('"');
    let basename = trimmed
        .rsplit(['/', '\\'])
        .next()
        .unwrap_or(trimmed)
        .to_ascii_lowercase();
    basename == "core-rogue"
        || basename == "core-rogue.exe"
        || basename.starts_with("core-rogue-")
        || basename == "geth"
        || basename == "geth.exe"
}

fn cmdline_matches_datadir(args: &[String], datadir: &Path) -> bool {
    let target = datadir.canonicalize().unwrap_or_else(|_| datadir.to_path_buf());
    let mut iter = args.iter();
    while let Some(arg) = iter.next() {
        let candidate = if let Some(val) = arg.strip_prefix("--datadir=") {
            Some(val)
        } else if arg == "--datadir" {
            iter.next().map(String::as_str)
        } else {
            None
        };
        if let Some(raw) = candidate {
            let p = Path::new(raw);
            let resolved = p.canonicalize().unwrap_or_else(|_| p.to_path_buf());
            if resolved == target {
                return true;
            }
        }
    }
    false
}

#[cfg(target_os = "linux")]
fn read_proc_cmdline(pid: u32) -> Option<Vec<String>> {
    let raw = std::fs::read(format!("/proc/{}/cmdline", pid)).ok()?;
    if raw.is_empty() {
        return None;
    }
    let args: Vec<String> = raw
        .split(|&b| b == 0)
        .filter(|s| !s.is_empty())
        .map(|s| String::from_utf8_lossy(s).to_string())
        .collect();
    if args.is_empty() {
        None
    } else {
        Some(args)
    }
}

fn is_rogue_node_process(pid: u32) -> bool {
    if pid == 0 || pid == std::process::id() {
        return false;
    }

    #[cfg(target_os = "linux")]
    {
        if let Some(args) = read_proc_cmdline(pid) {
            return is_rogue_binary_name(&args[0]);
        }
        if let Ok(comm) = std::fs::read_to_string(format!("/proc/{}/comm", pid)) {
            return is_rogue_binary_name(&comm);
        }
        return false;
    }

    #[cfg(target_os = "macos")]
    {
        if let Ok(out) = Command::new("ps")
            .args(["-p", &pid.to_string(), "-o", "comm="])
            .output()
        {
            let comm = String::from_utf8_lossy(&out.stdout);
            return is_rogue_binary_name(&comm);
        }
        return false;
    }

    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        if let Ok(out) = Command::new("tasklist")
            .args(["/FI", &format!("PID eq {}", pid), "/FO", "CSV", "/NH"])
            .creation_flags(CREATE_NO_WINDOW)
            .output()
        {
            let line = String::from_utf8_lossy(&out.stdout);
            if let Some(first_col) = line.split(',').next() {
                return is_rogue_binary_name(first_col);
            }
        }
        return false;
    }

    #[cfg(not(any(target_os = "linux", target_os = "macos", target_os = "windows")))]
    {
        let _ = pid;
        false
    }
}

fn terminate_pid_gracefully(pid: u32) {
    #[cfg(unix)]
    {
        let alive = unsafe { libc::kill(pid as i32, 0) == 0 };
        if !alive {
            return;
        }
        unsafe {
            libc::kill(pid as i32, libc::SIGTERM);
        }
        for _ in 0..50 {
            std::thread::sleep(std::time::Duration::from_millis(100));
            if unsafe { libc::kill(pid as i32, 0) != 0 } {
                return;
            }
        }
        if unsafe { libc::kill(pid as i32, 0) == 0 } {
            unsafe {
                libc::kill(pid as i32, libc::SIGKILL);
            }
            for _ in 0..10 {
                std::thread::sleep(std::time::Duration::from_millis(100));
                if unsafe { libc::kill(pid as i32, 0) != 0 } {
                    break;
                }
            }
        }
    }
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        let _ = Command::new("taskkill")
            .args(["/PID", &pid.to_string(), "/T", "/F"])
            .creation_flags(CREATE_NO_WINDOW)
            .output();
    }
}

fn cleanup_orphan_nodes_by_datadir(datadir: &Path) {
    #[cfg(target_os = "linux")]
    {
        let self_pid = std::process::id();
        let Ok(entries) = std::fs::read_dir("/proc") else {
            return;
        };
        for entry in entries.flatten() {
            let Some(pid) = entry
                .file_name()
                .to_str()
                .and_then(|s| s.parse::<u32>().ok())
            else {
                continue;
            };
            if pid == 0 || pid == self_pid {
                continue;
            }
            if let Some(args) = read_proc_cmdline(pid) {
                if is_rogue_binary_name(&args[0]) && cmdline_matches_datadir(&args, datadir) {
                    terminate_pid_gracefully(pid);
                }
            }
        }
    }
    #[cfg(not(target_os = "linux"))]
    {
        let _ = datadir;
    }
}

fn cleanup_stale_pid(pid_file: &Path, datadir: &Path) {
    if let Some(old_pid) = read_pid_file(pid_file) {
        if is_rogue_node_process(old_pid) {
            terminate_pid_gracefully(old_pid);
        }
        remove_pid_file(pid_file);
    }
    cleanup_orphan_nodes_by_datadir(datadir);
    remove_stale_ipc(datadir);
}

fn send_json_rpc_sync(http_port: u16, method: &str) -> Option<String> {
    if http_port == 0 {
        return None;
    }
    let addr = SocketAddr::from(([127, 0, 0, 1], http_port));
    let mut stream = TcpStream::connect_timeout(&addr, std::time::Duration::from_millis(400)).ok()?;
    let _ = stream.set_read_timeout(Some(std::time::Duration::from_millis(500)));
    let _ = stream.set_write_timeout(Some(std::time::Duration::from_millis(500)));
    let body = format!(r#"{{"jsonrpc":"2.0","id":1,"method":"{}","params":[]}}"#, method);
    let req = format!(
        "POST / HTTP/1.1\r\nHost: 127.0.0.1:{}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
        http_port,
        body.len(),
        body
    );
    stream.write_all(req.as_bytes()).ok()?;
    let mut buf = [0u8; 512];
    let n = stream.read(&mut buf).ok()?;
    Some(String::from_utf8_lossy(&buf[..n]).to_string())
}

fn send_miner_stop_sync(http_port: u16) {
    let is_mining = send_json_rpc_sync(http_port, "eth_mining")
        .map(|resp| resp.contains("true"))
        .unwrap_or(false);
    if !is_mining {
        return;
    }

    let _ = send_json_rpc_sync(http_port, "miner_stop");

    // Give RandomX miner threads a brief window to wind down before SIGTERM
    for _ in 0..15 {
        std::thread::sleep(std::time::Duration::from_millis(100));
        match send_json_rpc_sync(http_port, "eth_mining") {
            Some(resp) if resp.contains("false") => break,
            None => break,
            _ => {}
        }
    }
}

fn validate_node_config(config: &NodeConfig) -> Result<(), String> {
    if config.http_port == 0 || config.p2p_port == 0 {
        return Err("HTTP and P2P ports must be non-zero".to_string());
    }
    if let Some(auth_port) = config.authrpc_port {
        if auth_port == 0 {
            return Err("AuthRPC port must be non-zero".to_string());
        }
    }
    let auth_port = resolve_auth_port(config);
    if config.http_port == config.p2p_port
        || config.http_port == auth_port
        || config.p2p_port == auth_port
        || (config.ws_port > 0
            && (config.ws_port == config.http_port
                || config.ws_port == config.p2p_port
                || config.ws_port == auth_port))
    {
        return Err("Configured node ports (HTTP, WS, P2P, AuthRPC) must not collide".to_string());
    }
    if let Some(ref nat) = config.nat {
        let trimmed = nat.trim();
        if !trimmed.is_empty() {
            let valid = matches!(trimmed, "any" | "none" | "upnp" | "pmp")
                || (trimmed.starts_with("extip:") && trimmed.len() > 6 && !trimmed.chars().any(|c| c.is_whitespace()));
            if !valid {
                return Err(format!("Invalid NAT configuration: {}", trimmed));
            }
        }
    }
    if let Some(ref coinbase) = config.coinbase {
        let trimmed = coinbase.trim();
        if !trimmed.is_empty() {
            let hex_part = trimmed.strip_prefix("0x").or_else(|| trimmed.strip_prefix("0X"))
                .ok_or_else(|| "Invalid coinbase address: must start with 0x".to_string())?;
            if hex_part.len() != 40 || !hex_part.chars().all(|c| c.is_ascii_hexdigit()) {
                return Err("Invalid coinbase address: must be 20-byte hex".to_string());
            }
        }
    }
    if let Some(ref bootnodes) = config.bootnodes {
        for entry in bootnodes.split(',').map(|s| s.trim()).filter(|s| !s.is_empty()) {
            if !entry.starts_with("enode://") || !entry.contains('@') || entry.chars().any(|c| c.is_whitespace()) {
                return Err(format!("Invalid bootnode enode URI: {}", entry));
            }
        }
    }
    Ok(())
}

#[tauri::command]
pub async fn start_node(app: AppHandle, config: NodeConfig) -> Result<String, String> {
    tokio::task::spawn_blocking(move || start_node_sync(app, config))
        .await
        .map_err(|e| format!("Failed to join node start task: {}", e))?
}

fn start_node_sync(app: AppHandle, config: NodeConfig) -> Result<String, String> {
    if STARTING_NODE
        .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
        .is_err()
    {
        return Ok("Node startup is already in progress".to_string());
    }
    let _start_guard = StartGuard;

    validate_node_config(&config)?;
    {
        let mut proc_lock = lock_node_process();
        if let Some(ref mut managed) = *proc_lock {
            match managed.child.try_wait() {
                Ok(None) => return Ok("Node is already managed and running".to_string()),
                _ => {
                    remove_pid_file(&managed.pid_file);
                    *proc_lock = None;
                }
            }
        }
    }

    let geth_bin = resolve_binary("core-rogue")
        .or_else(|_| resolve_binary("geth"))?;
    let datadir = resolve_datadir(config.datadir.as_deref());
    let pid_file = pid_file_path(&datadir);

    // Clean up any orphaned core-rogue process or stale IPC socket left behind by a prior crash
    cleanup_stale_pid(&pid_file, &datadir);

    // Ensure all required node ports (HTTP, P2P, AuthRPC, WS) can actually bind,
    // allowing a brief window for transient TIME_WAIT sockets after a recent restart.
    wait_for_ports_available(&config, std::time::Duration::from_secs(3))?;

    // Ensure genesis block is initialized if chaindata does not exist
    ensure_genesis_init(&geth_bin, &datadir)?;

    let mut cmd = Command::new(&geth_bin);
    cmd.arg("--rogue");
    cmd.arg("--datadir").arg(&datadir);

    // Enforce full sync mode for Rogue Signal RandomX PoW to avoid snap-sync state corruption
    let sync_mode = "full";
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
        .arg("eth,net,web3,miner,txpool,admin,randomx")
        .arg("--http.corsdomain")
        .arg("tauri://localhost,http://tauri.localhost,https://tauri.localhost");

    if config.ws_port > 0 && config.ws_port != config.http_port {
        cmd.arg("--ws")
            .arg("--ws.addr")
            .arg("127.0.0.1")
            .arg("--ws.port")
            .arg(config.ws_port.to_string())
            .arg("--ws.api")
            .arg("eth,net,web3,miner,admin,randomx")
            .arg("--ws.origins")
            .arg("tauri://localhost,http://tauri.localhost,https://tauri.localhost");
    }

    let auth_port = resolve_auth_port(&config);
    let nat_flag = config
        .nat
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .unwrap_or("any");

    cmd.arg("--port")
        .arg(config.p2p_port.to_string())
        .arg("--authrpc.port")
        .arg(auth_port.to_string())
        .arg("--nat")
        .arg(nat_flag)
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

    #[cfg(target_os = "linux")]
    {
        use std::os::unix::process::CommandExt;
        unsafe {
            cmd.pre_exec(|| {
                libc::prctl(libc::PR_SET_PDEATHSIG, libc::SIGTERM);
                Ok(())
            });
        }
    }

    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }

    crate::log_store::set_active_logs_dir(datadir.join("logs"));

    // Spawn inside a dedicated OS thread that stays alive for the child's lifetime.
    // On Linux, PR_SET_PDEATHSIG triggers when the spawning *thread* exits, so spawning
    // directly on Tokio's spawn_blocking pool would send SIGTERM after Tokio's 10s idle timeout.
    let (spawn_tx, spawn_rx) = std::sync::mpsc::sync_channel::<Result<Child, String>>(1);
    let (keep_alive_tx, keep_alive_rx) = std::sync::mpsc::sync_channel::<()>(0);
    std::thread::spawn(move || {
        let res = cmd
            .spawn()
            .map_err(|e| format!("Failed to start geth node at {:?}: {}", geth_bin, e));
        let ok = res.is_ok();
        let _ = spawn_tx.send(res);
        if ok {
            let _ = keep_alive_rx.recv();
        }
    });

    let mut child = spawn_rx
        .recv()
        .map_err(|e| format!("Failed to receive node spawn result: {}", e))??;
    let pid = child.id();
    write_pid_file(&pid_file, pid);

    // Stream logs in background (batched over IPC every ~120ms to avoid flooding the WebView)
    let (log_tx, log_rx) = std::sync::mpsc::channel::<String>();
    {
        let app_handle = app.clone();
        std::thread::spawn(move || {
            let _keep_spawner_alive = keep_alive_tx;
            let mut batch: Vec<String> = Vec::with_capacity(64);
            let mut last_flush = std::time::Instant::now();
            loop {
                match log_rx.recv_timeout(std::time::Duration::from_millis(120)) {
                    Ok(line) => {
                        batch.push(line);
                        if batch.len() >= 50 || last_flush.elapsed() >= std::time::Duration::from_millis(120) {
                            let _ = app_handle.emit("node-log-batch", &batch);
                            batch.clear();
                            last_flush = std::time::Instant::now();
                        }
                    }
                    Err(std::sync::mpsc::RecvTimeoutError::Timeout) => {
                        if !batch.is_empty() {
                            let _ = app_handle.emit("node-log-batch", &batch);
                            batch.clear();
                            last_flush = std::time::Instant::now();
                        }
                    }
                    Err(std::sync::mpsc::RecvTimeoutError::Disconnected) => {
                        if !batch.is_empty() {
                            let _ = app_handle.emit("node-log-batch", &batch);
                        }
                        // Check if node exited unexpectedly (still registered in NODE_PROCESS)
                        let mut proc_lock = lock_node_process();
                        if let Some(ref mut managed) = *proc_lock {
                            if managed.child.id() == pid {
                                let mut exit_status = None;
                                for _ in 0..20 {
                                    match managed.child.try_wait() {
                                        Ok(Some(status)) => {
                                            exit_status = Some(status);
                                            break;
                                        }
                                        Ok(None) => {
                                            std::thread::sleep(std::time::Duration::from_millis(50));
                                        }
                                        Err(_) => break,
                                    }
                                }
                                let exit_code = exit_status.and_then(|s| s.code());
                                remove_pid_file(&managed.pid_file);
                                *proc_lock = None;
                                let _ = app_handle.emit("node-process-exited", exit_code);
                            }
                        }
                        break;
                    }
                }
            }
        });
    }

    if let Some(stdout) = child.stdout.take() {
        let tx = log_tx.clone();
        std::thread::spawn(move || {
            use std::io::{BufRead, BufReader};
            let reader = BufReader::new(stdout);
            for line in reader.lines().map_while(Result::ok) {
                crate::log_store::append_line("Geth", &line);
                let _ = tx.send(line);
            }
        });
    }

    if let Some(stderr) = child.stderr.take() {
        let tx = log_tx;
        std::thread::spawn(move || {
            use std::io::{BufRead, BufReader};
            let reader = BufReader::new(stderr);
            for line in reader.lines().map_while(Result::ok) {
                crate::log_store::append_line("Geth", &line);
                let _ = tx.send(line);
            }
        });
    } else {
        drop(log_tx);
    }

    {
        let mut proc_lock = lock_node_process();
        *proc_lock = Some(ManagedNode {
            child,
            http_port: config.http_port,
            pid_file,
        });
    }
    Ok(format!(
        "Node started successfully (PID: {}) on ports P2P:{} HTTP:{}",
        pid, config.p2p_port, config.http_port
    ))
}

pub fn stop_node_sync() -> Result<String, String> {
    let taken = {
        let mut proc_lock = lock_node_process();
        proc_lock.take()
    };

    if let Some(mut managed) = taken {
        let pid = managed.child.id();

        // First ask the node to stop mining immediately before terminating
        send_miner_stop_sync(managed.http_port);

        #[cfg(unix)]
        {
            // Send SIGINT first (standard Geth graceful shutdown signal for LevelDB flush)
            unsafe {
                libc::kill(pid as i32, libc::SIGINT);
            }
        }
        #[cfg(target_os = "windows")]
        {
            use std::os::windows::process::CommandExt;
            const CREATE_NO_WINDOW: u32 = 0x08000000;
            let _ = Command::new("taskkill")
                .args(["/PID", &pid.to_string(), "/T"])
                .creation_flags(CREATE_NO_WINDOW)
                .output();
        }
        #[cfg(not(any(unix, target_os = "windows")))]
        {
            let _ = managed.child.kill();
        }

        let start = std::time::Instant::now();
        #[cfg(unix)]
        let mut sigterm_sent = false;
        loop {
            match managed.child.try_wait() {
                Ok(Some(status)) => {
                    remove_pid_file(&managed.pid_file);
                    return Ok(format!("Node stopped cleanly with status: {:?}", status));
                }
                Ok(None) => {
                    let elapsed = start.elapsed();
                    #[cfg(unix)]
                    if !sigterm_sent && elapsed >= std::time::Duration::from_secs(45) {
                        sigterm_sent = true;
                        unsafe {
                            libc::kill(pid as i32, libc::SIGTERM);
                        }
                    }
                    if elapsed >= std::time::Duration::from_secs(50) {
                        let _ = managed.child.kill();
                        let _ = managed.child.wait();
                        remove_pid_file(&managed.pid_file);
                        return Ok("Node forcefully killed after graceful shutdown timeout (50s)".to_string());
                    }
                    std::thread::sleep(std::time::Duration::from_millis(100));
                }
                Err(e) => {
                    let _ = managed.child.kill();
                    remove_pid_file(&managed.pid_file);
                    return Err(format!("Error while waiting for node shutdown: {}", e));
                }
            }
        }
    } else {
        Ok("Node is not running".to_string())
    }
}

#[tauri::command]
pub async fn stop_node() -> Result<String, String> {
    tokio::task::spawn_blocking(stop_node_sync)
        .await
        .map_err(|e| format!("Failed to join node stop task: {}", e))?
}

#[tauri::command]
pub async fn exit_app(app: AppHandle) -> Result<(), String> {
    let _ = stop_node().await;
    app.exit(0);
    Ok(())
}

fn validate_chaindata_target(resolved: &Path) -> Result<(), String> {
    if resolved.parent().is_none() || resolved.components().count() <= 2 {
        return Err("Refusing to clean chaindata at filesystem root or top-level system directory".to_string());
    }
    let geth_dir = resolved.join("geth");
    if geth_dir.exists() {
        let has_marker = geth_dir.join("chaindata").exists()
            || geth_dir.join("lightchaindata").exists()
            || geth_dir.join("nodekey").exists()
            || geth_dir.join("LOCK").exists()
            || resolved.join("core-rogue.pid").exists();
        if !has_marker {
            return Err(format!(
                "Refusing to delete {:?}: directory does not look like a Rogue node datadir",
                geth_dir
            ));
        }
    }
    Ok(())
}

async fn reset_chaindata_internal(datadir: Option<String>, preserve_identity: bool) -> Result<String, String> {
    let _ = stop_node().await;

    let resolved = resolve_datadir(datadir.as_deref());
    validate_chaindata_target(&resolved)?;

    tokio::task::spawn_blocking(move || {
        remove_stale_ipc(&resolved);

        let geth_dir = resolved.join("geth");
        if preserve_identity {
            for sub in ["chaindata", "lightchaindata"] {
                let target = geth_dir.join(sub);
                if target.exists() {
                    std::fs::remove_dir_all(&target)
                        .map_err(|e| format!("Failed to delete {} at {:?}: {}", sub, target, e))?;
                }
            }
        } else if geth_dir.exists() {
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
    })
    .await
    .map_err(|e| format!("Failed to join chaindata reset task: {}", e))?
}

#[tauri::command]
pub async fn clean_chaindata(datadir: Option<String>) -> Result<String, String> {
    reset_chaindata_internal(datadir, false).await
}

#[tauri::command]
pub async fn recover_chaindata(datadir: Option<String>) -> Result<String, String> {
    reset_chaindata_internal(datadir, true).await
}

#[tauri::command]
pub async fn get_node_status() -> Result<ProcessStatus, String> {
    let mut proc_lock = lock_node_process();
    if let Some(ref mut managed) = *proc_lock {
        match managed.child.try_wait() {
            Ok(Some(_status)) => {
                remove_pid_file(&managed.pid_file);
                *proc_lock = None;
                Ok(ProcessStatus {
                    running: false,
                    pid: None,
                })
            }
            Ok(None) => Ok(ProcessStatus {
                running: true,
                pid: Some(managed.child.id()),
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
    tokio::task::spawn_blocking(get_system_specs_sync)
        .await
        .map_err(|e| format!("Failed to join system specs task: {}", e))?
}

fn get_system_specs_sync() -> Result<SystemSpecs, String> {
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

    #[cfg(target_os = "macos")]
    {
        if let Ok(out) = std::process::Command::new("sysctl").args(["-n", "machdep.cpu.brand_string"]).output() {
            let s = String::from_utf8_lossy(&out.stdout).trim().to_string();
            if !s.is_empty() {
                cpu_model = s;
            }
        }
        if let Ok(out) = std::process::Command::new("sysctl").args(["-n", "hw.memsize"]).output() {
            if let Ok(bytes) = String::from_utf8_lossy(&out.stdout).trim().parse::<u64>() {
                if bytes > 0 {
                    total_ram_mb = bytes / (1024 * 1024);
                    available_ram_mb = (total_ram_mb * 60) / 100;
                }
            }
        }
        if let Ok(out) = std::process::Command::new("vm_stat").output() {
            let text = String::from_utf8_lossy(&out.stdout);
            let mut page_size: u64 = 4096;
            if let Some(first_line) = text.lines().next() {
                if let Some(idx) = first_line.find("page size of ") {
                    let rest = &first_line[idx + 13..];
                    if let Some(end) = rest.find(' ') {
                        page_size = rest[..end].parse().unwrap_or(4096);
                    }
                }
            }
            let mut free_pages: u64 = 0;
            let mut inactive_pages: u64 = 0;
            for line in text.lines() {
                if let Some((k, v)) = line.split_once(':') {
                    let num = v.trim().trim_end_matches('.').parse::<u64>().unwrap_or(0);
                    if k.contains("Pages free") {
                        free_pages = num;
                    } else if k.contains("Pages inactive") {
                        inactive_pages = num;
                    }
                }
            }
            let avail_bytes = (free_pages + inactive_pages) * page_size;
            if avail_bytes > 0 {
                available_ram_mb = avail_bytes / (1024 * 1024);
            }
        }
    }

    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        if let Ok(out) = std::process::Command::new("powershell")
            .args([
                "-NoProfile",
                "-Command",
                "(Get-CimInstance Win32_Processor | Select-Object -First 1 -ExpandProperty Name)",
            ])
            .creation_flags(CREATE_NO_WINDOW)
            .output()
        {
            let s = String::from_utf8_lossy(&out.stdout).trim().to_string();
            if !s.is_empty() {
                cpu_model = s;
            }
        }
        if let Ok(out) = std::process::Command::new("powershell")
            .args([
                "-NoProfile",
                "-Command",
                "$os = Get-CimInstance Win32_OperatingSystem; Write-Output \"$($os.TotalVisibleMemorySize) $($os.FreePhysicalMemory)\"",
            ])
            .creation_flags(CREATE_NO_WINDOW)
            .output()
        {
            let s = String::from_utf8_lossy(&out.stdout).trim().to_string();
            let parts: Vec<&str> = s.split_whitespace().collect();
            if parts.len() >= 2 {
                if let (Ok(total_kb), Ok(free_kb)) = (parts[0].parse::<u64>(), parts[1].parse::<u64>()) {
                    if total_kb > 0 {
                        total_ram_mb = total_kb / 1024;
                    }
                    if free_kb > 0 {
                        available_ram_mb = free_kb / 1024;
                    }
                }
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_node_config_defaults_aligned() {
        let cfg = NodeConfig::default();
        assert_eq!(cfg.http_port, 38845);
        assert_eq!(cfg.p2p_port, 38888);
        assert_eq!(cfg.ws_port, 0);
        assert!(cfg.bootnodes.is_none());
        assert_eq!(cfg.syncmode.as_deref(), Some("full"));
        assert!(!cfg.fast_mode);
        assert!(!cfg.mine);
    }

    #[test]
    fn test_pid_file_roundtrip_and_cleanup() {
        let tmp_dir = std::env::temp_dir().join(format!("rogue-pid-test-{}", std::process::id()));
        let _ = std::fs::create_dir_all(&tmp_dir);
        let pid_path = pid_file_path(&tmp_dir);

        write_pid_file(&pid_path, 42424);
        assert_eq!(read_pid_file(&pid_path), Some(42424));

        remove_pid_file(&pid_path);
        assert_eq!(read_pid_file(&pid_path), None);
        let _ = std::fs::remove_dir_all(&tmp_dir);
    }

    #[test]
    fn test_validate_node_config_rejects_invalid_inputs() {
        let mut cfg = NodeConfig::default();
        assert!(validate_node_config(&cfg).is_ok());

        cfg.coinbase = Some("not-an-address".to_string());
        assert!(validate_node_config(&cfg).is_err());

        cfg.coinbase = Some("0x0544802665bc7c22124348e745a7abaa8420e197".to_string());
        assert!(validate_node_config(&cfg).is_ok());

        cfg.bootnodes = Some("http://evil.com".to_string());
        assert!(validate_node_config(&cfg).is_err());

        cfg.bootnodes = None;
        cfg.authrpc_port = Some(0);
        assert!(validate_node_config(&cfg).is_err());

        cfg.authrpc_port = Some(38860);
        cfg.nat = Some("invalid_nat_mode".to_string());
        assert!(validate_node_config(&cfg).is_err());

        cfg.nat = Some("extip:1.2.3.4".to_string());
        assert!(validate_node_config(&cfg).is_ok());
    }

    #[test]
    fn test_validate_chaindata_target() {
        assert!(validate_chaindata_target(Path::new("/")).is_err());
        assert!(validate_chaindata_target(Path::new("/home")).is_err());

        let tmp = std::env::temp_dir().join(format!("rogue-chaindata-val-{}", std::process::id()));
        let geth_dir = tmp.join("geth");
        let _ = std::fs::create_dir_all(&geth_dir);
        // Without geth markers inside an existing geth dir, refuse
        assert!(validate_chaindata_target(&tmp).is_err());

        // With chaindata marker, allow
        let _ = std::fs::create_dir_all(geth_dir.join("chaindata"));
        assert!(validate_chaindata_target(&tmp).is_ok());
        let _ = std::fs::remove_dir_all(&tmp);
    }

    #[test]
    fn test_cleanup_stale_pid_and_ipc_removes_orphans() {
        let tmp_dir = std::env::temp_dir().join(format!("rogue-stale-test-{}", std::process::id()));
        let _ = std::fs::create_dir_all(&tmp_dir);
        let pid_path = pid_file_path(&tmp_dir);
        let ipc_path = tmp_dir.join("geth.ipc");

        // Use a non-existent PID so cleanup does not signal any real process
        write_pid_file(&pid_path, 999_999_999);
        std::fs::write(&ipc_path, b"").expect("failed to create mock ipc file");
        assert!(pid_path.exists());
        assert!(ipc_path.exists());

        cleanup_stale_pid(&pid_path, &tmp_dir);
        assert!(!pid_path.exists());
        assert!(!ipc_path.exists());

        let _ = std::fs::remove_dir_all(&tmp_dir);
    }

    #[test]
    fn test_validate_node_config_rejects_port_collisions() {
        let mut cfg = NodeConfig::default();
        cfg.ws_port = cfg.http_port;
        assert!(validate_node_config(&cfg).is_err());

        cfg.ws_port = 0;
        cfg.authrpc_port = Some(cfg.p2p_port);
        assert!(validate_node_config(&cfg).is_err());
    }

    #[test]
    fn test_find_busy_port_detects_bound_tcp_and_udp_sockets() {
        let tcp_http = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let http_port = tcp_http.local_addr().unwrap().port();

        let tcp_p2p = std::net::TcpListener::bind("0.0.0.0:0").unwrap();
        let p2p_port = tcp_p2p.local_addr().unwrap().port();

        let tcp_auth = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let auth_port = tcp_auth.local_addr().unwrap().port();

        let mut cfg = NodeConfig {
            http_port,
            p2p_port,
            authrpc_port: Some(auth_port),
            ..NodeConfig::default()
        };

        let err = wait_for_ports_available(&cfg, std::time::Duration::from_millis(50)).unwrap_err();
        assert!(err.contains("HTTP RPC port"));

        drop(tcp_http);
        let err = wait_for_ports_available(&cfg, std::time::Duration::from_millis(50)).unwrap_err();
        assert!(err.contains("P2P port"));

        drop(tcp_p2p);
        let err = wait_for_ports_available(&cfg, std::time::Duration::from_millis(50)).unwrap_err();
        assert!(err.contains("AuthRPC port"));

        drop(tcp_auth);
        // Pick fresh ephemeral ports to avoid race, and verify free ports pass
        let free_http = std::net::TcpListener::bind("127.0.0.1:0").unwrap().local_addr().unwrap().port();
        let free_p2p = std::net::TcpListener::bind("0.0.0.0:0").unwrap().local_addr().unwrap().port();
        let free_auth = std::net::TcpListener::bind("127.0.0.1:0").unwrap().local_addr().unwrap().port();
        cfg.http_port = free_http;
        cfg.p2p_port = free_p2p;
        cfg.authrpc_port = Some(free_auth);
        assert!(wait_for_ports_available(&cfg, std::time::Duration::from_millis(50)).is_ok());
    }

    #[test]
    fn test_rogue_binary_and_datadir_matching() {
        assert!(is_rogue_binary_name("core-rogue"));
        assert!(is_rogue_binary_name("/usr/bin/core-rogue-x86_64-unknown-linux-gnu"));
        assert!(is_rogue_binary_name("C:\\Program Files\\Rogue\\core-rogue.exe"));
        assert!(is_rogue_binary_name("geth"));
        assert!(!is_rogue_binary_name("/usr/bin/python3"));
        assert!(!is_rogue_binary_name("rogue-desktop"));

        // Current test runner PID must never be identified as a rogue node process
        assert!(!is_rogue_node_process(std::process::id()));
        assert!(!is_rogue_node_process(0));

        let tmp_dir = std::env::temp_dir().join(format!("rogue-datadir-match-{}", std::process::id()));
        let _ = std::fs::create_dir_all(&tmp_dir);
        let args = vec![
            "/opt/rogue/core-rogue".to_string(),
            "--rogue".to_string(),
            "--datadir".to_string(),
            tmp_dir.to_string_lossy().to_string(),
        ];
        assert!(cmdline_matches_datadir(&args, &tmp_dir));

        let args_eq = vec![
            "core-rogue".to_string(),
            format!("--datadir={}", tmp_dir.to_string_lossy()),
        ];
        assert!(cmdline_matches_datadir(&args_eq, &tmp_dir));

        let other_dir = std::env::temp_dir().join("other-chaindata-dir");
        assert!(!cmdline_matches_datadir(&args, &other_dir));

        let _ = std::fs::remove_dir_all(&tmp_dir);
    }
}
