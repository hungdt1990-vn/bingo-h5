export interface Env {
  ASSETS?: {
    fetch: (request: Request | string) => Promise<Response>;
  };
  DB?: any;
  HELLOBOSS_GAME_ID?: string;
  HELLOBOSS_GAME_KEY?: string;
  HELLOBOSS_PORTAL_URL?: string;
}

let isD1Initialized = false;

// Single-line DDL statements to prevent Cloudflare D1_EXEC_ERROR
const MIGRATION_STATEMENTS = [
  'CREATE TABLE IF NOT EXISTS player_profiles (user_id TEXT PRIMARY KEY NOT NULL, name TEXT, email TEXT, image TEXT, best_score INTEGER DEFAULT 0, total_games_played INTEGER DEFAULT 0, sound_enabled INTEGER DEFAULT 1, created_at INTEGER, updated_at INTEGER)',
  'CREATE TABLE IF NOT EXISTS game_sessions (id TEXT PRIMARY KEY NOT NULL, user_id TEXT NOT NULL, session_id TEXT, idempotency_key TEXT UNIQUE, board_count INTEGER DEFAULT 1, score INTEGER DEFAULT 0, status TEXT DEFAULT \'IN_PROGRESS\', cards_data TEXT, metadata TEXT, created_at INTEGER, finished_at INTEGER)',
  'CREATE TABLE IF NOT EXISTS auth_tokens (token TEXT PRIMARY KEY NOT NULL, user_id TEXT NOT NULL, expires_at INTEGER NOT NULL, created_at INTEGER NOT NULL)',
  'CREATE INDEX IF NOT EXISTS idx_sessions_user ON game_sessions (user_id)',
  'CREATE INDEX IF NOT EXISTS idx_sessions_idempotency ON game_sessions (idempotency_key)',
  'CREATE INDEX IF NOT EXISTS idx_auth_tokens_token ON auth_tokens (token)',
];

async function initDatabase(db: any): Promise<void> {
  if (isD1Initialized || !db) return;
  for (const sql of MIGRATION_STATEMENTS) {
    try {
      await db.prepare(sql).run();
    } catch (err) {
      console.warn('Migration step warning (safely ignored):', err);
    }
  }
  isD1Initialized = true;
}

function jsonResponse(data: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      ...headers,
    },
  });
}

function extractToken(request: Request): string | null {
  const authHeader = request.headers.get('Authorization');
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7).trim();
  }
  const cookieHeader = request.headers.get('Cookie');
  if (cookieHeader) {
    const match = cookieHeader.match(/bingo_token=([^;]+)/);
    if (match) return match[1].trim();
  }
  return null;
}

async function getAuthenticatedUser(request: Request, env: Env): Promise<{ userId: string } | null> {
  const token = extractToken(request);
  if (!token) return null;

  if (token.startsWith('dev_token_')) {
    const userId = token.replace('dev_token_', '');
    return { userId };
  }

  if (env.DB) {
    await initDatabase(env.DB);
    const now = Date.now();
    const tokenRecord = await env.DB
      .prepare('SELECT user_id, expires_at FROM auth_tokens WHERE token = ? AND expires_at > ?')
      .bind(token, now)
      .first();
    if (tokenRecord) {
      return { userId: tokenRecord.user_id as string };
    }
  }

  return null;
}

