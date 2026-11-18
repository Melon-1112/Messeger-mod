use image::imageops::FilterType;
use std::ffi::OsStr;
use std::os::windows::ffi::OsStrExt;
use std::sync::{mpsc, Arc, Mutex};
use tao::event_loop::EventLoopProxy;
use windows_sys::Win32::Foundation::{
    CloseHandle, GetLastError, ERROR_ALREADY_EXISTS, HWND, LPARAM, LRESULT, POINT, WPARAM,
};
use windows_sys::Win32::Graphics::Gdi::{CreateBitmap, DeleteObject, HBITMAP};
use windows_sys::Win32::System::LibraryLoader::GetModuleHandleW;
use windows_sys::Win32::System::Registry::{
    RegCloseKey, RegDeleteValueW, RegOpenKeyExW, RegQueryValueExW, RegSetValueExW, HKEY,
    HKEY_CURRENT_USER, KEY_READ, KEY_WRITE, REG_SZ,
};
use windows_sys::Win32::System::Threading::CreateMutexW;
use windows_sys::Win32::UI::Shell::{
    Shell_NotifyIconW, NIF_ICON, NIF_INFO, NIF_MESSAGE, NIF_TIP, NIIF_INFO, NIM_ADD, NIM_DELETE,
    NIM_MODIFY, NOTIFYICONDATAW,
};
use windows_sys::Win32::UI::WindowsAndMessaging::{
    AppendMenuW, CreateIconIndirect, CreatePopupMenu, CreateWindowExW, DefWindowProcW,
    DestroyIcon, DestroyMenu, DestroyWindow, DispatchMessageW, FindWindowW, FlashWindowEx,
    GetCursorPos, GetMessageW, GetWindowLongPtrW, KillTimer, PostMessageW, PostQuitMessage,
    RegisterClassW, RegisterWindowMessageW, SetForegroundWindow, SetTimer, SetWindowLongPtrW,
    ShowWindow, TrackPopupMenu, TranslateMessage, FLASHWINFO, FLASHW_TIMERNOFG, FLASHW_TRAY,
    GWLP_USERDATA, HICON, ICONINFO, MF_CHECKED, MF_DEFAULT, MF_GRAYED, MF_SEPARATOR, MF_STRING,
    MF_UNCHECKED, MSG, SW_HIDE, SW_RESTORE, SW_SHOW, TPM_BOTTOMALIGN, TPM_LEFTALIGN, TPM_RETURNCMD,
    TPM_RIGHTBUTTON, WM_CREATE, WM_DESTROY, WM_LBUTTONDBLCLK, WM_LBUTTONUP, WM_RBUTTONUP, WM_TIMER,
    WM_USER, WNDCLASSW,
};

const TRAY_WINDOW_CLASS: &str = "CaprineTrayMsgWindow_n0trxxan";
const TRAY_ICON_ID: u32 = 1001;
const WM_TRAY_CALLBACK: u32 = WM_USER + 101;
const WM_APP_REFRESH_TIP: u32 = WM_USER + 102;
const WM_APP_SHOW_BALLOON: u32 = WM_USER + 103;
const WM_APP_DESTROY_TRAY: u32 = WM_USER + 104;
const WM_APP_WAKE_WINDOW: u32 = WM_USER + 105;
const WM_APP_EXIT_INSTANCE: u32 = WM_USER + 106;

const CMD_OPEN_WINDOW: usize = 2001;
const CMD_TOGGLE_BACKGROUND: usize = 2002;
const CMD_TOGGLE_ANTI_RECALL: usize = 2003;
const CMD_TOGGLE_STARTUP: usize = 2004;
const CMD_EXIT_APP: usize = 2005;
const CMD_TOGGLE_BLOCK_SEEN: usize = 2006;
const CMD_TOGGLE_BLOCK_TYPING: usize = 2007;

const STARTUP_REG_SUBKEY: &str = "Software\\Microsoft\\Windows\\CurrentVersion\\Run";
const STARTUP_REG_VALUE: &str = "CaprineMessengerN0trxxan";

