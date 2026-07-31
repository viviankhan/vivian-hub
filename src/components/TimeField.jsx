// src/components/TimeField.jsx
// A typed time input — a drop-in replacement for <input type="time">. The
// native control ignores CSS width on iOS Safari and overflows its container,
// so we use a plain text field (which sizes reliably everywhere) and parse
// what you type. Stores the app's canonical 24-hour "HH:MM" string, and
// accepts: 9:30 PM · 930pm · 9pm · 21:30 · 2130 · 9:30 (24h).
import { useState, useEffect, useRef } from 'react'

const pad = n => String(n).padStart(2, '0')

// "HH:MM" (24h) → "9:30 PM" for display.
export function timeToDisplay(hhmm) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm || '')
  if (!m) return hhmm || ''
  let h = +m[1]
  const mer = h >= 12 ? 'PM' : 'AM'
  h = h % 12 || 12
  return `${h}:${m[2]} ${mer}`
}

// Insert a colon into a bare-digit entry (930 → 9:30); leave anything with a
// letter (an am/pm) untouched so it can still be typed and parsed.
function autoColon(raw) {
  if (/[a-z]/i.test(raw)) return raw
  const d = raw.replace(/[^\d]/g, '').slice(0, 4)
  if (d.length <= 2) return d
  return `${d.slice(0, d.length - 2)}:${d.slice(-2)}`
}

// Parse a typed string → "HH:MM" (24h), or null when it isn't a valid time yet.
export function parseTypedTime(raw) {
  let s = (raw || '').trim().toLowerCase()
  if (!s) return null
  let mer = null
  const m = s.match(/([ap])\.?m?\.?\s*$/)          // trailing a / am / p / pm
  if (m) { mer = m[1]; s = s.slice(0, m.index) }
  s = s.replace(/[^\d:]/g, '')
  if (!s) return null
  let hh, mm
  if (s.includes(':')) {
    const [a, b = ''] = s.split(':')
    hh = parseInt(a || '0', 10); mm = parseInt(b || '0', 10)
  } else if (s.length <= 2) {
    hh = parseInt(s, 10); mm = 0
  } else {
    mm = parseInt(s.slice(-2), 10); hh = parseInt(s.slice(0, -2), 10)
  }
  if (isNaN(hh) || isNaN(mm)) return null
  if (mer === 'p' && hh < 12) hh += 12
  if (mer === 'a' && hh === 12) hh = 0
  if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null
  return `${pad(hh)}:${pad(mm)}`
}

// Height of a single wheel row. With a 150px-tall column, 57px top/bottom
// spacers put row `i`'s center at exactly `i * ITEM_H` of scroll — so the
// centered row is just `round(scrollTop / ITEM_H)`.
const ITEM_H = 36

// One scrollable wheel column — an iOS-style picker. Whatever row lands in the
// middle is selected automatically when you stop scrolling; no tap required.
function WheelCol({ items, value, onPick, fmt }) {
  const ref = useRef(null)
  const settle = useRef(null)
  const startIdx = Math.max(0, items.indexOf(value))

  // Center the current value when the wheel opens (jump, no animation).
  useEffect(() => {
    if (ref.current) ref.current.scrollTop = startIdx * ITEM_H
    return () => clearTimeout(settle.current)
  }, [])

  // Debounced: once scrolling stops, snap to the nearest row and select it.
  const onScroll = () => {
    const el = ref.current
    if (!el) return
    clearTimeout(settle.current)
    settle.current = setTimeout(() => {
      const i = Math.max(0, Math.min(items.length - 1, Math.round(el.scrollTop / ITEM_H)))
      const snapTop = i * ITEM_H
      if (Math.abs(el.scrollTop - snapTop) > 1) el.scrollTo({ top: snapTop, behavior: 'smooth' })
      if (items[i] !== value) onPick(items[i])
    }, 110)
  }

  const jumpTo = (it) => {
    const i = items.indexOf(it)
    if (ref.current) ref.current.scrollTo({ top: i * ITEM_H, behavior: 'smooth' })
    onPick(it)
  }

  return (
    <div ref={ref} onScroll={onScroll} style={{ flex:1, height:150, overflowY:'auto', scrollSnapType:'y mandatory', WebkitOverflowScrolling:'touch' }}>
      <div style={{ height:57 }} />
      {items.map(it => {
        const on = value === it
        return (
          <div key={it} onClick={() => jumpTo(it)}
            style={{ scrollSnapAlign:'center', height:ITEM_H, lineHeight:`${ITEM_H}px`, textAlign:'center', fontSize:16, cursor:'pointer', borderRadius:9,
              fontWeight: on ? 700 : 500, color: on ? 'white' : 'var(--text)', background: on ? 'var(--teal)' : 'transparent',
              fontVariantNumeric:'tabular-nums' }}>
            {fmt ? fmt(it) : it}
          </div>
        )
      })}
      <div style={{ height:57 }} />
    </div>
  )
}

const HOURS = [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]
const MINUTES = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55]

