# Task cho Antigravity / Gemini: chuyển Caprine sang Rust

Bạn là kỹ sư chịu trách nhiệm chuyển ứng dụng Caprine trong repository này từ Electron/TypeScript sang desktop host bằng Rust. Hãy triển khai mã chạy được theo từng giai đoạn, kiểm chứng từng phần và tuân thủ các giới hạn bên dưới. Không dừng ở bản đề xuất kiến trúc hoặc skeleton mở trang Messenger rồi tuyên bố đã hoàn thành.

## 1. Bối cảnh đã kiểm tra từ mã nguồn

- `package.json`: Caprine **2.61.0**, MIT, Electron `^29.0.1`, TypeScript `^5.3.3`; entry point là `dist-js`. Đây là thông tin trong snapshot, không phải xác nhận phiên bản mới nhất.
- Đây là ứng dụng desktop bọc Messenger web, không phải implementation của giao thức Messenger. UI trò chuyện, đăng nhập và dữ liệu do website cung cấp.
- `source/index.ts`: vòng đời ứng dụng, single instance, cửa sổ, session/cookie locale, lọc request, CSS injection, điều hướng/popup gọi điện, download, notification, badge và updater.
- `source/browser.ts`: preload, thao tác DOM, theme, privacy mode, sidebar, zoom, shortcuts/actions và cầu nối notification.
- `source/browser/selectors.ts`, `source/browser/conversation-list.ts`: selector DOM, danh sách hội thoại, unread, avatar và notification dựa trên MutationObserver. Có selector class rất dễ lỗi và TODO ngay trong mã.
- `source/config.ts`: schema/default của cấu hình và migration từ `darkMode`, `followSystemAppearance`, `sidebarHidden`, vibrancy cũ. Phải kiểm kê từng key, không chỉ port một vài setting phổ biến.
- `source/menu.ts`, `source/tray.ts`, `source/menu-bar-mode.ts`, `source/touch-bar.ts`, `source/spell-checker.ts`: native menu, shortcut, tray và tích hợp theo nền tảng.
- `source/notifications-isolated.ts`, `source/browser-call.ts`, `source/autoplay.ts`, `source/emoji.ts`: các adapter đặc thù cần đọc trước khi thay thế.
- `css/`, `static/`, `build/`: style và tài nguyên có thể tái sử dụng sau khi kiểm tra giấy phép; `dist-js/` là đầu ra biên dịch, lấy `source/` làm nguồn tham chiếu chính.
- `.github/workflows/tests.yml`: kiểm tra TypeScript/lint/style/rpmspec; chưa thấy bộ test hành vi chuyên dụng trong snapshot đã khảo sát. `.github/workflows/build.yml` có đóng gói và publish: không được tái sử dụng đường publish cũ một cách tự động.
- Những điểm cần xử lý thay vì sao chép nguyên trạng: `nodeIntegration: true`, `@electron/remote`, bridge `postMessage`, điều hướng và mở URL; chặn privacy phụ thuộc endpoint cũ, ringtone phụ thuộc hash cố định, một số chức năng notification/DND có TODO hoặc bị tắt.
- `privateMode` hiện được truyền để bật class CSS; không được gọi nó là incognito, xóa session hay mã hóa dữ liệu nếu không có implementation tương ứng. `keepMeSignedIn` cần đọc hành vi thực tế trong preload, không suy diễn từ tên key.

Khảo sát này là đọc mã tĩnh, chưa xác nhận Messenger hiện tại hoạt động, chưa đăng nhập, chưa chạy ứng dụng và chưa benchmark. Phải tự xác minh lại khi triển khai. Snapshot hiện tại không có `.git` ở workspace; không giả định đã có branch, lịch sử hay baseline diff.

## 2. Mục tiêu và ranh giới ngôn ngữ

