// src/components/DayRail.jsx
// ─────────────────────────────────────────────────────────────
// The unintrusive wellness rail down the left of the Today tab. A luminescent
// "mind" blob rides the left edge at the current time and drifts down as the day
// goes on. Tapping it dims the rest of the screen (a film tinted to your accent)
// and fans two bubbles out to its right: an emotion cloud (log a mood moment,
// with an optional note about *why*) and a lotus (log a physical/mental status
// effect, with an optional description).
//
// Everything you log lands on the rail at the time you logged it: mood clouds
// float beside their moment; status effects drop an icon whose colour trails
// downward to show how long it has lasted, running to the blob (and vanishing
// behind it) while still active. Tapping a trail ends that effect (asking, the
// first time). Markers that crowd the same time shrink and fan diagonally.
// ─────────────────────────────────────────────────────────────
import { useState, useMemo, useEffect, useRef } from 'react'
import { Glyph, iconColorOn } from '../lib/glyphs.jsx'
import { GuideBlob, MoodCloud } from '../lib/critters.jsx'
import ColorPickRow from './ColorPickRow.jsx'
import { EffectIcon } from './IconPicker.jsx'
import IconSearchSheet from './IconSearchSheet.jsx'
import {
  dayKey, keyToDate, MOODS, moodMeta, selectableEmotions, makeEmotion, emotionMeta, EMOTION_PALETTE, checkinsForDay,
  DEFAULT_EFFECTS, POSITIVE_EFFECTS, makeEffect, EFFECT_COLORS, isActive, activeEpisode, startEpisode, endEpisode, setEpisodeNote,
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
  const nowFrac = fracInDay(nowMs, dayStartMs)
  const blobRef = useRef(null)
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
  const openMenu = () => {
    const r = blobRef.current?.getBoundingClientRect()
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
  const logMood = (mood, emotions, note) => {
    const entry = { id: 'ci-' + Date.now().toString(36), date: today, mood, energy: 3, emotions: emotions || [], note: (note || '').trim(), ts: new Date().toISOString() }
    persistCheckins([...(checkins || []), entry])
    if (persistGame && game) {
      if (todayMoments.length === 0) persistGame(applyCheckIn(game, { key: today, hasReflection: entry.note.length > 0 }).game)
      else if (todayMoments.length < 5) persistGame(awardPetals(game, 3))
    }
    setSheet(null); setMenu(false)
  }
  const addStatus = (effectId, note) => {
    let next = startEpisode(episodes, effectId)
    if (note && note.trim()) next = setEpisodeNote(next, effectId, note.trim())
    persistEpisodes(next)
    setSheet(null); setMenu(false)
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
              title={`${moodMeta(c.mood).label} · ${clockTime(c.ts)}`} onClick={() => setMoodDetail(c)}>
              <MoodCloud v={c.mood} size={30} emotions={c.emotions} />
            </button>
          )
        }
        const e = m.data
        const endable = isToday && !e.end
        return (
          <button key={m.key} className={`rail-mark rail-fx ${e.end ? '' : 'live'} ${held ? 'held' : ''}`}
            style={{ ...(held ? heldStyle : restStyle), background: e.fx.color, color: iconColorOn(e.fx.color) }}
            title={`${e.fx.name}${e.note ? ' · ' + e.note : ''} · ${clockTime(e.start)}${endable ? ' · tap to end' : ''}`}
            onClick={() => endable ? endStatus(e.effectId) : setMoodDetail({ fx: e.fx, note: e.note, ts: e.start, isFx: true })}>
            <EffectIcon icon={e.fx.icon} size={15} />
          </button>
        )
      })}

      {/* The mind blob — only on today. It centres on the timeline's live "now"
          nodule when one is on screen, else on the fractional day scale. A past
          day is a read-only record, so it shows its markers without the blob. */}
      {isToday && (
        <div className="rail-blob" style={{ top: `${blobFrac * 100}%`, transform: 'translateY(-50%)' }}>
          <button ref={blobRef} className="rail-blob-btn" onClick={() => (menu ? closeAll() : openMenu())} aria-label="Wellness">
            <GuideBlob size={54} tint="#8FB0D8" speaking={menu} />
          </button>
        </div>
      )}
      </div>

      {/* One fixed overlay holds the accent film AND everything that must sit on
          top of it — so stacking never depends on the rail's ancestor context. */}
      {(menu || sheet || moodDetail) && (
        <div className="rail-overlay">
          <div className="rail-film" onClick={closeAll} />
          {menu && !sheet && !moodDetail && anchor && (
            <div className="rail-anchor" style={{ left: anchor.left, top: anchor.top }}>
              <div className="rail-anchor-blob"><GuideBlob size={54} tint="#8FB0D8" speaking /></div>
              <button className="rail-bub rail-bub-cloud" onClick={() => setSheet('mood')} aria-label="Log how you feel">
                <MoodCloud v={lastMood} size={40} />
              </button>
              <button className="rail-bub rail-bub-lotus" onClick={() => setSheet('status')} aria-label="Log a status effect">
                <Glyph id="flower" size={26} />
              </button>
              <div className="rail-say">{affirm(activeEffects)}</div>
            </div>
          )}
          {sheet === 'mood' && <MomentSheet onClose={closeAll} onLog={logMood}
            emotions={emotionOptions} onAddEmotion={addEmotion} onDeleteEmotion={deleteEmotion} />}
          {sheet === 'status' && (
            <StatusSheet effects={effectList} episodes={episodes} byId={byId}
              onAdd={addStatus} onEnd={(id) => endStatus(id, false)} onClose={closeAll}
              onAddEffect={addEffect} onDeleteEffect={deleteEffect} />
          )}
          {moodDetail && <DetailPopover item={moodDetail} onClose={closeAll} />}
        </div>
      )}
    </>
  )
}

