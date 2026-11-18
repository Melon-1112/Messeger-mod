# Hướng dẫn Migration và Rollback cấu hình Caprine

Tài liệu này hướng dẫn cách chuyển dữ liệu cấu hình từ phiên bản cũ (Electron/Caprine) sang phiên bản mới (Rust/Caprine-Rust), cùng quy trình rollback an toàn nếu cần.

---

## 1. Nguyên tắc an toàn dữ liệu

1. **Không sửa đổi hoặc xóa file nguồn của Electron**:
   - File cấu hình gốc của Electron tại `%APPDATA%\Caprine\config.json` (Windows) hoặc `~/Library/Application Support/Caprine/config.json` (macOS) chỉ được đọc ở chế độ **Read-Only**.
2. **Thư mục lưu trữ riêng biệt**:
   - Ứng dụng Rust lưu dữ liệu trong thư mục độc lập:
     - Windows: `%APPDATA%\CaprineRust\config.json`
     - macOS: `~/Library/Application Support/CaprineRust/config.json`
     - Linux: `~/.config/caprine-rust/config.json`
3. **Thao tác ghi tệp nguyên tử (Atomic Write)**:
   - File cấu hình được ghi vào file tạm `config.json.tmp`, sau đó đổi tên thành `config.json` để tránh lỗi hỏng dữ liệu khi máy tính tắt đột ngột.
4. **Idempotent (Khả năng thực hiện nhiều lần)**:
   - Logic migration có thể chạy nhiều lần mà không làm nhân bản hoặc sai lệch giá trị cài đặt.

---

## 2. Bảng ánh xạ Schema (Legacy -> Rust)

| Trường cũ (Caprine Electron) | Trường mới (Caprine Rust) | Logic chuyển đổi |
| :--- | :--- | :--- |
| `theme` | `theme` | Giữ nguyên: `'system'`, `'light'`, hoặc `'dark'`. |
| `darkMode` (cũ) | `theme` | Nếu `darkMode == true` -> `'dark'`; nếu `false` -> `'light'`. |
| `followSystemAppearance` | `theme` | Nếu `true` -> `'system'`. |
| `privateMode` | `private_mode` | Giữ nguyên boolean. |
| `zoomFactor` | `zoom_factor` | Giữ nguyên số thực f64 (clamp trong khoảng 0.5 đến 3.0). |
| `sidebarHidden` (cũ) | `sidebar` | Nếu `true` -> `'hidden'`. |
| `sidebar` | `sidebar` | Giữ nguyên: `'default'`, `'hidden'`, `'narrow'`, `'wide'`. |
| `alwaysOnTop` | `always_on_top` | Giữ nguyên boolean. |
| `showTrayIcon` | `show_tray_icon` | Giữ nguyên boolean. |
| `quitOnWindowClose` | `quit_on_window_close` | Giữ nguyên boolean. |
| `useWorkChat` | `use_work_chat` | Giữ nguyên boolean. |
| `lastWindowState` | `last_window_state` | Kiểm tra tọa độ hợp lệ (width >= 400, height >= 200). |

---

## 3. Quy trình Rollback

Nếu người dùng muốn quay lại phiên bản Electron cũ:
1. Đóng ứng dụng Caprine Rust.
2. Ứng dụng Electron ban đầu vẫn giữ nguyên vẹn toàn bộ session, cookie đăng nhập và file `config.json` trong thư mục `%APPDATA%\Caprine`.
3. Chỉ cần mở lại Caprine Electron; dữ liệu không hề bị ảnh hưởng.
4. Nếu muốn xóa cấu hình phiên bản Rust: Xóa thư mục `%APPDATA%\CaprineRust`.

