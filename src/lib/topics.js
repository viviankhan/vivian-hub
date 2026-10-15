// src/lib/topics.js
// ─────────────────────────────────────────────────────────────
// Topics — the things you actually worked on, read from everything you wrote.
//
// A task's title is often just a label ("Work", "Study", "Lab"); the
// description and the subtasks are where it says what the work was. Grouping
// by title piles all of that under the label. This pulls key phrases out of
// the title, the description and every subtask instead, so "grant proposal"
// shows up as a topic with hours behind it even when every session that fed
// it was titled "Work".
//
// It is a transparent extractor, no model call:
//   • Text is cut into runs of content words at stopwords, punctuation, line
//     breaks, links, clock times and contractions. Any script's letters count
//     (Résumé, Café, María). A number only rides along after a word that
//     numbers things ("chapter 12", "section 2"); elsewhere it cuts the run.
//   • Every piece of a run is a candidate, matched on stems
//     ("passage"/"passages") and shown in the form you wrote most. A candidate
//     becomes a topic when more than one session carries it.
//   • A piece that only ever appears inside a longer phrase folds into it, so
//     "CARS" does not list beside "MCAT CARS passages". Phrases that always
//     occur together are one row, named by the task and its parts ("Lab: Prep
//     master mix, Analyze gel bands"). A narrower topic folds into a broader
//     one only when they share a word ("MCAT biochem" under "MCAT") — a place
//     or a person that recurs in most notes never swallows the projects
//     beside it.
//   • A title that only labels the work ("Lab", "Study time", "Focus block")
//     steps aside once the notes cover its sessions; a title that names the
//     work ("Thesis", "Anki") stays on the row ("Thesis: pages").
//   • Sessions nothing recurs in are listed by their title and the first line
//     of their note, so no hour goes missing.
// Rows can overlap: one session can count toward several topics.
// ─────────────────────────────────────────────────────────────

// Words that never carry a topic on their own and cut a phrase where they
// fall: function words, the verbs every task is phrased with, and the labels
// people reach for when they do not name the work.
const STOP = new Set((
  'a an the and or but nor so yet of for to in on at by with from into onto over under up down out off ' +
  'about around through during before after between among per via as is are was were be been being am ' +
  'do does did doing done have has had having get got gets getting go goes went going gone make made making ' +
  'take took taking put set keep kept let use used using try tried trying ' +
  'i me my mine myself we us our ours you your yours he him his she her hers it its they them their theirs ' +
  'this that these those what which who whom whose where when why how all any both each few more most other ' +
  'some such no not only own same than too very also just still again ever never now then once here there ' +
  'can could will would shall should may might must need needs needed want wants wanted ' +
  'work working worked works task tasks todo to-do thing things stuff misc etc item items session sessions ' +
  'finish finished finishing complete completed continue continued continuing start started starting ' +
  'today tomorrow yesterday tonight morning afternoon evening week weeks weekend day days hour hours hr hrs ' +
  'min mins minute minutes am pm ok okay bit some lot lots little various general ' +
  'next last first second third new old big small quick long short part parts half whole rest'
).split(/\s+/))

// Activity words that say how you worked, not what on. They may sit inside a
// phrase ("Anki review", "CARS practice passages", "lab meeting") but never
// stand alone as a topic — "Review" or "Study" on its own says nothing.
const WEAK = new Set((
  'review reviews reviewed reviewing read reading reads write writing wrote written study studying studied studies ' +
  'practice practicing practiced prep prepare preparing prepared plan planning planned meeting meetings call calls ' +
  'email emails check checking checked update updating updated fix fixing fixed draft drafting edit editing ' +
  'note notes homework assignment assignments lecture lectures class classes session sessions ' +
  'learn learning learned look looking looked think thinking thought help helping ' +
  'forget remember send sending sent reply replying replied ask asking asked talk talking talked ' +
  'discuss discussing discussed show showing showed present presenting presented submit submitting submitted ' +
  'bring brought buy bought pick picked clean cleaning cleaned run running ran figure figuring'
).split(/\s+/))

