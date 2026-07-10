// Open endpoint — serves the API token to the browser as executable JS.
// Loaded via <script src="/api/v1/client-config"></script>; sets window.__API_TOKEN__.
// The token is not a long-term secret (the whole site sits behind Cloudflare Access);
// it only stops unauthenticated cross-origin calls to /api/v1/*.

export function onRequestGet({ env }) {
  const token = (env.API_TOKEN || '').trim();
  const body = `window.__API_TOKEN__=${JSON.stringify(token)};`;
  return new Response(body, {
    headers: { 'Content-Type': 'application/javascript; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}
