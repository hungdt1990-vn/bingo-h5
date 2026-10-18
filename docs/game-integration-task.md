# Implementation Task: Integrate This Game with HelloBoss

You are a senior game and web engineer. Your mission is to integrate this game repository with the HelloBoss portal reliably, securely, and seamlessly without unnecessarily rewriting existing game code.

---

## 1. Step-by-Step Implementation Workflow

### Step 1: Inspect & Propose Turn Rules (Mandatory First Turn)
1. Read `AGENTS.md`, `docs/helloboss-integration.md`, `docs/game-api-contract.md`, and `docs/game-rules.md`.
2. Inspect the repository: frontend code, game state machine (start, pause, resume, restart, game over, victory), persistence layer, and Cloudflare config.
3. **Formulate the Turn Policy Proposal**: Analyze the gameplay and list all player actions in `docs/game-rules.md` that constitute:
   - **New Round (Deducts 1 turn)**.
   - **Resume / Free Action (Zero turn deduction)**.
4. **Submit Proposal to User**: Present this proposal to the project owner for confirmation before modifying or writing game integration code.

### Step 2: Backend & Database Integration
1. Implement the server-side endpoints adhering to `docs/game-api-contract.md` (Section 6 recommended standard internal routes).
2. **Contract Slug Normalization**: Standardize `gameId` / `HELLOBOSS_GAME_ID` using strict lowercase `kebab-case` (e.g. `sudoku`, `clean-blox`, `caro-boss`).
3. Use server-side secrets (`X-Game-Id`, `X-Game-Key` / `HELLOBOSS_GAME_KEY`). Never expose them to client bundles.
4. **Dual-Token Architecture (Hybrid)**:
   - Server responds with both `SameSite=None; Secure; Partitioned` cookie and `token` in JSON body.
   - Server checks `Authorization: Bearer <token>` header first, falling back to Cookie.
5. **Worker Defensive JSON Wrapper**: Enclose all Worker routes in `try ... catch`. Never let 500 HTML error pages bubble up to the client.
6. **Zero-Terminal Auto-Migration & D1_EXEC_ERROR Prevention**:
   - Ensure database tables (`CREATE TABLE IF NOT EXISTS`) are auto-created by the backend/worker on startup or first request so that deployment requires no manual CLI commands.
   - For Cloudflare D1: **Never** pass multiline SQL strings to `db.exec()`. Always format each DDL command as an individual single-line string and execute via `await db.prepare(sql).run()` guarded by an in-memory flag (`isD1Initialized`) to prevent `D1_EXEC_ERROR: incomplete input`.
7. If dual runtimes exist (Express `server.ts` for local dev and Cloudflare Worker `worker/index.ts` for production), keep them 100% synchronized in endpoints, request schemas, and database operations.

### Step 3: Frontend Integration & UX Polish
1. **URL Sanitization**: Extract `?code=hlc_...` on load and immediately strip it from `window.location` via `window.history.replaceState` to prevent replay errors on page refresh.
2. **Dual-Token Frontend Persistence**:
   - Store session token in `localStorage`.
   - Send `Authorization: Bearer <token>` on 100% of API requests (`apiFetch`).
   - Validate `res.headers.get('content-type')?.includes('application/json')` before parsing JSON.
3. **Two-State Actionable Auth Gate**:
   - *Direct Access*: Show friendly invite with button to HelloBoss Portal.
   - *Verification Error*: Show specific error message, inline "Thử lại" button, and configuration guide if server secret is missing.
4. **Play Again UI Pattern (Ref-Guarded & Inline Retry)**:
   - Use `useRef` as an immediate lock (`const isStartingRoundRef = useRef(false);`) to prevent stale closure freezes in React.
   - Enclose API call in `try ... finally { isStartingRoundRef.current = false; setIsStartingRound(false); }`.
   - On Game Over modal: If turn deduction fails, display the error inline and allow immediate retry.
5. **Turn Deductions**: Call `POST /api/rounds/start` with a fresh `idempotencyKey` when starting a new round. Only start the round after receiving `200 OK`.
6. **Insufficient Turns**: Handle `402 INSUFFICIENT_TURNS` gracefully by displaying an Insufficient Turns modal and preventing board reset.
7. **Session Completion**: When a round ends (victory/defeat), call `POST /api/rounds/finish` to report outcomes to HelloBoss.

### Step 4: Cloudflare & Deployment Pre-Flight Checks
1. In `wrangler.toml`:
   - Ensure `name` matches the Worker project name on Cloudflare CI.
   - Ensure `database_id` contains a real Cloudflare D1 UUID (never leave placeholder strings like `YOUR_CLOUDFLARE_D1_DATABASE_ID`).
   - Ensure `HELLOBOSS_GAME_ID` matches the kebab-case slug registered on Portal.
   - **Static Assets Configuration**: For Full-Stack SPA Worker, ensure the `[assets]` section is present:
     ```toml
     [assets]
     directory = "./dist"
     binding = "ASSETS"
     not_found_handling = "single-page-application"
     ```
2. In `package.json`:
   - Ensure `wrangler` is included in `devDependencies`.
   - Ensure there are no duplicate dependencies.
3. **Pre-Deploy Frontend Build (Mandatory)**:
   - Always run `npm run build` prior to `npx wrangler deploy` to compile SPA assets into `./dist`. Deploying without running `npm run build` will cause `Error 1101: Worker threw exception` when loading the game URL.
4. **Post-Deploy Checklist (Production Secrets)**:
   - Add Secret `HELLOBOSS_GAME_KEY` on Cloudflare Dashboard (*Workers & Pages > Settings > Variables and Secrets > Add Secret*) or via CLI `npx wrangler secret put HELLOBOSS_GAME_KEY`.

### Step 5: Automated Testing
1. Run automated tests (`npm test`) covering all 9 mandatory scenarios (valid auth, expired code, turn deduction, insufficient turns 402, retry idempotency, resume without deduction, victory reporting, user isolation, and reload persistence).
2. Run build check (`npm run build`) and linter (`npm run lint`).

---

## 2. Deliverables Checklist
Upon completion, provide a clear, concise report containing:
- [ ] Files changed and rationale.
- [ ] Gameplay analysis and confirmed turn deduction rules.
- [ ] Backend and database changes (including auto-migration verification).
- [ ] Environment variables, bindings, and Cloudflare secrets required.
- [ ] Test execution results (must pass all 9 test cases).
- [ ] Instructions for production deployment.
