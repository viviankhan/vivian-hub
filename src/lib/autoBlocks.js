// src/lib/autoBlocks.js
// ─────────────────────────────────────────────────────────────
// Events that hold other events become time blocks on their own.
//
// When something is scheduled inside a longer event (lunch at 12:30 during a
// 12–2 study session), the longer one is treated as a time block for the day,
// so what sits inside it nests in it — and a block inside that nests again,
// Russian-doll style. It's worked out fresh from the day's schedule each time
// rather than saved, so it undoes itself the moment the inner event moves out
// or is deleted, and the event itself is never rewritten.
// ─────────────────────────────────────────────────────────────

// items: [{ id, start (minutes), dur (minutes, 0 for a point in time), block }]
// Returns the ids of the plain events (not already blocks) that wholly contain
// a strictly shorter event. Two events of the same length never swallow each
// other; one that only partly overlaps another is left alone.
export function autoBlockIds(items) {
  const timed = (items || []).filter(x => x && x.id != null && Number.isFinite(x.start))
  const out = new Set()
  for (const c of timed) {
    const cDur = c.dur || 0
    if (c.block || cDur <= 0) continue
    const cEnd = c.start + cDur
    const holds = timed.some(x => {
      if (x.id === c.id) return false
      const xDur = x.dur || 0
      return xDur < cDur && x.start >= c.start && x.start < cEnd && x.start + xDur <= cEnd
    })
    if (holds) out.add(c.id)
  }
  return out
}
