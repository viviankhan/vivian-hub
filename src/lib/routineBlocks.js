// src/lib/routineBlocks.js
// One-time fold of the old routine groups into time blocks. A routine used to
// be a named, tinted group that tasks were filed under; a time block does the
// same job (a labeled film behind a stretch of the day, with every task that
// starts inside it auto-completing) and is the one container the app keeps.
//
// Each routine becomes a block named after it, painted its tint, spanning its
// timed tasks from the earliest start to the latest end. Repeating tasks are
// bucketed by schedule, so a routine whose steps don't all run on the same
// days gets one repeating block per schedule rather than a block on days it
// never had anything. A routine's one-off tasks get a one-off block per date.
// Every task loses its `routine` key; untimed steps have no window to sit in,
// so they simply stay as ordinary tasks.
//
// Pure: it takes what's stored and returns what to write. Block ids are
// derived from the routine id, so a re-run after a half-finished pass skips
// the blocks it already created instead of making duplicates.
import { splitTimePrefix } from './occurrences.js'

const DEFAULT_STEP_MINS = 15

const hhmmToMins = (t) => { const [h, m] = String(t).split(':').map(Number); return h * 60 + m }
const minsToHHMM = (n) => `${String(Math.floor(n / 60)).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`

// The sun for a morning routine, the moon for a night one — the same glyph the
// routine wore on the timeline, so its block looks familiar.
function glyphFor(name) {
  const n = (name || '').toLowerCase()
  return (n.includes('night') || n.includes('evening')) ? 'glyph:moon' : 'glyph:sun'
}

// The earliest start → latest end across timed steps, or null. A step with no
// duration still claims a short slot, so the block's window reaches past it.
function windowOf(steps) {
  let start = Infinity, end = -Infinity
  for (const s of steps) {
    start = Math.min(start, s.start)
    end = Math.max(end, s.start + (s.dur || DEFAULT_STEP_MINS))
  }
  if (!isFinite(start)) return null
  return { start, end: Math.min(end, 24 * 60) }
}

// The repeat rule a recurring row runs on, as a stable key.
function scheduleKey(row, meta) {
  return JSON.stringify([
    meta.freq || 'weekly', meta.interval || 1, meta.monthDay || null,
    [...(row.days || [])].sort(), row.startDate || null, row.endDate || null,
  ])
}

const stripRoutine = (metaMap) => {
  let touched = false
  const next = {}
  for (const [k, v] of Object.entries(metaMap || {})) {
    if (v && 'routine' in v) {
      const { routine, ...rest } = v
      touched = true
      if (Object.keys(rest).length) next[k] = rest
    } else next[k] = v
  }
  return touched ? next : null
}

export function needsRoutineFold({ routines, recurringMeta, commitmentMeta }) {
  const filed = (m) => Object.values(m || {}).some(v => v && v.routine)
  return (Array.isArray(routines) && routines.length > 0) || filed(recurringMeta) || filed(commitmentMeta)
}

// → { recurringBlocks: [row], commitmentBlocks: [row],
//     recurringMeta: next|null, commitmentMeta: next|null }
// The new rows still need adding; the meta blobs come back whole (routine keys
// gone, the new blocks' meta in), or null when that blob needs no write.
export function foldRoutinesIntoBlocks({ routines = [], recurringRows = [], recurringMeta = {}, commitments = [], commitmentMeta = {} }) {
  const existingRecurring = new Set((recurringRows || []).map(r => r.id))
  const existingCommitments = new Set((commitments || []).map(c => c.id))
  const recurringBlocks = []
  const commitmentBlocks = []

  for (const group of routines || []) {
    if (!group || !group.id) continue
    const name = (group.name || 'Routine').trim()
    const color = group.tint || null
    const icon = glyphFor(name)

    // Repeating steps, bucketed by the schedule they run on.
    const buckets = new Map()
    for (const row of recurringRows || []) {
      const meta = recurringMeta?.[row.id] || {}
      if (meta.routine !== group.id || meta.block) continue
      const { time } = splitTimePrefix(row.label != null ? row.label : (row.text || ''))
      if (!time) continue
      const key = scheduleKey(row, meta)
      if (!buckets.has(key)) buckets.set(key, { row, meta, steps: [] })
      buckets.get(key).steps.push({ start: hhmmToMins(time), dur: meta.durationMins || 0, cat: row.cat || row.tag || '' })
    }
    let i = 0
    for (const { row, meta, steps } of buckets.values()) {
      const id = `r-blk-${group.id}-${i++}`
      const w = windowOf(steps)
      if (!w || existingRecurring.has(id)) continue
      recurringBlocks.push({
        row: {
          id, label: `${minsToHHMM(w.start)} — ${name}`,
          days: [...(row.days || [])], startDate: row.startDate || null, endDate: row.endDate || null,
          cat: steps[0].cat || '', tag: steps[0].cat || '', note: '',
        },
        meta: {
          block: true, durationMins: w.end - w.start,
          ...(meta.freq && meta.freq !== 'weekly' ? { freq: meta.freq } : {}),
          ...(meta.interval && meta.interval > 1 ? { interval: meta.interval } : {}),
          ...(meta.monthDay ? { monthDay: meta.monthDay } : {}),
          ...(color ? { color } : {}), icon,
        },
      })
    }

    // One-off steps, one block per date.
    const byDate = new Map()
    for (const c of commitments || []) {
      const meta = commitmentMeta?.[c.id] || {}
      if (meta.routine !== group.id || meta.block || !c.time || !c.date) continue
      if (!byDate.has(c.date)) byDate.set(c.date, [])
      byDate.get(c.date).push({ start: hhmmToMins(c.time), dur: c.durationMins || 0, cat: c.cat || '' })
    }
    for (const [date, steps] of byDate) {
      const id = `c-blk-${group.id}-${date}`
      const w = windowOf(steps)
      if (!w || existingCommitments.has(id)) continue
      commitmentBlocks.push({
        row: { id, text: name, date, time: minsToHHMM(w.start), durationMins: w.end - w.start, cat: steps[0].cat || '', done: false },
        meta: { block: true, ...(color ? { color } : {}), icon },
      })
    }
  }

  const nextMeta = (metaMap, blocks) => {
    const stripped = stripRoutine(metaMap)
    if (!stripped && !blocks.length) return null
    const next = { ...(stripped || metaMap || {}) }
    for (const b of blocks) next[b.row.id] = b.meta
    return next
  }
  return {
    recurringBlocks: recurringBlocks.map(b => b.row),
    commitmentBlocks: commitmentBlocks.map(b => b.row),
    recurringMeta: nextMeta(recurringMeta, recurringBlocks),
    commitmentMeta: nextMeta(commitmentMeta, commitmentBlocks),
  }
}