// The current time, rounded to the nearest 5 minutes — what the wheel opens on
// when no time is set yet, so it "starts at now".
function nowRounded() {
  const d = new Date()
  const total = (d.getHours() * 60 + Math.round(d.getMinutes() / 5) * 5) % (24 * 60)
  return `${pad(Math.floor(total / 60))}:${pad(total % 60)}`
}

export default function TimeField({ value, onChange, style, placeholder = 'e.g. 9:30 AM', disabled, ...rest }) {
  const [text, setText] = useState(() => timeToDisplay(value))
  const [open, setOpen] = useState(false)
  const lastEmit = useRef(value || '')
  const wrapRef = useRef(null)

  useEffect(() => {
    if ((value || '') !== lastEmit.current) {
      setText(timeToDisplay(value))
      lastEmit.current = value || ''
    }
  }, [value])

  // Close the wheel on an outside tap.
  useEffect(() => {
    if (!open) return
    const h = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [open])

  const emit = (iso) => { setText(timeToDisplay(iso)); lastEmit.current = iso; onChange(iso) }

  const handle = (raw) => {
    const shown = autoColon(raw)
    setText(shown)
    const iso = parseTypedTime(shown)
    if (iso) { lastEmit.current = iso; onChange(iso) }
    else if (!shown.trim()) { lastEmit.current = ''; onChange('') }
  }

  // Current value broken into wheel parts. With nothing set yet, the wheel
  // opens on the current time rather than a fixed default.
  const parsed = parseTypedTime(text) || parseTypedTime(value) || nowRounded()
  let [H, M] = parsed.split(':').map(Number)
  const mer = H >= 12 ? 'PM' : 'AM'
  const h12 = H % 12 || 12
  const setPart = (nh12, nmin, nmer) => {
    let hh = nh12 % 12
    if (nmer === 'PM') hh += 12
    emit(`${String(hh).padStart(2, '0')}:${String(nmin).padStart(2, '0')}`)
  }

  const invalid = text.trim() !== '' && !parseTypedTime(text)

  // Closing the wheel: if nothing's been set yet, accept whatever's centered
  // (which starts at "now") — so a time can be picked entirely by scrolling.
  const closeWheel = () => {
    if (!lastEmit.current) setPart(h12, M, mer)
    setOpen(false)
  }

  return (
    <div ref={wrapRef} style={{ position:'relative', width: (style && style.width) || '100%' }}>
      <input
        type="text" inputMode="text" autoComplete="off"
        value={text} disabled={disabled} placeholder={placeholder}
        onChange={e => handle(e.target.value)}
        onFocus={() => setOpen(false)}
        onBlur={() => { const iso = parseTypedTime(text); if (iso) setText(timeToDisplay(iso)) }}
        style={{ ...style, width:'100%', paddingRight:34, ...(invalid ? { borderColor: '#EF4444' } : {}) }}
        {...rest}
      />
      <button type="button" onClick={() => !disabled && setOpen(o => !o)} aria-label="Pick time" tabIndex={-1}
        style={{ position:'absolute', right:6, top:'50%', transform:'translateY(-50%)', width:24, height:24, border:'none', background:'none', cursor:disabled?'default':'pointer', color: open ? 'var(--teal)' : '#9AA6B2', display:'flex', alignItems:'center', justifyContent:'center', padding:0 }}>
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><polyline points="12 7.5 12 12 15.5 14"/></svg>
      </button>
      {open && (
        <div style={{ position:'absolute', zIndex:60, top:'106%', left:0, minWidth:'100%', width:'max(100%, 230px)', background:'white', border:'1px solid var(--border)', borderRadius:14, boxShadow:'0 16px 40px rgba(40,60,80,.22)', padding:'8px 8px 10px' }}>
          <div style={{ position:'relative', display:'flex', gap:4 }}>
            {/* center highlight band — whatever sits here is the selected value */}
            <div style={{ position:'absolute', left:0, right:0, top:'50%', transform:'translateY(-50%)', height:ITEM_H, borderTop:'1px solid #EEE9F0', borderBottom:'1px solid #EEE9F0', pointerEvents:'none' }} />
            <WheelCol items={HOURS} value={h12} onPick={h => setPart(h, M, mer)} />
            <div style={{ alignSelf:'center', fontSize:16, fontWeight:700, color:'var(--muted)' }}>:</div>
            <WheelCol items={MINUTES} value={M - (M % 5)} onPick={m => setPart(h12, m, mer)} fmt={m => String(m).padStart(2, '0')} />
            <WheelCol items={['AM', 'PM']} value={mer} onPick={me => setPart(h12, M, me)} />
          </div>
          <button type="button" onClick={closeWheel}
            style={{ width:'100%', marginTop:8, padding:'8px', borderRadius:10, border:'none', background:'var(--forest)', color:'var(--green-light)', fontWeight:600, fontSize:12, cursor:'pointer', fontFamily:'DM Sans,sans-serif' }}>Done</button>
        </div>
      )}
    </div>
  )
}
