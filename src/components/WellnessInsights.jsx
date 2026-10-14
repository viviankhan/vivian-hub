// src/components/WellnessInsights.jsx
// ─────────────────────────────────────────────────────────────
// The Mind & body view of the Insights tab: mood and energy over the chosen
// window as one chart, the feelings that kept coming up, how long each
// condition held you, and the correlations the app has noticed between
// conditions, mood, energy and getting things done. It reads the same wellness
// logic the Wellness tab uses, framed as analytics, and takes its numbers from
// the parent so every tile and chart on the page agrees.
// ─────────────────────────────────────────────────────────────
import { useMemo } from 'react'
import { Glyph, iconColorOn } from '../lib/glyphs.jsx'
import { EffectIcon } from './IconPicker.jsx'
import MoodChart from './MoodChart.jsx'
import {
  moodMeta, emotionMeta, fmtDuration, keyToDate, INTENSITY_MAX, intensityColor,
  buildDailyRecords, computeInsights, emotionTally,
} from '../lib/wellness.js'

function dayLabel(key) {
  try { return keyToDate(key).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) } catch { return key }
}

export default function MindBody({ checkins = [], effects = [], episodes = [], log = [], days = 30, rangeLabel = '', phrase = '', series = [], summary, fxRows = [] }) {
  // Patterns need history to mean anything, so they always look back at least
  // two months even when the range row is set to the past week.
  const patternDays = Math.max(60, days)
  const records = useMemo(() => buildDailyRecords({ checkins, episodes, log, effects, windowDays: patternDays }), [checkins, episodes, log, effects, patternDays])
  const { insights } = useMemo(() => computeInsights({ records, effects }), [records, effects])
  const feelings = useMemo(() => emotionTally(series).map(t => ({ ...t, meta: emotionMeta(t.id) })).filter(t => t.meta).slice(0, 10), [series])
  const maxFx = fxRows.reduce((m, r) => Math.max(m, r.mins), 1)

  // Nothing at all, ever: say what the view is for. Nothing in this window:
  // say so, and still show the longer-run patterns underneath.
  const nothingEver = !(checkins || []).length && !(episodes || []).length
  const nothingHere = !summary?.days && !fxRows.length
  if (nothingEver) {
    return (
      <section className="in-card in-empty">
        <Glyph id="pulse" size={22} color="var(--muted)" />
        <p>Once you log a few moods and conditions, your patterns show up here — how you tend to feel, what conditions cost you time, and what moves with what.</p>
      </section>
    )
  }

  const dir = summary?.direction || 0
  const arrow = dir > 0.25 ? 'up' : dir < -0.25 ? 'down' : null

  return (
    <>
      {nothingHere ? (
        <section className="in-card in-empty">
          <Glyph id="pulse" size={22} color="var(--muted)" />
          <p>No check-ins or conditions {phrase}. Widen the timeframe above to see more.</p>
        </section>
      ) : (
      <section className="in-card">
        <div className="in-card-head">
          <h3 className="serif">Mood &amp; energy</h3>
          {summary?.avg != null && (
            <span className="in-card-meta">
              avg mood {summary.avg}
              {arrow && <b className={`in-dir ${arrow}`}>{arrow === 'up' ? '↑' : '↓'} {Math.abs(dir)}</b>}
            </span>
          )}
        </div>
        <MoodChart series={series} label={phrase} emptyText={`No check-ins ${phrase}.`} />
        {summary?.days > 0 && (
          <div className="in-card-foot in-mood-foot">
            <span>{summary.days} of {days} days have a check-in · {summary.moments} moment{summary.moments === 1 ? '' : 's'}</span>
            {summary.energy != null && <span>avg energy {summary.energy}</span>}
            {summary.best && summary.worst && summary.best.date !== summary.worst.date && (
              <span>
                best <b style={{ color: moodMeta(Math.round(summary.best.mood)).color }}>●</b> {dayLabel(summary.best.date)} · hardest <b style={{ color: moodMeta(Math.round(summary.worst.mood)).color }}>●</b> {dayLabel(summary.worst.date)}
              </span>
            )}
          </div>
        )}
      </section>
      )}

      {feelings.length > 0 && (
        <section className="in-card">
          <div className="in-card-head">
            <h3 className="serif">Feelings that came up</h3>
            <span className="in-card-meta">{rangeLabel}</span>
          </div>
          <div className="in-emos">
            {feelings.map(f => (
              <span key={f.id} className="in-emo" style={{ borderColor: f.meta.color }}>
                <i style={{ background: f.meta.color }} />{f.meta.name}<b>{f.days}d</b>
              </span>
            ))}
          </div>
        </section>
      )}

      {fxRows.length > 0 && (
        <section className="in-card">
          <div className="in-card-head">
            <h3 className="serif">Time carried by condition</h3>
            <span className="in-card-meta">{fmtDuration(fxRows.reduce((a, r) => a + r.mins, 0))} · {rangeLabel}</span>
          </div>
          <div className="in-rows">
            {fxRows.slice(0, 8).map(r => (
              <div key={r.effectId} className="in-row">
                <div className="in-row-top">
                  <span className="in-fx-ico" style={{ background: r.fx.color, color: iconColorOn(r.fx.color) }}><EffectIcon icon={r.fx.icon} size={13} /></span>
                  <span className="in-row-name">{r.fx.name}</span>
                  <span className="in-row-meta">{r.count}× {r.peak > 0 && <b className="in-peak" style={{ color: intensityColor(r.peak) }}>peak {r.peak}/{INTENSITY_MAX}</b>}</span>
                  <span className="in-row-val">{fmtDuration(r.mins)}</span>
                </div>
                <div className="in-bar" aria-hidden="true"><div className="in-bar-fill" style={{ width: `${Math.max(2, (r.mins / maxFx) * 100)}%`, background: r.fx.color }} /></div>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="in-card">
        <div className="in-card-head">
          <h3 className="serif">What relates to what</h3>
          <span className="in-card-meta">past {patternDays} days</span>
        </div>
        {insights.length === 0 ? (
          <p className="in-card-sub" style={{ margin: 0 }}>
            Keep checking in and logging conditions for a couple of weeks. Once there’s enough history, this is where Bloom says how your mood, energy, conditions and finished tasks move together.
          </p>
        ) : (
          <ul className="in-insights">
            {insights.slice(0, 8).map(i => (
              <li key={i.id} className={`in-insight ${i.good ? 'good' : i.strength < 0 ? 'watch' : ''}`}>{i.text}</li>
            ))}
          </ul>
        )}
      </section>
    </>
  )
}
