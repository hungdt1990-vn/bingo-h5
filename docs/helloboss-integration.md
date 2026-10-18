# HelloBoss Integration Guide for Individual Games

**Status:** Authoritative Integration Requirements. The actual endpoint paths and payloads must come from the portal's implemented `docs/game-api-contract.md`.

---

## 1. Responsibility Split
**HelloBoss owns**:
- Stable user identity and account status (`user.id` is immutable).
- Shared turn balance and turn ledger.
- Registered game identity and authorization (`X-Game-Id`, `X-Game-Key`).
- Authorization to start a new round and central game-session records (`sessionId`).

**This game owns**:
- Gameplay, visual presentation, and game-specific rules.
- Game progress, scores, settings, and game-specific resources.
- Game save/load behavior in its own database (e.g. Cloudflare D1 / SQLite).

The game **must not** maintain an authoritative independent copy of the shared turn balance.

---

## 2. Inspect Before Implementing
1. Inspect the existing repository: frontend framework, game lifecycle (start, resume, restart, game over, victory), state storage (localStorage/memory), backend (if any), and deployment config (`wrangler.toml`, `package.json`).
2. Keep existing gameplay and presentation intact. Do not rewrite games unnecessarily.
3. If the game has dual runtimes (Node.js/Express for local dev and Cloudflare Worker for production), ensure all endpoints and database operations are implemented identically in both runtimes.

---

## 3. Authentication & Launch Flow
Follow the official HelloBoss integration flow:
1. **Launch with Code**: Portal opens game URL with `https://game.url/?code=hlc_...`.
2. **Immediate URL Sanitization**: As soon as the frontend extracts `?code=`, it **must immediately remove** the query parameter from the address bar:
   ```ts
   const url = new URL(window.location.href);
   url.searchParams.delete('code');
   window.history.replaceState({}, document.title, url.toString());
   ```
   *Why*: Launch codes are strictly single-use. If not removed, a browser refresh (F5) will resend the old code and fail with `400 LAUNCH_CODE_ALREADY_EXCHANGED`.
3. **Server-to-Server Verification**: Game frontend sends `launchCode` to Game Backend (`POST /api/auth/verify-launch-code`). The Game Backend calls Portal `POST /api/v1/games/verify-player` with `X-Game-Id` and `X-Game-Key`.
4. **Dual-Token Authentication (Hybrid Architecture)**:
   - On success, Game Backend upserts the player profile in the game DB and issues a secure session token (7-day TTL).
   - Backend sends BOTH a cookie (`SameSite=None; Secure; Partitioned`) AND returns `{ success: true, token, player, turnsBalance }` in the JSON response.
   - Frontend **MUST** store `token` in `localStorage` and always include the header `Authorization: Bearer <token>` on all subsequent API requests.
   - Backend **MUST** check `Authorization` header first, falling back to Cookie if omitted. This eliminates 401 dropouts caused by third-party cookie restrictions in iframes, Safari ITP, and mobile webviews.
5. **Two-State Actionable Auth Gate UX**:
   - The game must never display a broken or blank screen when unauthenticated.
   - **State A (Direct URL Access)**: If accessed without a launch code and without an active session, display: *"Vui lòng mở trò chơi từ HelloBoss Portal để tự động đồng bộ tài khoản và lượt chơi"* with a prominent button redirecting to `https://helloboss.online`.
   - **State B (Verification Error)**: If a launch code was provided but verification failed (e.g. missing `HELLOBOSS_GAME_KEY`, game ID mismatch, or expired code), display the exact technical error message, an inline "Thử lại" button, and setup guidance if missing server secrets.
6. **Local Development Helper**: In development mode (`NODE_ENV !== 'production'`), provide an optional dev login (`POST /api/auth/dev-login`) so developers can test UI and gameplay without needing a live portal connection.

---