// Words that name where or how you worked rather than what on — the labels
// people put on a task. As a title they step aside once the notes say what
// the work was; they never prefix a topic's name.
const LABEL = new Set((
  'lab admin deep focus block blocks time slot errand errands chore chores school research personal home ' +
  'office routine gym misc general class classes lecture lectures meeting meetings shift job campus library ' +
  'desk project projects stuff side hustle grind sprint pomodoro'
).split(/\s+/))

// Words that number things: a number may follow them ("chapter 12",
// "problem set 3"). Anywhere else a number is a quantity, a year or a time
// and cuts the phrase.
const ORDINAL = new Set((
  'chapter ch section sec lecture lec unit module lesson problem set pset exercise question part ' +
  'episode ep figure fig table appendix level version phase round stage step quiz exam test midterm ' +
  'assignment lab hw homework psalm verse room grade block'
).split(/\s+/))

const MAX_WINDOW = 10    // the longest phrase considered; runs are short once cut at stopwords

// Fold a word toward its stem so plurals and verb forms line up: passages →
// passage, classes → class, studies → study, analysis stays analysis.
function stem(w) {
  if (w.length > 5 && w.endsWith('ing')) return w.slice(0, -3)
  if (w.length > 4 && w.endsWith('ed')) return w.slice(0, -2)
  if (w.length > 4 && w.endsWith('ies')) return w.slice(0, -3) + 'y'
  if (/(ss|us|is)$/.test(w)) return w
  if (w.length > 4 && /(ches|shes|xes|zes|ses)$/.test(w)) return w.slice(0, -2)
  if (w.length > 3 && w.endsWith('s')) return w.slice(0, -1)
  return w
}

