#![windows_subsystem = "windows"]

mod config;
mod ipc;
mod platform;
mod policy;

use config::{AppConfig, SidebarMode, Theme};
use ipc::{FeatureStatePayload, IpcInboundAction, IpcOutboundAction};
use platform::windows::{
    hide_window_to_tray, is_run_at_startup_enabled, restore_window_from_tray, set_run_at_startup,
    spawn_system_tray, AppEvent, TraySharedState,
};
use policy::PolicyEngine;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tao::dpi::PhysicalSize;
use tao::event::{Event, WindowEvent};
use tao::event_loop::{ControlFlow, EventLoopBuilder};
use tao::platform::windows::WindowExtWindows;
use tao::window::WindowBuilder;
use url::Url;
use wry::{WebViewBuilder, WebViewExtWindows};

const APP_ID: &str = "com.sindresorhus.caprine.rust";

fn show_error(msg: &str) {
    use std::os::windows::ffi::OsStrExt;
    let text: Vec<u16> = std::ffi::OsStr::new(msg).encode_wide().chain(Some(0)).collect();
    let title: Vec<u16> = std::ffi::OsStr::new("dev by n0trxxan.1112 - Lỗi").encode_wide().chain(Some(0)).collect();
    unsafe {
        windows_sys::Win32::UI::WindowsAndMessaging::MessageBoxW(0, text.as_ptr(), title.as_ptr(), 0x10);
    }
}

fn main() {
    let replace_existing = std::env::args().any(|a| a == "--replace" || a == "--restart");
    let instance_guard = match platform::windows::SingleInstanceGuard::acquire_or_replace(APP_ID, replace_existing) {
        Ok(Some(guard)) => guard,
        Ok(None) => return,
        Err(err) => {
            show_error(&format!("Không thể khởi chạy: {}", err));
            return;
        }
    };

    if let Ok(exe) = std::env::current_exe() {
        let log_path = exe.with_file_name("caprine.log");
        if let Ok(file) = std::fs::File::create(&log_path) {
            let _ = env_logger::Builder::new()
                .filter_level(log::LevelFilter::Info)
                .target(env_logger::Target::Pipe(Box::new(file)))
                .try_init();
        }
    }
    std::panic::set_hook(Box::new(|info| {
        log::error!("PANIC: {}", info);
        show_error(&format!("Ứng dụng gặp lỗi: {}", info));
    }));
    if let Err(e) = run(instance_guard) {
        log::error!("Lỗi: {}", e);
        show_error(&format!("Không thể khởi động: {}", e));
    }
}

fn build_feature_state(config: &AppConfig) -> FeatureStatePayload {
    FeatureStatePayload {
        anti_recall: config.anti_recall_enabled,
        block_seen: config.block.chat_seen,
        block_typing: config.block.typing_indicator,
        private_mode: config.private_mode,
        sidebar_hidden: config.sidebar == SidebarMode::Hidden,
        always_on_top: config.always_on_top,
        background_on_close: !config.quit_on_window_close,
        run_at_startup: config.run_at_startup,
        zoom_factor: config.zoom_factor,
        theme: match config.theme {
            Theme::Light => "light".to_string(),
            Theme::Dark | Theme::System => "dark".to_string(),
        },
    }
}

static CDP_NETWORK_ENABLED: AtomicBool = AtomicBool::new(false);

fn call_webview_cdp(
    core: &webview2_com::Microsoft::Web::WebView2::Win32::ICoreWebView2,
    method: &str,
    params_json: &str,
) -> Result<(), String> {
    use webview2_com::Microsoft::Web::WebView2::Win32::ICoreWebView2CallDevToolsProtocolMethodCompletedHandler;
    use windows_core::PCWSTR;
    let method_w: Vec<u16> = method.encode_utf16().chain(Some(0)).collect();
    let params_w: Vec<u16> = params_json.encode_utf16().chain(Some(0)).collect();
    unsafe {
        core.CallDevToolsProtocolMethod(
            PCWSTR::from_raw(method_w.as_ptr()),
            PCWSTR::from_raw(params_w.as_ptr()),
            None::<&ICoreWebView2CallDevToolsProtocolMethodCompletedHandler>,
        )
        .map_err(|e| e.to_string())
    }
}

