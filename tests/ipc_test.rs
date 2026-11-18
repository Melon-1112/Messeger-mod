use caprine_rust::ipc::{
    parse_inbound_message, FeatureStatePayload, IpcInboundAction, IpcOutboundAction,
    MAX_IPC_PAYLOAD_BYTES,
};

#[test]
fn test_valid_inbound_actions() {
    let unread_msg = r#"{"type": "UpdateUnreadCount", "payload": {"count": 5}}"#;
    let action = parse_inbound_message(unread_msg).expect("Failed to parse UpdateUnreadCount");
    assert_eq!(action, IpcInboundAction::UpdateUnreadCount { count: 5 });

    let notif_msg = r#"{"type": "ShowNotification", "payload": {"title": "Alice", "body": "Hello!"}}"#;
    let action = parse_inbound_message(notif_msg).expect("Failed to parse ShowNotification");
    assert_eq!(action, IpcInboundAction::ShowNotification {
        title: "Alice".to_string(),
        body: "Hello!".to_string(),
    });

    let external_msg = r#"{"type": "OpenExternal", "payload": {"url": "https://example.com"}}"#;
    let action = parse_inbound_message(external_msg).expect("Failed to parse OpenExternal");
    assert_eq!(action, IpcInboundAction::OpenExternal {
        url: "https://example.com".to_string(),
    });

    let ready_msg = r#"{"type": "PageReady"}"#;
    let ready = parse_inbound_message(ready_msg).expect("Failed to parse PageReady");
    assert_eq!(ready, IpcInboundAction::PageReady);

    let recall_msg = r#"{"type": "SetAntiRecallEnabled", "payload": {"enabled": false}}"#;
    let recall = parse_inbound_message(recall_msg).expect("Failed to parse SetAntiRecallEnabled");
    assert_eq!(recall, IpcInboundAction::SetAntiRecallEnabled { enabled: false });

    let diag_msg = r#"{"type": "DiagLog", "payload": {"message": "rows=12"}}"#;
    let diag = parse_inbound_message(diag_msg).expect("Failed to parse DiagLog");
    assert_eq!(diag, IpcInboundAction::DiagLog { message: "rows=12".to_string() });

    let script = IpcOutboundAction::SetAntiRecall(true).to_script();
    assert!(script.contains(r#""action":"SetAntiRecall""#));
    assert!(script.contains(r#""data":true"#));

    let feat_msg = r#"{"type": "UpdateFeatureSetting", "payload": {"key": "block_seen", "enabled": true}}"#;
    let feat = parse_inbound_message(feat_msg).expect("Failed to parse UpdateFeatureSetting");
    assert_eq!(
        feat,
        IpcInboundAction::UpdateFeatureSetting {
            key: "block_seen".to_string(),
            enabled: Some(true),
            num_value: None,
            str_value: None,
        }
    );

    let zoom_msg = r#"{"type": "UpdateFeatureSetting", "payload": {"key": "zoom_factor", "num_value": 1.15}}"#;
    let zoom_act = parse_inbound_message(zoom_msg).expect("Failed to parse zoom_factor");
    assert_eq!(
        zoom_act,
        IpcInboundAction::UpdateFeatureSetting {
            key: "zoom_factor".to_string(),
            enabled: None,
            num_value: Some(1.15),
            str_value: None,
        }
    );

    let sync_script = IpcOutboundAction::SyncFeatureState(FeatureStatePayload {
        anti_recall: true,
        block_seen: true,
        block_typing: false,
        private_mode: false,
        sidebar_hidden: false,
        always_on_top: false,
        background_on_close: true,
        run_at_startup: false,
        zoom_factor: 1.0,
        theme: "dark".to_string(),
    })
    .to_script();
    assert!(sync_script.contains(r#""action":"SyncFeatureState""#));
    assert!(sync_script.contains(r#""block_seen":true"#));
    assert!(sync_script.contains(r#""block_typing":false"#));
}

#[test]
fn test_oversized_payload_rejected() {
    let huge_string = "a".repeat(MAX_IPC_PAYLOAD_BYTES + 10);
    let malicious_msg = format!(r#"{{"type": "OpenExternal", "payload": {{"url": "{}"}}}}"#, huge_string);

    let result = parse_inbound_message(&malicious_msg);
    assert!(result.is_err());
    assert!(result.unwrap_err().contains("exceeds maximum"));
}

#[test]
fn test_malformed_json_rejected() {
    let malformed = "{ type: not_valid_json }";
    let result = parse_inbound_message(malformed);
    assert!(result.is_err());
}

