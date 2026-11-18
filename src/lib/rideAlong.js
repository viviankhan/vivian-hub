// src/lib/rideAlong.js
// ─────────────────────────────────────────────────────────────
// A block's own tasks move with it when you get there late.
//
// A located block (Work at the office) starts when you actually arrive, not
// when it was planned. Get in at 10:08 for a 9:30 Work block and the block
// slides to 10:08, but "Check In" and "Check email" at 9:30 were left behind,
// stranded before work began, in time you weren't there for.
//
// So a task in the block's category that was planned inside the block's window
// but now falls before its real start moves later by the same amount the
// block did: 9:30 Check In lands at 10:08, and one planned at 9:45 lands at
// 10:23, so they keep their order and spacing. Tasks already after the real
// start stay put (a 2pm meeting doesn't move because you were late), as does
// anything in another category or outside the block's planned window.
//
// It's worked out fresh from the day each time and never saved, the same way
// autoBlocks is, so it undoes itself if the arrival time is corrected.
// ─────────────────────────────────────────────────────────────

// blocks: [{ id, cat, start, planned }] — start is where the block really is,
//   planned is where it was scheduled (both in minutes).
// task: { tag, mins } — the task's category and its start in minutes.
// Returns { mins, blockId } for where the task should be, or null to leave it.
export function rideAlong(blocks, task) {
  if (!task || task.tag == null || !Number.isFinite(task.mins)) return null
  for (const b of blocks || []) {
    if (!b || b.cat == null || b.cat !== task.tag) continue
    if (!Number.isFinite(b.start) || !Number.isFinite(b.planned)) continue
    const late = b.start - b.planned
    if (late <= 0) continue
    if (task.mins >= b.planned && task.mins < b.start) return { mins: task.mins + late, blockId: b.id }
  }
  return null
}
