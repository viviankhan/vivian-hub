// src/components/StretchCalendar.jsx
// ─────────────────────────────────────────────────────────────
// When were you away? A month calendar of when you were last around — a dot on
// every day you used the app, bigger the longer you were here — for saying
// exactly when a stretch started and ended. Tap a day to set the start (it
// then moves on to the end), pick the times underneath, and tap any of the
// day's visits to snap a time to the moment you left or came back.
//
// It opens on a suggestion — the most recent long quiet gap — but every part
// of it is yours to change.
// ─────────────────────────────────────────────────────────────
import { useMemo, useState } from 'react'
import { dayKey } from '../lib/wellness.js'

const DAY_MS = 86400000
const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']

const pad = (n) => String(n).padStart(2, '0')
const hhmmOf = (ms) => { const d = new Date(ms); return `${pad(d.getHours())}:${pad(d.getMinutes())}` }
const clock = (ms) => new Date(ms).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
const dayLabel = (ms) => new Date(ms).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
function withTime(dayMs, hhmm) {
  const [h, m] = String(hhmm || '00:00').split(':').map(Number)
  const d = new Date(dayMs); d.setHours(h || 0, m || 0, 0, 0)
  return d.getTime()
}
function onDay(ms, dayMs) {
  // Keep the clock time, move to another day.
  const d = new Date(ms), t = new Date(dayMs)
  t.setHours(d.getHours(), d.getMinutes(), 0, 0)
  return t.getTime()
}
const midnight = (ms) => { const d = new Date(ms); d.setHours(0, 0, 0, 0); return d.getTime() }

