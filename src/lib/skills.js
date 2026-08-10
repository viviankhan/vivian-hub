// src/lib/skills.js
// ─────────────────────────────────────────────────────────────
// Skill inference for the Informatics page.
//
// The rest of the app measures WHERE your time goes (by category) and WHAT you
// worked on (by task title). This module answers a different, more personal
// question: WHICH SKILLS were you actually exercising? It reads the full text
// of everything you finished — the task title, its description, and every
// subtask — and matches that text against a curated taxonomy of skills
// ("Writing", "Programming", "Lab work", …). A task can exercise several skills
// at once (a "Write results section" subtask under a "Run PCR assay" task
// counts toward both Writing and Lab work), so skills overlap freely.
//
// There's no model call here — it's a transparent keyword/stem matcher, so the
// same input always yields the same skills and you can see exactly why a skill
// showed up (the contributing tasks are kept alongside each match).
// ─────────────────────────────────────────────────────────────

// Fold a word toward a stem so plurals / verb forms line up ("writing" →
// "writ", "studies" → "studi"). Mirrors the stemmers used elsewhere so the
// taxonomy keywords (pre-stemmed below) line up with task vocabulary.
function stem(w) {
  if (w.length > 5 && w.endsWith('ing')) return w.slice(0, -3)
  if (w.length > 4 && w.endsWith('ed')) return w.slice(0, -2)
  if (w.length > 4 && w.endsWith('es')) return w.slice(0, -2)
  if (w.length > 4 && w.endsWith('s') && !w.endsWith('ss')) return w.slice(0, -1)
  return w
}

function tokenSet(text) {
  const set = new Set()
  for (const w of (String(text || '').toLowerCase().match(/[a-z0-9]+/g) || [])) {
    if (w.length >= 2) set.add(stem(w))
  }
  return set
}