#[derive(Debug, Clone)]
pub enum AppEvent {
    ShowWindow,
    ToggleBackgroundMode,
    ToggleAntiRecall,
    ToggleBlockSeen,
    ToggleBlockTyping,
    ToggleStartup,
    SyncAntiRecallToWebview,
    UpdateAntiRecallFromWebview(bool),
    UpdateFeatureFromWebview {
        key: String,
        enabled: Option<bool>,
        num_value: Option<f64>,
        str_value: Option<String>,
    },
    ExitApp,
}

#[derive(Debug, Clone)]
pub struct TraySharedState {
    pub quit_on_window_close: bool,
    pub anti_recall_enabled: bool,
    pub block_seen: bool,
    pub block_typing: bool,
    pub run_at_startup: bool,
    pub unread_count: usize,
    pub pending_balloon: Option<(String, String)>,
}

pub struct TrayController {
    tray_hwnd: isize,
    state: Arc<Mutex<TraySharedState>>,
}

impl TrayController {
    pub fn update_unread(&self, count: usize) {
        if let Ok(mut guard) = self.state.lock() {
            if guard.unread_count == count {
                return;
            }
            guard.unread_count = count;
        }
        if self.tray_hwnd != 0 {
            unsafe {
                PostMessageW(self.tray_hwnd as HWND, WM_APP_REFRESH_TIP, 0, 0);
            }
        }
    }

    pub fn show_balloon(&self, title: &str, body: &str) {
        if let Ok(mut guard) = self.state.lock() {
            guard.pending_balloon = Some((title.to_string(), body.to_string()));
        }
        if self.tray_hwnd != 0 {
            unsafe {
                PostMessageW(self.tray_hwnd as HWND, WM_APP_SHOW_BALLOON, 0, 0);
            }
        }
    }

    pub fn sync_flags(
        &self,
        quit_on_window_close: bool,
        anti_recall_enabled: bool,
        block_seen: bool,
        block_typing: bool,
        run_at_startup: bool,
    ) {
        if let Ok(mut guard) = self.state.lock() {
            guard.quit_on_window_close = quit_on_window_close;
            guard.anti_recall_enabled = anti_recall_enabled;
            guard.block_seen = block_seen;
            guard.block_typing = block_typing;
            guard.run_at_startup = run_at_startup;
        }
        if self.tray_hwnd != 0 {
            unsafe {
                PostMessageW(self.tray_hwnd as HWND, WM_APP_REFRESH_TIP, 0, 0);
            }
        }
    }

    pub fn destroy(&self) {
        if self.tray_hwnd != 0 {
            unsafe {
                PostMessageW(self.tray_hwnd as HWND, WM_APP_DESTROY_TRAY, 0, 0);
            }
        }
    }
}

struct TrayWindowData {
    proxy: EventLoopProxy<AppEvent>,
    state: Arc<Mutex<TraySharedState>>,
    hicon: HICON,
    taskbar_created_msg: u32,
    icon_added: std::cell::Cell<bool>,
    retry_attempts: std::cell::Cell<u8>,
}

fn to_wide(s: &str) -> Vec<u16> {
    OsStr::new(s).encode_wide().chain(std::iter::once(0)).collect()
}

fn copy_wide_into(buf: &mut [u16], text: &str) {
    buf.fill(0);
    if buf.is_empty() {
        return;
    }
    let max_chars = buf.len() - 1;
    for (dst, ch) in buf.iter_mut().take(max_chars).zip(OsStr::new(text).encode_wide()) {
        *dst = ch;
    }
}

