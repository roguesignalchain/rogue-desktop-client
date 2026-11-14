pub mod process_manager;
pub mod wallet;
pub mod rpc;

use tauri::{
    menu::{Menu, MenuItem},
    tray::{TrayIconBuilder, TrayIconEvent},
    Manager, RunEvent,
};

pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let show_i = MenuItem::with_id(app, "show", "Mostrar Ventana", true, None::<&str>)?;
            let quit_i = MenuItem::with_id(app, "quit", "Detener Nodo y Salir", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show_i, &quit_i])?;

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
            process_manager::get_system_specs,
            wallet::generate_mnemonic,
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
            rpc::call_rpc
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
