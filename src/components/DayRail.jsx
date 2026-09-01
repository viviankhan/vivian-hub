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
import { useState, useMemo, useEffect, useRef, useLayoutEffect, useCallback } from 'react'
import { Glyph, iconColorOn } from '../lib/glyphs.jsx'
import { GuideBlob, MoodCloud } from '../lib/critters.jsx'
import {
  dayKey, MOODS, moodMeta, COMPLEX_EMOTIONS, checkinsForDay,
  DEFAULT_EFFECTS, POSITIVE_EFFECTS, isActive, activeEpisode, startEpisode, endEpisode, setEpisodeNote,
  episodeMinutes, fmtDuration, applyCheckIn, awardPetals, overlapAll,
} from '../lib/wellness.js'
import { pickQuote } from '../lib/quotes.js'

// Soft palette for custom emotion words the user adds.
const EMO_COLORS = ['#8E9BC4', '#F4B24C', '#9E8AA6', '#8FB27A', '#DB8A73', '#7FA8C9', '#9FD3C2', '#EAD79A', '#B0A0C8', '#97A9B8', '#F2B7CB', '#F0C06A']

// The waking-day window the rail spans, in hours. 6am → midnight.
const DAY_START = 6, DAY_END = 24
const clockTime = (ts) => { try { return new Date(ts).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) } catch { return '' } }
// Position on today's rail (0 = 6am, 1 = midnight). Date-aware and clamped, so
// anything that started before today (e.g. a condition left running overnight)
// sits at the very top rather than landing in the evening by its clock hour.
const fracOf = (d) => {
  const t = new Date(d).getTime()
  const now = new Date()
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), DAY_START).getTime()
  const span = (DAY_END - DAY_START) * 3600000
  return Math.max(0, Math.min(1, (t - start) / span))
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
  emotions, persistEmotions, quotesOn = false, log = [],
}) {
  const today = dayKey()
  const emotionList = (emotions && emotions.length) ? emotions : COMPLEX_EMOTIONS
  const emoName = (id) => (emotionList.find(e => e.id === id)?.name) || id
  const effectList = (effects && effects.length) ? effects : DEFAULT_EFFECTS
  const byId = useMemo(() => new Map(effectList.map(f => [f.id, f])), [effectList])
  const [nowMs, setNowMs] = useState(Date.now())
  useEffect(() => { const t = setInterval(() => setNowMs(Date.now()), 30000); return () => clearInterval(t) }, [])

  const [menu, setMenu] = useState(false)          // radial open
  const [sheet, setSheet] = useState(null)         // 'mood' | 'status' | null
  const [moodDetail, setMoodDetail] = useState(null)   // a tapped cloud
  const blobRef = useRef(null)
  const railRef = useRef(null)
  const [anchor, setAnchor] = useState(null)       // blob centre in viewport px
  const [speakN, setSpeakN] = useState(0)          // rotates the guide's line each open

  // ── Align the rail to the actual task timeline ────────────────
  // The timeline is task-based, not a flat clock, so we can't place things by a
  // linear day fraction. Instead we measure the timeline's own time markers
  // ([data-mins]) and its now-dot ([data-railnow]) and map any timestamp onto
  // the real pixel positions between them — so the blob and every marker line up
  // beside their moment on the timeline. Falls back to a simple clock scale when
  // the day has no timed tasks to anchor to.
  const [anchors, setAnchors] = useState([])   // sorted [{ mins, y }] in root px
  const [nowY, setNowY] = useState(null)
  const [railH, setRailH] = useState(600)
  const measure = useCallback(() => {
    const root = railRef.current?.offsetParent
    if (!root) return
    const rootTop = root.getBoundingClientRect().top
    const pts = []
    root.querySelectorAll('[data-mins]').forEach(n => {
      const m = Number(n.dataset.mins); if (Number.isNaN(m)) return
      const r = n.getBoundingClientRect(); pts.push({ mins: m, y: r.top + r.height / 2 - rootTop })
    })
    pts.sort((a, b) => a.mins - b.mins)
    setAnchors(pts)
    setRailH(root.offsetHeight || 600)
    const nowEl = root.querySelector('[data-railnow]')
    setNowY(nowEl ? (nowEl.getBoundingClientRect().top + nowEl.getBoundingClientRect().height / 2 - rootTop) : null)
  }, [])
  useLayoutEffect(() => {
    measure()
    const root = railRef.current?.offsetParent
    if (!root || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => measure())
    ro.observe(root)
    window.addEventListener('resize', measure)
    return () => { ro.disconnect(); window.removeEventListener('resize', measure) }
  }, [measure])
  useEffect(() => { const t = setTimeout(measure, 60); return () => clearTimeout(t) }, [measure, episodes, checkins, nowMs])

  // Minutes-since-midnight for a timestamp, clamped to today (before today → 0).
  const dayMin = (d) => {
    const d0 = new Date(); d0.setHours(0, 0, 0, 0)
    return Math.max(0, Math.min(1439, (new Date(d).getTime() - d0.getTime()) / 60000))
  }
  // Map a day-minute to a pixel Y using the measured timeline anchors.
  const yForMin = (m) => {
    const a = anchors
    if (a.length === 0) {   // no timed tasks — fall back to a flat clock scale
      const frac = Math.max(0, Math.min(1, (m / 60 - DAY_START) / (DAY_END - DAY_START)))
      return frac * railH
    }
    if (m <= a[0].mins) return a[0].y
    if (m >= a[a.length - 1].mins) return a[a.length - 1].y
    for (let i = 0; i < a.length - 1; i++) {
      if (m >= a[i].mins && m <= a[i + 1].mins) {
        const t = (m - a[i].mins) / ((a[i + 1].mins - a[i].mins) || 1)
        return a[i].y + t * (a[i + 1].y - a[i].y)
      }
    }
    return a[a.length - 1].y
  }
  const yForTs = (ts) => yForMin(dayMin(ts))
  const blobY = nowY != null ? nowY : yForTs(nowMs)
  const closeAll = () => { setMenu(false); setSheet(null); setMoodDetail(null) }
  const openMenu = () => {
    const r = blobRef.current?.getBoundingClientRect()
    if (r) setAnchor({ left: r.left + r.width / 2, top: r.top + r.height / 2 })
    setSpeakN(n => n + 1)
    setMenu(true)
  }

  const todayMoments = useMemo(() => checkinsForDay(checkins, today), [checkins, today])
  const lastMood = todayMoments.length ? todayMoments[todayMoments.length - 1].mood : 4
  const moodToday = todayMoments.length ? Math.round(todayMoments.reduce((s, c) => s + (c.mood || 3), 0) / todayMoments.length) : null

  // Add / remove a custom emotion word (persists the whole list).
  const addEmotion = (name) => {
    const nm = (name || '').trim(); if (!nm || !persistEmotions) return
    const base = (emotions && emotions.length) ? emotions : COMPLEX_EMOTIONS
    if (base.some(e => e.name.toLowerCase() === nm.toLowerCase())) return
    persistEmotions([...base, { id: 'emo-' + Date.now().toString(36), name: nm, color: EMO_COLORS[base.length % EMO_COLORS.length] }])
  }
  const deleteEmotion = (id) => {
    if (!persistEmotions) return
    const base = (emotions && emotions.length) ? emotions : COMPLEX_EMOTIONS
    persistEmotions(base.filter(e => e.id !== id))
  }

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
      // Only ENDED conditions sit on the timeline; live ones orbit the blob.
      ...todayEpisodes.filter(e => e.end).map(e => ({ type: 'fx', key: e.id, frac: fracOf(e.start), data: e })),
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
  const addStatus = (ids, note) => {
    const arr = Array.isArray(ids) ? ids : [ids]
    let next = episodes
    for (const id of arr) {
      next = startEpisode(next, id)
      if (note && note.trim()) next = setEpisodeNote(next, id, note.trim())
    }
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
  // Retroactively adjust an episode's end time (for a forgotten log).
  const editEnd = (epId, endISO) => {
    persistEpisodes((episodes || []).map(e => e.id === epId ? { ...e, end: endISO } : e))
  }

  const activeFxFull = effectList.filter(f => isActive(episodes, f.id))
  const activeEffects = activeFxFull.map(f => ({ id: f.id, name: f.name, good: POSITIVE_EFFECTS.has(f.id) }))
  // The things hovering around the blob at "now": live conditions + today's mood.
  const orbit = [
    ...activeFxFull.map(f => ({ kind: 'fx', id: 'o-' + f.id, fx: f })),
    ...(todayMoments.length ? [{ kind: 'mood', id: 'o-mood', mood: lastMood }] : []),
  ]
  const N = orbit.length
  // The cluster fans across the upper arc above the blob — where the rail is
  // empty — kept inside the gutter (never off the left edge, never far into the
  // timeline). Icons shrink as more pile on so it always fits.
  const oSize = Math.max(15, 27 - Math.max(0, N - 3) * 2)
  const oR = 30
  const oSpan = N <= 1 ? 0 : Math.min(64, 30 + N * 12)   // stays within ±32° of straight up (inside the gutter)
  const oStart = 270 - oSpan / 2
  const orbitPos = orbit.map((it, i) => {
    const ang = (N === 1 ? 270 : oStart + oSpan * (i / (N - 1))) * Math.PI / 180
    return { ...it, x: 27 + oR * Math.cos(ang), y: 27 + oR * Math.sin(ang) }
  })

  return (
    <>
      <div className="day-rail" ref={railRef}>
      {/* Status-effect trails (behind everything; run down to the blob). */}
      {todayEpisodes.map(e => {
        const top = yForTs(e.start), bottom = e.end ? yForTs(e.end) : blobY
        const h = Math.max(0, bottom - top)
        return (
          <button key={'t' + e.id} className="rail-trail" title={`${e.fx.name}${e.note ? ' · ' + e.note : ''} · tap to end`}
            onClick={() => e.end ? null : endStatus(e.effectId)}
            style={{ top: `${top}px`, height: `${h}px`, background: `linear-gradient(${e.fx.color}, color-mix(in srgb, ${e.fx.color} 55%, transparent))`, cursor: e.end ? 'default' : 'pointer' }} />
        )
      })}

      {/* Markers — mood clouds + status icons, fanned when they crowd. */}
      {markers.map(m => {
        const dx = m.cluster * 13, scale = m.cluster ? 0.72 : 1
        const y = yForTs(m.type === 'mood' ? m.data.ts : m.data.start)
        if (m.type === 'mood') {
          const c = m.data
          return (
            <button key={m.key} className="rail-mark rail-mood" style={{ top: `${y}px`, transform: `translate(${dx}px,-50%) scale(${scale})` }}
              title={`${moodMeta(c.mood).label} · ${clockTime(c.ts)}`} onClick={() => setMoodDetail(c)}>
              <MoodCloud v={c.mood} size={30} emotions={c.emotions} />
            </button>
          )
        }
        const e = m.data
        return (
          <button key={m.key} className={`rail-mark rail-fx ${e.end ? '' : 'live'}`} style={{ top: `${y}px`, transform: `translate(${dx}px,-50%) scale(${scale})`, background: e.fx.color, color: iconColorOn(e.fx.color) }}
            title={`${e.fx.name}${e.note ? ' · ' + e.note : ''} · ${clockTime(e.start)}${e.end ? '' : ' · tap to end'}`}
            onClick={() => e.end ? setMoodDetail({ isFx: true, ep: e }) : endStatus(e.effectId)}>
            <Glyph id={e.fx.icon} size={15} />
          </button>
        )
      })}

      {/* The mind blob — sits beside the current time on the timeline; taps open
          the radial menu. Live conditions + today's mood orbit it. */}
      <div className="rail-blob" style={{ top: `${blobY}px` }}>
        <button ref={blobRef} className="rail-blob-btn" onClick={() => (menu ? closeAll() : openMenu())} aria-label="Wellness">
          <GuideBlob size={54} tint="#8FB0D8" speaking={menu} />
        </button>
        {orbitPos.map(it => (
          it.kind === 'fx'
            ? <button key={it.id} className="rail-orbit rail-orbit-fx" title={`${it.fx.name} · tap to manage`}
                onClick={(ev) => { ev.stopPropagation(); setSheet('status') }}
                style={{ left: it.x - oSize / 2, top: it.y - oSize / 2, width: oSize, height: oSize, background: it.fx.color, color: iconColorOn(it.fx.color) }}>
                <Glyph id={it.fx.icon} size={Math.round(oSize * 0.56)} />
              </button>
            : <button key={it.id} className="rail-orbit rail-orbit-mood" title="Your mood today · tap to log"
                onClick={(ev) => { ev.stopPropagation(); setSheet('mood') }}
                style={{ left: it.x - oSize / 2, top: it.y - oSize / 2 }}>
                <MoodCloud v={it.mood} size={oSize} />
              </button>
        ))}
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
              {quotesOn
                ? (() => {
                    const q = pickQuote({ mood: moodToday, struggling: activeEffects.some(e => !e.good), easeful: activeEffects.some(e => e.good), n: speakN })
                    return <div className="rail-say"><span className="rail-say-q">“{q.t}”</span><span className="rail-say-a">— {q.a}</span></div>
                  })()
                : <div className="rail-say">{affirm(activeEffects)}</div>}
            </div>
          )}
          {sheet === 'mood' && <MomentSheet onClose={closeAll} onLog={logMood} emotions={emotionList} onAddEmotion={addEmotion} onDeleteEmotion={deleteEmotion} canEdit={!!persistEmotions} />}
          {sheet === 'status' && (
            <StatusSheet effects={effectList} episodes={episodes} byId={byId}
              onAdd={addStatus} onEnd={(id) => endStatus(id, false)} onClose={closeAll} />
          )}
          {moodDetail && <DetailPopover item={moodDetail} onClose={closeAll} emoName={emoName} checkins={checkins} log={log} onEditEnd={editEnd} />}
        </div>
      )}
    </>
  )
}