// Cut text into runs of content words. A run ends at punctuation, a line
// break, a stopword, a contraction, a clock time or a link; a number ends it
// unless the word before it numbers things. Each token keeps its written
// form for display and a lowercased stem for matching.
const LINK = /\b(?:https?:\/\/|www\.)\S+|[^\s@]+@[^\s@]+\.[^\s@]+/giu
const TOKEN = /\d{1,2}:\d{2}(?:\s*[ap]\.?m\.?)?|[\p{L}\p{N}][\p{L}\p{M}\p{N}'’-]*|\r?\n|[^\s\p{L}\p{N}]+/gu
const ord = t => ORDINAL.has(t.key) || ORDINAL.has(t.form.toLowerCase())
export function contentRuns(text) {
  const runs = []
  let cur = []
  const flush = () => { if (cur.length) runs.push(cur); cur = [] }
  const src = String(text || '').replace(LINK, '\n')
  let m
  TOKEN.lastIndex = 0
  while ((m = TOKEN.exec(src)) !== null) {
    const raw = m[0]
    if (!/^[\p{L}\p{N}]/u.test(raw) || /^\d{1,2}:\d{2}/.test(raw)) { flush(); continue }   // punctuation, a break, a clock time
    if (/['’](?:t|m|ll|ve|re|d)$/i.test(raw)) { flush(); continue }                         // I'm, don't, we'll — never a topic
    const form = raw.replace(/['’]s$/i, '').replace(/[-'’]+$/g, '')
    const low = form.toLowerCase()
    if (!low || STOP.has(low)) { flush(); continue }
    const alpha = /\p{L}/u.test(low)
    if (!alpha) {
      // A number rides along only after a word that numbers things.
      if (cur.length && ord(cur[cur.length - 1])) { cur.push({ form, key: low, alpha }); continue }
      flush(); continue
    }
    if (/^\d+(?:am|pm|st|nd|rd|th|k|x)?$/i.test(low)) { flush(); continue }                 // 9am, 3rd, 10k
    // A lone letter is noise; a two-letter token only counts when it is an
    // acronym written in capitals ("AI", "ER").
    if (low.length < 3 && form !== form.toUpperCase()) { flush(); continue }
    cur.push({ form, key: stem(low), alpha })
  }
  flush()
  return runs
}

// Every candidate phrase in one piece of text: every window of every run, up
// to MAX_WINDOW words, so the longest stretch two notes share is always on
// the table. A phrase starts on a real word, a single word must be three
// letters or an acronym, and an activity word never stands alone.
export function phrasesIn(text) {
  const out = new Map()   // key → form (first seen)
  for (const run of contentRuns(text)) {
    const top = Math.min(MAX_WINDOW, run.length)
    for (let n = 1; n <= top; n++) {
      for (let i = 0; i + n <= run.length; i++) {
        const win = run.slice(i, i + n)
        if (!win[0].alpha) continue
        if (n === 1 && (WEAK.has(win[0].key) || WEAK.has(win[0].form.toLowerCase()))) continue
        const key = win.map(t => t.key).join(' ')
        if (!out.has(key)) out.set(key, win.map(t => t.form).join(' '))
      }
    }
  }
  return out
}

// What was written about a session, apart from what it was called.
function bodyText(e) {
  const subs = Array.isArray(e.subList) ? e.subList.join('\n') : (e.subs || '')
  return `${e.desc || ''}\n${subs}`
}

// The form a phrase was written in most. `raw` keeps it exactly as written
// (for the parts after a colon); otherwise the first letter is capitalised
// so a row label starts cleanly.
function display(forms, raw = false) {
  let best = '', n = -1
  for (const [f, c] of forms) if (c > n) { best = f; n = c }
  return raw || !best ? best : best.charAt(0).toUpperCase() + best.slice(1)
}
// The first line of what was written about a session, for the rows nothing
// recurs in: "Deep work: Wrote the whole discussion section of the thesis".
// A pasted link reads as the site it points at ("Comments on docs.google.com").
function siteOf(url) {
  if (url.includes('@') && !/^(?:https?:|www\.)/i.test(url)) return url
  try { return new URL(/^www\./i.test(url) ? 'https://' + url : url).hostname.replace(/^www\./, '') } catch { return '' }
}
function gistOf(e) {
  const lines = [String(e.desc || ''), ...(Array.isArray(e.subList) ? e.subList : [String(e.subs || '')])]
    .flatMap(t => String(t).split(/\r?\n/)).map(t => t.replace(LINK, siteOf).replace(/\s+/g, ' ').trim()).filter(Boolean)
  const g = lines[0] || ''
  return g.length > 60 ? g.slice(0, 57).replace(/\s+\S*$/, '') + '…' : g
}

// Is `short` a contiguous piece of `long` (on stems)?
function within(shortKey, longKey) {
  return shortKey !== longKey && (' ' + longKey + ' ').includes(' ' + shortKey + ' ')
}

function clip(str, n = 60) { return str.length > n ? str.slice(0, n - 3).replace(/[\s,:]+\S*$/, '') + '…' : str }
// How many of a's sessions are also b's.
function overlap(a, b) {
  let both = 0
  for (const i of a.idx) if (b.idx.has(i)) both++
  return both
}
// Do two phrases share a word (on stems)?
function shares(a, b) {
  const bs = new Set(b.words)
  return a.words.some(w => bs.has(w))
}
// A phrase made only of labelling or activity words: "Lab", "Study time".
function generic(c) {
  return c.words.every(w => LABEL.has(w) || WEAK.has(w) || STOP.has(w))
}
// Index phrases by each word they contain, so a pass only compares phrases
// that could possibly relate.
function indexByWord(list) {
  const by = new Map()
  for (const c of list) for (const w of new Set(c.words)) { let a = by.get(w); if (!a) by.set(w, a = []); a.push(c) }
  return by
}

// Roll entries up by topic.
//   entries: [{ title, desc, subList|subs, mins, date, cat }]
// Returns rows sorted by hours then sessions:
//   { id, label, mins, count, days, cat, entries, fallback, gist }
// `cat` is the area most of the topic's sessions were filed under. Rows with
// `fallback` are sessions no recurring phrase covers, grouped by title and the
// first line of their note (`gist`), so no hour disappears from the list.
export function computeTopics(entries = [], { max = 40, minSessions = 2, fold = 0.8 } = {}) {
  const cands = new Map()      // key → { key, forms:Map, idx:Set, mins, count, inBody }
  entries.forEach((e, i) => {
    const fromTitle = phrasesIn(e.title || '')
    const fromBody = phrasesIn(bodyText(e))
    const found = new Map([...fromTitle, ...fromBody])
    for (const [key, form] of found) {
      let c = cands.get(key)
      if (!c) { c = { key, forms: new Map(), idx: new Set(), mins: 0, count: 0, inBody: false }; cands.set(key, c) }
      c.forms.set(form, (c.forms.get(form) || 0) + 1)
      c.idx.add(i); c.mins += e.mins || 0; c.count += 1
      if (fromBody.has(key)) c.inBody = true
    }
  })

  // Enough support to be a topic: more than one session carries it.
  let kept = [...cands.values()].filter(c => c.count >= minSessions)
  for (const c of kept) { c.words = c.key.split(' '); c.n = c.words.length; c.sig = [...c.idx].sort((a, b) => a - b).join(',') }

  // A phrase whose sessions nearly all sit inside a longer phrase is just a
  // piece of it: fold it away and keep the more descriptive one.
  let byWord = indexByWord(kept)
  const dropped = new Set()
  for (const long of kept.slice().sort((a, b) => b.n - a.n)) {
    if (long.n === 1 || dropped.has(long.key)) continue
    const seen = new Set()
    for (const w of long.words) for (const short of byWord.get(w) || []) {
      if (seen.has(short)) continue
      seen.add(short)
      if (short.n >= long.n || dropped.has(short.key) || !within(short.key, long.key)) continue
      if (overlap(short, long) / short.idx.size >= fold) dropped.add(short.key)
    }
  }
  kept = kept.filter(c => !dropped.has(c.key))

  // Two overlapping pieces of one sentence that recur together are one topic:
  // when a shorter phrase shares a word and every session with a longer one,
  // the longer wins. Only phrases with the same sessions can match, so each
  // group of identical sessions is compared on its own.
  const bySig = new Map()
  for (const c of kept) { let a = bySig.get(c.sig); if (!a) bySig.set(c.sig, a = []); a.push(c) }
  const frag = new Set()
  for (const group of bySig.values()) {
    if (group.length < 2) continue
    group.sort((a, b) => b.n - a.n)
    for (let i = 0; i < group.length; i++) {
      if (frag.has(group[i].key)) continue
      for (let j = i + 1; j < group.length; j++) {
        const a = group[i], b = group[j]
        if (frag.has(b.key) || b.n >= a.n) continue
        if (shares(a, b)) frag.add(b.key)
      }
    }
  }
  kept = kept.filter(c => !frag.has(c.key))

  // Phrases that occur in exactly the same sessions are one topic, not several
  // rows that each count those hours again. Name it by what was written: the
  // phrase from the notes — after the task's name when the name says what the
  // work was ("Thesis: pages") — or the name with its parts after it.
  const groups = new Map()
  for (const c of kept) { let a = groups.get(c.sig); if (!a) groups.set(c.sig, a = []); a.push(c) }
  const merged = []
  for (const group of groups.values()) {
    if (group.length === 1) { merged.push(group[0]); continue }
    const body = group.filter(c => c.inBody).sort((a, b) => b.n - a.n || b.forms.size - a.forms.size)
    const titles = group.filter(c => !c.inBody).sort((a, b) => b.n - a.n)
    const rep = body[0] || titles[0]
    const named = titles.find(t => !generic(t))
    let label
    if (!body.length) label = display(titles[0].forms)
    else if (body.length === 1) label = named ? clip(`${display(named.forms)}: ${display(body[0].forms, true)}`) : display(body[0].forms)
    else {
      // The strongest parts only: phrases over single words, at most three,
      // each exactly as written.
      const multi = body.filter(c => c.n > 1)
      const parts = (multi.length ? multi : body).slice(0, 3).map(c => display(c.forms, true))
      label = titles.length ? clip(`${display(titles[0].forms)}: ${parts.join(', ')}`) : clip(parts.map((t, i) => i ? t : t.charAt(0).toUpperCase() + t.slice(1)).join(', '))
    }
    merged.push({ ...rep, label })
  }
  kept = merged

  // A narrower topic whose sessions nearly all sit inside a broader one that
  // shares a word with it is a facet of it — "MCAT biochem" under "MCAT" —
  // and folds in; its text still shows in the broader topic's sessions. A
  // word that recurs beside unrelated projects (a place, a person, a tool)
  // shares no word with them, so it never swallows them. A title never
  // absorbs a phrase from the notes.
  kept.sort((a, b) => b.idx.size - a.idx.size || b.mins - a.mins)
  byWord = indexByWord(kept)
  const facet = new Set()
  for (const big of kept) {
    if (facet.has(big.key)) continue
    const seen = new Set()
    for (const w of big.words) for (const small of byWord.get(w) || []) {
      if (small === big || seen.has(small)) continue
      seen.add(small)
      if (facet.has(small.key) || small.idx.size >= big.idx.size) continue
      if (!big.inBody && small.inBody) continue
      if (overlap(small, big) / small.idx.size >= fold) facet.add(small.key)
    }
  }
  kept = kept.filter(c => !facet.has(c.key))

  // A title that never appears in a note is a label, not a topic, once the
  // notes cover its sessions. A labelling title ("Lab", "Study time") steps
  // aside when the topics from the notes together cover it; a one-word title
  // that names the work steps aside only when a single topic covers it, and
  // when it is all we know, it stays.
  const fromNotes = new Set()
  for (const c of kept) if (c.inBody) for (const i of c.idx) fromNotes.add(i)
  const labels = new Set()
  for (const c of kept) {
    if (c.inBody) continue
    if (generic(c)) {
      let cov = 0
      for (const i of c.idx) if (fromNotes.has(i)) cov++
      if (cov / c.idx.size >= fold) labels.add(c.key)
      continue
    }
    if (c.n > 1) continue
    for (const d of kept) {
      if (d === c || labels.has(d.key)) continue
      if (overlap(c, d) / c.idx.size >= fold) { labels.add(c.key); break }
    }
  }
  kept = kept.filter(c => !labels.has(c.key))

  // Sessions that no surviving phrase covers fall back to their title and the
  // first line of their note.
  const covered = new Set()
  for (const c of kept) for (const i of c.idx) covered.add(i)
  const fallbacks = new Map()
  entries.forEach((e, i) => {
    if (covered.has(i)) return
    const title = String(e.title || '').trim()
    const gist = gistOf(e)
    const label = title && gist ? `${title}: ${gist}` : (title || gist || 'Untitled')
    const key = 'title:' + label.toLowerCase()
    let f = fallbacks.get(key)
    if (!f) { f = { key, forms: new Map([[label, 1]]), idx: new Set(), mins: 0, count: 0, fallback: true, gist: !!gist }; fallbacks.set(key, f) }
    f.idx.add(i); f.mins += e.mins || 0; f.count += 1
  })

  const rows = [...kept, ...fallbacks.values()].map(c => {
    const es = [...c.idx].map(i => entries[i])
    const cats = new Map()
    for (const e of es) if (e.cat) cats.set(e.cat, (cats.get(e.cat) || 0) + 1)
    let cat = '', n = 0
    for (const [k, v] of cats) if (v > n) { cat = k; n = v }
    return {
      id: c.key,
      label: c.label || clip(display(c.forms)),
      mins: c.mins,
      count: c.count,
      days: new Set(es.map(e => e.date).filter(Boolean)).size,
      cat,
      fallback: !!c.fallback,
      gist: !!c.gist,
      entries: es.slice().sort((a, b) => (b.date || '').localeCompare(a.date || '')),
    }
  })
  rows.sort((a, b) => b.mins - a.mins || b.count - a.count || a.label.localeCompare(b.label))
  return Number.isFinite(max) ? rows.slice(0, max) : rows
}