fn create_hicon_from_png(png_bytes: &[u8]) -> HICON {
    let Ok(img) = image::load_from_memory(png_bytes) else {
        return 0;
    };
    let resized = img.resize_exact(32, 32, FilterType::Lanczos3).to_rgba8();
    let (w, h) = resized.dimensions();
    let raw = resized.into_raw();

    // Win32 32bpp bitmap mong đợi thứ tự BGRA
    let mut bgra = Vec::with_capacity(raw.len());
    for px in raw.chunks_exact(4) {
        bgra.push(px[2]);
        bgra.push(px[1]);
        bgra.push(px[0]);
        bgra.push(px[3]);
    }

    let mask_stride = ((w + 15) / 16) * 2;
    let mask_bytes = vec![0u8; (mask_stride * h) as usize];

    unsafe {
        let hbm_color: HBITMAP = CreateBitmap(w as i32, h as i32, 1, 32, bgra.as_ptr() as *const _);
        let hbm_mask: HBITMAP =
            CreateBitmap(w as i32, h as i32, 1, 1, mask_bytes.as_ptr() as *const _);

        let info = ICONINFO {
            fIcon: 1,
            xHotspot: 0,
            yHotspot: 0,
            hbmMask: hbm_mask,
            hbmColor: hbm_color,
        };
        let hicon = CreateIconIndirect(&info);

        if hbm_color != 0 {
            DeleteObject(hbm_color as _);
        }
        if hbm_mask != 0 {
            DeleteObject(hbm_mask as _);
        }
        hicon
    }
}

fn build_notify_icon_data(hwnd: HWND, hicon: HICON, tip: &str) -> NOTIFYICONDATAW {
    let mut nid: NOTIFYICONDATAW = unsafe { std::mem::zeroed() };
    nid.cbSize = std::mem::size_of::<NOTIFYICONDATAW>() as u32;
    nid.hWnd = hwnd;
    nid.uID = TRAY_ICON_ID;
    nid.uFlags = NIF_MESSAGE | NIF_ICON | NIF_TIP;
    nid.uCallbackMessage = WM_TRAY_CALLBACK;
    nid.hIcon = hicon;
    copy_wide_into(&mut nid.szTip, tip);
    nid
}

fn format_tooltip(state: &TraySharedState) -> String {
    if state.unread_count > 0 {
        format!("dev by n0trxxan.1112 ({} tin nhắn chưa đọc)", state.unread_count)
    } else {
        "dev by n0trxxan.1112 - Messenger".to_string()
    }
}

