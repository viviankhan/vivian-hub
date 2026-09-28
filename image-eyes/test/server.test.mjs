import test from 'node:test';
import assert from 'node:assert/strict';

import worker from '../src/index.js';
import { mockFetch, rpc, imageResponse, jsonResponse, htmlResponse, status, PNG, JPEG } from './helpers.mjs';
import { fandomRoutes } from './fixtures.mjs';

const call = (name, args, opts) => rpc(worker, { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }, opts);
const texts = (result) => result.content.filter((c) => c.type === 'text').map((c) => c.text).join('\n');
const images = (result) => result.content.filter((c) => c.type === 'image');

test('MCP handshake: initialize, initialized notification, tools/list', async () => {
  const init = await rpc(worker, { jsonrpc: '2.0', id: 0, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't', version: '1' } } });
  assert.equal(init.status, 200);
  assert.equal(init.body.result.protocolVersion, '2025-06-18');
  assert.equal(init.body.result.serverInfo.name, 'image-eyes');
  assert.ok(init.body.result.capabilities.tools);

  const note = await rpc(worker, { jsonrpc: '2.0', method: 'notifications/initialized' });
  assert.equal(note.status, 202);

  const list = await rpc(worker, { jsonrpc: '2.0', id: 2, method: 'tools/list' });
  assert.deepEqual(list.body.result.tools.map((t) => t.name), ['search_images', 'view_image', 'list_wiki_images']);

  const old = await rpc(worker, { jsonrpc: '2.0', id: 3, method: 'initialize', params: { protocolVersion: '1999-01-01' } });
  assert.equal(old.body.result.protocolVersion, '2025-06-18');
});

test('SECRET_PATH (the old worker\'s secret) hides the server everywhere except /mcp/<secret>', async () => {
  const env = { SECRET_PATH: 's3cret' };
  const ping = { jsonrpc: '2.0', id: 1, method: 'ping' };
  assert.equal((await rpc(worker, ping, { env })).status, 404);
  assert.equal((await rpc(worker, ping, { env, path: '/mcp/wrong' })).status, 404);
  assert.equal((await rpc(worker, ping, { env, path: '/mcp/s3cret' })).status, 200);
  const get = await worker.fetch(new Request('https://eyes.example/mcp/s3cret'), env);
  assert.equal(get.status, 405);
  const del = await worker.fetch(new Request('https://eyes.example/mcp/s3cret', { method: 'DELETE' }), env);
  assert.equal(del.status, 204);
  assert.equal((await rpc(worker, ping, { env: { ACCESS_KEY: 'k' }, path: '/mcp/k' })).status, 200);
});

test('view_image on a fandom page that 403s still works, via the wiki API', async () => {
  const net = mockFetch(fandomRoutes);
  try {
    const { body } = await call('view_image', { url: 'https://hunterxhunter.fandom.com/wiki/Kurapika', count: 2 });
    const r = body.result;
    assert.ok(!r.isError, texts(r));
    assert.equal(images(r).length, 2);
    assert.equal(images(r)[0].mimeType, 'image/png');
    assert.equal(images(r)[0].data, Buffer.from(PNG).toString('base64'));
    assert.match(texts(r), /section: 2011 Anime/);
    // Never scraped the blocked page, and looked like a browser to fandom.
    assert.ok(!net.calls.some((c) => c.url.pathname.startsWith('/wiki/')));
    assert.match(net.calls[0].init.headers['User-Agent'], /Chrome/);
  } finally {
    net.restore();
  }
});