// The taxonomy. Each skill has:
//   words   — single keywords; matched against the STEMMED words of a task
//   phrases — multi-word cues; matched as substrings of the raw lowercased text
//   icon/color — for the Informatics UI
// Keywords are written in plain form and stemmed once at load, so "write",
// "writing" and "wrote"-ish forms all collapse to the same stem the task text
// does. Keep keywords specific enough not to fire on everyday filler.
const TAXONOMY = [
  { id: 'writing', label: 'Writing', icon: 'glyph:pencil', color: '#6C7BE0',
    words: ['write', 'writing', 'wrote', 'essay', 'draft', 'blog', 'article', 'report', 'journal', 'manuscript', 'thesis', 'summary', 'summarize', 'copywriting', 'proofread', 'edit', 'editing'],
    phrases: ['personal statement', 'cover letter', 'lab report', 'take notes', 'note taking', 'blog post', 'op-ed'] },

  { id: 'reading', label: 'Reading', icon: 'glyph:bookOpen', color: '#C58BE0',
    words: ['read', 'reading', 'textbook', 'chapter', 'novel', 'paper', 'literature', 'book', 'articles'],
    phrases: ['read chapter', 'do the reading', 'assigned reading', 'literature review'] },

  { id: 'studying', label: 'Studying & memory', icon: 'glyph:brain', color: '#E08B8B',
    words: ['study', 'studying', 'review', 'revise', 'flashcard', 'anki', 'memorize', 'quiz', 'recall', 'exam', 'midterm', 'final', 'lecture', 'homework', 'coursework'],
    phrases: ['study for', 'exam prep', 'review notes', 'go over', 'practice test', 'practice exam', 'mcat', 'do practice'] },

  { id: 'programming', label: 'Programming', icon: 'glyph:code', color: '#4FB3A9',
    words: ['code', 'coding', 'program', 'programming', 'debug', 'script', 'python', 'javascript', 'typescript', 'java', 'react', 'algorithm', 'function', 'api', 'refactor', 'deploy', 'compile', 'git', 'leetcode', 'sql', 'query', 'backend', 'frontend'],
    phrases: ['fix bug', 'build feature', 'pull request', 'unit test', 'code review', 'ship the'] },

  { id: 'data', label: 'Data & analysis', icon: 'glyph:chart', color: '#5B8FE0',
    words: ['data', 'analyze', 'analysis', 'statistics', 'stats', 'spreadsheet', 'excel', 'dataset', 'chart', 'graph', 'regression', 'model', 'metric', 'dashboard', 'visualization'],
    phrases: ['analyze data', 'crunch numbers', 'pivot table', 'data set', 'run the numbers'] },

  { id: 'research', label: 'Research', icon: 'glyph:search', color: '#7E8BE0',
    words: ['research', 'experiment', 'hypothesis', 'survey', 'investigate', 'cite', 'citation', 'reference', 'methodology', 'findings'],
    phrases: ['lit review', 'literature review', 'look into', 'gather sources', 'systematic review'] },

  { id: 'lab', label: 'Lab work', icon: 'glyph:flask', color: '#4FA96B',
    words: ['lab', 'assay', 'pipette', 'culture', 'microscope', 'dissection', 'specimen', 'sample', 'reagent', 'titration', 'pcr', 'gel', 'centrifuge', 'buffer', 'protocol', 'staining'],
    phrases: ['run the assay', 'lab work', 'wet lab', 'cell culture', 'bench work'] },

  { id: 'math', label: 'Math & problem solving', icon: 'glyph:calculator', color: '#E0A24F',
    words: ['math', 'calculus', 'algebra', 'equation', 'integral', 'derivative', 'geometry', 'trig', 'trigonometry', 'proof', 'compute', 'calculate', 'formula'],
    phrases: ['problem set', 'p-set', 'math homework', 'work through problems', 'solve for'] },

  { id: 'design', label: 'Design & visual', icon: 'glyph:palette', color: '#E07BB5',
    words: ['design', 'figma', 'sketch', 'illustrate', 'photoshop', 'logo', 'layout', 'prototype', 'wireframe', 'mockup', 'typography', 'palette', 'canva'],
    phrases: ['ui design', 'ux design', 'visual design', 'design system', 'lay out'] },

  { id: 'communication', label: 'Communication', icon: 'glyph:chat', color: '#4FB3E0',
    words: ['email', 'call', 'message', 'reply', 'respond', 'followup', 'reach', 'outreach', 'network', 'correspond', 'text', 'dm', 'coordinate'],
    phrases: ['reach out', 'follow up', 'catch up', 'send email', 'reply to', 'get in touch', 'check in'] },

  { id: 'speaking', label: 'Presenting & speaking', icon: 'glyph:presentation', color: '#E0664F',
    words: ['present', 'presentation', 'speech', 'talk', 'slides', 'deck', 'powerpoint', 'keynote', 'seminar', 'pitch', 'defend', 'demo', 'webinar'],
    phrases: ['public speaking', 'give a talk', 'present to', 'stand up', 'slide deck'] },

  { id: 'planning', label: 'Planning & organizing', icon: 'glyph:clipboard', color: '#8B9AA9',
    words: ['plan', 'planning', 'organize', 'schedule', 'roadmap', 'milestone', 'agenda', 'prioritize', 'coordinate', 'delegate', 'outline', 'strategy'],
    phrases: ['plan out', 'set up', 'game plan', 'to-do', 'project plan', 'map out', 'block out'] },

  { id: 'teaching', label: 'Teaching & mentoring', icon: 'glyph:gradcap', color: '#C99A4F',
    words: ['teach', 'tutor', 'mentor', 'explain', 'grade', 'grading', 'coach', 'onboard'],
    phrases: ['office hours', 'help with homework', 'walk through', 'tutoring session'] },

  { id: 'fitness', label: 'Fitness & training', icon: 'glyph:dumbbell', color: '#4FC97E',
    words: ['workout', 'running', 'gym', 'yoga', 'exercise', 'stretch', 'cardio', 'lift', 'lifting', 'swim', 'pilates', 'jog', 'hike', 'treadmill', 'peloton'],
    phrases: ['work out', 'go for a run', 'leg day', 'strength training'] },

  { id: 'creative', label: 'Creative & making', icon: 'glyph:brush', color: '#B57BE0',
    words: ['draw', 'drawing', 'paint', 'painting', 'music', 'piano', 'guitar', 'compose', 'craft', 'knit', 'photograph', 'photo', 'film', 'video', 'record', 'sing', 'instrument'],
    phrases: ['edit video', 'make a video', 'record a', 'practice piano', 'practice guitar'] },

  { id: 'cooking', label: 'Cooking', icon: 'glyph:utensils', color: '#E0A85B',
    words: ['cook', 'cooking', 'bake', 'baking', 'recipe', 'kitchen'],
    phrases: ['meal prep', 'cook dinner', 'make dinner', 'prep meals'] },

  { id: 'language', label: 'Language learning', icon: 'glyph:globe', color: '#5BB0E0',
    words: ['spanish', 'french', 'mandarin', 'chinese', 'german', 'japanese', 'korean', 'duolingo', 'vocabulary', 'vocab', 'translate', 'conjugate', 'bilingual'],
    phrases: ['language practice', 'learn spanish', 'learn french', 'practice vocab'] },

  { id: 'finance', label: 'Finance & budgeting', icon: 'glyph:wallet', color: '#4FA95B',
    words: ['budget', 'invoice', 'tax', 'taxes', 'finance', 'expense', 'invest', 'accounting', 'payroll', 'reconcile', 'billing', 'receipt'],
    phrases: ['do taxes', 'balance the', 'track expenses', 'pay bills'] },
]