fn show_tray_context_menu(hwnd: HWND, data: &TrayWindowData) {
    unsafe {
        let menu = CreatePopupMenu();
        if menu == 0 {
            return;
        }

        let (background_on, anti_recall_on, block_seen_on, block_typing_on, startup_on) = data
            .state
            .lock()
            .map(|s| {
                (
                    !s.quit_on_window_close,
                    s.anti_recall_enabled,
                    s.block_seen,
                    s.block_typing,
                    s.run_at_startup,
                )
            })
            .unwrap_or((true, true, false, false, false));

        let open_text = to_wide("Mở Messenger");
        AppendMenuW(menu, MF_STRING | MF_DEFAULT, CMD_OPEN_WINDOW, open_text.as_ptr());

        let dev_text = to_wide("⚡ Dev by n0trxxan.1112");
        AppendMenuW(menu, MF_STRING | MF_GRAYED, 0, dev_text.as_ptr());
        AppendMenuW(menu, MF_SEPARATOR, 0, std::ptr::null());

        let bg_text = to_wide("Chạy ngầm khi đóng (như Zalo)");
        AppendMenuW(
            menu,
            MF_STRING | if background_on { MF_CHECKED } else { MF_UNCHECKED },
            CMD_TOGGLE_BACKGROUND,
            bg_text.as_ptr(),
        );

        let recall_text = to_wide("Chống thu hồi tin nhắn");
        AppendMenuW(
            menu,
            MF_STRING | if anti_recall_on { MF_CHECKED } else { MF_UNCHECKED },
            CMD_TOGGLE_ANTI_RECALL,
            recall_text.as_ptr(),
        );

        let seen_text = to_wide("Chống xem tin nhắn (Ẩn Đã xem)");
        AppendMenuW(
            menu,
            MF_STRING | if block_seen_on { MF_CHECKED } else { MF_UNCHECKED },
            CMD_TOGGLE_BLOCK_SEEN,
            seen_text.as_ptr(),
        );

        let typing_text = to_wide("Ẩn trạng thái đang nhập");
        AppendMenuW(
            menu,
            MF_STRING | if block_typing_on { MF_CHECKED } else { MF_UNCHECKED },
            CMD_TOGGLE_BLOCK_TYPING,
            typing_text.as_ptr(),
        );

        let startup_text = to_wide("Khởi động cùng Windows");
        AppendMenuW(
            menu,
            MF_STRING | if startup_on { MF_CHECKED } else { MF_UNCHECKED },
            CMD_TOGGLE_STARTUP,
            startup_text.as_ptr(),
        );

        AppendMenuW(menu, MF_SEPARATOR, 0, std::ptr::null());
        let exit_text = to_wide("Thoát hoàn toàn");
        AppendMenuW(menu, MF_STRING, CMD_EXIT_APP, exit_text.as_ptr());

        let mut pt = POINT { x: 0, y: 0 };
        GetCursorPos(&mut pt);

        // Bắt buộc SetForegroundWindow trước TrackPopupMenu để menu tự đóng khi click ra ngoài
        SetForegroundWindow(hwnd);
        let cmd = TrackPopupMenu(
            menu,
            TPM_LEFTALIGN | TPM_BOTTOMALIGN | TPM_RIGHTBUTTON | TPM_RETURNCMD,
            pt.x,
            pt.y,
            0,
            hwnd,
            std::ptr::null(),
        );
        DestroyMenu(menu);

        match cmd as usize {
            CMD_OPEN_WINDOW => {
                let _ = data.proxy.send_event(AppEvent::ShowWindow);
            }
            CMD_TOGGLE_BACKGROUND => {
                let _ = data.proxy.send_event(AppEvent::ToggleBackgroundMode);
            }
            CMD_TOGGLE_ANTI_RECALL => {
                let _ = data.proxy.send_event(AppEvent::ToggleAntiRecall);
            }
            CMD_TOGGLE_BLOCK_SEEN => {
                let _ = data.proxy.send_event(AppEvent::ToggleBlockSeen);
            }
            CMD_TOGGLE_BLOCK_TYPING => {
                let _ = data.proxy.send_event(AppEvent::ToggleBlockTyping);
            }
            CMD_TOGGLE_STARTUP => {
                let _ = data.proxy.send_event(AppEvent::ToggleStartup);
            }
            CMD_EXIT_APP => {
                let _ = data.proxy.send_event(AppEvent::ExitApp);
            }
            _ => {}
        }
    }
}

