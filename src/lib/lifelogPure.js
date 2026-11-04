// src/lib/lifelogPure.js — the pure half of lifelog.js (no storage), so it can
// be unit-tested in node and shared with the assistant's recall.

export function noteKey(date, taskId) { return `${date}_${taskId}` }

// Words that mean a medication problem worth keeping in front of you.
export const MED_ALERT_RE = /\b(ran out|run out|running (?:low|out)|out of (?:my )?\w+|need(?:s)? (?:a |to )?refill|refill|no more (?:pills|meds?)|missed (?:a |my )?(?:dose|meds?|pills?)|forgot (?:to take )?(?:my )?(?:meds?|pills?|dose)|pharmacy|prescription|side effects?)\b/i

export function isMedAlert(text) { return MED_ALERT_RE.test(String(text || '')) }

// The med notes and journal entries that read like a medication problem and
// haven't been cleared. → [{ id, at, text, title, source }] newest first.
export function medAlerts({ dayNotes = {}, journal = [], medIds = {}, cleared = {} }) {
  const out = []
  for (const [key, n] of Object.entries(dayNotes || {})) {
    if (!n || !n.text || cleared[key]) continue
    if (medIds[n.taskId] && isMedAlert(n.text)) out.push({ id: key, at: n.updatedAt || n.at, text: n.text, title: n.title || 'Medication', source: 'med' })
  }
  for (const j of journal || []) {
    if (!j || cleared[j.id] || !isMedAlert(j.text)) continue
    // A journal line counts only when it's about meds ("ran out of coffee" isn't).
    const aboutMeds = /\b(med|meds|medication|pill|pills|dose|prescription|refill|pharmacy|mg)\b/i.test(j.text)
    if (!aboutMeds) continue
    out.push({ id: j.id, at: j.at, text: j.text, title: 'Journal', source: 'journal' })
  }
  return out.sort((a, b) => String(b.at).localeCompare(String(a.at)))
}