const SKILL_BY_ID = new Map(TAXONOMY.map(s => [s.id, s]))

// Pre-stem the taxonomy keywords once so matching is a cheap Set lookup.
const STEMMED = TAXONOMY.map(s => ({
  id: s.id,
  words: new Set(s.words.map(w => stem(w.toLowerCase()))),
  phrases: (s.phrases || []).map(p => p.toLowerCase()),
}))

// The full, matchable text for one time entry: its category label, title,
// description and subtask text, all folded together.
export function entryText(e, categories = []) {
  const cat = (categories || []).find(c => c.id === e?.cat)
  const catLabel = cat?.label || ''
  return `${catLabel} ${e?.title || ''} ${e?.desc || ''} ${e?.subs || ''}`.trim()
}

// Which skills does this blob of text exercise? Returns an array of skill ids.
export function inferSkills(text) {
  const low = String(text || '').toLowerCase()
  if (!low) return []
  const toks = tokenSet(low)
  const out = []
  for (const s of STEMMED) {
    let hit = false
    for (const w of s.words) { if (toks.has(w)) { hit = true; break } }
    if (!hit) { for (const p of s.phrases) { if (low.includes(p)) { hit = true; break } } }
    if (hit) out.push(s.id)
  }
  return out
}

export function skillMeta(id) {
  const s = SKILL_BY_ID.get(id)
  return s ? { id: s.id, label: s.label, icon: s.icon, color: s.color } : { id, label: id, icon: 'glyph:star', color: '#9AA6B2' }
}

// Roll a list of time entries up by skill. Each row carries the total minutes,
// the number of sessions, the distinct days, and the specific tasks that fed
// it (so the UI can show "why is this here?").
export function computeSkills(entries = [], categories = []) {
  const map = new Map()
  for (const e of entries) {
    const ids = inferSkills(entryText(e, categories))
    if (!ids.length) continue
    for (const id of ids) {
      let row = map.get(id)
      if (!row) {
        const m = skillMeta(id)
        row = { id, label: m.label, icon: m.icon, color: m.color, mins: 0, count: 0, days: new Set(), tasks: new Map() }
        map.set(id, row)
      }
      row.mins += e.mins || 0
      row.count += 1
      if (e.date) row.days.add(e.date)
      const title = (e.title || 'Untitled').trim() || 'Untitled'
      const tkey = title.toLowerCase()
      const t = row.tasks.get(tkey) || { title, mins: 0, count: 0 }
      t.mins += e.mins || 0; t.count += 1
      row.tasks.set(tkey, t)
    }
  }
  return [...map.values()]
    .map(r => ({
      ...r,
      days: r.days.size,
      tasks: [...r.tasks.values()].sort((a, b) => b.count - a.count || b.mins - a.mins),
    }))
    .sort((a, b) => b.mins - a.mins || b.count - a.count)
}

// Does a free-typed topic name one of the skills directly? Used so "how many
// hours on writing?" can resolve to the Writing skill even if no task title
// literally contains the word. Returns the matching skill id or null.
export function skillForTopic(topic) {
  const toks = tokenSet(topic)
  if (!toks.size) return null
  for (const s of TAXONOMY) {
    const labelToks = tokenSet(s.label)
    for (const lt of labelToks) if (toks.has(lt)) return s.id
    for (const w of STEMMED.find(x => x.id === s.id).words) if (toks.has(w)) return s.id
  }
  return null
}

export { TAXONOMY as SKILLS }