unsafe extern "system" fn tray_wnd_proc(
    hwnd: HWND,
    msg: u32,
    wparam: WPARAM,
    lparam: LPARAM,
) -> LRESULT {
    if msg == WM_CREATE {
        let createstruct = lparam as *const windows_sys::Win32::UI::WindowsAndMessaging::CREATESTRUCTW;
        if !createstruct.is_null() {
            SetWindowLongPtrW(hwnd, GWLP_USERDATA, (*createstruct).lpCreateParams as isize);
        }
        return 0;
    }

    let ptr = GetWindowLongPtrW(hwnd, GWLP_USERDATA) as *mut TrayWindowData;
    if ptr.is_null() {
        return DefWindowProcW(hwnd, msg, wparam, lparam);
    }
    let data = &*ptr;

    if data.taskbar_created_msg != 0 && msg == data.taskbar_created_msg {
        let tip = data
            .state
            .lock()
            .map(|s| format_tooltip(&s))
            .unwrap_or_else(|_| "dev by n0trxxan.1112".to_string());
        let nid = build_notify_icon_data(hwnd, data.hicon, &tip);
        let added = Shell_NotifyIconW(NIM_ADD, &nid) != 0;
        data.icon_added.set(added);
        return 0;
    }

    match msg {
        WM_TIMER => {
            if wparam == 1 {
                let attempts = data.retry_attempts.get();
                if data.icon_added.get() || attempts >= 5 {
                    KillTimer(hwnd, 1);
                } else {
                    data.retry_attempts.set(attempts + 1);
                    let tip = data
                        .state
                        .lock()
                        .map(|s| format_tooltip(&s))
                        .unwrap_or_else(|_| "dev by n0trxxan.1112".to_string());
                    let nid = build_notify_icon_data(hwnd, data.hicon, &tip);
                    if Shell_NotifyIconW(NIM_ADD, &nid) != 0 {
                        data.icon_added.set(true);
                        KillTimer(hwnd, 1);
                    }
                }
            }
            0
        }
        WM_TRAY_CALLBACK => {
            let mouse_msg = (lparam as u32) & 0xFFFF;
            match mouse_msg {
                WM_LBUTTONUP | WM_LBUTTONDBLCLK => {
                    let _ = data.proxy.send_event(AppEvent::ShowWindow);
                }
                WM_RBUTTONUP => {
                    show_tray_context_menu(hwnd, data);
                }
                _ => {}
            }
            0
        }
        WM_APP_WAKE_WINDOW => {
            let _ = data.proxy.send_event(AppEvent::ShowWindow);
            0
        }
        WM_APP_EXIT_INSTANCE => {
            let _ = data.proxy.send_event(AppEvent::ExitApp);
            0
        }
        WM_APP_REFRESH_TIP => {
            let tip = data
                .state
                .lock()
                .map(|s| format_tooltip(&s))
                .unwrap_or_else(|_| "dev by n0trxxan.1112".to_string());
            let nid = build_notify_icon_data(hwnd, data.hicon, &tip);
            let cmd = if data.icon_added.get() { NIM_MODIFY } else { NIM_ADD };
            if Shell_NotifyIconW(cmd, &nid) != 0 {
                data.icon_added.set(true);
            }
            0
        }
        WM_APP_SHOW_BALLOON => {
            let (tip, balloon) = if let Ok(mut guard) = data.state.lock() {
                (format_tooltip(&guard), guard.pending_balloon.take())
            } else {
                ("dev by n0trxxan.1112".to_string(), None)
            };
            if let Some((title, body)) = balloon {
                let mut nid = build_notify_icon_data(hwnd, data.hicon, &tip);
                nid.uFlags |= NIF_INFO;
                nid.dwInfoFlags = NIIF_INFO;
                copy_wide_into(&mut nid.szInfoTitle, &title);
                copy_wide_into(&mut nid.szInfo, &body);
                Shell_NotifyIconW(NIM_MODIFY, &nid);
            }
            0
        }
        WM_APP_DESTROY_TRAY => {
            let mut nid = build_notify_icon_data(hwnd, data.hicon, "");
            nid.uFlags = 0;
            Shell_NotifyIconW(NIM_DELETE, &nid);
            DestroyWindow(hwnd);
            0
        }
        WM_DESTROY => {
            let mut nid = build_notify_icon_data(hwnd, data.hicon, "");
            nid.uFlags = 0;
            Shell_NotifyIconW(NIM_DELETE, &nid);
            if data.hicon != 0 {
                DestroyIcon(data.hicon);
            }
            SetWindowLongPtrW(hwnd, GWLP_USERDATA, 0);
            drop(Box::from_raw(ptr));
            PostQuitMessage(0);
            0
        }
        _ => DefWindowProcW(hwnd, msg, wparam, lparam),
    }
}

