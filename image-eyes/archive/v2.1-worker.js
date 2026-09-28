// ARCHIVE: the first Image Eyes (v2.1), copied from the Cloudflare dashboard
// before image-eyes/src replaced it. Kept for reference only; not deployed.
//
// Image Eyes — a remote MCP server that lets Claude actually SEE images.
// Tools:
//   search_images(query, count)  -> searches Openverse + Wikimedia Commons; returns the pictures themselves
//   view_image(url)              -> fetches one image URL and returns the picture
//
// No API keys, no accounts, no credit card. Both image sources are free and open.
// Hosted on Cloudflare Workers. Endpoint: https://<your-worker>.workers.dev/mcp/<SECRET_PATH>
// Secret (set with `wrangler secret put`): SECRET_PATH

const SERVER_INFO = { name: "image-eyes", version: "2.1.0" };
const PROTOCOL_VERSIONS = ["2025-06-18", "2025-03-26", "2024-11-05"];
const MAX_IMAGE_BYTES = 3_500_000; // stays under Claude's per-image limit once base64-encoded
const OK_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"];

const TOOLS = [
  {
    name: "search_images",
    description:
      "SEE images of a subject: searches openly licensed image libraries (Wikimedia Commons + Openverse) and " +
      "returns the actual pictures, which you can look at and describe. Best for science (cells, micrographs, " +
      "anatomy, diagrams), nature, animals, places, landmarks, history and everyday objects.\n" +
      "It will NOT find copyrighted or commercial imagery: anime/cartoon/game characters, movie stills, celebrities, " +
      "specific products, logos, memes. For those, do NOT give up: use your web search to find a page that shows the " +
      "subject (a fandom wiki, MyAnimeList, IMDb, a product page, a news article) and pass that page's URL to view_image.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Plain-English description of what to look for, e.g. 'dendritic cell micrograph'" },
        count: { type: "integer", minimum: 1, maximum: 8, default: 4 },
      },
      required: ["query"],
    },
  },
  {
    name: "view_image",
    description:
      "SEE any image on the web. Accepts EITHER a direct image URL (.jpg/.png/.webp/.gif) OR an ordinary web page URL " +
      "(a wiki article, character page, product page, news article). For a page, it finds the page's main image and " +
      "other large images and returns the actual pictures. Use this for anything search_images can't find: find a " +
      "relevant page with your web search tool first, then pass its URL here. If one page is blocked, try another site.",
    inputSchema: {
      type: "object",
      properties: {
        url: { type: "string", description: "A direct image URL or a web page URL" },
        count: {
          type: "integer",
          minimum: 1,
          maximum: 6,
          default: 3,
          description: "For page URLs: max number of images to return from the page",
        },
      },
      required: ["url"],
    },
  },
];

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const expected = `/mcp/${env.SECRET_PATH}`;

    if (!env.SECRET_PATH || url.pathname !== expected) {
      return new Response("Not found", { status: 404 });
    }
    if (request.method === "GET") {
      // No server-initiated stream; tell clients to use POST only.
      return new Response("Method not allowed", { status: 405, headers: { Allow: "POST" } });
    }
    if (request.method === "DELETE") return new Response(null, { status: 204 });
    if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });

    let body;
    try {
      body = await request.json();
    } catch {
      return json(rpcError(null, -32700, "Parse error"), 400);
    }

    if (Array.isArray(body)) {
      const out = (await Promise.all(body.map((m) => handle(m, env)))).filter(Boolean);
      return out.length ? json(out) : new Response(null, { status: 202 });
    }
    const res = await handle(body, env);
    return res ? json(res) : new Response(null, { status: 202 });
  },
};

async function handle(msg, env) {
  const { id, method, params } = msg || {};
  const isNotification = id === undefined || id === null;

  try {
    switch (method) {
      case "initialize": {
        const requested = params?.protocolVersion;
        return rpcResult(id, {
          protocolVersion: PROTOCOL_VERSIONS.includes(requested) ? requested : PROTOCOL_VERSIONS[0],
          capabilities: { tools: {} },
          serverInfo: SERVER_INFO,
          instructions:
            "Image Eyes lets you actually SEE images. Whenever the user asks what something looks like, asks you to look " +
            "something up visually, or asks you to verify a visual detail, use these tools instead of describing from memory.\n" +
            "1. Science, nature, places, general objects -> search_images.\n" +
            "2. Anything copyrighted or commercial (anime/cartoon/game characters, film, celebrities, products, logos) or " +
            "when search_images returns nothing useful -> web-search for a page showing it, then call view_image with that " +
            "page URL (or a direct image URL). Don't tell the user you can't see it until you've tried this.\n" +
            "Describe only what is visible in the returned images, and say which image you're describing.",
        });
      }
      case "ping":
        return rpcResult(id, {});
      case "tools/list":
        return rpcResult(id, { tools: TOOLS });
      case "tools/call":
        return rpcResult(id, await callTool(params?.name, params?.arguments || {}, env));
      default:
        if (isNotification) return null; // e.g. notifications/initialized
        return rpcError(id, -32601, `Method not found: ${method}`);
    }
  } catch (err) {
    if (isNotification) return null;
    return rpcError(id, -32603, String(err?.message || err));
  }
}