1. Desktop host, cấu hình, chính sách điều hướng/quyền, vòng đời, menu/tray và logic nghiệp vụ cục bộ phải chạy bằng Rust.
2. Artifact mới không chạy Electron, Node.js hoặc sidecar JavaScript runtime. Dev tooling chỉ được dùng nếu thật sự cần và được ghi rõ; ưu tiên build Rust không cần npm.
3. Cho phép JavaScript nhỏ, có tổ chức trong webview để đọc/thao tác DOM và bridge, cùng CSS/tài nguyên hiện có. Không đặt toàn bộ logic cũ vào JS rồi thêm một lớp Rust bên ngoài. Không ép DOM sang Rust/WASM khi không có lợi ích được chứng minh.
4. Tiếp tục dùng website Messenger; không tự dựng backend, giao thức chat, lưu lịch sử tin nhắn hoặc thiết kế lại UI trò chuyện.
5. Nhắm tới Windows, macOS và Linux. Windows là nền tảng xác minh cục bộ đầu tiên của workspace này; mọi nền tảng khác phải có trạng thái kiểm chứng riêng.

## 3. Khảo sát và chốt khả thi trước khi port rộng

Đọc source và tài nguyên được liệt kê, sau đó tạo `rust-port/docs/feature-matrix.md` với mỗi chức năng/config/action/menu hiện hữu thành một hàng, có:

`ID | đường dẫn + symbol gốc | hành vi/default | nền tảng | cách thay thế | trạng thái | bằng chứng test | khoảng trống`.

Trạng thái: `not-started`, `implemented`, `verified`, `blocked`, `deferred`. Chỉ dùng `verified` khi có bằng chứng; CI compile không chứng minh hành vi native. Không xem README là bằng chứng rằng tính năng vẫn hoạt động trên Messenger hiện tại.

Trong `rust-port/docs/architecture.md`, so sánh ngắn gọn hướng Tauri và wry/tao hoặc giải pháp Rust tương đương, rồi chọn **một** stack. Đây là các ứng viên để đánh giá, không phải kết luận rằng API của chúng đáp ứng được Electron. Kiểm tra tài liệu chính thức đúng phiên bản trước khi dùng API; ghi link, phiên bản và ngày kiểm tra. Pin Rust toolchain, commit `Cargo.lock`, ghi rõ native prerequisites và MSRV.

Làm một lát cắt chạy thật: mở Messenger → điều hướng đăng nhập/2FA → persistence của profile thử nghiệm → bridge tối thiểu → tray/notification. Xác minh thêm khả năng sau theo từng engine/nền tảng:

- JS injection trước/sau load và qua SPA navigation; context isolation của bridge.
- Đăng nhập/popup, cookie, download/upload, camera/microphone và WebRTC/call popup.
- Request interception/cancel/redirect và khả năng thay header/cookie mà code cũ dùng.
- Notification permission/callback, badge, shortcuts, spellcheck, custom CSS và offline recovery.

Nếu có blocker của engine, ghi reproduction và phương án cụ thể. Tiếp tục phần độc lập; không mở rộng quyền webview, tắt TLS/CSP, thêm proxy giải mã TLS hoặc đưa Electron trở lại để che blocker. Nếu blocker khiến mục tiêu cốt lõi không thể đạt, báo rõ quyết định cần người dùng chốt trước khi đổi kiến trúc/phạm vi.

## 4. Cấu trúc và trình tự thực hiện

Tạo implementation trong `rust-port/`, giữ bản Electron chạy độc lập để đối chiếu. Có thể điều chỉnh cấu trúc sau nếu giải thích trong architecture:

```text
rust-port/
  Cargo.toml
  Cargo.lock
  rust-toolchain.toml
  README.md
  src/                 # Rust host, config, policy, IPC, platform adapters
  webview/             # JS adapter/selector registry và style cần thiết
  tests/               # policy/config tests và fixture đã ẩn dữ liệu
  docs/
    architecture.md
    feature-matrix.md
    migration.md
    verification.md
```

Tài nguyên tái sử dụng phải được bundle thực sự trong artifact; không phụ thuộc đường dẫn tuyệt đối của máy phát triển. Tránh workspace/crate abstraction phức tạp khi chưa cần.

Thực hiện theo thứ tự, mỗi giai đoạn để lại mã build được và cập nhật matrix:

1. **Baseline và khả thi:** kiểm kê source/config/IPC/shortcut, ghi hành vi quan sát được, chọn stack, hoàn thành lát cắt ở phần 3. Nếu chạy baseline gặp lỗi, ghi lỗi và môi trường; không âm thầm sửa bản Electron để làm đẹp kết quả.
2. **Core Rust:** lifecycle/single instance, cửa sổ và state, config có schema version/default/validation, URL policy, offline/error/retry có hủy được. `x/y` chưa đặt phải là giá trị tùy chọn; khôi phục cửa sổ trong vùng màn hình khả dụng. Close-to-tray phải luôn có cách mở lại/thoát, kể cả khi tray không tạo được.
3. **Adapter webview:** selector registry, injection idempotent, theme/sidebar/zoom/custom CSS, thao tác hội thoại và shortcut, upload/download. Tách failure của adapter khỏi host; thiếu selector không làm ứng dụng crash hoặc treo vô hạn.
4. **Native integration và parity:** menu/tray, unread, notification preview/mute/click, autostart, spellcheck, autoplay, emoji, privacy request filtering và call popup/quyền thiết bị. Ánh xạ từng action cũ, không chỉ các mục được nêu ở đây.
5. **Tích hợp nền tảng và phát hành cục bộ:** macOS dock/DND/vibrancy/menu bar/Touch Bar nếu API hỗ trợ, Windows overlay/flash, Linux tray/notification. Kiểm chứng và ghi rõ giới hạn. Tạo CI Rust riêng, build artifact và hướng dẫn cài/chạy/migration/rollback; không publish.

Work Chat, New Room và các đường đi phụ thuộc dịch vụ cũ phải được kiểm tra khả dụng trước khi triển khai sâu. Không tự kết luận dịch vụ còn hoạt động hoặc bỏ tính năng vì đoán rằng nó đã ngừng. Tính năng thiếu API hoặc chưa kiểm thử phải hiện rõ trạng thái; không để setting có thể bật nhưng không có hiệu lực.

## 5. Giới hạn bắt buộc

### Phạm vi thay đổi và dữ liệu

- Chỉ thêm implementation và tài liệu port trong `rust-port/`, task này và CI mới có tên riêng như `.github/workflows/rust-port.yml`. Không sửa/xóa source Electron, lockfile npm, output `dist-js`, workflow publish, hoặc tài nguyên gốc trong giai đoạn song song. Đề xuất riêng việc chuyển entry point/xóa legacy sau khi nghiệm thu parity.
- Không cài/sửa toolchain toàn hệ thống, registry, PATH hay cài đặt bảo mật của máy. Nếu thiếu prerequisite, ghi lệnh cài cần thiết và blocker; dùng môi trường cô lập hoặc công cụ đã có khi có thể.
- Không tự commit, push, tạo tag, publish release, upload binary hoặc dùng endpoint/khoá updater của dự án gốc. Có thể build installer/artifact cục bộ. CI mới không có publish step hay quyền ghi release.
- Dùng app ID và thư mục profile phát triển riêng, tránh ghi đè profile Caprine/Electron. Không đọc profile trình duyệt khác hay tự copy cookie/token. Chấp nhận đăng nhập lại; không hứa cookie Chromium tương thích engine mới.
- Import cấu hình cũ chỉ khi người dùng chủ động chọn: backup, validate, migration idempotent và ghi file mới atomically; tuyệt đối không sửa file nguồn. Test bằng fixture, không đọc profile thật để chạy test.
- Bảo toàn MIT và attribution. Kiểm tra quyền sử dụng tài nguyên bên thứ ba trước khi bundle; không suy ra mọi ảnh/emoji đều có MIT chỉ vì root repo có MIT.

### Bảo mật và quyền riêng tư

