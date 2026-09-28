// A fake internet: routes fetch() calls to canned responses.

export const PNG = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
  0x89, 0x00, 0x00, 0x00, 0x0a, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00,
  0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae,
  0x42, 0x60, 0x82,
]);
export const JPEG = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1, 0xff, 0xd9]);

export const imageResponse = (bytes = PNG, type = 'image/png') =>
  new Response(bytes, { status: 200, headers: { 'Content-Type': type, 'Content-Length': String(bytes.length) } });
export const jsonResponse = (data) => new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json' } });
export const htmlResponse = (html) => new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
export const status = (code) => new Response('nope', { status: code });

// routes: [[predicate(url, init) | RegExp, handler(url, init) → Response]]
export function mockFetch(routes) {
  const calls = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(typeof input === 'string' ? input : input.url);
    calls.push({ url, init });
    for (const [match, handler] of routes) {
      const hit = match instanceof RegExp ? match.test(url.toString()) : match(url, init);
      if (hit) return handler(url, init);
    }
    throw new TypeError(`fetch failed: no mock for ${url}`);
  };
  return { calls, restore: () => { globalThis.fetch = original; } };
}

export async function rpc(worker, body, { path = '/mcp', env = {} } = {}) {
  const res = await worker.fetch(new Request(`https://eyes.example${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
    body: JSON.stringify(body),
  }), env);
  const text = await res.text();
  let parsed = null;
  try { parsed = text ? JSON.parse(text) : null; } catch { parsed = text; }
  return { status: res.status, body: parsed };
}
