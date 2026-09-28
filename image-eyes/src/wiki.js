// Reads a wiki page's pictures through the MediaWiki API instead of the web
// page. Fandom answers 403 to page scrapers but lets its API through, and the
// API gives full-size image URLs, filenames and captions.

import { fetchJson } from './fetch.js';
import { extractFileRefs, fileKey } from './wikitext.js';
import { SHARP_WIDTH, smallerVariant } from './urls.js';
import { rankByPrefer } from './rank.js';

const WIKIMEDIA_FAMILY = /(^|\.)(wikipedia|wikimedia|wiktionary|wikiquote|wikibooks|wikivoyage|wikidata)\.org$/;

// Returns { apis, origin, prefix, title } for a wiki article URL, or null.
export function wikiFromUrl(url) {
  let u;
  try { u = new URL(url); } catch { return null; }
  let prefix = '';
  let title = '';
  const m = u.pathname.match(/^(.*?)\/wiki\/(.+)$/);
  if (m) {
    prefix = m[1];
    title = m[2];
  } else if (/\/index\.php$/.test(u.pathname) && u.searchParams.get('title')) {
    prefix = u.pathname.replace(/\/(w\/)?index\.php$/, '');
    title = u.searchParams.get('title');
  } else {
    return null;
  }
  try { title = decodeURIComponent(title); } catch { /* keep */ }
  title = title.replace(/_/g, ' ').trim();
  if (!title) return null;

  const host = u.hostname;
  let apis;
  if (host.endsWith('.fandom.com') || host.endsWith('.wikia.com')) apis = [`${u.origin}${prefix}/api.php`];
  else if (WIKIMEDIA_FAMILY.test(host)) apis = [`${u.origin}/w/api.php`];
  else apis = [`${u.origin}${prefix}/api.php`, `${u.origin}/w/api.php`];
  return { apis, origin: u.origin, prefix, title };
}

export function pageUrl(wiki, title) {
  return `${wiki.origin}${wiki.prefix}/wiki/${encodeURIComponent(title.replace(/ /g, '_')).replace(/%2F/g, '/').replace(/%3A/g, ':')}`;
}

async function api(wiki, params) {
  const qs = new URLSearchParams({ format: 'json', formatversion: '2', ...params });
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

const GALLERY_SUFFIXES = ['Gallery', 'Image Gallery', 'Images'];

async function existingGalleries(wiki, title) {
  const titles = GALLERY_SUFFIXES.map((s) => `${title}/${s}`);
  const data = await api(wiki, { action: 'query', titles: titles.join('|'), redirects: '1' });
  return (data.query?.pages || []).filter((p) => !p.missing && !p.invalid).map((p) => p.title);
}

async function parsePage(wiki, title) {
  const data = await api(wiki, { action: 'parse', page: title, prop: 'wikitext|images', redirects: '1' });
  if (data.error) throw new Error(`${data.error.info || data.error.code}`);
  const parsed = data.parse || {};
  return { title: parsed.title || title, wikitext: parsed.wikitext || '', images: parsed.images || [] };
}

async function imageInfo(wiki, files) {
  const info = new Map();
  for (let i = 0; i < files.length; i += 50) {
    const chunk = files.slice(i, i + 50);
    const data = await api(wiki, {
      action: 'query',
      titles: chunk.map((f) => `File:${f}`).join('|'),
      prop: 'imageinfo',
      iiprop: 'url|size|mime',
      iiurlwidth: String(SHARP_WIDTH),
      redirects: '1',
    });
    const renamed = new Map();
    for (const n of [...(data.query?.normalized || []), ...(data.query?.redirects || [])]) renamed.set(n.to, n.from);
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

// Every usable picture on a wiki page (and its gallery subpages), best match
// for `prefer` first.
export async function listWikiImages(url, { prefer = '', includeGalleries = true } = {}) {
  const wiki = wikiFromUrl(url);
  if (!wiki) throw new Error('not a wiki page URL');

  let refs = [];
  const pagesRead = [];
  if (/^(file|image)\s*:/i.test(wiki.title)) {
    refs.push({ file: fileKey(wiki.title), caption: '', context: '', page: wiki.title });
  } else {
    const first = await parsePage(wiki, wiki.title);
    const titles = [first.title];
    if (includeGalleries && !/gallery|images$/i.test(first.title)) {
      try {
        titles.push(...(await existingGalleries(wiki, first.title)));
      } catch { /* galleries are a bonus */ }
    }
    for (const t of titles) {
      const page = t === first.title ? first : await parsePage(wiki, t).catch(() => null);
      if (!page) continue;
      pagesRead.push(page.title);
      const found = extractFileRefs(page.wikitext).map((r) => ({ ...r, page: page.title }));
      const seen = new Set(found.map((r) => r.file));
      // Pictures that come in through templates have no caption, only a filename.
      for (const img of page.images) {
        const key = fileKey(img);
        if (!seen.has(key)) found.push({ file: key, caption: '', context: '', page: page.title, via: 'template' });
      }
      refs.push(...found);
    }
  }

  // One entry per file, keeping the most descriptive caption.
  const byFile = new Map();
  for (const r of refs) {
    const prev = byFile.get(r.file);
    if (!prev) byFile.set(r.file, r);
    else if (!prev.caption && r.caption) byFile.set(r.file, { ...r, context: r.context || prev.context });
  }

  const info = await imageInfo(wiki, [...byFile.keys()]);
  const items = [];
  for (const r of byFile.values()) {
    const ii = info.get(r.file);
    if (!ii || !/^image\//.test(ii.mime || 'image/')) continue;
    // Skip icons, bullets and site badges.
    if (ii.width && ii.height && (ii.width < 100 || ii.height < 100)) continue;
    const isSvg = /svg/.test(ii.mime || '') || /\.svg$/i.test(r.file);
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
      sources: [...new Set(sources.filter(Boolean))],
    });
  }

  const ranked = rankByPrefer(items, prefer, (it) => `${it.title} ${it.caption} ${it.context} ${it.page}`);
  return { items: ranked, pagesRead, wikiTitle: wiki.title };
}
