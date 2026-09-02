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
import { useState, useMemo, useEffect, useLayoutEffect, useRef } from 'react'
import { Glyph, iconColorOn } from '../lib/glyphs.jsx'
import { GuideBlob, MoodCloud } from '../lib/critters.jsx'
import ColorPickRow from './ColorPickRow.jsx'
import {
  dayKey, keyToDate, MOODS, moodMeta, selectableEmotions, makeEmotion, emotionMeta, EMOTION_PALETTE, checkinsForDay,
  DEFAULT_EFFECTS, POSITIVE_EFFECTS, makeEffect, EFFECT_COLORS, EFFECT_ICONS, isActive, activeEpisode, startEpisode, endEpisode, setEpisodeNote,
  episodeMinutes, fmtDuration, applyCheckIn, awardPetals,
} from '../lib/wellness.js'

// The waking-day window the rail spans, in hours. 6am → midnight.
const DAY_START = 6, DAY_END = 24
const clockTime = (ts) => { try { return new Date(ts).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) } catch { return '' } }
const fracOf = (d) => {
  const dt = new Date(d), h = dt.getHours() + dt.getMinutes() / 60
  return Math.max(0, Math.min(1, (h - DAY_START) / (DAY_END - DAY_START)))
}
// Minute-of-day for a timestamp — the unit the timeline's task pills are tagged
// in, so the rail can map a moment onto the timeline's own geometry.
const minsOf = (d) => { const dt = new Date(d); return dt.getHours() * 60 + dt.getMinutes() }

// A kind line for the blob to speak, shaped by what you're carrying right now.
function affirm(activeEffects) {
  const bad = activeEffects.find(e => !e.good)
  const good = activeEffects.find(e => e.good)
  if (bad) return `${bad.name.toLowerCase()} today — I see you carrying it. Be as gentle with yourself as you'd be with a friend.`
  if (good) return `You're ${good.name.toLowerCase()} right now. Hold onto this — you've earned a good hour.`
  return 'However today is going, you showed up for it. That counts. I\'m right here.'
}

