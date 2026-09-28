// Pulls the pictures out of an ordinary web page.

import { rankByPrefer } from './rank.js';

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", '#39': "'", nbsp: ' ' };

export function decodeEntities(s) {
  return String(s || '').replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (all, e) => {
    if (e[0] === '#') {
      const code = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : all;
    }
    return ENTITIES[e.toLowerCase()] ?? all;
  });
}

export function parseAttrs(tag) {
  const attrs = {};
  const re = /([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g;
  let m;
  while ((m = re.exec(tag))) attrs[m[1].toLowerCase()] = decodeEntities(m[2] ?? m[3] ?? m[4] ?? '');
  return attrs;
}

// "a.jpg 400w, b.jpg 1600w" → b.jpg
export function largestFromSrcset(srcset) {
  let best = null;
  let bestSize = -1;
  for (const part of String(srcset || '').split(/,\s+(?=\S)/)) {
    const [u, d] = part.trim().split(/\s+/);
    if (!u) continue;
    const size = d ? parseFloat(d) * (/x$/i.test(d) ? 1000 : 1) : 1;
    if (size > bestSize) { best = u; bestSize = size; }
  }
  return best;
}

const JUNK = /(logo|icon|sprite|avatar|favicon|pixel|spacer|badge|emoji|blank|placeholder|loading|tracking|button|banner-ad|\/ads?\/)/i;

export function extractPageImages(html, pageUrl) {
  const out = [];
  const seen = new Set();
  const push = (raw, info) => {
    if (!raw || /^data:/i.test(raw)) return;
    let url;
    try { url = new URL(raw, pageUrl).toString(); } catch { return; }
    if (/\.svg(\?|$)/i.test(url)) return;
    const key = url.replace(/\/revision\/latest.*$/, '').replace(/\?.*$/, '');
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ url, ...info });
  };

  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const pageTitle = titleMatch ? decodeEntities(titleMatch[1]).replace(/\s+/g, ' ').trim() : '';

  for (const tag of html.match(/<meta\b[^>]*>/gi) || []) {
    const a = parseAttrs(tag);
    const key = (a.property || a.name || '').toLowerCase();
    if (key === 'og:image' || key === 'og:image:url' || key === 'twitter:image' || key === 'twitter:image:src') {
      push(a.content, { alt: pageTitle, isMain: true });
    }
  }

  for (const tag of html.match(/<img\b[^>]*>/gi) || []) {
    const a = parseAttrs(tag);
    const src = largestFromSrcset(a['data-srcset'] || a.srcset) ||
      a['data-src'] || a['data-original'] || a['data-lazy-src'] || a['data-image-src'] || a.src;
    const width = parseInt(a.width || a['data-width'], 10) || 0;
    const height = parseInt(a.height || a['data-height'], 10) || 0;
    if ((width && width < 80) || (height && height < 80)) continue;
    const alt = a.alt || a.title || a['data-image-name'] || a['data-caption'] || '';
    if (JUNK.test(src || '') || JUNK.test(a.class || '')) continue;
    push(src, { alt, width, height, isMain: false });
  }
  return { pageTitle, images: out };
}

export function rankPageImages(images, prefer) {
  const filename = (u) => { try { return decodeURIComponent(new URL(u).pathname); } catch { return u; } };
  const base = images.slice().sort((a, b) =>
    (b.isMain - a.isMain) || ((b.width * b.height) - (a.width * a.height)) || 0);
  return rankByPrefer(base, prefer, (it) => `${filename(it.url)} ${it.alt}`);
}
