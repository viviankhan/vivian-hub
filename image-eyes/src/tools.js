// The three tools Claude sees, and what each returns.

import { DEFAULT_MAX_IMAGE_BYTES, FetchError, bytesToImage, fetchWithHeaders, loadImage } from './fetch.js';
import { extractPageImages, rankPageImages } from './html.js';
import { searchImages, webProvider } from './search.js';
import { imageSources, looksLikeImageUrl, isFandomStatic } from './urls.js';
import { listWikiImages, wikiFromUrl } from './wiki.js';

const clamp = (n, lo, hi, dflt) => Math.max(lo, Math.min(hi, Number.isFinite(+n) && n !== null && n !== '' ? Math.round(+n) : dflt));

export const TOOLS = [
  {
    name: 'search_images',
    description:
      'SEE images of anything: returns the actual pictures plus each one\'s source page URL. ' +
      'source "web" (default when the server has a search key) searches the whole web like Google Images, so it finds ' +
      'anime/cartoon/game characters, film stills, products and fan wikis. source "open" searches only Wikimedia Commons ' +
      'and Openverse (good for science, nature, places, history). Be specific in the query, e.g. ' +
      '"Kurapika Hunter x Hunter 2011 anime full body". To dig into one result\'s page, pass its page URL to view_image ' +
      'or list_wiki_images.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'What to look for.' },
        count: { type: 'integer', minimum: 1, maximum: 8, default: 4 },
        source: { type: 'string', enum: ['auto', 'web', 'open'], default: 'auto' },
      },
      required: ['query'],
    },
  },
  {
    name: 'view_image',
    description:
      'SEE an image or the pictures on a page, at the sharpest size Claude can use (thumbnails are swapped for full-size ' +
      'versions). Accepts a direct image URL, a wiki page (fandom or Wikipedia: read through the wiki\'s API, so fandom ' +
      'pages that block browsers still work, and gallery subpages are searched too), or any other web page. ' +
      'Use `prefer` to pick which pictures come back: words matched against each picture\'s filename, caption, section ' +
      'and tab label, e.g. prefer "2011 full body" or "2011 -1999 -manga". Quote a phrase to require it together: ' +
      '"\\"full body\\" 2011". Each image comes with its caption so you know which version you are looking at.',
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'A direct image URL, a wiki page URL, or any web page URL.' },
        prefer: { type: 'string', description: 'Words to rank the page\'s pictures by. Prefix a word with - to avoid it.' },
        count: { type: 'integer', minimum: 1, maximum: 6, default: 3, description: 'For pages: how many pictures to return.' },
      },
      required: ['url'],
    },
  },
  {
    name: 'list_wiki_images',
    description:
      'List every picture on a wiki page and its gallery subpages as text, without loading them: filename, caption, ' +
      'section/tab (e.g. "Appearance › 2011 Anime"), size and full-size URL. Cheap, so use it first to find the right ' +
      'version of a character (2011 anime vs 1999 anime vs manga), then pass the chosen URLs to view_image. ' +
      'Works on fandom wikis, Wikipedia and other MediaWiki sites.',
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'A wiki page URL, e.g. https://hunterxhunter.fandom.com/wiki/Kurapika' },
        prefer: { type: 'string', description: 'Optional words to sort the list by, as in view_image.' },
        limit: { type: 'integer', minimum: 1, maximum: 200, default: 60 },
        include_galleries: { type: 'boolean', default: true, description: 'Also read Page/Gallery, Page/Image Gallery and Page/Images.' },
      },
      required: ['url'],
    },
  },
];

const text = (t) => ({ type: 'text', text: t });
const image = (img) => ({ type: 'image', data: img.data, mimeType: img.mimeType });

function size(it) {
  return it.width && it.height ? `${it.width}×${it.height}` : '';
}

function describe(n, it, loaded) {
  const lines = [`[${n}] ${it.caption || it.title || it.alt || 'Image'}`];
  if (it.caption && it.title && it.caption !== it.title) lines.push(`file: ${it.title}`);
  if (it.context) lines.push(`section: ${it.context}`);
  if (it.site) lines.push(`site: ${it.site}`);
  const dims = size(it);
  if (dims) lines.push(`original size: ${dims}`);
  if (it.pageUrl) lines.push(`page: ${it.pageUrl}`);
  lines.push(`image: ${it.url || loaded.url}`);
  if (loaded.url !== it.url) lines.push(`(shown: ${loaded.url})`);
  return lines.join('\n');
}

