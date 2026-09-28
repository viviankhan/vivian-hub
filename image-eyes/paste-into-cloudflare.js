// Image Eyes 3.0 — the whole connector in one file, for pasting into the Cloudflare dashboard (Workers & Pages → image-eyes → Edit code).
// Built from image-eyes/src in github.com/viviankhan/vivian-hub; edit those files, not this one, and rebuild with: npm run bundle

// src/fetch.js
var BROWSER_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";
var TOOL_UA = "ImageEyes/1.0 (personal MCP image connector; https://github.com/viviankhan/vivian-hub)";
var WIKIMEDIA_HOST = /(^|\.)(wikipedia|wikimedia|wiktionary|wikidata|wikiquote|wikibooks)\.org$/;
var DEFAULT_MAX_IMAGE_BYTES = 25e5;
function headersFor(url, { accept, referer } = {}) {
  const host = new URL(url).hostname;
  const h = {
    "User-Agent": WIKIMEDIA_HOST.test(host) ? TOOL_UA : BROWSER_UA,
    Accept: accept || "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9"
  };
  if (referer) h.Referer = referer;
  return h;
}
var FetchError = class extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
};
async function fetchWithHeaders(url, opts = {}) {
  let res;
  try {
    res = await fetch(url, {
      headers: headersFor(url, opts),
      redirect: "follow",
      signal: AbortSignal.timeout(opts.timeoutMs || 15e3)
    });
  } catch (err) {
    throw new FetchError(`couldn't reach ${new URL(url).hostname} (${err.name === "TimeoutError" ? "timed out" : err.message})`);
  }
  if (!res.ok) throw new FetchError(`${new URL(url).hostname} answered ${res.status}`, res.status);
  return res;
}
async function fetchJson(url, opts = {}) {
  const res = await fetchWithHeaders(url, { accept: "application/json", ...opts });
  try {
    return await res.json();
  } catch {
    throw new FetchError(`${new URL(url).hostname} didn't return JSON`);
  }
}
function sniffImageType(bytes) {
  const b = bytes;
  if (b.length >= 8 && b[0] === 137 && b[1] === 80 && b[2] === 78 && b[3] === 71) return "image/png";
  if (b.length >= 3 && b[0] === 255 && b[1] === 216 && b[2] === 255) return "image/jpeg";
  if (b.length >= 6 && b[0] === 71 && b[1] === 73 && b[2] === 70) return "image/gif";
  if (b.length >= 12 && b[0] === 82 && b[1] === 73 && b[2] === 70 && b[3] === 70 && b[8] === 87 && b[9] === 69 && b[10] === 66 && b[11] === 80) return "image/webp";
  return null;
}
function toBase64(bytes) {
  if (typeof Buffer !== "undefined") return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString("base64");
  let s = "";
  for (let i = 0; i < bytes.length; i += 32768) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 32768));
  return btoa(s);
}
var IMAGE_ACCEPT = "image/webp,image/png,image/jpeg,image/gif;q=0.9,*/*;q=0.5";
function bytesToImage(bytes, maxBytes2, minBytes = 0) {
  if (bytes.length > maxBytes2) throw new FetchError(`too large (${(bytes.length / 1e6).toFixed(1)} MB)`);
  if (bytes.length < minBytes) throw new FetchError("too small to be a real picture");
  const mimeType = sniffImageType(bytes);
  if (!mimeType) throw new FetchError("not a PNG, JPEG, GIF or WebP image");
  return { mimeType, data: toBase64(bytes), bytes: bytes.length };
}
async function loadImage(sources, { referer, maxBytes: maxBytes2 = DEFAULT_MAX_IMAGE_BYTES, minBytes = 0 } = {}) {
  let lastErr;
  for (const src of sources.filter(Boolean)) {
    try {
      const res = await fetchWithHeaders(src, { accept: IMAGE_ACCEPT, referer });
      const len = Number(res.headers.get("content-length"));
      if (len && len > maxBytes2) {
        res.body?.cancel().catch(() => {
        });
        lastErr = new FetchError(`too large (${(len / 1e6).toFixed(1)} MB)`);
        continue;
      }
      const bytes = new Uint8Array(await res.arrayBuffer());
      return { ...bytesToImage(bytes, maxBytes2, minBytes), url: src };
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr || new FetchError("no image URL to load");
}

// src/rank.js
function normalize(text2) {
  return " " + String(text2 || "").toLowerCase().replace(/%20/g, " ").replace(/[_\-./()[\],:;|"'!?#]+/g, " ").replace(/\s+/g, " ").trim() + " ";
}
function parsePrefer(prefer) {
  const include = [];
  const exclude = [];
  const phrases = [];
  const re = /(-?)"([^"]+)"|(-?)(\S+)/g;
  let m;
  while (m = re.exec(String(prefer || ""))) {
    if (m[2] !== void 0) {
      const phrase = normalize(m[2]).trim();
      if (!phrase) continue;
      (m[1] ? exclude : phrases).push(phrase);
    } else {
      const word = normalize(m[4]).trim();
      if (!word) continue;
      (m[3] ? exclude : include).push(word);
    }
  }
  const pairs = [];
  for (let i = 0; i + 1 < include.length; i++) pairs.push(`${include[i]} ${include[i + 1]}`);
  return { include, exclude, phrases, pairs };
}
function score(text2, p) {
  const t = normalize(text2);
  let s = 0;
  for (const w of p.include) if (t.includes(w)) s += 1;
  for (const ph of p.phrases) if (t.includes(ph)) s += 2;
  for (const pair of p.pairs) if (t.includes(pair)) s += 0.5;
  for (const w of p.exclude) if (t.includes(w)) s -= 3;
  return s;
}
function rankByPrefer(items, prefer, textOf) {
  const p = parsePrefer(prefer);
  if (!p.include.length && !p.phrases.length && !p.exclude.length) return items.slice();
  return items.map((item, i) => ({ item, i, s: score(textOf(item), p) })).sort((a, b) => b.s - a.s || a.i - b.i).map((x) => Object.assign(x.item, { matchScore: x.s }));
}

// src/html.js
var ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", "#39": "'", nbsp: " " };
function decodeEntities(s) {
  return String(s || "").replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (all, e) => {
    if (e[0] === "#") {
      const code = e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : all;
    }
    return ENTITIES[e.toLowerCase()] ?? all;
  });
}
function parseAttrs(tag) {
  const attrs = {};
  const re = /([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g;
  let m;
  while (m = re.exec(tag)) attrs[m[1].toLowerCase()] = decodeEntities(m[2] ?? m[3] ?? m[4] ?? "");
  return attrs;
}
function largestFromSrcset(srcset) {
  let best = null;
  let bestSize = -1;
  for (const part of String(srcset || "").split(/,\s+(?=\S)/)) {
    const [u, d] = part.trim().split(/\s+/);
    if (!u) continue;
    const size2 = d ? parseFloat(d) * (/x$/i.test(d) ? 1e3 : 1) : 1;
    if (size2 > bestSize) {
      best = u;
      bestSize = size2;
    }
  }
  return best;
}
var JUNK = /(logo|icon|sprite|avatar|favicon|pixel|spacer|badge|emoji|blank|placeholder|loading|tracking|button|banner-ad|\/ads?\/)/i;
function extractPageImages(html, pageUrl2) {
  const out = [];
  const seen = /* @__PURE__ */ new Set();
  const push = (raw, info) => {
    if (!raw || /^data:/i.test(raw)) return;
    let url;
    try {
      url = new URL(raw, pageUrl2).toString();
    } catch {
      return;
    }
    if (/\.svg(\?|$)/i.test(url)) return;
    const key = url.replace(/\/revision\/latest.*$/, "").replace(/\?.*$/, "");
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ url, ...info });
  };
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const pageTitle = titleMatch ? decodeEntities(titleMatch[1]).replace(/\s+/g, " ").trim() : "";
  for (const tag of html.match(/<meta\b[^>]*>/gi) || []) {
    const a = parseAttrs(tag);
    const key = (a.property || a.name || "").toLowerCase();
    if (["og:image", "og:image:url", "og:image:secure_url", "twitter:image", "twitter:image:src"].includes(key)) {
      push(a.content, { alt: pageTitle, isMain: true });
    }
  }
  for (const tag of html.match(/<link\b[^>]*>/gi) || []) {
    const a = parseAttrs(tag);
    if ((a.rel || "").toLowerCase() === "image_src") push(a.href, { alt: pageTitle, isMain: true });
  }
  for (const tag of html.match(/<img\b[^>]*>/gi) || []) {
    const a = parseAttrs(tag);
    const src = largestFromSrcset(a["data-srcset"] || a.srcset) || a["data-src"] || a["data-original"] || a["data-lazy-src"] || a["data-image-src"] || a.src;
    const width = parseInt(a.width || a["data-width"], 10) || 0;
    const height = parseInt(a.height || a["data-height"], 10) || 0;
    if (width && width < 80 || height && height < 80) continue;
    const alt = a.alt || a.title || a["data-image-name"] || a["data-caption"] || "";
    if (JUNK.test(src || "") || JUNK.test(a.class || "")) continue;
    push(src, { alt, width, height, isMain: false });
  }
  return { pageTitle, images: out };
}
function rankPageImages(images, prefer) {
  const filename = (u) => {
    try {
      return decodeURIComponent(new URL(u).pathname);
    } catch {
      return u;
    }
  };
  const base = images.slice().sort((a, b) => b.isMain - a.isMain || b.width * b.height - a.width * a.height || 0);
  return rankByPrefer(base, prefer, (it) => `${filename(it.url)} ${it.alt}`);
}

// src/urls.js
var SHARP_WIDTH = 1568;
var FALLBACK_WIDTH = 1e3;
var FANDOM_STATIC = /^(static|vignette\d*)\.wikia\.nocookie\.net$/;
function isFandomStatic(url) {
  try {
    return FANDOM_STATIC.test(new URL(url).hostname);
  } catch {
    return false;
  }
}
function fandomResized(url, width) {
  const u = new URL(url);
  const m = u.pathname.match(/^(.*?\/revision\/[^/]+)(\/.*)?$/);
  const base = m ? m[1] : u.pathname.replace(/\/$/, "") + "/revision/latest";
  u.pathname = width ? `${base}/scale-to-width-down/${width}` : base;
  return u.toString();
}
var WIKIMEDIA_THUMB = /^(https?:\/\/upload\.wikimedia\.org\/.+?)\/thumb\/(.+?\/([^/]+))\/(?:[a-z-]*?)\d+px-[^/]+$/;
function wikimediaOriginal(url) {
  const m = url.match(WIKIMEDIA_THUMB);
  return m ? `${m[1]}/${m[2]}` : null;
}
function wikimediaResized(url, width) {
  const m = url.match(WIKIMEDIA_THUMB);
  if (!m) return null;
  const name = m[3];
  return `${m[1]}/thumb/${m[2]}/${width}px-${name}${/\.svg$/i.test(name) ? ".png" : ""}`;
}
function imageSources(url) {
  if (isFandomStatic(url)) return [fandomResized(url, SHARP_WIDTH), fandomResized(url, FALLBACK_WIDTH)];
  const original = wikimediaOriginal(url);
  if (original) {
    const list = [];
    if (!/\.svg$/i.test(original)) list.push(original);
    list.push(wikimediaResized(url, SHARP_WIDTH), wikimediaResized(url, FALLBACK_WIDTH), url);
    return [...new Set(list)];
  }
  return [url];
}
function smallerVariant(url, width = FALLBACK_WIDTH) {
  if (isFandomStatic(url)) return fandomResized(url, width);
  return wikimediaResized(url, width) || null;
}
function looksLikeImageUrl(url) {
  try {
    const u = new URL(url);
    return isFandomStatic(url) || u.hostname === "upload.wikimedia.org" || /\.(png|jpe?g|gif|webp)$/i.test(u.pathname);
  } catch {
    return false;
  }
}

// src/search.js
function webProvider(env) {
  if (env.SERPAPI_KEY) return "google";
  if (env.BRAVE_API_KEY) return "brave";
  return null;
}
async function searchGoogle(query, n, env) {
  const qs = new URLSearchParams({ engine: "google_images", q: query, api_key: env.SERPAPI_KEY, ijn: "0" });
  const data = await fetchJson(`https://serpapi.com/search.json?${qs}`);
  if (data.error) throw new Error(`SerpApi: ${data.error}`);
  return (data.images_results || []).slice(0, n).map((r) => ({
    title: r.title || "",
    pageUrl: r.link || "",
    site: r.source || "",
    width: r.original_width,
    height: r.original_height,
    url: r.original || r.thumbnail,
    sources: [...imageSources(r.original || ""), r.thumbnail].filter(Boolean)
  }));
}
async function searchBrave(query, n, env) {
  const qs = new URLSearchParams({ q: query, count: String(Math.min(n, 100)), safesearch: "strict" });
  const res = await fetch(`https://api.search.brave.com/res/v1/images/search?${qs}`, {
    headers: { Accept: "application/json", "X-Subscription-Token": env.BRAVE_API_KEY },
    signal: AbortSignal.timeout(15e3)
  });
  if (!res.ok) throw new Error(`Brave answered ${res.status}`);
  const data = await res.json();
  return (data.results || []).slice(0, n).map((r) => ({
    title: r.title || "",
    pageUrl: r.url || "",
    site: r.source || "",
    width: r.properties?.width,
    height: r.properties?.height,
    url: r.properties?.url || r.thumbnail?.src,
    sources: [...imageSources(r.properties?.url || ""), r.thumbnail?.src].filter(Boolean)
  }));
}
async function searchCommons(query, n) {
  const qs = new URLSearchParams({
    action: "query",
    format: "json",
    formatversion: "2",
    origin: "*",
    generator: "search",
    gsrsearch: `${query} filetype:bitmap|drawing`,
    gsrnamespace: "6",
    gsrlimit: String(n),
    prop: "imageinfo",
    iiprop: "url|size|mime",
    iiurlwidth: String(SHARP_WIDTH)
  });
  const data = await fetchJson(`https://commons.wikimedia.org/w/api.php?${qs}`);
  return (data.query?.pages || []).sort((a, b) => (a.index ?? 0) - (b.index ?? 0)).filter((p) => p.imageinfo?.[0]).map((p) => {
    const ii = p.imageinfo[0];
    return {
      title: p.title.replace(/^File:/, ""),
      pageUrl: ii.descriptionurl || "",
      site: "Wikimedia Commons",
      width: ii.width,
      height: ii.height,
      url: ii.url,
      sources: ii.width > SHARP_WIDTH ? [ii.thumburl, ...imageSources(ii.thumburl).slice(1)] : [ii.url, ii.thumburl]
    };
  });
}
async function searchOpenverse(query, n) {
  const qs = new URLSearchParams({ q: query, page_size: String(n), mature: "false" });
  const data = await fetchJson(`https://api.openverse.org/v1/images/?${qs}`);
  return (data.results || []).map((r) => ({
    title: r.title || "",
    pageUrl: r.foreign_landing_url || "",
    site: `Openverse (${r.source || r.provider || "open license"})`,
    width: r.width,
    height: r.height,
    url: r.url,
    sources: [...imageSources(r.url || ""), r.thumbnail].filter(Boolean)
  }));
}
function interleave(lists) {
  const out = [];
  const seen = /* @__PURE__ */ new Set();
  for (let i = 0; lists.some((l) => i < l.length); i++) {
    for (const l of lists) {
      if (i >= l.length || seen.has(l[i].url)) continue;
      seen.add(l[i].url);
      out.push(l[i]);
    }
  }
  return out;
}
async function searchImages(query, { source = "auto", n = 12, env = {} } = {}) {
  const provider = webProvider(env);
  const notes = [];
  const wantWeb = source === "web" || source === "auto" && provider;
  if (source === "web" && !provider) {
    notes.push("Web search is off because no SERPAPI_KEY or BRAVE_API_KEY is set on the server; searched the open libraries instead.");
  }
  if (wantWeb && provider) {
    try {
      const results = provider === "google" ? await searchGoogle(query, n, env) : await searchBrave(query, n, env);
      if (results.length) return { results, searched: provider === "google" ? "Google Images (SerpApi)" : "Brave Images", notes };
      notes.push("Web search found nothing; tried the open libraries.");
    } catch (err) {
      notes.push(`Web search failed (${err.message}); tried the open libraries.`);
    }
  }
  const settled = await Promise.allSettled([searchCommons(query, n), searchOpenverse(query, n)]);
  const lists = settled.filter((s) => s.status === "fulfilled").map((s) => s.value);
  for (const s of settled) if (s.status === "rejected") notes.push(`An open library failed: ${s.reason?.message}`);
  return { results: interleave(lists), searched: "Wikimedia Commons + Openverse", notes };
}

// src/wikitext.js
var FILE_PREFIX = /^\s*(file|image)\s*:\s*/i;
var IMAGE_EXT = /\.(png|jpe?g|gif|webp|svg|bmp|tiff?)$/i;
var OPTION = /^\s*(thumb|thumbnail|frame|framed|frameless|border|left|right|center|centre|none|baseline|middle|sub|super|top|text-top|bottom|text-bottom|upright(\s*=?\s*[\d.]+)?|\d*x?\d+\s*px|(link|alt|page|class|lang|upright)\s*=.*)\s*$/i;
function cleanMarkup(text2) {
  return String(text2 || "").replace(/\{\{[^{}]*\}\}/g, " ").replace(/\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/g, "$1").replace(/\[https?:\/\/\S+\s+([^\]]+)\]/g, "$1").replace(/<br\s*\/?>/gi, " ").replace(/<[^>]+>/g, "").replace(/'{2,}/g, "").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
}
function splitTopLevel(text2) {
  const parts = [];
  let depth = 0;
  let cur = "";
  for (let i = 0; i < text2.length; i++) {
    const two = text2.slice(i, i + 2);
    if (two === "[[" || two === "{{") {
      depth++;
      cur += two;
      i++;
      continue;
    }
    if ((two === "]]" || two === "}}") && depth > 0) {
      depth--;
      cur += two;
      i++;
      continue;
    }
    if (text2[i] === "|" && depth === 0) {
      parts.push(cur);
      cur = "";
      continue;
    }
    cur += text2[i];
  }
  parts.push(cur);
  return parts;
}
function fileKey(name) {
  let n = String(name || "").replace(FILE_PREFIX, "").replace(/_/g, " ").replace(/\s+/g, " ").trim();
  try {
    n = decodeURIComponent(n);
  } catch {
  }
  return n.charAt(0).toUpperCase() + n.slice(1);
}
function headingIndex(text2) {
  const out = [];
  const re = /^(={1,6})\s*(.+?)\s*\1\s*$/gm;
  let m;
  while (m = re.exec(text2)) out.push({ pos: m.index, level: m[1].length, title: cleanMarkup(m[2]) });
  return out;
}
function sectionAt(headings, pos) {
  const stack = [];
  for (const h of headings) {
    if (h.pos > pos) break;
    while (stack.length && stack[stack.length - 1].level >= h.level) stack.pop();
    stack.push(h);
  }
  return stack.map((h) => h.title).join(" \u203A ");
}
function tabIndex(text2) {
  const out = [];
  const re = /<tabber[^>]*>([\s\S]*?)<\/tabber>/gi;
  let m;
  while (m = re.exec(text2)) {
    const bodyStart = m.index + m[0].indexOf(">") + 1;
    let offset = 0;
    for (const seg of m[1].split("|-|")) {
      const eq = seg.indexOf("=");
      const label = eq > 0 ? cleanMarkup(seg.slice(0, eq)) : "";
      if (label && label.length <= 60 && !seg.slice(0, eq).includes("[[")) {
        out.push({ start: bodyStart + offset, end: bodyStart + offset + seg.length, label });
      }
      offset += seg.length + 3;
    }
  }
  return out;
}
function tabAt(tabs, pos) {
  const t = tabs.find((x) => pos >= x.start && pos < x.end);
  return t ? t.label : "";
}
function captionFrom(parts) {
  let caption = "";
  let alt = "";
  for (const p of parts) {
    const alm = p.match(/^\s*alt\s*=(.*)$/i);
    if (alm) {
      alt = alm[1];
      continue;
    }
    if (!OPTION.test(p) && p.trim()) caption = p;
  }
  return cleanMarkup(caption || alt);
}
function extractFileRefs(wikitext) {
  const text2 = String(wikitext || "");
  const headings = headingIndex(text2);
  const tabs = tabIndex(text2);
  const refs = [];
  const add = (file, caption, pos, via) => {
    const name = fileKey(file);
    if (!name || !IMAGE_EXT.test(name)) return;
    const context = [sectionAt(headings, pos), tabAt(tabs, pos)].filter(Boolean).join(" \u203A ");
    refs.push({ file: name, caption, context, via });
  };
  const galleries = [];
  const gre = /<gallery[^>]*>([\s\S]*?)<\/gallery>/gi;
  let m;
  while (m = gre.exec(text2)) {
    const start = m.index + m[0].indexOf(">") + 1;
    galleries.push([m.index, m.index + m[0].length]);
    let offset = 0;
    for (const line of m[1].split("\n")) {
      const trimmed = line.trim();
      if (trimmed) {
        const [file, ...rest] = splitTopLevel(trimmed);
        add(file, captionFrom(rest), start + offset, "gallery");
      }
      offset += line.length + 1;
    }
  }
  const inGallery = (pos) => galleries.some(([a, b]) => pos >= a && pos < b);
  const lre = /\[\[\s*(?:file|image)\s*:/gi;
  while (m = lre.exec(text2)) {
    if (inGallery(m.index)) continue;
    let depth = 0;
    let end = -1;
    for (let i = m.index; i < text2.length - 1; i++) {
      const two = text2.slice(i, i + 2);
      if (two === "[[") {
        depth++;
        i++;
      } else if (two === "]]") {
        depth--;
        i++;
        if (depth === 0) {
          end = i - 1;
          break;
        }
      }
    }
    if (end < 0) continue;
    const inner = text2.slice(m.index + 2, end);
    const [file, ...rest] = splitTopLevel(inner);
    add(file, captionFrom(rest), m.index, "link");
  }
  const tre = /\|\s*([A-Za-z0-9 _]{1,40}?)\s*=\s*((?:file:|image:)?[^|{}[\]\n<>=]+?\.(?:png|jpe?g|gif|webp|svg))\s*(?=[|\n}])/gi;
  while (m = tre.exec(text2)) {
    if (inGallery(m.index)) continue;
    add(m[2], cleanMarkup(m[1]).replace(/_/g, " "), m.index, "template");
  }
  return refs;
}

// src/wiki.js
var WIKIMEDIA_FAMILY = /(^|\.)(wikipedia|wikimedia|wiktionary|wikiquote|wikibooks|wikivoyage|wikidata)\.org$/;
function wikiFromUrl(url) {
  let u;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  let prefix = "";
  let title = "";
  const m = u.pathname.match(/^(.*?)\/wiki\/(.+)$/);
  if (m) {
    prefix = m[1];
    title = m[2];
  } else if (/\/index\.php$/.test(u.pathname) && u.searchParams.get("title")) {
    prefix = u.pathname.replace(/\/(w\/)?index\.php$/, "");
    title = u.searchParams.get("title");
  } else {
    return null;
  }
  try {
    title = decodeURIComponent(title);
  } catch {
  }
  title = title.replace(/_/g, " ").trim();
  if (!title) return null;
  const host = u.hostname;
  let apis;
  if (host.endsWith(".fandom.com") || host.endsWith(".wikia.com")) apis = [`${u.origin}${prefix}/api.php`];
  else if (WIKIMEDIA_FAMILY.test(host)) apis = [`${u.origin}/w/api.php`];
  else apis = [`${u.origin}${prefix}/api.php`, `${u.origin}/w/api.php`];
  return { apis, origin: u.origin, prefix, title };
}
function pageUrl(wiki, title) {
  return `${wiki.origin}${wiki.prefix}/wiki/${encodeURIComponent(title.replace(/ /g, "_")).replace(/%2F/g, "/").replace(/%3A/g, ":")}`;
}
async function api(wiki, params) {
  const qs = new URLSearchParams({ format: "json", formatversion: "2", ...params });
  let lastErr;
  for (const base of wiki.apis) {
    try {
      const data = await fetchJson(`${base}?${qs}`);
      wiki.apis = [base];
      return data;
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr;
}
var GALLERY_SUFFIXES = ["Gallery", "Image Gallery", "Images"];
async function existingGalleries(wiki, title) {
  const titles = GALLERY_SUFFIXES.map((s) => `${title}/${s}`);
  const data = await api(wiki, { action: "query", titles: titles.join("|"), redirects: "1" });
  return (data.query?.pages || []).filter((p) => !p.missing && !p.invalid).map((p) => p.title);
}
async function parsePage(wiki, title) {
  const data = await api(wiki, { action: "parse", page: title, prop: "wikitext|images", redirects: "1" });
  if (data.error) throw new Error(`${data.error.info || data.error.code}`);
  const parsed = data.parse || {};
  return { title: parsed.title || title, wikitext: parsed.wikitext || "", images: parsed.images || [] };
}
async function imageInfo(wiki, files) {
  const info = /* @__PURE__ */ new Map();
  for (let i = 0; i < files.length; i += 50) {
    const chunk = files.slice(i, i + 50);
    const data = await api(wiki, {
      action: "query",
      titles: chunk.map((f) => `File:${f}`).join("|"),
      prop: "imageinfo",
      iiprop: "url|size|mime",
      iiurlwidth: String(SHARP_WIDTH),
      redirects: "1"
    });
    const renamed = /* @__PURE__ */ new Map();
    for (const n of [...data.query?.normalized || [], ...data.query?.redirects || []]) renamed.set(n.to, n.from);
    for (const page of data.query?.pages || []) {
      const ii = page.imageinfo?.[0];
      if (!ii) continue;
      let asked = page.title;
      while (renamed.has(asked)) asked = renamed.get(asked);
      info.set(fileKey(asked), ii);
      info.set(fileKey(page.title), ii);
    }
  }
  return info;
}
async function listWikiImages(url, { prefer = "", includeGalleries = true } = {}) {
  const wiki = wikiFromUrl(url);
  if (!wiki) throw new Error("not a wiki page URL");
  let refs = [];
  const pagesRead = [];
  if (/^(file|image)\s*:/i.test(wiki.title)) {
    refs.push({ file: fileKey(wiki.title), caption: "", context: "", page: wiki.title });
  } else {
    const first = await parsePage(wiki, wiki.title);
    const titles = [first.title];
    if (includeGalleries && !/gallery|images$/i.test(first.title)) {
      try {
        titles.push(...await existingGalleries(wiki, first.title));
      } catch {
      }
    }
    for (const t of titles) {
      const page = t === first.title ? first : await parsePage(wiki, t).catch(() => null);
      if (!page) continue;
      pagesRead.push(page.title);
      const found = extractFileRefs(page.wikitext).map((r) => ({ ...r, page: page.title }));
      const seen = new Set(found.map((r) => r.file));
      for (const img of page.images) {
        const key = fileKey(img);
        if (!seen.has(key)) found.push({ file: key, caption: "", context: "", page: page.title, via: "template" });
      }
      refs.push(...found);
    }
  }
  const byFile = /* @__PURE__ */ new Map();
  for (const r of refs) {
    const prev = byFile.get(r.file);
    if (!prev) byFile.set(r.file, r);
    else if (!prev.caption && r.caption) byFile.set(r.file, { ...r, context: r.context || prev.context });
  }
  const info = await imageInfo(wiki, [...byFile.keys()]);
  const items = [];
  for (const r of byFile.values()) {
    const ii = info.get(r.file);
    if (!ii || !/^image\//.test(ii.mime || "image/")) continue;
    if (ii.width && ii.height && (ii.width < 100 || ii.height < 100)) continue;
    const isSvg = /svg/.test(ii.mime || "") || /\.svg$/i.test(r.file);
    const sharp = ii.thumburl || ii.url;
    const sources = isSvg ? [ii.thumburl] : ii.width > SHARP_WIDTH ? [sharp] : [ii.url, sharp];
    const smaller = smallerVariant(sharp);
    if (smaller) sources.push(smaller);
    items.push({
      title: r.file,
      caption: r.caption,
      context: r.context,
      page: r.page,
      pageUrl: pageUrl(wiki, r.page),
      width: ii.width,
      height: ii.height,
      url: ii.url,
      sources: [...new Set(sources.filter(Boolean))]
    });
  }
  const ranked = rankByPrefer(items, prefer, (it) => `${it.title} ${it.caption} ${it.context} ${it.page}`);
  return { items: ranked, pagesRead, wikiTitle: wiki.title };
}

// src/tools.js
var clamp = (n, lo, hi, dflt) => Math.max(lo, Math.min(hi, Number.isFinite(+n) && n !== null && n !== "" ? Math.round(+n) : dflt));
var TOOLS = [
  {
    name: "search_images",
    description: `SEE images of anything: returns the actual pictures plus each one's source page URL. source "web" (default when the server has a search key) searches the whole web like Google Images, so it finds anime/cartoon/game characters, film stills, products and fan wikis. source "open" searches only Wikimedia Commons and Openverse (good for science, nature, places, history). Be specific in the query, e.g. "Kurapika Hunter x Hunter 2011 anime full body". To dig into one result's page, pass its page URL to view_image or list_wiki_images.`,
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "What to look for." },
        count: { type: "integer", minimum: 1, maximum: 8, default: 4 },
        source: { type: "string", enum: ["auto", "web", "open"], default: "auto" }
      },
      required: ["query"]
    }
  },
  {
    name: "view_image",
    description: 'SEE an image or the pictures on a page, at the sharpest size Claude can use (thumbnails are swapped for full-size versions). Accepts a direct image URL, a wiki page (fandom or Wikipedia: read through the wiki\'s API, so fandom pages that block browsers still work, and gallery subpages are searched too), or any other web page. Use `prefer` to pick which pictures come back: words matched against each picture\'s filename, caption, section and tab label, e.g. prefer "2011 full body" or "2011 -1999 -manga". Quote a phrase to require it together: "\\"full body\\" 2011". Each image comes with its caption so you know which version you are looking at.',
    inputSchema: {
      type: "object",
      properties: {
        url: { type: "string", description: "A direct image URL, a wiki page URL, or any web page URL." },
        prefer: { type: "string", description: "Words to rank the page's pictures by. Prefix a word with - to avoid it." },
        count: { type: "integer", minimum: 1, maximum: 6, default: 3, description: "For pages: how many pictures to return." }
      },
      required: ["url"]
    }
  },
  {
    name: "list_wiki_images",
    description: 'List every picture on a wiki page and its gallery subpages as text, without loading them: filename, caption, section/tab (e.g. "Appearance \u203A 2011 Anime"), size and full-size URL. Cheap, so use it first to find the right version of a character (2011 anime vs 1999 anime vs manga), then pass the chosen URLs to view_image. Works on fandom wikis, Wikipedia and other MediaWiki sites.',
    inputSchema: {
      type: "object",
      properties: {
        url: { type: "string", description: "A wiki page URL, e.g. https://hunterxhunter.fandom.com/wiki/Kurapika" },
        prefer: { type: "string", description: "Optional words to sort the list by, as in view_image." },
        limit: { type: "integer", minimum: 1, maximum: 200, default: 60 },
        include_galleries: { type: "boolean", default: true, description: "Also read Page/Gallery, Page/Image Gallery and Page/Images." }
      },
      required: ["url"]
    }
  }
];
var PAGE_MIN_BYTES = 4e3;
var text = (t) => ({ type: "text", text: t });
var image = (img) => ({ type: "image", data: img.data, mimeType: img.mimeType });
function size(it) {
  return it.width && it.height ? `${it.width}\xD7${it.height}` : "";
}
function describe(n, it, loaded) {
  const lines = [`[${n}] ${it.caption || it.title || it.alt || "Image"}`];
  if (it.caption && it.title && it.caption !== it.title) lines.push(`file: ${it.title}`);
  if (it.context) lines.push(`section: ${it.context}`);
  if (it.site) lines.push(`site: ${it.site}`);
  const dims = size(it);
  if (dims) lines.push(`original size: ${dims}`);
  if (it.pageUrl) lines.push(`page: ${it.pageUrl}`);
  lines.push(`image: ${it.url || loaded.url}`);
  if (loaded.url !== it.url) lines.push(`(shown: ${loaded.url})`);
  return lines.join("\n");
}
async function loadMany(items, count, { maxBytes: maxBytes2, referer, minBytes }) {
  const shown = [];
  const failed = [];
  let i = 0;
  while (shown.length < count && i < items.length && i < count * 4) {
    const batch = items.slice(i, i + (count - shown.length));
    i += batch.length;
    const results = await Promise.allSettled(
      batch.map((it) => loadImage(it.sources?.length ? it.sources : imageSources(it.url), { maxBytes: maxBytes2, minBytes, referer: it.referer || referer }))
    );
    results.forEach((r, k) => {
      if (r.status === "fulfilled") shown.push({ item: batch[k], img: r.value });
      else failed.push({ item: batch[k], reason: r.reason?.message || "failed" });
    });
  }
  return { shown, failed };
}
function render(header, { shown, failed }, footer = []) {
  const content = [text(header)];
  shown.forEach(({ item, img }, k) => {
    content.push(text(describe(k + 1, item, img)));
    content.push(image(img));
  });
  if (failed.length) {
    content.push(text(`Couldn't load ${failed.length} other picture(s): ` + failed.slice(0, 5).map((f) => `${f.item.url} (${f.reason})`).join("; ")));
  }
  if (footer.length) content.push(text(footer.join("\n")));
  return { content, isError: shown.length === 0 };
}
async function searchImagesTool(args, env) {
  const query = String(args.query || "").trim();
  if (!query) return { content: [text("Give a query to search for.")], isError: true };
  const count = clamp(args.count, 1, 8, 4);
  const source = ["auto", "web", "open"].includes(args.source) ? args.source : "auto";
  const { results, searched, notes } = await searchImages(query, { source, n: Math.max(count * 3, 10), env });
  if (!results.length) {
    return { content: [text(`No images found for "${query}" in ${searched}.${notes.length ? "\n" + notes.join("\n") : ""}`)], isError: true };
  }
  const loaded = await loadMany(results, count, { maxBytes: maxBytes(env) });
  const footer = [...notes];
  if (!webProvider(env) && source !== "open") {
    footer.push("Tip: this server has no web search key, so only open libraries were searched. For characters or products, find a page with your own web search and pass it to view_image.");
  }
  return render(`Search: "${query}" in ${searched}. Showing ${loaded.shown.length} of ${results.length} results.`, loaded, footer);
}
function maxBytes(env) {
  const n = Number(env.MAX_IMAGE_BYTES);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_MAX_IMAGE_BYTES;
}
async function viewWiki(url, prefer, count, env) {
  const { items, pagesRead } = await listWikiImages(url, { prefer, includeGalleries: Boolean(prefer) });
  if (!items.length) return null;
  const loaded = await loadMany(items, count, { maxBytes: maxBytes(env) });
  const header = `Pictures from ${pagesRead.join(", ") || url}` + (prefer ? `, best matches for "${prefer}" first` : "") + ` (${items.length} on the page${pagesRead.length > 1 ? "s" : ""}; use list_wiki_images to see them all).`;
  return render(header, loaded);
}
async function viewImageTool(args, env) {
  const url = String(args.url || "").trim();
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return { content: [text("That isn't a valid URL.")], isError: true };
  }
  if (!/^https?:$/.test(parsed.protocol)) return { content: [text("Only http and https URLs work.")], isError: true };
  const prefer = String(args.prefer || "").trim();
  const count = clamp(args.count, 1, 6, 3);
  const cap = maxBytes(env);
  if (looksLikeImageUrl(url)) {
    try {
      const img = await loadImage([...imageSources(url), url], { maxBytes: cap });
      return render("Image:", { shown: [{ item: { url }, img }], failed: [] });
    } catch (err) {
      if (isFandomStatic(url)) return { content: [text(`Couldn't load that image: ${err.message}`)], isError: true };
    }
  }
  const wikiNotes = [];
  if (wikiFromUrl(url)) {
    try {
      const result = await viewWiki(url, prefer, count, env);
      if (result) return result;
      wikiNotes.push("The wiki API listed no pictures for this page.");
    } catch (err) {
      wikiNotes.push(`Reading it through the wiki API failed (${err.message}).`);
    }
  }
  let res;
  try {
    res = await fetchWithHeaders(url);
  } catch (err) {
    const hint = err.status === 403 || err.status === 429 ? ' The site is blocking automated visits. Try a different page about the same subject (another wiki, a database site, a news article), or search_images with source "web".' : "";
    return { content: [text(`Couldn't open the page: ${err.message}.${hint}${wikiNotes.length ? "\n" + wikiNotes.join("\n") : ""}`)], isError: true };
  }
  const type = res.headers.get("content-type") || "";
  if (/^image\//i.test(type)) {
    try {
      const img = { ...bytesToImage(new Uint8Array(await res.arrayBuffer()), cap), url };
      return render("Image:", { shown: [{ item: { url }, img }], failed: [] });
    } catch (err) {
      return { content: [text(`Couldn't use that image: ${err.message}`)], isError: true };
    }
  }
  const html = await res.text();
  const { pageTitle, images } = extractPageImages(html, res.url || url);
  if (!images.length) {
    return { content: [text(`No pictures found on ${pageTitle || url}. The page may build its images with JavaScript; try another page or search_images.`)], isError: true };
  }
  const ranked = rankPageImages(images, prefer).map((it) => ({ ...it, referer: url, sources: imageSources(it.url) }));
  const loaded = await loadMany(ranked, count, { maxBytes: cap, referer: url, minBytes: PAGE_MIN_BYTES });
  const header = `Pictures from ${pageTitle || url}${prefer ? `, best matches for "${prefer}" first` : ""} (${images.length} found on the page).`;
  return render(header, loaded, wikiNotes);
}
async function listWikiImagesTool(args) {
  const url = String(args.url || "").trim();
  if (!wikiFromUrl(url)) {
    return { content: [text("That doesn't look like a wiki article URL (expected \u2026/wiki/Page_name). For other pages use view_image.")], isError: true };
  }
  const limit = clamp(args.limit, 1, 200, 60);
  const prefer = String(args.prefer || "").trim();
  const { items, pagesRead } = await listWikiImages(url, { prefer, includeGalleries: args.include_galleries !== false });
  if (!items.length) return { content: [text(`No pictures found on ${pagesRead.join(", ") || url}.`)], isError: true };
  const lines = items.slice(0, limit).map((it, k) => {
    const bits = [`${k + 1}. ${it.title}`];
    if (it.caption && it.caption !== it.title) bits.push(`   caption: ${it.caption}`);
    if (it.context) bits.push(`   section: ${it.context}`);
    if (pagesRead.length > 1) bits.push(`   on page: ${it.page}`);
    if (size(it)) bits.push(`   size: ${size(it)}`);
    bits.push(`   url: ${it.url}`);
    return bits.join("\n");
  });
  const header = `${items.length} picture(s) on ${pagesRead.join(", ")}` + (prefer ? `, sorted by match to "${prefer}"` : "") + (items.length > limit ? ` (showing the first ${limit})` : "") + ". Pass any url below to view_image to see it.";
  return { content: [text(`${header}

${lines.join("\n")}`)] };
}
var HANDLERS = { search_images: searchImagesTool, view_image: viewImageTool, list_wiki_images: listWikiImagesTool };
async function callTool(name, args, env) {
  const handler = HANDLERS[name];
  if (!handler) throw Object.assign(new Error(`Unknown tool: ${name}`), { code: -32602 });
  try {
    return await handler(args || {}, env || {});
  } catch (err) {
    const msg = err instanceof FetchError ? err.message : `Something went wrong: ${err.message}`;
    return { content: [text(msg)], isError: true };
  }
}

// src/mcp.js
var VERSION = "3.0.0";
var PROTOCOL_VERSIONS = ["2025-06-18", "2025-03-26", "2024-11-05"];
var INSTRUCTIONS = 'Image Eyes lets you actually SEE images. Use it whenever the user asks what something looks like or needs a visual detail checked, instead of describing from memory.\n- search_images finds pictures of anything (source "web" covers characters, products and fan art; "open" is Wikimedia/Openverse).\n- For a character or subject with a wiki page, call list_wiki_images on it first: the captions and section/tab labels tell you which picture is which version (e.g. 2011 anime vs 1999 anime vs manga). Then view_image the ones you need, or view_image the page with prefer, e.g. "2011 full body".\nDescribe only what is visible, and say which image (and which version) you are describing.';
var rpcError = (id, code, message) => ({ jsonrpc: "2.0", id: id ?? null, error: { code, message } });
async function handleRpc(msg, env) {
  if (!msg || msg.jsonrpc !== "2.0" || typeof msg.method !== "string") {
    return rpcError(msg?.id, -32600, "Invalid request");
  }
  const isNotification = msg.id === void 0 || msg.id === null;
  if (isNotification) return null;
  const ok = (result) => ({ jsonrpc: "2.0", id: msg.id, result });
  switch (msg.method) {
    case "initialize": {
      const asked = msg.params?.protocolVersion;
      return ok({
        protocolVersion: PROTOCOL_VERSIONS.includes(asked) ? asked : PROTOCOL_VERSIONS[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "image-eyes", title: "Image Eyes", version: VERSION },
        instructions: INSTRUCTIONS
      });
    }
    case "ping":
      return ok({});
    case "tools/list":
      return ok({ tools: TOOLS });
    case "tools/call": {
      const name = msg.params?.name;
      if (!TOOLS.some((t) => t.name === name)) return rpcError(msg.id, -32602, `Unknown tool: ${name}`);
      return ok(await callTool(name, msg.params?.arguments || {}, env));
    }
    case "resources/list":
      return ok({ resources: [] });
    case "prompts/list":
      return ok({ prompts: [] });
    default:
      return rpcError(msg.id, -32601, `Method not found: ${msg.method}`);
  }
}

// src/index.js
var CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Accept, Authorization, Mcp-Session-Id, Mcp-Protocol-Version"
};
var json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...CORS } });
function authorized(pathname, env) {
  const key = env.SECRET_PATH || env.ACCESS_KEY;
  if (!key) return pathname === "/mcp" || pathname === "/mcp/";
  return pathname === `/mcp/${key}` || pathname === `/mcp/${key}/`;
}
var index_default = {
  async fetch(request, env = {}) {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
    if (url.pathname === "/" && request.method === "GET") {
      return new Response("Image Eyes MCP server is running. Connect Claude to the /mcp address.\n", {
        headers: { "Content-Type": "text/plain; charset=utf-8" }
      });
    }
    if (!url.pathname.startsWith("/mcp") || !authorized(url.pathname, env)) {
      return new Response("Not found\n", { status: 404 });
    }
    if (request.method === "DELETE") return new Response(null, { status: 204, headers: CORS });
    if (request.method !== "POST") {
      return new Response("Method not allowed\n", { status: 405, headers: { Allow: "POST, OPTIONS", ...CORS } });
    }
    let body;
    try {
      body = await request.json();
    } catch {
      return json(rpcError(null, -32700, "Parse error"), 400);
    }
    if (Array.isArray(body)) {
      const replies = (await Promise.all(body.map((m) => handleRpc(m, env)))).filter(Boolean);
      return replies.length ? json(replies) : new Response(null, { status: 202, headers: CORS });
    }
    const reply = await handleRpc(body, env);
    return reply ? json(reply) : new Response(null, { status: 202, headers: CORS });
  }
};
export {
  index_default as default
};