- Coi website/iframe và mọi payload JS là không đáng tin. Không expose shell, filesystem, process, HTTP client tổng quát, đọc secret hoặc arbitrary Rust command cho remote content.
- Nếu cần bridge với remote page, chỉ mở các message cụ thể và quyền tối thiểu theo origin, frame và cửa sổ. Rust kiểm tra lại enum/schema/size/range/rate; không dựa vào secret/nonce nằm trong page hay chỉ kiểm tra `event.origin` để coi nội dung là tin cậy.
- Các hành động đặc quyền (mở file, chọn nơi tải, xoá dữ liệu, autostart, thay đường dẫn config) phải đi từ UI tin cậy và API hẹp; nếu có settings UI thì tách quyền khỏi remote webview.
- Parse URL bằng thư viện, kiểm tra scheme/hostname/path theo đúng mục đích. Không kiểm tra bằng `startsWith` trên URL nguyên văn. Phân biệt navigation, resource load, auth redirect và call popup để không phá login hoặc vô tình cấp quyền cho CDN.
- Mở liên kết ngoài bằng API nền tảng sau validate; chặn `javascript:`, URL file và scheme nguy hiểm. Test host giả mạo, userinfo, port, subdomain boundary, encoding, redirect lồng nhau, thiếu tham số `u` và URL sai cú pháp. Giải mã link tracking có giới hạn độ sâu và kiểm tra lại đích.
- Không tắt TLS validation/CSP/sandbox hoặc cấp capability wildcard cho nội dung remote. Camera/mic chỉ cấp theo yêu cầu có origin phù hợp và sự đồng ý của người dùng; không tự click nút bắt đầu cuộc gọi như preload cũ.
- Không log nội dung hội thoại, mật khẩu, cookie, access token, full URL có tham số nhạy cảm hay dữ liệu cá nhân. Không thêm analytics, quảng cáo, remote code hoặc CDN script mới cho code của ứng dụng.
- Notification/body/icon/unread là dữ liệu không tin cậy: giới hạn kích thước, count và tần suất; tránh notification trùng giữa DOM observer và Web Notification. Không fetch icon URL tùy ý qua Rust khiến bridge thành HTTP proxy.
- Privacy request blockers chỉ được ghi là hiệu quả khi có test quan sát request đúng nền tảng/engine; không hứa chặn seen/typing/delivery chỉ vì match chuỗi endpoint cũ. Không suy diễn privacy mode che UI thành bảo vệ mạng/session.
- Updater mới mặc định tắt cho bản phát triển. Nếu triển khai, chỉ dùng update đã xác minh chữ ký và endpoint do chủ repo cấu hình; thiếu hạ tầng thì ghi chưa hỗ trợ. Không mang theo `verifyUpdateCodeSignature: false`.

### Chất lượng và tính trung thực

- Không invent API, dependency version hay kết quả chạy. Ưu tiên dependency được duy trì, giấy phép phù hợp và ít dependency trực tiếp; mỗi native/plugin dependency phải có lý do.
- Không thêm backend/service, framework frontend lớn hoặc rewrite UI nếu không cần cho parity. Không tự ý giảm mục tiêu thành Windows-only hoặc “chỉ mở messenger.com”.
- Không dùng `unsafe` trừ adapter native bắt buộc; cô lập, ghi invariant/lý do và có kiểm tra phù hợp. Không `unwrap/expect` với dữ liệu config, network, DOM hoặc IPC có thể lỗi.
- Mọi DOM wait phải có timeout/hủy và fallback; observer/listener phải được cleanup và chống đăng ký lặp sau reload/SPA. Không polling bận, không vòng retry vô hạn không hủy, không chặn UI thread bằng I/O.
- Không đặt ngưỡng dòng code hoặc ép “100% Rust” khiến chất lượng giảm. Mọi phần JS còn lại phải giải thích vai trò; không chép logic host sang JS để né yêu cầu Rust.
- Không tuyên bố nhẹ hơn/nhanh hơn bằng suy đoán. Benchmark nếu thực hiện phải so cùng máy, account/profile thử nghiệm, trang/trạng thái và thời gian ổn định; tính cả tiến trình con webview, ghi phương pháp và kết quả thô. Không có baseline thì ghi chưa so sánh.
- Không dùng placeholder/no-op/TODO để đánh dấu chức năng hoàn thành. Không sửa test cho qua hoặc tắt lint toàn dự án để che lỗi. Không đặt hạn mức thời gian/token rồi tự xem phần còn lại là hoàn thành.

## 6. Kiểm tra và tiêu chí nghiệm thu

Chạy từ `rust-port/`, sửa lỗi do thay đổi mới gây ra và ghi command, môi trường, kết quả thật trong `docs/verification.md`:

```sh
cargo fmt --all -- --check
cargo check --locked --all-targets
cargo clippy --locked --all-targets -- -D warnings
cargo test --locked
cargo build --locked --release
```

Nếu stack cần thêm lệnh bundle hoặc feature flags, ghi và chạy đúng lệnh tương ứng. Build không chứng minh bundle chứa đủ resource; thử chạy artifact đóng gói ngoài thư mục source. Thêm CI cho cả ba OS với prerequisite phù hợp. Phân biệt `not-run`, `passed`, `failed`, `blocked`; không báo macOS/Linux đã kiểm chứng chỉ vì viết `cfg` hoặc chưa nhận kết quả CI.

Test tự động tối thiểu phải bao phủ các ranh giới dễ mất dữ liệu hoặc cấp quyền:

- Config thiếu/sai kiểu/corrupt, schema migration cũ, import lặp, backup và lỗi ghi; không ghi đè nguồn.
- URL allow/deny, auth exceptions, strip tracking, redirect đích nguy hiểm và payload IPC giả mạo/quá lớn/sai frame hoặc origin.
- Chuyển trạng thái close/hide/quit/second-instance/tray failure; restore window ngoài màn hình; không mất đường mở lại app.
- Fixture DOM cho thiếu selector, thay DOM, unread/notification dedup, timeout và reload nhiều lần không nhân observer. Fixture phải ẩn danh, không commit session hoặc dữ liệu người dùng.
- Request blocker được hỗ trợ phải có test ở lớp interception thực, không chỉ unit test hàm match URL. Chức năng không có API phải ghi unsupported theo nền tảng.

Checklist thủ công, dùng tài khoản thử nghiệm khi có quyền truy cập: login/2FA, reload/restart và session persistence, logout; offline/reconnect; gửi/nhận/đính kèm/tải file; external link và popup; theme/system appearance/custom CSS/sidebar/zoom; shortcuts; unread/badge; notification khi focus/background/mute/ẩn preview/click; close-to-tray/single-instance; gọi điện và từ chối/cấp quyền camera/mic; các mục native theo OS. Không tự đăng nhập hoặc gửi tin nhắn bằng tài khoản thật. Nếu chưa có tài khoản/môi trường, chuẩn bị checklist và ghi phần live chưa xác minh.

Được công nhận **hoàn thành chuyển đổi** khi:

1. Artifact Rust chạy độc lập không cần Electron/Node và có hướng dẫn build/bundle tái lập.
2. Tất cả feature/config/action trong matrix đã có implementation và bằng chứng xác minh trên nền tảng áp dụng, hoặc ngoại lệ đã được người dùng chấp thuận rõ ràng. Không tự chấp thuận ngoại lệ.
3. Không còn blocker chưa giải quyết ở luồng cốt lõi; privacy không có trạng thái thành công giả và dữ liệu cũ được bảo toàn.
4. Các kiểm tra phù hợp đã qua, trạng thái từng OS minh bạch, migration/rollback và giới hạn được tài liệu hóa.

MVP/lát cắt có thể được báo là mốc tiến độ; không được báo là đã port toàn bộ. Nếu bị chặn bởi dịch vụ/tài khoản/API, bàn giao phần chạy được cùng reproduction và công việc còn lại, giữ trạng thái task chưa hoàn thành.

## 7. Cách làm việc và bàn giao

Bắt đầu bằng khảo sát source tại chỗ và báo ngắn stack dự định, rủi ro cùng lát cắt đầu tiên; sau đó triển khai phần đã đủ thông tin mà không hỏi lại các lựa chọn kỹ thuật thông thường. Chỉ hỏi khi cần thay mục tiêu, chấp nhận mất chức năng, truy cập tài khoản/quyền mới hoặc thực hiện hành động vượt giới hạn task.

Cập nhật `feature-matrix.md` và checklist sau mỗi mốc để có thể tiếp tục qua nhiều phiên. Trước khi kết thúc, báo: phần đã chạy, đường dẫn thay đổi, lệnh/kết quả kiểm tra, trạng thái từng nền tảng, giới hạn chưa giải quyết và bước tiếp theo cụ thể. Không dùng “hoàn thành” cho phần chưa kiểm chứng.