// ── Moment sheet — pick a mood, optionally say why ──────────────
function MomentSheet({ onClose, onLog, emotions: options = [], onAddEmotion, onDeleteEmotion }) {
  const [mood, setMood] = useState(null)
  const [emotions, setEmotions] = useState([])
  const [note, setNote] = useState('')
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
      <div className="rail-sheet-title">How are you, right now?</div>
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
          {!noting
            ? <button className="rail-addnote" onClick={() => setNoting(true)}>＋ Say why (optional)</button>
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
              </>}
          <button className="rail-log" onClick={() => onLog(mood, emotions, note)}>Log this moment</button>
        </>
      )}
    </div>
  )
}

// ── Status sheet — pick / describe / end a condition ────────────
function StatusSheet({ effects, episodes, byId, onAdd, onEnd, onClose, onAddEffect, onDeleteEffect }) {
  const [pick, setPick] = useState(null)
  const [note, setNote] = useState('')
  const active = effects.filter(f => isActive(episodes, f.id))
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
      <div className="rail-sheet-title">What are you feeling in your body or mind?</div>
      {active.length > 0 && (
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
          return (
            <span key={f.id} className="rail-fxpick-wrap">
              <button className={`rail-fxpick ${pick === f.id ? 'sel' : ''} ${on ? 'on' : ''} ${armed === f.id ? 'armed' : ''}`} disabled={on}
                onClick={() => { if (longFired.current) { longFired.current = false; return } if (armed) { setArmed(null); return } setPick(f.id) }}
                onPointerDown={() => !on && startHold(f.id)} onPointerUp={endHold} onPointerLeave={endHold}
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
          <textarea className="rail-note" placeholder={`Describe the ${(byId.get(pick)?.name || '').toLowerCase()} — as much or as little as you like`} value={note} onChange={e => setNote(e.target.value)} rows={2} />
          <button className="rail-log" onClick={() => onAdd(pick, note)}>Start tracking this</button>
        </>
      )}
    </div>
  )
}

// ── Detail popover — tap a marker to read it back ───────────────
function DetailPopover({ item, onClose }) {
  if (item.isFx) {
    return (
      <div className="rail-detail" onClick={(e) => e.stopPropagation()}>
        <div className="rail-detail-head"><span className="rail-detail-ico" style={{ background: item.fx.color, color: iconColorOn(item.fx.color) }}><EffectIcon icon={item.fx.icon} size={16} /></span><b>{item.fx.name}</b></div>
        <div className="rail-detail-time">{clockTime(item.ts)}</div>
        {item.note ? <p className="rail-detail-note">{item.note}</p> : <p className="rail-detail-note muted">No description.</p>}
        <button className="rail-log" onClick={onClose}>Close</button>
      </div>
    )
  }
  const c = item
  const emos = (c.emotions || []).map(id => emotionMeta(id)?.name).filter(Boolean)
  return (
    <div className="rail-detail" onClick={(e) => e.stopPropagation()}>
      <div className="rail-detail-head"><MoodCloud v={c.mood} size={40} emotions={c.emotions} /><b>{moodMeta(c.mood).label}</b></div>
      <div className="rail-detail-time">{clockTime(c.ts)}</div>
      {emos.length > 0 && <div className="rail-detail-emos">{emos.join(' · ')}</div>}
      {c.note ? <p className="rail-detail-note">{c.note}</p> : <p className="rail-detail-note muted">No note — just the feeling.</p>}
      <button className="rail-log" onClick={onClose}>Close</button>
    </div>
  )
}
