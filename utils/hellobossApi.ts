/**
 * HelloBoss API client for Bingo Royale HTML5.
 * Strictly adheres to docs/game-api-contract.md and AGENTS.md.
 */

const TOKEN_KEY = 'bingo_token';

export interface PlayerInfo {
  id: string;
  name: string;
  email?: string;
  image?: string;
  bestScore?: number;
  totalGamesPlayed?: number;
}

export interface SessionResponse {
  authenticated: boolean;
  player?: PlayerInfo;
  turnsBalance?: number;
}

export interface ApiError extends Error {
  status?: number;
  code?: string;
  turnsRemaining?: number;
}

export function getStoredToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setStoredToken(token: string): void {
  try {
    localStorage.setItem(TOKEN_KEY, token);
  } catch (e) {
    console.warn('Failed to persist token to localStorage', e);
  }
}

export function clearStoredToken(): void {
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch (e) {
    console.warn('Failed to clear token from localStorage', e);
  }
}

export async function apiFetch<T = any>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const token = getStoredToken();
  const headers = new Headers(options.headers || {});

  if (!headers.has('Content-Type') && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const response = await fetch(endpoint, {
    ...options,
    headers,
    credentials: 'include',
  });

  const contentType = response.headers.get('content-type') || '';
  let data: any = {};

  if (contentType.includes('application/json')) {
    try {
      data = await response.json();
    } catch {
      data = {};
    }
  } else {
    const text = await response.text();
    data = { message: text };
  }

  if (!response.ok) {
    const error: ApiError = new Error(data.message || `Request failed with status ${response.status}`);
    error.status = response.status;
    error.code = data.error || 'API_ERROR';
    error.turnsRemaining = data.turnsRemaining;
    throw error;
  }

  return data as T;
}

export async function verifyLaunchCode(launchCode: string, idempotencyKey?: string) {
  const result = await apiFetch<{
    success: boolean;
    token: string;
    player: PlayerInfo;
    turnsBalance: number;
  }>('/api/auth/verify-launch-code', {
    method: 'POST',
    body: JSON.stringify({
      launchCode,
      idempotencyKey: idempotencyKey || `vkey_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
    }),
  });

  if (result.token) {
    setStoredToken(result.token);
  }

  return result;
}

export async function checkSession(): Promise<SessionResponse> {
  try {
    return await apiFetch<SessionResponse>('/api/auth/session', {
      method: 'GET',
    });
  } catch {
    return { authenticated: false };
  }
}

export async function getPlayerTurns(): Promise<{ turnsBalance: number }> {
  return await apiFetch<{ success: boolean; turnsBalance: number }>('/api/player/turns', {
    method: 'GET',
  });
}

export async function startRoundApi(boardCount: number, idempotencyKey: string, metadata: any = {}) {
  return await apiFetch<{
    success: boolean;
    sessionId: string;
    gameSessionId?: string;
    turnsRemaining: number;
    turnsDeducted: number;
    startedAt: number;
    isRetry: boolean;
  }>('/api/rounds/start', {
    method: 'POST',
    body: JSON.stringify({
      boardCount,
      idempotencyKey,
      metadata,
    }),
  });
}

export async function finishRoundApi(sessionId: string, score: number, outcome = 'COMPLETED', metadata: any = {}) {
  try {
    return await apiFetch<{ success: boolean; status: string }>('/api/rounds/finish', {
      method: 'POST',
      body: JSON.stringify({
        sessionId,
        score,
        outcome,
        metadata,
      }),
    });
  } catch (e) {
    console.warn('Failed to finish round on server:', e);
    return { success: false, status: 'FAILED' };
  }
}

export async function logoutApi(): Promise<void> {
  try {
    await apiFetch('/api/auth/logout', { method: 'POST' });
  } finally {
    clearStoredToken();
  }
}
