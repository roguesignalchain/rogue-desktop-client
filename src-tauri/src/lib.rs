pub mod log_store;
pub mod messaging;
pub mod process_manager;
pub mod wallet;
pub mod rpc;

use tauri::{
    menu::{Menu, MenuItem},
    tray::{TrayIconBuilder, TrayIconEvent},
    Manager, RunEvent, Wry,
};

struct TrayMenuItems {
    show: MenuItem<Wry>,
    quit: MenuItem<Wry>,
}

#[tauri::command]
fn update_tray_labels(
    show_label: String,
    quit_label: String,
    state: tauri::State<'_, TrayMenuItems>,
) -> Result<(), String> {
    let _ = state.show.set_text(show_label);
    let _ = state.quit.set_text(quit_label);
    Ok(())
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(win) = app.get_webview_window("main") {
                let _ = win.show();
                let _ = win.unminimize();
                let _ = win.set_focus();
            }
        }))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            let show_i = MenuItem::with_id(app, "show", "Show Window", true, None::<&str>)?;
            let quit_i = MenuItem::with_id(app, "quit", "Stop Node & Quit", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show_i, &quit_i])?;
            app.manage(TrayMenuItems {
                show: show_i.clone(),
                quit: quit_i.clone(),
            });

            let _tray = TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .menu(&menu)
                .show_menu_on_left_click(false)
                .tooltip("Rogue Signal Node")
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "show" => {
                        if let Some(win) = app.get_webview_window("main") {
                            let _ = win.show();
                            let _ = win.unminimize();
                            let _ = win.set_focus();
                        }
                    }
                    "quit" => {
                        let app_handle = app.clone();
                        tauri::async_runtime::spawn(async move {
                            let _ = process_manager::stop_node().await;
                            app_handle.exit(0);
                        });
                    }
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click { .. } = event {
                        let app = tray.app_handle();
                        if let Some(win) = app.get_webview_window("main") {
                            let _ = win.show();
                            let _ = win.unminimize();
                            let _ = win.set_focus();
                        }
                    }
                })
                .build(app)?;

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            process_manager::start_node,
            process_manager::stop_node,
            process_manager::exit_app,
            process_manager::get_node_status,
            process_manager::clean_chaindata,
            process_manager::recover_chaindata,
            process_manager::get_system_specs,
            log_store::append_app_log,
            log_store::read_node_logs,
            log_store::export_diagnostic_log,
            log_store::open_logs_folder,
            wallet::generate_mnemonic,
            wallet::has_vault,
            wallet::reset_vault,
            wallet::change_master_password,
            wallet::create_wallet,
            wallet::unlock_wallet,
            wallet::lock_wallet,
            wallet::add_wallet,
            wallet::remove_wallet,
            wallet::rename_wallet,
            wallet::set_active_wallet,
            wallet::get_wallets,
            wallet::get_mnemonic,
            wallet::get_accounts,
            wallet::get_derived_accounts,
            wallet::get_private_key,
            wallet::sign_transaction,
            wallet::sign_raw_transaction,
            rpc::call_rpc,
            rpc::call_rpc_batch,
            messaging::messaging_connect,
            messaging::messaging_disconnect,
            messaging::messaging_status,
            messaging::messaging_list_rooms,
            messaging::messaging_set_active_room,
            messaging::messaging_send_message,
            messaging::messaging_read_history,
            messaging::messaging_create_room,
            messaging::messaging_delete_room,
            messaging::messaging_update_topic,
            messaging::messaging_delete_message,
            messaging::messaging_send_dm,
            messaging::messaging_list_dms,
            messaging::messaging_list_online,
            update_tray_labels
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|_app_handle, event| {
            if matches!(event, RunEvent::ExitRequested { .. } | RunEvent::Exit) {
                let _ = process_manager::stop_node_sync();
                let _ = wallet::lock_wallet();
            }
        });
}
