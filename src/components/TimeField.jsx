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

// One scrollable wheel column: scroll to (or tap) the value you want.
function WheelCol({ items, value, onPick, fmt }) {
  const ref = useRef(null)
  useEffect(() => {
    // Center the selected item when the wheel opens.
    const el = ref.current?.querySelector('[data-on="1"]')
    if (el) el.scrollIntoView({ block: 'center' })
  }, [])
  return (
    <div ref={ref} style={{ flex:1, height:150, overflowY:'auto', scrollSnapType:'y mandatory', WebkitOverflowScrolling:'touch' }}>
      <div style={{ height:57 }} />
      {items.map(it => {
        const on = value === it
        return (
          <div key={it} data-on={on ? '1' : '0'} onClick={() => onPick(it)}
            style={{ scrollSnapAlign:'center', padding:'8px 0', textAlign:'center', fontSize:16, cursor:'pointer', borderRadius:9,
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

// "From now" offsets, in minutes — the intuitive way to set a start time
// relative to the moment you're adding the task ("in 30 min", "in 2 hours").
const REL_OFFSETS = [0, 5, 10, 15, 20, 30, 45, 60, 75, 90, 105, 120, 150, 180, 240, 300, 360]
function relLabel(mins) {
  if (mins === 0) return 'Now'
  if (mins < 60) return `in ${mins} min`
  const h = Math.floor(mins / 60), m = mins % 60
  if (m === 0) return `in ${h} hr`
  return `in ${h}h ${m}m`
}
// The clock time you'd land on if you picked this offset right now.
function fromNow(mins) {
  const d = new Date(Date.now() + mins * 60000)
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export default function TimeField({ value, onChange, style, placeholder = 'e.g. 9:30 AM', disabled, ...rest }) {
  const [text, setText] = useState(() => timeToDisplay(value))
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState('clock')   // 'clock' | 'rel' (from now)
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

  // Current value broken into wheel parts (defaults to 9:00 AM when empty).
  const parsed = parseTypedTime(text) || parseTypedTime(value) || '09:00'
  let [H, M] = parsed.split(':').map(Number)
  const mer = H >= 12 ? 'PM' : 'AM'
  const h12 = H % 12 || 12
  const setPart = (nh12, nmin, nmer) => {
    let hh = nh12 % 12
    if (nmer === 'PM') hh += 12
    emit(`${String(hh).padStart(2, '0')}:${String(nmin).padStart(2, '0')}`)
  }

  const invalid = text.trim() !== '' && !parseTypedTime(text)

  // Which "from now" offset best matches the current value, so that column can
  // highlight it. Null when there's no value yet (nothing highlighted).
  const relSelected = (() => {
    const cur = parseTypedTime(text) || (value ? parseTypedTime(value) : null)
    if (!cur) return null
    const [hh, mm] = cur.split(':').map(Number)
    const nowD = new Date()
    let off = (hh * 60 + mm) - (nowD.getHours() * 60 + nowD.getMinutes())
    if (off < 0) off += 24 * 60           // treat an earlier clock time as tomorrow-ish
    return REL_OFFSETS.reduce((best, o) => Math.abs(o - off) < Math.abs(best - off) ? o : best, REL_OFFSETS[0])
  })()

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
            {/* Mode switch: pick a clock time, or scroll to a time from now. */}
            <div style={{ display:'flex', gap:4, padding:3, borderRadius:10, background:'#EFECF2', marginBottom:8 }}>
              {[['clock','Clock'],['rel','From now']].map(([v, l]) => (
                <button key={v} type="button" onClick={() => setMode(v)}
                  style={{ flex:1, padding:'6px 4px', borderRadius:8, border:'none', cursor:'pointer', fontFamily:'DM Sans,sans-serif', fontSize:12, fontWeight:600,
                    background: mode === v ? 'white' : 'transparent', color: mode === v ? 'var(--teal)' : 'var(--muted)',
                    boxShadow: mode === v ? '0 1px 3px rgba(40,60,80,.14)' : 'none' }}>{l}</button>
              ))}
            </div>
          {mode === 'clock' ? (
            <div style={{ position:'relative', display:'flex', gap:4 }}>
              {/* center highlight guides */}
              <div style={{ position:'absolute', left:0, right:0, top:'50%', transform:'translateY(-50%)', height:34, borderTop:'1px solid #EEE9F0', borderBottom:'1px solid #EEE9F0', pointerEvents:'none' }} />
              <WheelCol items={HOURS} value={h12} onPick={h => setPart(h, M, mer)} />
              <div style={{ alignSelf:'center', fontSize:16, fontWeight:700, color:'var(--muted)' }}>:</div>
              <WheelCol items={MINUTES} value={M - (M % 5)} onPick={m => setPart(h12, m, mer)} fmt={m => String(m).padStart(2, '0')} />
              <WheelCol items={['AM', 'PM']} value={mer} onPick={me => setPart(h12, M, me)} />
            </div>
          ) : (
            <div style={{ position:'relative', display:'flex' }}>
              <div style={{ position:'absolute', left:0, right:0, top:'50%', transform:'translateY(-50%)', height:34, borderTop:'1px solid #EEE9F0', borderBottom:'1px solid #EEE9F0', pointerEvents:'none' }} />
              <WheelCol items={REL_OFFSETS} value={relSelected} onPick={off => emit(fromNow(off))}
                fmt={off => (
                  <span style={{ display:'inline-flex', alignItems:'baseline', gap:7, justifyContent:'center' }}>
                    <span>{relLabel(off)}</span>
                    <span style={{ fontSize:11, opacity:.7 }}>{timeToDisplay(fromNow(off))}</span>
                  </span>
                )} />
            </div>
          )}
          <button type="button" onClick={() => setOpen(false)}
            style={{ width:'100%', marginTop:8, padding:'8px', borderRadius:10, border:'none', background:'var(--forest)', color:'var(--green-light)', fontWeight:600, fontSize:12, cursor:'pointer', fontFamily:'DM Sans,sans-serif' }}>Done</button>
        </div>
      )}
    </div>
  )
}
