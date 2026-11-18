use caprine_rust::config::{AppConfig, SidebarMode, Theme};
use std::fs;

#[test]
fn test_default_config() {
    let config = AppConfig::default();
    assert_eq!(config.theme, Theme::System);
    assert_eq!(config.private_mode, false);
    assert_eq!(config.zoom_factor, 1.0);
    assert_eq!(config.sidebar, SidebarMode::Default);
    assert_eq!(config.quit_on_window_close, false);
}

#[test]
fn test_legacy_migration() {
    let fixture_path = "tests/fixtures/legacy_config.json";
    let fixture_content = fs::read_to_string(fixture_path).expect("Read fixture failed");

    let migrated = AppConfig::migrate_from_legacy_json(&fixture_content).expect("Migration failed");

    assert_eq!(migrated.theme, Theme::Dark);
    assert_eq!(migrated.private_mode, true);
    assert_eq!(migrated.zoom_factor, 1.2);
    assert_eq!(migrated.sidebar, SidebarMode::Narrow);
    assert_eq!(migrated.always_on_top, true);
    assert_eq!(migrated.notification_message_preview, false);
}

#[test]
fn test_atomic_persistence() {
    let temp_dir = tempfile::tempdir().expect("Create tempdir failed");
    let target_file = temp_dir.path().join("config.json");

    let mut config = AppConfig::default();
    config.theme = Theme::Dark;
    config.zoom_factor = 1.5;

    let json_data = serde_json::to_string_pretty(&config).unwrap();
    fs::write(&target_file, json_data).unwrap();

    let loaded = AppConfig::load_from_path(&target_file).expect("Load config failed");
    assert_eq!(loaded.theme, Theme::Dark);
    assert_eq!(loaded.zoom_factor, 1.5);
}