// ── Moment sheet — pick a mood, optionally say why ──────────────
function MomentSheet({ onClose, onLog, emotions: emoList = [], onAddEmotion, onDeleteEmotion, canEdit }) {
  const [mood, setMood] = useState(null)
  const [emotions, setEmotions] = useState([])
  const [note, setNote] = useState('')
  const [noting, setNoting] = useState(false)
  const [adding, setAdding] = useState(false)
  const [newEmo, setNewEmo] = useState('')
  const [pending, setPending] = useState(null)   // press-and-hold armed a delete
  const holdTimer = useRef(null)
  const heldRef = useRef(false)
  const toggleEmo = (id) => setEmotions(p => p.includes(id) ? p.filter(x => x !== id) : (p.length < 4 ? [...p, id] : p))
  const submitNew = () => { const v = newEmo.trim(); if (v) onAddEmotion?.(v); setNewEmo(''); setAdding(false) }
  // Press and hold a word to arm its removal; a second tap confirms.
  const startHold = (id) => { heldRef.current = false; clearTimeout(holdTimer.current); holdTimer.current = setTimeout(() => { heldRef.current = true; setPending(id) }, 500) }
  const endHold = () => { clearTimeout(holdTimer.current); holdTimer.current = null }
  useEffect(() => { if (!pending) return; const t = setTimeout(() => setPending(null), 3000); return () => clearTimeout(t) }, [pending])
  const chipClick = (ev, id) => {
    ev.stopPropagation()
    if (heldRef.current) { heldRef.current = false; return }   // the hold itself, not a tap
    if (pending === id) { onDeleteEmotion?.(id); setPending(null); return }
    setPending(null); toggleEmo(id)
  }
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
                <div className="rail-emos-label">Name the feeling (optional)</div>
                <div className="rail-emos" onClick={() => setPending(null)}>
                  {emoList.map(e => (
                    <button key={e.id}
                      className={`rail-emo ${emotions.includes(e.id) ? 'on' : ''} ${pending === e.id ? 'confirm' : ''}`}
                      onClick={(ev) => chipClick(ev, e.id)}
                      onPointerDown={() => canEdit && startHold(e.id)} onPointerUp={endHold} onPointerLeave={endHold} onPointerCancel={endHold}
                      onContextMenu={(ev) => ev.preventDefault()}>
                      {pending === e.id ? 'Remove?' : e.name}
                    </button>
                  ))}
                  {canEdit && (adding
                    ? <input className="rail-emo-input" autoFocus placeholder="feeling…" value={newEmo} maxLength={22}
                        onClick={(ev) => ev.stopPropagation()}
                        onChange={(e) => setNewEmo(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') submitNew(); if (e.key === 'Escape') { setNewEmo(''); setAdding(false) } }}
                        onBlur={submitNew} />
                    : <button className="rail-emo-plus" onClick={(ev) => { ev.stopPropagation(); setAdding(true) }} aria-label="Add a feeling word">+</button>
                  )}
                </div>
                {canEdit && <div className="rail-emo-hint">Tap to choose · press &amp; hold to remove</div>}
                <textarea className="rail-note" placeholder="What's behind this feeling? (only if you want to)" value={note} onChange={e => setNote(e.target.value)} rows={2} />
              </>}
          <button className="rail-log" onClick={() => onLog(mood, emotions, note)}>Log this moment</button>
        </>
      )}
    </div>
  )
}

