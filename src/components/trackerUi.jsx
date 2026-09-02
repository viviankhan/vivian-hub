// src/components/trackerUi.jsx
// Small shared UI atoms for the Insights trackers (Insights.jsx + TrackerFolder.jsx),
// so the folder views and the overview look like one thing.
import { RANGE_PRESETS } from '../lib/trackers.js'

export const inputStyle = {
  width: '100%', fontSize: 14, padding: '10px 12px', borderRadius: 10,
  border: '1px solid var(--border)', background: 'white', color: 'var(--text)',
  fontFamily: 'DM Sans,sans-serif', boxSizing: 'border-box', outline: 'none',
}
export const labelStyle = { fontSize: 11.5, fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: 5 }
export const card = { background: 'white', border: '1px solid var(--border)', borderRadius: 14, padding: '16px 18px', marginBottom: 14 }

export function primaryBtn(enabled = true) {
  return {
    padding: '11px 18px', borderRadius: 11, border: 'none', cursor: enabled ? 'pointer' : 'default',
    fontFamily: 'DM Sans,sans-serif', fontWeight: 700, fontSize: 14,
    background: enabled ? 'var(--forest)' : '#E5E7EB', color: enabled ? 'var(--green-light)' : '#9CA3AF',
  }
}
export function Field({ label, children }) {
  return <div style={{ marginBottom: 12 }}><label style={labelStyle}>{label}</label>{children}</div>
}
export function HmInput({ mins, onChange }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
      <input type="number" min="0" value={Math.floor(mins / 60) || ''} onChange={e => onChange(Math.max(0, +e.target.value || 0) * 60 + (mins % 60))}
        style={{ ...inputStyle, width: 62, textAlign: 'center', padding: '9px 6px' }} />
      <span style={{ fontSize: 12, color: 'var(--muted)' }}>h</span>
      <input type="number" min="0" max="59" value={mins % 60 || ''} onChange={e => onChange(Math.floor(mins / 60) * 60 + Math.min(59, Math.max(0, +e.target.value || 0)))}
        style={{ ...inputStyle, width: 62, textAlign: 'center', padding: '9px 6px' }} />
      <span style={{ fontSize: 12, color: 'var(--muted)' }}>m</span>
    </span>
  )
}
export function Suggest({ value, onChange, placeholder, options = [], listId }) {
  return (
    <>
      <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} list={listId} style={inputStyle} />
      <datalist id={listId}>{[...new Set(options)].filter(Boolean).map(o => <option key={o} value={o} />)}</datalist>
    </>
  )
}
export function Empty({ text }) {
  return <div style={{ ...card, color: 'var(--muted)', fontSize: 13 }}>{text}</div>
}
export function ChartCard({ title, children }) {
  return <div style={card}><div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 12 }}>{title}</div>{children}</div>
}
export function Stat({ label, value, sub }) {
  return (
    <div style={{ flex: 1, minWidth: 140, background: 'linear-gradient(150deg, var(--forest), #2c3a34)', color: 'var(--green-light)', borderRadius: 14, padding: '14px 16px' }}>
      <div style={{ fontSize: 11, opacity: .8, textTransform: 'uppercase', letterSpacing: .5 }}>{label}</div>
      <div className="serif" style={{ fontSize: 28, fontWeight: 700, lineHeight: 1.1, margin: '3px 0 1px' }}>{value}</div>
      <div style={{ fontSize: 11.5, opacity: .75 }}>{sub}</div>
    </div>
  )
}
export function Row({ title, meta, amount, color, thumb, onDelete, last }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '11px 0', borderBottom: last ? 'none' : '1px solid #F1EEF3' }}>
      {thumb ? <img src={thumb} alt="" style={{ width: 34, height: 34, borderRadius: 7, objectFit: 'cover', border: '1px solid var(--border)', flexShrink: 0 }} />
        : <span style={{ width: 10, height: 10, borderRadius: 3, background: color, flexShrink: 0 }} />}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13.5, color: 'var(--text)', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{title}</div>
        <div style={{ fontSize: 11.5, color: 'var(--muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{meta}</div>
      </div>
      <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>{amount}</span>
      {onDelete && <button onClick={onDelete} aria-label="Delete" style={{ background: 'none', border: 'none', color: '#B9B3AC', fontSize: 15, cursor: 'pointer', padding: '0 2px', flexShrink: 0 }}>✕</button>}
    </div>
  )
}
// The shared time-range picker. `right` renders extra controls (export buttons).
export function RangeBar({ preset, setPreset, custom, setCustom, right }) {
  const today = new Date().toISOString().slice(0, 10)
  return (
    <div style={{ ...card, padding: '12px 14px' }}>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        {RANGE_PRESETS.map(([id, label]) => (
          <button key={id} onClick={() => setPreset(id)}
            style={{ fontSize: 11.5, padding: '5px 11px', borderRadius: 16, cursor: 'pointer', fontFamily: 'DM Sans,sans-serif', fontWeight: 600,
              border: `1px solid ${preset === id ? 'var(--teal)' : 'var(--border)'}`, background: preset === id ? '#F0FDFB' : 'white', color: preset === id ? 'var(--teal)' : 'var(--muted)' }}>
            {label}
          </button>
        ))}
        {right && <span style={{ marginLeft: 'auto', display: 'inline-flex', gap: 8 }}>{right}</span>}
      </div>
      {preset === 'custom' && (
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 10, flexWrap: 'wrap' }}>
          <label style={{ fontSize: 12, color: 'var(--muted)' }}>From <input type="date" value={custom.start} max={custom.end || today} onChange={e => setCustom(c => ({ ...c, start: e.target.value }))} style={{ ...inputStyle, width: 'auto', display: 'inline-block', marginLeft: 4 }} /></label>
          <label style={{ fontSize: 12, color: 'var(--muted)' }}>to <input type="date" value={custom.end} min={custom.start || undefined} onChange={e => setCustom(c => ({ ...c, end: e.target.value }))} style={{ ...inputStyle, width: 'auto', display: 'inline-block', marginLeft: 4 }} /></label>
        </div>
      )}
    </div>
  )
}
