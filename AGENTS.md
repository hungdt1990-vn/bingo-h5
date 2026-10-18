# Game Repository — Agent Rules for HelloBoss Integration

## Mandatory Workflow
1. **Inspect First**: Inspect the actual game repository, framework, entry point, game lifecycle, persistence, backend, Cloudflare configuration, and deployment model.
2. **Read Specifications**: Read `docs/helloboss-integration.md`, `docs/game-rules.md`, and `docs/game-api-contract.md` before making any changes.
3. **Analyze Gameplay & Propose Turn Rules**: Before touching code, inspect the game's actual mechanics and propose in `docs/game-rules.md` which specific actions should consume a turn and which actions are free resumes. Present this proposal to the project owner for confirmation.
4. **Follow Official Contract**: Use the exact endpoints, request/response formats, headers, and error codes from `docs/game-api-contract.md`. Never invent guessed paths or tokens.
5. **Preserve Existing Gameplay**: Keep existing gameplay, graphics, animations, sounds, and user experience intact unless explicitly asked to modify them.
6. **Synchronize Dual Runtimes**: If the repository uses Node.js/Express for local development (`server.ts`) and Cloudflare Workers (`worker/index.ts`) for production, ensure all endpoints, request bodies, error handling, and database schemas are 100% synchronized between both runtimes.
7. **Keep Documentation & Tests Synchronized**: Update tests and docs alongside code changes. All integration test cases must pass.

## Non-Negotiable Rules
- **Authoritative Central Source**: HelloBoss Portal is the single source of truth for user identity, shared turn balance, and round authorization.
- **Game Database Scoping**: The game's database (e.g. Cloudflare D1 / SQLite) is strictly for game-specific data (board state, score, level progress, settings). Never store an independent authoritative turn balance in the game.
- **Zero-Trust Frontend**: Never trust client-provided user ID, turn count, or entitlement. All authentication and turn deductions must be verified Server-to-Server.
- **Zero-Secret Frontend**: Never expose server secrets (`X-Game-Key`, `HELLOBOSS_GAME_KEY`) in frontend bundles, public variables, URLs, source maps, or logs.
- **Contract Slug Normalization (kebab-case)**: The game identifier on Portal and `HELLOBOSS_GAME_ID` in the game must strictly use lowercase **kebab-case** (e.g. `sudoku`, `clean-blox`, `caro-boss`). Never use underscores, uppercase letters, or camelCase.
- **Dual-Token Authentication (Hybrid Architecture)**:
  - Game backend must issue BOTH a partitioned cookie (`SameSite=None; Secure; Partitioned`) AND return the `token` in the JSON response body.
  - Game frontend MUST persist this `token` in `localStorage` and always send the header `Authorization: Bearer <token>` on every request to guarantee resilience in cross-origin iframes, Safari ITP, and mobile in-app webviews.
  - Backend must inspect the `Authorization: Bearer` header first, falling back to cookies if omitted.
- **Worker Never Throws HTML or Error 1101 (Global Defensive Wrapper)**: The entire Worker `fetch` handler must be enclosed in `try ... catch` from the very first line. Never allow uncaught runtime exceptions to bubble up as Cloudflare `Error 1101: Worker threw exception` or 500 HTML pages. Always return structured JSON (`{ error, message }`) for API routes, and a clean fallback for asset routes.
- **Cloudflare Static Assets Configuration (Full-Stack Worker SPA)**: When deploying a unified Worker serving both backend APIs (`/api/*`) and frontend SPA files, `wrangler.toml` MUST configure `[assets]` (`directory = "./dist"`, `binding = "ASSETS"`, `not_found_handling = "single-page-application"`). Code must safely guard `env.ASSETS` (`if (env.ASSETS && typeof env.ASSETS.fetch === 'function')`). Developers must always run `npm run build` prior to `npx wrangler deploy`.
- **Two-State Actionable Auth Gate**:
  - *Direct Access*: When opening the game directly without a launch code or prior session, display a friendly invitation with a direct link to HelloBoss Portal.
  - *Verification Error*: When a launch code is provided but verification fails (e.g., missing `HELLOBOSS_GAME_KEY`, expired code, or game ID mismatch), display the exact technical error message, an inline retry button, and a link back to Portal.
- **Play Again UI Pattern (Ref-Guarded & Inline Retry)**:
  - Use `useRef` as an immediate synchronization lock (`const isStartingRoundRef = useRef(false);`) to prevent stale closure lockups in React callbacks.
  - Wrap the turn authorization call in `try ... finally { isStartingRoundRef.current = false; setIsStartingRound(false); }` so buttons never freeze.
  - If pre-authorization fails on game-over (e.g. 402 Insufficient Turns or network timeout), display the error inline on the modal and allow the player to retry immediately.
- **Turn Deduction Policy**: Exactly one turn is deducted per new round, authorized only via HelloBoss backend API. Refreshing, resuming, continuing, or recovering from errors must NOT deduct another turn.
- **Idempotency Guarantee**: Every start-round request must send a unique `idempotencyKey`. Any network retry or recovery of that request must reuse the exact same key.
- **Pre-Authorization Required**: Never reset the board or allow the player to start a new round until the central API confirms authorization (`200 OK`).
- **Zero-Terminal Deployment**: Database tables must auto-initialize (`CREATE TABLE IF NOT EXISTS`) in code upon backend startup/first request so deployment succeeds seamlessly without requiring manual CLI migration commands from the user. For Cloudflare D1, **never** execute multiline SQL via `db.exec()`; always execute individual single-line statements via `await db.prepare(sql).run()` guarded by an in-memory initialization flag (`isD1Initialized`) to prevent `D1_EXEC_ERROR: incomplete input`.

## Post-Deploy Checklist (Production Secrets)
After syncing code or deploying to Cloudflare Workers, the production secret must be configured:
- **Option 1 (Web UI)**: Cloudflare Dashboard > Workers & Pages > select Worker > **Settings** > **Variables and Secrets** > **Add Secret** with name `HELLOBOSS_GAME_KEY` and value from Portal.
- **Option 2 (CLI)**: Run `npx wrangler secret put HELLOBOSS_GAME_KEY`.

## Backend & Platform
Do not assume every game must be a Worker. Inspect the current deployment. A static game may remain static, with a backend (Worker, Pages Functions, or another supported server component) added only where necessary for secrets, authentication, or protected persistence.

## Completion Report
Report files changed, integration flow, exact API contract used, required Cloudflare bindings/secrets, database schema, test execution results, and deployment notes.
