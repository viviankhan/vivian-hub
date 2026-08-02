// src/components/RecurringFilter.jsx
// A small "Repeating" filter for the Calendar and Week views: a button that
// opens a checklist of the repeating-task groups (routine groups + Ungrouped)
// plus an "Everyday habits" toggle, so you can add or subtract whole groups
// from the view. Shared by both views; a change syncs to the other instantly.
import { useState, useEffect } from 'react'
import { useOutsideClose } from './IconPicker.jsx'
import {
  getRecurringFilter, setRecurringFilter, RECURRING_FILTER_EVENT,
  groupsInUse, hasDailyRepeats,
} from '../lib/viewFilter.js'

const FunnelIcon = ({ color = 'currentColor' }) => (
  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M3 5h18l-7 8v5l-4 2v-7Z" />
  </svg>
)

function Check({ on, tint }) {
  return (
    <span style={{ width:18, height:18, borderRadius:5, flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center',
      border: on ? 'none' : '2px solid #CDD3DA', background: on ? (tint || 'var(--teal)') : 'transparent' }}>
      {on && <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke={tint ? '#3A3A3A' : '#fff'} strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>}
    </span>
  )
}

function Row({ label, dot, on, onClick }) {
  return (
    <button onClick={onClick}
      style={{ display:'flex', alignItems:'center', gap:10, width:'100%', padding:'8px 10px', border:'none', background:'transparent', cursor:'pointer', fontFamily:'DM Sans,sans-serif', fontSize:13, color:'var(--text)', textAlign:'left', borderRadius:8 }}>
      <Check on={on} tint={dot} />
      {dot && <span style={{ width:9, height:9, borderRadius:'50%', background:dot, flexShrink:0 }} />}
      <span style={{ flex:1, minWidth:0 }}>{label}</span>
    </button>
  )
}

export default function RecurringFilter({ routines = [], rows = [] }) {
  const [open, setOpen] = useState(false)
  const [filter, setFilterState] = useState(getRecurringFilter)
  const ref = useOutsideClose(open, setOpen)

  useEffect(() => {
    const h = () => setFilterState(getRecurringFilter())
    window.addEventListener(RECURRING_FILTER_EVENT, h)
    return () => window.removeEventListener(RECURRING_FILTER_EVENT, h)
  }, [])

  const used = groupsInUse(rows)
  const hasDaily = hasDailyRepeats(rows)
  const groups = [
    ...routines.filter(r => used.has(r.id)).map(r => ({ id: r.id, name: r.name, tint: r.tint })),
    ...(used.has('none') ? [{ id: 'none', name: 'Ungrouped', tint: '#C7CDD4' }] : []),
  ]
  const hidden = new Set(filter.hiddenGroups)
  // How many groups/daily are currently subtracted — shown as a badge.
  const subtracted = hidden.size + (hasDaily && !filter.showDaily ? 1 : 0)

  const toggleGroup = (id) => {
    const next = new Set(hidden)
    next.has(id) ? next.delete(id) : next.add(id)
    setFilterState(setRecurringFilter({ ...filter, hiddenGroups: [...next] }))
  }
  const toggleDaily = () => setFilterState(setRecurringFilter({ ...filter, showDaily: !filter.showDaily }))

  // Nothing repeating to filter — hide the control entirely.
  if (!groups.length && !hasDaily) return null

  return (
    <div ref={ref} style={{ position:'relative', flexShrink:0 }}>
      <button onClick={() => setOpen(o => !o)} title="Show/hide repeating tasks"
        style={{ display:'inline-flex', alignItems:'center', gap:6, fontSize:11, padding:'7px 11px', borderRadius:9, cursor:'pointer', fontFamily:'DM Sans,sans-serif', fontWeight:600,
          border: '1px solid var(--border)', background: open ? 'var(--forest)' : 'white', color: open ? 'var(--green-light)' : 'var(--muted)' }}>
        <FunnelIcon color={open ? 'var(--green-light)' : 'var(--muted)'} />
        Repeating{subtracted ? ` · ${subtracted} off` : ''}
      </button>
      {open && (
        <div style={{ position:'absolute', top:'112%', right:0, zIndex:70, background:'white', border:'1px solid var(--border)', borderRadius:12, boxShadow:'0 12px 34px rgba(30,45,60,.2)', padding:6, minWidth:214 }}>
          <div style={{ fontSize:9.5, letterSpacing:1, textTransform:'uppercase', color:'var(--muted)', fontWeight:700, padding:'6px 10px 4px' }}>Show on this view</div>
          {groups.map(g => (
            <Row key={g.id} label={g.name} dot={g.tint} on={!hidden.has(g.id)} onClick={() => toggleGroup(g.id)} />
          ))}
          {hasDaily && <>
            <div style={{ height:1, background:'#F1EDF2', margin:'4px 8px' }} />
            <Row label="Everyday habits" on={filter.showDaily} onClick={toggleDaily} />
            <div style={{ fontSize:10, color:'var(--muted)', padding:'2px 10px 6px', lineHeight:1.4 }}>Daily repeats are hidden here by default so they don’t fill every day.</div>
          </>}
        </div>
      )}
    </div>
  )
}
