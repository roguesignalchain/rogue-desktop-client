use serde::{Deserialize, Serialize};
use std::fs::{self, File, OpenOptions};
use std::io::{BufRead, BufReader, Write};
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

const MAX_LOG_FILE_BYTES: u64 = 10 * 1024 * 1024; // 10 MB per file
const MAX_ROTATED_FILES: usize = 5; // Keep node.log + node.log.1..node.log.5 (~50 MB max)

static LOG_MUTEX: Mutex<Option<PathBuf>> = Mutex::new(None);

fn lock_logs_dir() -> std::sync::MutexGuard<'static, Option<PathBuf>> {
    LOG_MUTEX.lock().unwrap_or_else(|e| e.into_inner())
}

pub fn set_active_logs_dir(dir: PathBuf) {
    let _ = fs::create_dir_all(&dir);
    let mut guard = lock_logs_dir();
    *guard = Some(dir);
}

pub fn get_active_logs_dir() -> PathBuf {
    let guard = lock_logs_dir();
    if let Some(ref dir) = *guard {
        return dir.clone();
    }
    drop(guard);
    let fallback = crate::process_manager::default_logs_dir();
    let _ = fs::create_dir_all(&fallback);
    fallback
}

/// Format current UTC time as ISO-8601 (`YYYY-MM-DDTHH:MM:SS.sssZ`) without external crates.
pub fn current_utc_timestamp() -> String {
    let dur = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default();
    let total_secs = dur.as_secs() as i64;
    let millis = dur.subsec_millis();

    let days = total_secs.div_euclid(86_400);
    let secs_of_day = total_secs.rem_euclid(86_400);
    let hour = secs_of_day / 3_600;
    let minute = (secs_of_day % 3_600) / 60;
    let second = secs_of_day % 60;

    // Howard Hinnant civil-from-days algorithm
    let z = days + 719_468;
    let era = if z >= 0 { z } else { z - 146_096 } / 146_097;
    let doe = z - era * 146_097;
    let yoe = (doe - doe / 1_460 + doe / 36_524 - doe / 146_096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = mp + if mp < 10 { 3 } else { -9 };
    let year = y + if m <= 2 { 1 } else { 0 };

    format!(
        "{:04}-{:02}-{:02}T{:02}:{:02}:{:02}.{:03}Z",
        year, m, d, hour, minute, second, millis
    )
}

fn rotate_if_needed(logs_dir: &Path, max_bytes: u64, max_files: usize) {
    let active_file = logs_dir.join("node.log");
    let size = fs::metadata(&active_file).map(|m| m.len()).unwrap_or(0);
    if size < max_bytes {
        return;
    }

    // Remove oldest if it exists
    let oldest = logs_dir.join(format!("node.log.{}", max_files));
    if oldest.exists() {
        let _ = fs::remove_file(&oldest);
    }

    // Shift node.log.{i} -> node.log.{i+1}
    for i in (1..max_files).rev() {
        let src = logs_dir.join(format!("node.log.{}", i));
        let dst = logs_dir.join(format!("node.log.{}", i + 1));
        if src.exists() {
            let _ = fs::rename(&src, &dst);
        }
    }

    // Rotate active node.log -> node.log.1
    let first_rotated = logs_dir.join("node.log.1");
    let _ = fs::rename(&active_file, &first_rotated);
}

pub fn append_line_to_dir(logs_dir: &Path, source: &str, line: &str) -> Result<(), String> {
    fs::create_dir_all(logs_dir).map_err(|e| format!("Failed to create logs dir: {}", e))?;
    rotate_if_needed(logs_dir, MAX_LOG_FILE_BYTES, MAX_ROTATED_FILES);

    let active_file = logs_dir.join("node.log");
    let mut file = OpenOptions::new()
        .create(true)
        .append(true)
        .open(&active_file)
        .map_err(|e| format!("Failed to open node.log: {}", e))?;

    let clean_line = line.trim_end_matches(&['\r', '\n'][..]);
    let ts = current_utc_timestamp();
    writeln!(file, "[{}] [{}] {}", ts, source, clean_line)
        .map_err(|e| format!("Failed to write to node.log: {}", e))?;
    Ok(())
}

pub fn append_line(source: &str, line: &str) {
    let dir = get_active_logs_dir();
    let _guard = LOG_MUTEX.lock().unwrap_or_else(|e| e.into_inner());
    let _ = append_line_to_dir(&dir, source, line);
}

fn collect_log_files_chronological(logs_dir: &Path) -> Vec<PathBuf> {
    let mut files = Vec::new();
    for i in (1..=MAX_ROTATED_FILES).rev() {
        let p = logs_dir.join(format!("node.log.{}", i));
        if p.exists() {
            files.push(p);
        }
    }
    let active = logs_dir.join("node.log");
    if active.exists() {
        files.push(active);
    }
    files
}

#[derive(Debug, Serialize, Deserialize)]
pub struct LogPageResult {
    pub lines: Vec<String>,
    pub total_lines: usize,
    pub has_more: bool,
    pub logs_dir: String,
}

pub fn read_paginated_from_dir(
    logs_dir: &Path,
    offset_from_end: usize,
    limit: usize,
) -> Result<LogPageResult, String> {
    let files = collect_log_files_chronological(logs_dir);
    let mut all_lines = Vec::new();

    for path in files {
        let file = File::open(&path).map_err(|e| format!("Failed to open {:?}: {}", path, e))?;
        let reader = BufReader::new(file);
        for line in reader.lines().map_while(Result::ok) {
            all_lines.push(line);
        }
    }

    let total_lines = all_lines.len();
    let safe_limit = limit.clamp(1, 5_000);
    let end = total_lines.saturating_sub(offset_from_end);
    let start = end.saturating_sub(safe_limit);
    let slice = all_lines[start..end].to_vec();

    Ok(LogPageResult {
        lines: slice,
        total_lines,
        has_more: start > 0,
        logs_dir: logs_dir.to_string_lossy().to_string(),
    })
}

/// Redact sensitive secrets (mnemonic, private key, password, passphrase) from log lines
/// before exporting a diagnostic bundle for user support.
pub fn sanitize_log_line(line: &str) -> String {
    let lower = line.to_lowercase();
    let sensitive_keys = [
        "mnemonic",
        "privatekey",
        "private_key",
        "privkey",
        "passphrase",
        "password",
        "seed_phrase",
        "seedphrase",
    ];

    if sensitive_keys.iter().any(|k| lower.contains(k)) {
        // Preserve timestamp & prefix if present, redact payload after sensitive key
        if let Some(pos) = sensitive_keys.iter().filter_map(|k| lower.find(k)).min() {
            let prefix = &line[..pos];
            return format!("{}[REDACTED_SENSITIVE_DATA]", prefix);
        }
        return "[REDACTED_SENSITIVE_DATA]".to_string();
    }

    line.to_string()
}

pub fn export_diagnostic_to_path(
    logs_dir: &Path,
    target_path: &Path,
    diagnostic_header: &str,
) -> Result<usize, String> {
    let files = collect_log_files_chronological(logs_dir);
    let mut out = File::create(target_path)
        .map_err(|e| format!("Failed to create diagnostic file {:?}: {}", target_path, e))?;

    writeln!(out, "{}", diagnostic_header.trim_end())
        .map_err(|e| format!("Failed to write diagnostic header: {}", e))?;
    writeln!(out, "\n================ FULL EXECUTION LOG ================").map_err(|e| e.to_string())?;

    let mut exported_lines = 0usize;
    for path in files {
        let file = File::open(&path).map_err(|e| format!("Failed to read {:?}: {}", path, e))?;
        let reader = BufReader::new(file);
        for line in reader.lines().map_while(Result::ok) {
            let sanitized = sanitize_log_line(&line);
            writeln!(out, "{}", sanitized).map_err(|e| e.to_string())?;
            exported_lines += 1;
        }
    }

    Ok(exported_lines)
}

#[tauri::command]
pub fn append_app_log(level: String, message: String) -> Result<(), String> {
    let tag = match level.to_uppercase().as_str() {
        "ERROR" | "WARN" | "INFO" | "DEBUG" => level.to_uppercase(),
        _ => "INFO".to_string(),
    };
    let dir = get_active_logs_dir();
    let _guard = LOG_MUTEX.lock().unwrap_or_else(|e| e.into_inner());
    append_line_to_dir(&dir, "App", &format!("{} {}", tag, message))
}

#[tauri::command]
pub fn read_node_logs(offset_from_end: usize, limit: usize) -> Result<LogPageResult, String> {
    let dir = get_active_logs_dir();
    let _guard = LOG_MUTEX.lock().unwrap_or_else(|e| e.into_inner());
    read_paginated_from_dir(&dir, offset_from_end, limit)
}

#[tauri::command]
pub fn export_diagnostic_log(target_path: String, diagnostic_header: String) -> Result<usize, String> {
    let dir = get_active_logs_dir();
    let _guard = LOG_MUTEX.lock().unwrap_or_else(|e| e.into_inner());
    export_diagnostic_to_path(&dir, Path::new(&target_path), &diagnostic_header)
}

#[tauri::command]
pub fn open_logs_folder() -> Result<String, String> {
    let dir = get_active_logs_dir();
    fs::create_dir_all(&dir).map_err(|e| format!("Failed to create logs dir: {}", e))?;

    #[cfg(target_os = "linux")]
    {
        std::process::Command::new("xdg-open")
            .arg(&dir)
            .spawn()
            .map_err(|e| format!("Failed to open logs folder: {}", e))?;
    }
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(&dir)
            .spawn()
            .map_err(|e| format!("Failed to open logs folder: {}", e))?;
    }
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer")
            .arg(&dir)
            .spawn()
            .map_err(|e| format!("Failed to open logs folder: {}", e))?;
    }

    Ok(dir.to_string_lossy().to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn temp_test_dir(name: &str) -> PathBuf {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let dir = std::env::temp_dir().join(format!("rogue_log_test_{}_{}", name, nanos));
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn test_rotation_and_pagination() {
        let dir = temp_test_dir("rotate");
        for i in 0..10 {
            append_line_to_dir(&dir, "Geth", &format!("line-{}", i)).unwrap();
        }
        // Force rotation with tiny limit
        fs::write(dir.join("node.log"), vec![b'a'; 128]).unwrap();
        rotate_if_needed(&dir, 64, 3);
        assert!(dir.join("node.log.1").exists());
        assert!(!dir.join("node.log").exists());

        append_line_to_dir(&dir, "App", "fresh-line").unwrap();
        let page = read_paginated_from_dir(&dir, 0, 1).unwrap();
        assert_eq!(page.lines.len(), 1);
        assert!(page.lines[0].contains("fresh-line"));
        assert!(page.has_more);

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn test_sanitize_sensitive_lines() {
        let safe = "[2026-11-14T12:00:00.000Z] [Geth] INFO Imported new chain segment hash=0x1234abcd";
        assert_eq!(sanitize_log_line(safe), safe);

        let leak = "[2026-11-14T12:00:00.000Z] [App] DEBUG privateKey=0xdeadbeef";
        let sanitized = sanitize_log_line(leak);
        assert!(!sanitized.contains("0xdeadbeef"));
        assert!(sanitized.contains("[REDACTED_SENSITIVE_DATA]"));
    }

    #[test]
    fn test_export_diagnostic() {
        let dir = temp_test_dir("export");
        append_line_to_dir(&dir, "Geth", "INFO Node started").unwrap();
        append_line_to_dir(&dir, "App", "password=supersecret").unwrap();

        let out_file = dir.join("diag.log");
        let count = export_diagnostic_to_path(&dir, &out_file, "OS: linux\nChainID: 800055").unwrap();
        assert_eq!(count, 2);

        let content = fs::read_to_string(&out_file).unwrap();
        assert!(content.contains("ChainID: 800055"));
        assert!(content.contains("INFO Node started"));
        assert!(!content.contains("supersecret"));
        assert!(content.contains("[REDACTED_SENSITIVE_DATA]"));

        let _ = fs::remove_dir_all(&dir);
    }
}

