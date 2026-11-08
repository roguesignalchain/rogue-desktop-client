use serde_json::Value;

#[tauri::command]
pub async fn call_rpc(endpoint: String, method: String, params: Value) -> Result<Value, String> {
    let client = reqwest::Client::new();
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

