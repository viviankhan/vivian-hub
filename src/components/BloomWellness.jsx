import { useState, useMemo, useRef, useEffect } from 'react'
import { Glyph, iconColorOn } from '../lib/glyphs.jsx'
import { Companion, MoodCloud, DayCloud, AlienSky } from '../lib/critters.jsx'
import ColorPickRow from './ColorPickRow.jsx'
import { bloomBurst } from '../lib/bloom.js'
import {
  dayKey, keyToDate, MOODS, ENERGY, moodMeta, promptForDay,
  selectableEmotions, emotionMeta, makeEmotion, EMOTION_PALETTE, checkinsForDay, daySegments, emotionWeights, pastDayKeys, effectOnDay,
  stageForLevel, nextStage, levelFromXp, liveStreak, applyCheckIn, awardPetals, REWARDS,
  DEFAULT_EFFECTS, POSITIVE_EFFECTS, makeEffect, EFFECT_COLORS, EFFECT_ICONS,
  activeEpisode, isActive, toggleEpisode, episodeMinutes, fmtDuration, effectTotals,
  buildDailyRecords, computeInsights, moodTrend, shareText,
} from '../lib/wellness.js'

// Short "h:mm am" time for a check-in moment.
function clockTime(ts) {
  try { return new Date(ts).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) } catch { return '' }
}
// "Mon Aug 21" for a day-key.
function dayLabel(key) {
  try { return keyToDate(key).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) } catch { return key }
}
// Read an image file and downscale it to a small JPEG data URL so treasures can
// live in the synced kv blob without bloating it.
function fileToTreasure(file, max = 720) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = reject
    reader.onload = () => {
      const img = new Image()
      img.onerror = reject
      img.onload = () => {
        const scale = Math.min(1, max / Math.max(img.width, img.height))
        const w = Math.round(img.width * scale), h = Math.round(img.height * scale)
        const cv = document.createElement('canvas'); cv.width = w; cv.height = h
        cv.getContext('2d').drawImage(img, 0, 0, w, h)
        try { resolve(cv.toDataURL('image/jpeg', 0.62)) } catch (e) { reject(e) }
      }
      img.src = reader.result
    }
    reader.readAsDataURL(file)
  })
}


// ── Small building blocks ──────────────────────────────────────

// The level ring around the companion — an SVG arc that fills with XP progress.
function ProgressRing({ pct, size = 118, stroke = 8, children }) {
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const off = c - (Math.max(0, Math.min(100, pct)) / 100) * c
  return (
    <div style={{ position: 'relative', width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }} aria-hidden="true">
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="rgba(255,255,255,.25)" strokeWidth={stroke} />
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#FBE79E" strokeWidth={stroke}
          strokeLinecap="round" strokeDasharray={c} strokeDashoffset={off}
          style={{ transition: 'stroke-dashoffset .8s cubic-bezier(.2,.8,.2,1)' }} />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {children}
      </div>
    </div>
  )
}

