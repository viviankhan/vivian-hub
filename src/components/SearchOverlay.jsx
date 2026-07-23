// src/components/SearchOverlay.jsx
// A full-screen search launched from the magnifier icon. Dims the page behind
// a light-blue frosted filter, offers live suggestions from your event data,
// and — when you pick one — jumps the Calendar to that date.
import { useState, useEffect, useRef, useMemo } from 'react'

// A crisp, modern magnifying-glass. Reused by the nav button too.
export function SearchIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <circle cx="11" cy="11" r="7" />
      <line x1="16.5" y1="16.5" x2="21" y2="21" />
    </svg>
  )
}

const KIND_COLOR = { Commitment: '#4A9EB5', Event: null, Done: '#52B788' }

// Highlight the matched substring inside a label.
function Highlighted({ text, q }) {
  const i = text.toLowerCase().indexOf(q.toLowerCase())
  if (!q || i < 0) return text
  return (
    <>
      {text.slice(0, i)}<mark>{text.slice(i, i + q.length)}</mark>{text.slice(i + q.length)}
    </>
  )
}

function fmtDate(d) {
  return new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export default function SearchOverlay({ open, onClose, commitments, events, log, onJump }) {
  const [q, setQ] = useState('')
  const [active, setActive] = useState(0)
  const inputRef = useRef(null)

  // Reset + focus each time it opens.
  useEffect(() => {
    if (!open) return
    setQ(''); setActive(0)
    const t = setTimeout(() => inputRef.current?.focus(), 60)
    return () => clearTimeout(t)
  }, [open])

  const results = useMemo(() => {
    const s = q.trim().toLowerCase()
    if (!s) return []
    const rows = [
      ...(commitments || []).filter(c => c.date && (c.text || '').toLowerCase().includes(s))
        .map(c => ({ date: c.date, label: c.text, kind: 'Commitment', color: KIND_COLOR.Commitment })),
      ...(events || []).filter(ev => (ev.label || '').toLowerCase().includes(s))
        .map(ev => ({ date: ev.startDate, label: ev.label, kind: 'Event', color: ev.color || '#7C3AED' })),
      ...(log || []).filter(e => (e.label || '').toLowerCase().includes(s))
        .map(e => ({ date: e.date || (e.ts ? e.ts.split('T')[0] : ''), label: e.label, kind: 'Done', color: KIND_COLOR.Done })),
    ].filter(r => r.date)
    // De-dupe identical label+date, most recent first.
    const seen = new Set()
    return rows
      .sort((a, b) => b.date.localeCompare(a.date))
      .filter(r => { const k = r.kind + r.label + r.date; if (seen.has(k)) return false; seen.add(k); return true })
      .slice(0, 30)
  }, [q, commitments, events, log])

  // Keep the active row in range as results change.
  useEffect(() => { setActive(0) }, [q])

  const choose = (r) => { if (!r) return; onJump(r.date); onClose() }

  const onKeyDown = (e) => {
    if (e.key === 'Escape') { onClose(); return }
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(a => Math.min(a + 1, results.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(a => Math.max(a - 1, 0)) }
    else if (e.key === 'Enter') { e.preventDefault(); choose(results[active]) }
  }

  if (!open) return null

  return (
    <div className="search-overlay" onClick={onClose}>
      <div className="search-panel" onClick={e => e.stopPropagation()}>
        <div className="search-bar">
          <SearchIcon />
          <input
            ref={inputRef}
            value={q}
            onChange={e => setQ(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Search events & commitments…"
            enterKeyHint="search"
            autoComplete="off"
            aria-label="Search your calendar" />
          <button className="search-esc" onClick={onClose}>Esc</button>
        </div>
        <div className="search-results">
          {!q && (
            <div className="search-hint">
              Start typing to find a commitment, event, or something you finished —<br />
              pick one to jump straight to it on your calendar.
            </div>
          )}
          {q && results.length === 0 && (
            <div className="search-empty">No matches for “{q}”.</div>
          )}
          {results.map((r, i) => (
            <div key={i}
              className={`search-row ${i === active ? 'active' : ''}`}
              onMouseEnter={() => setActive(i)}
              onClick={() => choose(r)}>
              <span className="search-kind" style={{ color: r.color }}>{r.kind === 'Done' ? '✓ Done' : r.kind}</span>
              <span className="search-label"><Highlighted text={r.label} q={q} /></span>
              <span className="search-date">{fmtDate(r.date)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
