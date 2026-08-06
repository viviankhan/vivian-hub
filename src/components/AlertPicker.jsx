// src/components/AlertPicker.jsx
// A phone-style "Add Alert" spinner shared by the per-task add sheet and the
// global Settings → Reminders screen. Scroll the hours + minutes columns (they
// snap to the centered value) or tap a quick preset, then Add. `onAdd` receives
// the total lead in minutes before the start (0 = right at the start).
import { useState, useRef, useLayoutEffect } from 'react'
import { leadLabel } from '../lib/notifications.js'

// A full, human name for one alert value — used by both alert lists.
export function alertName(val) {
  if (val === 'end') return 'At end of task'
  if (val === 0) return 'At start of task'
  return `${leadLabel(val)} before start`
}

const WHEEL_ROW = 40       // px per row
const WHEEL_VISIBLE = 5    // rows shown; the center one is the selection
function Wheel({ values, value, onChange, width = 64 }) {
  const ref = useRef(null)
  const pad = ((WHEEL_VISIBLE - 1) / 2) * WHEEL_ROW
  // Land on the current value when mounted (the picker remounts the wheels via a
  // key when a preset jumps them, so this also handles preset taps).
  useLayoutEffect(() => {
    const i = values.indexOf(value)
    if (ref.current && i >= 0) ref.current.scrollTop = i * WHEEL_ROW
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const onScroll = () => {
    const el = ref.current; if (!el) return
    const i = Math.max(0, Math.min(values.length - 1, Math.round(el.scrollTop / WHEEL_ROW)))
    if (values[i] !== value) onChange(values[i])
  }
  return (
    <div style={{ position:'relative', width, height: WHEEL_VISIBLE * WHEEL_ROW, overflow:'hidden' }}>
      <div style={{ position:'absolute', left:0, right:0, top: pad, height: WHEEL_ROW, background:'rgba(56,110,90,.10)', borderRadius:10, pointerEvents:'none' }} />
      <div ref={ref} onScroll={onScroll} className="alert-wheel"
        style={{ height:'100%', overflowY:'auto', scrollSnapType:'y mandatory', WebkitOverflowScrolling:'touch', scrollbarWidth:'none' }}>
        <div style={{ height: pad }} />
        {values.map((v) => {
          const sel = v === value
          return (
            <div key={v} style={{ height: WHEEL_ROW, scrollSnapAlign:'center', display:'flex', alignItems:'center', justifyContent:'center',
              fontSize: sel ? 21 : 16, fontWeight: sel ? 700 : 500, color: sel ? 'var(--text)' : 'var(--muted)', fontVariantNumeric:'tabular-nums' }}>{v}</div>
          )
        })}
        <div style={{ height: pad }} />
      </div>
    </div>
  )
}
export function AlertPicker({ onClose, onAdd }) {
  const [h, setH] = useState(0)
  const [m, setM] = useState(5)
  const [nonce, setNonce] = useState(0)   // bump to re-seat the wheels on a preset
  const hours = Array.from({ length: 24 }, (_, i) => i)
  const minutes = Array.from({ length: 60 }, (_, i) => i)
  const total = h * 60 + m
  const quick = (hh, mm) => { setH(hh); setM(mm); setNonce(n => n + 1) }
  const summary = total === 0 ? 'at the start' : `${leadLabel(total)} before`
  return (
    <div onClick={onClose} style={{ position:'fixed', inset:0, background:'rgba(20,28,38,.5)', zIndex:660, display:'flex', alignItems:'flex-end', justifyContent:'center' }}>
      <div onClick={e => e.stopPropagation()} style={{ background:'#F3F2F6', borderRadius:'22px 22px 0 0', width:'100%', maxWidth:480, boxShadow:'0 -10px 44px rgba(20,40,60,.28)', padding:'18px 18px calc(20px + env(safe-area-inset-bottom))' }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:14 }}>
          <div className="serif" style={{ fontSize:19, fontWeight:700, color:'var(--text)' }}>Add Alert</div>
          <button onClick={onClose} aria-label="Close" style={{ width:34, height:34, borderRadius:'50%', border:'none', background:'#E6E4EA', color:'var(--muted)', fontSize:16, cursor:'pointer' }}>✕</button>
        </div>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:4, background:'white', borderRadius:16, padding:'6px 12px', marginBottom:14 }}>
          <Wheel key={'h'+nonce} values={hours} value={h} onChange={setH} width={54} />
          <span style={{ fontSize:14, color:'var(--muted)', fontWeight:600, width:40 }}>hr</span>
          <Wheel key={'m'+nonce} values={minutes} value={m} onChange={setM} width={54} />
          <span style={{ fontSize:14, color:'var(--muted)', fontWeight:600, width:64 }}>min before</span>
        </div>
        <div style={{ display:'flex', gap:8, marginBottom:16 }}>
          {[['1 min',0,1],['5 min',0,5],['30 min',0,30],['1 hr',1,0]].map(([label,hh,mm]) => (
            <button key={label} onClick={() => quick(hh, mm)}
              style={{ flex:1, padding:'11px 4px', borderRadius:14, border:'none', background:'#E9E7EE', color:'var(--text)', fontWeight:700, fontSize:13, cursor:'pointer', fontFamily:'DM Sans,sans-serif' }}>{label}</button>
          ))}
        </div>
        <button onClick={() => { onAdd(total); onClose() }}
          style={{ width:'100%', padding:'14px', borderRadius:16, border:'none', background:'var(--forest)', color:'var(--green-light)', fontWeight:700, fontSize:16, cursor:'pointer', fontFamily:'DM Sans,sans-serif' }}>
          Add alert · {summary}
        </button>
      </div>
    </div>
  )
}
