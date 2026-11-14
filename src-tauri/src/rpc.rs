use serde_json::Value;
use std::sync::OnceLock;
use std::time::Duration;

static HTTP_CLIENT: OnceLock<reqwest::Client> = OnceLock::new();

fn get_client() -> &'static reqwest::Client {
    HTTP_CLIENT.get_or_init(|| {
        reqwest::Client::builder()
            .timeout(Duration::from_secs(5))
            .pool_idle_timeout(Duration::from_secs(30))
            .tcp_keepalive(Duration::from_secs(15))
            .build()
            .unwrap_or_else(|_| reqwest::Client::new())
    })
}

pub fn validate_rpc_endpoint(endpoint: &str) -> Result<(), String> {
    let trimmed = endpoint.trim();
    let rest = trimmed
        .strip_prefix("http://127.0.0.1")
        .or_else(|| trimmed.strip_prefix("http://localhost"))
        .ok_or_else(|| "RPC endpoint must target localhost (http://127.0.0.1 or http://localhost)".to_string())?;

    if rest.contains('@') || rest.chars().any(|c| c.is_whitespace()) {
        return Err("Invalid characters in RPC endpoint".to_string());
    }
    if !(rest.is_empty() || rest.starts_with(':') || rest.starts_with('/')) {
        return Err("Invalid RPC endpoint host".to_string());
    }
    if let Some(after_colon) = rest.strip_prefix(':') {
        let port_str = after_colon.split('/').next().unwrap_or("");
        let port: u16 = port_str
            .parse()
            .map_err(|_| "Invalid RPC port in endpoint".to_string())?;
        if port == 0 {
            return Err("RPC port cannot be 0".to_string());
        }
    }
    Ok(())
}

#[tauri::command]
pub async fn call_rpc(endpoint: String, method: String, params: Value) -> Result<Value, String> {
    validate_rpc_endpoint(&endpoint)?;
    let client = get_client();
    let payload = serde_json::json!({
        "jsonrpc": "2.0",
        "id": 1,
        "method": method,
        "params": params
    });

    let res = client
        .post(&endpoint)
        .header("Content-Type", "application/json")
        .json(&payload)
        .send()
        .await
        .map_err(|e| format!("RPC connection error to {}: {}", endpoint, e))?;

    let json_resp: Value = res
        .json()
        .await
        .map_err(|e| format!("Failed to parse RPC response: {}", e))?;

    if let Some(err) = json_resp.get("error") {
        return Err(err.to_string());
    }

    Ok(json_resp.get("result").cloned().unwrap_or(Value::Null))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_validate_rpc_endpoint_ssrf_protection() {
        assert!(validate_rpc_endpoint("http://127.0.0.1:38845").is_ok());
        assert!(validate_rpc_endpoint("http://localhost:38845/").is_ok());
        assert!(validate_rpc_endpoint("http://127.0.0.1").is_ok());
        assert!(validate_rpc_endpoint("http://169.254.169.254/latest/meta-data").is_err());
        assert!(validate_rpc_endpoint("http://localhost.evil.com:38845").is_err());
        assert!(validate_rpc_endpoint("http://127.0.0.1@evil.com:38845").is_err());
        assert!(validate_rpc_endpoint("https://127.0.0.1:38845").is_err());
        assert!(validate_rpc_endpoint("file:///etc/passwd").is_err());
    }
}

