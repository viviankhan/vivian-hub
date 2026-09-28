// Network helpers: browser-looking requests, and loading pictures as MCP
// image blocks.

export const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';

// Wikimedia asks tools to name themselves and may block fake browsers.
// Everyone else (fandom especially) blocks anything that doesn't look like one.
export const TOOL_UA =
  'ImageEyes/1.0 (personal MCP image connector; https://github.com/viviankhan/vivian-hub)';

const WIKIMEDIA_HOST = /(^|\.)(wikipedia|wikimedia|wiktionary|wikidata|wikiquote|wikibooks)\.org$/;

export const DEFAULT_MAX_IMAGE_BYTES = 2_500_000;

export function headersFor(url, { accept, referer } = {}) {
  const host = new URL(url).hostname;
  const h = {
    'User-Agent': WIKIMEDIA_HOST.test(host) ? TOOL_UA : BROWSER_UA,
    Accept: accept || 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
  };
  if (referer) h.Referer = referer;
  return h;
}

export class FetchError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

export async function fetchWithHeaders(url, opts = {}) {
  let res;
  try {
    res = await fetch(url, {
      headers: headersFor(url, opts),
      redirect: 'follow',
      signal: AbortSignal.timeout(opts.timeoutMs || 15000),
    });
  } catch (err) {
    throw new FetchError(`couldn't reach ${new URL(url).hostname} (${err.name === 'TimeoutError' ? 'timed out' : err.message})`);
  }
  if (!res.ok) throw new FetchError(`${new URL(url).hostname} answered ${res.status}`, res.status);
  return res;
}

export async function fetchJson(url, opts = {}) {
  const res = await fetchWithHeaders(url, { accept: 'application/json', ...opts });
  try {
    return await res.json();
  } catch {
    throw new FetchError(`${new URL(url).hostname} didn't return JSON`);
  }
}

// Claude can look at these four formats; anything else (SVG, AVIF, TIFF) is skipped.
export function sniffImageType(bytes) {
  const b = bytes;
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png';
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b.length >= 6 && b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return 'image/gif';
  if (b.length >= 12 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 &&
      b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return 'image/webp';
  return null;
}

export function toBase64(bytes) {
  if (typeof Buffer !== 'undefined') return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString('base64');
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

const IMAGE_ACCEPT = 'image/webp,image/png,image/jpeg,image/gif;q=0.9,*/*;q=0.5';

// Turns fetched bytes into an image block, or explains why it can't.
export function bytesToImage(bytes, maxBytes, minBytes = 0) {
  if (bytes.length > maxBytes) throw new FetchError(`too large (${(bytes.length / 1e6).toFixed(1)} MB)`);
  if (bytes.length < minBytes) throw new FetchError('too small to be a real picture');
  const mimeType = sniffImageType(bytes);
  if (!mimeType) throw new FetchError('not a PNG, JPEG, GIF or WebP image');
  return { mimeType, data: toBase64(bytes), bytes: bytes.length };
}

// Tries each source in order (sharpest first) until one loads within the size cap.
export async function loadImage(sources, { referer, maxBytes = DEFAULT_MAX_IMAGE_BYTES, minBytes = 0 } = {}) {
  let lastErr;
  for (const src of sources.filter(Boolean)) {
    try {
      const res = await fetchWithHeaders(src, { accept: IMAGE_ACCEPT, referer });
      const len = Number(res.headers.get('content-length'));
      if (len && len > maxBytes) {
        res.body?.cancel().catch(() => {});
        lastErr = new FetchError(`too large (${(len / 1e6).toFixed(1)} MB)`);
        continue;
      }
      const bytes = new Uint8Array(await res.arrayBuffer());
      return { ...bytesToImage(bytes, maxBytes, minBytes), url: src };
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr || new FetchError('no image URL to load');
}
