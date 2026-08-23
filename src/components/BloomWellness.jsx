import { useState, useMemo, useRef, useEffect } from 'react'
import { Glyph, iconColorOn } from '../lib/glyphs.jsx'
import { Companion, MoodFace } from '../lib/critters.jsx'
import { bloomBurst } from '../lib/bloom.js'
import {
  dayKey, MOODS, ENERGY, moodMeta, promptForDay,
  stageForLevel, nextStage, levelFromXp, liveStreak, applyCheckIn, awardPetals, REWARDS,
  DEFAULT_EFFECTS, POSITIVE_EFFECTS, makeEffect,
  activeEpisode, isActive, toggleEpisode, episodeMinutes, fmtDuration, effectTotals,
  buildDailyRecords, computeInsights, moodTrend, shareText,
} from '../lib/wellness.js'

// A soft swatch palette for custom conditions — muted, on-brand, all legible
// with white or dark text (iconColorOn picks per swatch).
const EFFECT_COLORS = ['#B5838D', '#C97A6D', '#D0956B', '#89B0AE', '#6F9F8B', '#7BB0A6', '#8896B0', '#9A8FB0', '#A79CB5', '#8FA9C0']
// The glyphs offered when building a custom condition — drawn from the icon set.
const EFFECT_ICONS = ['brain', 'droplet', 'battery', 'flame', 'cloud', 'rain', 'storm', 'sun', 'moon', 'heart', 'pulse', 'meditation', 'yoga', 'target', 'sparkle', 'bed', 'coffee', 'bulb', 'star', 'shield', 'flower', 'leaf']

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
        <div className="wl-swatches">
          {EFFECT_COLORS.map(c => (
            <button key={c} className={`wl-swatch ${draft.color === c ? 'on' : ''}`} style={{ background: c }}
              onClick={() => onChange({ ...draft, color: c })} aria-label={`Color ${c}`} />
          ))}
        </div>

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

// ── The tab ────────────────────────────────────────────────────
export default function BloomWellness({
  checkins, persistCheckins,
  effects, persistEffects,
  episodes, persistEpisodes,
  game, persistGame,
  log = [],
}) {
  const today = dayKey()
  const todayCheckin = useMemo(() => (checkins || []).find(c => c.date === today) || null, [checkins, today])

  // Live "now" tick so active-effect timers count up while the tab is open.
  const [, setTick] = useState(0)
  useEffect(() => {
    if (!(episodes || []).some(e => !e.end)) return
    const t = setInterval(() => setTick(n => n + 1), 30000)
    return () => clearInterval(t)
  }, [episodes])

  // ── Check-in draft ───────────────────────────────────────────
  const [mood, setMood] = useState(todayCheckin?.mood || null)
  const [energy, setEnergy] = useState(todayCheckin?.energy || null)
  const [note, setNote] = useState(todayCheckin?.note || '')
  const [editing, setEditing] = useState(!todayCheckin)
  useEffect(() => {
    setMood(todayCheckin?.mood || null); setEnergy(todayCheckin?.energy || null)
    setNote(todayCheckin?.note || ''); setEditing(!todayCheckin)
  }, [todayCheckin])

  const [reward, setReward] = useState(null)   // { earned, leveledTo } toast
  const checkInBtn = useRef(null)

  const submitCheckIn = () => {
    if (!mood) return
    const entry = { date: today, mood, energy: energy || 3, note: note.trim(), ts: new Date().toISOString() }
    const already = !!todayCheckin
    const next = [entry, ...(checkins || []).filter(c => c.date !== today)]
    persistCheckins(next)
    if (!already) {
      const res = applyCheckIn(game, { key: today, hasReflection: entry.note.length > 0 })
      persistGame(res.game)
      setReward({ earned: res.earned, leveledTo: res.leveledTo })
      if (checkInBtn.current) bloomBurst(checkInBtn.current)
      setTimeout(() => setReward(null), 4200)
    }
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
    persistEffects(base.filter(f => f.id !== editor.id))
    setEditor(null)
  }

  const activeNow = effectList.filter(fx => isActive(episodes, fx.id))
    .map(fx => ({ fx, since: episodeMinutes(activeEpisode(episodes, fx.id)) }))
  const physical = effectList.filter(f => f.kind !== 'mental')
  const mental = effectList.filter(f => f.kind === 'mental')

  // ── Game/companion derived ───────────────────────────────────
  const lv = levelFromXp(game?.xp || 0)
  const stage = stageForLevel(lv.level)
  const next = nextStage(lv.level)
  const streak = liveStreak(game)
  const trend = useMemo(() => moodTrend(checkins, 14), [checkins])
  const trackedDays = (checkins || []).length

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
            <Companion level={lv.level} mood={todayCheckin?.mood} size={104} />
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
          <h3 className="serif">{editing ? 'Daily check-in' : 'Today'}</h3>
          {!editing && <button className="wl-link" onClick={() => setEditing(true)}>Edit</button>}
        </div>

        {editing ? (
          <>
            <div className="wl-ask">How's your mood?</div>
            <div className="wl-moods">
              {MOODS.map(m => (
                <button key={m.v} className={`wl-mood ${mood === m.v ? 'on' : ''}`}
                  onClick={() => setMood(m.v)} style={mood === m.v ? { borderColor: m.color, background: m.color + '1A' } : {}}>
                  <span className="wl-mood-face"><MoodFace v={m.v} size={34} animate={mood === m.v} /></span>
                  <span className="wl-mood-label">{m.label}</span>
                </button>
              ))}
            </div>

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
              {todayCheckin ? 'Save' : 'Check in'}{!todayCheckin && mood ? ` · +${REWARDS.checkIn + (note.trim() ? REWARDS.reflection : 0)} petals` : ''}
            </button>
          </>
        ) : (
          <div className="wl-today-done">
            <div className="wl-today-face"><MoodFace v={todayCheckin.mood} size={54} animate /></div>
            <div className="wl-today-body">
              <div className="wl-today-mood">{moodMeta(todayCheckin.mood).label} · {ENERGY[(todayCheckin.energy || 3) - 1].label}</div>
              {todayCheckin.note && <div className="wl-today-note">“{todayCheckin.note}”</div>}
              <div className="wl-today-hint">Checked in for today — see you tomorrow <Glyph id="sprout" size={13} style={{ display: 'inline', verticalAlign: '-2px' }} /></div>
            </div>
          </div>
        )}

        {trend.some(t => t.mood != null) && (
          <div className="wl-trend">
            <div className="wl-trend-head"><span>Mood · last 14 days</span></div>
            <Sparkline points={trend} />
          </div>
        )}
      </section>

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
    </div>
  )
}
