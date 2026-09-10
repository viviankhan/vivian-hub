// src/components/DayRail.jsx
// ─────────────────────────────────────────────────────────────
// The unintrusive wellness rail down the left of the Today tab. A luminescent
// "mind" blob rides the left edge at the current time and drifts down as the day
// goes on. Tapping it dims the rest of the screen (a film tinted to your accent)
// and fans two bubbles out to its right: an emotion cloud (log a mood moment,
// with an optional note about *why*) and a lotus (log a physical/mental status
// effect, with an optional description). Either one can carry photos — they are
// stored a row apiece and referenced by id, so the trackers' own synced blobs
// stay small no matter how many pictures you attach (see lib/photos.js).
//
// Everything you log lands on the rail at the time you logged it: mood clouds
// float beside their moment; status effects drop an icon whose colour trails
// downward to show how long it has lasted, running to the blob (and vanishing
// behind it) while still active. Tapping a trail ends that effect (asking, the
// first time). Markers that crowd the same time shrink and fan diagonally.
//
// Time travel. Feelings rarely get written down while they're happening, so the
// rail lets you place them after the fact:
//   • A past day has no blob (there is no "now" on it) — instead a small clock
//     winding backwards hovers at the top of the timeline and asks whether you
//     want to record something for that day. It opens the same two bubbles.
//   • Today's blob carries a third bubble: a clock that toggles *timed mode*.
//     Off, everything lands at this instant, exactly as it always has. On, both
//     sheets grow a "when" row so a moment can be given a time, and a feeling or
//     a condition a whole time frame. The choice is remembered between visits.
//   • Tapping any marker opens its detail card, which reads back the span it
//     covers and lets you correct either end of it.
// ─────────────────────────────────────────────────────────────
import { useState, useMemo, useEffect, useRef } from 'react'
import { Glyph, iconColorOn } from '../lib/glyphs.jsx'
import { GuideBlob, MoodCloud } from '../lib/critters.jsx'
import ColorPickRow from './ColorPickRow.jsx'
import { EffectIcon } from './IconPicker.jsx'
import IconSearchSheet from './IconSearchSheet.jsx'
import { PhotoPicker, PhotoStrip } from './PhotoAttach.jsx'
import TimeField from './TimeField.jsx'
import { savePhotos, deletePhoto, photoIds } from '../lib/photos.js'
import {
  dayKey, keyToDate, MOODS, moodMeta, selectableEmotions, makeEmotion, emotionMeta, EMOTION_PALETTE, checkinsForDay,
  DEFAULT_EFFECTS, POSITIVE_EFFECTS, makeEffect, EFFECT_COLORS, isActive, activeEpisode, startEpisode, endEpisode, setEpisodeNote,
  setEpisodePhotos, patchEpisode, patchCheckin, addEpisode,
  atTimeOn, timeOf, spanOk, spanMinutes,
  episodeMinutes, fmtDuration, applyCheckIn, awardPetals,
} from '../lib/wellness.js'

// The waking-day window the rail spans, in hours. 6am → midnight.
const DAY_START = 6, DAY_END = 24
const clockTime = (ts) => { try { return new Date(ts).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) } catch { return '' } }
// Fraction (0..1) of a timestamp within the visible window of a *given* day.
// Measured from that day's local midnight, so a marker or episode that belongs
// to a past day — or an open episode still running past the window — clamps to
// the day's edges instead of mis-reading its clock time onto the wrong day.
const fracInDay = (ms, dayStartMs) => {
  const h = (ms - dayStartMs) / 3600000
  return Math.max(0, Math.min(1, (h - DAY_START) / (DAY_END - DAY_START)))
}

// Timed mode is a preference, not a per-day choice: flip the blob's clock on and
// every sheet keeps offering times until you flip it back.
const TIMED_KEY = 'bloom_rail_timed'
const readTimed = () => { try { return localStorage.getItem(TIMED_KEY) === '1' } catch { return false } }
const writeTimed = (on) => { try { localStorage.setItem(TIMED_KEY, on ? '1' : '0') } catch {} }

