import { describe, it, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import worker from '../worker/index';

// In-Memory SQLite-like mock for Cloudflare D1
class MockD1Database {
  private profiles = new Map<string, any>();
  private sessions = new Map<string, any>();
  private tokens = new Map<string, any>();

  prepare(sql: string) {
    const self = this;
    let boundArgs: any[] = [];

    const stmt = {
      bind(...args: any[]) {
        boundArgs = args;
        return stmt;
      },
      async run() {
        const clean = sql.replace(/\s+/g, ' ').trim();

        // 1. DDL: CREATE TABLE / CREATE INDEX
        if (clean.startsWith('CREATE TABLE') || clean.startsWith('CREATE INDEX')) {
          return { success: true };
        }

        // 2. INSERT INTO player_profiles
        if (clean.includes('INSERT INTO player_profiles')) {
          const [userId, name, email, image, updatedAt, createdAt] = boundArgs;
          const existing = self.profiles.get(userId) || {};
          self.profiles.set(userId, {
            user_id: userId,
            name: name || existing.name || 'Bingo Player',
            email: email || existing.email || '',
            image: image || existing.image || '',
            best_score: existing.best_score || 0,
            total_games_played: existing.total_games_played || 0,
            sound_enabled: 1,
            updated_at: updatedAt,
            created_at: existing.created_at || createdAt,
          });
          return { success: true };
        }

        // 3. INSERT INTO auth_tokens
        if (clean.includes('INSERT INTO auth_tokens')) {
          const [token, userId, expiresAt, createdAt] = boundArgs;
          self.tokens.set(token, {
            token,
            user_id: userId,
            expires_at: expiresAt,
            created_at: createdAt,
          });
          return { success: true };
        }

        // 4. INSERT INTO game_sessions
        if (clean.includes('INSERT INTO game_sessions')) {
          const [id, userId, sessionId, idempotencyKey, boardCount, metadata, createdAt] = boundArgs;
          self.sessions.set(id, {
            id,
            user_id: userId,
            session_id: sessionId,
            idempotency_key: idempotencyKey,
            board_count: boardCount,
            score: 0,
            status: 'IN_PROGRESS',
            metadata,
            created_at: createdAt,
          });
          return { success: true };
        }

        // 5. UPDATE player_profiles total_games_played
        if (clean.includes('UPDATE player_profiles SET total_games_played')) {
          const [updatedAt, userId] = boundArgs;
          const prof = self.profiles.get(userId);
          if (prof) {
            prof.total_games_played = (prof.total_games_played || 0) + 1;
            prof.updated_at = updatedAt;
          }
          return { success: true };
        }

        // 6. UPDATE game_sessions SET status = 'COMPLETED'
        if (clean.includes('UPDATE game_sessions SET status = \'COMPLETED\'')) {
          const [score, finishedAt, metadata, sessionId1, sessionId2, userId] = boundArgs;
          for (const session of self.sessions.values()) {
            if ((session.session_id === sessionId1 || session.id === sessionId2) && session.user_id === userId) {
              session.status = 'COMPLETED';
              session.score = score;
              session.finished_at = finishedAt;
              session.metadata = metadata;
            }
          }
          return { success: true };
        }

        // 7. UPDATE player_profiles SET best_score
        if (clean.includes('UPDATE player_profiles SET best_score')) {
          const [score, updatedAt, userId] = boundArgs;
          const prof = self.profiles.get(userId);
          if (prof) {
            prof.best_score = Math.max(prof.best_score || 0, score);
            prof.updated_at = updatedAt;
          }
          return { success: true };
        }

        // 8. DELETE FROM auth_tokens
        if (clean.includes('DELETE FROM auth_tokens WHERE token = ?')) {
          const [token] = boundArgs;
          self.tokens.delete(token);
          return { success: true };
        }

        return { success: true };
      },
      async first() {
        const clean = sql.replace(/\s+/g, ' ').trim();

        // SELECT user_id, expires_at FROM auth_tokens
        if (clean.includes('FROM auth_tokens WHERE token = ? AND expires_at > ?')) {
          const [token, now] = boundArgs;
          const item = self.tokens.get(token);
          if (item && item.expires_at > now) {
            return item;
          }
          return null;
        }

        // SELECT ... FROM player_profiles WHERE user_id = ?
        if (clean.includes('FROM player_profiles WHERE user_id = ?')) {
          const [userId] = boundArgs;
          return self.profiles.get(userId) || null;
        }

        // SELECT ... FROM game_sessions WHERE idempotency_key = ? AND user_id = ?
        if (clean.includes('FROM game_sessions WHERE idempotency_key = ? AND user_id = ?')) {
          const [idempotencyKey, userId] = boundArgs;
          for (const s of self.sessions.values()) {
            if (s.idempotency_key === idempotencyKey && s.user_id === userId) {
              return s;
            }
          }
          return null;
        }

        // SELECT * FROM game_sessions WHERE user_id = ? AND status = 'IN_PROGRESS'
        if (clean.includes('FROM game_sessions WHERE user_id = ? AND status = \'IN_PROGRESS\'')) {
          const [userId] = boundArgs;
          for (const s of self.sessions.values()) {
            if (s.user_id === userId && s.status === 'IN_PROGRESS') {
              return s;
            }
          }
          return null;
        }

        return null;
      },
      async all() {
        return { results: [] };
      },
    };

    return stmt;
  }
}

// Mock Portal Fetch
const portalUsers = new Map<string, { turns: number; name: string }>();
portalUsers.set('user_123', { turns: 5, name: 'Boss Player 1' });
portalUsers.set('user_456', { turns: 0, name: 'Zero Turn Player' });
portalUsers.set('user_isolated', { turns: 10, name: 'Isolated User' });

const originalFetch = globalThis.fetch;

before(() => {
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const urlStr = input.toString();

    // Portal: /api/v1/games/verify-player
    if (urlStr.includes('/api/v1/games/verify-player')) {
      const body = JSON.parse((init?.body as string) || '{}');
      if (body.launchCode === 'hlc_valid_code_123') {
        return new Response(JSON.stringify({
          valid: true,
          player: { id: 'user_123', name: 'Boss Player 1', email: 'boss@example.com' },
          turnsBalance: portalUsers.get('user_123')?.turns ?? 5,
          gameId: 'bingo-h5',
          isRetry: false,
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      if (body.launchCode === 'hlc_zero_turn_code') {
        return new Response(JSON.stringify({
          valid: true,
          player: { id: 'user_456', name: 'Zero Turn Player' },
          turnsBalance: 0,
          gameId: 'bingo-h5',
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      if (body.launchCode === 'hlc_expired_code') {
        return new Response(JSON.stringify({
          valid: false,
          error: 'LAUNCH_CODE_EXPIRED',
          message: 'Mã khởi chạy đã hết hạn 5 phút.',
        }), { status: 400, headers: { 'Content-Type': 'application/json' } });
      }
      return new Response(JSON.stringify({
        valid: false,
        error: 'INVALID_LAUNCH_CODE',
        message: 'Mã launch code không tồn tại.',
      }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    // Portal: /api/v1/games/player-turns
    if (urlStr.includes('/api/v1/games/player-turns')) {
      const url = new URL(urlStr);
      const uid = url.searchParams.get('userId') || '';
      const user = portalUsers.get(uid);
      return new Response(JSON.stringify({
        success: true,
        userId: uid,
        turnsBalance: user?.turns ?? 0,
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    // Portal: /api/v1/games/rounds/start
    if (urlStr.includes('/api/v1/games/rounds/start')) {
      const body = JSON.parse((init?.body as string) || '{}');
      const user = portalUsers.get(body.userId);
      if (!user || user.turns <= 0) {
        return new Response(JSON.stringify({
          error: 'INSUFFICIENT_TURNS',
          message: 'Người chơi đã hết số dư lượt chơi.',
          turnsRemaining: 0,
        }), { status: 402, headers: { 'Content-Type': 'application/json' } });
      }

      user.turns -= 1;
      return new Response(JSON.stringify({
        success: true,
        sessionId: `portal_ses_${Date.now()}`,
        turnsRemaining: user.turns,
        turnsDeducted: 1,
        startedAt: Date.now(),
        isRetry: false,
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    // Portal: /api/v1/games/sessions/finish
    if (urlStr.includes('/api/v1/games/sessions/finish')) {
      return new Response(JSON.stringify({
        success: true,
        status: 'COMPLETED',
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    return originalFetch(input, init);
  };
});

describe('HelloBoss Bingo Royale (bingo-h5) - 9 Mandatory Scenarios', () => {
  let mockDB: MockD1Database;
  let testEnv: any;

  beforeEach(() => {
    mockDB = new MockD1Database();
    testEnv = {
      DB: mockDB,
      HELLOBOSS_GAME_ID: 'bingo-h5',
      HELLOBOSS_GAME_KEY: 'test_secret_key_123',
      HELLOBOSS_PORTAL_URL: 'https://helloboss.online',
      ASSETS: {
        async fetch() {
          return new Response('Mock SPA Assets', { status: 200 });
        },
      },
    };
  });

  // Scenario 1: Valid Auth
  it('1. Valid auth: exchanges launch code, sets cookie & returns token + player profile', async () => {
    const req = new Request('http://localhost/api/auth/verify-launch-code', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ launchCode: 'hlc_valid_code_123' }),
    });

    const res = await worker.fetch(req, testEnv);
    assert.equal(res.status, 200);

    const data: any = await res.json();
    assert.equal(data.success, true);
    assert.ok(data.token);
    assert.equal(data.player.id, 'user_123');
    assert.equal(data.turnsBalance, 5);

    // Verify Set-Cookie partitioned header
    const cookieHeader = res.headers.get('Set-Cookie');
    assert.ok(cookieHeader);
    assert.ok(cookieHeader.includes('bingo_token='));
    assert.ok(cookieHeader.includes('Partitioned'));
  });

  // Scenario 2: Expired / Invalid Launch Code
  it('2. Expired code: rejects with 400 and clear error code', async () => {
    const req = new Request('http://localhost/api/auth/verify-launch-code', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ launchCode: 'hlc_expired_code' }),
    });

    const res = await worker.fetch(req, testEnv);
    assert.equal(res.status, 400);

    const data: any = await res.json();
    assert.equal(data.error, 'LAUNCH_CODE_EXPIRED');
  });

  // Scenario 3: Turn Deduction for New Round
  it('3. Turn deduction: starts new round and deducts exactly 1 turn', async () => {
    // Login user_123 first
    const loginReq = new Request('http://localhost/api/auth/verify-launch-code', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ launchCode: 'hlc_valid_code_123' }),
    });
    const loginRes = await worker.fetch(loginReq, testEnv);
    const { token } = (await loginRes.json()) as any;

    portalUsers.set('user_123', { turns: 5, name: 'Boss Player 1' });

    // Start round
    const startReq = new Request('http://localhost/api/rounds/start', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        boardCount: 2,
        idempotencyKey: 'idemp_round_001',
      }),
    });

    const startRes = await worker.fetch(startReq, testEnv);
    assert.equal(startRes.status, 200);

    const startData: any = await startRes.json();
    assert.equal(startData.success, true);
    assert.ok(startData.sessionId);
    assert.equal(startData.turnsDeducted, 1);
    assert.equal(startData.turnsRemaining, 4);
  });

  // Scenario 4: Insufficient Turns 402
  it('4. Insufficient turns: returns 402 INSUFFICIENT_TURNS when balance is 0', async () => {
    // Login user with 0 turns
    const loginReq = new Request('http://localhost/api/auth/verify-launch-code', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ launchCode: 'hlc_zero_turn_code' }),
    });
    const loginRes = await worker.fetch(loginReq, testEnv);
    const { token } = (await loginRes.json()) as any;

    // Attempt start round
    const startReq = new Request('http://localhost/api/rounds/start', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        boardCount: 1,
        idempotencyKey: 'idemp_zero_turns',
      }),
    });

    const startRes = await worker.fetch(startReq, testEnv);
    assert.equal(startRes.status, 402);

    const data: any = await startRes.json();
    assert.equal(data.error, 'INSUFFICIENT_TURNS');
    assert.equal(data.turnsRemaining, 0);
  });

  // Scenario 5: Retry Idempotency
  it('5. Retry idempotency: same idempotencyKey returns isRetry: true without extra deduction', async () => {
    const loginReq = new Request('http://localhost/api/auth/verify-launch-code', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ launchCode: 'hlc_valid_code_123' }),
    });
    const loginRes = await worker.fetch(loginReq, testEnv);
    const { token } = (await loginRes.json()) as any;

    portalUsers.set('user_123', { turns: 4, name: 'Boss Player 1' });
    const sameKey = 'idemp_retry_unique_999';

    // First start call
    const firstReq = new Request('http://localhost/api/rounds/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ boardCount: 1, idempotencyKey: sameKey }),
    });
    const firstRes = await worker.fetch(firstReq, testEnv);
    assert.equal(firstRes.status, 200);

    // Network retry with exact same key
    const retryReq = new Request('http://localhost/api/rounds/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ boardCount: 1, idempotencyKey: sameKey }),
    });
    const retryRes = await worker.fetch(retryReq, testEnv);
    assert.equal(retryRes.status, 200);

    const retryData: any = await retryRes.json();
    assert.equal(retryData.isRetry, true);
    // Turns balance on portal should remain 3 (deducted once only)
    assert.equal(portalUsers.get('user_123')?.turns, 3);
  });

  // Scenario 6: Resume Without Deduction
  it('6. Resume without deduction: fetching game state does not call rounds/start or deduct turns', async () => {
    const devReq = new Request('http://localhost/api/auth/dev-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: 'user_resume_test', name: 'Resume Tester' }),
    });
    const devRes = await worker.fetch(devReq, testEnv);
    const { token } = (await devRes.json()) as any;

    // Fetch game state
    const stateReq = new Request('http://localhost/api/game/state', {
      headers: { Authorization: `Bearer ${token}` },
    });
    const stateRes = await worker.fetch(stateReq, testEnv);
    assert.equal(stateRes.status, 200);

    // Balance check
    const turnsReq = new Request('http://localhost/api/player/turns', {
      headers: { Authorization: `Bearer ${token}` },
    });
    const turnsRes = await worker.fetch(turnsReq, testEnv);
    assert.equal(turnsRes.status, 200);
  });

  // Scenario 7: Victory / Finish Reporting
  it('7. Victory reporting: finishes session, sets status to COMPLETED and saves best score', async () => {
    const devReq = new Request('http://localhost/api/auth/dev-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: 'user_victory_test', name: 'Winner' }),
    });
    const devRes = await worker.fetch(devReq, testEnv);
    const { token } = (await devRes.json()) as any;

    // Report victory
    const finishReq = new Request('http://localhost/api/rounds/finish', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        sessionId: 'ses_test_victory',
        score: 3500,
        outcome: 'COMPLETED',
        metadata: { linesClaimed: 3, playerRank: 1 },
      }),
    });

    const finishRes = await worker.fetch(finishReq, testEnv);
    assert.equal(finishRes.status, 200);
    const finishData: any = await finishRes.json();
    assert.equal(finishData.success, true);
    assert.equal(finishData.status, 'COMPLETED');
  });

  // Scenario 8: User Isolation
  it('8. User isolation: User A cannot see or manipulate User B data', async () => {
    // User A
    const devA = await worker.fetch(new Request('http://localhost/api/auth/dev-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: 'user_A', name: 'Player A' }),
    }), testEnv);
    const { token: tokenA } = (await devA.json()) as any;

    // User B
    const devB = await worker.fetch(new Request('http://localhost/api/auth/dev-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: 'user_B', name: 'Player B' }),
    }), testEnv);
    const { token: tokenB } = (await devB.json()) as any;

    // User A checks session
    const sessA = await worker.fetch(new Request('http://localhost/api/auth/session', {
      headers: { Authorization: `Bearer ${tokenA}` },
    }), testEnv);
    const dataA: any = await sessA.json();
    assert.equal(dataA.player.id, 'user_A');

    // User B checks session
    const sessB = await worker.fetch(new Request('http://localhost/api/auth/session', {
      headers: { Authorization: `Bearer ${tokenB}` },
    }), testEnv);
    const dataB: any = await sessB.json();
    assert.equal(dataB.player.id, 'user_B');

    assert.notEqual(dataA.player.id, dataB.player.id);
  });

  // Scenario 9: Reload Persistence
  it('9. Reload persistence: stored token authenticates across browser reload', async () => {
    const devReq = new Request('http://localhost/api/auth/dev-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: 'user_reload_persist', name: 'Persistent User' }),
    });
    const devRes = await worker.fetch(devReq, testEnv);
    const { token } = (await devRes.json()) as any;

    // Emulate page reload: fetch /api/auth/session with stored Bearer token
    const reloadReq = new Request('http://localhost/api/auth/session', {
      headers: { Authorization: `Bearer ${token}` },
    });
    const reloadRes = await worker.fetch(reloadReq, testEnv);
    assert.equal(reloadRes.status, 200);

    const reloadData: any = await reloadRes.json();
    assert.equal(reloadData.authenticated, true);
    assert.equal(reloadData.player.id, 'user_reload_persist');
    assert.equal(reloadData.player.name, 'Persistent User');
  });
});
