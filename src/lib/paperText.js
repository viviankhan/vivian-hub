// src/lib/paperText.js
// ─────────────────────────────────────────────────────────────
// Pure helpers for the Papers reader: finding the sentence being spoken, laying
// sentences out in paragraphs, marking glossary terms. No DOM, no network, so
// they are unit-tested directly (tests/paperText.test.mjs).
//
// ⚠ This file never splits text into sentences. The narrator
// (scripts/narrate/voice.py) does the split while it renders the audio and
// stores the exact list it used in section.lines; the cues index into that
// list. A second, independent split here is exactly what made the highlight
// drift in the prototype (abbreviations, decimals). Render from `lines`.
// ─────────────────────────────────────────────────────────────

// Cue `i` values that aren't a line index.
export const CUE_HEADING = -1
export const CUE_FIGURE = -2

// Index of the last cue with t <= time, or -1 before the first. Cues are
// time-ordered (the narrator writes them that way).
export function findCue(cues, time) {
  if (!Array.isArray(cues) || !cues.length || !(time >= cues[0].t)) return -1
  let lo = 0, hi = cues.length - 1
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if (cues[mid].t <= time) lo = mid
    else hi = mid - 1
  }
  return lo
}

// Where section `s` starts in the audio (its heading cue, or its first cue of
// any kind), or null if the section has no cues.
export function sectionStart(cues, s) {
  if (!Array.isArray(cues)) return null
  for (const c of cues) if (c.s === s) return c.t
  return null
}

// Which section is playing at `time` (0 before the first cue).
export function sectionAt(cues, time) {
  const k = findCue(cues, time)
  return k < 0 ? 0 : cues[k].s
}

const squash = s => String(s || '').replace(/\s+/g, ' ').trim()

// Group a section's `lines` into paragraphs: [[{ i, text }, …], …].
//
// The narrator records how many lines each paragraph got (section.paras). For
// papers narrated before it did, the lines are matched back to the body's
// paragraphs in order — this only decides where the blank lines go; the lines
// themselves are used exactly as stored.
export function paragraphs(section) {
  const lines = Array.isArray(section?.lines) ? section.lines : []
  const items = lines.map((text, i) => ({ i, text }))
  if (!items.length) return []

  const sizes = section.paras
  if (Array.isArray(sizes) && sizes.length && sizes.reduce((a, b) => a + b, 0) === items.length) {
    const out = []; let k = 0
    for (const n of sizes) { if (n > 0) out.push(items.slice(k, k + n)); k += n }
    return out
  }

  const paras = String(section.body || '').split(/\n\s*\n/).map(squash).filter(Boolean)
  if (paras.length < 2) return [items]
  const out = [[]]
  let p = 0, pos = 0
  for (const it of items) {
    const t = squash(it.text)
    let at = paras[p].indexOf(t, pos)
    if (at < 0 && p + 1 < paras.length && paras[p + 1].indexOf(t) >= 0 && out[out.length - 1].length) {
      p += 1; pos = 0; out.push([])
      at = paras[p].indexOf(t)
    }
    if (at >= 0) pos = at + t.length
    out[out.length - 1].push(it)
  }
  return out
}

// Body text as display paragraphs, for a paper that hasn't been narrated yet
// (no `lines`). Nothing is highlighted then, so nothing needs splitting.
export function bodyParagraphs(section) {
  return String(section?.body || '').split(/\n\s*\n/).map(squash).filter(Boolean)
}

const escapeRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// Split `text` into [{ text, term? }] with glossary terms marked. Matching is
// case-insensitive and whole-word; longer terms win over shorter ones they
// contain ("T-cell exhaustion" over "exhaustion").
export function markTerms(text, terms) {
  const s = String(text || '')
  const list = (Array.isArray(terms) ? terms : [])
    .filter(t => t && typeof t.term === 'string' && t.term.trim().length > 1)
    .sort((a, b) => b.term.length - a.term.length)
  if (!list.length || !s) return [{ text: s }]
  const re = new RegExp('(?<![\\p{L}\\p{N}])(' + list.map(t => escapeRe(t.term.trim())).join('|') + ')(?![\\p{L}\\p{N}])', 'giu')
  const out = []
  let last = 0
  for (const m of s.matchAll(re)) {
    if (m.index > last) out.push({ text: s.slice(last, m.index) })
    const hit = list.find(t => t.term.trim().toLowerCase() === m[0].toLowerCase())
    out.push({ text: m[0], term: hit })
    last = m.index + m[0].length
  }
  if (last < s.length) out.push({ text: s.slice(last) })
  return out
}

// 498.6 → "8:18"; 3725 → "1:02:05".
export function formatTime(sec) {
  const t = Math.max(0, Math.floor(Number(sec) || 0))
  const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60
  const mm = h ? String(m).padStart(2, '0') : String(m)
  return (h ? h + ':' : '') + mm + ':' + String(s).padStart(2, '0')
}

