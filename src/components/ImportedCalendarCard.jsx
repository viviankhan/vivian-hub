// src/components/ImportedCalendarCard.jsx
// The "From your calendars" card on Today — the events a subscribed calendar
// dropped on this day, shown as unscheduled tasks with a recommended time.
//
// Each row shows where it came from (the calendar's color + name), and either
// the time the event already carries or, for an all-day / untimed one, a
// recommended slot found in the day's open gaps. You can tick it off (a real
// completion, so it reads as done everywhere) or "Add to my schedule", which
// copies it into your own commitments at that time so you can move it freely.
import { Icon } from './IconPicker.jsx'
import { fmt12, minsToHHMM } from '../lib/importedTasks.js'
import { DEFAULT_CAL_COLOR } from '../lib/calendars.js'

function rangeText(row) {
  if (row.startMins == null) return 'anytime'
  const end = minsToHHMM(row.startMins + (row.dur || 0))
  return `${fmt12(minsToHHMM(row.startMins))} – ${fmt12(end)}`
}

export default function ImportedCalendarCard({ rows = [], adoptions = {}, isDone, onToggle, onAdopt, onOpen, dayLabel = 'today' }) {
  if (!rows.length) return null
  return (
    <div style={{ background:'white', borderRadius:14, border:'1px solid var(--border)', padding:'12px 14px', marginBottom:14 }}>
      <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:8 }}>
        <span style={{ display:'flex', color:'var(--teal)' }}><Icon value="glyph:calendar" size={16} /></span>
        <span style={{ fontSize:10, fontWeight:800, letterSpacing:1.2, textTransform:'uppercase', color:'var(--muted)' }}>From your calendars</span>
        <span style={{ fontSize:11, color:'var(--muted)', marginLeft:'auto', fontWeight:600 }}>{rows.length}</span>
      </div>

      {rows.map(row => {
        const { span, key } = row
        const color = span.color || DEFAULT_CAL_COLOR
        const done = isDone ? isDone(row) : false
        const adopted = !!adoptions[key]
        return (
          <div key={key} style={{ position:'relative', zIndex:1, display:'flex', alignItems:'flex-start', gap:5, padding:'9px 2px', borderTop:'1px solid #F3F1ED' }}>
            {/* Tick it off — a normal completion, reflected on every view. The
                box stays visually small, but its tap target is a full 44px:
                this row sits at the very left of the day, in the lane the
                wellness rail rides down, and a 20px box at the screen edge is
                a miss waiting to happen on a phone. The negative margins keep
                the bigger target from changing how the row looks. */}
            <button type="button" onClick={(e) => { e.stopPropagation(); onToggle && onToggle(row) }}
              role="checkbox" aria-checked={done} aria-label={`${done ? 'Uncheck' : 'Check off'} ${span.label || 'this event'}`}
              style={{ width:44, height:44, margin:'-12px -11px -12px -11px', padding:0, border:'none', background:'none',
                flexShrink:0, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center',
                // Above the row body: the target overlaps the text beside it,
                // and a later sibling would otherwise paint over the tick and
                // swallow the taps meant for it.
                position:'relative', zIndex:1, WebkitTapHighlightColor:'transparent' }}>
              <span style={{ width:20, height:20, borderRadius:6, display:'flex', alignItems:'center', justifyContent:'center',
                border: done ? 'none' : `2px solid ${color}`, background: done ? color : 'transparent' }}>
                {done && <span style={{ color:'white', fontSize:11, fontWeight:700 }}>✓</span>}
              </span>
            </button>

            <div onClick={() => onOpen && onOpen(row)}
              role={onOpen ? 'button' : undefined} tabIndex={onOpen ? 0 : undefined}
              onKeyDown={onOpen ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(row) } } : undefined}
              title={onOpen ? 'Open its details' : undefined}
              style={{ flex:1, minWidth:0, cursor: onOpen ? 'pointer' : 'default' }}>
              <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                {span.icon && <Icon value={span.icon} size={13} />}
                <span style={{ fontSize:14, fontWeight:600, color: done ? 'var(--muted)' : 'var(--text)',
                  textDecoration: done ? 'line-through' : 'none', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                  {span.label || 'Busy'}
                </span>
              </div>
              <div style={{ display:'flex', alignItems:'center', gap:6, marginTop:3, flexWrap:'wrap' }}>
                <span style={{ display:'inline-flex', alignItems:'center', gap:4, fontSize:10.5, color, fontWeight:700 }}>
                  <span style={{ width:8, height:8, borderRadius:'50%', background:color }} />
                  {span.calendarName || 'Calendar'}
                </span>
                <span style={{ fontSize:11, color:'var(--muted)' }}>·</span>
                {span.allDay
                  ? <span style={{ fontSize:11, color:'var(--muted)' }}>all-day{row.startMins!=null ? ` · ${adopted ? 'scheduled' : 'suggested'} ${rangeText(row)}` : ''}</span>
                  : <span style={{ fontSize:11, color:'var(--muted)' }}>{rangeText(row)}</span>}
                {row.recommended && !adopted && (
                  <span style={{ fontSize:8.5, letterSpacing:.5, textTransform:'uppercase', color:'var(--teal)', border:'1px solid var(--teal)', borderRadius:12, padding:'1px 6px', fontWeight:700 }}>Suggested</span>
                )}
                {span.location && <span style={{ fontSize:11, color:'var(--muted)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', maxWidth:140 }}>· {span.location}</span>}
              </div>
            </div>

            {/* Adopt it into your own schedule (or show it's already been added). */}
            {adopted ? (
              <span style={{ fontSize:9, letterSpacing:.6, textTransform:'uppercase', color:'#5C8A5C', border:'1px solid #BFDFBF',
                borderRadius:20, padding:'3px 9px', fontWeight:700, flexShrink:0, whiteSpace:'nowrap' }}>✓ Added</span>
            ) : (
              <button onClick={(e) => { e.stopPropagation(); onAdopt && onAdopt(row) }} title={`Add "${span.label}" to your schedule for ${dayLabel}`}
                style={{ fontSize:11, padding:'5px 11px', borderRadius:16, border:'1px solid var(--teal)', background:'#F0FDFB',
                  color:'var(--teal)', cursor:'pointer', fontFamily:'DM Sans,sans-serif', fontWeight:700, flexShrink:0, whiteSpace:'nowrap' }}>
                + Schedule
              </button>
            )}
          </div>
        )
      })}
    </div>
  )
}
