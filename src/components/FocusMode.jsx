// src/components/FocusMode.jsx
// A full-screen "Focus Now" timer for the task that's happening right now.
// Shows a circular ring that drains as the event elapses, a live countdown of
// the time remaining, and Done / Exit controls. Falls back to a count-up
// stopwatch for tasks that have no fixed end (a start time but no duration).
import { useState, useEffect } from 'react'
import { Icon } from './IconPicker.jsx'
import { iconColorOn } from '../lib/glyphs.jsx'

function fmt12(t) {
  if (!t) return ''
  const [h, m] = t.split(':').map(Number)
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`
}
function two(n) { return String(n).padStart(2, '0') }
function addMin(time, mins) {
  const [h, m] = time.split(':').map(Number)
  const t = Math.min(h * 60 + m + mins, 23 * 60 + 59)
  return `${two(Math.floor(t / 60))}:${two(t % 60)}`
}
// Darken a #rrggbb toward black for the gradient's far stop.
function darken(hex, amt = 0.35) {
  if (!hex || hex[0] !== '#' || hex.length < 7) return '#2A4858'
  const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16)
  const d = (c) => Math.round(c * (1 - amt))
  return `rgb(${d(r)},${d(g)},${d(b)})`
}

export default function FocusMode({ title, icon, color = '#4A9EB5', time, durationMins, onDone, onClose }) {
  const [now, setNow] = useState(Date.now())
  const [openedAt] = useState(Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])

  // Build today's start/end from the HH:MM start + duration.
  let startTs = null, endTs = null
  if (time) {
    const [h, m] = time.split(':').map(Number)
    const s = new Date(); s.setHours(h, m, 0, 0); startTs = s.getTime()
    if (durationMins) endTs = startTs + durationMins * 60000
  }
  const hasWindow = startTs != null && endTs != null
  const anchor = startTs != null && now >= startTs ? startTs : openedAt

  const total = hasWindow ? endTs - startTs : 0
  const elapsed = hasWindow ? Math.min(total, Math.max(0, now - startTs)) : Math.max(0, now - anchor)
  const remainingMs = hasWindow ? Math.max(0, endTs - now) : 0
  const frac = hasWindow ? Math.max(0, Math.min(1, elapsed / total)) : 0
  const done = hasWindow && now >= endTs

  const shownMs = hasWindow ? remainingMs : elapsed
  const mm = Math.floor(shownMs / 60000)
  const ss = Math.floor((shownMs % 60000) / 1000)

  // Ring geometry (drains clockwise as time passes).
  const R = 132, C = 2 * Math.PI * R
  const offset = C * (hasWindow ? frac : 0)

  // Readable foreground for this color (dark on light backdrops, light on dark).
  const fg = iconColorOn(color)
  const onLight = fg !== '#FFFFFF'
  const track = onLight ? 'rgba(0,0,0,.14)' : 'rgba(255,255,255,.22)'
  const btnBg = onLight ? 'rgba(0,0,0,.10)' : 'rgba(255,255,255,.22)'
  const btnBorder = onLight ? 'rgba(0,0,0,.5)' : 'rgba(255,255,255,.6)'

  return (
    <div style={{ position:'fixed', inset:0, zIndex:800, background:`linear-gradient(165deg, ${color}, ${darken(color)})`,
      display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:24, color:fg }}>
      <button onClick={onClose} aria-label="Exit focus"
        style={{ position:'absolute', top:'max(20px, calc(env(safe-area-inset-top) + 8px))', right:20, width:42, height:42, borderRadius:'50%', border:'none', background:btnBg, color:fg, fontSize:17, cursor:'pointer' }}>✕</button>

      <div style={{ position:'relative', width:300, height:300, display:'flex', alignItems:'center', justifyContent:'center', marginBottom:28 }}>
        <svg width="300" height="300" style={{ position:'absolute', transform:'rotate(-90deg)' }} aria-hidden="true">
          <circle cx="150" cy="150" r={R} fill="none" stroke={track} strokeWidth="13" />
          {hasWindow && (
            <circle cx="150" cy="150" r={R} fill="none" stroke={fg} strokeWidth="13" strokeLinecap="round"
              strokeDasharray={C} strokeDashoffset={offset} style={{ transition:'stroke-dashoffset 1s linear' }} />
          )}
        </svg>
        <div style={{ textAlign:'center' }}>
          {icon && <div style={{ marginBottom:12, display:'flex', justifyContent:'center' }}><Icon value={icon} size={40} color={fg} /></div>}
          {done ? (
            <div style={{ fontSize:34, fontWeight:700 }}>Time’s up</div>
          ) : (
            <>
              <div style={{ fontSize:56, fontWeight:700, fontVariantNumeric:'tabular-nums', lineHeight:1 }}>{mm}:{two(ss)}</div>
              <div style={{ fontSize:14, opacity:.85, marginTop:6 }}>{hasWindow ? 'remaining' : 'focusing'}</div>
            </>
          )}
        </div>
      </div>

      <div className="serif" style={{ fontSize:30, fontWeight:600, textAlign:'center', marginBottom:6, maxWidth:340 }}>{title}</div>
      {time && (
        <div style={{ fontSize:14, opacity:.85, marginBottom:30 }}>
          {fmt12(time)}{durationMins ? ` – ${fmt12(addMin(time, durationMins))}` : ''}
        </div>
      )}

      <div style={{ display:'flex', gap:12 }}>
        {onDone && (
          <button onClick={onDone}
            style={{ padding:'14px 26px', borderRadius:16, border:'none', background:fg, color, fontWeight:700, fontSize:15, cursor:'pointer', fontFamily:'DM Sans,sans-serif' }}>
            ✓ Mark done
          </button>
        )}
        <button onClick={onClose}
          style={{ padding:'14px 24px', borderRadius:16, border:`1.5px solid ${btnBorder}`, background:'transparent', color:fg, fontWeight:600, fontSize:15, cursor:'pointer', fontFamily:'DM Sans,sans-serif' }}>
          Exit
        </button>
      </div>
    </div>
  )
}
