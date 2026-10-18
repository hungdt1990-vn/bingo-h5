# Game-Specific Rules and Integration Decisions — Bingo Royale HTML5

Tài liệu này là quy ước cụ thể cho trò chơi **Bingo Royale HTML5** (`bingo-h5`) khi tích hợp với HelloBoss Portal (`https://helloboss.online`).

---

## 1. Quy trình phân tích gameplay & Đề xuất quy tắc trừ lượt

### Cơ chế gameplay thực tế của Bingo Royale HTML5:
1. **Bản chất trò chơi**: Bingo Royale là game Bingo thời gian thực 75 bóng đối đầu trực tiếp với 29 Bot đối thủ (tổng 30 người chơi cùng tranh 25 suất giải thưởng).
2. **Tiến trình ván đấu**:
   - Người chơi chọn số lượng vé/thẻ tham gia (1 thẻ, 2 thẻ, hoặc 4 thẻ) tại màn hình START (nút **"ENTER SHOWDOWN"**).
   - Vòng đấu diễn ra theo thời gian thực: Các quả bóng số từ 1 đến 75 lần lượt được gọi ra theo chu kỳ (mặc định 3.5s/bóng).
   - Người chơi bấm chấm số (daub) trên thẻ của mình khi bóng số tương ứng xuất hiện, có thể kích hoạt cơ chế tăng tốc (Quick Reflex combos, Auto-Play, Instant Bingo).
   - Khi hoàn thành đủ 1 đường thẳng (ngang, dọc, hoặc chéo), người chơi bấm **BINGO** để nhận giải và giành 1 suất thưởng trong tổng số 25 giải.
   - Ván đấu kết thúc:
     - **VICTORY**: Người chơi đã claim thành công một suất giải thưởng Bingo trước khi hết giải.
     - **GAME OVER**: Toàn bộ 25 suất giải thưởng đã bị các Bot đối thủ giành hết mà người chơi chưa kịp Bingo.
   - Tại màn hình kết thúc, người chơi có thể bấm **"PLAY AGAIN"** hoặc quay về Menu chính.

---

## 2. Thông tin định danh trò chơi (Game Identity)

- **Tên hiển thị (Display Name)**: `Bingo Royale HTML5`
- **Game ID ổn định (HelloBoss Game ID)**: `bingo-h5`
- **Tên Cloudflare Worker**: `bingo-h5`
- **Cloudflare D1 Database ID**: `8fe346d8-e646-4cad-940b-279014139d14`
- **Database Binding**: `DB`
- **Frontend Framework**: `React 18 + TypeScript + Vite SPA + Tailwind CSS + Lucide Icons`
- **Backend**: `Cloudflare Worker (worker/index.ts) & Express (server.ts cho dev/test)`
- **Cơ sở dữ liệu (Game Database)**: `Cloudflare D1 & SQLite (Zero-Terminal auto-migration)`

---

## 3. Bảng đề xuất quy tắc sử dụng lượt chơi (Turn Policy)

### A. Các trường hợp ĐƯỢC COI LÀ BẮT ĐẦU VÁN MỚI (Tiêu tốn 1 lượt chơi)
> Mỗi trường hợp ở bảng này bắt buộc phải gọi `POST /api/rounds/start` lên Game Backend → Server-to-Server tới HelloBoss Portal. Chỉ khởi tạo ván cờ mới khi nhận được `200 OK`.

| STT | Hành động của người chơi trên giao diện | Trạng thái ván đấu tương ứng | Xử lý khi xác nhận thành công |
|---|---|---|---|
| 1 | Bấm **"ENTER SHOWDOWN"** từ màn hình chính (START SCREEN) | Khởi tạo ván chơi Bingo mới từ đầu | Gửi `idempotencyKey`, trừ 1 lượt trên Portal, lưu `sessionId`, sinh bộ thẻ cờ và bắt đầu quay bóng |
| 2 | Bấm **"PLAY AGAIN"** trên modal VICTORY hoặc GAME OVER | Khởi động lượt chơi Bingo mới sau khi đã kết thúc ván trước | Gửi `idempotencyKey` mới, trừ 1 lượt, đóng modal, tạo thẻ mới và bắt đầu vòng đấu mới |
| 3 | Bấm **"Restart Game"** trong Menu cài đặt In-Game khi đang chơi | Người chơi chủ động hủy ván dở để chơi ván mới | Đánh dấu ván cũ `ABANDONED`, gửi `idempotencyKey` mới, trừ 1 lượt, sinh ván mới |

### B. Các trường hợp ĐƯỢC COI LÀ TIẾP TỤC / MIỄN PHÍ (TUYỆT ĐỐI KHÔNG TRỪ LƯỢT)
> Các trường hợp ở bảng này chỉ cập nhật/phục hồi dữ liệu từ database nội bộ của game. KHÔNG ĐƯỢC gọi API trừ lượt của HelloBoss.