pub fn spawn_system_tray(
    proxy: EventLoopProxy<AppEvent>,
    initial_state: TraySharedState,
    png_bytes: &'static [u8],
) -> TrayController {
    let state = Arc::new(Mutex::new(initial_state));
    let state_clone = Arc::clone(&state);
    let (tx, rx) = mpsc::sync_channel::<isize>(1);

    std::thread::spawn(move || unsafe {
        let hinstance = GetModuleHandleW(std::ptr::null());
        let class_name = to_wide(TRAY_WINDOW_CLASS);
        let taskbar_msg_name = to_wide("TaskbarCreated");
        let taskbar_created_msg = RegisterWindowMessageW(taskbar_msg_name.as_ptr());

        let wc = WNDCLASSW {
            style: 0,
            lpfnWndProc: Some(tray_wnd_proc),
            cbClsExtra: 0,
            cbWndExtra: 0,
            hInstance: hinstance,
            hIcon: 0,
            hCursor: 0,
            hbrBackground: 0,
            lpszMenuName: std::ptr::null(),
            lpszClassName: class_name.as_ptr(),
        };
        RegisterClassW(&wc);

        let hicon = create_hicon_from_png(png_bytes);
        let tip = state_clone
            .lock()
            .map(|s| format_tooltip(&s))
            .unwrap_or_else(|_| "dev by n0trxxan.1112".to_string());

        let user_data = Box::new(TrayWindowData {
            proxy,
            state: Arc::clone(&state_clone),
            hicon,
            taskbar_created_msg,
            icon_added: std::cell::Cell::new(false),
            retry_attempts: std::cell::Cell::new(0),
        });
        let user_data_ptr = Box::into_raw(user_data);

        let hwnd = CreateWindowExW(
            0,
            class_name.as_ptr(),
            class_name.as_ptr(),
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            hinstance,
            user_data_ptr as *const _,
        );

        if hwnd != 0 {
            let nid = build_notify_icon_data(hwnd, hicon, &tip);
            let added = Shell_NotifyIconW(NIM_ADD, &nid) != 0;
            let ptr = GetWindowLongPtrW(hwnd, GWLP_USERDATA) as *const TrayWindowData;
            if !ptr.is_null() {
                (*ptr).icon_added.set(added);
            }
            if !added {
                // Thử lại nếu Explorer Shell chưa sẵn sàng (ví dụ lúc vừa khởi động Windows)
                SetTimer(hwnd, 1, 2000, None);
            }
            log::info!(
                "System Tray initialized: hwnd=0x{:x}, NIM_ADD={}, hicon=0x{:x}",
                hwnd,
                added,
                hicon
            );
        } else {
            log::error!(
                "Failed to create System Tray window, GetLastError={}",
                GetLastError()
            );
        }

        let _ = tx.send(hwnd as isize);

        if hwnd == 0 {
            return;
        }

        let mut msg: MSG = std::mem::zeroed();
        while GetMessageW(&mut msg, 0, 0, 0) > 0 {
            TranslateMessage(&msg);
            DispatchMessageW(&msg);
        }
    });

    let tray_hwnd = rx.recv().unwrap_or(0);
    TrayController { tray_hwnd, state }
}

pub struct SingleInstanceGuard {
    _handle: isize,
}

impl Drop for SingleInstanceGuard {
    fn drop(&mut self) {
        unsafe {
            if self._handle != 0 {
                CloseHandle(self._handle as _);
                self._handle = 0;
            }
        }
    }
}

fn find_existing_main_window() -> HWND {
    unsafe {
        for title_str in ["dev by n0trxxan.1112", "dev by n0trxxan.1112 - Workplace Chat"] {
            let title = to_wide(title_str);
            let hwnd = FindWindowW(std::ptr::null(), title.as_ptr());
            if hwnd != 0 {
                return hwnd;
            }
        }
        0
    }
}

fn try_wake_existing_desktop_window() -> bool {
    unsafe {
        let tray_class = to_wide(TRAY_WINDOW_CLASS);
        let tray_hwnd = FindWindowW(tray_class.as_ptr(), std::ptr::null());
        let main_hwnd = find_existing_main_window();

        let mut woke = false;
        if main_hwnd != 0 {
            ShowWindow(main_hwnd, SW_SHOW);
            ShowWindow(main_hwnd, SW_RESTORE);
            SetForegroundWindow(main_hwnd);
            woke = true;
        }
        if tray_hwnd != 0 && PostMessageW(tray_hwnd, WM_APP_WAKE_WINDOW, 0, 0) != 0 {
            woke = true;
        }
        woke
    }
}

