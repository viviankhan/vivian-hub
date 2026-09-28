// JSON-RPC side of the Model Context Protocol: handshake, tool list, tool calls.

import { TOOLS, callTool } from './tools.js';

export const VERSION = '3.0.0';
const PROTOCOL_VERSIONS = ['2025-06-18', '2025-03-26', '2024-11-05'];

const INSTRUCTIONS =
  'Image Eyes lets you actually SEE images. Use it whenever the user asks what something looks like or needs a visual ' +
  'detail checked, instead of describing from memory.\n' +
  '- search_images finds pictures of anything (source "web" covers characters, products and fan art; "open" is ' +
  'Wikimedia/Openverse).\n' +
  '- For a character or subject with a wiki page, call list_wiki_images on it first: the captions and section/tab labels ' +
  'tell you which picture is which version (e.g. 2011 anime vs 1999 anime vs manga). Then view_image the ones you need, ' +
  'or view_image the page with prefer, e.g. "2011 full body".\n' +
  'Describe only what is visible, and say which image (and which version) you are describing.';

export const rpcError = (id, code, message) => ({ jsonrpc: '2.0', id: id ?? null, error: { code, message } });

export async function handleRpc(msg, env) {
  if (!msg || msg.jsonrpc !== '2.0' || typeof msg.method !== 'string') {
    return rpcError(msg?.id, -32600, 'Invalid request');
  }
  const isNotification = msg.id === undefined || msg.id === null;
  if (isNotification) return null;
  const ok = (result) => ({ jsonrpc: '2.0', id: msg.id, result });

  switch (msg.method) {
    case 'initialize': {
      const asked = msg.params?.protocolVersion;
      return ok({
        protocolVersion: PROTOCOL_VERSIONS.includes(asked) ? asked : PROTOCOL_VERSIONS[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: 'image-eyes', title: 'Image Eyes', version: VERSION },
        instructions: INSTRUCTIONS,
      });
    }
    case 'ping':
      return ok({});
    case 'tools/list':
      return ok({ tools: TOOLS });
    case 'tools/call': {
      const name = msg.params?.name;
      if (!TOOLS.some((t) => t.name === name)) return rpcError(msg.id, -32602, `Unknown tool: ${name}`);
      return ok(await callTool(name, msg.params?.arguments || {}, env));
    }
    case 'resources/list':
      return ok({ resources: [] });
    case 'prompts/list':
      return ok({ prompts: [] });
    default:
      return rpcError(msg.id, -32601, `Method not found: ${msg.method}`);
  }
}

