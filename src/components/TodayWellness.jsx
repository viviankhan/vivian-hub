// src/components/TodayWellness.jsx
// ─────────────────────────────────────────────────────────────
// The wellness strip that lives at the top of the Today tab: the guide (a
// luminescent floating blob who speaks a rotating tip drawn from your own data),
// a quick "how are you feeling" mood check-in, and your active physical
// conditions with running timers. Mirrors the fuller Wellness tab but distilled
// to what belongs in the flow of the day.
// ─────────────────────────────────────────────────────────────
import { useState, useMemo, useEffect } from 'react'
import { Glyph, iconColorOn } from '../lib/glyphs.jsx'
import { GuideBlob, MoodCloud, DayCloud } from '../lib/critters.jsx'
import { advise, LENSES } from '../lib/advisor.js'
import {
  dayKey, MOODS, moodMeta, checkinsForDay, daySegments, emotionWeights,
  DEFAULT_EFFECTS, POSITIVE_EFFECTS, isActive, toggleEpisode, activeEpisode, episodeMinutes, fmtDuration,
  applyCheckIn, awardPetals, moodTrend, buildDailyRecords, computeInsights,
} from '../lib/wellness.js'

export default function TodayWellness({
  checkins = [], persistCheckins, effects, persistEffects,
  episodes = [], persistEpisodes, game, persistGame,
  log = [], taskStats = { done: 0, total: 0 }, onOpenWellness,
}) {
  const today = dayKey()
  const effectList = (effects && effects.length) ? effects : DEFAULT_EFFECTS
  // Tick every 30s so active-condition timers stay live.
  const [, setNow] = useState(Date.now())
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 30000); return () => clearInterval(t) }, [])

  const todayMoments = useMemo(() => checkinsForDay(checkins, today), [checkins, today])
  const seg = useMemo(() => daySegments(checkins, today), [checkins, today])
  const weights = useMemo(() => emotionWeights(checkins, today), [checkins, today])

  // Advice context, assembled from the day's signals.
  const tips = useMemo(() => {
    const activeEffects = effectList.filter(fx => isActive(episodes, fx.id)).map(fx => {
      const ep = activeEpisode(episodes, fx.id)
      return { id: fx.id, name: fx.name, kind: fx.kind, good: POSITIVE_EFFECTS.has(fx.id), mins: ep ? episodeMinutes(ep) : 0 }
    })
    const records = buildDailyRecords({ checkins, episodes, log, effects: effectList })
    const { insights } = computeInsights({ records, effects: effectList })
    return advise({
      hasCheckinToday: todayMoments.length > 0,
      moodToday: seg.count ? seg.overall : null,
      moodTrend: moodTrend(checkins, 14),
      activeEffects,
      everTracked: (episodes || []).length > 0,
      insights,
      tasksDone: taskStats.done, tasksTotal: taskStats.total,
    })
  }, [checkins, episodes, effectList, log, todayMoments.length, seg.count, seg.overall, taskStats.done, taskStats.total])

  const [tipIdx, setTipIdx] = useState(0)
  useEffect(() => { setTipIdx(0) }, [tips.length])
  const tip = tips[tipIdx % Math.max(1, tips.length)] || { lens: 'mind', text: '' }
  const lens = LENSES[tip.lens] || LENSES.mind
  const nextTip = () => setTipIdx(i => (i + 1) % Math.max(1, tips.length))

  const logMood = (v) => {
    const entry = { id: 'ci-' + Date.now().toString(36), date: today, mood: v, energy: 3, emotions: [], note: '', ts: new Date().toISOString() }
    persistCheckins([...(checkins || []), entry])
    if (persistGame && game) {
      if (todayMoments.length === 0) persistGame(applyCheckIn(game, { key: today }).game)
      else if (todayMoments.length < 5) persistGame(awardPetals(game, 3))
    }
  }
  const toggleEffect = (id) => persistEpisodes(toggleEpisode(episodes, id))

  return (
    <section className="tw" style={{ '--lens': lens.tint }}>
      {/* The guide + its counsel */}
      <div className="tw-guide">
        <button className="tw-blob-btn" onClick={nextTip} aria-label="Next from your guide">
          <GuideBlob size={72} tint={lens.tint} speaking />
        </button>
        <button className="tw-bubble" onClick={nextTip}>
          <span className="tw-lens"><Glyph id={lens.glyph} size={12} /> {lens.label}</span>
          <span className="tw-tip">{tip.text}</span>
          {tips.length > 1 && <span className="tw-more">tap for more →</span>}
        </button>
      </div>

      {/* How are you feeling? */}
      <div className="tw-block">
        <div className="tw-row-head">
          <span className="tw-label">{todayMoments.length ? 'Add another moment' : 'How are you feeling right now?'}</span>
          {todayMoments.length > 0 && (
            <span className="tw-today-cloud" title={`${todayMoments.length} moment${todayMoments.length > 1 ? 's' : ''} today`}>
              <DayCloud segments={seg.segments} emotions={seg.emotions} weights={weights} dominant={seg.dominant} faceMood={seg.overall} size={34} mist={26} />
              <span className="tw-count">{todayMoments.length}</span>
            </span>
          )}
        </div>
        <div className="tw-moods">
          {MOODS.map(m => (
            <button key={m.v} className="tw-mood" onClick={() => logMood(m.v)} title={m.label} aria-label={`Log feeling ${m.label}`}>
              <MoodCloud v={m.v} size={44} />
              <span className="tw-mood-name">{m.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Right-now conditions */}
      <div className="tw-block">
        <div className="tw-row-head">
          <span className="tw-label">Right now</span>
          {onOpenWellness && <button className="tw-link" onClick={onOpenWellness}>Manage in Wellness →</button>}
        </div>
        <div className="tw-fx">
          {effectList.map(fx => {
            const on = isActive(episodes, fx.id)
            const ep = on ? activeEpisode(episodes, fx.id) : null
            return (
              <button key={fx.id} className={`tw-chip ${on ? 'on' : ''}`} onClick={() => toggleEffect(fx.id)}
                style={on ? { background: fx.color, color: iconColorOn(fx.color), borderColor: fx.color } : { '--c': fx.color }}>
                <span className="tw-chip-ico"><Glyph id={fx.icon} size={15} /></span>
                <span className="tw-chip-name">{fx.name}</span>
                {on && ep && <span className="tw-chip-time">{fmtDuration(episodeMinutes(ep))}</span>}
              </button>
            )
          })}
        </div>
      </div>
    </section>
  )
}
