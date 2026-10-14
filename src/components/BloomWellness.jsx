// src/components/BloomWellness.jsx
// ─────────────────────────────────────────────────────────────
// The Wellness tab. One scene at the top — your companion standing under
// today's sky, with today's cloud floating beside it and your level, streak and
// petals in the corner — then three views so the tab is a few screens you can
// take in rather than one long scroll:
//   • Today        check in (a new moment each time), read today back, and see
//                  which conditions are running right now;
//   • Journal      six weeks of clouds laid out as a calendar, the mood and
//                  energy chart over the chosen timeframe, the patterns Bloom
//                  has noticed, and the rule for when you go quiet;
//   • Conditions   the status-effect tiles you flip on and off, and how long
//                  each one held you over the chosen timeframe.
// Nothing on the tab is a running total: the chart and the ledger read the
// same timeframe the Insights tab does (the past 7 days unless you set
// another — see lib/timeframe.js), and the scene counts this week's check-ins.
// The game/analysis logic is all in lib/wellness.js; this file only lays it out
// and persists through the callbacks App.jsx hands it.
// ─────────────────────────────────────────────────────────────
import { useState, useMemo, useRef, useEffect } from 'react'
import { Glyph, iconColorOn } from '../lib/glyphs.jsx'
import { Companion, MoodCloud, DayCloud, AlienSky } from '../lib/critters.jsx'
import ColorPickRow from './ColorPickRow.jsx'
import { EffectIcon } from './IconPicker.jsx'
import IconSearchSheet from './IconSearchSheet.jsx'
import Segmented, { useRememberedView } from './Segmented.jsx'
import { useTimeframe, TimeframePicker } from './Timeframe.jsx'
import { shiftKey } from '../lib/timeframe.js'
import MoodChart from './MoodChart.jsx'
import { bloomBurst } from '../lib/bloom.js'
import { PhotoStrip, PhotoPicker, PhotoAttacher } from './PhotoAttach.jsx'
import TimeField from './TimeField.jsx'
import { photoIds, savePhotos, MAX_PHOTOS } from '../lib/photos.js'
import {
  HOUR_CHOICES, normalizeRule, wakingMinutes,
} from '../lib/absence.js'
import {
  dayKey, keyToDate, MOODS, ENERGY, moodMeta, promptForDay,
  selectableEmotions, emotionMeta, makeEmotion, EMOTION_PALETTE, checkinsForDay, daySegments, emotionWeights, effectOnDay,
  stageForLevel, nextStage, levelFromXp, liveStreak, applyCheckIn, awardPetals, REWARDS,
  DEFAULT_EFFECTS, POSITIVE_EFFECTS, makeEffect, EFFECT_COLORS,
  activeEpisode, isActive, toggleEpisode, patchEpisode, episodeMinutes, fmtDuration,
  INTENSITY_MAX, intensityColor,
  buildDailyRecords, computeInsights, moodSeriesBetween, effectTotalsBetween, calendarWeeks, shareText,
} from '../lib/wellness.js'

// The theme's deep surface colour, read live from the variable the theme sets,
// so the sky in the scene is tinted toward whichever look is on.
function themeDeep() {
  try { return getComputedStyle(document.documentElement).getPropertyValue('--forest').trim() || '#2A4858' } catch { return '#2A4858' }
}

