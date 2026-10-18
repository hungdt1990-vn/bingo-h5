# HelloBoss Game API Contract

**Status: AUTHORITATIVE & IMPLEMENTED CONTRACT (v1.0)**

Tài liệu này là đặc tả chính thức của Portal **HelloBoss (`helloboss.online`)** dành cho các nhà phát triển và các **AI Agent phát triển game HTML5** (như Sudoku Boss, Caro Boss,...). Mọi endpoint, định dạng dữ liệu, quy tắc bảo mật và mã lỗi dưới đây đều đã được hiện thực và kiểm thử trong mã nguồn của Portal.

---

## 1. Nguyên tắc cốt lõi & Ranh giới bảo mật

1. **HelloBoss là nguồn sự thật duy nhất (Source of Truth)** về danh tính người dùng, số dư lượt chơi khả dụng, sổ cái giao dịch và cấp phép bắt đầu ván chơi.
2. **Không tin tưởng Frontend**: Client game (trình duyệt, webview) không bao giờ được tin cậy để cung cấp ID người chơi, số dư hoặc quyền chơi. Mọi giao dịch trừ lượt và xác minh danh tính phải được thực hiện thông qua **Server-to-Server** giữa Backend của Game và Backend của HelloBoss Portal.
3. **Quy tắc Chuẩn hóa Slug (Contract Slug Normalization)**: Tên định danh game trên Portal (`gameId`) và biến môi trường `HELLOBOSS_GAME_ID` trong game **bắt buộc dùng định dạng lowercase `kebab-case` thống nhất** (chỉ gồm chữ cái viết thường và dấu gạch ngang, ví dụ: `sudoku`, `clean-blox`, `caro-boss`). Tuyệt đối không dùng dấu gạch dưới `_`, chữ in hoa hay `camelCase`.
4. **Kiến trúc Dual-Authentication (Hybrid) chống chặn Cookie**:
   - Backend Game cấp cả cookie `SameSite=None; Secure; Partitioned` VÀ trường `token` trong JSON response body.
   - Frontend Game bắt buộc lưu `token` vào `localStorage` và luôn gửi kèm header `Authorization: Bearer <token>` trên 100% request API.
   - Backend Game kiểm tra `Authorization: Bearer` trước, nếu không có mới fallback kiểm tra Cookie. Quy tắc này đảm bảo xác thực chạy thông suốt trong iFrame nhúng, Safari ITP và Mobile In-App WebView.
5. **Chống trừ lượt trùng (Idempotency)**: Mỗi ván chơi mới do người chơi chủ động khởi tạo phải có một `idempotencyKey` duy nhất. Mọi request gửi lại do lỗi mạng hoặc timeout phải giữ nguyên `idempotencyKey` cũ để không bị trừ lượt lần hai.
6. **Không trừ lượt khi tiếp tục ván cũ**: Khi người chơi thoát giữa chừng và quay lại, hoặc khi game gặp lỗi khởi tạo giao diện và thử lại, game tự quản lý tiến trình nội bộ và không được gọi API trừ lượt mới.

---

## 2. Định danh người chơi (Player Identity)

| Thuộc tính | Chi tiết trong Database Cloudflare D1 của HelloBoss |
|---|---|
| **Tên trường** | `"id"` (trong bảng `"user"`) |
| **Kiểu dữ liệu** | `TEXT PRIMARY KEY NOT NULL` (chuỗi ký tự UUID / CUID, ví dụ: `"cm7ab12x0001..."`) |
| **Tính ổn định** | **Bất biến (Immutable)**: Được Better Auth khởi tạo ngay khi người dùng đăng nhập bằng Google hoặc Facebook lần đầu tiên. ID này không bao giờ thay đổi trong suốt vòng đời tài khoản, kể cả khi người dùng đổi tên hiển thị, ảnh đại diện hay cập nhật thông tin cá nhân. |
| **Cách game sử dụng** | Game Backend dùng trường `id` này làm khóa ngoại (`userId` / `player_id`) trong cơ sở dữ liệu riêng của game để lưu tiến trình ván đấu, điểm số, bảng xếp hạng và trạng thái chưa hoàn thành. |

---

## 3. Luồng mở game & Cấp mã khởi chạy (Launch Code & Player Verification)

### Quy trình xác thực danh tính đáng tin cậy:
```
[Player Browser]           [HelloBoss Portal]             [Game Frontend]            [Game Backend]
       |                           |                             |                          |
       |--- 1. Click "Chơi ngay" ->|                             |                          |
       |    (POST launch-code)     |                             |                          |
       |                           |-- 2. Sinh mã hlc_... ------>|                          |
       |                           |   (Hạn 5 phút, 1 lần dùng)  |                          |
       |                           |                             |                          |
       |                           |-- 3. Mở URL game kèm ?code=hlc_...                     |
       |                           |---------------------------->|                          |
       |                                                         |-- 4. Gửi code lên server |
       |                                                         |------------------------->|
       |                                                                                    |
       |                                                         |--- 5. Server-to-Server ->|
       |                                                         |    POST /verify-player   |
       |                                                         |    Header: Game Secret   |
       |                                                         |    Body: { launchCode }  |
       |                                                         |                          |
       |                                                         |<-- 6. Trả về player.id --|
       |                                                         |    đáng tin cậy & lượt   |
```

### Chi tiết các API trong luồng mở game:

#### A. Cấp mã khởi chạy (Player -> Portal)
- **Endpoint**: `POST /api/v1/games/launch-code`
- **Xác thực**: Phiên đăng nhập người chơi (Cookie Better Auth hoặc `Authorization: Bearer <sessionToken>`)
- **Request Body**:
  ```json
  {
    "gameId": "sudoku"
  }
  ```
- **Response thành công (`200 OK`)**:
  ```json
  {
    "success": true,
    "launchCode": "hlc_a9f81bc458e04b1298d0ef9213456789",
    "expiresAt": 1773000300000
  }
  ```
- **Quy tắc**:
  - Mã có tiền tố `hlc_`, tồn tại đúng **5 phút** (`expiresAt`).
  - Được ràng buộc với người chơi đang đăng nhập và đúng `gameId`.

#### B. Xác minh người chơi (Game Backend -> Portal)
Game Backend nhận mã từ query URL của client (`?code=hlc_...`), sau đó gửi request trực tiếp từ máy chủ Game sang Portal:

> **Quy tắc làm sạch URL trên Frontend (Bắt buộc)**:
> Ngay khi Game Frontend đọc được tham số `?code=hlc_...`, frontend **phải lập tức xóa tham số này khỏi thanh địa chỉ** bằng lệnh:
> ```js
> const url = new URL(window.location.href);
> url.searchParams.delete('code');
> window.history.replaceState({}, document.title, url.toString());
> ```
> *Mục đích*: Launch code chỉ dùng được đúng 1 lần (single-use). Nếu không xóa khỏi URL, khi người chơi F5 lại trang, trình duyệt sẽ gửi lại mã cũ và bị Portal từ chối với lỗi `400 LAUNCH_CODE_ALREADY_EXCHANGED`.

- **Endpoint**: `POST https://helloboss.online/api/v1/games/verify-player`
- **Xác thực**: Server-to-Server Headers:
  - `Content-Type: application/json`
  - `X-Game-Id: <GAME_ID>` (ví dụ: `sudoku`, `caroboss`)
  - `X-Game-Key: <GAME_SECRET_KEY>` (Portal cũng chấp nhận bí danh `X-Game-Secret`)
- **Request Body**:
  ```json
  {
    "launchCode": "hlc_a9f81bc458e04b1298d0ef9213456789",
    "idempotencyKey": "verify_req_uuid_12345" // (Tùy chọn nhưng khuyến nghị) Khóa chống mất phản hồi mạng
  }
  ```
- **Response thành công (`200 OK`)**:
  ```json
  {
    "valid": true,
    "player": {
      "id": "cm7ab12x0001...",
      "name": "Nguyễn Văn Boss",
      "email": "user@gmail.com",
      "image": "https://lh3.googleusercontent.com/..."
    },
    "turnsBalance": 10,
    "gameId": "sudoku",
    "isRetry": false
  }
  ```
- **Quy tắc xác thực, hết hạn & phục hồi an toàn (Safe Recovery)**:
  - **Single-use**: Mỗi launch code chỉ được kích hoạt một lần duy nhất. Trạng thái lập tức chuyển sang `EXCHANGED`.
  - **Phục hồi an toàn khi mất mạng**: Nếu Game Backend đã gửi `POST /verify-player` nhưng bị mất kết nối trước khi nhận được phản hồi HTTP, Game Backend có thể gửi lại request với **cùng `idempotencyKey`**. Portal sẽ trả lại danh tính người chơi đã xác minh kèm `"isRetry": true` thay vì báo lỗi.
  - **Chống Replay**: Mọi hành vi cố gắng tái sử dụng mã mà không có `idempotencyKey` hợp lệ sẽ bị từ chối với lỗi `LAUNCH_CODE_ALREADY_EXCHANGED`.
- **Xử lý lỗi**:
  - `401 INVALID_GAME_CREDENTIALS`: Sai `X-Game-Id` hoặc `X-Game-Key` (ví dụ chưa cài Secret trên Worker).
  - `400 INVALID_LAUNCH_CODE`: Mã không tồn tại trong hệ thống.
  - `400 LAUNCH_CODE_GAME_MISMATCH`: Mã được cấp cho game khác, không phải game hiện tại.
    *Payload mẫu*:
    ```json
    {
      "error": "LAUNCH_CODE_GAME_MISMATCH",
      "message": "Game ID mismatch. Expected: 'clean-blox', Received: 'cleanblox'"
    }
    ```
    *Quy tắc Backend*: Game Backend bắt buộc log lỗi này ra console để lập trình viên thấy ngay sai lệch cấu hình mà không cần phỏng đoán.
  - `400 LAUNCH_CODE_ALREADY_EXCHANGED`: Mã đã từng được sử dụng (chống tấn công replay).
  - `400 LAUNCH_CODE_EXPIRED`: Mã đã quá hạn 5 phút.

---

## 4. Quy tắc & API sử dụng lượt chơi (Trừ lượt)

### A. Kiểm tra số dư lượt chơi (Game Backend -> Portal)
Game có thể chủ động tra cứu số lượt của người chơi mà không trừ lượt:
- **Endpoint**: `GET https://helloboss.online/api/v1/games/player-turns?userId={userId}`
- **Xác thực**: Headers `X-Game-Id: sudoku`, `X-Game-Key: <GAME_SECRET_KEY>`
- **Response (`200 OK`)**:
  ```json
  {
    "success": true,
    "gameId": "sudoku",
    "userId": "cm7ab12x0001...",
    "turnsBalance": 10
  }
  ```

---

### B. Bắt đầu ván mới / Trừ lượt chơi (Game Backend -> Portal)

Mỗi khi người chơi chủ động bấm **"Bắt đầu ván mới"**, Game Backend bắt buộc phải gọi API này trước khi khởi tạo bàn cờ.
- **Endpoint**: `POST https://helloboss.online/api/v1/games/rounds/start`
- **Xác thực**: Headers `X-Game-Id: sudoku`, `X-Game-Key: <GAME_SECRET_KEY>`
- **Request Body**:
  ```json
  {
    "userId": "cm7ab12x0001...",
    "idempotencyKey": "sudoku_rnd_78a9c012-e8b3-4f91-b345-091238475612",
    "metadata": {
      "difficulty": "medium",
      "boardPreset": 42
    }
  }
  ```

#### Quy tắc Idempotency Key:
- Game Backend phải sinh một chuỗi UUID duy nhất cho ván chơi này.
- Nếu gặp lỗi mạng, timeout hoặc không nhận được phản hồi, Game Backend **phải gửi lại đúng `idempotencyKey` này**.

#### Kết quả trả về:

1. **Đủ lượt & Trừ thành công (`200 OK`)**:
   ```json
   {
     "success": true,
     "sessionId": "gses_9f81a7b2-3c4d-4e5f-a6b7-c8d9e0f1a2b3",
     "gameId": "sudoku",
     "userId": "cm7ab12x0001...",
     "turnsRemaining": 9,
     "turnsDeducted": 1,
     "startedAt": 1773000500000,
     "isRetry": false
   }
   ```
   *Hành động của game*: Game cho phép mở ván chơi và bắt đầu tính điểm.

2. **Gửi lại do mất kết nối (Retry an toàn) (`200 OK`)**:
   ```json
   {
     "success": true,
     "sessionId": "gses_9f81a7b2-3c4d-4e5f-a6b7-c8d9e0f1a2b3",
     "gameId": "sudoku",
     "userId": "cm7ab12x0001...",
     "turnsRemaining": 9,
     "turnsDeducted": 1,
     "startedAt": 1773000500000,
     "isRetry": true
   }
   ```
   *Hành động của game*: Nhận diện `"isRetry": true`, tiếp tục khởi tạo ván cờ tương ứng với `sessionId`, **tài khoản người chơi không bị trừ thêm lượt nào**.

3. **Không đủ lượt chơi (`402 Payment Required`)**:
   ```json
   {
     "error": "INSUFFICIENT_TURNS",
     "message": "Người chơi đã hết số dư lượt chơi.",
     "turnsRemaining": 0
   }
   ```
   *Hành động của game*: **Tuyệt đối không bắt đầu ván mới**. Hiển thị thông báo yêu cầu người chơi quay lại Portal HelloBoss để nạp hoặc nhận thêm lượt chơi.

4. **Lỗi tham số hoặc xác thực**:
   - `401 INVALID_GAME_CREDENTIALS`: Sai thông tin xác thực của Game (`X-Game-Id` hoặc `X-Game-Key`).
   - `403 PLAYER_NOT_AUTHORIZED_FOR_GAME`: **Ràng buộc bảo mật định danh** — Người chơi (`userId`) chưa từng mở hoặc đổi launch code với game này. Game không thể tự chỉ định `userId` tùy ý để trừ lượt người khác.
   - `400 USER_ID_REQUIRED`: Thiếu `userId`.
   - `400 IDEMPOTENCY_KEY_REQUIRED`: Thiếu `idempotencyKey`.
   - `500 ROUND_START_TRANSACTION_FAILED`: Lỗi giao dịch cơ sở dữ liệu D1. Hệ thống đảm bảo không trừ lượt và không sinh session ảo.

#### Bảo đảm an toàn giao dịch đồng thời (Concurrency Safety):
- Giao dịch trừ lượt được bảo vệ nguyên tử bởi **Cloudflare D1 batch** cùng ràng buộc cấp bảng **`CHECK("balance" >= 0)`**.
- Khi 2 request khác nhau cùng gửi đến tại cùng một thời điểm khi người chơi chỉ còn 1 lượt:
  - Đúng 1 request được ghi nhận thành công (balance chuyển từ 1 về 0).
  - Request thứ hai bị D1 kích hoạt vi phạm ràng buộc `CHECK constraint failed: balance >= 0`, toàn bộ transaction bị hủy (rollback) và trả về ngay mã lỗi `402 INSUFFICIENT_TURNS`.
  - Số dư tài khoản được cam kết **tuyệt đối không bao giờ bị âm**.

---

### C. Tiếp tục ván chơi dở dang (Resume - Không tốn lượt)

Nếu người chơi thoát game giữa chừng khi chưa hoàn thành ván:
- Game tự động lưu trạng thái bàn cờ vào cơ sở dữ liệu của Game, gắn với `userId` (hoặc `sessionId`).
- Khi người chơi mở lại game, Game kiểm tra ván chưa hoàn thành và cho người chơi tiếp tục chơi tiếp.
- **Quy tắc bắt buộc**: Game **không được gọi** `POST /api/v1/games/rounds/start`.
- *(Tùy chọn)* Game Backend có thể gọi API xác minh phiên nếu cần:
  `POST https://helloboss.online/api/v1/games/sessions/resume`
  Body: `{ "sessionId": "gses_...", "userId": "cm7..." }`
  Response: `{ "valid": true, "session": { ... } }`

---

### D. Kết thúc ván chơi (Finish Session)

Khi người chơi hoàn thành ván đấu (Thắng, Thua, Hết giờ):
- **Endpoint**: `POST https://helloboss.online/api/v1/games/sessions/finish`
- **Xác thực**: Headers `X-Game-Id: sudoku`, `X-Game-Key: <GAME_SECRET_KEY>`
- **Request Body**:
  ```json
  {
    "sessionId": "gses_9f81a7b2-3c4d-4e5f-a6b7-c8d9e0f1a2b3",
    "userId": "cm7ab12x0001...",
    "outcome": "COMPLETED",
    "metadata": {
      "score": 1250,
      "timeSeconds": 184,
      "hintsUsed": 1
    }
  }
  ```