fn terminate_stale_sibling_processes() {
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x08000000;

    let exe_name = std::env::current_exe()
        .ok()
        .and_then(|p| p.file_name().map(|n| n.to_string_lossy().into_owned()))
        .unwrap_or_else(|| "caprine-rust.exe".to_string());
    let my_pid = std::process::id();

    let _ = std::process::Command::new("taskkill")
        .args([
            "/F",
            "/FI",
            &format!("PID ne {}", my_pid),
            "/IM",
            &exe_name,
        ])
        .creation_flags(CREATE_NO_WINDOW)
        .output();
}

impl SingleInstanceGuard {
    /// Kiểm tra Single Instance bằng Win32 Named Mutex, tự phục hồi nếu tiến trình cũ bị treo hoặc chạy ẩn không có cửa sổ
    pub fn acquire_or_replace(app_id: &str, replace_existing: bool) -> Result<Option<Self>, String> {
        unsafe {
            let wide_name = to_wide(&format!("Local\\{}_SingleInstanceMutex", app_id));

            let handle = CreateMutexW(std::ptr::null(), 1, wide_name.as_ptr());
            if handle == 0 {
                return Err("Failed to create named mutex".to_string());
            }

            if GetLastError() != ERROR_ALREADY_EXISTS {
                return Ok(Some(Self { _handle: handle as isize }));
            }

            // Đóng handle trùng ngay lập tức để phiên bản cũ có thể giải phóng mutex khi thoát
            CloseHandle(handle);

            if !replace_existing {
                if try_wake_existing_desktop_window() {
                    return Ok(None);
                }

                // Chờ ngắn (400ms) phòng trường hợp một tiến trình khác vừa mới khởi chạy đang tạo cửa sổ
                for _ in 0..4 {
                    std::thread::sleep(std::time::Duration::from_millis(100));
                    let retry_handle = CreateMutexW(std::ptr::null(), 1, wide_name.as_ptr());
                    if retry_handle != 0 {
                        if GetLastError() != ERROR_ALREADY_EXISTS {
                            return Ok(Some(Self {
                                _handle: retry_handle as isize,
                            }));
                        }
                        CloseHandle(retry_handle);
                    }
                    if try_wake_existing_desktop_window() {
                        return Ok(None);
                    }
                }
                // Không tìm thấy cửa sổ nào trên Desktop hiện tại (tiến trình cũ bị kẹt hoặc chạy nền cô lập) -> tự dọn dẹp để mở mới
            }

            let tray_class = to_wide(TRAY_WINDOW_CLASS);
            let tray_hwnd = FindWindowW(tray_class.as_ptr(), std::ptr::null());
            if tray_hwnd != 0 {
                PostMessageW(tray_hwnd, WM_APP_EXIT_INSTANCE, 0, 0);
                for _ in 0..12 {
                    std::thread::sleep(std::time::Duration::from_millis(100));
                    let retry_handle = CreateMutexW(std::ptr::null(), 1, wide_name.as_ptr());
                    if retry_handle == 0 {
                        continue;
                    }
                    if GetLastError() != ERROR_ALREADY_EXISTS {
                        return Ok(Some(Self {
                            _handle: retry_handle as isize,
                        }));
                    }
                    CloseHandle(retry_handle);
                }
            }

            // Buộc dừng tiến trình cũ bị treo/ẩn rồi lấy lại Mutex
            terminate_stale_sibling_processes();

            for _ in 0..20 {
                std::thread::sleep(std::time::Duration::from_millis(100));
                let retry_handle = CreateMutexW(std::ptr::null(), 1, wide_name.as_ptr());
                if retry_handle == 0 {
                    continue;
                }
                if GetLastError() != ERROR_ALREADY_EXISTS {
                    return Ok(Some(Self {
                        _handle: retry_handle as isize,
                    }));
                }
                CloseHandle(retry_handle);
            }

            Err("Phiên bản cũ vẫn đang giữ SingleInstanceMutex sau khi dọn dẹp".to_string())
        }
    }

