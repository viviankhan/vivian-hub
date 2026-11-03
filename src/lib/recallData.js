// src/lib/recallData.js
// Loads everything recall.js answers from — notes, journal, meds, tasks,
// completions, moods, conditions and the visit log — from the same
// offline-first mirrors the app itself reads, so it works with no signal.
import { getVisits, knownPlaces, trackingEnabled } from './visits.js'
import { loadLifelog } from './lifelog.js'
import { getCommitments, getCommitmentMeta, getRecurringTasks, getRecurringMeta, getCompletions, getWellnessCheckins, getWellnessEpisodes, getWellnessEffects, getRecurringExceptions } from './storage.js'
import { DEFAULT_EFFECTS } from './wellness.js'

export async function gatherRecallData() {
  const safe = (p, fb) => Promise.resolve(p).catch(() => fb)
  const [life, commitments, cmeta, recurring, rmeta, completions, checkins, episodes, effects, tracking, exceptions] = await Promise.all([
    safe(loadLifelog(), {}), safe(getCommitments(), []), safe(getCommitmentMeta(), {}), safe(getRecurringTasks(), []), safe(getRecurringMeta(), {}),
    safe(getCompletions(), {}), safe(getWellnessCheckins(), []), safe(getWellnessEpisodes(), []), safe(getWellnessEffects(), null),
    safe(trackingEnabled(), false), safe(getRecurringExceptions(), {}),
  ])
  return {
    ...life,
    commitments: (commitments || []).map(c => ({ ...c, ...((cmeta || {})[c.id] || {}) })),
    recurring: (recurring || []).map(r => ({ ...r, ...((rmeta || {})[r.id] || {}) })),
    completions: completions || {}, checkins: checkins || [], episodes: episodes || [],
    effects: effects || DEFAULT_EFFECTS, exceptions: exceptions || {},
    stays: getVisits(), places: knownPlaces(), tracking,
  }
}
