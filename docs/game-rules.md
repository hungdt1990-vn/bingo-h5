# Game-Specific Rules and Integration Decisions — Clean Blox HTML5

Tài liệu này là quy ước cụ thể cho trò chơi **Clean Blox HTML5** khi tích hợp với HelloBoss Portal (`https://helloboss.online`).

---

## 1. Quy trình phân tích gameplay & Đề xuất quy tắc trừ lượt

### Cơ chế gameplay thực tế của Clean Blox HTML5:
1. **Bản chất trò chơi**: Clean Blox là trò chơi giải đố xếp hình khối dạng điểm cao vô tận (endless block puzzle).
2. **Tiến trình ván đấu**:
   - Ván chơi bắt đầu với một bàn cờ trống (kích thước mặc định 6x6 hoặc chế độ 8x8) và 3 khối hình học ngẫu nhiên trong khay dưới đáy.
   - Người chơi lần lượt kéo/thả các khối vào các ô trống trên bàn cờ.
   - Khi hoàn thành 1 hoặc nhiều hàng/cột, các đường này sẽ bị phá hủy, cộng điểm và giải phóng không gian bàn cờ.
   - Khi đặt hết 3 khối trong khay, hệ thống sẽ tự động nạp tiếp 3 khối mới (trong cùng một ván chơi).
   - Ván chơi kết thúc (**Game Over**) khi tất cả các khối còn lại trong khay không thể đặt vừa vào bất kỳ vị trí nào trên bàn cờ.

---

## 2. Thông tin định danh trò chơi (Game Identity)

- **Tên hiển thị (Display Name)**: `Clean Blox HTML5`
- **Game ID ổn định (HelloBoss Game ID)**: `cleanblox`
- **Môi trường triển khai (Deployment target)**: `Node.js (Express / SQLite) & Cloudflare Workers (D1)`
- **Frontend Framework**: `React 19 + TypeScript + Vite SPA + Tailwind CSS`
- **Backend**: `Express (server.ts) & Cloudflare Worker (worker/index.ts)`
- **Cơ sở dữ liệu (Game Database)**: `SQLite (node:sqlite / better-sqlite3) & Cloudflare D1` (Zero-Terminal auto-migration)

---

## 3. Bảng đề xuất quy tắc sử dụng lượt chơi (Turn Policy)

### A. Các trường hợp ĐƯỢC COI LÀ BẮT ĐẦU VÁN MỚI (Tiêu tốn 1 lượt chơi)
> Mỗi trường hợp ở bảng này bắt buộc phải gọi `POST /api/rounds/start` lên Game Backend → Server-to-Server tới HelloBoss Portal. Chỉ khởi tạo bàn cờ mới khi nhận được `200 OK`.

| STT | Hành động của người chơi trên giao diện | Trạng thái ván đấu tương ứng | Xử lý khi xác nhận thành công |
|---|---|---|---|
| 1 | Bấm **"Chơi ngay" / "Bắt đầu ván mới"** từ màn hình chính khi chưa có ván dở | Khởi tạo ván chơi mới từ đầu | Trừ 1 lượt, lưu session ID từ HelloBoss, sinh bàn cờ trống và 3 khối mới |
| 2 | Bấm **"PLAY AGAIN"** trên modal Game Over | Khởi động lượt chơi mới sau khi đã thua | Trừ 1 lượt, đóng modal Game Over, sinh bàn cờ mới |
| 3 | Bấm **nút Restart (Làm lại)** trên thanh công cụ Header khi đang chơi | Người chơi chủ động hủy ván dở để chơi ván mới | Đánh dấu ván cũ `ABANDONED`, trừ 1 lượt, sinh bàn cờ mới |
| 4 | Bấm **chuyển đổi kích thước bàn cờ** (6x6 ↔ 8x8) | Đổi chế độ chơi và reset bàn cờ mới | Đánh dấu ván cũ `ABANDONED`, trừ 1 lượt, tạo bàn cờ theo kích thước mới |

### B. Các trường hợp ĐƯỢC COI LÀ TIẾP TỤC (TUYỆT ĐỐI KHÔNG TRỪ LƯỢT)
> Các trường hợp ở bảng này chỉ cập nhật/phục hồi dữ liệu từ database nội bộ của game. KHÔNG ĐƯỢC gọi API trừ lượt của HelloBoss.

