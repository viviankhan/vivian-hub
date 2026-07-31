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

// Build a model from history. `history` is a list of { title, cat } pairs
// (commitments + recurring templates the user has made). Returns:
//   words  — Map(word -> Map(catId -> count))
//   catDocs — Map(catId -> how many items carry that label)
//   total  — number of labeled items
// catDocs/total let us down-weight a label that's on nearly everything (e.g.
// tasks that were auto-tagged "Lab" before), so it doesn't drown real signal.
export function buildLabelModel(history = []) {
  const words = new Map()
  const catDocs = new Map()
  let total = 0
  for (const item of history) {
    if (!item || !item.cat) continue
    total++
    catDocs.set(item.cat, (catDocs.get(item.cat) || 0) + 1)
    for (const w of tokens(item.title)) {
      let counts = words.get(w)
      if (!counts) { counts = new Map(); words.set(w, counts) }
      counts.set(item.cat, (counts.get(item.cat) || 0) + 1)
    }
  }
  return { words, catDocs, total }
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

// Two words count as related if one is a prefix of the other (min length 4), so
// "work" lines up with "workout"/"working" and "meet" with "meeting".
function related(a, b) {
  if (a === b) return true
  if (a.length < 4 || b.length < 4) return false
  return a.startsWith(b) || b.startsWith(a)
}

// Predict a category id for a title, or null when there isn't enough signal.
// `validIds` (when given) restricts predictions to categories that still exist.
export function predictLabel(title, model, validIds = null) {
  if (!model || !model.words || !model.words.size) return null
  const words = tokens(title)
  if (!words.length) return null

  // Inverse-frequency weight per category: a label that's on almost every task
  // (like a stale blanket "Lab") carries little signal; a selective one carries
  // a lot. log(1 + total/catDocs) → ~0.7 for an everything-label, larger for
  // rare ones.
  const idf = (cat) => {
    const dc = model.catDocs.get(cat) || 1
    return Math.log(1 + (model.total || 1) / dc)
  }

  const score = new Map()   // catId -> summed evidence
  let anyEvidence = false
  const addFrom = (counts, weight) => {
    for (const [cat, n] of counts) {
      if (validIds && !validIds.has(cat)) continue
      score.set(cat, (score.get(cat) || 0) + n * weight * idf(cat))
      anyEvidence = true
    }
  }
  for (const w of words) {
    const exact = model.words.get(w)
    if (exact) addFrom(exact, 2)   // an exact word match is the strongest signal
    // Also credit related words (prefix match) at a lower weight, so a close
    // variant of a word you've labeled before still contributes.
    for (const [key, counts] of model.words) {
      if (key !== w && related(w, key)) addFrom(counts, 0.5)
    }
  }
  if (!anyEvidence) return null

  // Highest-scoring category, requiring a clear lead over the runner-up so a
  // word that's gone with several labels equally doesn't force a guess.
  let bestCat = null, best = 0, second = 0
  for (const [cat, s] of score) {
    if (s > best) { second = best; best = s; bestCat = cat }
    else if (s > second) { second = s }
  }
  // A single confident, unambiguous past match is enough to predict.
  if (best >= 1 && best > second + 0.01) return bestCat
  return null
}
