export interface Env {
  ASSETS?: {
    fetch: (request: Request | string) => Promise<Response>;
  };
  DB?: any;
  HELLOBOSS_GAME_ID?: string;
  HELLOBOSS_GAME_KEY?: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      const url = new URL(request.url);

      // Health check endpoint
      if (url.pathname === '/api/health') {
        return new Response(
          JSON.stringify({
            status: 'ok',
            gameId: env.HELLOBOSS_GAME_ID || 'bingo-h5',
            timestamp: new Date().toISOString(),
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }
        );
      }

      // Serve static assets from [assets] binding
      if (env.ASSETS && typeof env.ASSETS.fetch === 'function') {
        return await env.ASSETS.fetch(request);
      }

      return new Response('Asset binding ASSETS is not available', {
        status: 500,
        headers: { 'Content-Type': 'text/plain' },
      });
    } catch (error: any) {
      return new Response(
        JSON.stringify({
          error: 'INTERNAL_ERROR',
          message: error?.message || 'An unexpected error occurred in Worker',
        }),
        {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }
  },
};
