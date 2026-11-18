# Caprine (Rust Desktop Host cho Windows)

Ứng dụng Caprine chạy bằng **Rust** thuần túy dành riêng cho **Windows**, sử dụng `tao` (Windowing, Native Menu & System Tray) và `wry` (Microsoft Edge WebView2).

---

## 1. Ưu điểm kiến trúc trên Windows

* **100% Rust & WebView2 Native**: Sử dụng runtime WebView2 có sẵn trong Windows 10/11, không cần nhúng kèm hàng trăm MB mã nguồn Chromium của Electron.
* **Tối ưu bộ nhớ**: Tiết kiệm RAM đáng kể so với bản Electron cũ.
* **Bảo mật**:
  * Loại bỏ hoàn toàn cảnh báo Node.js Remote Content Injection.
  * Tự động khử mã theo dõi (`fbclid`) khi mở liên kết ngoài.
  * Win32 Named Mutex ngăn chặn triệt để xung đột Single Instance (`ERROR_SHARING_VIOLATION`).
  * Win32 `FlashWindowEx` nhấp nháy thanh taskbar khi có tin nhắn mới.

---

## 2. Cấu trúc thư mục

```text
├── Cargo.toml               # Cấu hình dependency cho Windows
├── rust-toolchain.toml      # Pin toolchain x86_64-pc-windows-msvc (1.80.0)
├── README.md                # Tài liệu này
├── src/
│   ├── main.rs              # Điểm vào chính, khởi tạo cửa sổ và event loop
│   ├── lib.rs               # Library export cho test suite
│   ├── config.rs            # Quản lý cấu hình, ghi nguyên tử vào %APPDATA%\CaprineRust
│   ├── policy.rs            # Chính sách URL, kiểm tra điều hướng, khử tracking
│   ├── ipc.rs               # Giao tiếp IPC typed Host <-> WebView2
│   ├── menu.rs              # Menu ứng dụng Windows (Tệp, Chỉnh sửa, Hiển thị, Trợ giúp)
│   ├── tray.rs              # Biểu tượng và menu ở khay hệ thống (System Tray)
│   └── platform/
│       └── windows.rs       # Win32 Named Mutex và FlashWindowEx
├── webview/
│   ├── adapter.js           # Script tiêm: MutationObserver, Unread Count
│   └── styles.css           # CSS tiêm: Dark Mode, Private Mode, Code Blocks
├── tests/
│   ├── policy_test.rs       # Test whitelist URL, khử tracking, chặn scheme nguy hiểm
│   ├── config_test.rs       # Test giá trị mặc định, migration từ Electron cũ
│   ├── ipc_test.rs          # Test giải mã IPC, từ chối payload quá tải
│   └── fixtures/            # Dữ liệu mẫu cấu hình cũ
└── docs/
    ├── architecture.md      # Kiến trúc hệ thống Windows
    ├── feature-matrix.md    # Ma trận tính năng đối soát
    ├── migration.md         # Hướng dẫn chuyển đổi cấu hình an toàn
    └── verification.md      # Báo cáo kiểm chứng môi trường
```

---

## 3. Hướng dẫn xây dựng và kiểm thử trên Windows

### Cài đặt Rust (Yêu cầu MSRV 1.75+)
```powershell
winget install Rustlang.Rustup
# hoặc tải trình cài đặt từ https://win.rustup.rs/x86_64
```

### Chạy kiểm tra:
```powershell
cargo fmt --all -- --check
cargo check --all-targets
cargo clippy --all-targets -- -D warnings
cargo test
```

### Khởi chạy ứng dụng:
```powershell
cargo run --release
```
