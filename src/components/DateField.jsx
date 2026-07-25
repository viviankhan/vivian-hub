// src/components/DateField.jsx
// A typed date input — a drop-in replacement for <input type="date"> and its
// iOS calendar-wheel popover. You just type the digits; slashes are inserted
// for you (07252026 → 07/25/2026), so the numeric keypad alone is enough.
// It stores the app's canonical 'YYYY-MM-DD' string, and also accepts
// 2026-07-25 or a typed month name like "Jul 25 2026".
import { useState, useEffect, useRef } from 'react'

const pad = n => String(n).padStart(2, '0')

// 'YYYY-MM-DD' → 'MM/DD/YYYY' for display; anything else passes through.
export function isoToDisplay(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '')
  return m ? `${m[2]}/${m[3]}/${m[1]}` : (iso || '')
}

// Format what the user is typing. Pure-digit entry is grouped as MM/DD/YYYY.
// Anything containing a letter (a month name) is left untouched so the
// natural-language parser can handle it.
function autoSlash(raw) {
  if (/[a-z]/i.test(raw)) return raw
  const d = raw.replace(/\D/g, '').slice(0, 8)
  if (d.length > 4) return `${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4)}`
  if (d.length > 2) return `${d.slice(0, 2)}/${d.slice(2)}`
  return d
}

// Parse a typed string → 'YYYY-MM-DD', or null when it isn't a real date yet.
// Numeric input must match a full, unambiguous shape — partial entries like
// "07/25/2" return null rather than being coerced into a wrong date.
export function parseTypedDate(raw) {
  const s = (raw || '').trim()
  if (!s) return null
  let y, mo, d, m
  if ((m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s))) {
    y = +m[1]; mo = +m[2]; d = +m[3]
  } else if ((m = /^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2}|\d{4})$/.exec(s))) {
    mo = +m[1]; d = +m[2]; y = +m[3] < 100 ? +m[3] + 2000 : +m[3]
  } else if ((m = /^(\d{2})(\d{2})(\d{4})$/.exec(s))) {
    mo = +m[1]; d = +m[2]; y = +m[3]           // 8 bare digits: MMDDYYYY
  } else if (/[a-z]/i.test(s)) {
    const t = new Date(s)                       // natural language: "Jul 25 2026"
    if (isNaN(t.getTime())) return null
    y = t.getFullYear(); mo = t.getMonth() + 1; d = t.getDate()
  } else {
    return null                                 // numeric but incomplete
  }
  // Reject impossible dates (month 13, Feb 30, …) by round-tripping.
  const check = new Date(y, mo - 1, d)
  if (check.getFullYear() !== y || check.getMonth() !== mo - 1 || check.getDate() !== d) return null
  return `${y}-${pad(mo)}-${pad(d)}`
}

export default function DateField({ value, onChange, style, placeholder = 'MM/DD/YYYY', disabled, ...rest }) {
  const [text, setText] = useState(() => isoToDisplay(value))
  // Tracks the ISO value this field last emitted, so the effect below can tell
  // an external change apart from the echo of our own onChange — without the
  // echo, syncing `value` back into `text` would overwrite mid-typing.
  const lastEmit = useRef(value || '')

  useEffect(() => {
    if ((value || '') !== lastEmit.current) {
      setText(isoToDisplay(value))
      lastEmit.current = value || ''
    }
  }, [value])

  const handle = (raw) => {
    const shown = autoSlash(raw)
    setText(shown)
    const iso = parseTypedDate(shown)
    if (iso) { lastEmit.current = iso; onChange(iso) }
    else if (!shown.trim()) { lastEmit.current = ''; onChange('') }
    // partially typed / not yet valid: leave the stored value as-is
  }

  const invalid = text.trim() !== '' && !parseTypedDate(text)

  return (
    <input
      type="text"
      inputMode="numeric"
      autoComplete="off"
      value={text}
      disabled={disabled}
      placeholder={placeholder}
      onChange={e => handle(e.target.value)}
      onBlur={() => { const iso = parseTypedDate(text); if (iso) setText(isoToDisplay(iso)) }}
      style={{ ...style, ...(invalid ? { borderColor: '#EF4444' } : {}) }}
      {...rest}
    />
  )
}