// A paper as it should be stored, from an imported JSON object (the prototype's
// export, or anything shaped like it). Cues, duration and audio are dropped:
// they belong to audio this Bloom doesn't have, and the narrator regenerates
// all three. Existing `lines` are kept so the text reads well until then.
export function paperFromImport(p) {
  if (!p || typeof p !== 'object') return null
  const sections = (Array.isArray(p.sections) ? p.sections : [])
    .map(s => ({
      heading: String(s?.heading || '').trim(),
      body: String(s?.body || '').replace(/\r\n/g, '\n').trim(),
      ...(Array.isArray(s?.lines) ? { lines: s.lines.map(String) } : {}),
      // A figure path points into the exporting app's storage, not Bloom's.
      figure: null,
    }))
    .filter(s => s.body)
  if (!sections.length) return null
  return {
    title: String(p.title || 'Untitled paper').trim(),
    authors: String(p.authors || '').trim(),
    journal: String(p.journal || '').trim(),
    year: String(p.year ?? '').trim(),
    doi: String(p.doi || '').trim(),
    sections,
    terms: (Array.isArray(p.terms) ? p.terms : [])
      .filter(t => t && t.term && t.def)
      .map(t => ({ term: String(t.term), def: String(t.def) })),
  }
}

// ── Pasted text ────────────────────────────────────────────────
// Text you paste (or open from a .txt file) is read aloud word for word — no
// rewriting. This only decides where the section breaks go and tidies line
// wrapping; the narrator still does the sentence split.
//
// Headings are short lines standing alone as a paragraph with no closing
// punctuation ("Methods", "2. Results"). If the text has at least two, they
// become the sections. Otherwise paragraphs are grouped into parts of roughly
// `target` words, never splitting a paragraph.
const HEADING_MAX = 80

function cleanParagraph(p) {
  return p
    .replace(/(\p{L})-\n(\p{Ll})/gu, '$1$2')   // "immuno-\nglobulin" → "immunoglobulin"
    .replace(/\s*\n\s*/g, ' ')
    .replace(/[ \t ]{2,}/g, ' ')
    .trim()
}

function looksLikeHeading(p) {
  return !p.includes('\n') && p.length <= HEADING_MAX && /\p{L}/u.test(p) && !/[.!?,;:]["'”’)]?$/.test(p)
}

const words = s => (s.match(/\S+/g) || []).length

export function sectionsFromText(text, { target = 170 } = {}) {
  const src = String(text || '').replace(/\r\n?/g, '\n').trim()
  if (!src) return []
  // Paragraphs are separated by blank lines. Text with none (common when
  // copying from web pages and apps) gets one paragraph per line instead.
  const raw = /\n\s*\n/.test(src) ? src.split(/\n\s*\n/) : src.split('\n')
  const paras = raw.map(p => p.trim()).filter(Boolean)

  // A document title ("Lab notes" directly above a "Background" heading) is
  // the title, not a section of its own; the paste screen uses it as one.
  if (paras.length > 2 && looksLikeHeading(paras[0]) && looksLikeHeading(paras[1])) paras.shift()
  const isHead = paras.map((p, i) => looksLikeHeading(p) && i < paras.length - 1 && !looksLikeHeading(paras[i + 1]))
  if (isHead.filter(Boolean).length >= 2) {
    const out = []
    let cur = null
    paras.forEach((p, i) => {
      if (isHead[i]) { cur = { heading: p.replace(/\s+/g, ' '), body: [] }; out.push(cur); return }
      if (!cur) { cur = { heading: '', body: [] }; out.push(cur) }
      cur.body.push(cleanParagraph(p))
    })
    return out.filter(s => s.body.length)
      .map((s, i) => ({ heading: s.heading || (i === 0 ? 'Introduction' : `Part ${i + 1}`), body: s.body.join('\n\n') }))
  }

  const out = []
  let cur = [], n = 0
  for (const p of paras.map(cleanParagraph)) {
    const w = words(p)
    if (cur.length && n + w > target * 1.4) { out.push(cur); cur = []; n = 0 }
    cur.push(p); n += w
    if (n >= target) { out.push(cur); cur = []; n = 0 }
  }
  if (cur.length) {
    // A short tail joins the part before it rather than standing alone.
    if (out.length && n < target / 3) out[out.length - 1].push(...cur)
    else out.push(cur)
  }
  return out.map((ps, i) => ({ heading: `Part ${i + 1}`, body: ps.join('\n\n') }))
}

// Rough listening time for display: Alba reads about 150 words a minute.
export function estimateMinutes(sections) {
  const w = sections.reduce((n, s) => n + words(s.body) + words(s.heading), 0)
  return Math.max(1, Math.round(w / 150))
}