fn apply_native_cdp_privacy_rules(webview: &wry::WebView, block_seen: bool, block_typing: bool) {
    let controller = webview.controller();
    let core = match unsafe { controller.CoreWebView2() } {
        Ok(c) => c,
        Err(e) => {
            log::warn!("Không lấy được ICoreWebView2 cho CDP filter: {}", e);
            return;
        }
    };

    if !CDP_NETWORK_ENABLED.swap(true, Ordering::Relaxed) {
        let _ = call_webview_cdp(
            &core,
            "Network.enable",
            r#"{"maxPostDataSize":0,"maxResourceBufferSize":0,"maxTotalBufferSize":0}"#,
        );
    }

    let mut urls: Vec<&str> = Vec::new();
    if block_seen {
        urls.extend_from_slice(&[
            "*://*/ajax/mercury/change_read_status.php*",
            "*://*/mercury/change_read_status.php*",
            "*://*/ajax/mercury/mark_seen.php*",
            "*://*/ajax/mercury/mark_read.php*",
        ]);
    }
    if block_typing {
        urls.extend_from_slice(&[
            "*://*/messaging/typ.php*",
            "*://*/ajax/mercury/typ.php*",
            "*://*/mercury/typ.php*",
        ]);
    }

    let params = serde_json::json!({ "urls": urls }).to_string();
    if let Err(e) = call_webview_cdp(&core, "Network.setBlockedURLs", &params) {
        log::warn!("CDP Network.setBlockedURLs lỗi: {}", e);
    } else {
        log::info!(
            "[CDP Privacy] Network.setBlockedURLs active={} (seen={}, typing={})",
            urls.len(),
            block_seen,
            block_typing
        );
    }
}

fn sync_state_everywhere(config: &AppConfig, tray: &platform::windows::TrayController, webview: &wry::WebView) {
    let _ = config.save_atomic();
    tray.sync_flags(
        config.quit_on_window_close,
        config.anti_recall_enabled,
        config.block.chat_seen,
        config.block.typing_indicator,
        config.run_at_startup,
    );
    apply_native_cdp_privacy_rules(webview, config.block.chat_seen, config.block.typing_indicator);
    let script = IpcOutboundAction::SyncFeatureState(build_feature_state(config)).to_script();
    let _ = webview.evaluate_script(&script);
}