// Loads up to `count` of `items`, skipping any that fail, a few at a time.
async function loadMany(items, count, { maxBytes, referer }) {
  const shown = [];
  const failed = [];
  let i = 0;
  while (shown.length < count && i < items.length && i < count * 4) {
    const batch = items.slice(i, i + (count - shown.length));
    i += batch.length;
    const results = await Promise.allSettled(
      batch.map((it) => loadImage(it.sources?.length ? it.sources : imageSources(it.url), { maxBytes, referer: it.referer || referer })),
    );
    results.forEach((r, k) => {
      if (r.status === 'fulfilled') shown.push({ item: batch[k], img: r.value });
      else failed.push({ item: batch[k], reason: r.reason?.message || 'failed' });
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
    content.push(text(`Couldn't load ${failed.length} other picture(s): ` +
      failed.slice(0, 5).map((f) => `${f.item.url} (${f.reason})`).join('; ')));
  }
  if (footer.length) content.push(text(footer.join('\n')));
  return { content, isError: shown.length === 0 };
}

async function searchImagesTool(args, env) {
  const query = String(args.query || '').trim();
  if (!query) return { content: [text('Give a query to search for.')], isError: true };
  const count = clamp(args.count, 1, 8, 4);
  const source = ['auto', 'web', 'open'].includes(args.source) ? args.source : 'auto';
  const { results, searched, notes } = await searchImages(query, { source, n: Math.max(count * 3, 10), env });
  if (!results.length) {
    return { content: [text(`No images found for "${query}" in ${searched}.${notes.length ? '\n' + notes.join('\n') : ''}`)], isError: true };
  }
  const loaded = await loadMany(results, count, { maxBytes: maxBytes(env) });
  const footer = [...notes];
  if (!webProvider(env) && source !== 'open') {
    footer.push('Tip: this server has no web search key, so only open libraries were searched. For characters or products, find a page with your own web search and pass it to view_image.');
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
  const header = `Pictures from ${pagesRead.join(', ') || url}` +
    (prefer ? `, best matches for "${prefer}" first` : '') +
    ` (${items.length} on the page${pagesRead.length > 1 ? 's' : ''}; use list_wiki_images to see them all).`;
  return render(header, loaded);
}

async function viewImageTool(args, env) {
  const url = String(args.url || '').trim();
  let parsed;
  try { parsed = new URL(url); } catch { return { content: [text('That isn\'t a valid URL.')], isError: true }; }
  if (!/^https?:$/.test(parsed.protocol)) return { content: [text('Only http and https URLs work.')], isError: true };
  const prefer = String(args.prefer || '').trim();
  const count = clamp(args.count, 1, 6, 3);
  const cap = maxBytes(env);

  if (looksLikeImageUrl(url)) {
    try {
      const img = await loadImage([...imageSources(url), url], { maxBytes: cap });
      return render('Image:', { shown: [{ item: { url }, img }], failed: [] });
    } catch (err) {
      if (isFandomStatic(url)) return { content: [text(`Couldn't load that image: ${err.message}`)], isError: true };
      // Some "image" URLs are really pages; fall through and read it as one.
    }
  }

  const wikiNotes = [];
  if (wikiFromUrl(url)) {
    try {
      const result = await viewWiki(url, prefer, count, env);
      if (result) return result;
      wikiNotes.push('The wiki API listed no pictures for this page.');
    } catch (err) {
      wikiNotes.push(`Reading it through the wiki API failed (${err.message}).`);
    }
  }

  let res;
  try {
    res = await fetchWithHeaders(url);
  } catch (err) {
    const hint = err.status === 403 || err.status === 429
      ? ' The site is blocking automated visits. Try a different page about the same subject (another wiki, a database site, a news article), or search_images with source "web".'
      : '';
    return { content: [text(`Couldn't open the page: ${err.message}.${hint}${wikiNotes.length ? '\n' + wikiNotes.join('\n') : ''}`)], isError: true };
  }

  const type = res.headers.get('content-type') || '';
  if (/^image\//i.test(type)) {
    try {
      const img = { ...bytesToImage(new Uint8Array(await res.arrayBuffer()), cap), url };
      return render('Image:', { shown: [{ item: { url }, img }], failed: [] });
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
  const loaded = await loadMany(ranked, count, { maxBytes: cap, referer: url });
  const header = `Pictures from ${pageTitle || url}${prefer ? `, best matches for "${prefer}" first` : ''} (${images.length} found on the page).`;
  return render(header, loaded, wikiNotes);
}

async function listWikiImagesTool(args) {
  const url = String(args.url || '').trim();
  if (!wikiFromUrl(url)) {
    return { content: [text('That doesn\'t look like a wiki article URL (expected …/wiki/Page_name). For other pages use view_image.')], isError: true };
  }
  const limit = clamp(args.limit, 1, 200, 60);
  const prefer = String(args.prefer || '').trim();
  const { items, pagesRead } = await listWikiImages(url, { prefer, includeGalleries: args.include_galleries !== false });
  if (!items.length) return { content: [text(`No pictures found on ${pagesRead.join(', ') || url}.`)], isError: true };
  const lines = items.slice(0, limit).map((it, k) => {
    const bits = [`${k + 1}. ${it.title}`];
    if (it.caption && it.caption !== it.title) bits.push(`   caption: ${it.caption}`);
    if (it.context) bits.push(`   section: ${it.context}`);
    if (pagesRead.length > 1) bits.push(`   on page: ${it.page}`);
    if (size(it)) bits.push(`   size: ${size(it)}`);
    bits.push(`   url: ${it.url}`);
    return bits.join('\n');
  });
  const header = `${items.length} picture(s) on ${pagesRead.join(', ')}` +
    (prefer ? `, sorted by match to "${prefer}"` : '') +
    (items.length > limit ? ` (showing the first ${limit})` : '') +
    '. Pass any url below to view_image to see it.';
  return { content: [text(`${header}\n\n${lines.join('\n')}`)] };
}

const HANDLERS = { search_images: searchImagesTool, view_image: viewImageTool, list_wiki_images: listWikiImagesTool };

export async function callTool(name, args, env) {
  const handler = HANDLERS[name];
  if (!handler) throw Object.assign(new Error(`Unknown tool: ${name}`), { code: -32602 });
  try {
    return await handler(args || {}, env || {});
  } catch (err) {
    const msg = err instanceof FetchError ? err.message : `Something went wrong: ${err.message}`;
    return { content: [text(msg)], isError: true };
  }
}