function generateId(prefix = 'id'): string {
  const rand = Math.random().toString(36).substring(2, 10);
  const time = Date.now().toString(36);
  return `${prefix}_${time}_${rand}`;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      const url = new URL(request.url);
      const portalUrl = env.HELLOBOSS_PORTAL_URL || 'https://helloboss.online';
      const gameId = env.HELLOBOSS_GAME_ID || 'bingo-h5';
      const gameKey = env.HELLOBOSS_GAME_KEY;

      if (env.DB) {
        await initDatabase(env.DB);
      }

      // Handle CORS Preflight
      if (request.method === 'OPTIONS') {
        return new Response(null, {
          status: 204,
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization',
          },
        });
      }

      // --- API ROUTES ---

      // 1. Health check
      if (url.pathname === '/api/health') {
        return jsonResponse({
          status: 'ok',
          gameId,
          hasKey: !!gameKey,
          hasDB: !!env.DB,
          timestamp: new Date().toISOString(),
        });
      }

      // 2. Verify Launch Code
      if (url.pathname === '/api/auth/verify-launch-code' && request.method === 'POST') {
        let body: any = {};
        try {
          body = await request.json();
        } catch {
          return jsonResponse({ error: 'INVALID_JSON', message: 'Request body must be valid JSON' }, 400);
        }

        const { launchCode, idempotencyKey } = body;
        if (!launchCode) {
          return jsonResponse({ error: 'LAUNCH_CODE_REQUIRED', message: 'Launch code is required' }, 400);
        }

        if (!gameKey) {
          console.error('[AUTH ERROR] Missing HELLOBOSS_GAME_KEY in environment variables');
          return jsonResponse({
            error: 'CONFIGURATION_ERROR',
            message: 'Server secret HELLOBOSS_GAME_KEY is not configured on Cloudflare Worker.',
          }, 401);
        }

        // Call Portal Server-to-Server
        const verifyResp = await fetch(`${portalUrl}/api/v1/games/verify-player`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Game-Id': gameId,
            'X-Game-Key': gameKey,
          },
          body: JSON.stringify({
            launchCode,
            idempotencyKey: idempotencyKey || generateId('vkey'),
          }),
        });

        const verifyData: any = await verifyResp.json().catch(() => ({}));

        if (!verifyResp.ok || !verifyData.valid) {
          console.error('[PORTAL VERIFY FAILED]', verifyResp.status, verifyData);
          return jsonResponse({
            error: verifyData.error || 'VERIFY_FAILED',
            message: verifyData.message || 'Verification with HelloBoss portal failed',
          }, verifyResp.status || 400);
        }

        const player = verifyData.player;
        const userId = player.id;
        const turnsBalance = verifyData.turnsBalance ?? 0;

        // Upsert player profile in DB
        const now = Date.now();
        const sessionToken = generateId('btk');
        const expiresAt = now + 7 * 24 * 60 * 60 * 1000; // 7 days TTL

        if (env.DB) {
          await env.DB.prepare(
            `INSERT INTO player_profiles (user_id, name, email, image, updated_at, created_at)
             VALUES (?, ?, ?, ?, ?, ?)
             ON CONFLICT(user_id) DO UPDATE SET
               name = excluded.name,
               email = excluded.email,
               image = excluded.image,
               updated_at = excluded.updated_at`
          ).bind(userId, player.name || 'Bingo Player', player.email || '', player.image || '', now, now).run();

          await env.DB.prepare(
            'INSERT INTO auth_tokens (token, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)'
          ).bind(sessionToken, userId, expiresAt, now).run();
        }

        const cookieValue = `bingo_token=${sessionToken}; Path=/; Max-Age=604800; HttpOnly; Secure; SameSite=None; Partitioned`;

        return jsonResponse(
          {
            success: true,
            token: sessionToken,
            player: {
              id: userId,
              name: player.name || 'Bingo Player',
              email: player.email || '',
              image: player.image || '',
            },
            turnsBalance,
          },
          200,
          { 'Set-Cookie': cookieValue }
        );
      }

      // 3. Get Auth Session & Live Balance
      if (url.pathname === '/api/auth/session' && request.method === 'GET') {
        const auth = await getAuthenticatedUser(request, env);
        if (!auth) {
          return jsonResponse({ authenticated: false }, 200);
        }

        let playerProfile: any = { id: auth.userId, name: 'Bingo Player' };
        if (env.DB) {
          const row = await env.DB
            .prepare('SELECT user_id, name, email, image, best_score, total_games_played FROM player_profiles WHERE user_id = ?')
            .bind(auth.userId)
            .first();
          if (row) {
            playerProfile = {
              id: row.user_id,
              name: row.name,
              email: row.email,
              image: row.image,
              bestScore: row.best_score,
              totalGamesPlayed: row.total_games_played,
            };
          }
        }

        // Fetch live turn balance from Portal if gameKey is available
        let turnsBalance = 0;
        if (gameKey) {
          try {
            const turnsResp = await fetch(`${portalUrl}/api/v1/games/player-turns?userId=${encodeURIComponent(auth.userId)}`, {
              headers: {
                'X-Game-Id': gameId,
                'X-Game-Key': gameKey,
              },
            });
            if (turnsResp.ok) {
              const turnsData: any = await turnsResp.json();
              turnsBalance = turnsData.turnsBalance ?? 0;
            }
          } catch (e) {
            console.warn('Failed to fetch live balance from portal:', e);
          }
        }

        return jsonResponse({
          authenticated: true,
          player: playerProfile,
          turnsBalance,
        });
      }

      // 4. Logout
      if (url.pathname === '/api/auth/logout' && request.method === 'POST') {
        const token = extractToken(request);
        if (token && env.DB) {
          await env.DB.prepare('DELETE FROM auth_tokens WHERE token = ?').bind(token).run();
        }
        return jsonResponse(
          { success: true },
          200,
          { 'Set-Cookie': 'bingo_token=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=None; Partitioned' }
        );
      }

      // 5. Query turns balance directly
      if (url.pathname === '/api/player/turns' && request.method === 'GET') {
        const auth = await getAuthenticatedUser(request, env);
        if (!auth) {
          return jsonResponse({ error: 'UNAUTHORIZED', message: 'Authentication required' }, 401);
        }

        let turnsBalance = 0;
        if (gameKey) {
          const turnsResp = await fetch(`${portalUrl}/api/v1/games/player-turns?userId=${encodeURIComponent(auth.userId)}`, {
            headers: {
              'X-Game-Id': gameId,
              'X-Game-Key': gameKey,
            },
          });
          if (turnsResp.ok) {
            const turnsData: any = await turnsResp.json();
            turnsBalance = turnsData.turnsBalance ?? 0;
          }
        }

        return jsonResponse({
          success: true,
          userId: auth.userId,
          turnsBalance,
        });
      }

      // 6. Start Round (Deduct 1 Turn with Idempotency)
      if (url.pathname === '/api/rounds/start' && request.method === 'POST') {
        const auth = await getAuthenticatedUser(request, env);
        if (!auth) {
          return jsonResponse({ error: 'UNAUTHORIZED', message: 'Authentication required' }, 401);
        }

        let body: any = {};
        try {
          body = await request.json();
        } catch {
          return jsonResponse({ error: 'INVALID_JSON', message: 'Request body must be valid JSON' }, 400);
        }

        const { idempotencyKey, boardCount = 1, metadata = {} } = body;
        if (!idempotencyKey) {
          return jsonResponse({ error: 'IDEMPOTENCY_KEY_REQUIRED', message: 'idempotencyKey is required' }, 400);
        }

        // Idempotency check: does this round already exist in DB?
        if (env.DB) {
          const existing = await env.DB
            .prepare('SELECT id, session_id, board_count, status, created_at FROM game_sessions WHERE idempotency_key = ? AND user_id = ?')
            .bind(idempotencyKey, auth.userId)
            .first();

          if (existing) {
            return jsonResponse({
              success: true,
              sessionId: existing.session_id || existing.id,
              gameSessionId: existing.id,
              boardCount: existing.board_count,
              status: existing.status,
              isRetry: true,
            });
          }
        }

        if (!gameKey) {
          console.error('[ROUND START ERROR] Missing HELLOBOSS_GAME_KEY in environment');
          return jsonResponse({
            error: 'CONFIGURATION_ERROR',
            message: 'Server secret HELLOBOSS_GAME_KEY is not configured on Cloudflare Worker.',
          }, 401);
        }

        // Deduct turn on HelloBoss Portal Server-to-Server
        const roundResp = await fetch(`${portalUrl}/api/v1/games/rounds/start`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Game-Id': gameId,
            'X-Game-Key': gameKey,
          },
          body: JSON.stringify({
            userId: auth.userId,
            idempotencyKey,
            metadata: {
              boardCount,
              ...metadata,
            },
          }),
        });

        const roundData: any = await roundResp.json().catch(() => ({}));

        if (!roundResp.ok) {
          console.error('[PORTAL ROUND START ERROR]', roundResp.status, roundData);
          return jsonResponse({
            error: roundData.error || 'ROUND_START_FAILED',
            message: roundData.message || 'Could not authorize new round',
            turnsRemaining: roundData.turnsRemaining ?? 0,
          }, roundResp.status);
        }

        const now = Date.now();
        const internalSessionId = generateId('bgs');
        const portalSessionId = roundData.sessionId || internalSessionId;

        if (env.DB) {
          await env.DB.prepare(
            `INSERT INTO game_sessions (id, user_id, session_id, idempotency_key, board_count, status, metadata, created_at)
             VALUES (?, ?, ?, ?, ?, 'IN_PROGRESS', ?, ?)`
          ).bind(internalSessionId, auth.userId, portalSessionId, idempotencyKey, boardCount, JSON.stringify(metadata), now).run();

          await env.DB.prepare(
            'UPDATE player_profiles SET total_games_played = total_games_played + 1, updated_at = ? WHERE user_id = ?'
          ).bind(now, auth.userId).run();
        }

        return jsonResponse({
          success: true,
          sessionId: portalSessionId,
          gameSessionId: internalSessionId,
          turnsRemaining: roundData.turnsRemaining,
          turnsDeducted: roundData.turnsDeducted ?? 1,
          startedAt: roundData.startedAt || now,
          isRetry: !!roundData.isRetry,
        });
      }

      // 7. Finish Round (Outcome: COMPLETED)
      if (url.pathname === '/api/rounds/finish' && request.method === 'POST') {
        const auth = await getAuthenticatedUser(request, env);
        if (!auth) {
          return jsonResponse({ error: 'UNAUTHORIZED', message: 'Authentication required' }, 401);
        }

        let body: any = {};
        try {
          body = await request.json();
        } catch {
          return jsonResponse({ error: 'INVALID_JSON', message: 'Request body must be valid JSON' }, 400);
        }

        const { sessionId, score = 0, outcome = 'COMPLETED', metadata = {} } = body;
        const now = Date.now();

        if (env.DB) {
          if (sessionId) {
            await env.DB.prepare(
              `UPDATE game_sessions
               SET status = 'COMPLETED', score = ?, finished_at = ?, metadata = ?
               WHERE (session_id = ? OR id = ?) AND user_id = ?`
            ).bind(score, now, JSON.stringify(metadata), sessionId, sessionId, auth.userId).run();
          }

          await env.DB.prepare(
            `UPDATE player_profiles
             SET best_score = MAX(best_score, ?), updated_at = ?
             WHERE user_id = ?`
          ).bind(score, now, auth.userId).run();
        }

        // Report outcome to Portal if gameKey and sessionId are available
        if (gameKey && sessionId) {
          try {
            await fetch(`${portalUrl}/api/v1/games/sessions/finish`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'X-Game-Id': gameId,
                'X-Game-Key': gameKey,
              },
              body: JSON.stringify({
                sessionId,
                userId: auth.userId,
                outcome,
                metadata: {
                  score,
                  ...metadata,
                },
              }),
            });
          } catch (e) {
            console.warn('Failed to report session finish to portal:', e);
          }
        }

        return jsonResponse({ success: true, status: 'COMPLETED' });
      }

      // 8. Get/Update Game State
      if (url.pathname === '/api/game/state') {
        const auth = await getAuthenticatedUser(request, env);
        if (!auth) {
          return jsonResponse({ error: 'UNAUTHORIZED', message: 'Authentication required' }, 401);
        }

        if (request.method === 'GET') {
          if (!env.DB) return jsonResponse({ activeSession: null });
          const row = await env.DB
            .prepare('SELECT * FROM game_sessions WHERE user_id = ? AND status = \'IN_PROGRESS\' ORDER BY created_at DESC LIMIT 1')
            .bind(auth.userId)
            .first();
          return jsonResponse({ activeSession: row || null });
        }

        if (request.method === 'POST') {
          return jsonResponse({ success: true });
        }
      }

      // 9. Dev Login (for testing and local verification)
      if (url.pathname === '/api/auth/dev-login' && request.method === 'POST') {
        let body: any = {};
        try {
          body = await request.json();
        } catch {
          body = {};
        }

        const userId = body.userId || generateId('usr_test');
        const token = `dev_token_${userId}`;
        const name = body.name || 'Test Player';
        const now = Date.now();

        if (env.DB) {
          await env.DB.prepare(
            `INSERT INTO player_profiles (user_id, name, updated_at, created_at)
             VALUES (?, ?, ?, ?)
             ON CONFLICT(user_id) DO UPDATE SET name = excluded.name, updated_at = excluded.updated_at`
          ).bind(userId, name, now, now).run();

          await env.DB.prepare(
            'INSERT INTO auth_tokens (token, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)'
          ).bind(token, userId, now + 86400000, now).run();
        }

        const cookieValue = `bingo_token=${token}; Path=/; Max-Age=86400; HttpOnly; Secure; SameSite=None; Partitioned`;
        return jsonResponse({
          success: true,
          token,
          player: { id: userId, name },
          turnsBalance: 10,
        }, 200, { 'Set-Cookie': cookieValue });
      }

      // --- STATIC ASSETS (SPA) FALLBACK ---
      if (env.ASSETS && typeof env.ASSETS.fetch === 'function') {
        return await env.ASSETS.fetch(request);
      }

      return new Response('Asset binding ASSETS is not available', {
        status: 500,
        headers: { 'Content-Type': 'text/plain' },
      });
    } catch (error: any) {
      console.error('[UNCAUGHT WORKER EXCEPTION]', error);
      return jsonResponse({
        error: 'INTERNAL_ERROR',
        message: error?.message || 'An unexpected error occurred in Worker',
      }, 500);
    }
  },
};