async function callTool(name, args, env) {
  if (name === "search_images") return searchImages(args);
  if (name === "view_image") return viewUrl(args);
  return toolError(`Unknown tool: ${name}`);
}

const UA = "image-eyes/2.1 (personal Claude connector; https://github.com/)";

async function searchImages({ query, count = 4 }) {
  if (!query || typeof query !== "string") return toolError("`query` is required.");
  const n = Math.max(1, Math.min(8, Number(count) || 4));
  const want = Math.min(20, n * 3); // extra results in case some fail to load

  const [ov, wm] = await Promise.all([
    openverse(query, want).catch(() => []),
    wikimedia(query, want).catch(() => []),
  ]);

  // Interleave the two sources, skipping duplicates.
  const results = [];
  const seen = new Set();
  for (let i = 0; i < Math.max(ov.length, wm.length); i++) {
    for (const item of [wm[i], ov[i]]) {
      if (!item) continue;
      const key = item.full || item.thumb;
      if (seen.has(key)) continue;
      seen.add(key);
      results.push(item);
    }
  }
  if (!results.length) return toolError(`No images found for "${query}".`);

  const content = [];
  let shown = 0;
  for (const item of results) {
    if (shown >= n) break;
    let img = null;
    for (const src of [item.thumb, item.full].filter(Boolean)) {
      img = await fetchImage(src);
      if (img) break;
    }
    if (!img) continue;
    shown++;
    content.push({
      type: "text",
      text:
        `Image ${shown}: ${item.title || "(untitled)"} [${item.source}]\n` +
        `Source page: ${item.page || "unknown"}\n` +
        `Full-size URL: ${item.full || "n/a"}`,
    });
    content.push({ type: "image", data: img.base64, mimeType: img.mimeType });
  }

  if (!shown) return toolError(`Found results for "${query}" but couldn't load any of the images.`);
  content.unshift({
    type: "text",
    text: `Showing ${shown} image(s) for "${query}" from Wikimedia Commons and Openverse (openly licensed images).`,
  });
  return { content };
}

async function openverse(query, limit) {
  const api = new URL("https://api.openverse.org/v1/images/");
  api.searchParams.set("q", query);
  api.searchParams.set("page_size", String(limit));
  api.searchParams.set("mature", "false");
  const r = await fetch(api, { headers: { Accept: "application/json", "User-Agent": UA } });
  if (!r.ok) return [];
  const data = await r.json();
  return (data?.results || []).map((x) => ({
    title: x.title,
    page: x.foreign_landing_url,
    full: x.url,
    thumb: x.thumbnail,
    source: `Openverse${x.source ? " / " + x.source : ""}`,
  }));
}

async function wikimedia(query, limit) {
  const api = new URL("https://commons.wikimedia.org/w/api.php");
  const p = {
    action: "query",
    format: "json",
    generator: "search",
    gsrsearch: `${query} filetype:bitmap|drawing`,
    gsrnamespace: "6",
    gsrlimit: String(limit),
    prop: "imageinfo",
    iiprop: "url|mime",
    iiurlwidth: "800",
    origin: "*",
  };
  for (const [k, v] of Object.entries(p)) api.searchParams.set(k, v);
  const r = await fetch(api, { headers: { Accept: "application/json", "User-Agent": UA } });
  if (!r.ok) return [];
  const data = await r.json();
  const pages = Object.values(data?.query?.pages || {}).sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
  return pages
    .map((pg) => {
      const info = pg.imageinfo?.[0];
      if (!info) return null;
      return {
        title: (pg.title || "").replace(/^File:/, "").replace(/\.[a-z0-9]+$/i, ""),
        page: info.descriptionurl,
        full: info.url,
        thumb: info.thumburl,
        source: "Wikimedia Commons",
      };
    })
    .filter(Boolean);
}

const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36";
const MIN_IMAGE_BYTES = 4000; // skip icons, spacers and tracking pixels on pages