// "yesterday" reads wrong after "on", so the phrase and the bare name are two
// different things: dayLabel gives the name, onDay the phrase you can drop into
// a sentence ("on Friday", but plain "yesterday").
const onDay = (name) => (name === 'yesterday' ? name : `on ${name}`)
// "Friday" / "Sep 3" — how a past day names itself in the clock's invitation.
function dayLabel(key) {
  const d = keyToDate(key)
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const diff = Math.round((today - d) / 86400000)
  if (diff === 1) return 'yesterday'
  if (diff < 7) return d.toLocaleDateString('en-US', { weekday: 'long' })
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

// A clock whose hands sweep *backwards* — the rail's little time machine. It
// marks a day that has already happened and, tapped, opens the same two bubbles
// the blob does.
function RewindClock({ size = 34 }) {
  return (
    <svg className="rail-clockface" viewBox="0 0 40 40" width={size} height={size} aria-hidden="true">
      <circle cx="20" cy="20" r="17" fill="#fff" stroke="currentColor" strokeWidth="2" opacity="0.95" />
      {[0, 90, 180, 270].map(a => (
        <line key={a} x1="20" y1="6.5" x2="20" y2="9.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"
          opacity="0.5" transform={`rotate(${a} 20 20)`} />
      ))}
      <g className="rail-hand rail-hand-h"><line x1="20" y1="20" x2="20" y2="12.5" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" /></g>
      <g className="rail-hand rail-hand-m"><line x1="20" y1="20" x2="20" y2="9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></g>
      <circle cx="20" cy="20" r="1.9" fill="currentColor" />
    </svg>
  )
}

// A kind line for the blob to speak, shaped by what you're carrying right now.
function affirm(activeEffects) {
  const bad = activeEffects.find(e => !e.good)
  const good = activeEffects.find(e => e.good)
  if (bad) return `${bad.name.toLowerCase()} today — I see you carrying it. Be as gentle with yourself as you'd be with a friend.`
  if (good) return `You're ${good.name.toLowerCase()} right now. Hold onto this — you've earned a good hour.`
  return 'However today is going, you showed up for it. That counts. I\'m right here.'
}

export default function DayRail({
  checkins = [], persistCheckins, effects, persistEffects,
  episodes = [], persistEpisodes, game, persistGame,
  emotionPrefs, persistEmotionPrefs,
  dateKey = dayKey(), isToday = true,
}) {
  // The day this rail represents. Today is interactive (the blob logs new
  // moments); a past day is a read-only record of what was tracked then.
  const today = dateKey
  const dayStartMs = useMemo(() => { const d = keyToDate(dateKey); d.setHours(0, 0, 0, 0); return d.getTime() }, [dateKey])
  const effectList = (effects && effects.length) ? effects : DEFAULT_EFFECTS
  const byId = useMemo(() => new Map(effectList.map(f => [f.id, f])), [effectList])
  const [nowMs, setNowMs] = useState(Date.now())
  useEffect(() => { const t = setInterval(() => setNowMs(Date.now()), 30000); return () => clearInterval(t) }, [])

  const [menu, setMenu] = useState(false)          // radial open
  const [sheet, setSheet] = useState(null)         // 'mood' | 'status' | null
  const [moodDetail, setMoodDetail] = useState(null)   // a tapped cloud
  // Timed mode: the sheets offer a time (and an end time) instead of stamping
  // "now". It is a remembered preference on today, and simply how a past day
  // works — there is no "now" back there to log against.
  const [timedPref, setTimedPref] = useState(readTimed)
  const timed = isToday ? timedPref : true
  const toggleTimed = () => setTimedPref(v => { writeTimed(!v); return !v })
  // The clock's invitation introduces itself when a past day opens, then gets
  // out of the timeline's way. Hovering or focusing the clock brings it back.
  const [asking, setAsking] = useState(false)
  useEffect(() => { setAsking(!isToday) }, [isToday, dateKey])
  useEffect(() => {
    if (!asking) return
    const t = setTimeout(() => setAsking(false), 6000)
    return () => clearTimeout(t)
  }, [asking])
  const nowFrac = fracInDay(nowMs, dayStartMs)
  const blobRef = useRef(null)
  const clockRef = useRef(null)
  const railRef = useRef(null)
  const [anchor, setAnchor] = useState(null)       // blob centre in viewport px
  // The timeline lays tasks out proportionally (per-task minimums, blocks and
  // capped gaps), so a plain 6am→midnight scale drifts from where a moment
  // actually sits on screen. Read the timeline's own geometry — each task pill
  // carries its start/end minute, plus the live "now" nodule — and build one
  // time→fraction map of the rail. Every rail element (moods, trails, the blob)
  // is placed through it, so they stay locked to the timeline, not the clock.
  const [timeMap, setTimeMap] = useState([])
  // Rail height in px, so the blob's body size can be expressed as a fraction.
  const [railH, setRailH] = useState(0)
  useEffect(() => {
    const measure = () => {
      const rail = railRef.current
      if (!rail) return
      const rr = rail.getBoundingClientRect()
      if (!rr.height) return
      const at = (px) => (px - rr.top) / rr.height
      const anchors = []
      document.querySelectorAll('[data-task-span]').forEach(pl => {
        const sm = Number(pl.dataset.smin), em = Number(pl.dataset.emin)
        const b = pl.getBoundingClientRect()
        if (Number.isFinite(sm) && pl.dataset.smin !== '') anchors.push({ min: sm, frac: at(b.top) })
        if (Number.isFinite(em) && pl.dataset.emin !== '') anchors.push({ min: em, frac: at(b.bottom) })
      })
      const nod = isToday ? document.querySelector('[data-now-nodule]') : null
      if (nod) {
        const nr = nod.getBoundingClientRect()
        anchors.push({ min: (nowMs - dayStartMs) / 60000, frac: at(nr.top + nr.height / 2) })
      }
      // Pin the rail's ends to the waking-day window so moments outside the
      // scheduled range still land sensibly.
      anchors.push({ min: DAY_START * 60, frac: 0 }, { min: DAY_END * 60, frac: 1 })
      anchors.sort((a, b) => a.min - b.min)
      // Keep it monotonic: two tasks can share a start time (or a short task can
      // be drawn below a longer one that ends later), which would otherwise make
      // the map run backwards.
      let prev = -Infinity
      const clean = []
      for (const a of anchors) {
        if (clean.length && a.min === clean[clean.length - 1].min) continue
        const f = Math.max(prev, Math.max(0, Math.min(1, a.frac)))
        clean.push({ min: a.min, frac: f }); prev = f
      }
      setRailH(rr.height)
      setTimeMap(clean)
    }
    measure()
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null
    const host = railRef.current?.parentElement
    if (ro && host) ro.observe(host)
    window.addEventListener('resize', measure)
    // The nodule hops between tasks as time passes / items complete without the
    // container resizing, so poll gently as a backstop.
    const t = setInterval(measure, 2000)
    return () => { ro && ro.disconnect(); window.removeEventListener('resize', measure); clearInterval(t) }
  }, [isToday, nowMs, dayStartMs, checkins, episodes])

  // Interpolate a minute-of-day onto the rail through the measured map; null
  // until it is ready, so callers fall back to the fractional day scale.
  const fracForMin = (min) => {
    const a = timeMap
    if (a.length < 2) return null
    if (min <= a[0].min) return a[0].frac
    if (min >= a[a.length - 1].min) return a[a.length - 1].frac
    for (let i = 1; i < a.length; i++) {
      if (min <= a[i].min) {
        const p = a[i - 1], q = a[i], span = (q.min - p.min) || 1
        return p.frac + ((min - p.min) / span) * (q.frac - p.frac)
      }
    }
    return a[a.length - 1].frac
  }
  // A timestamp → rail fraction, mapped through the timeline where possible.
  const railFrac = (ms) => {
    const f = fracForMin((ms - dayStartMs) / 60000)
    return f != null ? f : fracInDay(ms, dayStartMs)
  }
  // Where the blob sits: "now" through the same map, so it centres on the
  // timeline's nodule and every trail runs true to it.
  const blobFrac = (() => { const f = fracForMin((nowMs - dayStartMs) / 60000); return f != null ? f : nowFrac })()

  // A moment logged "now" lands exactly where the blob is, so it would sit
  // buried under its body. Instead those clouds hover just above the blob —
  // fanned radially around its crown — and only settle onto the rail once the
  // blob has drifted past the time they were logged at, i.e. once its whole
  // body clears that point.
  const BLOB_R = 30                       // half the blob's 54px body, plus a hair
  const heldAloft = (ms) => isToday && railH > 0 && (blobFrac - BLOB_R / railH) <= railFrac(ms)
  // The emotions offered in the picker (built-ins + custom, minus hidden). The
  // module registry is kept in sync by App on load and on every save, so this
  // recomputes whenever the prefs blob changes.
  const emotionOptions = useMemo(() => selectableEmotions(), [emotionPrefs])
  const closeAll = () => { setMenu(false); setSheet(null); setMoodDetail(null) }
  // The menu fans out of whatever opened it — the blob today, the rewind clock
  // on a past day — so the bubbles always appear to come out of that thing.
  const openMenu = () => {
    const r = (isToday ? blobRef : clockRef).current?.getBoundingClientRect()
    if (r) setAnchor({ left: r.left + r.width / 2, top: r.top + r.height / 2 })
    setMenu(true)
  }

  const todayMoments = useMemo(() => checkinsForDay(checkins, today), [checkins, today])
  const lastMood = todayMoments.length ? todayMoments[todayMoments.length - 1].mood : 4

  // The viewed day's status episodes (any span that touches it), resolved with
  // their effect. An open episode is capped at "now" today, or at the day's end
  // on a past day — so a past day keeps the trails exactly as they were tracked.
  const dayEndMs = dayStartMs + 86400000
  // An episode belongs to the day it began. Matching on "any span touching this
  // day" meant a condition you never explicitly ended haunted every day after
  // it — and since its start sits outside this day's window, its marker clamped
  // to the top of the rail still wearing yesterday's clock time. Scoping to the
  // start day keeps each day's rail a record of what was logged on it.
  const todayEpisodes = useMemo(() => {
    return (episodes || []).filter(e => {
      const s = Date.parse(e.start)
      return s >= dayStartMs && s < dayEndMs
    }).map(e => ({ ...e, fx: byId.get(e.effectId) })).filter(e => e.fx)
  }, [episodes, byId, dayStartMs, dayEndMs])

  // Markers that share a moment fan out diagonally and shrink so a cloud + an
  // effect at the same time read as one slot.
  const markers = useMemo(() => {
    const list = [
      ...todayMoments.map(c => ({ type: 'mood', key: c.id, frac: fracInDay(Date.parse(c.ts), dayStartMs), data: c })),
      ...todayEpisodes.map(e => ({ type: 'fx', key: e.id, frac: fracInDay(Date.parse(e.start), dayStartMs), data: e })),
    ].sort((a, b) => a.frac - b.frac)
    let cluster = -1, prev = -Infinity
    return list.map(m => {
      if (m.frac - prev < 0.035) cluster += 1; else cluster = 0
      prev = m.frac
      return { ...m, cluster }
    })
  }, [todayMoments, todayEpisodes, dayStartMs])

  // Everything the blob is currently holding — moods and status icons alike —
  // so each gets its own angle on the crown.
  const markerAt = (m) => Date.parse(m.type === 'mood' ? m.data.ts : m.data.start)
  const heldMarks = markers.filter(m => heldAloft(markerAt(m))).map(m => m.key)

  // ── Actions ──────────────────────────────────────────────
  // `times` is { start, end } in "HH:MM" on the viewed day, and only arrives
  // from a sheet in timed mode. With no start, a moment lands at this instant —
  // the original behaviour, untouched. An end turns the moment into a span.
  const logMood = (mood, emotions, note, photos, times) => {
    const startIso = times?.start ? atTimeOn(today, times.start) : new Date().toISOString()
    const endIso = times?.end ? atTimeOn(today, times.end) : null
    // The images go to their own rows and only their ids ride along on the
    // check-in — savePhotos hands the ids back straight away and uploads in the
    // background, so the sheet closes without waiting on the network.
    const entry = {
      id: 'ci-' + Date.now().toString(36), date: today, mood, energy: 3,
      emotions: emotions || [], note: (note || '').trim(), photos: savePhotos(photos),
      ts: startIso, ...(endIso ? { endTs: endIso } : {}),
    }
    persistCheckins([...(checkins || []), entry])
    // A day you're filling in after the fact shouldn't rewrite the streak —
    // backdating still earns a few petals for the tending, but only a check-in
    // made on the actual current day counts as today's check-in.
    if (persistGame && game) {
      if (today !== dayKey()) persistGame(awardPetals(game, 3))
      else if (todayMoments.length === 0) persistGame(applyCheckIn(game, { key: today, hasReflection: entry.note.length > 0 }).game)
      else if (todayMoments.length < 5) persistGame(awardPetals(game, 3))
    }
    setSheet(null); setMenu(false)
  }
  const addStatus = (effectId, note, photos, times) => {
    const ids = savePhotos(photos)
    if (times && (times.start || times.end)) {
      // A span you're placing yourself: recorded whole, so a condition that ran
      // from 2 to 5 last Tuesday is one closed episode rather than a toggle you
      // have to remember to flip off.
      persistEpisodes(addEpisode(episodes, effectId, {
        start: times.start ? atTimeOn(today, times.start) : new Date().toISOString(),
        end: times.end ? atTimeOn(today, times.end) : null,
        note: (note || '').trim(), photos: ids,
      }))
      setSheet(null); setMenu(false)
      return
    }
    let next = startEpisode(episodes, effectId)
    if (note && note.trim()) next = setEpisodeNote(next, effectId, note.trim())
    if (ids.length) next = setEpisodePhotos(next, effectId, ids)
    persistEpisodes(next)
    setSheet(null); setMenu(false)
  }
  // Take the written note back off something already logged. The entry itself
  // stays — only the words go, the same way a photo can be pulled off one.
  const deleteMoodNote = (checkinId) => {
    persistCheckins(patchCheckin(checkins, checkinId, { note: '' }))
    setMoodDetail(d => (d && d.id === checkinId ? { ...d, note: '' } : d))
  }
  const deleteFxNote = (epId) => {
    persistEpisodes(patchEpisode(episodes, epId, { note: '' }))
    setMoodDetail(d => (d && d.epId === epId ? { ...d, note: '' } : d))
  }
  // Correct either end of something already on the rail, from its detail card.
  // Both stamps arrive as ISO (or null for "still going") and are written
  // straight onto the check-in or the episode.
  const saveMoodTimes = (checkinId, startIso, endIso) => {
    persistCheckins(patchCheckin(checkins, checkinId, { ts: startIso, endTs: endIso || null }))
    setMoodDetail(d => (d && d.id === checkinId ? { ...d, ts: startIso, endTs: endIso || null } : d))
  }
  const saveFxTimes = (epId, startIso, endIso) => {
    persistEpisodes(patchEpisode(episodes, epId, { start: startIso, end: endIso || null }))
    setMoodDetail(d => (d && d.epId === epId ? { ...d, ts: startIso, end: endIso || null } : d))
  }
  // Take a photo back off something already logged: the id comes off the entry
  // and its row is cleared. Nothing else in either blob is touched.
  const removeMoodPhoto = (checkinId, photoId) => {
    const c = (checkins || []).find(x => x.id === checkinId)
    if (!c) return
    persistCheckins(patchCheckin(checkins, checkinId, { photos: photoIds(c).filter(p => p !== photoId) }))
    deletePhoto(photoId)
    setMoodDetail(d => (d && d.id === checkinId ? { ...d, photos: photoIds(d).filter(p => p !== photoId) } : d))
  }
  const removeFxPhoto = (epId, photoId) => {
    const ep = (episodes || []).find(x => x.id === epId)
    if (!ep) return
    persistEpisodes(patchEpisode(episodes, epId, { photos: photoIds(ep).filter(p => p !== photoId) }))
    deletePhoto(photoId)
    setMoodDetail(d => (d && d.epId === epId ? { ...d, photos: photoIds(d).filter(p => p !== photoId) } : d))
  }
  const endStatus = (effectId, ask = true) => {
    if (ask) {
      let confirmed = false
      try { confirmed = localStorage.getItem('bloom_fx_end_confirmed') === '1' } catch {}
      if (!confirmed) {
        const fx = byId.get(effectId)
        if (!window.confirm(`End “${fx ? fx.name : 'this status'}”? It stops recording from now.`)) return
        try { localStorage.setItem('bloom_fx_end_confirmed', '1') } catch {}
      }
    }
    persistEpisodes(endEpisode(episodes, effectId))
  }

  // Add a user-defined emotion to the palette (available to tag going forward),
  // with an optional chosen colour for its cloud lining.
  const addEmotion = (name, color) => {
    const nm = (name || '').trim()
    if (!nm) return
    const prefs = emotionPrefs || { custom: [], hidden: [] }
    // Reuse an existing option if the name already exists (case-insensitive).
    if (emotionOptions.some(e => e.name.toLowerCase() === nm.toLowerCase())) return
    const next = { custom: [...(prefs.custom || []), makeEmotion(nm, color)], hidden: prefs.hidden || [] }
    persistEmotionPrefs?.(next)
  }
  // "Delete" an emotion = hide it from the picker. Its metadata is kept so any
  // cloud already tagged with it still renders its lining and reads back by name.
  const deleteEmotion = (id) => {
    const prefs = emotionPrefs || { custom: [], hidden: [] }
    const next = { custom: prefs.custom || [], hidden: [...new Set([...(prefs.hidden || []), id])] }
    persistEmotionPrefs?.(next)
  }

  // Add a custom status condition (physical/mental) to the palette.
  const addEffect = (draft) => {
    if (!draft || !(draft.name || '').trim()) return
    const base = (effects && effects.length) ? effects : DEFAULT_EFFECTS
    persistEffects?.([...base, makeEffect(draft)])
  }
  // "Delete" a condition = hide it from the palette, keeping its definition so
  // any episode already recorded against it still resolves on the rail.
  const deleteEffect = (id) => {
    const base = (effects && effects.length) ? effects : DEFAULT_EFFECTS
    persistEffects?.(base.map(f => f.id === id ? { ...f, hidden: true } : f))
  }

  const activeEffects = effectList.filter(f => isActive(episodes, f.id))
    .map(f => ({ id: f.id, name: f.name, good: POSITIVE_EFFECTS.has(f.id) }))

  return (
    <>
      <div className="day-rail" ref={railRef}>
      {/* Status-effect trails (behind everything; run down to the blob). */}
      {todayEpisodes.map(e => {
        // Placed through the timeline map, so a running trail's foot meets the
        // blob exactly instead of drifting off on the clock scale.
        const top = railFrac(Date.parse(e.start))
        const bottom = e.end ? railFrac(Date.parse(e.end)) : (isToday ? blobFrac : 1)
        const h = Math.max(0, bottom - top)
        const endable = isToday && !e.end
        return (
          <button key={'t' + e.id} className="rail-trail" title={`${e.fx.name}${e.note ? ' · ' + e.note : ''}${endable ? ' · tap to end' : ''}`}
            onClick={() => endable ? endStatus(e.effectId) : null}
            style={{ top: `${top * 100}%`, height: `${h * 100}%`, background: `linear-gradient(${e.fx.color}, color-mix(in srgb, ${e.fx.color} 55%, transparent))`, cursor: endable ? 'pointer' : 'default' }} />
        )
      })}

      {/* A feeling given an end time covers a stretch of the day too — drawn as
          a slimmer trail in its mood's pigment, tucked behind the condition
          trails so the two never fight for the same pixels. */}
      {todayMoments.filter(c => c.endTs).map(c => {
        const top = railFrac(Date.parse(c.ts))
        const bottom = railFrac(Date.parse(c.endTs))
        const h = Math.max(0, bottom - top)
        const col = moodMeta(c.mood).color
        return (
          <div key={'mt' + c.id} className="rail-trail rail-mood-trail" aria-hidden="true"
            title={`${moodMeta(c.mood).label} · ${clockTime(c.ts)} – ${clockTime(c.endTs)}`}
            style={{ top: `${top * 100}%`, height: `${h * 100}%`, background: `linear-gradient(${col}, color-mix(in srgb, ${col} 45%, transparent))` }} />
        )
      })}

      {/* Markers — mood clouds + status icons, fanned when they crowd. */}
      {markers.map(m => {
        const dx = m.cluster * 13, scale = m.cluster ? 0.72 : 1
        // Position through the timeline map (clustering only needs to know
        // which marks share a moment, so it stays on the clock scale).
        const top = railFrac(markerAt(m))
        // Fan whatever the blob is holding over its crown: a lone marker sits
        // straight up and each extra one steps out to alternating sides, so
        // they stay gathered on top instead of sliding down the flanks. The
        // step tightens once there are enough to reach the flanks anyway.
        const hi = heldMarks.indexOf(m.key)
        const held = hi >= 0
        const n = heldMarks.length
        const step = n > 1 ? Math.min(40, 150 / (n - 1)) : 0
        const ang = -90 + (hi - (n - 1) / 2) * step
        const heldStyle = { top: `${blobFrac * 100}%`, '--held-a': `${Math.round(ang)}deg`, animationDelay: `${(hi * -0.6).toFixed(2)}s` }
        const restStyle = { top: `${top * 100}%`, transform: `translate(${dx}px,-50%) scale(${scale})` }
        if (m.type === 'mood') {
          const c = m.data
          return (
            <button key={m.key} className={`rail-mark rail-mood ${held ? 'held' : ''}`}
              style={held ? heldStyle : restStyle}
              title={`${moodMeta(c.mood).label} · ${clockTime(c.ts)}${c.endTs ? ' – ' + clockTime(c.endTs) : ''}`} onClick={() => setMoodDetail(c)}>
              <MoodCloud v={c.mood} size={30} emotions={c.emotions} />
              {photoIds(c).length > 0 && <span className="rail-mark-pic"><Glyph id="camera" size={8} color="#fff" /></span>}
            </button>
          )
        }
        const e = m.data
        return (
          <button key={m.key} className={`rail-mark rail-fx ${e.end ? '' : 'live'} ${held ? 'held' : ''}`}
            style={{ ...(held ? heldStyle : restStyle), background: e.fx.color, color: iconColorOn(e.fx.color) }}
            title={`${e.fx.name}${e.note ? ' · ' + e.note : ''} · ${clockTime(e.start)}${e.end ? ' – ' + clockTime(e.end) : ' · still going'}`}
            onClick={() => setMoodDetail({ fx: e.fx, note: e.note, ts: e.start, end: e.end, effectId: e.effectId, epId: e.id, photos: photoIds(e), isFx: true })}>
            <EffectIcon icon={e.fx.icon} size={15} />
            {photoIds(e).length > 0 && <span className="rail-mark-pic"><Glyph id="camera" size={8} color="#fff" /></span>}
          </button>
        )
      })}

      {/* The mind blob — only on today. It centres on the timeline's live "now"
          nodule when one is on screen, else on the fractional day scale. */}
      {isToday && (
        <div className="rail-blob" style={{ top: `${blobFrac * 100}%`, transform: 'translateY(-50%)' }}>
          <button ref={blobRef} className="rail-blob-btn" onClick={() => (menu ? closeAll() : openMenu())} aria-label="Wellness">
            <GuideBlob size={54} tint="#8FB0D8" speaking={menu} />
          </button>
        </div>
      )}

      {/* A past day has no "now" for the blob to ride, so it gets a little clock
          winding backwards at the top of the timeline instead — the way back in
          to a day you didn't get round to writing down. */}
      {!isToday && (
        <div className="rail-rewind">
          <button ref={clockRef} className={`rail-clock ${menu ? 'on' : ''}`} onClick={() => (menu ? closeAll() : openMenu())}
            onMouseEnter={() => setAsking(true)} onFocus={() => setAsking(true)}
            aria-label={`Log a feeling or condition for ${dayLabel(dateKey)}`}>
            <RewindClock size={34} />
          </button>
          {asking && !menu && <span className="rail-clock-ask">Log a feeling or condition for {dayLabel(dateKey)}?</span>}
        </div>
      )}
      </div>

      {/* One fixed overlay holds the accent film AND everything that must sit on
          top of it — so stacking never depends on the rail's ancestor context. */}
      {(menu || sheet || moodDetail) && (
        <div className="rail-overlay">
          <div className="rail-film" onClick={closeAll} />
          {menu && !sheet && !moodDetail && anchor && (
            <div className={`rail-anchor ${isToday ? '' : 'past'}`} style={{ left: anchor.left, top: anchor.top }}>
              <div className="rail-anchor-blob">
                {isToday ? <GuideBlob size={54} tint="#8FB0D8" speaking /> : <span className="rail-clock lg on"><RewindClock size={38} /></span>}
              </div>
              <button className="rail-bub rail-bub-cloud" onClick={() => setSheet('mood')} aria-label="Log how you feel">
                <MoodCloud v={lastMood} size={40} />
              </button>
              <button className="rail-bub rail-bub-lotus" onClick={() => setSheet('status')} aria-label="Log a status effect">
                <Glyph id="flower" size={26} />
              </button>
              {/* The third bubble, today only: the clock that decides whether
                  what you log carries a time of its own or simply happens now. */}
              {isToday && (
                <button className={`rail-bub rail-bub-clock ${timed ? 'on' : ''}`} onClick={toggleTimed}
                  aria-pressed={timed} aria-label={timed ? 'Timed mode on — turn off' : 'Timed mode off — turn on'}>
                  <RewindClock size={30} />
                </button>
              )}
              <div className="rail-say">
                {isToday
                  ? (timed
                      ? 'Clock’s on — you can say when a feeling started, and when it lifted. Tap it again to just log this moment.'
                      : affirm(activeEffects))
                  : `Looking back at ${dayLabel(dateKey)}. Anything you log here can carry the time it actually happened.`}
              </div>
            </div>
          )}
          {sheet === 'mood' && <MomentSheet onClose={closeAll} onLog={logMood}
            timed={timed} isToday={isToday} dayName={dayLabel(dateKey)}
            emotions={emotionOptions} onAddEmotion={addEmotion} onDeleteEmotion={deleteEmotion} />}
          {sheet === 'status' && (
            <StatusSheet effects={effectList} episodes={episodes} byId={byId}
              timed={timed} isToday={isToday} dayName={dayLabel(dateKey)}
              onAdd={addStatus} onEnd={(id) => endStatus(id, false)} onClose={closeAll}
              onAddEffect={addEffect} onDeleteEffect={deleteEffect} />
          )}
          {moodDetail && <DetailPopover item={moodDetail} dateKey={dateKey} isToday={isToday} onClose={closeAll}
            onSaveTimes={(startIso, endIso) => (moodDetail.isFx ? saveFxTimes(moodDetail.epId, startIso, endIso) : saveMoodTimes(moodDetail.id, startIso, endIso))}
            onEndNow={moodDetail.isFx && !moodDetail.end && isToday ? () => { endStatus(moodDetail.effectId, false); closeAll() } : null}
            onDeleteNote={() => (moodDetail.isFx ? deleteFxNote(moodDetail.epId) : deleteMoodNote(moodDetail.id))}
            onRemovePhoto={(pid) => (moodDetail.isFx ? removeFxPhoto(moodDetail.epId, pid) : removeMoodPhoto(moodDetail.id, pid))} />}
        </div>
      )}
    </>
  )
}

// ── When-row — timed mode's "when did this happen?" controls ────
// Shared by both sheets. A start time, and an end you opt into: with no end an
// entry is a single moment (or, for a condition, one that's still running);
// with one it becomes a span the rail draws as a trail. Both fields speak the
// viewed day's clock, so a time typed here lands on the day you're looking at.
const nowHHMM = () => {
  const d = new Date()
  return `${String(d.getHours()).padStart(2, '0')}:${String(Math.floor(d.getMinutes() / 5) * 5).padStart(2, '0')}`
}
const hhmmMins = (t) => { const [h, m] = String(t || '').split(':').map(Number); return (h || 0) * 60 + (m || 0) }

function WhenRow({ start, end, onStart, onEnd, isToday, dayName, openEndHint, endPlaceholder = 'no end' }) {
  const [spanning, setSpanning] = useState(!!end)
  const bad = !!(start && end && hhmmMins(end) <= hhmmMins(start))
  const mins = start && end && !bad ? hhmmMins(end) - hhmmMins(start) : null
  const dropEnd = () => { setSpanning(false); onEnd('') }
  return (
    <div className="rail-when" onClick={e => e.stopPropagation()}>
      <div className="rail-when-head">
        <RewindClock size={17} />
        <span>{isToday ? 'When did this happen?' : `When ${onDay(dayName)}?`}</span>
        {mins != null && <b className="rail-when-dur">{fmtDuration(mins)}</b>}
      </div>
      <div className="rail-when-row">
        <label className="rail-when-field">
          <span>Started</span>
          <TimeField value={start} onChange={onStart} style={railTimeStyle} />
        </label>
        {spanning ? (
          <label className="rail-when-field">
            <span>Ended <button type="button" className="rail-when-clear" onClick={dropEnd}>clear</button></span>
            <TimeField value={end} onChange={onEnd} style={railTimeStyle} placeholder={endPlaceholder} />
          </label>
        ) : (
          <button type="button" className="rail-when-add" onClick={() => setSpanning(true)}>＋ add an end time</button>
        )}
      </div>
      {bad
        ? <div className="rail-when-warn">The end needs to come after the start.</div>
        : (spanning ? null : <div className="rail-when-hint">{openEndHint}</div>)}
    </div>
  )
}
const railTimeStyle = { border: '1.5px solid var(--border)', borderRadius: 11, padding: '8px 10px', fontSize: 13, fontFamily: 'inherit', background: '#fff', color: 'var(--text)', boxSizing: 'border-box' }
// Both sheets refuse to log a span that runs backwards.
const whenOk = (timed, start, end) => !timed || !end || hhmmMins(end) > hhmmMins(start)

// ── Moment sheet — pick a mood, optionally say why ──────────────
function MomentSheet({ onClose, onLog, timed, isToday, dayName, emotions: options = [], onAddEmotion, onDeleteEmotion }) {
  const [start, setStart] = useState(nowHHMM)
  const [end, setEnd] = useState('')
  const [mood, setMood] = useState(null)
  const [emotions, setEmotions] = useState([])
  const [note, setNote] = useState('')
  const [photos, setPhotos] = useState([])   // data URLs, only written on log
  const [noting, setNoting] = useState(false)
  const toggleEmo = (id) => setEmotions(p => p.includes(id) ? p.filter(x => x !== id) : (p.length < 4 ? [...p, id] : p))

  // Long-press arms an emotion chip for deletion (shows a faint ✕); the "＋"
  // chip reveals a small inline input for adding a unique emotion.
  const [armed, setArmed] = useState(null)   // emotion id showing its delete ✕
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState('')
  const [draftColor, setDraftColor] = useState(EMOTION_PALETTE[0])
  const holdRef = useRef(null)
  const longFired = useRef(false)
  const startHold = (id) => {
    longFired.current = false
    clearTimeout(holdRef.current)
    holdRef.current = setTimeout(() => { longFired.current = true; setArmed(id) }, 450)
  }
  const endHold = () => clearTimeout(holdRef.current)
  const chipClick = (id) => {
    if (longFired.current) { longFired.current = false; return }  // the press was a long-press
    if (armed) { setArmed(null); return }                        // a tap elsewhere disarms
    toggleEmo(id)
  }
  const openAdd = () => { setArmed(null); setDraftColor(EMOTION_PALETTE[Math.floor(Math.random() * EMOTION_PALETTE.length)]); setAdding(true) }
  const commitAdd = () => {
    const nm = draft.trim()
    if (nm) onAddEmotion?.(nm, draftColor)
    setDraft(''); setAdding(false)
  }

  return (
    <div className="rail-sheet" onClick={(e) => { setArmed(null); e.stopPropagation() }}>
      <div className="rail-sheet-title">{isToday ? 'How are you, right now?' : `How were you ${onDay(dayName)}?`}</div>
      <div className="rail-moods">
        {MOODS.map(m => (
          <button key={m.v} className={`rail-moodpick ${mood === m.v ? 'on' : ''}`} onClick={() => setMood(m.v)} title={m.label}>
            <MoodCloud v={m.v} size={mood === m.v ? 56 : 46} animate={mood === m.v} />
            <span>{m.label}</span>
          </button>
        ))}
      </div>
      {mood != null && (
        <>
          {timed && (
            <WhenRow start={start} end={end} onStart={setStart} onEnd={setEnd}
              isToday={isToday} dayName={dayName} endPlaceholder="no end"
              openEndHint="No end time — this gets logged as a single moment." />
          )}
          {!noting
            ? <button className="rail-addnote" onClick={() => setNoting(true)}>＋ Say why, or add a photo (optional)</button>
            : <>
                <div className="rail-emos" onClick={e => e.stopPropagation()}>
                  {options.map(e => (
                    <span key={e.id} className="rail-emo-wrap">
                      <button
                        className={`rail-emo ${emotions.includes(e.id) ? 'on' : ''} ${armed === e.id ? 'armed' : ''}`}
                        style={emotions.includes(e.id) ? { borderColor: e.color, background: `color-mix(in srgb, ${e.color} 16%, #fff)` } : undefined}
                        onClick={() => chipClick(e.id)}
                        onPointerDown={() => startHold(e.id)}
                        onPointerUp={endHold} onPointerLeave={endHold}
                        onContextMenu={ev => ev.preventDefault()}>
                        <span className="rail-emo-dot" style={{ background: e.color }} />{e.name}
                      </button>
                      {armed === e.id && (
                        <button className="rail-emo-del" title="Remove this emotion"
                          onClick={ev => { ev.stopPropagation(); onDeleteEmotion?.(e.id); setArmed(null) }}>✕</button>
                      )}
                    </span>
                  ))}
                  {!adding && <button className="rail-emo-add" title="Add a unique emotion" onClick={openAdd}>＋</button>}
                </div>
                {adding && (
                  <div className="rail-emo-adder" onClick={e => e.stopPropagation()}>
                    <div className="rail-emo-adder-row">
                      <span className="rail-emo-dot lg" style={{ background: draftColor }} />
                      <input className="rail-emo-input" autoFocus value={draft} maxLength={24}
                        placeholder="name a feeling…" onChange={ev => setDraft(ev.target.value)}
                        onKeyDown={ev => { if (ev.key === 'Enter') commitAdd(); if (ev.key === 'Escape') { setDraft(''); setAdding(false) } }} />
                      <button className="rail-emo-ok" disabled={!draft.trim()} onClick={commitAdd}>Add</button>
                    </div>
                    <ColorPickRow colors={EMOTION_PALETTE} value={draftColor} onChange={setDraftColor} />
                  </div>
                )}
                <textarea className="rail-note" placeholder="What's behind this feeling? (only if you want to)" value={note} onChange={e => setNote(e.target.value)} rows={2} />
                <PhotoPicker photos={photos} onChange={setPhotos} label="Add a photo" />
              </>}
          <button className="rail-log" disabled={!whenOk(timed, start, end)}
            onClick={() => onLog(mood, emotions, note, photos, timed ? { start, end } : null)}>
            {timed && end ? 'Log this stretch' : 'Log this moment'}
          </button>
        </>
      )}
    </div>
  )
}

// ── Status sheet — pick / describe / end a condition ────────────
function StatusSheet({ effects, episodes, byId, timed, isToday, dayName, onAdd, onEnd, onClose, onAddEffect, onDeleteEffect }) {
  const [pick, setPick] = useState(null)
  const [note, setNote] = useState('')
  const [photos, setPhotos] = useState([])   // data URLs, only written on start
  const [start, setStart] = useState(nowHHMM)
  const [end, setEnd] = useState('')
  const active = effects.filter(f => isActive(episodes, f.id))
  const clash = !!pick && !end && isActive(episodes, pick)
  const options = effects.filter(f => !f.hidden)   // deleted conditions drop out of the picker

  // Long-press a condition tile to arm its delete ✕; the "＋" tile opens a
  // compact new-condition form (name · kind · colour · icon).
  const [armed, setArmed] = useState(null)
  const holdRef = useRef(null)
  const longFired = useRef(false)
  const startHold = (id) => { longFired.current = false; clearTimeout(holdRef.current); holdRef.current = setTimeout(() => { longFired.current = true; setArmed(id) }, 450) }
  const endHold = () => clearTimeout(holdRef.current)

  const [draft, setDraft] = useState(null)   // { name, kind, color, icon } while adding
  const [pickIcon, setPickIcon] = useState(false)   // icon-search sheet open
  const openAdd = () => { setArmed(null); setPick(null); setDraft({ name: '', kind: 'physical', color: EFFECT_COLORS[3], icon: 'sparkle' }) }
  const commitAdd = () => { if (draft && draft.name.trim()) onAddEffect?.(draft); setDraft(null) }

  return (
    <div className="rail-sheet" onClick={(e) => { setArmed(null); e.stopPropagation() }}>
      <div className="rail-sheet-title">{isToday ? 'What are you feeling in your body or mind?' : `What was your body or mind carrying ${onDay(dayName)}?`}</div>
      {isToday && active.length > 0 && (
        <div className="rail-active">
          {active.map(f => {
            const ep = activeEpisode(episodes, f.id)
            return (
              <button key={f.id} className="rail-active-chip" style={{ background: f.color, color: iconColorOn(f.color) }} onClick={() => onEnd(f.id)}>
                <EffectIcon icon={f.icon} size={14} /> {f.name} · {fmtDuration(episodeMinutes(ep))} <span className="rail-x">✕ end</span>
              </button>
            )
          })}
        </div>
      )}
      <div className="rail-fxgrid">
        {options.map(f => {
          const on = isActive(episodes, f.id)
          // Untimed, picking a running condition is meaningless — it's already
          // on. Timed, you may well be recording a *different*, finished stretch
          // of it, so the tile stays live and the log button does the checking.
          const lock = on && !timed
          return (
            <span key={f.id} className="rail-fxpick-wrap">
              <button className={`rail-fxpick ${pick === f.id ? 'sel' : ''} ${on ? 'on' : ''} ${armed === f.id ? 'armed' : ''}`} disabled={lock}
                onClick={() => { if (longFired.current) { longFired.current = false; return } if (armed) { setArmed(null); return } setPick(f.id) }}
                onPointerDown={() => !lock && startHold(f.id)} onPointerUp={endHold} onPointerLeave={endHold}
                onContextMenu={ev => ev.preventDefault()}
                style={pick === f.id ? { borderColor: f.color, background: `color-mix(in srgb, ${f.color} 16%, #fff)` } : undefined}>
                <span className="rail-fxpick-ico" style={{ background: f.color, color: iconColorOn(f.color) }}><EffectIcon icon={f.icon} size={15} /></span>
                <span>{f.name}</span>
              </button>
              {armed === f.id && (
                <button className="rail-emo-del" title="Remove this condition"
                  onClick={ev => { ev.stopPropagation(); onDeleteEffect?.(f.id); setArmed(null) }}>✕</button>
              )}
            </span>
          )
        })}
        {!draft && (
          <button className="rail-fxpick rail-fxpick-add" onClick={openAdd} title="Add a condition">
            <span className="rail-fxpick-plus">＋</span>
          </button>
        )}
      </div>

      {draft && (
        <div className="rail-fx-adder" onClick={e => e.stopPropagation()}>
          <div className="rail-emo-adder-row">
            <button className="rail-fxpick-ico sm" title="Choose an icon" onClick={() => setPickIcon(true)}
              style={{ background: draft.color, color: iconColorOn(draft.color), border: 'none', cursor: 'pointer', flexShrink: 0 }}>
              <EffectIcon icon={draft.icon} size={15} />
            </button>
            <input className="rail-emo-input" autoFocus value={draft.name} maxLength={24}
              placeholder="name a condition…" onChange={ev => setDraft({ ...draft, name: ev.target.value })}
              onKeyDown={ev => { if (ev.key === 'Enter') commitAdd(); if (ev.key === 'Escape') setDraft(null) }} />
            <button className="rail-emo-ok" disabled={!draft.name.trim()} onClick={commitAdd}>Add</button>
          </div>
          <div className="rail-fx-seg">
            {['physical', 'mental'].map(k => (
              <button key={k} className={`rail-fx-seg-btn ${draft.kind === k ? 'on' : ''}`} onClick={() => setDraft({ ...draft, kind: k })}>{k === 'physical' ? 'Physical' : 'Mental'}</button>
            ))}
          </div>
          <ColorPickRow colors={EFFECT_COLORS} value={draft.color} onChange={(c) => setDraft({ ...draft, color: c })} />
          <button className="rail-fx-iconbtn" onClick={() => setPickIcon(true)}>
            <span className="rail-fxpick-ico sm" style={{ background: draft.color, color: iconColorOn(draft.color) }}><EffectIcon icon={draft.icon} size={15} /></span>
            Choose an icon…
          </button>
        </div>
      )}
      {pickIcon && draft && (
        <IconSearchSheet icon={draft.icon} tint={draft.color}
          onPick={(v) => setDraft(d => ({ ...d, icon: v }))} onClose={() => setPickIcon(false)} />
      )}

      {pick && (
        <>
          {timed && (
            <WhenRow start={start} end={end} onStart={setStart} onEnd={setEnd}
              isToday={isToday} dayName={dayName} endPlaceholder="still going"
              openEndHint="No end time — this keeps running until you end it." />
          )}
          <textarea className="rail-note" placeholder={`Describe the ${(byId.get(pick)?.name || '').toLowerCase()} — as much or as little as you like`} value={note} onChange={e => setNote(e.target.value)} rows={2} />
          <PhotoPicker photos={photos} onChange={setPhotos} label="Add a photo" />
          {clash && <div className="rail-when-warn">{byId.get(pick)?.name} is already running. Give this stretch an end time, or end the running one first.</div>}
          <button className="rail-log" disabled={!whenOk(timed, start, end) || clash}
            onClick={() => onAdd(pick, note, photos, timed ? { start, end } : null)}>
            {timed && end ? 'Log this time frame' : 'Start tracking this'}
          </button>
        </>
      )}
    </div>
  )
}

// ── Detail popover — tap a marker to read it back, and fix its clock ──
// Every marker on the rail — a mood cloud or a condition — opens this. It reads
// back what was logged and, crucially, the span it covers: when it started and
// when it lifted. Either end can be corrected here, which is the only way to
// repair a moment logged at the wrong time (or to close a condition you forgot
// to end days ago).
function DetailPopover({ item, dateKey, isToday, onClose, onRemovePhoto, onSaveTimes, onEndNow, onDeleteNote }) {
  const pics = photoIds(item)
  const isFx = !!item.isFx
  const startIso = item.ts
  const endIso = isFx ? item.end : item.endTs
  const [editing, setEditing] = useState(false)
  const [sVal, setSVal] = useState('')
  const [eVal, setEVal] = useState('')
  // Deleting the note takes two taps — the words are often the hardest part of
  // a check-in to write, so they never go on a single mis-tap.
  const [armed, setArmed] = useState(false)
  const openEdit = () => { setSVal(timeOf(startIso)); setEVal(timeOf(endIso)); setEditing(true) }

  const nextStart = sVal ? atTimeOn(dateKey, sVal) : startIso
  const nextEnd = eVal ? atTimeOn(dateKey, eVal) : null
  const ok = !!sVal && spanOk(nextStart, nextEnd)
  const save = () => { if (ok) { onSaveTimes?.(nextStart, nextEnd); setEditing(false) } }

  // The span as prose: a closed one carries its length, an open one says so.
  const spanText = endIso
    ? `${clockTime(startIso)} – ${clockTime(endIso)} · ${fmtDuration(spanMinutes(startIso, endIso))}`
    : (isFx ? `${clockTime(startIso)} – still going · ${fmtDuration(spanMinutes(startIso, null))}` : clockTime(startIso))

  // A written note, with the option to take it back off. Nothing is offered when
  // there was never a note to begin with.
  const noteBlock = (emptyText) => (item.note
    ? (
      <div className="rail-note-block">
        <p className="rail-detail-note">{item.note}</p>
        <button className={`rail-note-del ${armed ? 'armed' : ''}`}
          onClick={() => { if (armed) { onDeleteNote?.(); setArmed(false) } else setArmed(true) }}
          onBlur={() => setArmed(false)}>
          {armed ? 'Tap again to delete' : 'Delete note'}
        </button>
      </div>
    )
    : <p className="rail-detail-note muted">{emptyText}</p>)

  const times = (
    <div className="rail-span">
      {!editing ? (
        <button className="rail-span-read" onClick={openEdit} title="Edit the start and end time">
          <RewindClock size={15} />
          <span>{spanText}</span>
          <span className="rail-span-edit">Edit</span>
        </button>
      ) : (
        <div className="rail-span-edit-box" onClick={e => e.stopPropagation()}>
          <label className="rail-when-field">
            <span>Started</span>
            <TimeField value={sVal} onChange={setSVal} style={railTimeStyle} />
          </label>
          <label className="rail-when-field">
            <span>Ended {eVal && <button type="button" className="rail-when-clear" onClick={() => setEVal('')}>clear</button>}</span>
            <TimeField value={eVal} onChange={setEVal} style={railTimeStyle}
              placeholder={isFx ? 'still going' : 'no end'} />
          </label>
          {!ok && <div className="rail-when-warn">{sVal ? 'The end needs to come after the start.' : 'A start time is needed.'}</div>}
          <div className="rail-span-btns">
            <button className="rail-span-cancel" onClick={() => setEditing(false)}>Cancel</button>
            <button className="rail-span-save" disabled={!ok} onClick={save}>Save times</button>
          </div>
        </div>
      )}
    </div>
  )

  if (isFx) {
    return (
      <div className="rail-detail" onClick={(e) => e.stopPropagation()}>
        <div className="rail-detail-head"><span className="rail-detail-ico" style={{ background: item.fx.color, color: iconColorOn(item.fx.color) }}><EffectIcon icon={item.fx.icon} size={16} /></span><b>{item.fx.name}</b></div>
        {times}
        {noteBlock('No description.')}
        <PhotoStrip ids={pics} onRemove={onRemovePhoto} className="rail-detail-photos" />
        {onEndNow && <button className="rail-endnow" onClick={onEndNow}>End this now</button>}
        <button className="rail-log" onClick={onClose}>Close</button>
      </div>
    )
  }
  const c = item
  const emos = (c.emotions || []).map(id => emotionMeta(id)?.name).filter(Boolean)
  return (
    <div className="rail-detail" onClick={(e) => e.stopPropagation()}>
      <div className="rail-detail-head"><MoodCloud v={c.mood} size={40} emotions={c.emotions} /><b>{moodMeta(c.mood).label}</b></div>
      {times}
      {emos.length > 0 && <div className="rail-detail-emos">{emos.join(' · ')}</div>}
      {noteBlock('No note — just the feeling.')}
      <PhotoStrip ids={pics} onRemove={onRemovePhoto} className="rail-detail-photos" />
      <button className="rail-log" onClick={onClose}>Close</button>
    </div>
  )
}