fn run(_instance_guard: platform::windows::SingleInstanceGuard) -> Result<(), Box<dyn std::error::Error>> {
    log::info!("Khởi động Caprine Rust Desktop Host (Windows)...");
    log::info!("SingleInstanceGuard acquired thành công.");

    // 2. Tải cấu hình & kiểm tra tham số chạy ngầm (--tray)
    let mut config = AppConfig::load_or_default();
    config.run_at_startup = is_run_at_startup_enabled();
    let start_in_tray = std::env::args().any(|a| a == "--tray" || a == "--minimized");
    log::info!(
        "Đã tải cấu hình: theme={:?}, quit_on_close={}, anti_recall={}, start_in_tray={}",
        config.theme,
        config.quit_on_window_close,
        config.anti_recall_enabled,
        start_in_tray
    );

    // 3. Khởi tạo Event Loop của Tao hỗ trợ UserEvent từ System Tray
    let event_loop = EventLoopBuilder::<AppEvent>::with_user_event().build();
    let event_proxy = event_loop.create_proxy();
    log::info!("Đã khởi tạo EventLoop với AppEvent.");

    // 4. Xây dựng cửa sổ chính
    let base_title = if config.use_work_chat {
        "dev by n0trxxan.1112 - Workplace Chat"
    } else {
        "dev by n0trxxan.1112"
    };

    let init_width = if config.last_window_state.width < 480 {
        1024
    } else {
        config.last_window_state.width
    };
    let init_height = if config.last_window_state.height < 560 {
        720
    } else {
        config.last_window_state.height
    };

    let icon_bytes: &'static [u8] = include_bytes!("../img/logo.png");
    let window_icon = if let Ok(img) = image::load_from_memory(icon_bytes) {
        let rgba = img.into_rgba8();
        let (width, height) = rgba.dimensions();
        tao::window::Icon::from_rgba(rgba.into_raw(), width, height).ok()
    } else {
        None
    };

    let tray = Arc::new(spawn_system_tray(
        event_proxy.clone(),
        TraySharedState {
            quit_on_window_close: config.quit_on_window_close,
            anti_recall_enabled: config.anti_recall_enabled,
            block_seen: config.block.chat_seen,
            block_typing: config.block.typing_indicator,
            run_at_startup: config.run_at_startup,
            unread_count: 0,
            pending_balloon: None,
        },
        icon_bytes,
    ));

    let mut window_builder = WindowBuilder::new()
        .with_title(base_title)
        .with_inner_size(PhysicalSize::new(init_width, init_height))
        .with_min_inner_size(PhysicalSize::new(480, 560))
        .with_always_on_top(config.always_on_top)
        .with_visible(!start_in_tray);

    if let Some(icon) = window_icon {
        window_builder = window_builder.with_window_icon(Some(icon));
    }

    let window = window_builder.build(&event_loop)?;

    let hwnd = window.hwnd() as isize;
    log::info!("Đã tạo cửa sổ chính với HWND: 0x{:x}", hwnd);

    // 5. Chuẩn bị URL mục tiêu
    let start_url = if config.use_work_chat {
        "https://work.facebook.com/chat"
    } else {
        "https://www.messenger.com/login/"
    };

    // 6. Chuẩn bị mã tiêm JS và CSS
    let logo_js = include_str!("../webview/logo.js");
    let adapter_js = include_str!("../webview/adapter.js");
    let bundled_css = include_str!("../webview/styles.css");

    let logo_data_uri = logo_js
        .strip_prefix("window.__CAPRINE_CUSTOM_LOGO = '")
        .and_then(|s| s.strip_suffix("';"))
        .unwrap_or("");

    // Script nhúng style vào trang web ngay khi DOM sẵn sàng (tuần tự hóa an toàn bằng JSON)
    let full_css = format!(":root {{ --n0-custom-logo: url(\"{}\"); }}\n{}", logo_data_uri, bundled_css);
    let css_json = serde_json::to_string(&full_css)?;
    let inject_css_script = format!(
        r#"(function() {{
            function injectStyles() {{
                const style = document.createElement('style');
                style.id = 'caprine-injected-styles';
                style.textContent = {css_json};
                document.head ? document.head.appendChild(style) : document.documentElement.appendChild(style);
            }}
            if (document.readyState === 'loading') {{
                document.addEventListener('DOMContentLoaded', injectStyles);
            }} else {{
                injectStyles();
            }}
        }})();"#,
        css_json = css_json
    );

    let init_state_json = serde_json::to_string(&build_feature_state(&config))?;
    let init_state_script = format!("window.__CAPRINE_INITIAL_STATE = {};", init_state_json);
    let full_init_script = format!("{}\n{}\n{}\n{}", init_state_script, logo_js, inject_css_script, adapter_js);

    // 7. Khởi tạo WebView (wry - WebView2 trên Windows)
    let flash_enabled = config.flash_window_on_message;
    let is_window_visible = Arc::new(AtomicBool::new(!start_in_tray));
    let is_window_visible_ipc = Arc::clone(&is_window_visible);
    let tray_ipc = Arc::clone(&tray);
    let proxy_ipc = event_proxy.clone();
    log::info!("Bắt đầu khởi tạo WebView2...");

    let webview = WebViewBuilder::new(&window)
        .with_url(start_url)
        .with_initialization_script(&full_init_script)
        // IPC Handler an toàn
        .with_ipc_handler(move |req| {
            let raw_msg = req.body();
            if let Ok(action) = ipc::parse_inbound_message(raw_msg) {
                match action {
                    IpcInboundAction::UpdateUnreadCount { count } => {
                        log::info!("Cập nhật số tin nhắn chưa đọc: {}", count);
                        tray_ipc.update_unread(count);
                        if count > 0 && flash_enabled && is_window_visible_ipc.load(Ordering::Relaxed)
                        {
                            platform::windows::flash_taskbar(hwnd);
                        }
                    }
                    IpcInboundAction::ShowNotification { title, body } => {
                        log::info!("Thông báo: {} - {}", title, body);
                        if !is_window_visible_ipc.load(Ordering::Relaxed) {
                            tray_ipc.show_balloon(&title, &body);
                        }
                    }
                    IpcInboundAction::OpenExternal { url } => {
                        let _ = PolicyEngine::sanitize_and_open_external(&url);
                    }
                    IpcInboundAction::ThemeDetected { is_dark } => {
                        log::debug!("Giao diện trang web báo: is_dark = {}", is_dark);
                    }
                    IpcInboundAction::PageReady => {
                        let _ = proxy_ipc.send_event(AppEvent::SyncAntiRecallToWebview);
                    }
                    IpcInboundAction::SetAntiRecallEnabled { enabled } => {
                        let _ = proxy_ipc.send_event(AppEvent::UpdateAntiRecallFromWebview(enabled));
                    }
                    IpcInboundAction::DiagLog { message } => {
                        log::info!("[WebView Diag] {}", message);
                    }
                    IpcInboundAction::UpdateFeatureSetting {
                        key,
                        enabled,
                        num_value,
                        str_value,
                    } => {
                        let _ = proxy_ipc.send_event(AppEvent::UpdateFeatureFromWebview {
                            key,
                            enabled,
                            num_value,
                            str_value,
                        });
                    }
                }
            } else {
                log::warn!("Bỏ qua IPC payload không hợp lệ hoặc quá kích thước");
            }
        })
        // Chính sách điều hướng (Navigation Policy)
        .with_navigation_handler(move |url_str| {
            if url_str.starts_with("about:") {
                return true;
            }
            if let Ok(url) = Url::parse(&url_str) {
                if PolicyEngine::is_internal_url(&url) {
                    return true;
                }
                let _ = PolicyEngine::sanitize_and_open_external(&url_str);
                return false;
            }
            false
        })
        .with_new_window_req_handler(move |url_str| {
            if let Ok(url) = Url::parse(&url_str) {
                if PolicyEngine::is_internal_url(&url) {
                    return true;
                }
            }
            let _ = PolicyEngine::sanitize_and_open_external(&url_str);
            false
        })
        .build()?;

    log::info!("WebView2 đã khởi tạo thành công!");
    apply_native_cdp_privacy_rules(&webview, config.block.chat_seen, config.block.typing_indicator);
    let webview = Arc::new(webview);

    // Kích hoạt hiển thị cửa sổ và đưa lên tiền cảnh (trừ khi khởi chạy với --tray)
    if !start_in_tray {
        window.set_visible(true);
        window.set_focus();
        restore_window_from_tray(hwnd);
    } else {
        hide_window_to_tray(hwnd);
    }

    // 8. Vòng lặp sự kiện chính (Event Loop)
    log::info!("Bắt đầu chạy event_loop.run...");
    let mut shown_tray_hint = false;

    event_loop.run(move |event, _, control_flow| {
        *control_flow = ControlFlow::Wait;

        match event {
            Event::WindowEvent { event, .. } => match event {
                WindowEvent::CloseRequested => {
                    if config.quit_on_window_close {
                        log::info!("CloseRequested: quit_on_window_close=true -> thoát ứng dụng.");
                        tray.destroy();
                        *control_flow = ControlFlow::Exit;
                    } else {
                        log::info!("CloseRequested: thu gọn xuống khay hệ thống (chạy ngầm như Zalo).");
                        let _ = config.save_atomic();
                        window.set_visible(false);
                        hide_window_to_tray(hwnd);
                        is_window_visible.store(false, Ordering::Relaxed);
                        if !shown_tray_hint {
                            shown_tray_hint = true;
                            tray.show_balloon(
                                "dev by n0trxxan.1112",
                                "Ứng dụng đang chạy ngầm ở khay hệ thống để nhận tin và chống thu hồi.",
                            );
                        }
                    }
                }
                WindowEvent::Resized(size) => {
                    if size.width >= 480 && size.height >= 560 {
                        config.last_window_state.width = size.width;
                        config.last_window_state.height = size.height;
                        let _ = config.save_atomic();
                    }
                }
                _ => {}
            },
            Event::UserEvent(app_event) => match app_event {
                AppEvent::ShowWindow => {
                    log::info!("Khôi phục cửa sổ từ khay hệ thống.");
                    window.set_minimized(false);
                    window.set_visible(true);
                    window.set_focus();
                    restore_window_from_tray(hwnd);
                    is_window_visible.store(true, Ordering::Relaxed);
                }
                AppEvent::ToggleBackgroundMode => {
                    config.quit_on_window_close = !config.quit_on_window_close;
                    sync_state_everywhere(&config, &tray, &webview);
                    log::info!(
                        "Chế độ chạy ngầm khi đóng: {}",
                        !config.quit_on_window_close
                    );
                }
                AppEvent::ToggleAntiRecall => {
                    config.anti_recall_enabled = !config.anti_recall_enabled;
                    sync_state_everywhere(&config, &tray, &webview);
                    log::info!("Chống thu hồi tin nhắn: {}", config.anti_recall_enabled);
                }
                AppEvent::ToggleBlockSeen => {
                    config.block.chat_seen = !config.block.chat_seen;
                    sync_state_everywhere(&config, &tray, &webview);
                    log::info!("Chống xem tin nhắn: {}", config.block.chat_seen);
                }
                AppEvent::ToggleBlockTyping => {
                    config.block.typing_indicator = !config.block.typing_indicator;
                    sync_state_everywhere(&config, &tray, &webview);
                    log::info!("Ẩn trạng thái đang nhập: {}", config.block.typing_indicator);
                }
                AppEvent::ToggleStartup => {
                    let target = !config.run_at_startup;
                    if let Err(e) = set_run_at_startup(target) {
                        log::warn!("Không thể cập nhật khởi động cùng Windows: {}", e);
                    } else {
                        config.run_at_startup = target;
                        sync_state_everywhere(&config, &tray, &webview);
                    }
                }
                AppEvent::SyncAntiRecallToWebview => {
                    sync_state_everywhere(&config, &tray, &webview);
                }
                AppEvent::UpdateAntiRecallFromWebview(enabled) => {
                    config.anti_recall_enabled = enabled;
                    sync_state_everywhere(&config, &tray, &webview);
                }
                AppEvent::UpdateFeatureFromWebview {
                    key,
                    enabled,
                    num_value,
                    str_value,
                } => {
                    match key.as_str() {
                        "anti_recall" => {
                            if let Some(v) = enabled {
                                config.anti_recall_enabled = v;
                            }
                        }
                        "block_seen" => {
                            if let Some(v) = enabled {
                                config.block.chat_seen = v;
                            }
                        }
                        "block_typing" => {
                            if let Some(v) = enabled {
                                config.block.typing_indicator = v;
                            }
                        }
                        "private_mode" => {
                            if let Some(v) = enabled {
                                config.private_mode = v;
                            }
                        }
                        "sidebar_hidden" => {
                            if let Some(v) = enabled {
                                config.sidebar = if v { SidebarMode::Hidden } else { SidebarMode::Default };
                            }
                        }
                        "always_on_top" => {
                            if let Some(v) = enabled {
                                config.always_on_top = v;
                                window.set_always_on_top(v);
                            }
                        }
                        "background_on_close" => {
                            if let Some(v) = enabled {
                                config.quit_on_window_close = !v;
                            }
                        }
                        "run_at_startup" => {
                            if let Some(v) = enabled {
                                if let Err(e) = set_run_at_startup(v) {
                                    log::warn!("Không thể cập nhật khởi động cùng Windows: {}", e);
                                } else {
                                    config.run_at_startup = v;
                                }
                            }
                        }
                        "zoom_factor" => {
                            if let Some(z) = num_value {
                                config.zoom_factor = z.clamp(0.7, 1.6);
                            }
                        }
                        "theme" => {
                            if let Some(ref t) = str_value {
                                config.theme = if t == "light" { Theme::Light } else { Theme::Dark };
                            }
                        }
                        _ => {}
                    }
                    sync_state_everywhere(&config, &tray, &webview);
                }
                AppEvent::ExitApp => {
                    log::info!("Thoát hoàn toàn từ menu khay hệ thống.");
                    let _ = config.save_atomic();
                    tray.destroy();
                    *control_flow = ControlFlow::Exit;
                }
            },
            Event::LoopDestroyed => {
                log::info!("LoopDestroyed nhận được.");
                tray.destroy();
            }
            _ => {}
        }
    });
}