// A tiny 14-day mood sparkline. Missing days leave a gap so streaks read clearly.
function Sparkline({ points, width = 260, height = 46 }) {
  const vals = points.map(p => p.mood)
  const n = points.length
  const stepX = n > 1 ? width / (n - 1) : width
  const y = v => height - 6 - ((v - 1) / 4) * (height - 12)
  // Build line segments only between consecutive present values.
  const segs = []
  let cur = []
  points.forEach((p, i) => {
    if (p.mood == null) { if (cur.length > 1) segs.push(cur); cur = [] }
    else cur.push([i * stepX, y(p.mood)])
  })
  if (cur.length > 1) segs.push(cur)
  return (
    <svg width="100%" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" style={{ display: 'block' }} aria-hidden="true">
      {segs.map((s, si) => (
        <polyline key={si} points={s.map(([x, yy]) => `${x},${yy}`).join(' ')}
          fill="none" stroke="var(--teal)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      ))}
      {points.map((p, i) => p.mood != null && (
        <circle key={i} cx={i * stepX} cy={y(p.mood)} r="3" fill={moodMeta(p.mood).color} />
      ))}
    </svg>
  )
}

// A single condition chip — glows and shows elapsed time while active.
function EffectChip({ effect, active, since, onToggle, onEdit }) {
  const good = POSITIVE_EFFECTS.has(effect.id)
  const bg = active ? effect.color : 'var(--cream)'
  const fg = active ? iconColorOn(effect.color) : 'var(--text)'
  return (
    <button onClick={onToggle}
      onContextMenu={(e) => { e.preventDefault(); onEdit && onEdit() }}
      className={`fx-chip ${active ? 'active' : ''}`}
      title={active ? `Active for ${fmtDuration(since)} — tap to end` : `Tap to start${good ? '' : ' tracking'}`}
      style={{ background: bg, color: fg, borderColor: active ? effect.color : 'var(--border)' }}>
      <span className="fx-chip-icon" style={{ background: active ? 'rgba(255,255,255,.22)' : effect.color + '22', color: active ? fg : effect.color }}>
        <Glyph id={effect.icon} size={18} />
      </span>
      <span className="fx-chip-body">
        <span className="fx-chip-name">{effect.name}</span>
        <span className="fx-chip-meta" style={{ color: active ? fg : 'var(--muted)', opacity: active ? .9 : 1 }}>
          {active ? `on · ${fmtDuration(since)}` : (good ? 'tap when it starts' : 'off')}
        </span>
      </span>
      {onEdit && (
        <span className="fx-chip-edit" onClick={(e) => { e.stopPropagation(); onEdit() }} title="Edit" aria-label="Edit condition">
          <Glyph id="pencil" size={13} color={active ? fg : 'var(--muted)'} />
        </span>
      )}
    </button>
  )
}

// The create/edit sheet for a custom condition.
function EffectEditor({ draft, onChange, onSave, onDelete, onClose }) {
  const canSave = (draft.name || '').trim().length > 0
  return (
    <div className="wl-modal-scrim" onClick={onClose}>
      <div className="wl-modal" onClick={(e) => e.stopPropagation()}>
        <div className="wl-modal-title serif">{draft.id ? 'Edit condition' : 'New condition'}</div>
        <label className="wl-field-label">Name</label>
        <input className="wl-input" autoFocus value={draft.name}
          onChange={(e) => onChange({ ...draft, name: e.target.value })}
          placeholder="e.g. Cramps, Restless, Hopeful" />

        <label className="wl-field-label">Kind</label>
        <div className="wl-seg">
          {['physical', 'mental'].map(k => (
            <button key={k} className={`wl-seg-btn ${draft.kind === k ? 'on' : ''}`}
              onClick={() => onChange({ ...draft, kind: k })}>{k === 'physical' ? 'Physical' : 'Mental'}</button>
          ))}
        </div>

        <label className="wl-field-label">Color</label>
        <ColorPickRow colors={EFFECT_COLORS} value={draft.color} onChange={(c) => onChange({ ...draft, color: c })} />

        <label className="wl-field-label">Icon</label>
        <div className="wl-icon-grid">
          {EFFECT_ICONS.map(ic => (
            <button key={ic} className={`wl-icon-btn ${draft.icon === ic ? 'on' : ''}`}
              onClick={() => onChange({ ...draft, icon: ic })} aria-label={`Icon ${ic}`}
              style={draft.icon === ic ? { background: draft.color, color: iconColorOn(draft.color), borderColor: draft.color } : {}}>
              <Glyph id={ic} size={20} />
            </button>
          ))}
        </div>

        <div className="wl-modal-actions">
          {draft.id && <button className="wl-btn ghost danger" onClick={onDelete}>Delete</button>}
          <div style={{ flex: 1 }} />
          <button className="wl-btn ghost" onClick={onClose}>Cancel</button>
          <button className="wl-btn primary" disabled={!canSave} onClick={onSave}>Save</button>
        </div>
      </div>
    </div>
  )
}

// The check-in emotion palette: tap to tag (up to 4), "＋" to add a unique
// emotion with a chosen colour, long-press a chip for a faint ✕ that removes it
// from the palette going forward (previously tagged clouds keep it).
function EmotionPicker({ options, selected, onToggle, onAdd, onDelete }) {
  const [armed, setArmed] = useState(null)
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const [color, setColor] = useState(EMOTION_PALETTE[0])
  const holdRef = useRef(null)
  const longFired = useRef(false)
  const startHold = (id) => { longFired.current = false; clearTimeout(holdRef.current); holdRef.current = setTimeout(() => { longFired.current = true; setArmed(id) }, 450) }
  const endHold = () => clearTimeout(holdRef.current)
  const chipClick = (id) => { if (longFired.current) { longFired.current = false; return } if (armed) { setArmed(null); return } onToggle(id) }
  const openAdd = () => { setArmed(null); setColor(EMOTION_PALETTE[Math.floor(Math.random() * EMOTION_PALETTE.length)]); setAdding(true) }
  const commit = () => { if (name.trim()) onAdd(name, color); setName(''); setAdding(false) }
  return (
    <>
      <div className="wl-emotions" onClick={() => setArmed(null)}>
        {options.map(e => {
          const on = selected.includes(e.id)
          return (
            <span key={e.id} className="wl-emo-wrap">
              <button className={`wl-emo ${on ? 'on' : ''} ${armed === e.id ? 'armed' : ''}`}
                onClick={(ev) => { ev.stopPropagation(); chipClick(e.id) }}
                onPointerDown={() => startHold(e.id)} onPointerUp={endHold} onPointerLeave={endHold}
                onContextMenu={ev => ev.preventDefault()}
                style={on ? { borderColor: e.color, background: e.color + '26', boxShadow: `0 0 0 3px ${e.color}33` } : {}}>
                <span className="wl-emo-dot" style={{ background: e.color }} />
                {e.name}
              </button>
              {armed === e.id && (
                <button className="rail-emo-del" title="Remove this emotion"
                  onClick={ev => { ev.stopPropagation(); onDelete(e.id); setArmed(null) }}>✕</button>
              )}
            </span>
          )
        })}
        {!adding && <button className="rail-emo-add" title="Add a unique emotion" onClick={(ev) => { ev.stopPropagation(); openAdd() }}>＋</button>}
      </div>
      {adding && (
        <div className="rail-emo-adder">
          <div className="rail-emo-adder-row">
            <span className="rail-emo-dot lg" style={{ background: color }} />
            <input className="rail-emo-input" autoFocus value={name} maxLength={24}
              placeholder="name a feeling…" onChange={ev => setName(ev.target.value)}
              onKeyDown={ev => { if (ev.key === 'Enter') commit(); if (ev.key === 'Escape') { setName(''); setAdding(false) } }} />
            <button className="rail-emo-ok" disabled={!name.trim()} onClick={commit}>Add</button>
          </div>
          <ColorPickRow colors={EMOTION_PALETTE} value={color} onChange={setColor} />
        </div>
      )}
    </>
  )
}

// The shareable progress card + share/copy actions.
function ShareSheet({ game, tracked, stage, onClose }) {
  const [copied, setCopied] = useState(false)
  const lv = levelFromXp(game?.xp || 0)
  const text = shareText({ game, tracked, stage })
  const doCopy = async () => {
    try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1800) } catch {}
  }
  const doShare = async () => {
    if (navigator.share) { try { await navigator.share({ title: 'My Bloom progress', text }) } catch {} }
    else doCopy()
  }
  return (
    <div className="wl-modal-scrim" onClick={onClose}>
      <div className="wl-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 380 }}>
        <div className="wl-share-card">
          <div className="wl-share-emoji"><Companion level={lv.level} size={104} /></div>
          <div className="wl-share-name serif">Level {lv.level} · {stage.name}</div>
          <div className="wl-share-stats">
            <div><b><Glyph id="flame" size={16} /> {liveStreak(game)}</b><span>day streak</span></div>
            <div><b><Glyph id="flower" size={16} /> {game?.petals || 0}</b><span>petals</span></div>
            <div><b><Glyph id="chart" size={16} /> {tracked}</b><span>days tracked</span></div>
          </div>
          <div className="wl-share-tag">Growing a calmer week, one check-in at a time.</div>
        </div>
        <div className="wl-modal-actions" style={{ marginTop: 14 }}>
          <button className="wl-btn ghost" onClick={doCopy}>{copied ? 'Copied ✓' : 'Copy'}</button>
          <div style={{ flex: 1 }} />
          <button className="wl-btn ghost" onClick={onClose}>Close</button>
          <button className="wl-btn primary" onClick={doShare}>Share with a friend</button>
        </div>
        <div className="wl-share-note">Sharing sends a text summary through your device's share sheet — no account or friend list needed.</div>
      </div>
    </div>
  )
}

// A day's detail sheet — opened by tapping a cloud. Shows the day's cloud, the
// times of its moods/emotions, what happened that day (finished tasks +
// conditions), and its treasures, with a way to add a new treasure.
function DayDetail({ date, checkins, episodes, effects, log, treasures, onAddTreasure, onDeleteTreasure, onClose }) {
  const seg = daySegments(checkins, date)
  const weights = emotionWeights(checkins, date)
  const moments = checkinsForDay(checkins, date)
  const dayTreasures = treasures.filter(t => t.date === date)
  const tasks = (log || []).filter(e => (e.date || (e.ts ? String(e.ts).slice(0, 10) : '')) === date)
  const conditions = (effects || []).filter(fx => effectOnDay(episodes, fx.id, date))
  const fileRef = useRef(null)
  const [draft, setDraft] = useState(null)   // { image, desc } while adding
  const [busy, setBusy] = useState(false)

  const pickFile = () => fileRef.current && fileRef.current.click()
  const onFile = async (e) => {
    const f = e.target.files && e.target.files[0]
    e.target.value = ''
    if (!f) return
    setBusy(true)
    try { const image = await fileToTreasure(f); setDraft({ image, desc: '' }) }
    catch { alert('Could not read that image.') }
    setBusy(false)
  }
  const saveTreasure = () => {
    if (!draft) return
    onAddTreasure({ id: 't-' + Date.now().toString(36), date, image: draft.image, desc: draft.desc.trim(), ts: new Date().toISOString() })
    setDraft(null)
  }

  return (
    <div className="wl-modal-scrim" onClick={onClose}>
      <div className="wl-modal" onClick={(e) => e.stopPropagation()}>
        <div className="wl-day-detail-head">
          <div className="wl-detail-cloud">
            <DayCloud segments={seg.segments} emotions={seg.emotions} weights={weights} dominant={seg.dominant}
              faceMood={date === dayKey() ? seg.overall : null} face={date === dayKey()} size={104} />
          </div>
          <div>
            <div className="wl-modal-title serif" style={{ marginBottom: 2 }}>{dayLabel(date)}</div>
            <div className="wl-day-legend" style={{ marginTop: 4 }}>
              {seg.props.map(p => (
                <span key={p.v} className="wl-legend-item">
                  <span className="wl-legend-dot" style={{ background: moodMeta(p.v).color }} />
                  {moodMeta(p.v).label} {Math.round(p.pct * 100)}%
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Times of each mood / emotion through the day */}
        <label className="wl-field-label">Moments</label>
        <div className="wl-moments" style={{ marginTop: 0, borderTop: 'none', paddingTop: 0 }}>
          {moments.map(m => (
            <div key={m.id || m.ts} className="wl-moment">
              <MoodCloud v={m.mood} emotions={m.emotions} size={38} />
              <div className="wl-moment-body">
                <div className="wl-moment-top">
                  <span className="wl-moment-mood">{moodMeta(m.mood).label}</span>
                  <span className="wl-moment-time">{clockTime(m.ts)}</span>
                </div>
                {(m.emotions && m.emotions.length > 0) && (
                  <div className="wl-moment-emos">{m.emotions.map(id => emotionMeta(id)?.name).filter(Boolean).join(' · ')}</div>
                )}
                {m.note && <div className="wl-moment-note">“{m.note}”</div>}
              </div>
            </div>
          ))}
        </div>

        {/* What else happened that day — the correlated events */}
        {(tasks.length > 0 || conditions.length > 0) && (
          <>
            <label className="wl-field-label">That day</label>
            <div className="wl-day-events">
              {conditions.map(fx => (
                <span key={fx.id} className="wl-lining-chip" style={{ borderColor: fx.color, color: '#4A5560' }}>
                  <span className="wl-emo-dot" style={{ background: fx.color }} /> {fx.name}
                </span>
              ))}
              {tasks.slice(0, 12).map((t, i) => (
                <span key={i} className="wl-event-chip"><Glyph id="check" size={12} color="var(--teal)" /> {t.label}</span>
              ))}
            </div>
          </>
        )}

        {/* Treasures */}
        <label className="wl-field-label">Treasures</label>
        <div className="wl-treasures">
          {dayTreasures.map(t => (
            <figure key={t.id} className="wl-treasure">
              <img src={t.image} alt={t.desc || 'treasure'} />
              {t.desc && <figcaption>{t.desc}</figcaption>}
              <button className="wl-treasure-x" title="Remove" onClick={() => onDeleteTreasure(t.id)}>✕</button>
            </figure>
          ))}
          {!draft && (
            <button className="wl-treasure-add" onClick={pickFile} disabled={busy}>
              <Glyph id="camera" size={22} />
              <span>{busy ? 'Reading…' : 'Add treasure'}</span>
            </button>
          )}
        </div>
        <input ref={fileRef} type="file" accept="image/*" onChange={onFile} style={{ display: 'none' }} />

        {draft && (
          <div className="wl-treasure-draft">
            <img src={draft.image} alt="new treasure" />
            <textarea className="wl-note" rows={2} value={draft.desc} placeholder="What is this? Why does it matter?"
              onChange={(e) => setDraft({ ...draft, desc: e.target.value })} />
            <div className="wl-modal-actions">
              <button className="wl-btn ghost" onClick={() => setDraft(null)}>Discard</button>
              <div style={{ flex: 1 }} />
              <button className="wl-btn primary" onClick={saveTreasure}>Save treasure</button>
            </div>
          </div>
        )}

        <div className="wl-modal-actions" style={{ marginTop: 18 }}>
          <div style={{ flex: 1 }} />
          <button className="wl-btn ghost" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  )
}

// ── The tab ────────────────────────────────────────────────────
export default function BloomWellness({
  checkins, persistCheckins,
  effects, persistEffects,
  episodes, persistEpisodes,
  game, persistGame,
  treasures = [], persistTreasures,
  emotionPrefs, persistEmotionPrefs,
  log = [],
}) {
  const today = dayKey()

  // Live "now" tick so active-effect timers (and the day cloud's proportions)
  // stay current while the tab is open.
  const [, setTick] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setTick(n => n + 1), 30000)
    return () => clearInterval(t)
  }, [])

  // A day can hold several timestamped moments; this is today's, and the
  // time-proportional blend that drives the end-of-day cloud.
  const todayMoments = useMemo(() => checkinsForDay(checkins, today), [checkins, today])
  const daySeg = useMemo(() => daySegments(checkins, today), [checkins, today])
  const todayWeights = useMemo(() => emotionWeights(checkins, today), [checkins, today])
  // Past days that have any check-in (the "sky journal"), newest first.
  const journal = useMemo(() => pastDayKeys(checkins, 21).filter(k => k !== today), [checkins, today])
  const [openDate, setOpenDate] = useState(null)   // day whose detail sheet is open

  // ── Check-in draft (a new moment each time) ──────────────────
  const [mood, setMood] = useState(null)
  const [energy, setEnergy] = useState(null)
  const [emotionsSel, setEmotionsSel] = useState([])
  const [note, setNote] = useState('')
  // Start in the picker when nothing's logged yet today; otherwise show the day
  // cloud and let the user add another moment.
  const [editing, setEditing] = useState(todayMoments.length === 0)
  useEffect(() => { if (todayMoments.length === 0) setEditing(true) }, [todayMoments.length])

  const toggleEmotion = (id) => setEmotionsSel(prev => prev.includes(id) ? prev.filter(x => x !== id) : (prev.length < 4 ? [...prev, id] : prev))

  const [reward, setReward] = useState(null)   // { earned, leveledTo } toast
  const checkInBtn = useRef(null)

  const submitCheckIn = () => {
    if (!mood) return
    const entry = {
      id: 'ci-' + Date.now().toString(36),
      date: today, mood, energy: energy || 3,
      emotions: emotionsSel, note: note.trim(), ts: new Date().toISOString(),
    }
    persistCheckins([...(checkins || []), entry])
    // First moment of the day pays the full check-in (streak + reflection);
    // later moments give a small "extra moment" nudge, lightly capped.
    if (todayMoments.length === 0) {
      const res = applyCheckIn(game, { key: today, hasReflection: entry.note.length > 0 })
      persistGame(res.game)
      setReward({ earned: res.earned, leveledTo: res.leveledTo })
    } else if (todayMoments.length < 5) {
      persistGame(awardPetals(game, 3))
      setReward({ earned: 3, leveledTo: null })
    }
    if (checkInBtn.current) bloomBurst(checkInBtn.current)
    setTimeout(() => setReward(null), 4200)
    setMood(null); setEnergy(null); setEmotionsSel([]); setNote('')
    setEditing(false)
  }

  // ── Status effects ───────────────────────────────────────────
  const effectList = (effects && effects.length) ? effects : DEFAULT_EFFECTS
  const [editor, setEditor] = useState(null)     // draft for the create/edit sheet
  const [share, setShare] = useState(false)

  const toggleEffect = (effectId) => {
    const wasActive = isActive(episodes, effectId)
    persistEpisodes(toggleEpisode(episodes, effectId))
    // A small nudge-reward the first time each condition is turned on today, to
    // reinforce the self-awareness habit (never for turning one off).
    if (!wasActive) persistGame(awardPetals(game, REWARDS.logEffect))
  }
  const openNew = () => setEditor(makeEffect({ name: '', kind: 'physical', color: EFFECT_COLORS[3], icon: 'sparkle' }))
  const openEdit = (fx) => setEditor({ ...fx })
  const saveEditor = () => {
    const base = (effects && effects.length) ? effects : DEFAULT_EFFECTS
    const exists = base.some(f => f.id === editor.id)
    const next = exists ? base.map(f => f.id === editor.id ? editor : f) : [...base, editor]
    persistEffects(next)
    setEditor(null)
  }
  const deleteEditor = () => {
    const base = (effects && effects.length) ? effects : DEFAULT_EFFECTS
    // Hide rather than remove, so any episode already tagged with this condition
    // still resolves (its name/colour) on the rail and in past-day detail.
    persistEffects(base.map(f => f.id === editor.id ? { ...f, hidden: true } : f))
    setEditor(null)
  }

  // ── Emotions palette (add / delete / recolour) ───────────────
  const emotionOptions = useMemo(() => selectableEmotions(), [emotionPrefs])
  const addEmotion = (name, color) => {
    const nm = (name || '').trim()
    if (!nm) return
    const prefs = emotionPrefs || { custom: [], hidden: [] }
    if (emotionOptions.some(e => e.name.toLowerCase() === nm.toLowerCase())) return
    persistEmotionPrefs?.({ custom: [...(prefs.custom || []), makeEmotion(nm, color)], hidden: prefs.hidden || [] })
  }
  const deleteEmotion = (id) => {
    const prefs = emotionPrefs || { custom: [], hidden: [] }
    persistEmotionPrefs?.({ custom: prefs.custom || [], hidden: [...new Set([...(prefs.hidden || []), id])] })
  }

  const activeNow = effectList.filter(fx => isActive(episodes, fx.id))
    .map(fx => ({ fx, since: episodeMinutes(activeEpisode(episodes, fx.id)) }))
  const physical = effectList.filter(f => f.kind !== 'mental' && !f.hidden)
  const mental = effectList.filter(f => f.kind === 'mental' && !f.hidden)

  // ── Game/companion derived ───────────────────────────────────
  const lv = levelFromXp(game?.xp || 0)
  const stage = stageForLevel(lv.level)
  const next = nextStage(lv.level)
  const streak = liveStreak(game)
  const trend = useMemo(() => moodTrend(checkins, 14), [checkins])
  const trackedDays = useMemo(() => new Set((checkins || []).map(c => c.date)).size, [checkins])

  // ── Insights ─────────────────────────────────────────────────
  const { insights } = useMemo(
    () => computeInsights({ records: buildDailyRecords({ checkins, episodes, log, effects: effectList, windowDays: 60 }), effects: effectList }),
    [checkins, episodes, log, effectList],
  )
  const totals = useMemo(() => effectTotals(episodes), [episodes])

  const story = editing
    ? 'A quiet moment for yourself. How are you, really?'
    : streak >= 3
      ? `${streak} days in a row — ${stage.name} is thriving on your consistency.`
      : `${stage.name} is glad you came back.`

  return (
    <div className="wl-wrap">
      {/* ── Companion + progress ── */}
      <section className="wl-hero">
        <ProgressRing pct={lv.pct}>
          <div className="wl-companion" title={`${stage.name} · level ${lv.level}`}>
            <Companion level={lv.level} mood={daySeg.overall} size={104} />
          </div>
        </ProgressRing>
        <div className="wl-hero-body">
          <div className="wl-hero-top">
            <div>
              <div className="serif wl-hero-name">{game?.companionName || 'Sprout'}</div>
              <div className="wl-hero-sub">Level {lv.level} · {stage.name}</div>
            </div>
            <button className="wl-share-btn" onClick={() => setShare(true)} title="Share your progress">
              <Glyph id="gift" size={16} /> Share
            </button>
          </div>
          <div className="wl-chips">
            <span className="wl-stat"><Glyph id="flame" size={15} /> {streak}<i>streak</i></span>
            <span className="wl-stat"><Glyph id="flower" size={15} /> {game?.petals || 0}<i>petals</i></span>
            <span className="wl-stat"><Glyph id="calendar" size={15} /> {trackedDays}<i>days</i></span>
          </div>
          <div className="wl-story">{story}{next && !editing ? ` ${next.level - lv.level} level${next.level - lv.level > 1 ? 's' : ''} to ${next.name}.` : ''}</div>
        </div>
      </section>

      {/* ── Today's check-in ── */}
      <section className="wl-card">
        <div className="wl-card-head">
          <h3 className="serif">{editing ? (todayMoments.length ? 'Another moment' : 'How are you?') : 'Today'}</h3>
          {!editing && <button className="wl-link" onClick={() => setEditing(true)}>+ Check in</button>}
          {editing && todayMoments.length > 0 && <button className="wl-link" onClick={() => setEditing(false)}>Cancel</button>}
        </div>

        {editing ? (
          <>
            <div className="wl-ask">Which cloud are you?</div>
            <div className="wl-moods">
              {MOODS.map(m => (
                <button key={m.v} className={`wl-mood ${mood === m.v ? 'on' : ''}`}
                  onClick={() => setMood(m.v)} style={mood === m.v ? { borderColor: m.color, background: m.color + '1A' } : {}}>
                  <span className="wl-mood-face"><MoodCloud v={m.v} size={38} animate={mood === m.v} /></span>
                  <span className="wl-mood-label">{m.label}</span>
                </button>
              ))}
            </div>

            <div className="wl-ask">Any complex feelings? <span className="wl-optional">the cloud's lining · up to 4</span></div>
            <EmotionPicker options={emotionOptions} selected={emotionsSel}
              onToggle={toggleEmotion} onAdd={addEmotion} onDelete={deleteEmotion} />

            {/* Live preview — your cloud forming, with its emotion lining shimmering. */}
            {mood && (
              <div className="wl-preview">
                <span className="wl-bob"><MoodCloud v={mood} emotions={emotionsSel} size={92} animate /></span>
                <div className="wl-preview-cap">
                  {moodMeta(mood).label}
                  {emotionsSel.length ? ' · ' + emotionsSel.map(id => emotionMeta(id)?.name).filter(Boolean).join(', ') : ''}
                </div>
              </div>
            )}

            <div className="wl-ask">Energy?</div>
            <div className="wl-energy">
              {ENERGY.map(e => (
                <button key={e.v} className={`wl-energy-bar ${energy && energy >= e.v ? 'on' : ''}`}
                  onClick={() => setEnergy(e.v)} title={e.label} style={{ height: 14 + e.v * 7 }} />
              ))}
              <span className="wl-energy-label">{energy ? ENERGY[energy - 1].label : ''}</span>
            </div>

            <div className="wl-ask">{promptForDay(today)} <span className="wl-optional">optional</span></div>
            <textarea className="wl-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)}
              placeholder="A line for future-you…" />

            <button ref={checkInBtn} className="wl-btn primary block" disabled={!mood} onClick={submitCheckIn}>
              {todayMoments.length ? 'Add this moment' : 'Check in'}
              {mood ? ` · +${todayMoments.length ? 3 : REWARDS.checkIn + (note.trim() ? REWARDS.reflection : 0)} petals` : ''}
            </button>
          </>
        ) : (
          <>
            {/* The day cloud floating in an alien sky. */}
            <div className="wl-sky">
              <AlienSky className="wl-sky-bg" />
              <div className="wl-sky-title">
                {daySeg.count > 1
                  ? `${daySeg.count} moments today`
                  : `Feeling ${moodMeta(daySeg.dominant).label.toLowerCase()}`}
              </div>
              <button className="wl-sky-cloud wl-float" onClick={() => setOpenDate(today)} title="See today's details" aria-label="Open today's cloud details">
                <DayCloud segments={daySeg.segments} emotions={daySeg.emotions} weights={todayWeights} dominant={daySeg.dominant} faceMood={daySeg.overall} size={128} animate />
              </button>
            </div>

            {/* Proportional legend: how much of the day each mood coloured. */}
            <div className="wl-day-legend">
              {daySeg.props.map(p => (
                <span key={p.v} className="wl-legend-item">
                  <span className="wl-legend-dot" style={{ background: moodMeta(p.v).color }} />
                  {moodMeta(p.v).label} {Math.round(p.pct * 100)}%
                </span>
              ))}
            </div>
            {daySeg.emotions.length > 0 && (
              <div className="wl-day-linings">
                {daySeg.emotions.map(id => {
                  const e = emotionMeta(id); if (!e) return null
                  return <span key={id} className="wl-lining-chip" style={{ borderColor: e.color, color: '#4A5560' }}>
                    <span className="wl-emo-dot" style={{ background: e.color }} />{e.name}
                  </span>
                })}
              </div>
            )}

            {/* Each moment logged today. */}
            <div className="wl-moments">
              {todayMoments.map(m => (
                <div key={m.id || m.ts} className="wl-moment">
                  <MoodCloud v={m.mood} emotions={m.emotions} size={40} />
                  <div className="wl-moment-body">
                    <div className="wl-moment-top">
                      <span className="wl-moment-mood">{moodMeta(m.mood).label}</span>
                      <span className="wl-moment-time">{clockTime(m.ts)}</span>
                    </div>
                    {(m.emotions && m.emotions.length > 0) && (
                      <div className="wl-moment-emos">{m.emotions.map(id => emotionMeta(id)?.name).filter(Boolean).join(' · ')}</div>
                    )}
                    {m.note && <div className="wl-moment-note">“{m.note}”</div>}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {trend.some(t => t.mood != null) && (
          <div className="wl-trend">
            <div className="wl-trend-head"><span>Mood · last 14 days</span></div>
            <Sparkline points={trend} />
          </div>
        )}
      </section>

      {/* ── Past skies (the cloud journal) ── */}
      {journal.length > 0 && (
        <section className="wl-card">
          <div className="wl-card-head"><h3 className="serif">Past skies</h3></div>
          <p className="wl-card-sub">Every day becomes a cloud. Tap one to revisit its moments, feelings and treasures.</p>
          <div className="wl-journal">
            {journal.map(key => {
              const seg = daySegments(checkins, key)
              const w = emotionWeights(checkins, key)
              const hasTreasure = treasures.some(t => t.date === key)
              return (
                <button key={key} className="wl-journal-day" onClick={() => setOpenDate(key)}>
                  <span className="wl-journal-cloud">
                    <DayCloud segments={seg.segments} emotions={seg.emotions} weights={w} dominant={seg.dominant}
                      face={false} size={74} animate={false} twinkle={false} mist={20} />
                    {hasTreasure && <span className="wl-journal-gem"><Glyph id="camera" size={11} color="#fff" /></span>}
                  </span>
                  <span className="wl-journal-date">{keyToDate(key).toLocaleDateString('en-US', { weekday: 'short' })}<b>{keyToDate(key).getDate()}</b></span>
                </button>
              )
            })}
          </div>
        </section>
      )}

      {/* ── Active now ── */}
      {activeNow.length > 0 && (
        <section className="wl-active">
          <div className="wl-active-head"><Glyph id="pulse" size={16} /> Active right now</div>
          <div className="wl-active-list">
            {activeNow.map(({ fx, since }) => (
              <button key={fx.id} className="wl-active-pill" style={{ background: fx.color, color: iconColorOn(fx.color) }} onClick={() => toggleEffect(fx.id)}>
                <Glyph id={fx.icon} size={14} color={iconColorOn(fx.color)} /> {fx.name}
                <b>{fmtDuration(since)}</b>
                <span className="wl-active-x">✕</span>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* ── Status effects (conditions) ── */}
      <section className="wl-card">
        <div className="wl-card-head">
          <h3 className="serif">Status effects</h3>
          <button className="wl-link" onClick={openNew}>+ New</button>
        </div>
        <p className="wl-card-sub">Flip a condition on when it starts and off when it lifts — Bloom records how long each one lasts, like a status effect you can toggle.</p>

        <div className="wl-fx-group-label"><Glyph id="pulse" size={14} /> Physical</div>
        <div className="wl-fx-grid">
          {physical.map(fx => (
            <EffectChip key={fx.id} effect={fx} active={isActive(episodes, fx.id)}
              since={isActive(episodes, fx.id) ? episodeMinutes(activeEpisode(episodes, fx.id)) : 0}
              onToggle={() => toggleEffect(fx.id)} onEdit={() => openEdit(fx)} />
          ))}
        </div>

        <div className="wl-fx-group-label"><Glyph id="brain" size={14} /> Mental</div>
        <div className="wl-fx-grid">
          {mental.map(fx => (
            <EffectChip key={fx.id} effect={fx} active={isActive(episodes, fx.id)}
              since={isActive(episodes, fx.id) ? episodeMinutes(activeEpisode(episodes, fx.id)) : 0}
              onToggle={() => toggleEffect(fx.id)} onEdit={() => openEdit(fx)} />
          ))}
        </div>
      </section>

      {/* ── Patterns & insights ── */}
      <section className="wl-card">
        <div className="wl-card-head"><h3 className="serif">Patterns</h3></div>
        {insights.length === 0 ? (
          <p className="wl-empty">
            Keep checking in and toggling conditions for a couple of weeks — once there's
            enough history, Bloom starts surfacing how your mood, energy, conditions and
            finished tasks relate to one another.
          </p>
        ) : (
          <div className="wl-insights">
            {insights.slice(0, 8).map(ins => (
              <div key={ins.id} className={`wl-insight ${ins.good ? 'good' : ins.strength < 0 ? 'watch' : ''}`}>
                <span className="wl-insight-dot" />
                <span className="wl-insight-text">{ins.text}</span>
              </div>
            ))}
          </div>
        )}

        {/* Condition time totals — the "how long have I felt this" ledger. */}
        {totals.size > 0 && (
          <div className="wl-totals">
            <div className="wl-totals-head">Tracked time by condition</div>
            {effectList.filter(f => totals.get(f.id)).map(f => {
              const t = totals.get(f.id)
              return (
                <div key={f.id} className="wl-total-row">
                  <span className="wl-total-name"><span className="wl-total-swatch" style={{ background: f.color }} /> {f.name}</span>
                  <span className="wl-total-val">{fmtDuration(t.mins)} · {t.count}×</span>
                </div>
              )
            })}
          </div>
        )}
      </section>

      <p className="wl-footer">Bloom's wellness tools are for reflection and self-awareness, not a substitute for professional care. If you're struggling, reach out to someone you trust.</p>

      {/* ── Reward toast ── */}
      {reward && (
        <div className="wl-reward">
          <Glyph id="flower" size={16} color="#FBE79E" />
          {reward.leveledTo ? ` Level ${reward.leveledTo}! ` : ' '}+{reward.earned} petals
        </div>
      )}

      {editor && (
        <EffectEditor draft={editor} onChange={setEditor} onSave={saveEditor}
          onDelete={deleteEditor} onClose={() => setEditor(null)} />
      )}
      {share && <ShareSheet game={game} tracked={trackedDays} stage={stage} onClose={() => setShare(false)} />}
      {openDate && (
        <DayDetail date={openDate} checkins={checkins} episodes={episodes} effects={effectList} log={log}
          treasures={treasures}
          onAddTreasure={(t) => persistTreasures([t, ...treasures])}
          onDeleteTreasure={(id) => persistTreasures(treasures.filter(x => x.id !== id))}
          onClose={() => setOpenDate(null)} />
      )}
    </div>
  )
}
