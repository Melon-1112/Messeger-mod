# Messenger Mod (Caprine Rust Desktop Client)

> **Dev by n0trxxan.1112**

Ứng dụng Messenger Desktop chạy bằng **Rust** thuần túy dành cho **Windows** (sử dụng Microsoft Edge WebView2), tích hợp các tính năng bảo mật riêng tư, chống thu hồi tin nhắn và tối ưu tài nguyên vượt trội so với phiên bản web/electron thông thường.

---

## 1. Cách cài đặt & Khởi chạy

### Yêu cầu hệ thống
* Hệ điều hành: **Windows 10 / 11** (đã tích hợp sẵn Microsoft Edge WebView2 Runtime).
* Cài đặt **Rust** (khuyến nghị phiên bản 1.75 trở lên):
  ```powershell
  winget install Rustlang.Rustup
  # hoặc tải installer từ https://win.rustup.rs/x86_64
  ```

### Các bước cài đặt & chạy:

1. **Clone repository:**
   ```powershell
   git clone https://github.com/Melon-1112/Messeger-mod.git
   cd Messeger-mod
   ```

2. **Khởi chạy ứng dụng:**
   ```powershell
   cargo run --release
   ```

3. **(Tùy chọn) Đóng gói file `.exe` độc lập:**
   ```powershell
   cargo build --release
   ```
   Sau khi hoàn tất, file thực thi sẽ nằm tại đường dẫn:
   `target\release\caprine-rust.exe` (bạn có thể copy ra Desktop hoặc ghim vào Taskbar để mở nhanh bất cứ lúc nào).

---

## 2. Các chức năng trong Menu

### Cách mở Menu
* **Menu điều khiển trong ứng dụng:**
  * Nhấn tổ hợp phím tắt: `Alt + M`
  * Hoặc click vào nút **biểu tượng thanh gạt** ở góc trên cùng bên phải cửa sổ.
* **Menu khay hệ thống (System Tray):**
  * Nhấp chuột phải vào biểu tượng Messenger dưới góc phải thanh Taskbar (gần đồng hồ hệ thống).

---

### Danh sách chức năng Menu

| Chức năng | Phím tắt / Vị trí | Mô tả chi tiết |
| :--- | :--- | :--- |
| 🛡️ **Chống thu hồi (Anti-recall)** | Menu / Tray | Tự động bắt và giữ lại toàn bộ tin nhắn văn bản, ảnh, video, sticker, file và liên kết khi người gửi bấm "Thu hồi với mọi người". Hiển thị nhãn đánh dấu trực quan để bạn đọc lại bất kỳ lúc nào. |
| 👁️ **Chống xem (Block Seen)** | Menu / Tray | Chặn gửi trạng thái "Đã xem" về máy chủ. Bạn đọc tin nhắn thoải mái nhưng đối phương vẫn chỉ thấy trạng thái "Đã nhận". |
| ✍️ **Ẩn đang nhập (Block Typing)** | Menu / Tray | Chặn gửi tín hiệu đang gõ phím. Đối phương sẽ không thấy biểu tượng dấu ba chấm nhấp nháy khi bạn đang soạn tin. |
| 🔒 **Làm mờ riêng tư (Private Mode)** | Menu | Tự động làm mờ nội dung đoạn chat khi dời chuột ra ngoài cửa sổ, tránh bị người khác nhìn trộm màn hình. |
| 📂 **Ẩn danh sách chat (Sidebar Hidden)** | Menu | Thu gọn cột danh sách hội thoại bên trái, giúp giao diện tối giản và tập trung vào khung chat. |
| 📌 **Ghim trên cùng (Always on Top)** | Menu | Giữ cửa sổ Messenger luôn nổi trên các ứng dụng khác khi làm việc đa nhiệm. |
| 🔄 **Chạy ngầm khi đóng (Background on Close)** | Menu / Tray | Bấm nút [X] đóng cửa sổ sẽ thu nhỏ app xuống khay hệ thống (như Zalo / Telegram) thay vì tắt hẳn, duy trì nhận thông báo tin nhắn mới. |
| 🚀 **Khởi động cùng Windows (Run at Startup)** | Tray | Tự động khởi chạy ứng dụng chạy ngầm khi bạn mở máy tính. |
| 🌗 **Giao diện Sáng / Tối (Theme Switch)** | Menu | Chuyển đổi nhanh chóng giữa giao diện Sáng (Light) và Tối (Dark). |
| 🔍 **Thu phóng (Zoom Factor)** | Menu | Tăng giảm kích thước chữ và khung chat (+ / -) hoặc đặt lại 100%. |
| 📊 **Thống kê bảo vệ (Privacy Stats)** | Menu | Hiển thị thời gian thực số lượng gói tin "Đã xem" và "Đang soạn tin" đã được chặn thành công. |