export default function DayRail({
  dateKey, isToday = true,
  checkins = [], persistCheckins, effects, persistEffects,
  episodes = [], persistEpisodes, game, persistGame,
  emotionPrefs, persistEmotionPrefs,
}) {
  const today = dayKey()
  // The day this rail is drawn for. New moments are always logged against the
  // real today (the blob only shows then), but past days keep displaying what
  // was tracked on them.
  const day = dateKey || today
  const effectList = (effects && effects.length) ? effects : DEFAULT_EFFECTS
  const byId = useMemo(() => new Map(effectList.map(f => [f.id, f])), [effectList])
  const [nowMs, setNowMs] = useState(Date.now())
  useEffect(() => { const t = setInterval(() => setNowMs(Date.now()), 30000); return () => clearInterval(t) }, [])

  const [menu, setMenu] = useState(false)          // radial open
  const [sheet, setSheet] = useState(null)         // 'mood' | 'status' | null
  const [moodDetail, setMoodDetail] = useState(null)   // a tapped cloud
  const nowFrac = fracOf(nowMs)
  const blobRef = useRef(null)
  const railRef = useRef(null)
  const [anchor, setAnchor] = useState(null)       // blob centre in viewport px
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

  const todayMoments = useMemo(() => checkinsForDay(checkins, day), [checkins, day])
  const lastMood = todayMoments.length ? todayMoments[todayMoments.length - 1].mood : 4

  // The viewed day's window, so past days keep showing what was tracked then.
  const { dayStartMs, dayEndMs } = useMemo(() => {
    const start = keyToDate(day); start.setHours(0, 0, 0, 0)
    const s = start.getTime()
    return { dayStartMs: s, dayEndMs: s + 86400000 }
  }, [day])

  // The viewed day's status episodes (any that touch it), resolved with their
  // effect. A still-running episode trails to "now" on today, or to the end of
  // the day on a past day.
  const todayEpisodes = useMemo(() => {
    const openEnd = isToday ? nowMs : dayEndMs
    return (episodes || []).filter(e => {
      const s = Date.parse(e.start), en = e.end ? Date.parse(e.end) : openEnd
      return en >= dayStartMs && s < dayEndMs
    }).map(e => ({ ...e, fx: byId.get(e.effectId) })).filter(e => e.fx)
  }, [episodes, byId, nowMs, isToday, dayStartMs, dayEndMs])

  // Markers that share a moment fan out diagonally and shrink so a cloud + an
  // effect at the same time read as one slot.
  const markers = useMemo(() => {
    const list = [
      ...todayMoments.map(c => ({ type: 'mood', key: c.id, frac: fracOf(c.ts), data: c })),
      ...todayEpisodes.map(e => ({ type: 'fx', key: e.id, frac: fracOf(e.start), data: e })),
    ].sort((a, b) => a.frac - b.frac)
    let cluster = -1, prev = -Infinity
    return list.map(m => {
      if (m.frac - prev < 0.035) cluster += 1; else cluster = 0
      prev = m.frac
      return { ...m, cluster }
    })
  }, [todayMoments, todayEpisodes])

  // The timeline lays tasks out proportionally (with per-task minimums, blocks
  // and gaps), so a clock fraction drifts from where a moment actually sits on
  // screen. We read the timeline's own geometry — each task pill carries its
  // start/end minute — and build a time→fraction map of the rail. Every rail
  // element (moods, status trails, the blob) is then placed through the same
  // map, so they stay locked to the timeline rather than to the clock.
  const [timeMap, setTimeMap] = useState([])
  useLayoutEffect(() => {
    const rail = railRef.current
    const root = rail?.closest('.today-root')
    if (!rail || !root) return
    const measure = () => {
      const rr = rail.getBoundingClientRect()
      if (!rr.height) return
      const anchors = []
      const at = (px) => (px - rr.top) / rr.height
      root.querySelectorAll('.js-task-pill').forEach(pl => {
        const s = Number(pl.dataset.smin), e = Number(pl.dataset.emin)
        const b = pl.getBoundingClientRect()
        if (Number.isFinite(s)) anchors.push({ min: s, frac: at(b.top) })
        if (Number.isFinite(e)) anchors.push({ min: e, frac: at(b.bottom) })
      })
      const dot = isToday ? root.querySelector('.js-now-dot') : null
      if (dot) { const b = dot.getBoundingClientRect(); anchors.push({ min: minsOf(nowMs), frac: at(b.top + b.height / 2) }) }
      // Pin the rail's ends to the waking-day window so out-of-range moments
      // still land sensibly.
      anchors.push({ min: DAY_START * 60, frac: 0 }, { min: DAY_END * 60, frac: 1 })
      anchors.sort((a, b) => a.min - b.min)
      // Keep it monotonic (measurement noise / minimums can nudge a frac back).
      let prev = -Infinity
      const clean = []
      for (const a of anchors) {
        if (clean.length && a.min === clean[clean.length - 1].min) continue
        const f = Math.max(prev, Math.max(0, Math.min(1, a.frac)))
        clean.push({ min: a.min, frac: f }); prev = f
      }
      setTimeMap(clean)
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(root)
    window.addEventListener('resize', measure)
    return () => { ro.disconnect(); window.removeEventListener('resize', measure) }
  }, [isToday, nowMs, markers, day])

  // Interpolate a minute-of-day to a rail fraction through the measured map;
  // null until the map is ready, so callers can fall back to the clock.
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
  // A timestamp → rail fraction, mapped through the timeline, else the clock.
  const railFrac = (ts) => { const f = fracForMin(minsOf(ts)); return f != null ? f : fracOf(ts) }

  // The blob's vertical home: "now" placed through the same map, so it sits on
  // the timeline's now-marker. Live status trails run down to meet it.
  const blobFrac = (() => { const f = fracForMin(minsOf(nowMs)); return f != null ? f : nowFrac })()

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
        // A still-running episode's trail runs down to the blob (today) or to
        // the day's end (a past day); a closed one stops at its recorded end.
        // Placed through the timeline map so the trail meets the blob exactly.
        const top = railFrac(e.start)
        const bottom = e.end ? railFrac(e.end) : (isToday ? blobFrac : 1)
        const h = Math.max(0, bottom - top)
        return (
          <button key={'t' + e.id} className="rail-trail" title={`${e.fx.name}${e.note ? ' · ' + e.note : ''} · tap to end`}
            onClick={() => e.end ? null : endStatus(e.effectId)}
            style={{ top: `${top * 100}%`, height: `${h * 100}%`, background: `linear-gradient(${e.fx.color}, color-mix(in srgb, ${e.fx.color} 55%, transparent))`, cursor: e.end ? 'default' : 'pointer' }} />
        )
      })}

      {/* Markers — mood clouds + status icons, fanned when they crowd. */}
      {markers.map(m => {
        const dx = m.cluster * 13, scale = m.cluster ? 0.72 : 1
        // Position through the timeline map (clustering above still uses the
        // clock — it only needs to know which marks share a moment).
        const top = railFrac(m.type === 'mood' ? m.data.ts : m.data.start)
        if (m.type === 'mood') {
          const c = m.data
          return (
            <button key={m.key} className="rail-mark rail-mood" style={{ top: `${top * 100}%`, transform: `translate(${dx}px,-50%) scale(${scale})` }}
              title={`${moodMeta(c.mood).label} · ${clockTime(c.ts)}`} onClick={() => setMoodDetail(c)}>
              <MoodCloud v={c.mood} size={30} emotions={c.emotions} />
            </button>
          )
        }
        const e = m.data
        return (
          <button key={m.key} className={`rail-mark rail-fx ${e.end ? '' : 'live'}`} style={{ top: `${top * 100}%`, transform: `translate(${dx}px,-50%) scale(${scale})`, background: e.fx.color, color: iconColorOn(e.fx.color) }}
            title={`${e.fx.name}${e.note ? ' · ' + e.note : ''} · ${clockTime(e.start)}${e.end ? '' : ' · tap to end'}`}
            onClick={() => e.end ? setMoodDetail({ fx: e.fx, note: e.note, ts: e.start, isFx: true }) : endStatus(e.effectId)}>
            <Glyph id={e.fx.icon} size={15} />
          </button>
        )
      })}

      {/* The mind blob — rides the live now-marker, taps open the radial menu.
          It belongs to "now", so it only appears on today; past days keep their
          logged clouds and trails without it. */}
      {isToday && (
        <div className="rail-blob" style={{ top: `${blobFrac * 100}%` }}>
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
                <Glyph id={f.icon} size={14} /> {f.name} · {fmtDuration(episodeMinutes(ep))} <span className="rail-x">✕ end</span>
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
                <span className="rail-fxpick-ico" style={{ background: f.color, color: iconColorOn(f.color) }}><Glyph id={f.icon} size={15} /></span>
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
            <span className="rail-fxpick-ico sm" style={{ background: draft.color, color: iconColorOn(draft.color) }}><Glyph id={draft.icon} size={14} /></span>
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
          <div className="rail-fx-icons">
            {EFFECT_ICONS.map(ic => (
              <button key={ic} className={`rail-fx-icon ${draft.icon === ic ? 'on' : ''}`} onClick={() => setDraft({ ...draft, icon: ic })}
                style={draft.icon === ic ? { background: draft.color, color: iconColorOn(draft.color), borderColor: draft.color } : undefined} aria-label={`Icon ${ic}`}>
                <Glyph id={ic} size={16} />
              </button>
            ))}
          </div>
        </div>
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
        <div className="rail-detail-head"><span className="rail-detail-ico" style={{ background: item.fx.color, color: iconColorOn(item.fx.color) }}><Glyph id={item.fx.icon} size={16} /></span><b>{item.fx.name}</b></div>
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