// ── Status sheet — pick one or several, describe, or end ────────
function StatusSheet({ effects, episodes, byId, onAdd, onEnd, onClose }) {
  const [picks, setPicks] = useState([])
  const [note, setNote] = useState('')
  const active = effects.filter(f => isActive(episodes, f.id))
  const toggle = (id) => setPicks(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id])
  return (
    <div className="rail-sheet" onClick={(e) => e.stopPropagation()}>
      <div className="rail-sheet-title">What are you feeling in your body or mind?</div>
      {active.length > 0 && (
        <div className="rail-active">
          {active.map(f => {
            const ep = activeEpisode(episodes, f.id)
            return (
              <button key={f.id} className="rail-active-chip" style={{ background: f.color, color: iconColorOn(f.color) }} onClick={() => onEnd(f.id)}>
                <Glyph id={f.icon} size={14} /> {f.name} · {fmtDuration(episodeMinutes(ep))} <span className="rail-x">End</span>
              </button>
            )
          })}
        </div>
      )}
      <div className="rail-fxgrid">
        {effects.map(f => {
          const on = isActive(episodes, f.id)
          const sel = picks.includes(f.id)
          return (
            <button key={f.id} className={`rail-fxpick ${sel ? 'sel' : ''} ${on ? 'on' : ''}`} disabled={on}
              onClick={() => toggle(f.id)} style={sel ? { borderColor: f.color, background: `color-mix(in srgb, ${f.color} 16%, #fff)` } : undefined}>
              {sel && <span className="rail-fxpick-check" style={{ background: f.color, color: iconColorOn(f.color) }}>✓</span>}
              <span className="rail-fxpick-ico" style={{ background: f.color, color: iconColorOn(f.color) }}><Glyph id={f.icon} size={15} /></span>
              <span>{f.name}</span>
            </button>
          )
        })}
      </div>
      {picks.length > 0 && (
        <>
          <textarea className="rail-note" placeholder="Describe how these feel — optional, and shared across the ones you picked" value={note} onChange={e => setNote(e.target.value)} rows={2} />
          <button className="rail-log" onClick={() => onAdd(picks, note)}>Start tracking{picks.length > 1 ? ` ${picks.length}` : ''}</button>
        </>
      )}
    </div>
  )
}