test('view_image with prefer searches the gallery subpage and picks the 2011 full body', async () => {
  const net = mockFetch(fandomRoutes);
  try {
    const { body } = await call('view_image', { url: 'https://hunterxhunter.fandom.com/wiki/Kurapika', prefer: '2011 full body', count: 1 });
    const r = body.result;
    assert.equal(images(r).length, 1);
    assert.match(texts(r), /\[1\] Kurapika's full body design in the 2011 anime/);
    assert.match(texts(r), /section: 2011 Anime › Full body/);
    // 1200px wide, so the original file is sent, not a thumbnail.
    const imageCall = net.calls.find((c) => c.url.hostname === 'static.wikia.nocookie.net');
    assert.match(imageCall.url.pathname, /Kurapika_2011_full_body\.png\/revision\/latest$/);
  } finally {
    net.restore();
  }
});

test('list_wiki_images lists captions, sections, sizes and URLs; drops icons', async () => {
  const net = mockFetch(fandomRoutes);
  try {
    const { body } = await call('list_wiki_images', { url: 'https://hunterxhunter.fandom.com/wiki/Kurapika', prefer: '1999' });
    const out = texts(body.result);
    assert.ok(!body.result.isError, out);
    assert.equal(images(body.result).length, 0);
    assert.match(out, /on Kurapika, Kurapika\/Image Gallery, sorted by match to "1999"/);
    assert.match(out, /^1\. Kurapika 1999/m);
    assert.match(out, /caption: Turnaround sheet \(front, side, back\)/);
    assert.match(out, /size: 1200×3000/);
    assert.match(out, /url: https:\/\/static\.wikia\.nocookie\.net\/hunterxhunter\/images\/a\/ab\/Kurapika_manga_color\.png/);
    assert.match(out, /Kurapika infobox extra\.png/); // template-only picture still listed
    assert.doesNotMatch(out, /Wiki-icon/);
  } finally {
    net.restore();
  }
});

test('huge originals come back as the 1568px copy', async () => {
  const net = mockFetch(fandomRoutes);
  try {
    await call('view_image', { url: 'https://hunterxhunter.fandom.com/wiki/Kurapika', prefer: 'turnaround', count: 1 });
    const imageCall = net.calls.find((c) => c.url.hostname === 'static.wikia.nocookie.net');
    assert.match(imageCall.url.pathname, /Kurapika_turnaround_2011\.png\/revision\/latest\/scale-to-width-down\/1568$/);
  } finally {
    net.restore();
  }
});

test('an image over the size cap falls back to the smaller copy', async () => {
  const big = new Uint8Array(3_000_000);
  big.set(PNG);
  const net = mockFetch([
    [/scale-to-width-down\/1568/, () => imageResponse(big)],
    [/scale-to-width-down\/1000/, () => imageResponse(JPEG, 'image/jpeg')],
  ]);
  try {
    const { body } = await call('view_image', { url: 'https://static.wikia.nocookie.net/hunterxhunter/images/1/1a/Beans.png/revision/latest/scale-to-width-down/250' });
    assert.equal(images(body.result)[0].mimeType, 'image/jpeg');
    assert.match(texts(body.result), /shown: .*scale-to-width-down\/1000/);
  } finally {
    net.restore();
  }
});

test('view_image on an ordinary page returns its main pictures with the page as referer', async () => {
  const photo = new Uint8Array(5000);
  photo.set(JPEG);
  const html = `<title>Kurapika | MyAnimeList</title>
    <img src="https://cdn.mal.example/images/tracker.jpg" alt="Kurapika tracking">
    <meta property="og:image" content="https://cdn.mal.example/images/characters/kurapika.jpg">
    <img src="https://cdn.mal.example/images/characters/kurapika-2.jpg" alt="Kurapika pic 2" width="225" height="350">`;
  const net = mockFetch([
    [/myanimelist\.example\/character/, () => htmlResponse(html)],
    [/tracker\.jpg/, () => imageResponse(JPEG, 'image/jpeg')],
    [/cdn\.mal\.example/, () => imageResponse(photo, 'image/jpeg')],
  ]);
  try {
    const { body } = await call('view_image', { url: 'https://myanimelist.example/character/28/Kurapika', count: 2 });
    assert.equal(images(body.result).length, 2);
    assert.doesNotMatch(texts(body.result), /image: .*tracker/);
    assert.match(texts(body.result), /Pictures from Kurapika \| MyAnimeList/);
    const imageCall = net.calls.find((c) => c.url.hostname === 'cdn.mal.example');
    assert.equal(imageCall.init.headers.Referer, 'https://myanimelist.example/character/28/Kurapika');
  } finally {
    net.restore();
  }
});

test('a blocked non-wiki page explains what to try instead', async () => {
  const net = mockFetch([[/blocked\.example/, () => status(403)]]);
  try {
    const { body } = await call('view_image', { url: 'https://blocked.example/character' });
    assert.equal(body.result.isError, true);
    assert.match(texts(body.result), /answered 403.*blocking automated visits/s);
  } finally {
    net.restore();
  }
});

test('search_images uses Google Images through SerpApi when its key is set', async () => {
  const net = mockFetch([
    [/serpapi\.com/, (u) => jsonResponse({
      images_results: [
        { title: 'Kurapika full body 2011', link: 'https://hunterxhunter.fandom.com/wiki/Kurapika', source: 'Fandom', original: 'https://i.example/kura-full.png', original_width: 900, original_height: 2000, thumbnail: 'https://thumb.example/1.jpg' },
        { title: 'Broken', link: 'https://x.example', original: 'https://i.example/broken.png', thumbnail: 'https://thumb.example/2.jpg' },
        { title: 'Second', link: 'https://y.example', original: 'https://i.example/second.png', thumbnail: 'https://thumb.example/3.jpg' },
      ],
      q: u.searchParams.get('q'),
    })],
    [/i\.example\/broken/, () => status(404)],
    [/thumb\.example\/2/, () => status(404)],
    [/i\.example|thumb\.example/, () => imageResponse()],
  ]);
  try {
    const { body } = await call('search_images', { query: 'Kurapika 2011 full body', count: 2 }, { env: { SERPAPI_KEY: 'k' } });
    const r = body.result;
    assert.equal(images(r).length, 2);
    assert.match(texts(r), /in Google Images \(SerpApi\)/);
    assert.match(texts(r), /page: https:\/\/hunterxhunter\.fandom\.com\/wiki\/Kurapika/);
    assert.match(texts(r), /\[2\] Second/);
    const q = net.calls.find((c) => c.url.hostname === 'serpapi.com').url.searchParams;
    assert.equal(q.get('engine'), 'google_images');
  } finally {
    net.restore();
  }
});

test('search_images uses Brave when only its key is set', async () => {
  const net = mockFetch([
    [/api\.search\.brave\.com/, (u, init) => {
      assert.equal(init.headers['X-Subscription-Token'], 'b');
      return jsonResponse({ results: [{ title: 'Gon', url: 'https://page.example/gon', source: 'page.example', properties: { url: 'https://img.example/gon.png', width: 800, height: 1200 }, thumbnail: { src: 'https://imgs.search.brave.com/t.jpg' } }] });
    }],
    [/img\.example/, () => imageResponse()],
  ]);
  try {
    const { body } = await call('search_images', { query: 'Gon Freecss 2011', count: 1 }, { env: { BRAVE_API_KEY: 'b' } });
    assert.equal(images(body.result).length, 1);
    assert.match(texts(body.result), /Brave Images/);
  } finally {
    net.restore();
  }
});

test('search_images without a key searches the open libraries and says so', async () => {
  const net = mockFetch([
    [/commons\.wikimedia\.org/, (u, init) => {
      assert.match(init.headers['User-Agent'], /^ImageEyes/);
      return jsonResponse({ query: { pages: [{ title: 'File:Dendritic cell.jpg', index: 1, imageinfo: [{ url: 'https://upload.wikimedia.org/wikipedia/commons/a/ab/Dendritic_cell.jpg', thumburl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Dendritic_cell.jpg/1568px-Dendritic_cell.jpg', width: 1000, height: 800, descriptionurl: 'https://commons.wikimedia.org/wiki/File:Dendritic_cell.jpg' }] }] } });
    }],
    [/api\.openverse\.org/, () => jsonResponse({ results: [{ title: 'DC micrograph', url: 'https://ov.example/dc.jpg', foreign_landing_url: 'https://flickr.example/dc', source: 'flickr', thumbnail: 'https://api.openverse.org/v1/images/x/thumb/' }] })],
    [/upload\.wikimedia\.org|ov\.example/, () => imageResponse(JPEG, 'image/jpeg')],
  ]);
  try {
    const { body } = await call('search_images', { query: 'dendritic cell micrograph', count: 2, source: 'web' });
    const out = texts(body.result);
    assert.equal(images(body.result).length, 2);
    assert.match(out, /Wikimedia Commons \+ Openverse/);
    assert.match(out, /no SERPAPI_KEY or BRAVE_API_KEY/);
  } finally {
    net.restore();
  }
});

test('bad input comes back as a tool error, not a crash', async () => {
  const bad = await call('view_image', { url: 'not a url' });
  assert.equal(bad.body.result.isError, true);
  const unknown = await call('nope', {});
  assert.equal(unknown.body.error.code, -32602);
  const parse = await worker.fetch(new Request('https://eyes.example/mcp', { method: 'POST', body: '{' }), {});
  assert.equal(parse.status, 400);
});
