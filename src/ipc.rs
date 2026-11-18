use serde::{Deserialize, Serialize};

pub const MAX_IPC_PAYLOAD_BYTES: usize = 65536; // 64 KB

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct FeatureStatePayload {
    pub anti_recall: bool,
    pub block_seen: bool,
    pub block_typing: bool,
    pub private_mode: bool,
    pub sidebar_hidden: bool,
    pub always_on_top: bool,
    pub background_on_close: bool,
    pub run_at_startup: bool,
    pub zoom_factor: f64,
    pub theme: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "type", content = "payload")]
pub enum IpcInboundAction {
    UpdateUnreadCount { count: usize },
    ShowNotification { title: String, body: String },
    OpenExternal { url: String },
    ThemeDetected { is_dark: bool },
    PageReady,
    SetAntiRecallEnabled { enabled: bool },
    DiagLog { message: String },
    UpdateFeatureSetting {
        key: String,
        #[serde(default)]
        enabled: Option<bool>,
        #[serde(default)]
        num_value: Option<f64>,
        #[serde(default)]
        str_value: Option<String>,
    },
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "action", content = "data")]
pub enum IpcOutboundAction {
    SetTheme(String),
    ToggleSidebar,
    SetZoom(f64),
    TogglePrivateMode(bool),
    NewConversation,
    LogOut,
    SetAntiRecall(bool),
    SyncFeatureState(FeatureStatePayload),
}

impl IpcOutboundAction {
    pub fn to_script(&self) -> String {
        let json = serde_json::to_string(self).unwrap_or_else(|_| "{}".to_string());
        format!("window.__caprine_bridge && window.__caprine_bridge.receive({});", json)
    }
}

pub fn parse_inbound_message(raw_msg: &str) -> Result<IpcInboundAction, String> {
    if raw_msg.len() > MAX_IPC_PAYLOAD_BYTES {
        return Err("Payload size exceeds maximum allowed limit (64KB)".to_string());
    }

    serde_json::from_str::<IpcInboundAction>(raw_msg).map_err(|e| format!("Invalid IPC message format: {}", e))
}

