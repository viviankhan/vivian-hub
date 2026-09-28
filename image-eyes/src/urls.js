// Rewrites thumbnail URLs from the big image hosts into sharper versions.
//
// Claude shrinks anything past about 1568 px on the long side, so that's the
// sharpest size worth asking for. Smaller copies come after it in case the
// sharp one is too heavy to send.

export const SHARP_WIDTH = 1568;
const FALLBACK_WIDTH = 1000;

const FANDOM_STATIC = /^(static|vignette\d*)\.wikia\.nocookie\.net$/;

export function isFandomStatic(url) {
  try {
    return FANDOM_STATIC.test(new URL(url).hostname);
  } catch {
    return false;
  }
}

// https://static.wikia.nocookie.net/<wiki>/images/a/ab/Name.png/revision/latest/scale-to-width-down/250?cb=1
export function fandomResized(url, width) {
  const u = new URL(url);
  const m = u.pathname.match(/^(.*?\/revision\/[^/]+)(\/.*)?$/);
  const base = m ? m[1] : u.pathname.replace(/\/$/, '') + '/revision/latest';
  u.pathname = width ? `${base}/scale-to-width-down/${width}` : base;
  return u.toString();
}

// https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Name.jpg/250px-Name.jpg
const WIKIMEDIA_THUMB = /^(https?:\/\/upload\.wikimedia\.org\/.+?)\/thumb\/(.+?\/([^/]+))\/(?:[a-z-]*?)\d+px-[^/]+$/;

export function wikimediaOriginal(url) {
  const m = url.match(WIKIMEDIA_THUMB);
  return m ? `${m[1]}/${m[2]}` : null;
}

function wikimediaResized(url, width) {
  const m = url.match(WIKIMEDIA_THUMB);
  if (!m) return null;
  const name = m[3];
  return `${m[1]}/thumb/${m[2]}/${width}px-${name}${/\.svg$/i.test(name) ? '.png' : ''}`;
}

// Sources to try for an image URL, sharpest first.
export function imageSources(url) {
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

// Wiki API results already carry a scaled `thumburl`; this adds a lighter
// fallback next to it.
export function smallerVariant(url, width = FALLBACK_WIDTH) {
  if (isFandomStatic(url)) return fandomResized(url, width);
  return wikimediaResized(url, width) || null;
}

export function looksLikeImageUrl(url) {
  try {
    const u = new URL(url);
    return isFandomStatic(url) || u.hostname === 'upload.wikimedia.org' ||
      /\.(png|jpe?g|gif|webp)$/i.test(u.pathname);
  } catch {
    return false;
  }
}