## 4. Starting a New Round (Deducting Turns & Play Again UX)
When a player initiates a genuinely new round:
1. **Ref-Guarded Pre-Authorization**:
   - Use `useRef` as an immediate synchronization lock (`const isStartingRoundRef = useRef(false);`) to prevent stale closure lockups in React callbacks.
   - Disable the start button to prevent rapid double-clicks.
   - Frontend calls Game Backend (`POST /api/rounds/start`) with a client-generated `idempotencyKey` (UUID).
   - Enclose the entire call in `try ... finally { isStartingRoundRef.current = false; setIsStartingRound(false); }` so buttons never freeze.
2. Backend checks authentication (`Authorization` header first, then Cookie) and verifies if this `idempotencyKey` has already been processed (safe retry).
3. Backend calls HelloBoss Portal `POST /api/v1/games/rounds/start` Server-to-Server.
4. **If 200 OK**: Portal deducts 1 turn and returns `sessionId` and `turnsRemaining`. Game backend saves the new session in the game DB with status `IN_PROGRESS` and returns success to frontend.
5. **If 402 INSUFFICIENT_TURNS**: Game strictly halts game startup and displays the **Insufficient Turns Modal** prompting the user to acquire more turns on HelloBoss.
6. **If network timeout/failure**: Game retries using the **exact same `idempotencyKey`**. The Portal recognizes the retry, returns `isRetry: true`, and does NOT deduct another turn.
7. **Play Again Error Presentation**: On Game Over modals, if starting a new round fails (e.g. 402 or network error), display the error inline on the modal and allow the player to retry immediately without freezing the modal.

---

## 5. Turn Policy Guidelines
- **Open game / Load assets**: 0 turns (free).
- **Verify login / Exchange code**: 0 turns (free).
- **Refresh (F5) / Reopen browser**: 0 turns (free, restores active game from DB).
- **Continue / Resume / Pause / Unpause**: 0 turns (free).
- **Network retry of start request**: 0 additional turns (same idempotency key).
- **New round / New puzzle**: Deducts 1 turn via HelloBoss API only upon server authorization.
- **Finish / Victory / Defeat**: 0 turns (calls `POST /api/v1/games/sessions/finish` to report outcome).

*Note*: The exact gameplay actions that trigger a new round must be proposed and confirmed in `docs/game-rules.md` before coding.

---

## 6. Game Persistence & Zero-Terminal Auto-Migration
1. **User Scoping**: Every database read and write query must be strictly scoped to the authenticated `user_id` extracted from the verified session token. Client-provided user IDs must never be trusted.
2. **Database Choice**: Use Cloudflare D1 for Cloudflare deployment, and SQLite (`node:sqlite`) for Node.js local dev/testing.
3. **Zero-Terminal Auto-Migration & D1_EXEC_ERROR Prevention**:
   - Do NOT force users to execute manual CLI commands like `wrangler d1 migrations apply`.
   - The backend code (e.g. `worker/index.ts` and `src/server/db.ts`) must automatically execute `CREATE TABLE IF NOT EXISTS` for all tables and indexes upon startup / first request.
   - **Critical Rule for Cloudflare D1 (`D1_EXEC_ERROR` Prevention)**:
     - **NEVER** use `db.exec()` with multiline SQL strings containing line breaks inside statement bodies (e.g. `CREATE TABLE foo (\n id TEXT\n)`). Cloudflare D1's SQL parser splits queries by newline, causing fatal errors: `D1_EXEC_ERROR: Error in line 1: CREATE TABLE IF NOT EXISTS ... (: incomplete input: SQLITE_ERROR`.
     - **MANDATORY PATTERN**: Define each DDL statement as an individual, self-contained single-line string and execute each one via `await db.prepare(sql).run()`.
     - Use an in-memory flag (e.g. `isD1Initialized = true`) so auto-migration only runs once per worker instance lifecycle.
     - Enclose each migration statement in `try ... catch` to gracefully ignore non-fatal warnings when tables or indexes already exist.
4. **Data to Persist**:
   - `player_profiles`: Immutable `user_id`, career score, EXP, achievements, sound settings.
   - `game_sessions`: `id`, `user_id`, `session_id` (from Portal), `idempotency_key`, `status` (`IN_PROGRESS` / `COMPLETED` / `ABANDONED`), board/progress JSON, elapsed time.
   - `auth_tokens`: Session token, `user_id`, `expires_at`.

