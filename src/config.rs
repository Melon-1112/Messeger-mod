use std::fs::{self, File};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use directories::ProjectDirs;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum Theme {
    System,
    Light,
    Dark,
}

impl Default for Theme {
    fn default() -> Self {
        Self::System
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum SidebarMode {
    Default,
    Hidden,
    Narrow,
    Wide,
}

impl Default for SidebarMode {
    fn default() -> Self {
        Self::Default
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum VibrancyMode {
    None,
    Sidebar,
    Full,
}

impl Default for VibrancyMode {
    fn default() -> Self {
        Self::None
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct WindowState {
    pub x: Option<i32>,
    pub y: Option<i32>,
    pub width: u32,
    pub height: u32,
    pub is_maximized: bool,
}

impl Default for WindowState {
    fn default() -> Self {
        Self {
            x: None,
            y: None,
            width: 900,
            height: 650,
            is_maximized: false,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct BlockSettings {
    pub chat_seen: bool,
    pub typing_indicator: bool,
    pub delivery_receipt: bool,
}

impl Default for BlockSettings {
    fn default() -> Self {
        Self {
            chat_seen: false,
            typing_indicator: false,
            delivery_receipt: false,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct AppConfig {
    pub schema_version: u32,
    pub theme: Theme,
    pub private_mode: bool,
    pub vibrancy: VibrancyMode,
    pub zoom_factor: f64,
    pub last_window_state: WindowState,
    pub always_on_top: bool,
    pub show_tray_icon: bool,
    pub show_unread_badge: bool,
    pub flash_window_on_message: bool,
    pub notification_message_preview: bool,
    pub sidebar: SidebarMode,
    pub auto_hide_menu_bar: bool,
    pub quit_on_window_close: bool,
    pub use_work_chat: bool,
    pub autoplay_videos: bool,
    pub block: BlockSettings,
    #[serde(default = "default_true")]
    pub anti_recall_enabled: bool,
    #[serde(default)]
    pub run_at_startup: bool,
}

fn default_true() -> bool {
    true
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            schema_version: 1,
            theme: Theme::default(),
            private_mode: false,
            vibrancy: VibrancyMode::default(),
            zoom_factor: 1.0,
            last_window_state: WindowState::default(),
            always_on_top: false,
            show_tray_icon: true,
            show_unread_badge: true,
            flash_window_on_message: true,
            notification_message_preview: true,
            sidebar: SidebarMode::default(),
            auto_hide_menu_bar: false,
            quit_on_window_close: false,
            use_work_chat: false,
            autoplay_videos: true,
            block: BlockSettings::default(),
            anti_recall_enabled: true,
            run_at_startup: false,
        }
    }
}

impl AppConfig {
    /// Trả về đường dẫn thư mục cấu hình của CaprineRust
    pub fn config_dir() -> PathBuf {
        if let Some(proj_dirs) = ProjectDirs::from("com", "sindresorhus", "CaprineRust") {
            proj_dirs.config_dir().to_path_buf()
        } else {
            PathBuf::from(".config/caprine-rust")
        }
    }

    /// Trả về đường dẫn file cấu hình config.json
    pub fn config_file_path() -> PathBuf {
        Self::config_dir().join("config.json")
    }

    /// Đọc cấu hình từ disk hoặc tạo mới mặc định
    pub fn load_or_default() -> Self {
        let path = Self::config_file_path();
        if path.exists() {
            if let Ok(config) = Self::load_from_path(&path) {
                return config;
            }
        }
        let default_config = Self::default();
        let _ = default_config.save_atomic();
        default_config
    }

    /// Đọc từ một file cụ thể
    pub fn load_from_path(path: &Path) -> Result<Self, String> {
        let mut file = File::open(path).map_err(|e| e.to_string())?;
        let mut contents = String::new();
        file.read_to_string(&mut contents).map_err(|e| e.to_string())?;
        let config: AppConfig = serde_json::from_str(&contents).map_err(|e| e.to_string())?;
        Ok(config)
    }

    /// Ghi cấu hình nguyên tử (atomic write qua file tạm)
    pub fn save_atomic(&self) -> Result<(), String> {
        let dir = Self::config_dir();
        fs::create_dir_all(&dir).map_err(|e| e.to_string())?;

        let target_path = dir.join("config.json");
        let temp_path = dir.join("config.json.tmp");

        let json_str = serde_json::to_string_pretty(self).map_err(|e| e.to_string())?;

        {
            let mut file = File::create(&temp_path).map_err(|e| e.to_string())?;
            file.write_all(json_str.as_bytes()).map_err(|e| e.to_string())?;
            file.sync_all().map_err(|e| e.to_string())?;
        }

        fs::rename(&temp_path, &target_path).map_err(|e| e.to_string())?;
        Ok(())
    }

    /// Chuyển đổi an toàn từ file JSON cũ của Caprine Electron
    pub fn migrate_from_legacy_json(legacy_json: &str) -> Result<Self, String> {
        let val: serde_json::Value = serde_json::from_str(legacy_json).map_err(|e| e.to_string())?;
        let mut config = Self::default();

        if let Some(theme) = val.get("theme").and_then(|v| v.as_str()) {
            config.theme = match theme {
                "light" => Theme::Light,
                "dark" => Theme::Dark,
                _ => Theme::System,
            };
        } else if let Some(dark_mode) = val.get("darkMode").and_then(|v| v.as_bool()) {
            config.theme = if dark_mode { Theme::Dark } else { Theme::Light };
        } else if let Some(follow) = val.get("followSystemAppearance").and_then(|v| v.as_bool()) {
            if follow {
                config.theme = Theme::System;
            }
        }

        if let Some(p) = val.get("privateMode").and_then(|v| v.as_bool()) {
            config.private_mode = p;
        }

        if let Some(z) = val.get("zoomFactor").and_then(|v| v.as_f64()) {
            config.zoom_factor = z.clamp(0.5, 3.0);
        }

        if let Some(sidebar) = val.get("sidebar").and_then(|v| v.as_str()) {
            config.sidebar = match sidebar {
                "hidden" => SidebarMode::Hidden,
                "narrow" => SidebarMode::Narrow,
                "wide" => SidebarMode::Wide,
                _ => SidebarMode::Default,
            };
        } else if let Some(hidden) = val.get("sidebarHidden").and_then(|v| v.as_bool()) {
            if hidden {
                config.sidebar = SidebarMode::Hidden;
            }
        }

        if let Some(ontop) = val.get("alwaysOnTop").and_then(|v| v.as_bool()) {
            config.always_on_top = ontop;
        }

        if let Some(tray) = val.get("showTrayIcon").and_then(|v| v.as_bool()) {
            config.show_tray_icon = tray;
        }

        if let Some(quit) = val.get("quitOnWindowClose").and_then(|v| v.as_bool()) {
            config.quit_on_window_close = quit;
        }

        if let Some(work) = val.get("useWorkChat").and_then(|v| v.as_bool()) {
            config.use_work_chat = work;
        }

        if let Some(preview) = val.get("notificationMessagePreview").and_then(|v| v.as_bool()) {
            config.notification_message_preview = preview;
        }

        Ok(config)
    }
}

