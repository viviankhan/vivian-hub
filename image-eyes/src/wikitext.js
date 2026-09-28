// Finds every picture a wiki page's source mentions, with the words around it:
// the gallery caption, the section heading, and the tab label ("2011 Anime").

const FILE_PREFIX = /^\s*(file|image)\s*:\s*/i;
const IMAGE_EXT = /\.(png|jpe?g|gif|webp|svg|bmp|tiff?)$/i;

// Layout words inside [[File:...|...]] that aren't the caption.
const OPTION = /^\s*(thumb|thumbnail|frame|framed|frameless|border|left|right|center|centre|none|baseline|middle|sub|super|top|text-top|bottom|text-bottom|upright(\s*=?\s*[\d.]+)?|\d*x?\d+\s*px|(link|alt|page|class|lang|upright)\s*=.*)\s*$/i;

export function cleanMarkup(text) {
  return String(text || '')
    .replace(/\{\{[^{}]*\}\}/g, ' ')
    .replace(/\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/g, '$1')
    .replace(/\[https?:\/\/\S+\s+([^\]]+)\]/g, '$1')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/'{2,}/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Splits on | that aren't inside [[...]] or {{...}}.
export function splitTopLevel(text) {
  const parts = [];
  let depth = 0;
  let cur = '';
  for (let i = 0; i < text.length; i++) {
    const two = text.slice(i, i + 2);
    if (two === '[[' || two === '{{') { depth++; cur += two; i++; continue; }
    if ((two === ']]' || two === '}}') && depth > 0) { depth--; cur += two; i++; continue; }
    if (text[i] === '|' && depth === 0) { parts.push(cur); cur = ''; continue; }
    cur += text[i];
  }
  parts.push(cur);
  return parts;
}

export function fileKey(name) {
  let n = String(name || '').replace(FILE_PREFIX, '').replace(/_/g, ' ').replace(/\s+/g, ' ').trim();
  try { n = decodeURIComponent(n); } catch { /* keep as is */ }
  return n.charAt(0).toUpperCase() + n.slice(1);
}

function headingIndex(text) {
  const out = [];
  const re = /^(={1,6})\s*(.+?)\s*\1\s*$/gm;
  let m;
  while ((m = re.exec(text))) out.push({ pos: m.index, level: m[1].length, title: cleanMarkup(m[2]) });
  return out;
}

function sectionAt(headings, pos) {
  const stack = [];
  for (const h of headings) {
    if (h.pos > pos) break;
    while (stack.length && stack[stack.length - 1].level >= h.level) stack.pop();
    stack.push(h);
  }
  return stack.map((h) => h.title).join(' › ');
}

// <tabber>2011 Anime=[[File:a.png]]|-|1999 Anime=[[File:b.png]]</tabber>
function tabIndex(text) {
  const out = [];
  const re = /<tabber[^>]*>([\s\S]*?)<\/tabber>/gi;
  let m;
  while ((m = re.exec(text))) {
    const bodyStart = m.index + m[0].indexOf('>') + 1;
    let offset = 0;
    for (const seg of m[1].split('|-|')) {
      const eq = seg.indexOf('=');
      const label = eq > 0 ? cleanMarkup(seg.slice(0, eq)) : '';
      if (label && label.length <= 60 && !seg.slice(0, eq).includes('[[')) {
        out.push({ start: bodyStart + offset, end: bodyStart + offset + seg.length, label });
      }
      offset += seg.length + 3;
    }
  }
  return out;
}

function tabAt(tabs, pos) {
  const t = tabs.find((x) => pos >= x.start && pos < x.end);
  return t ? t.label : '';
}

function captionFrom(parts) {
  let caption = '';
  let alt = '';
  for (const p of parts) {
    const alm = p.match(/^\s*alt\s*=(.*)$/i);
    if (alm) { alt = alm[1]; continue; }
    if (!OPTION.test(p) && p.trim()) caption = p;
  }
  return cleanMarkup(caption || alt);
}

export function extractFileRefs(wikitext) {
  const text = String(wikitext || '');
  const headings = headingIndex(text);
  const tabs = tabIndex(text);
  const refs = [];
  const add = (file, caption, pos, via) => {
    const name = fileKey(file);
    if (!name || !IMAGE_EXT.test(name)) return;
    const context = [sectionAt(headings, pos), tabAt(tabs, pos)].filter(Boolean).join(' › ');
    refs.push({ file: name, caption, context, via });
  };

  // <gallery> blocks: one "File.png|caption" per line.
  const galleries = [];
  const gre = /<gallery[^>]*>([\s\S]*?)<\/gallery>/gi;
  let m;
  while ((m = gre.exec(text))) {
    const start = m.index + m[0].indexOf('>') + 1;
    galleries.push([m.index, m.index + m[0].length]);
    let offset = 0;
    for (const line of m[1].split('\n')) {
      const trimmed = line.trim();
      if (trimmed) {
        const [file, ...rest] = splitTopLevel(trimmed);
        add(file, captionFrom(rest), start + offset, 'gallery');
      }
      offset += line.length + 1;
    }
  }
  const inGallery = (pos) => galleries.some(([a, b]) => pos >= a && pos < b);

  // [[File:Name.png|thumb|250px|Caption with [[links]]]]
  const lre = /\[\[\s*(?:file|image)\s*:/gi;
  while ((m = lre.exec(text))) {
    if (inGallery(m.index)) continue;
    let depth = 0;
    let end = -1;
    for (let i = m.index; i < text.length - 1; i++) {
      const two = text.slice(i, i + 2);
      if (two === '[[') { depth++; i++; } else if (two === ']]') { depth--; i++; if (depth === 0) { end = i - 1; break; } }
    }
    if (end < 0) continue;
    const inner = text.slice(m.index + 2, end);
    const [file, ...rest] = splitTopLevel(inner);
    add(file, captionFrom(rest), m.index, 'link');
  }

  // Template fields: | image = Name.png   | image2011 = Name 2011.png
  const tre = /\|\s*([A-Za-z0-9 _]{1,40}?)\s*=\s*((?:file:|image:)?[^|{}[\]\n<>=]+?\.(?:png|jpe?g|gif|webp|svg))\s*(?=[|\n}])/gi;
  while ((m = tre.exec(text))) {
    if (inGallery(m.index)) continue;
    add(m[2], cleanMarkup(m[1]).replace(/_/g, ' '), m.index, 'template');
  }

  return refs;
}
