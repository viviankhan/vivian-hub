// Image search. "web" covers the whole web through Serper or SerpApi (both
// Google Images) or Brave, whichever key is set. "open" covers Wikimedia Commons and
// Openverse and needs no key.

import { fetchJson } from './fetch.js';
import { SHARP_WIDTH, imageSources } from './urls.js';

const PROVIDERS = {
  serper: { name: 'Google Images (Serper)', search: (q, n, env) => searchSerper(q, n, env) },
  google: { name: 'Google Images (SerpApi)', search: (q, n, env) => searchGoogle(q, n, env) },
  brave: { name: 'Brave Images', search: (q, n, env) => searchBrave(q, n, env) },
};

export function webProvider(env) {
  if (env.SERPER_API_KEY) return 'serper';
  if (env.SERPAPI_KEY) return 'google';
  if (env.BRAVE_API_KEY) return 'brave';
  return null;
}

async function searchSerper(query, n, env) {
  const res = await fetch('https://google.serper.dev/images', {
    method: 'POST',
    headers: { 'X-API-KEY': env.SERPER_API_KEY, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ q: query, num: Math.min(Math.max(n, 10), 100) }),
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`Serper answered ${res.status}${res.status === 403 || res.status === 401 ? ' (check SERPER_API_KEY)' : ''}`);
  const data = await res.json();
  return (data.images || []).slice(0, n).map((r) => ({
    title: r.title || '',
    pageUrl: r.link || '',
    site: r.source || r.domain || '',
    width: r.imageWidth,
    height: r.imageHeight,
    url: r.imageUrl || r.thumbnailUrl,
    sources: [...imageSources(r.imageUrl || ''), r.thumbnailUrl].filter(Boolean),
  }));
}

async function searchGoogle(query, n, env) {
  const qs = new URLSearchParams({ engine: 'google_images', q: query, api_key: env.SERPAPI_KEY, ijn: '0' });
  const data = await fetchJson(`https://serpapi.com/search.json?${qs}`);
  if (data.error) throw new Error(`SerpApi: ${data.error}`);
  return (data.images_results || []).slice(0, n).map((r) => ({
    title: r.title || '',
    pageUrl: r.link || '',
    site: r.source || '',
    width: r.original_width,
    height: r.original_height,
    url: r.original || r.thumbnail,
    sources: [...imageSources(r.original || ''), r.thumbnail].filter(Boolean),
  }));
}

async function searchBrave(query, n, env) {
  const qs = new URLSearchParams({ q: query, count: String(Math.min(n, 100)), safesearch: 'strict' });
  const res = await fetch(`https://api.search.brave.com/res/v1/images/search?${qs}`, {
    headers: { Accept: 'application/json', 'X-Subscription-Token': env.BRAVE_API_KEY },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`Brave answered ${res.status}`);
  const data = await res.json();
  return (data.results || []).slice(0, n).map((r) => ({
    title: r.title || '',
    pageUrl: r.url || '',
    site: r.source || '',
    width: r.properties?.width,
    height: r.properties?.height,
    url: r.properties?.url || r.thumbnail?.src,
    sources: [...imageSources(r.properties?.url || ''), r.thumbnail?.src].filter(Boolean),
  }));
}

async function searchCommons(query, n) {
  const qs = new URLSearchParams({
    action: 'query', format: 'json', formatversion: '2', origin: '*',
    generator: 'search', gsrsearch: `${query} filetype:bitmap|drawing`, gsrnamespace: '6', gsrlimit: String(n),
    prop: 'imageinfo', iiprop: 'url|size|mime', iiurlwidth: String(SHARP_WIDTH),
  });
  const data = await fetchJson(`https://commons.wikimedia.org/w/api.php?${qs}`);
  return (data.query?.pages || [])
    .sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
    .filter((p) => p.imageinfo?.[0])
    .map((p) => {
      const ii = p.imageinfo[0];
      return {
        title: p.title.replace(/^File:/, ''),
        pageUrl: ii.descriptionurl || '',
        site: 'Wikimedia Commons',
        width: ii.width,
        height: ii.height,
        url: ii.url,
        sources: ii.width > SHARP_WIDTH ? [ii.thumburl, ...imageSources(ii.thumburl).slice(1)] : [ii.url, ii.thumburl],
      };
    });
}

async function searchOpenverse(query, n) {
  const qs = new URLSearchParams({ q: query, page_size: String(n), mature: 'false' });
  const data = await fetchJson(`https://api.openverse.org/v1/images/?${qs}`);
  return (data.results || []).map((r) => ({
    title: r.title || '',
    pageUrl: r.foreign_landing_url || '',
    site: `Openverse (${r.source || r.provider || 'open license'})`,
    width: r.width,
    height: r.height,
    url: r.url,
    sources: [...imageSources(r.url || ''), r.thumbnail].filter(Boolean),
  }));
}

// Interleaves lists so both open libraries get a turn at the top.
function interleave(lists) {
  const out = [];
  const seen = new Set();
  for (let i = 0; lists.some((l) => i < l.length); i++) {
    for (const l of lists) {
      if (i >= l.length || seen.has(l[i].url)) continue;
      seen.add(l[i].url);
      out.push(l[i]);
    }
  }
  return out;
}

export async function searchImages(query, { source = 'auto', n = 12, env = {} } = {}) {
  const provider = webProvider(env);
  const notes = [];
  const wantWeb = source === 'web' || (source === 'auto' && provider);
  if (source === 'web' && !provider) {
    notes.push('Web search is off because no SERPER_API_KEY, SERPAPI_KEY or BRAVE_API_KEY is set on the server; searched the open libraries instead.');
  }
  if (wantWeb && provider) {
    try {
      const results = await PROVIDERS[provider].search(query, n, env);
      if (results.length) return { results, searched: PROVIDERS[provider].name, notes };
      notes.push('Web search found nothing; tried the open libraries.');
    } catch (err) {
      notes.push(`Web search failed (${err.message}); tried the open libraries.`);
    }
  }
  const settled = await Promise.allSettled([searchCommons(query, n), searchOpenverse(query, n)]);
  const lists = settled.filter((s) => s.status === 'fulfilled').map((s) => s.value);
  for (const s of settled) if (s.status === 'rejected') notes.push(`An open library failed: ${s.reason?.message}`);
  return { results: interleave(lists), searched: 'Wikimedia Commons + Openverse', notes };
}
