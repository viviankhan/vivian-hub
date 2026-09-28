// Ranks images by how well their filename, caption and section match a
// `prefer` phrase such as `2011 full body -1999`.

export function normalize(text) {
  return ' ' + String(text || '')
    .toLowerCase()
    .replace(/%20/g, ' ')
    .replace(/[_\-./()[\],:;|"'!?#]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim() + ' ';
}

export function parsePrefer(prefer) {
  const include = [];
  const exclude = [];
  const phrases = [];
  const re = /(-?)"([^"]+)"|(-?)(\S+)/g;
  let m;
  while ((m = re.exec(String(prefer || '')))) {
    if (m[2] !== undefined) {
      const phrase = normalize(m[2]).trim();
      if (!phrase) continue;
      (m[1] ? exclude : phrases).push(phrase);
    } else {
      const word = normalize(m[4]).trim();
      if (!word) continue;
      (m[3] ? exclude : include).push(word);
    }
  }
  // Two plain words that sit next to each other in the request ("full body")
  // earn a bonus when they also sit together in the caption.
  const pairs = [];
  for (let i = 0; i + 1 < include.length; i++) pairs.push(`${include[i]} ${include[i + 1]}`);
  return { include, exclude, phrases, pairs };
}

export function score(text, p) {
  const t = normalize(text);
  let s = 0;
  for (const w of p.include) if (t.includes(w)) s += 1;
  for (const ph of p.phrases) if (t.includes(ph)) s += 2;
  for (const pair of p.pairs) if (t.includes(pair)) s += 0.5;
  for (const w of p.exclude) if (t.includes(w)) s -= 3;
  return s;
}

// Stable: images with equal scores keep the page's own order.
export function rankByPrefer(items, prefer, textOf) {
  const p = parsePrefer(prefer);
  if (!p.include.length && !p.phrases.length && !p.exclude.length) return items.slice();
  return items
    .map((item, i) => ({ item, i, s: score(textOf(item), p) }))
    .sort((a, b) => b.s - a.s || a.i - b.i)
    .map((x) => Object.assign(x.item, { matchScore: x.s }));
}