const VIEWS = [
  { id: 'today',      label: 'Today',      glyph: 'sun' },
  { id: 'journal',    label: 'Journal',    glyph: 'calendar' },
  { id: 'conditions', label: 'Conditions', glyph: 'pulse' },
]

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
        <EffectIcon icon={effect.icon} size={18} />
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
  const [pickIcon, setPickIcon] = useState(false)
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
        <button className="wl-iconpick" onClick={() => setPickIcon(true)}>
          <span className="wl-iconpick-ico" style={{ background: draft.color, color: iconColorOn(draft.color) }}><EffectIcon icon={draft.icon} size={20} /></span>
          <span>Choose an icon…</span>
        </button>
        {pickIcon && (
          <IconSearchSheet icon={draft.icon} tint={draft.color}
            onPick={(v) => onChange({ ...draft, icon: v })} onClose={() => setPickIcon(false)} />
        )}

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
            <div><b><Glyph id="flame" size={16} /> {liveStreak(game)}</b><span>days in a row</span></div>
            <div><b><Glyph id="flower" size={16} /> {game?.petals || 0}</b><span>petals</span></div>
            <div><b><Glyph id="chart" size={16} /> {tracked}/7</b><span>past 7 days</span></div>
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
  // Each condition that touched this day, carrying the worst intensity it was
  // rated at while it ran — the journal is where a day gets read back before an
  // appointment, so "migraine" alone is not enough; "migraine, 8/10" is.
  const conditions = (effects || []).filter(fx => effectOnDay(episodes, fx.id, date)).map(fx => {
    const rated = (episodes || [])
      .filter(e => e.effectId === fx.id && e.intensity > 0 && effectOnDay([e], fx.id, date))
      .map(e => e.intensity)
    return { ...fx, peak: rated.length ? Math.max(...rated) : null }
  })
  // The condition spans that touched this day and carry a photo, so a rash or a
  // swelling logged with the episode is visible from the journal too.
  const conditionPics = (episodes || [])
    .filter(e => photoIds(e).length > 0 && effectOnDay([e], e.effectId, date))
    .map(e => ({ id: e.id, fx: (effects || []).find(f => f.id === e.effectId), note: e.note, photos: photoIds(e) }))
    .filter(e => e.fx)
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
                <PhotoStrip ids={photoIds(m)} className="wl-moment-photos" />
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
                  {fx.peak > 0 && <b className="wl-chip-int" style={{ color: intensityColor(fx.peak) }}>{fx.peak}/{INTENSITY_MAX}</b>}
                </span>
              ))}
              {tasks.slice(0, 12).map((t, i) => (
                <span key={i} className="wl-event-chip"><Glyph id="check" size={12} color="var(--teal)" /> {t.label}</span>
              ))}
            </div>
          </>
        )}

        {/* Photos attached to a condition while it was running */}
        {conditionPics.length > 0 && (
          <>
            <label className="wl-field-label">Condition photos</label>
            {conditionPics.map(c => (
              <div key={c.id} className="wl-fx-photos">
                <span className="wl-lining-chip" style={{ borderColor: c.fx.color, color: '#4A5560' }}>
                  <span className="wl-emo-dot" style={{ background: c.fx.color }} /> {c.fx.name}
                </span>
                <PhotoStrip ids={c.photos} />
              </div>
            ))}
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
// ── "When I go quiet" — the rule behind the blob's catch-up nudge ──
// A mood tracker only ever hears from the days you were well enough to open
// it. This is the setting that fixes that: how long you can be away before the
// blob asks what the silence was like, and writes your answer onto the days you
// missed rather than onto today.
//
// The night window is the part that makes it usable. Measured in plain elapsed
// time, "8 hours away" is just a normal night's sleep, and a nudge that fires
// every single morning is one you stop reading. Only waking hours count, so the
// threshold means what it says. The preview line below spells that out with the
// user's own numbers rather than asking them to take it on trust.
function QuietRule({ rule, onChange }) {
  const r = normalizeRule(rule)
  const set = (patch) => onChange?.({ ...r, ...patch })

  // Last night, through this rule: the clearest possible answer to "will this
  // pester me every morning?"
  const preview = useMemo(() => {
    const from = new Date(); from.setDate(from.getDate() - 1); from.setHours(22, 0, 0, 0)
    const to = new Date(from); to.setDate(to.getDate() + 1); to.setHours(9, 0, 0, 0)
    const mins = wakingMinutes(from.getTime(), to.getTime(), r)
    return { mins, asks: mins >= r.hours * 60 }
  }, [r.skipSleep, r.sleepStart, r.sleepEnd, r.hours])

  // Folded by default: a setting you touch once, read back in one line.
  const [open, setOpen] = useState(false)
  const hoursLabel = r.hours >= 24 && r.hours % 24 === 0 ? `${r.hours / 24} day${r.hours === 24 ? '' : 's'}` : `${r.hours}h`
  const summary = r.enabled
    ? `Asks after ${hoursLabel} away${r.skipSleep ? ' · nights don\u2019t count' : ''}`
    : 'Off \u2014 Bloom won\u2019t ask about days away'

  return (
    <section className={`wl-card wl-rule ${open ? 'open' : ''}`}>
      <button type="button" className="wl-rule-head" onClick={() => setOpen(o => !o)} aria-expanded={open}>
        <span className="wl-rule-ico"><Glyph id="moon" size={16} /></span>
        <span className="wl-rule-title">
          <h3 className="serif">When I go quiet</h3>
          <span className="wl-rule-sum">{summary}</span>
        </span>
        <span className={`in-chevron ${open ? 'open' : ''}`} aria-hidden="true">›</span>
      </button>

      {open && (
      <>
      <div className="wl-rule-intro">
        <p className="wl-card-sub" style={{ margin: 0 }}>
          The days worth recording are often the ones you don't open anything. Come back after a long
          stretch away and the blob will ask how it was — then write your answer onto the days it covered,
          at the hours they really happened.
        </p>
        <button type="button" className={`wl-rule-toggle ${r.enabled ? 'on' : ''}`} onClick={() => set({ enabled: !r.enabled })} role="switch" aria-checked={r.enabled}>
          {r.enabled ? 'On' : 'Off'}
        </button>
      </div>

      {r.enabled ? (
        <>
          <div className="wl-rule-ask">Ask me after I've been away this long</div>
          <div className="wl-rule-chips">
            {HOUR_CHOICES.map(h => (
              <button key={h} className={`wl-rule-chip ${r.hours === h ? 'on' : ''}`} onClick={() => set({ hours: h })}>
                {h >= 24 && h % 24 === 0 ? `${h / 24}d` : `${h}h`}
              </button>
            ))}
          </div>

          <div className="wl-rule-ask">
            Sleeping isn't being away
            <button className={`wl-rule-toggle ${r.skipSleep ? 'on' : ''}`} onClick={() => set({ skipSleep: !r.skipSleep })}
              role="switch" aria-checked={r.skipSleep}>
              {r.skipSleep ? 'Skipping nights' : 'Counting nights'}
            </button>
          </div>
          {r.skipSleep && (
            <div className="wl-rule-night">
              <div className="wl-rule-field">
                <span>My night starts</span>
                <TimeField value={r.sleepStart} onChange={v => set({ sleepStart: v })} style={ruleTimeStyle} aria-label="Night starts" />
              </div>
              <div className="wl-rule-field">
                <span>and ends</span>
                <TimeField value={r.sleepEnd} onChange={v => set({ sleepEnd: v })} style={ruleTimeStyle} aria-label="Night ends" />
              </div>
            </div>
          )}
          <div className={`wl-rule-preview ${preview.asks ? 'warn' : ''}`}>
            {preview.asks
              ? `Heads up: closing at 10pm and opening at 9am would count as ${fmtDuration(preview.mins)} away — so an ordinary night would set this off.`
              : `Closing at 10pm and opening at 9am counts as ${fmtDuration(preview.mins)} away, well under ${r.hours}h — an ordinary night stays quiet.`}
          </div>

          <button className={`wl-rule-toggle block ${r.askConditions ? 'on' : ''}`} onClick={() => set({ askConditions: !r.askConditions })}
            role="switch" aria-checked={r.askConditions}>
            {r.askConditions ? '✓ ' : ''}Also ask which conditions I was carrying
          </button>
          <div className="wl-rule-foot">
            Answering writes a mood across every day the stretch covered, and any condition you name as the
            one long span it was. Saying no thanks closes that question for good — it won't come back tomorrow.
          </div>
        </>
      ) : (
        <div className="wl-rule-foot">Bloom won't ask about the days you were away. You can still fill any of them in yourself from the rewind clock on the day rail.</div>
      )}
      </>
      )}
    </section>
  )
}
const ruleTimeStyle = { border: '1.5px solid var(--border)', borderRadius: 11, padding: '8px 10px', fontSize: 13, fontFamily: 'inherit', background: '#fff', color: 'var(--text)', boxSizing: 'border-box', width: '100%' }


// ── The journal calendar ───────────────────────────────────────
// Six weeks of days (twelve, if you ask), Monday first, each one the cloud it
// became. Tap a day to open it. Empty past days keep a faint ring so a gap in
// the record reads as a gap, not as nothing having happened.
function CloudCalendar({ checkins, treasures, episodes, weeks, today, onOpen }) {
  const rows = useMemo(() => calendarWeeks(weeks, today), [weeks, today])
  const hasPics = (key) => treasures.some(t => t.date === key)
    || checkins.some(c => c.date === key && photoIds(c).length > 0)
    || (episodes || []).some(e => photoIds(e).length > 0 && effectOnDay([e], e.effectId, key))
  return (
    <div className="wl-cal" role="grid" aria-label="Past days">
      <div className="wl-cal-dow" aria-hidden="true">{['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => <span key={i}>{d}</span>)}</div>
      {rows.map((row, ri) => (
        <div key={ri} className="wl-cal-row" role="row">
          {row.map(d => {
            if (d.future) return <span key={d.key} className="wl-cal-day future" role="gridcell" aria-hidden="true" />
            const seg = daySegments(checkins, d.key)
            const w = seg.count ? emotionWeights(checkins, d.key) : null
            const label = d.first ? keyToDate(d.key).toLocaleDateString('en-US', { month: 'short' }) : d.day
            return (
              <button key={d.key} type="button" role="gridcell"
                className={`wl-cal-day ${seg.count ? 'has' : ''} ${d.key === today ? 'today' : ''}`}
                onClick={() => onOpen(d.key)} aria-label={`${keyToDate(d.key).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}${seg.count ? `, ${moodMeta(seg.dominant).label.toLowerCase()}` : ', nothing logged'}`}>
                <span className="wl-cal-cloud">
                  {seg.count
                    ? <DayCloud segments={seg.segments} emotions={seg.emotions} weights={w} dominant={seg.dominant} face={false} size={34} animate={false} twinkle={false} mist={10} />
                    : <span className="wl-cal-blank" />}
                  {hasPics(d.key) && <span className="wl-cal-pip" />}
                </span>
                <span className={`wl-cal-num ${d.first ? 'first' : ''}`}>{label}</span>
              </button>
            )
          })}
        </div>
      ))}
    </div>
  )
}

export default function BloomWellness({
  checkins, persistCheckins,
  effects, persistEffects,
  episodes, persistEpisodes,
  game, persistGame,
  treasures = [], persistTreasures,
  emotionPrefs, persistEmotionPrefs,
  rules, persistRules,
  log = [],
  onOpenInsights,
}) {
  const today = dayKey()
  const [view, setView] = useRememberedView('bloom_wellness_view', 'today', VIEWS.map(v => v.id))
  const tf = useTimeframe()

  // Live "now" tick so active-effect timers (and the day cloud's proportions)
  // stay current while the tab is open.
  const [, setTick] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setTick(n => n + 1), 30000)
    return () => clearInterval(t)
  }, [])

  // A day can hold several timestamped moments; this is today's, and the
  // time-proportional blend that drives the day cloud in the scene.
  const todayMoments = useMemo(() => checkinsForDay(checkins, today), [checkins, today])
  const daySeg = useMemo(() => daySegments(checkins, today), [checkins, today])
  const todayWeights = useMemo(() => emotionWeights(checkins, today), [checkins, today])
  const [openDate, setOpenDate] = useState(null)   // day whose detail sheet is open

  // ── Check-in draft (a new moment each time) ──────────────────
  const [mood, setMood] = useState(null)
  const [energy, setEnergy] = useState(null)
  const [emotionsSel, setEmotionsSel] = useState([])
  const [note, setNote] = useState('')
  const [photos, setPhotos] = useState([])   // data URLs; written as their own rows on submit
  // Start in the picker when nothing's logged yet today; otherwise show the
  // day's record and let the user add another moment.
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
      emotions: emotionsSel, note: note.trim(), photos: savePhotos(photos),
      ts: new Date().toISOString(),
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
    setMood(null); setEnergy(null); setEmotionsSel([]); setNote(''); setPhotos([])
    setEditing(false)
  }

  // ── Conditions (status effects) ──────────────────────────────
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
    .map(fx => ({ fx, ep: activeEpisode(episodes, fx.id), since: episodeMinutes(activeEpisode(episodes, fx.id)) }))
  const physical = effectList.filter(f => f.kind !== 'mental' && !f.hidden)
  const mental = effectList.filter(f => f.kind === 'mental' && !f.hidden)

  // ── Game/companion derived ───────────────────────────────────
  const lv = levelFromXp(game?.xp || 0)
  const stage = stageForLevel(lv.level)
  const next = nextStage(lv.level)
  const streak = liveStreak(game)
  // How many of the last seven days have a check-in — the scene's third chip
  // and the share card both say this, never an all-time count.
  const weekDays = useMemo(() => {
    const from = shiftKey(today, -6)
    return new Set((checkins || []).filter(c => c.date >= from && c.date <= today).map(c => c.date)).size
  }, [checkins, today])

  // ── Journal derived ──────────────────────────────────────────
  const [weeks, setWeeks] = useState(6)
  const series = useMemo(() => moodSeriesBetween(checkins, tf.from, tf.to), [checkins, tf.from, tf.to])
  const { insights } = useMemo(
    () => computeInsights({ records: buildDailyRecords({ checkins, episodes, log, effects: effectList, windowDays: 60 }), effects: effectList }),
    [checkins, episodes, log, effectList],
  )
  const totals = useMemo(() => effectTotalsBetween(episodes, tf.from, tf.to), [episodes, tf.from, tf.to])
  const ledger = effectList.filter(f => totals.get(f.id)).map(f => ({ fx: f, ...totals.get(f.id) })).sort((a, b) => b.mins - a.mins)
  const ledgerMax = ledger.reduce((m, r) => Math.max(m, r.mins), 1)

  const story = editing
    ? 'A quiet moment for yourself. How are you, really?'
    : streak >= 3
      ? `${streak} days in a row — ${stage.name} is thriving on your consistency.`
      : `${stage.name} is glad you came back.`
  const toNext = next ? ` · ${next.level - lv.level} level${next.level - lv.level > 1 ? 's' : ''} to ${next.name}` : ''

  // The record of today, read back under the scene once there's a moment.
  const todayRecord = (
    <>
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
              <PhotoStrip ids={photoIds(m)} className="wl-moment-photos" />
            </div>
          </div>
        ))}
      </div>
    </>
  )

  const activeBanner = activeNow.length > 0 && (
    <section className="wl-active">
      <div className="wl-active-head">
        <span><Glyph id="pulse" size={16} /> Active right now</span>
        {view !== 'conditions' && <button type="button" className="wl-link sm" onClick={() => setView('conditions')}>All conditions ›</button>}
      </div>
      <div className="wl-active-list">
        {activeNow.map(({ fx, ep, since }) => (
          <div key={fx.id} className="wl-active-item">
            <button type="button" className="wl-active-pill" style={{ background: fx.color, color: iconColorOn(fx.color) }} onClick={() => toggleEffect(fx.id)} title="Tap to end">
              <EffectIcon icon={fx.icon} size={14} color={iconColorOn(fx.color)} /> {fx.name}
              <b>{fmtDuration(since)}</b>
              <span className="wl-active-x">✕</span>
            </button>
            {/* A condition flipped on from this tab never passed through the
                rail's sheet, so this is where it gets a photo — straight onto
                the span that's running. */}
            {ep && (
              <PhotoAttacher ids={photoIds(ep)}
                onChange={next => persistEpisodes(patchEpisode(episodes, ep.id, { photos: next }))} />
            )}
          </div>
        ))}
      </div>
    </section>
  )

  return (
    <div className="wl-wrap">
      {/* ── The scene: companion, today's cloud, level & stats ── */}
      <section className="wl-scene">
        <AlienSky className="wl-scene-bg" tint={themeDeep()} />
        <div className="wl-scene-top">
          <div className="wl-scene-id">
            <div className="serif wl-scene-name">{game?.companionName || 'Sprout'}</div>
            <div className="wl-scene-sub">Level {lv.level} · {stage.name}{toNext}</div>
          </div>
          <button type="button" className="wl-share-btn" onClick={() => setShare(true)} title="Share your progress">
            <Glyph id="gift" size={15} /> Share
          </button>
        </div>
        <div className="wl-scene-stage">
          <div className="wl-scene-companion" title={`${stage.name} · level ${lv.level} · ${lv.pct}% to the next`}>
            <ProgressRing pct={lv.pct} size={100} stroke={6}>
              <Companion level={lv.level} mood={daySeg.overall} size={84} />
            </ProgressRing>
          </div>
          <div className="wl-scene-sky">
            {todayMoments.length > 0 ? (
              <button type="button" className="wl-scene-cloud wl-float" onClick={() => setOpenDate(today)} aria-label="Open today's cloud">
                <DayCloud segments={daySeg.segments} emotions={daySeg.emotions} weights={todayWeights} dominant={daySeg.dominant} faceMood={daySeg.overall} size={112} animate />
              </button>
            ) : (
              <button type="button" className="wl-scene-nocloud" onClick={() => { setView('today'); setEditing(true) }}>
                <span className="wl-scene-nocloud-ring" />
                <span>No cloud yet today</span>
              </button>
            )}
            {todayMoments.length > 0 && (
              <div className="wl-scene-caption">
                {daySeg.count > 1 ? `${daySeg.count} moments today` : `Feeling ${moodMeta(daySeg.dominant).label.toLowerCase()}`}
              </div>
            )}
          </div>
        </div>
        <div className="wl-scene-foot">
          <div className="wl-chips">
            {/* "Streak" belongs to the condition stretches (a depressed streak, a
                manic one — see lib/absence.js); the companion's consecutive
                check-in days take the plainer name so one screen never uses
                the word for two different things. */}
            <span className="wl-stat"><Glyph id="flame" size={14} /> {streak}<i>in a row</i></span>
            <span className="wl-stat"><Glyph id="flower" size={14} /> {game?.petals || 0}<i>petals</i></span>
            <span className="wl-stat"><Glyph id="calendar" size={14} /> {weekDays}/7<i>past 7 days</i></span>
          </div>
          <div className="wl-story">{story}</div>
        </div>
      </section>

      <Segmented ariaLabel="Wellness view" items={VIEWS.map(v => v.id === 'conditions' ? { ...v, badge: activeNow.length } : v)} value={view} onChange={setView} />

      {/* ── Today ── */}
      {view === 'today' && (
        <>
          <section className="wl-card">
            <div className="wl-card-head">
              <h3 className="serif">{editing ? (todayMoments.length ? 'Another moment' : 'How are you?') : 'Today'}</h3>
              {!editing && <button type="button" className="wl-link" onClick={() => setEditing(true)}>+ Check in</button>}
              {editing && todayMoments.length > 0 && <button type="button" className="wl-link" onClick={() => setEditing(false)}>Cancel</button>}
            </div>

            {editing ? (
              <>
                <div className="wl-ask">Which cloud are you?</div>
                <div className="wl-moods">
                  {MOODS.map(m => (
                    <button type="button" key={m.v} className={`wl-mood ${mood === m.v ? 'on' : ''}`}
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
                    <button type="button" key={e.v} className={`wl-energy-bar ${energy && energy >= e.v ? 'on' : ''}`}
                      onClick={() => setEnergy(e.v)} title={e.label} aria-label={e.label} style={{ height: 14 + e.v * 7 }} />
                  ))}
                  <span className="wl-energy-label">{energy ? ENERGY[energy - 1].label : ''}</span>
                </div>

                <div className="wl-ask">{promptForDay(today)} <span className="wl-optional">optional</span></div>
                <textarea className="wl-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)}
                  placeholder="A line for future-you…" />

                <div className="wl-ask">A photo? <span className="wl-optional">optional · up to {MAX_PHOTOS}</span></div>
                <PhotoPicker photos={photos} onChange={setPhotos} />

                <button ref={checkInBtn} type="button" className="wl-btn primary block" disabled={!mood} onClick={submitCheckIn}>
                  {todayMoments.length ? 'Add this moment' : 'Check in'}
                  {mood ? ` · +${todayMoments.length ? 3 : REWARDS.checkIn + (note.trim() ? REWARDS.reflection : 0)} petals` : ''}
                </button>
              </>
            ) : todayRecord}
          </section>

          {activeBanner || (
            <button type="button" className="wl-hint" onClick={() => setView('conditions')}>
              <Glyph id="pulse" size={14} /> No condition running right now · <b>start one ›</b>
            </button>
          )}
        </>
      )}

      {/* ── Journal ── */}
      {view === 'journal' && (
        <>
          <section className="wl-card">
            <div className="wl-card-head">
              <h3 className="serif">Past skies</h3>
              <button type="button" className="wl-link sm" onClick={() => setWeeks(w => w === 6 ? 12 : 6)}>{weeks === 6 ? 'Show 12 weeks' : 'Show 6 weeks'}</button>
            </div>
            <p className="wl-card-sub">Every day becomes a cloud. Tap one to revisit its moments, feelings, photos and treasures.</p>
            <CloudCalendar checkins={checkins || []} treasures={treasures} episodes={episodes} weeks={weeks} today={today} onOpen={setOpenDate} />
            <div className="wl-day-legend wl-cal-legend">
              {MOODS.map(m => (
                <span key={m.v} className="wl-legend-item"><span className="wl-legend-dot" style={{ background: m.color }} />{m.label}</span>
              ))}
            </div>
          </section>

          <section className="wl-card">
            <div className="wl-card-head">
              <h3 className="serif">Mood &amp; energy</h3>
            </div>
            <TimeframePicker compact />
            <MoodChart series={series} height={150} label={tf.phrase}
              emptyText={(checkins || []).length ? `No check-ins ${tf.phrase}.` : undefined} />
          </section>

          <section className="wl-card">
            <div className="wl-card-head">
              <h3 className="serif">Patterns</h3>
              <span className="wl-card-meta">
                past 60 days
                {onOpenInsights && <> · <button type="button" className="wl-link sm" onClick={onOpenInsights}>More in Insights ›</button></>}
              </span>
            </div>
            {insights.length === 0 ? (
              <p className="wl-empty">
                Keep checking in and logging conditions for a couple of weeks — once there's
                enough history, Bloom starts surfacing how your mood, energy, conditions and
                finished tasks relate to one another.
              </p>
            ) : (
              <div className="wl-insights">
                {insights.slice(0, 4).map(ins => (
                  <div key={ins.id} className={`wl-insight ${ins.good ? 'good' : ins.strength < 0 ? 'watch' : ''}`}>
                    <span className="wl-insight-dot" />
                    <span className="wl-insight-text">{ins.text}</span>
                  </div>
                ))}
              </div>
            )}
          </section>

          <QuietRule rule={rules} onChange={persistRules} />
        </>
      )}

      {/* ── Conditions ── */}
      {view === 'conditions' && (
        <>
          {activeBanner}
          <section className="wl-card">
            <div className="wl-card-head">
              <h3 className="serif">Conditions</h3>
              <button type="button" className="wl-link" onClick={openNew}>+ New</button>
            </div>
            <p className="wl-card-sub">Flip one on when it starts and off when it lifts — Bloom records how long it lasts, like a status effect you can toggle. The pencil on a tile edits it.</p>

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

          {/* The "how long have I felt this" ledger, over the chosen timeframe. */}
          {(episodes || []).length > 0 && (
            <section className="wl-card">
              <div className="wl-card-head">
                <h3 className="serif">Time by condition</h3>
              </div>
              <TimeframePicker compact />
              {ledger.length === 0 && <p className="wl-empty">Nothing ran {tf.phrase}.</p>}
              <div className="wl-ledger">
                {ledger.map(r => (
                  <div key={r.fx.id} className="wl-ledger-row">
                    <div className="wl-ledger-top">
                      <span className="wl-ledger-ico" style={{ background: r.fx.color, color: iconColorOn(r.fx.color) }}><EffectIcon icon={r.fx.icon} size={13} /></span>
                      <span className="wl-ledger-name">{r.fx.name}</span>
                      <span className="wl-ledger-count">{r.count}×</span>
                      <span className="wl-ledger-val">{fmtDuration(r.mins)}</span>
                    </div>
                    <div className="in-bar" aria-hidden="true"><div className="in-bar-fill" style={{ width: `${Math.max(2, (r.mins / ledgerMax) * 100)}%`, background: r.fx.color }} /></div>
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      )}

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
      {share && <ShareSheet game={game} tracked={weekDays} stage={stage} onClose={() => setShare(false)} />}
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
