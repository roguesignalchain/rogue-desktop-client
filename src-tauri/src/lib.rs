pub mod process_manager;
pub mod wallet;
pub mod rpc;

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            process_manager::start_node,
            process_manager::stop_node,
            process_manager::get_node_status,
            process_manager::clean_chaindata,
            process_manager::start_stratum,
            process_manager::stop_stratum,
            wallet::generate_mnemonic,
            wallet::create_wallet,
            wallet::unlock_wallet,
            wallet::get_accounts,
            wallet::sign_transaction,
            rpc::call_rpc
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

