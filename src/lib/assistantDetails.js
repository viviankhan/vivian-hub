// src/lib/assistantDetails.js
// ─────────────────────────────────────────────────────────────
// Details are not subtasks.
//
// Given a seminar flyer, the assistant listed "In person: Phoenix – IERB
// Auditorium", "Virtual: Teams – https://…", "Presenter: James Han…" and
// "Host: Dr. Hirohito Kita" as SUBTASKS — four checkboxes for things nobody
// does. Where, how to join, who's speaking, IDs and passcodes belong in the
// task's notes. A subtask is a step you do and tick off.
//
// normalizeActions() moves detail lines out of subtasks:
//   • create      → appended to the task's description
//   • addSubtasks → an { kind: 'addDetails', taskId, details } action that
//                   adds them to the existing task's notes (the subtask
//                   action is dropped if nothing step-like is left)
//
// Pure: tested in tests/assistantDetails.test.mjs.
// ─────────────────────────────────────────────────────────────

const LABELS = [
  'in[- ]person', 'virtual', 'online', 'hybrid', 'location', 'where', 'room', 'venue', 'address', 'building', 'floor', 'desk',
  'zoom', 'teams', 'webex', 'google meet', 'meet', 'link', 'join', 'url', 'meeting id', 'meeting number', 'passcode', 'password', 'pin',
  'dial[- ]in', 'phone', 'call[- ]in', 'presenter', 'presented by', 'speaker', 'speakers', 'host', 'hosted by', 'organizer', 'organiser',
  'moderator', 'chair', 'contact', 'email', 'rsvp', 'parking', 'when', 'time', 'date', 'cost', 'price', 'dress code', 'note', 'notes',
]
const LABELED = new RegExp(`^\\s*(${LABELS.join('|')})\\b[^:]{0,30}:`, 'i')

export function isDetailLine(text) {
  const t = String(text || '').trim()
  if (!t) return false
  if (LABELED.test(t)) return true
  if (/https?:\/\/|www\.\S+/i.test(t)) return true
  if (/\b(meeting id|passcode|password)\b/i.test(t)) return true
  return false
}

export function splitDetails(subtasks) {
  const steps = [], details = []
  for (const s of subtasks || []) (isDetailLine(s?.text) ? details : steps).push(s)
  return { steps, details: details.map(s => String(s.text).trim()) }
}

export function normalizeActions(actions) {
  const out = []
  for (const a of actions || []) {
    if (!a || !Array.isArray(a.subtasks) || !a.subtasks.length) { out.push(a); continue }
    const { steps, details } = splitDetails(a.subtasks)
    if (!details.length) { out.push(a); continue }
    if (a.kind === 'create') {
      out.push({ ...a, subtasks: steps, description: [a.description, ...details].filter(Boolean).join('\n') })
    } else if (a.kind === 'addSubtasks') {
      out.push({ kind: 'addDetails', taskId: a.taskId, details })
      if (steps.length) out.push({ ...a, subtasks: steps })
    } else out.push(a)
  }
  return out
}

export function normalizePlan(plan) {
  if (!plan || !Array.isArray(plan.actions)) return plan
  const actions = normalizeActions(plan.actions)
  return actions.length === plan.actions.length && actions.every((a, i) => a === plan.actions[i]) ? plan : { ...plan, actions }
}