| STT | Hành động của người chơi trên giao diện | Lý do không trừ lượt | Cách xử lý trong code |
|---|---|---|---|
| 1 | Kéo và đặt từng khối hình từ khay lên bảng cờ | Thao tác tương tác bình thường trong ván đấu | Cập nhật bàn cờ và lưu tiến trình vào DB nội bộ |
| 2 | Nạp thêm 3 khối mới vào khay khi đã xếp hết 3 khối cũ | Vòng lặp cơ chế tự nhiên của ván chơi hiện tại | Sinh 3 khối mới trong cùng session ID của ván |
| 3 | F5 / Tải lại trình duyệt hoặc đóng tab mở lại | Tiếp tục ván cờ dở dang chưa Game Over | Tải lại bàn cờ, khay khối và điểm số từ DB theo `userId` |
| 4 | Bấm "Tiếp tục chơi" khi phát hiện có ván dở | Tiếp tục ván đấu đang diễn ra | Mở lại bàn cờ và cho phép đặt tiếp các khối |
| 5 | Mất kết nối mạng và request gửi lại (Network Retry) | Retry bảo đảm tính lũy biến (Idempotent) | Tái sử dụng cùng `idempotencyKey`, Portal trả `isRetry: true` |
| 6 | Bật/tắt âm thanh (Mute/Unmute), xem modal Hướng dẫn (How to Play) | Tương tác giao diện phi ván chơi | Lưu vào `localStorage` hoặc settings người dùng |
| 7 | Tra cứu số dư lượt chơi hiển thị trên giao diện | Chỉ đọc số dư hiện có | Gọi `GET /api/player/turns` (không trừ lượt) |

---

## 4. Định nghĩa hoàn thành ván (Completion Criteria)

- **Khi nào một ván được tính là hoàn thành?**
  - Khi không còn bất kỳ khối nào trong khay dưới đáy có thể đặt vừa vào bất kỳ vị trí trống nào trên bàn cờ hiện tại (**Game Over**).
- **Hành động gửi kết quả lên HelloBoss**:
  - Khi Game Over, Game Backend gọi `POST /api/v1/games/sessions/finish` gửi lên HelloBoss Portal:
    - `sessionId`: Mã session từ lúc `rounds/start`.
    - `userId`: ID người chơi ổn định.
    - `outcome`: `'COMPLETED'`.
    - `metadata`: `{ score, bestScore, linesCleared, comboMax, durationSeconds }`.
- **Trạng thái lưu trữ**:
  - Cập nhật trạng thái session trong DB game từ `IN_PROGRESS` thành `COMPLETED`.

---

## 5. Quy tắc lưu trữ tiến trình (Persistence Policy)

- **Các trường dữ liệu cần lưu cho mỗi người chơi**:
  - `player_profiles`: `user_id` (khóa chính), `best_score`, `total_games_played`, `sound_enabled`, `updated_at`.
  - `game_sessions`: `id`, `user_id`, `session_id`, `idempotency_key`, `grid_size`, `board_state` (JSON), `tray_state` (JSON), `score`, `combo_streak`, `status` (`IN_PROGRESS`, `COMPLETED`, `ABANDONED`), `started_at`, `finished_at`.
- **Ràng buộc an toàn người dùng**:
  - Mọi thao tác truy vấn và ghi đều được lọc nghiêm ngặt theo `user_id` giải mã từ session token xác thực Server-to-Server.
- **Xử lý ván dở dang khi vào game**:
  - Khi người chơi mở game và đã xác thực, game kiểm tra xem có bản ghi session `IN_PROGRESS` gần nhất hay không. Nếu có, tự động nạp lại bàn cờ và cho chơi tiếp miễn phí mà không trừ lượt.

---

## 6. Tiêu chí nghiệm thu (Acceptance Criteria)

- [x] Đã phân tích gameplay và lập bảng đề xuất quy tắc trừ lượt.
- [ ] Trình đề xuất cho Người dùng (Project Owner) xác nhận trước khi code.
- [ ] Truy cập URL trực tiếp không có session hiển thị Auth Gate điều hướng về `https://helloboss.online`.
- [ ] Bắt đầu ván mới trừ đúng 1 lượt qua HelloBoss Portal (`POST /api/rounds/start`).
- [ ] Hết lượt chơi (`402 INSUFFICIENT_TURNS`): hiển thị modal thông báo hết lượt và ngăn tạo bàn cờ mới.
- [ ] F5, đặt khối trong ván, nạp khay khối không làm giảm thêm lượt chơi.
- [ ] Gửi lại request timeout với cùng `idempotencyKey` không bị trừ lượt lần hai.
- [ ] Tiến trình và điểm số được lưu bền vững vào DB khi tải lại trang.
- [ ] Không rò rỉ bất kỳ thông tin nhạy cảm (`X-Game-Key`, `HELLOBOSS_GAME_KEY`) ra client.
- [ ] Bộ kiểm thử tự động của game vượt qua 100%.
