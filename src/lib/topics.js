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
// It is a transparent extractor, no model call: text is cut into runs of
// content words at stopwords, punctuation and line breaks; every run and its
// one-to-four word pieces are candidates; a candidate becomes a topic when
// more than one session carries it. Phrases are matched on stems
// ("passage"/"passages") and shown in the form you wrote most. A phrase that
// only ever appears inside a longer one folds into it, so "CARS" does not
// list beside "MCAT CARS passages". Phrases that always occur together are
// one topic, named by the task and its parts ("Lab: Prep master mix, Analyze
// gel bands"), and a narrow phrase whose sessions all sit inside a broader
// topic folds into it ("MCAT biochem" under "MCAT"), so the rows read as
// where the hours went rather than as overlapping fragments. Sessions nothing
// recurs in are listed by their title and the first line of their note, so
// no hour goes missing.
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
  'learn learning learned look looking looked think thinking thought help helping'
).split(/\s+/))

const MAX_WORDS = 4      // longest window; a whole run up to MAX_RUN words is also a candidate
const MAX_RUN = 8

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
// break or a stopword. Each token keeps its written form for display and a
// lowercased stem for matching.
export function contentRuns(text) {
  const runs = []
  let cur = []
  const flush = () => { if (cur.length) runs.push(cur); cur = [] }
  const re = /[A-Za-z0-9][A-Za-z0-9'’-]*|[^\sA-Za-z0-9]+|\r?\n/g
  let m
  while ((m = re.exec(String(text || ''))) !== null) {
    const raw = m[0]
    if (!/^[A-Za-z0-9]/.test(raw)) { flush(); continue }          // punctuation or a line break
    const form = raw.replace(/['’]s$/i, '').replace(/[-'’]+$/g, '')
    const low = form.toLowerCase()
    if (!low || STOP.has(low)) { flush(); continue }
    const alpha = /[a-z]/i.test(low)
    // A lone letter is noise; a two-letter token only counts when it is an
    // acronym written in capitals ("AI", "ER").
    if (alpha && low.length < 3 && form !== form.toUpperCase()) { flush(); continue }
    cur.push({ form, key: alpha ? stem(low) : low, alpha })
  }
  flush()
  return runs
}

// Every candidate phrase in one piece of text: each run's 1–4 word windows,
// plus the whole run when it is longer than that, so a recurring sentence
// becomes one topic rather than a row of overlapping pieces. A phrase starts
// on a real word (a number may ride along after one), a single word must be
// three letters or an acronym, and an activity word never stands alone.
export function phrasesIn(text) {
  const out = new Map()   // key → form (first seen)
  for (const run of contentRuns(text)) {
    const sizes = []
    for (let n = 1; n <= Math.min(MAX_WORDS, run.length); n++) sizes.push(n)
    if (run.length > MAX_WORDS && run.length <= MAX_RUN) sizes.push(run.length)
    for (const n of sizes) {
      for (let i = 0; i + n <= run.length; i++) {
        const win = run.slice(i, i + n)
        if (!win[0].alpha) continue                           // "12 pages" is a quantity, not a topic; "chapter 12" is fine
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
function gistOf(e) {
  const lines = [String(e.desc || ''), ...(Array.isArray(e.subList) ? e.subList : [String(e.subs || '')])]
    .flatMap(t => String(t).split(/\r?\n/)).map(t => t.replace(/\s+/g, ' ').trim()).filter(Boolean)
  const g = lines[0] || ''
  return g.length > 60 ? g.slice(0, 57).replace(/\s+\S*$/, '') + '…' : g
}

// Is `short` a contiguous piece of `long` (on stems)?
function within(shortKey, longKey) {
  return shortKey !== longKey && (' ' + longKey + ' ').includes(' ' + shortKey + ' ')
}

function clip(str, n = 60) { return str.length > n ? str.slice(0, n - 3).replace(/[\s,:]+\S*$/, '') + '…' : str }

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

  // A phrase whose sessions nearly all sit inside a longer phrase is just a
  // piece of it: fold it away and keep the more descriptive one.
  const byLen = kept.slice().sort((a, b) => b.key.split(' ').length - a.key.split(' ').length)
  const dropped = new Set()
  for (const long of byLen) {
    if (dropped.has(long.key)) continue
    for (const short of kept) {
      if (dropped.has(short.key) || !within(short.key, long.key)) continue
      let both = 0
      for (const i of short.idx) if (long.idx.has(i)) both++
      if (both / short.idx.size >= fold) dropped.add(short.key)
    }
  }
  kept = kept.filter(c => !dropped.has(c.key))

  // Two overlapping pieces of one sentence that recur together are one topic:
  // when a shorter phrase shares a word and every session with a longer one,
  // the longer wins.
  const sameSet = (a, b) => a.idx.size === b.idx.size && [...a.idx].every(i => b.idx.has(i))
  const shares = (a, b) => { const bs = new Set(b.key.split(' ')); return a.key.split(' ').some(w => bs.has(w)) }
  const frag = new Set()
  const byLen2 = kept.slice().sort((a, b) => b.key.split(' ').length - a.key.split(' ').length)
  for (let i = 0; i < byLen2.length; i++) {
    if (frag.has(byLen2[i].key)) continue
    for (let j = i + 1; j < byLen2.length; j++) {
      const a = byLen2[i], b = byLen2[j]
      if (frag.has(b.key) || b.key.split(' ').length >= a.key.split(' ').length) continue
      if (sameSet(a, b) && shares(a, b)) frag.add(b.key)
    }
  }
  kept = kept.filter(c => !frag.has(c.key))

  // Phrases that occur in exactly the same sessions are one topic, not several
  // rows that each count those hours again. Name it by what was written: the
  // one phrase from the notes, or the task's name with its parts after it.
  const sig = c => [...c.idx].sort((a, b) => a - b).join(',')
  const groups = new Map()
  for (const c of kept) { const k = sig(c); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(c) }
  const merged = []
  for (const group of groups.values()) {
    if (group.length === 1) { merged.push(group[0]); continue }
    const words = c => c.key.split(' ').length
    const body = group.filter(c => c.inBody).sort((a, b) => words(b) - words(a) || b.forms.size - a.forms.size)
    const titles = group.filter(c => !c.inBody).sort((a, b) => words(b) - words(a))
    const rep = body[0] || titles[0]
    let label
    if (!body.length) label = display(titles[0].forms)
    else if (body.length === 1) label = display(body[0].forms)
    else {
      // The strongest parts only: phrases over single words, at most three,
      // each exactly as written.
      const multi = body.filter(c => words(c) > 1)
      const parts = (multi.length ? multi : body).slice(0, 3).map(c => display(c.forms, true))
      label = titles.length ? clip(`${display(titles[0].forms)}: ${parts.join(', ')}`) : clip(parts.map((t, i) => i ? t : t.charAt(0).toUpperCase() + t.slice(1)).join(', '))
    }
    merged.push({ ...rep, label })
  }
  kept = merged

  // A narrower topic whose sessions nearly all sit inside a broader one is a
  // facet of it — "MCAT biochem" under "MCAT" — and folds in; its text still
  // shows in the broader topic's sessions. A bare one-word title never
  // absorbs a phrase from the notes, only other bare titles.
  const isLabel = c => !c.inBody && !c.key.includes(' ')
  kept.sort((a, b) => b.idx.size - a.idx.size || b.mins - a.mins)
  const facet = new Set()
  for (let i = 0; i < kept.length; i++) {
    const big = kept[i]
    if (facet.has(big.key)) continue
    for (let j = i + 1; j < kept.length; j++) {
      const small = kept[j]
      if (facet.has(small.key) || small.idx.size >= big.idx.size) continue
      if (isLabel(big) && !isLabel(small)) continue
      let both = 0
      for (const k of small.idx) if (big.idx.has(k)) both++
      if (both / small.idx.size >= fold) facet.add(small.key)
    }
  }
  kept = kept.filter(c => !facet.has(c.key))

  // A one-word title that never appears in a note is a label ("Study",
  // "Lab"), not a topic. When another topic already covers nearly all of its
  // sessions, the label steps aside; when it is all we know, it stays.
  const labels = new Set()
  for (const c of kept) {
    if (c.inBody || c.key.includes(' ')) continue
    for (const d of kept) {
      if (d === c || labels.has(d.key)) continue
      let both = 0
      for (const i of c.idx) if (d.idx.has(i)) both++
      if (both / c.idx.size >= fold) { labels.add(c.key); break }
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
      label: c.label || display(c.forms),
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
  return rows.slice(0, max)
}
