// src/components/Timeframe.jsx
// ─────────────────────────────────────────────────────────────
// The timeframe picker and the hook behind it. Both tabs read the same stored
// choice (see lib/timeframe.js), so a window picked on the Insights tab is the
// window the Wellness ledger and chart use too, and the two pickers on screen
// never disagree. Presets are a number of days ending today — the past 7 days
// unless you choose otherwise — and "Custom…" opens two date fields.
// ─────────────────────────────────────────────────────────────
import { useMemo, useSyncExternalStore } from 'react'
import { dayKey } from '../lib/wellness.js'
import { PRESETS, resolveTimeframe, getTimeframe, setTimeframe, subscribeTimeframe } from '../lib/timeframe.js'

// The resolved window: { id, from, to, days, label, phrase }.
export function useTimeframe() {
  const raw = useSyncExternalStore(subscribeTimeframe, getTimeframe, getTimeframe)
  return useMemo(() => resolveTimeframe(raw), [raw])
}

export function TimeframePicker({ compact = false, className = '' }) {
  const tf = useTimeframe()
  const today = dayKey()
  // A half-typed date comes through as '' — keep the last good one rather than
  // snapping the picker back to a preset mid-edit.
  const setFrom = (v) => { if (v) setTimeframe({ id: 'custom', from: v, to: tf.to }) }
  const setTo = (v) => { if (v) setTimeframe({ id: 'custom', from: tf.from, to: v }) }
  return (
    <div className={`tf ${compact ? 'compact' : ''} ${className}`}>
      <div className="tf-chips" role="tablist" aria-label="Timeframe">
        {PRESETS.map(p => (
          <button key={p.id} type="button" role="tab" aria-selected={tf.id === p.id}
            className={`tf-chip ${tf.id === p.id ? 'on' : ''}`} onClick={() => setTimeframe({ id: p.id })}>{p.label}</button>
        ))}
        <button type="button" role="tab" aria-selected={tf.id === 'custom'}
          className={`tf-chip ${tf.id === 'custom' ? 'on' : ''}`}
          onClick={() => setTimeframe({ id: 'custom', from: tf.from, to: tf.to })}>
          {tf.id === 'custom' ? tf.label : 'Custom…'}
        </button>
      </div>
      {tf.id === 'custom' && (
        <div className="tf-custom">
          <label><span>From</span><input type="date" value={tf.from} max={tf.to} onChange={e => setFrom(e.target.value)} /></label>
          <label><span>To</span><input type="date" value={tf.to} min={tf.from} max={today} onChange={e => setTo(e.target.value)} /></label>
        </div>
      )}
    </div>
  )
}