---

## 7. Secrets and Security Boundaries
- Store `HELLOBOSS_GAME_KEY` exclusively in server-side environment secrets (e.g., Cloudflare Secrets or `.env` in Node.js).
- Never bundle `X-Game-Key` or `HELLOBOSS_GAME_KEY` into frontend JavaScript, HTML, source maps, or public repositories.
- Use CORS headers only where required; CORS is not an authentication mechanism.

### Post-Deploy Checklist (Production Secrets)
After syncing code or deploying to Cloudflare Workers, configure the secret:
- **Option 1 (Web UI)**: Cloudflare Dashboard > Workers & Pages > select Worker > **Settings** > **Variables and Secrets** > **Add Secret** with name `HELLOBOSS_GAME_KEY` and value from HelloBoss Portal.
- **Option 2 (CLI)**: Run `npx wrangler secret put HELLOBOSS_GAME_KEY`.

---

## 8. Contract Slug Normalization (kebab-case)
- **Standard Format**: Game identifiers on Portal and `HELLOBOSS_GAME_ID` in the game must strictly use **kebab-case** (e.g. `sudoku`, `clean-blox`, `caro-boss`). Never use underscores, uppercase letters, or camelCase.
- **Mismatch Logging**: If Portal returns `LAUNCH_CODE_GAME_MISMATCH`, Game Backend must log the exact mismatch (`Expected vs Received`) to server logs so developers can resolve configuration mismatches in seconds.

---

## 9. Worker Defensive Wrapper & Cloudflare Static Assets (Error 1101 Prevention)
1. **Global Defensive Try-Catch (Never Throw Cloudflare Error 1101 / 500 HTML)**:
   - Cloudflare Workers must wrap the **entire** `fetch(request, env)` handler in a global `try ... catch` block from the very first line.
   - Never allow uncaught runtime exceptions to bubble up as Cloudflare `Error 1101: Worker threw exception` or 500 HTML pages. Always return structured JSON (`{ error, message }`) for API routes, and a clean fallback for asset routes.
   - Client-side fetch wrappers must verify `res.headers.get('content-type')?.includes('application/json')` before calling `res.json()`.
2. **Cloudflare Static Assets Configuration (Full-Stack Worker SPA)**:
   - When a game is deployed as a single Cloudflare Worker serving both backend `/api/*` routes and frontend SPA files (HTML/JS/CSS), `wrangler.toml` **MUST** include the `[assets]` block:
     ```toml
     [assets]
     directory = "./dist"
     binding = "ASSETS"
     not_found_handling = "single-page-application"
     ```
   - In `worker/index.ts`, always safely guard `env.ASSETS`:
     ```ts
     if (!url.pathname.startsWith('/api/')) {
       if (env.ASSETS && typeof env.ASSETS.fetch === 'function') {
         return await env.ASSETS.fetch(request);
       }
       return new Response('Assets binding not found. Please build frontend first.', { status: 503 });
     }
     ```
   - **Mandatory Pre-Deploy Build**: Developers **MUST** run `npm run build` prior to `npx wrangler deploy` so the `./dist` directory exists and contains the compiled frontend assets.

---

## 10. Required Automated Tests
Every game integration must include an automated test suite (`npm test`) that tests at least the following 9 cases against a local mock Portal server:
1. **Launch Code Verification**: Valid code returns player identity and turn balance.
2. **Turn Deduction**: Starting a new round deducts exactly 1 turn.
3. **Insufficient Turns (402)**: Request rejected when balance is 0, blocking new round.
4. **Idempotency & Timeout Retry**: Resending with same `idempotencyKey` succeeds without deducting a 2nd turn (`isRetry: true`).
5. **Recovery After Failure**: In-progress game state is safely restored if client crashed after turn deduction.
6. **Resume Without Deduction**: Resuming an active round retains the exact same turn balance.
7. **Complete & Start Next Round**: Finishing old round and starting new round deducts a fresh turn.
8. **User Isolation**: User B cannot query, update, or overwrite User A's game progress.
9. **Persistence Across Reloads**: Player stats and board state persist after page refresh.
