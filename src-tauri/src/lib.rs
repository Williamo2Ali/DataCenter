mod backup;
mod people_index;
mod profile;
mod repos;
mod settings;
mod vault;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_fs::init())
    .plugin(tauri_plugin_dialog::init())
    .plugin(tauri_plugin_opener::init())
    .plugin(tauri_plugin_os::init())
    .plugin(tauri_plugin_device_contacts::init())
    .plugin(tauri_plugin_file_share::init())
    .plugin(tauri_plugin_file_copy::init())
    .invoke_handler(tauri::generate_handler![
      vault::secure_vault_file,
      vault::protect_vault_file,
      vault::verify_and_delete_vault,
      backup::create_backup,
      backup::inspect_backup,
      backup::restore_backup,
      settings::read_app_settings,
      settings::save_app_settings,
      profile::read_profile,
      profile::save_profile,
      people_index::search_people_index,
      repos::list_repos,
      repos::create_repo,
      repos::open_repo,
      repos::close_repo,
      repos::verify_repo_password,
      repos::set_repo_password,
      repos::lock_repo,
      repos::toggle_favorite,
      repos::set_tab_hidden,
      repos::register_document,
      repos::register_documents,
      repos::repo_files_dir,
      repos::update_document_metadata,
      repos::delete_document,
      repos::add_repo_tab,
      repos::rename_repo_tab,
      repos::delete_repo_tab,
      repos::delete_core_tab,
      repos::restore_core_tab,
      repos::move_repo_tab,
      repos::restore_repo_defaults,
      repos::rename_repo,
      repos::repo_size,
      repos::add_people,
      repos::update_people,
      repos::delete_people,
      repos::upsert_passport,
      repos::upsert_study,
      repos::upsert_national_id,
      repos::upsert_civil,
      repos::add_contact,
      repos::update_contact,
      repos::delete_contact,
      repos::add_account,
      repos::update_account,
      repos::delete_account,
      repos::create_custom_tab,
      repos::add_custom_column,
      repos::rename_custom_column,
      repos::delete_custom_column,
      repos::hide_base_column,
      repos::unhide_base_column,
      repos::soft_delete_base_column,
      repos::restore_base_column,
      repos::set_base_column_label,
      repos::reset_base_column_label,
      repos::upsert_custom_row,
      repos::delete_custom_row,
      repos::update_core_extra,
      repos::update_account_extra,
      repos::update_contact_extra,
      repos::resolve_repo_file,
      repos::prepare_share_files,
      repos::export_repo_db,
      repos::export_repo_bytes,
      repos::import_repo_db,
      repos::import_repo_bytes,
      repos::delete_repo,
      repos::list_default_tabs,
      repos::save_default_tabs
    ])
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      repos::cleanup_share_cache_on_startup(app.handle());
      repos::cleanup_stale_lock_staging(app.handle());
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while building tauri application");
}