    #[allow(dead_code)]
    pub fn acquire(app_id: &str) -> Result<Self, String> {
        Self::acquire_or_replace(app_id, false)?
            .ok_or_else(|| "Một phiên bản khác đang chạy trên máy này".to_string())
    }
}

/// Ẩn cửa sổ xuống khay hệ thống (Zalo-style)
pub fn hide_window_to_tray(hwnd_ptr: isize) {
    unsafe {
        ShowWindow(hwnd_ptr as HWND, SW_HIDE);
    }
}

/// Khôi phục và đưa cửa sổ lên tiền cảnh từ khay hệ thống
pub fn restore_window_from_tray(hwnd_ptr: isize) {
    unsafe {
        let hwnd = hwnd_ptr as HWND;
        ShowWindow(hwnd, SW_SHOW);
        ShowWindow(hwnd, SW_RESTORE);
        SetForegroundWindow(hwnd);
    }
}

/// Nhấp nháy thanh Taskbar Windows khi có tin nhắn mới
pub fn flash_taskbar(hwnd_ptr: isize) {
    unsafe {
        let mut fwi = FLASHWINFO {
            cbSize: std::mem::size_of::<FLASHWINFO>() as u32,
            hwnd: hwnd_ptr as HWND,
            dwFlags: FLASHW_TRAY | FLASHW_TIMERNOFG,
            uCount: 4,
            dwTimeout: 0,
        };
        FlashWindowEx(&mut fwi);
    }
}

/// Đọc/ghi cấu hình khởi động cùng Windows (HKCU Run)
pub fn set_run_at_startup(enabled: bool) -> Result<(), String> {
    unsafe {
        let subkey = to_wide(STARTUP_REG_SUBKEY);
        let value_name = to_wide(STARTUP_REG_VALUE);
        let mut hkey: HKEY = 0;

        let status = RegOpenKeyExW(HKEY_CURRENT_USER, subkey.as_ptr(), 0, KEY_WRITE, &mut hkey);
        if status != 0 {
            return Err(format!("Không thể mở Registry Run (code {})", status));
        }

        let res = if enabled {
            let exe = std::env::current_exe().map_err(|e| e.to_string())?;
            let cmd = format!("\"{}\" --tray", exe.to_string_lossy());
            let wide_cmd = to_wide(&cmd);
            let byte_len = (wide_cmd.len() * std::mem::size_of::<u16>()) as u32;
            let set_status = RegSetValueExW(
                hkey,
                value_name.as_ptr(),
                0,
                REG_SZ,
                wide_cmd.as_ptr() as *const u8,
                byte_len,
            );
            if set_status == 0 {
                Ok(())
            } else {
                Err(format!("Không thể ghi Registry Run (code {})", set_status))
            }
        } else {
            let del_status = RegDeleteValueW(hkey, value_name.as_ptr());
            // ERROR_FILE_NOT_FOUND = 2 là hợp lệ nếu chưa tồn tại
            if del_status == 0 || del_status == 2 {
                Ok(())
            } else {
                Err(format!("Không thể xóa Registry Run (code {})", del_status))
            }
        };

        RegCloseKey(hkey);
        res
    }
}

pub fn is_run_at_startup_enabled() -> bool {
    unsafe {
        let subkey = to_wide(STARTUP_REG_SUBKEY);
        let value_name = to_wide(STARTUP_REG_VALUE);
        let mut hkey: HKEY = 0;
        if RegOpenKeyExW(HKEY_CURRENT_USER, subkey.as_ptr(), 0, KEY_READ, &mut hkey) != 0 {
            return false;
        }
        let mut value_type: u32 = 0;
        let mut data_size: u32 = 0;
        let status = RegQueryValueExW(
            hkey,
            value_name.as_ptr(),
            std::ptr::null_mut(),
            &mut value_type,
            std::ptr::null_mut(),
            &mut data_size,
        );
        RegCloseKey(hkey);
        status == 0 && data_size > 0
    }
}