async function viewUrl({ url, count = 3 }) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return toolError("`url` must be a valid http(s) URL.");
  }
  if (!/^https?:$/.test(parsed.protocol)) return toolError("Only http(s) URLs are supported.");
  const n = Math.max(1, Math.min(6, Number(count) || 3));

  let r;
  try {
    r = await fetch(parsed.toString(), {
      headers: { "User-Agent": BROWSER_UA, Accept: "image/*,text/html;q=0.9,*/*;q=0.5" },
      redirect: "follow",
    });
  } catch {
    return toolError(`Couldn't reach ${parsed.hostname}. Try a different site that shows the same thing.`);
  }
  if (!r.ok) {
    return toolError(
      `${parsed.hostname} refused the request (HTTP ${r.status}). Try a different site that shows the same thing.`
    );
  }
  const type = (r.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();

  // Direct image
  if (type.startsWith("image/")) {
    const img = await imageFromResponse(r, type, 0);
    if (!img) return toolError("That image is an unsupported format (use JPEG/PNG/GIF/WebP) or larger than 3.5 MB.");
    return {
      content: [
        { type: "text", text: `Image from ${parsed.hostname}` },
        { type: "image", data: img.base64, mimeType: img.mimeType },
      ],
    };
  }

  // Web page: collect candidate images, best first
  if (!type.includes("html")) return toolError(`That URL is neither an image nor a web page (${type || "unknown type"}).`);
  const html = (await r.text()).slice(0, 3_000_000);
  const base = r.url || parsed.toString();
  const pageTitle = decodeEntities((html.match(/<title[^>]*>([^<]*)<\/title>/i) || [])[1] || "").trim();
  const candidates = pageImageCandidates(html, base);
  if (!candidates.length) return toolError(`No images found on ${parsed.hostname}. Try another page.`);

  const content = [];
  let shown = 0;
  for (const src of candidates.slice(0, 25)) {
    if (shown >= n) break;
    const img = await fetchImage(src, { referer: base, minBytes: MIN_IMAGE_BYTES });
    if (!img) continue;
    shown++;
    content.push({ type: "text", text: `Image ${shown} from the page: ${src}` });
    content.push({ type: "image", data: img.base64, mimeType: img.mimeType });
  }
  if (!shown) return toolError(`Found images on ${parsed.hostname} but couldn't load any. Try another site.`);
  content.unshift({
    type: "text",
    text: `Showing ${shown} image(s) from "${pageTitle || parsed.hostname}" (${base}). Image 1 is the page's main image when it declares one.`,
  });
  return { content };
}

function pageImageCandidates(html, base) {
  const out = [];
  const seen = new Set();
  const add = (u) => {
    if (!u) return;
    u = decodeEntities(u.trim());
    if (u.startsWith("data:")) return;
    let abs;
    try {
      abs = new URL(u, base).toString();
    } catch {
      return;
    }
    if (!/^https?:/.test(abs) || /\.svg(\?|$)/i.test(abs)) return;
    if (/(sprite|favicon|logo|icon|avatar|badge|pixel|spacer|blank)\b/i.test(abs)) return;
    if (seen.has(abs)) return;
    seen.add(abs);
    out.push(abs);
  };

  // 1. The page's declared main image
  for (const re of [
    /<meta[^>]+(?:property|name)=["'](?:og:image(?::secure_url)?|twitter:image(?::src)?)["'][^>]*content=["']([^"']+)["']/gi,
    /<meta[^>]+content=["']([^"']+)["'][^>]*(?:property|name)=["'](?:og:image(?::secure_url)?|twitter:image(?::src)?)["']/gi,
    /<link[^>]+rel=["']image_src["'][^>]*href=["']([^"']+)["']/gi,
  ]) {
    for (const m of html.matchAll(re)) add(m[1]);
  }

  // 2. Images in the page body (lazy-load attributes first, then src; largest srcset entry)
  for (const m of html.matchAll(/<img\b[^>]*>/gi)) {
    const tag = m[0];
    const attr = (name) => (tag.match(new RegExp(`\\s${name}=["']([^"']+)["']`, "i")) || [])[1];
    const srcset = attr("srcset") || attr("data-srcset");
    let fromSet;
    if (srcset) {
      const parts = srcset.split(",").map((s) => s.trim().split(/\s+/)[0]).filter(Boolean);
      fromSet = parts[parts.length - 1];
    }
    add(attr("data-src") || attr("data-original") || attr("data-lazy-src") || fromSet || attr("src"));
  }
  return out;
}

function decodeEntities(s) {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#x2F;/gi, "/");
}

async function fetchImage(src, { referer, minBytes = 0 } = {}) {
  try {
    const headers = { "User-Agent": referer ? BROWSER_UA : UA, Accept: "image/*" };
    if (referer) headers.Referer = referer;
    const r = await fetch(src, { headers, redirect: "follow" });
    if (!r.ok) return null;
    const mimeType = (r.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
    return await imageFromResponse(r, mimeType, minBytes);
  } catch {
    return null;
  }
}

async function imageFromResponse(r, mimeType, minBytes) {
  if (!OK_TYPES.includes(mimeType)) return null;
  const len = Number(r.headers.get("content-length") || 0);
  if (len > MAX_IMAGE_BYTES) return null;
  const buf = new Uint8Array(await r.arrayBuffer());
  if (buf.length < Math.max(1, minBytes) || buf.length > MAX_IMAGE_BYTES) return null;
  return { base64: toBase64(buf), mimeType };
}

function toBase64(bytes) {
  let bin = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
  }
  return btoa(bin);
}

const rpcResult = (id, result) => ({ jsonrpc: "2.0", id, result });
const rpcError = (id, code, message) => ({ jsonrpc: "2.0", id, error: { code, message } });
const toolError = (text) => ({ content: [{ type: "text", text }], isError: true });
const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });
