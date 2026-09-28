// Image Eyes: a remote MCP server (Streamable HTTP, stateless JSON replies)
// that lets Claude look at pictures from the web and from wikis.
//
// Claude connects to https://<worker>/mcp, or /mcp/<ACCESS_KEY> when an
// ACCESS_KEY secret is set so strangers can't spend your search quota.
//
// Workers only allow handler exports from this file; the rest lives in mcp.js.

import { handleRpc, rpcError } from './mcp.js';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Accept, Authorization, Mcp-Session-Id, Mcp-Protocol-Version',
};

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...CORS } });

function authorized(pathname, env) {
  const key = env.ACCESS_KEY;
  if (!key) return pathname === '/mcp' || pathname === '/mcp/';
  return pathname === `/mcp/${key}` || pathname === `/mcp/${key}/`;
}

export default {
  async fetch(request, env = {}) {
    const url = new URL(request.url);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });

    if (url.pathname === '/' && request.method === 'GET') {
      return new Response('Image Eyes MCP server is running. Connect Claude to the /mcp address.\n', {
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      });
    }
    if (!url.pathname.startsWith('/mcp') || !authorized(url.pathname, env)) {
      return new Response('Not found\n', { status: 404 });
    }
    if (request.method !== 'POST') {
      // Stateless server: no server-to-client stream to open.
      return new Response('Method not allowed\n', { status: 405, headers: { Allow: 'POST, OPTIONS', ...CORS } });
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return json(rpcError(null, -32700, 'Parse error'), 400);
    }

    if (Array.isArray(body)) {
      const replies = (await Promise.all(body.map((m) => handleRpc(m, env)))).filter(Boolean);
      return replies.length ? json(replies) : new Response(null, { status: 202, headers: CORS });
    }
    const reply = await handleRpc(body, env);
    return reply ? json(reply) : new Response(null, { status: 202, headers: CORS });
  },
};