export default function StretchCalendar({ value, onChange, byDay, suggestion = null, nowMs = Date.now(), maxBackDays = 90 }) {
  const [field, setField] = useState('start')            // which end a day tap sets
  const [month, setMonth] = useState(() => { const d = new Date(value.startMs); return new Date(d.getFullYear(), d.getMonth(), 1).getTime() })
  const today0 = midnight(nowMs)
  const earliest = today0 - maxBackDays * DAY_MS
  const start0 = midnight(value.startMs), end0 = midnight(value.endMs)

  // The month grid: leading blanks, then each day.
  const cells = useMemo(() => {
    const m = new Date(month)
    const first = m.getDay()
    const days = new Date(m.getFullYear(), m.getMonth() + 1, 0).getDate()
    const out = Array.from({ length: first }, () => null)
    for (let d = 1; d <= days; d++) out.push(new Date(m.getFullYear(), m.getMonth(), d).getTime())
    return out
  }, [month])
  const busiest = useMemo(() => Math.max(60, ...[...byDay.values()].map(d => d.mins)), [byDay])

  const canPrev = month > earliest
  const canNext = new Date(month).getMonth() !== new Date(nowMs).getMonth() || new Date(month).getFullYear() !== new Date(nowMs).getFullYear()
  const shiftMonth = (n) => { const d = new Date(month); setMonth(new Date(d.getFullYear(), d.getMonth() + n, 1).getTime()) }

  const clampNow = (ms) => Math.min(ms, nowMs)
  const setStart = (ms) => {
    const s = clampNow(ms)
    onChange({ startMs: s, endMs: Math.max(value.endMs, s) })
  }
  const setEnd = (ms) => {
    const e = clampNow(ms)
    onChange({ startMs: Math.min(value.startMs, e), endMs: e })
  }
  const tapDay = (dayMs) => {
    if (field === 'start') {
      // A start past the current end pulls the end along to that day.
      const st = clampNow(onDay(value.startMs, dayMs))
      const en = value.endMs >= st ? value.endMs : Math.max(st, clampNow(onDay(value.endMs, dayMs)))
      onChange({ startMs: st, endMs: en })
      setField('end')
    } else if (dayMs < start0) {
      // An end before the start means you meant an earlier start.
      onChange({ startMs: clampNow(onDay(value.startMs, dayMs)), endMs: value.endMs })
    } else {
      onChange({ startMs: value.startMs, endMs: Math.max(value.startMs, clampNow(onDay(value.endMs, dayMs))) })
    }
  }

  const activeMs = field === 'start' ? value.startMs : value.endMs
  const activeDay = byDay.get(dayKey(new Date(activeMs)))
  const isSuggested = suggestion && Math.abs(suggestion.startMs - value.startMs) < 60000 && Math.abs(suggestion.endMs - value.endMs) < 60000
  const endIsNow = nowMs - value.endMs < 60000

  return (
    <div className="rail-cal" data-testid="stretch-calendar">
      <div className="rail-cal-head">
        <button type="button" className="rail-cal-nav" disabled={!canPrev} onClick={() => shiftMonth(-1)} aria-label="Previous month">‹</button>
        <b>{new Date(month).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</b>
        <button type="button" className="rail-cal-nav" disabled={!canNext} onClick={() => shiftMonth(1)} aria-label="Next month">›</button>
      </div>
      <div className="rail-cal-grid">
        {WEEKDAYS.map(w => <span key={w} className="rail-cal-wd">{w}</span>)}
        {cells.map((ms, i) => {
          if (ms == null) return <span key={'b' + i} />
          const key = dayKey(new Date(ms))
          const act = byDay.get(key)
          const off = ms > today0 || ms < earliest
          const inRange = ms >= start0 && ms <= end0
          const edge = ms === start0 ? 'start' : ms === end0 ? 'end' : ''
          const size = act ? Math.round(4 + 6 * Math.min(1, act.mins / busiest)) : 0
          return (
            <button type="button" key={key} disabled={off} onClick={() => tapDay(ms)}
              className={`rail-cal-day${inRange ? ' in' : ''}${edge ? ' edge ' + edge : ''}${ms === start0 && ms === end0 ? ' one' : ''}${ms === today0 ? ' today' : ''}`}
              aria-label={`${dayLabel(ms)}${act ? `, active ${act.mins} min` : ', no activity'}`} data-day={key}>
              <span>{new Date(ms).getDate()}</span>
              <i className="rail-cal-dot" style={{ width: size, height: size, opacity: act ? 1 : 0 }} />
            </button>
          )
        })}
      </div>
      <div className="rail-cal-legend"><i className="rail-cal-dot" style={{ width: 6, height: 6 }} /> you were on the app that day</div>

      {/* The two ends, each a day (from the calendar) and a time. */}
      <div className="rail-cal-ends">
        {[['start', 'Started', value.startMs, setStart], ['end', 'Ended', value.endMs, setEnd]].map(([f, label, ms, set]) => (
          <div key={f} className={`rail-cal-end${field === f ? ' on' : ''}`} onClick={() => setField(f)}>
            <span className="rail-cal-end-label">{label}</span>
            <span className="rail-cal-end-day">{f === 'end' && endIsNow ? 'Now' : dayLabel(ms)}</span>
            {/* Typing a time doesn't change which end the next day tap sets —
                so "tap start day, tap end day, then fix the times" just works. */}
            <input type="time" value={hhmmOf(ms)} aria-label={`${label} time`} data-testid={`stretch-${f}-time`}
              onClick={e => e.stopPropagation()}
              onChange={e => { if (e.target.value) set(withTime(midnight(ms), e.target.value)) }} />
          </div>
        ))}
      </div>
      <div className="rail-cal-tip">Tap a day to set the <b>{field === 'start' ? 'start' : 'end'}</b>.</div>

      {/* That day's visits, as shortcuts: the start snaps to when you left, the
          end to when you came back. */}
      {activeDay && activeDay.spans.length > 0 && (
        <div className="rail-cal-visits">
          <span>On the app {midnight(activeMs) === today0 ? 'today' : 'that day'}:</span>
          {activeDay.spans.slice(-6).map(([s, e], i) => (
            <button type="button" key={i} className="rail-cal-visit"
              onClick={() => (field === 'start' ? setStart(e) : setEnd(s))}
              title={field === 'start' ? 'Start when you left' : 'End when you came back'}>
              {e - s < 60000 ? clock(s) : `${clock(s)}–${clock(e)}`}
            </button>
          ))}
        </div>
      )}

      <div className="rail-cal-actions">
        {suggestion && !isSuggested && (
          <button type="button" className="rail-cal-link" onClick={() => { onChange({ ...suggestion }); setMonth(new Date(new Date(suggestion.startMs).getFullYear(), new Date(suggestion.startMs).getMonth(), 1).getTime()) }}>
            ↺ Use suggestion ({dayLabel(suggestion.startMs).replace(/^\w+, /, '')} {clock(suggestion.startMs)} → {nowMs - suggestion.endMs < 60000 ? 'now' : `${dayLabel(suggestion.endMs).replace(/^\w+, /, '')} ${clock(suggestion.endMs)}`})
          </button>
        )}
        {suggestion && isSuggested && <span className="rail-cal-note">Suggested from when you were last on the app — change anything.</span>}
        {!endIsNow && <button type="button" className="rail-cal-link" onClick={() => setEnd(nowMs)}>End it now</button>}
      </div>
    </div>
  )
}