| STT | Hành động của người chơi trên giao diện | Lý do không trừ lượt | Cách xử lý trong code |
|---|---|---|---|
| 1 | Chấm ô số (Daubing) trên thẻ khi bóng số được gọi | Thao tác tương tác chơi tự nhiên trong ván | Xử lý trực tiếp trên frontend, tính điểm combo |
| 2 | Chuyển đổi qua lại giữa các thẻ (Card 1, 2, 3, 4) | Thao tác chuyển tab xem bàn cờ | Không làm thay đổi ván chơi, chỉ đổi UI tab active |
| 3 | Bật / tắt hỗ trợ Auto-Play, Instant Bingo, Auto-Daub | Tính năng bổ trợ trong game | Không thay đổi vòng đời ván |
| 4 | Bấm nút **"BINGO"** để nhận giải khi đủ đường | Hành động nhận kết quả ván đấu hiện tại | Ghi nhận rank, tính điểm thưởng ván hiện tại |
| 5 | Tải lại trang (F5) hoặc kết nối lại khi ván đang dở dang | Tiếp tục ván chơi hiện tại | Khôi phục trạng thái ván từ DB / state mà không trừ lượt |
| 6 | Mất kết nối mạng và request gửi lại (Network Retry) | Retry bảo đảm tính lũy biến (Idempotent) | Tái sử dụng cùng `idempotencyKey`, Portal trả `isRetry: true` không trừ thêm lượt |
| 7 | Bật/tắt nhạc nền (BGM), hiệu ứng âm thanh (SFX), xem modal "How to Play & Rules" | Tương tác cài đặt cá nhân ngoài ván | Lưu vào cấu hình người dùng |
| 8 | Tra cứu số dư lượt chơi hiển thị trên giao diện | Chỉ đọc số dư | Gọi `GET /api/player/turns` (không trừ lượt) |

---

## 4. Định nghĩa hoàn thành ván (Completion Criteria)

- **Khi nào một ván được tính là hoàn thành?**
  - **Thắng cuộc (VICTORY)**: Người chơi claim Bingo hợp lệ thành công và giành được 1 trong 25 suất giải thưởng.
  - **Hết giải (GAME OVER)**: Toàn bộ 25 suất giải thưởng đã được claim hết bởi các Bot đối thủ.
- **Hành động gửi kết quả lên HelloBoss**:
  - Khi ván kết thúc (VICTORY hoặc GAME OVER), Game Backend gọi `POST /api/v1/games/sessions/finish` lên HelloBoss Portal:
    - `sessionId`: Mã session từ lúc `rounds/start`.
    - `userId`: ID người chơi ổn định.
    - `outcome`: `'COMPLETED'`.
    - `metadata`: `{ score, linesClaimed, playerRank, boardCount, durationSeconds }`.
- **Trạng thái lưu trữ**:
  - Cập nhật trạng thái session trong DB game từ `IN_PROGRESS` thành `COMPLETED`.

---

## 5. Quy tắc lưu trữ tiến trình & Database Schema (Cloudflare D1 & SQLite)

- **Các bảng dữ liệu cần tạo (Zero-Terminal Auto-Migration)**:
  1. `player_profiles`:
     - `user_id TEXT PRIMARY KEY NOT NULL`
     - `name TEXT`
     - `best_score INTEGER DEFAULT 0`
     - `total_games_played INTEGER DEFAULT 0`
     - `sound_enabled INTEGER DEFAULT 1`
     - `created_at INTEGER`
     - `updated_at INTEGER`
  2. `game_sessions`:
     - `id TEXT PRIMARY KEY NOT NULL`
     - `user_id TEXT NOT NULL`
     - `session_id TEXT` (từ HelloBoss Portal)
     - `idempotency_key TEXT UNIQUE`
     - `board_count INTEGER DEFAULT 1`
     - `score INTEGER DEFAULT 0`
     - `status TEXT DEFAULT 'IN_PROGRESS'` (IN_PROGRESS, COMPLETED, ABANDONED)
     - `cards_data TEXT` (JSON)
     - `metadata TEXT` (JSON)
     - `created_at INTEGER`
     - `finished_at INTEGER`
  3. `auth_tokens`:
     - `token TEXT PRIMARY KEY NOT NULL`
     - `user_id TEXT NOT NULL`
     - `expires_at INTEGER NOT NULL`
     - `created_at INTEGER NOT NULL`

---

## 6. Tiêu chí nghiệm thu (Acceptance Criteria)

- [x] Đã phân tích gameplay và lập bảng đề xuất quy tắc trừ lượt cho Bingo Royale.
- [ ] Trình đề xuất cho Người dùng (Project Owner) xác nhận.
- [ ] Cập nhật `wrangler.toml` với D1 Database ID `8fe346d8-e646-4cad-940b-279014139d14`.
- [ ] Triển khai Backend Game đầy đủ trên Cloudflare Worker (`worker/index.ts`) và local runtime.
- [ ] Tự động khởi tạo bảng D1 (Zero-Terminal auto-migration với single-line DDL statements).
- [ ] Triển khai Frontend Auth Gate (State A Direct Access, State B Verification Error).
- [ ] Ref-Guarded Pre-Authorization và xử lý modal 402 Insufficient Turns trên UI.
- [ ] Viết bộ test kiểm thử tự động đạt 9/9 kịch bản quy chuẩn.
- [ ] Build và triển khai lên Cloudflare Workers thành công.
