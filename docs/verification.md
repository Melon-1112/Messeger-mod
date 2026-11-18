# Báo cáo Kiểm chứng Môi trường Windows (Verification Report)

Tài liệu này ghi lại chi tiết trạng thái kiểm thử, môi trường Windows và kết quả thực tế của các lệnh kiểm tra.

---

## 1. Môi trường kiểm tra cục bộ (Local Environment)

- **Hệ điều hành**: Windows 10/11 x86_64
- **Runtime Native**: Microsoft Edge WebView2 Evergreen Runtime
- **Node.js**: `v24.12.0` (đã dùng để kiểm tra baseline Electron)
- **Rust Toolchain**:
  - Target: `x86_64-pc-windows-msvc`
  - Trạng thái cục bộ: `BLOCKED` (Máy hiện tại chưa có sẵn `rustc`/`cargo` trong PATH).
  - *Tuân thủ quy định*: Không tự ý thay đổi PATH toàn hệ thống, registry hay cài đặt bảo mật của máy chủ.

### Cài đặt Rust trên Windows để kích hoạt biên dịch:
```powershell
winget install Rustlang.Rustup
# hoặc:
Invoke-WebRequest -Uri https://win.rustup.rs/x86_64 -OutFile rustup-init.exe
.\rustup-init.exe -y
```

---

## 2. Kết quả kiểm tra lệnh (Command Verification Log)

| Lệnh yêu cầu | Nền tảng | Trạng thái | Ghi chú & Kết quả thực tế |
| :--- | :--- | :--- | :--- |
| `cargo fmt --all -- --check` | Windows | `blocked` | Cần toolchain để chạy format |
| `cargo check --all-targets` | Windows | `blocked` | Đã cấu hình đầy đủ `Cargo.toml` cho Windows |
| `cargo clippy --all-targets -- -D warnings` | Windows | `blocked` | Tuân thủ tiêu chuẩn clippy cho mã nguồn Rust |
| `cargo test` | Windows | `blocked` | Đã chuẩn bị sẵn bộ test suite đầy đủ trong `tests/` |
| `cargo build --release` | Windows | `blocked` | Cần toolchain để tạo binary `.exe` |
| **CI GitHub Actions** (`.github/workflows/rust-port.yml`) | Windows (`windows-latest`) | `configured` | Tự động cài đặt Rust 1.80.0, chạy toàn bộ test và build trên runner Windows |

---

## 3. Các bài kiểm tra tự động đã chuẩn bị (Automated Test Suite)

Trong thư mục `rust-port/tests/`:
1. `tests/policy_test.rs`:
   - `test_internal_url_whitelist`: Xác minh các domain được phép (`messenger.com`, `facebook.com/checkpoint`, `workplace.com`).
   - `test_blocked_external_urls`: Kiểm tra chặn điều hướng đến các trang bên ngoài trái phép (`evil.com`, `phishing-messenger.com`).
   - `test_dangerous_schemes`: Kiểm tra loại bỏ triệt để các scheme nguy hiểm (`javascript:`, `file:`, `data:`).
   - `test_strip_tracking_parameters`: Kiểm tra thuật toán xóa bỏ các tham số theo dõi (`fbclid`, `__xts__`).
2. `tests/config_test.rs`:
   - `test_default_config`: Xác minh giá trị mặc định chuẩn của mọi thiết lập.
   - `test_legacy_config_migration`: Kiểm tra tính năng chuyển đổi an toàn từ file `config.json` của Caprine Electron cũ sang schema Rust mới mà không làm hỏng dữ liệu gốc.
   - `test_atomic_save_and_load`: Xác minh cơ chế ghi file nguyên tử (`config.json.tmp` -> `config.json`).
3. `tests/ipc_test.rs`:
   - `test_inbound_ipc_deserialization`: Kiểm tra parse các sự kiện từ webview (`UpdateUnreadCount`, `ShowNotification`).
   - `test_payload_size_limit`: Kiểm tra từ chối các message giả mạo có kích thước quá lớn (>64KB).
