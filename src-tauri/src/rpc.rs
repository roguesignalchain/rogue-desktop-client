use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;
use std::sync::OnceLock;
use std::time::Duration;

static HTTP_CLIENT: OnceLock<reqwest::Client> = OnceLock::new();

fn get_client() -> &'static reqwest::Client {
    HTTP_CLIENT.get_or_init(|| {
        reqwest::Client::builder()
            .timeout(Duration::from_secs(5))
            // Avoid holding idle keep-alive sockets against localhost across node restarts
            .pool_max_idle_per_host(0)
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

#[derive(Debug, Deserialize)]
pub struct RpcBatchRequest {
    pub method: String,
    pub params: Value,
}

#[derive(Debug, Serialize)]
pub struct RpcBatchResponse {
    pub result: Option<Value>,
    pub error: Option<String>,
}

fn map_batch_responses(count: usize, items: Vec<Value>) -> Vec<RpcBatchResponse> {
    let mut by_id: HashMap<usize, RpcBatchResponse> = HashMap::with_capacity(items.len());
    for item in items {
        let Some(id) = item.get("id").and_then(|v| v.as_u64()).map(|v| v as usize) else {
            continue;
        };
        let error = item.get("error").map(|e| e.to_string());
        let result = if error.is_some() {
            None
        } else {
            Some(item.get("result").cloned().unwrap_or(Value::Null))
        };
        by_id.insert(id, RpcBatchResponse { result, error });
    }

    (0..count)
        .map(|idx| {
            by_id.remove(&idx).unwrap_or(RpcBatchResponse {
                result: None,
                error: Some("Missing batch response item".to_string()),
            })
        })
        .collect()
}

#[tauri::command]
pub async fn call_rpc_batch(
    endpoint: String,
    requests: Vec<RpcBatchRequest>,
) -> Result<Vec<RpcBatchResponse>, String> {
    validate_rpc_endpoint(&endpoint)?;
    if requests.is_empty() {
        return Ok(Vec::new());
    }
    if requests.len() > 100 {
        return Err("RPC batch size exceeds maximum of 100".to_string());
    }

    let count = requests.len();
    let payload: Vec<Value> = requests
        .into_iter()
        .enumerate()
        .map(|(idx, req)| {
            serde_json::json!({
                "jsonrpc": "2.0",
                "id": idx,
                "method": req.method,
                "params": req.params
            })
        })
        .collect();

    let client = get_client();
    let res = client
        .post(&endpoint)
        .header("Content-Type", "application/json")
        .json(&payload)
        .send()
        .await
        .map_err(|e| format!("RPC batch connection error to {}: {}", endpoint, e))?;

    let json_resp: Value = res
        .json()
        .await
        .map_err(|e| format!("Failed to parse RPC batch response: {}", e))?;

    let items = json_resp
        .as_array()
        .cloned()
        .ok_or_else(|| "Expected JSON array for RPC batch response".to_string())?;

    Ok(map_batch_responses(count, items))
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

    #[test]
    fn test_map_batch_responses_preserves_order_and_errors() {
        let items = vec![
            serde_json::json!({"jsonrpc": "2.0", "id": 1, "error": {"code": -32601, "message": "Method not found"}}),
            serde_json::json!({"jsonrpc": "2.0", "id": 0, "result": "0x10"}),
        ];
        let mapped = map_batch_responses(3, items);
        assert_eq!(mapped.len(), 3);
        assert_eq!(mapped[0].result, Some(serde_json::json!("0x10")));
        assert!(mapped[0].error.is_none());
        assert!(mapped[1].result.is_none());
        assert!(mapped[1].error.is_some());
        assert!(mapped[2].error.as_deref() == Some("Missing batch response item"));
    }
}

