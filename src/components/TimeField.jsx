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

export default function TimeField({ value, onChange, style, placeholder = 'e.g. 9:30 AM', disabled, ...rest }) {
  const [text, setText] = useState(() => timeToDisplay(value))
  const lastEmit = useRef(value || '')

  useEffect(() => {
    if ((value || '') !== lastEmit.current) {
      setText(timeToDisplay(value))
      lastEmit.current = value || ''
    }
  }, [value])

  const handle = (raw) => {
    const shown = autoColon(raw)
    setText(shown)
    const iso = parseTypedTime(shown)
    if (iso) { lastEmit.current = iso; onChange(iso) }
    else if (!shown.trim()) { lastEmit.current = ''; onChange('') }
  }

  const invalid = text.trim() !== '' && !parseTypedTime(text)

  return (
    <input
      type="text"
      inputMode="text"
      autoComplete="off"
      value={text}
      disabled={disabled}
      placeholder={placeholder}
      onChange={e => handle(e.target.value)}
      onBlur={() => { const iso = parseTypedTime(text); if (iso) setText(timeToDisplay(iso)) }}
      style={{ ...style, ...(invalid ? { borderColor: '#EF4444' } : {}) }}
      {...rest}
    />
  )
}