- **Response (`200 OK`)**:
  ```json
  {
    "success": true,
    "sessionId": "gses_9f81a7b2-3c4d-4e5f-a6b7-c8d9e0f1a2b3",
    "status": "COMPLETED"
  }
  ```

---

## 5. Tổng hợp Bảng Endpoint & Ma trận lỗi

| Mục đích | Endpoint & Phương thức | Bên gọi | Cơ chế xác thực | HTTP Status thành công | HTTP Status lỗi |
|---|---|---|---|---|---|
| **Cấp Launch Code** | `POST /api/v1/games/launch-code` | Portal Client | Player Session | `200 OK` | `401`, `400` |
| **Xác minh người chơi** | `POST /api/v1/games/verify-player` | Game Backend | `X-Game-Id`, `X-Game-Key` | `200 OK` | `401`, `400` |
| **Tra cứu số dư lượt** | `GET /api/v1/games/player-turns` | Game Backend | `X-Game-Id`, `X-Game-Key` | `200 OK` | `401`, `400` |
| **Trừ lượt ván mới** | `POST /api/v1/games/rounds/start` | Game Backend | `X-Game-Id`, `X-Game-Key` | `200 OK` | `401`, `400`, `402` |
| **Khôi phục phiên** | `POST /api/v1/games/sessions/resume` | Game Backend | `X-Game-Id`, `X-Game-Key` | `200 OK` | `401`, `404`, `400` |
| **Kết thúc phiên** | `POST /api/v1/games/sessions/finish` | Game Backend | `X-Game-Id`, `X-Game-Key` | `200 OK` | `401`, `404`, `400` |
| **Xem số dư bản thân** | `GET /api/v1/player/turns` | Player Client | Player Session | `200 OK` | `401` |
| **Xem lịch sử giao dịch** | `GET /api/v1/player/ledger` | Player Client | Player Session | `200 OK` | `401` |

---

## 6. Khuyến nghị chuẩn API nội bộ giữa Game Frontend ↔ Game Backend

Để tránh mỗi game đặt tên endpoint một kiểu gây khó bảo trì, khuyến nghị tất cả các game HTML5 sử dụng chuẩn endpoint nội bộ sau cho giao tiếp giữa Frontend và Backend của game:

| Endpoint nội bộ của Game | Phương thức | Mô tả chi tiết |
|---|---|---|
| `/api/auth/verify-launch-code` | `POST` | Frontend gửi `{ launchCode, idempotencyKey }`. Backend gọi Portal `POST /verify-player`, lưu hồ sơ người chơi vào DB của game, tạo session token nội bộ (7 ngày) và trả về Set-Cookie / Token. |
| `/api/auth/session` | `GET` | Trả về `{ authenticated: boolean, player, turnsBalance }`. Nếu đã đăng nhập, Backend tự động gọi Portal lấy `turnsBalance` mới nhất để hiển thị. |
| `/api/auth/logout` | `POST` | Hủy session token trong DB game và xóa cookie `sudoku_token` (hoặc `{game}_token`). |
| `/api/player/turns` | `GET` | Tra cứu số dư lượt trực tiếp từ Portal thông qua Backend Game (không trừ lượt). |
| `/api/rounds/start` | `POST` | Bắt đầu ván mới: Frontend gửi `{ difficulty / level / mode, idempotencyKey, initialData }`. Backend gọi Portal `POST /rounds/start` để trừ 1 lượt. Trả về `sessionId` từ Portal và lưu ván chơi mới vào DB game. |
| `/api/rounds/finish` | `POST` | Kết thúc ván: Frontend gửi `{ sessionId, score, timeSeconds, ... }`. Backend cập nhật DB game thành `COMPLETED` và báo cáo lên Portal qua `POST /sessions/finish`. |
| `/api/game/state` | `GET` / `POST` | Tải hoặc lưu trạng thái ván chơi dở dang và tiến trình điểm số/hồ sơ riêng của game. Luôn được bảo vệ chặt chẽ theo `req.userId` đã xác thực. |
| `/api/auth/dev-login` | `POST` | *(Chỉ bật trong môi trường dev/test khi `NODE_ENV !== 'production'`) Giả lập đăng nhập người chơi để test giao diện cục bộ mà không cần mở Portal.* |

