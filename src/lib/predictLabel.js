// src/lib/predictLabel.js
// ─────────────────────────────────────────────────────────────
// Predict which label (category) a new task should get from what you've
// labeled before — so a task only gets a default label when there's real
// evidence for it, and otherwise stays unlabeled.
//
// It learns from your own history: past commitments and recurring tasks that
// carry a category. For a new title we look at the words in it, and see which
// category those words have historically gone with. The strongest match wins,
// but only if it clears a small confidence bar; below that we return null and
// the task is left without a label.
// ─────────────────────────────────────────────────────────────

// Filler words that shouldn't drive a prediction (mirrors the glyph stopwords).
const STOPWORDS = new Set(('a an the to of in on at for with and or but my me your our this that these those ' +
  'is be am are do does go get got set make made take give given have has had new some any it its ' +
  'up out off via about into from over again more less week day today tomorrow morning night ' +
  'call meeting appt appointment session').split(/\s+/))

// Fold a word toward a stem so plurals / verb forms line up ("meetings" →
// "meeting", "running" → "run"). Same shape as glyphs.jsx's stem().
function stem(w) {
  if (w.length > 5 && w.endsWith('ing')) return w.slice(0, -3)
  if (w.length > 5 && w.endsWith('ed'))  return w.slice(0, -2)
  if (w.length > 4 && w.endsWith('es'))  return w.slice(0, -2)
  if (w.length > 4 && w.endsWith('s') && !w.endsWith('ss')) return w.slice(0, -1)
  return w
}

// Pull the meaningful, stemmed words out of a title.
function tokens(title) {
  const raw = String(title || '').toLowerCase().match(/[a-z]+/g) || []
  return [...new Set(raw.filter(w => w.length >= 3 && !STOPWORDS.has(w)).map(stem))]
}

// Strip a leading "9:30 AM — " time prefix a recurring label may carry, so the
// prefix words don't pollute the learned vocabulary.
function stripTimePrefix(label) {
  return String(label || '').replace(/^~?\s*\d{1,2}:\d{2}\s*(?:AM|PM)?\s*[—–-]\s*/i, '')
}

// Build a word → { catId: count } model from history. `history` is a list of
// { title, cat } pairs (commitments + recurring templates the user has made).
export function buildLabelModel(history = []) {
  const model = new Map()   // word -> Map(catId -> count)
  for (const item of history) {
    if (!item || !item.cat) continue
    for (const w of tokens(item.title)) {
      let counts = model.get(w)
      if (!counts) { counts = new Map(); model.set(w, counts) }
      counts.set(item.cat, (counts.get(item.cat) || 0) + 1)
    }
  }
  return model
}

// Turn the app's raw data into the { title, cat } history the model wants.
export function historyFromData({ commitments = [], recurring = [] } = {}) {
  const out = []
  for (const c of commitments) {
    if (c && c.cat && (c.text || '').trim()) out.push({ title: c.text, cat: c.cat })
  }
  for (const r of recurring) {
    const cat = r && (r.cat || r.tag)
    const label = r && (r.label != null ? r.label : r.text)
    if (cat && label) out.push({ title: stripTimePrefix(label), cat })
  }
  return out
}

// Predict a category id for a title, or null when there isn't enough signal.
// `validIds` (when given) restricts predictions to categories that still exist.
export function predictLabel(title, model, validIds = null) {
  if (!model || !model.size) return null
  const words = tokens(title)
  if (!words.length) return null

  const score = new Map()   // catId -> summed evidence
  let anyEvidence = false
  for (const w of words) {
    const counts = model.get(w)
    if (!counts) continue
    for (const [cat, n] of counts) {
      if (validIds && !validIds.has(cat)) continue
      score.set(cat, (score.get(cat) || 0) + n)
      anyEvidence = true
    }
  }
  if (!anyEvidence) return null

  // Highest-scoring category, requiring a small margin so a single ambiguous
  // word (one that's gone with several labels equally) doesn't force a guess.
  let bestCat = null, best = 0, second = 0
  for (const [cat, s] of score) {
    if (s > best) { second = best; best = s; bestCat = cat }
    else if (s > second) { second = s }
  }
  // Need at least 2 supporting observations, and a clear lead over the runner-up.
  if (best >= 2 && best > second) return bestCat
  return null
}
