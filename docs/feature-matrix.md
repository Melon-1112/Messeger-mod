# Bảng ma trận tính năng chuyển đổi (Feature Matrix)

Quy ước trạng thái:
- `not-started`: Chưa triển khai.
- `implemented`: Đã có mã Rust/JS hoàn chỉnh, sẵn sàng kiểm thử.
- `verified`: Đã có bằng chứng kiểm thử hoạt động thực tế trên nền tảng cụ thể.
- `blocked`: Bị chặn bởi giới hạn engine/nền tảng hoặc thiếu prerequisite.
- `deferred`: Tạm hoãn có chủ đích (đã ghi lý do).

---

| ID | Đường dẫn + Symbol gốc | Hành vi / Default | Nền tảng | Cách thay thế trong Rust Host | Trạng thái | Bằng chứng test | Khoảng trống (Gaps / Notes) |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **CFG-01** | `source/config.ts:theme` | Giao diện: `'system'` \| `'light'` \| `'dark'` (mặc định `'system'`) | Tất cả | `AppConfig::theme`, tiêm CSS dark-mode khi bật | `implemented` | `tests/config_test.rs` | Cần cập nhật động khi OS đổi theme |
| **CFG-02** | `source/config.ts:privateMode` | Bật lớp mờ che nội dung tin nhắn (`false`) | Tất cả | `AppConfig::private_mode`, toggle CSS class `.private-mode` | `implemented` | `tests/config_test.rs` | Chỉ là che UI, không phải incognito mạng |
| **CFG-03** | `source/config.ts:vibrancy` | Hiệu ứng mờ nền (`'none'`) | macOS | `AppConfig::vibrancy`, gọi API NSVisualEffectView qua tao | `implemented` | Code structure ready | Chỉ có hiệu lực trên macOS |
| **CFG-04** | `source/config.ts:zoomFactor` | Tỉ lệ phóng to trang (`1.0`) | Tất cả | `AppConfig::zoom_factor`, `webview.zoom(factor)` | `implemented` | `tests/config_test.rs` | Đã ánh xạ phím tắt Zoom In/Out |
| **CFG-05** | `source/config.ts:lastWindowState` | Lưu kích thước và tọa độ cửa sổ | Tất cả | `WindowState`, khôi phục vị trí hợp lệ trong màn hình | `implemented` | `tests/config_test.rs` | Kiểm tra tránh tọa độ ngoài vùng hiển thị |
| **CFG-06** | `source/config.ts:alwaysOnTop` | Ghim cửa sổ nổi lên trên (`false`) | Tất cả | `Window::set_always_on_top` | `implemented` | `tao::WindowBuilder` | Đã gắn vào toggle menu Window |
| **CFG-07** | `source/config.ts:showTrayIcon` | Hiển thị biểu tượng khay hệ thống (`true`) | Win/Linux | `SystemTrayBuilder` qua `tao` | `implemented` | `src/tray.rs` | Cần fallback thoát app nếu khay lỗi |
| **CFG-08** | `source/config.ts:showUnreadBadge` | Hiển thị số tin nhắn chưa đọc (`true`) | Tất cả | Vẽ badge lên tray icon / taskbar | `implemented` | `src/tray.rs`, `adapter.js` | Windows overlay icon; macOS dock badge |
| **CFG-09** | `source/config.ts:flashWindowOnMessage` | Nhấp nháy thanh taskbar khi có tin nhắn (`true`) | Windows | Win32 API `FlashWindowEx` trong `platform/windows.rs` | `implemented` | `src/platform/windows.rs` | Đã bọc an toàn trong module platform |
| **CFG-10** | `source/config.ts:notificationMessagePreview` | Xem trước nội dung tin nhắn trong thông báo (`true`) | Tất cả | Lọc bỏ `body` trước khi dispatch native notification | `implemented` | `src/ipc.rs` | Đảm bảo quyền riêng tư người dùng |
| **CFG-11** | `source/config.ts:block.chatSeen` | Chặn tín hiệu "Đã xem" (`false`) | Tất cả | Lọc request `change_read_status.php` qua webview filter | `deferred` | Chưa có API chặn mạng độc lập trên wry | WebView2 chưa mở filter header dễ dàng như Chromium |
| **CFG-12** | `source/config.ts:block.typingIndicator` | Chặn "Đang soạn tin nhắn" (`false`) | Tất cả | Lọc request `typ.php` | `deferred` | Chưa có API chặn mạng độc lập trên wry | Cần nghiên cứu custom protocol hook |
| **CFG-13** | `source/config.ts:block.deliveryReceipt` | Chặn xác nhận đã nhận (`false`) | Tất cả | Lọc request `delivery_receipts` | `deferred` | Chưa có API chặn mạng độc lập trên wry | WebView2 chưa có webRequest API tương đương |
| **CFG-14** | `source/config.ts:emojiStyle` | Thay đổi bộ emoji | Tất cả | Rewrite URL ảnh emoji qua protocol handler | `deferred` | Chưa xác minh tương thích webview2 | Tạm giữ emoji mặc định của Facebook |
| **CFG-15** | `source/config.ts:useWorkChat` | Sử dụng Facebook Workplace Chat (`false`) | Tất cả | Đổi target URL thành `work.facebook.com/chat` | `implemented` | `src/config.rs` | Cần tài khoản Workplace để xác minh |
| **CFG-16** | `source/config.ts:sidebar` | Chế độ thanh danh sách chat (`'default'`) | Tất cả | Tiêm CSS toggle class cho sidebar | `implemented` | `webview/styles.css` | Các chế độ: hidden, narrow, wide |
| **CFG-17** | `source/config.ts:autoplayVideos` | Tự động phát video (`true`) | Tất cả | CSS injection `video { pointer-events: none }` | `implemented` | `webview/styles.css` | Tương đương `autoplay.css` gốc |
| **CFG-18** | `source/config.ts:quitOnWindowClose` | Đóng hẳn app khi đóng cửa sổ (`false`) | Tất cả | Nếu `false`, ẩn cửa sổ xuống System Tray | `implemented` | `src/main.rs` | Đảm bảo luôn có lối thoát app qua tray |
| **CFG-19** | `source/config.ts:autoUpdate` | Tự động cập nhật phần mềm (`true`) | Tất cả | Tắt trong dev; kiểm tra chữ ký ở production | `deferred` | Chưa cấu hình repo endpoint | Mặc định tắt để tránh cập nhật sai |
| **NAV-01** | `source/index.ts:will-navigate` | Giới hạn điều hướng nội bộ | Tất cả | `PolicyEngine::is_internal_url` trong `policy.rs` | `implemented` | `tests/policy_test.rs` | Cho phép messenger.com, 2FA checkpoint |
| **NAV-02** | `source/index.ts:setWindowOpenHandler` | Mở liên kết ngoài an toàn | Tất cả | `PolicyEngine::sanitize_and_open_external` | `implemented` | `tests/policy_test.rs` | Khử tracking `fbclid`, chặn `javascript:` |
| **IPC-01** | `source/browser.ts:sendConversationList` | Đếm số tin nhắn chưa đọc | Tất cả | DOM MutationObserver gửi IPC `UpdateUnreadCount` | `implemented` | `webview/adapter.js` | Tách rời, lỗi DOM không làm crash host |
| **IPC-02** | `source/browser.ts:toggle-sidebar` | Ẩn/hiện thanh sidebar bằng shortcut | Tất cả | Host gọi `webview.evaluate_script` kích hoạt DOM | `implemented` | `src/ipc.rs`, `adapter.js` | Hỗ trợ Ctrl+Shift+S / Cmd+Shift+S |
| **MNU-01** | `source/menu.ts:FileMenu` | Menu File (New conversation, Logout, Quit) | Tất cả | `tao::menu::MenuBar` trong `src/menu.rs` | `implemented` | `src/menu.rs` | Đã ánh xạ toàn bộ shortcut chuẩn |
| **MNU-02** | `source/menu.ts:EditMenu` | Menu Edit (Cut, Copy, Paste, Select All) | Tất cả | Menu item chuẩn của hệ điều hành | `implemented` | `src/menu.rs` | Đảm bảo thao tác soạn thảo hoạt động |
| **MNU-03** | `source/menu.ts:ViewMenu` | Menu View (Zoom, Dark Mode, Sidebar, Reload) | Tất cả | Menu tùy chỉnh liên kết IPC Host -> WebView | `implemented` | `src/menu.rs` | Đồng bộ trạng thái checked của menu |
| **MNU-04** | `source/menu.ts:HelpMenu` | Menu trợ giúp và thông tin tác giả | Tất cả | Mở link GitHub an toàn qua browser mặc định | `implemented` | `src/menu.rs` | Tuân thủ MIT attribution |
| **SEC-01** | `source/index.ts:singleInstance` | Chỉ cho phép 1 instance ứng dụng chạy | Windows | Named Mutex Win32 trong `src/platform/windows.rs` | `implemented` | `src/platform/windows.rs` | Kích hoạt focus cửa sổ cũ khi mở lần 2 |
| **SEC-02** | `source/index.ts:nodeIntegration` | Vô hiệu hóa Node Integration | Tất cả | Không dùng Node.js runtime, dùng Wry WebView thuần | `implemented` | `src/main.rs` | Khắc phục hoàn toàn cảnh báo bảo mật cũ |
| **MIG-01** | `source/config.ts:migrations` | Chuyển đổi cấu hình cũ (darkMode, vibrancy...) | Tất cả | `ConfigMigrator::migrate_legacy` trong `config.rs` | `implemented` | `tests/config_test.rs` | Không ghi đè hay làm hỏng file cũ |

