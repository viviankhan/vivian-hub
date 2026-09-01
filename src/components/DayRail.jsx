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
import {
  dayKey, MOODS, moodMeta, COMPLEX_EMOTIONS, emotionMeta, checkinsForDay,
  DEFAULT_EFFECTS, POSITIVE_EFFECTS, isActive, activeEpisode, startEpisode, endEpisode, setEpisodeNote,
  episodeMinutes, fmtDuration, applyCheckIn, awardPetals,
} from '../lib/wellness.js'

// The waking-day window the rail spans, in hours. 6am → midnight.
const DAY_START = 6, DAY_END = 24
const clockTime = (ts) => { try { return new Date(ts).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) } catch { return '' } }
const fracOf = (d) => {
  const dt = new Date(d), h = dt.getHours() + dt.getMinutes() / 60
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
}) {
  const today = dayKey()
  const effectList = (effects && effects.length) ? effects : DEFAULT_EFFECTS
  const byId = useMemo(() => new Map(effectList.map(f => [f.id, f])), [effectList])
  const [nowMs, setNowMs] = useState(Date.now())
  useEffect(() => { const t = setInterval(() => setNowMs(Date.now()), 30000); return () => clearInterval(t) }, [])

  const [menu, setMenu] = useState(false)          // radial open
  const [sheet, setSheet] = useState(null)         // 'mood' | 'status' | null
  const [moodDetail, setMoodDetail] = useState(null)   // a tapped cloud
  const nowFrac = fracOf(nowMs)
  const blobRef = useRef(null)
  const [anchor, setAnchor] = useState(null)       // blob centre in viewport px
  const closeAll = () => { setMenu(false); setSheet(null); setMoodDetail(null) }
  const openMenu = () => {
    const r = blobRef.current?.getBoundingClientRect()
    if (r) setAnchor({ left: r.left + r.width / 2, top: r.top + r.height / 2 })
    setMenu(true)
  }

  const todayMoments = useMemo(() => checkinsForDay(checkins, today), [checkins, today])
  const lastMood = todayMoments.length ? todayMoments[todayMoments.length - 1].mood : 4

  // Today's status episodes (any that touch today), resolved with their effect.
  const todayEpisodes = useMemo(() => {
    const start = new Date(); start.setHours(0, 0, 0, 0)
    const dayStartMs = start.getTime(), dayEndMs = dayStartMs + 86400000
    return (episodes || []).filter(e => {
      const s = Date.parse(e.start), en = e.end ? Date.parse(e.end) : nowMs
      return en >= dayStartMs && s < dayEndMs
    }).map(e => ({ ...e, fx: byId.get(e.effectId) })).filter(e => e.fx)
  }, [episodes, byId, nowMs])

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

  const activeEffects = effectList.filter(f => isActive(episodes, f.id))
    .map(f => ({ id: f.id, name: f.name, good: POSITIVE_EFFECTS.has(f.id) }))

  return (
    <>
      <div className="day-rail">
      {/* Status-effect trails (behind everything; run down to the blob). */}
      {todayEpisodes.map(e => {
        const top = fracOf(e.start), bottom = e.end ? fracOf(e.end) : nowFrac
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
        if (m.type === 'mood') {
          const c = m.data
          return (
            <button key={m.key} className="rail-mark rail-mood" style={{ top: `${m.frac * 100}%`, transform: `translate(${dx}px,-50%) scale(${scale})` }}
              title={`${moodMeta(c.mood).label} · ${clockTime(c.ts)}`} onClick={() => setMoodDetail(c)}>
              <MoodCloud v={c.mood} size={30} emotions={c.emotions} />
            </button>
          )
        }
        const e = m.data
        return (
          <button key={m.key} className={`rail-mark rail-fx ${e.end ? '' : 'live'}`} style={{ top: `${m.frac * 100}%`, transform: `translate(${dx}px,-50%) scale(${scale})`, background: e.fx.color, color: iconColorOn(e.fx.color) }}
            title={`${e.fx.name}${e.note ? ' · ' + e.note : ''} · ${clockTime(e.start)}${e.end ? '' : ' · tap to end'}`}
            onClick={() => e.end ? setMoodDetail({ fx: e.fx, note: e.note, ts: e.start, isFx: true }) : endStatus(e.effectId)}>
            <Glyph id={e.fx.icon} size={15} />
          </button>
        )
      })}

      {/* The mind blob — rides the current time, taps open the radial menu. */}
      <div className="rail-blob" style={{ top: `${nowFrac * 100}%` }}>
        <button ref={blobRef} className="rail-blob-btn" onClick={() => (menu ? closeAll() : openMenu())} aria-label="Wellness">
          <GuideBlob size={54} tint="#8FB0D8" speaking={menu} />
        </button>
      </div>
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
          {sheet === 'mood' && <MomentSheet onClose={closeAll} onLog={logMood} />}
          {sheet === 'status' && (
            <StatusSheet effects={effectList} episodes={episodes} byId={byId}
              onAdd={addStatus} onEnd={(id) => endStatus(id, false)} onClose={closeAll} />
          )}
          {moodDetail && <DetailPopover item={moodDetail} onClose={closeAll} />}
        </div>
      )}
    </>
  )
}

// ── Moment sheet — pick a mood, optionally say why ──────────────
function MomentSheet({ onClose, onLog }) {
  const [mood, setMood] = useState(null)
  const [emotions, setEmotions] = useState([])
  const [note, setNote] = useState('')
  const [noting, setNoting] = useState(false)
  const toggleEmo = (id) => setEmotions(p => p.includes(id) ? p.filter(x => x !== id) : (p.length < 4 ? [...p, id] : p))
  return (
    <div className="rail-sheet" onClick={(e) => e.stopPropagation()}>
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
                <div className="rail-emos">
                  {COMPLEX_EMOTIONS.map(e => (
                    <button key={e.id} className={`rail-emo ${emotions.includes(e.id) ? 'on' : ''}`} onClick={() => toggleEmo(e.id)}>{e.name}</button>
                  ))}
                </div>
                <textarea className="rail-note" placeholder="What's behind this feeling? (only if you want to)" value={note} onChange={e => setNote(e.target.value)} rows={2} />
              </>}
          <button className="rail-log" onClick={() => onLog(mood, emotions, note)}>Log this moment</button>
        </>
      )}
    </div>
  )
}

// ── Status sheet — pick / describe / end a condition ────────────
function StatusSheet({ effects, episodes, byId, onAdd, onEnd, onClose }) {
  const [pick, setPick] = useState(null)
  const [note, setNote] = useState('')
  const active = effects.filter(f => isActive(episodes, f.id))
  return (
    <div className="rail-sheet" onClick={(e) => e.stopPropagation()}>
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
        {effects.map(f => {
          const on = isActive(episodes, f.id)
          return (
            <button key={f.id} className={`rail-fxpick ${pick === f.id ? 'sel' : ''} ${on ? 'on' : ''}`} disabled={on}
              onClick={() => setPick(f.id)} style={pick === f.id ? { borderColor: f.color, background: `color-mix(in srgb, ${f.color} 16%, #fff)` } : undefined}>
              <span className="rail-fxpick-ico" style={{ background: f.color, color: iconColorOn(f.color) }}><Glyph id={f.icon} size={15} /></span>
              <span>{f.name}</span>
            </button>
          )
        })}
      </div>
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
