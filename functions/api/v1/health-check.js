// Open endpoint — uptime probe.
export function onRequestGet() {
  return new Response(JSON.stringify({ ok: true, service: 'daybook', ts: new Date().toISOString() }), {
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}