// ── Detail popover — tap a marker to read it back ───────────────
const hhmm = (d) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
function DetailPopover({ item, onClose, emoName = (id) => id, checkins = [], log = [], onEditEnd }) {
  const ep = item.isFx ? item.ep : null
  const [editing, setEditing] = useState(false)
  const [endVal, setEndVal] = useState(() => hhmm(new Date(ep?.end || Date.now())))

  if (item.isFx) {
    const startMs = new Date(ep.start).getTime()
    const endMs = ep.end ? new Date(ep.end).getTime() : Date.now()
    const mins = Math.max(0, Math.round((endMs - startMs) / 60000))
    // Everything that co-occurred while this condition was active — the raw
    // material for correlations (moods felt, tasks done) during its span.
    const { moods: moodsIn, tasks: tasksIn } = overlapAll(startMs, endMs, { checkins, log })
    const avgMood = moodsIn.length ? Math.round(moodsIn.reduce((s, c) => s + (c.mood || 3), 0) / moodsIn.length * 10) / 10 : null
    const emosIn = [...new Set(moodsIn.flatMap(c => c.emotions || []))].map(emoName).filter(Boolean).slice(0, 4)
    const saveEnd = () => {
      const [hh, mm] = endVal.split(':').map(Number)
      const base = new Date(ep.end || Date.now()); base.setHours(hh, mm, 0, 0)
      let ms = base.getTime(); if (ms < startMs) ms = startMs
      onEditEnd?.(ep.id, new Date(ms).toISOString()); setEditing(false)
    }
    return (
      <div className="rail-detail" onClick={(e) => e.stopPropagation()}>
        <div className="rail-detail-head"><span className="rail-detail-ico" style={{ background: ep.fx.color, color: iconColorOn(ep.fx.color) }}><Glyph id={ep.fx.icon} size={16} /></span><b>{ep.fx.name}</b></div>
        <div className="rail-detail-time">{clockTime(ep.start)} – {ep.end ? clockTime(ep.end) : 'now'} · {fmtDuration(mins)}</div>
        {ep.note ? <p className="rail-detail-note">{ep.note}</p> : <p className="rail-detail-note muted">No description.</p>}
        {(moodsIn.length > 0 || tasksIn.length > 0) && (
          <div className="rail-detail-ctx">
            <div className="rail-detail-ctx-h">While this was active</div>
            {moodsIn.length > 0 && <div className="rail-detail-ctx-row"><b>{moodsIn.length}</b> check-in{moodsIn.length > 1 ? 's' : ''} · avg mood {avgMood}{emosIn.length ? ' · ' + emosIn.join(', ') : ''}</div>}
            {tasksIn.length > 0 && <div className="rail-detail-ctx-row"><b>{tasksIn.length}</b> task{tasksIn.length > 1 ? 's' : ''}: {tasksIn.slice(0, 4).map(t => t.label).join(', ')}{tasksIn.length > 4 ? '…' : ''}</div>}
          </div>
        )}
        {ep.end && editing && (
          <div className="rail-edit">
            <label className="rail-edit-label">Change end time</label>
            <div className="rail-edit-row">
              <input type="time" className="rail-edit-input" value={endVal} onChange={e => setEndVal(e.target.value)} />
              <button className="rail-edit-save" onClick={saveEnd}>Save</button>
            </div>
          </div>
        )}
        <div className="rail-detail-foot">
          <button className="rail-log rail-detail-close" onClick={onClose}>Close</button>
          {ep.end && !editing && <button className="rail-detail-edit" onClick={() => setEditing(true)}>Edit?</button>}
        </div>
      </div>
    )
  }

  const c = item
  const emos = (c.emotions || []).map(id => emoName(id)).filter(Boolean)
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
