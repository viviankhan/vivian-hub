import { useState } from 'react'
import { CALENDAR_EVENTS, generateRecurringEvents, SEMESTER_START, SEMESTER_END } from '../data/schedule.js'

// Dynamic: current month + 5 ahead
function buildMonths() {
  const now = new Date()
  return Array.from({ length: 6 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1)
    return { year: d.getFullYear(), month: d.getMonth(), name: d.toLocaleString('en-US', { month:'long' }) }
  })
}
const MONTHS = buildMonths()

const TYPE_STYLES = {
  capstone:   { bg:'#EFF6FF', border:'#3B82F6', text:'#1E3A8A', dot:'#2563EB', label:'Capstone' },
  lab:        { bg:'#ECFDF5', border:'#10B981', text:'#065F46', dot:'#059669', label:'Lab'      },
  quiz:       { bg:'#FEF3C7', border:'#F59E0B', text:'#92400E', dot:'#F59E0B', label:'Quiz'     },
  deadline:   { bg:'#FEE2E2', border:'#EF4444', text:'#7F1D1D', dot:'#EF4444', label:'Due'      },
  travel:     { bg:'#DBEAFE', border:'#3B82F6', text:'#1E3A8A', dot:'#3B82F6', label:'Travel'   },
  event:      { bg:'#D1FAE5', border:'#10B981', text:'#064E3B', dot:'#10B981', label:'Event'    },
  noclass:    { bg:'#F3F4F6', border:'#9CA3AF', text:'#374151', dot:'#9CA3AF', label:'No Class' },
  class:      { bg:'#EDE9FE', border:'#7C3AED', text:'#3B0764', dot:'#7C3AED', label:'Class'    },
  optional:   { bg:'#FDF4FF', border:'#C084FC', text:'#581C87', dot:'#C084FC', label:'Optional' },
  commitment: { bg:'#FFF7ED', border:'#F97316', text:'#9A3412', dot:'#F97316', label:'Commitment'},
}

function ds(year, month, day) {
  return `${year}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`
}
function todayStr() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}
function fmt12(t) {
  if (!t) return ''
  const [h, m] = t.split(':').map(Number)
  return `${h % 12 || 12}:${String(m).padStart(2,'0')} ${h >= 12 ? 'PM' : 'AM'}`
}

export default function Calendar({ commitments }) {
  const [monthIdx, setMonthIdx] = useState(0)
  const [selected, setSelected] = useState(null)
  const today = todayStr()

  const { year, month } = MONTHS[monthIdx]
  const daysInMonth = new Date(year, month+1, 0).getDate()
  const firstDay = new Date(year, month, 1).getDay()

  // Merge static events + recurring weekly events + commitments (with date)
  const recurringEvents = generateRecurringEvents(SEMESTER_START, SEMESTER_END)

  const commitmentEvents = (commitments || [])
    .filter(c => c.date)
    .map(c => ({
      date: c.date,
      label: c.time ? `${fmt12(c.time)} ${c.text}` : c.text,
      type: 'commitment',
      done: c.done,
    }))

  const allEvents = [...CALENDAR_EVENTS, ...recurringEvents, ...commitmentEvents]
  const selectedEvents = selected ? allEvents.filter(e => e.date === selected) : []
  const sortedAll = [...allEvents].sort((a,b) => a.date.localeCompare(b.date))

  return (
    <div>
      <div className="page-title">Calendar</div>
      <div className="page-sub">{MONTHS[0].name} {MONTHS[0].year} → {MONTHS[MONTHS.length-1].name} · includes your commitments</div>

      <div className="cal-month-btns">
        {MONTHS.map((m, i) => (
          <button key={i} className={`cal-month-btn ${i===monthIdx ? 'active' : ''}`}
            onClick={() => { setMonthIdx(i); setSelected(null) }}>{m.name}</button>
        ))}
      </div>

      <div className="cal-scroll">
        <div className="cal-grid">
          {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d => (
            <div key={d} className="cal-day-header">{d}</div>
          ))}
          {Array.from({ length: firstDay }).map((_, i) => <div key={'e'+i} />)}
          {Array.from({ length: daysInMonth }).map((_, i) => {
            const day = i + 1
            const dateStr = ds(year, month, day)
            const evs = allEvents.filter(e => e.date === dateStr)
            const isSel = dateStr === selected
            const isTdy = dateStr === today
            return (
              <div key={day}
                className={`cal-cell ${isSel ? 'selected' : ''} ${isTdy ? 'today-cell' : ''}`}
                onClick={() => setSelected(isSel ? null : dateStr)}>
                <div className="cal-day-num" style={{ color: isTdy ? 'var(--teal)' : undefined, fontWeight: isTdy ? 700 : undefined }}>{day}</div>
                {evs.slice(0,2).map((e, j) => (
                  <div key={j} className="cal-evt">
                    <div className="cal-evt-dot" style={{ background: (TYPE_STYLES[e.type]||TYPE_STYLES.class).dot, opacity: e.done ? .4 : 1 }} />
                    <div className="cal-evt-label" style={{ textDecoration: e.done ? 'line-through' : 'none', opacity: e.done ? .5 : 1 }}>{e.label}</div>
                  </div>
                ))}
                {evs.length > 2 && <div style={{ fontSize:8, color:'var(--muted)', marginTop:1 }}>+{evs.length-2}</div>}
              </div>
            )
          })}
        </div>
      </div>

      {selected && selectedEvents.length > 0 && (
        <div style={{ marginTop:14, background:'white', borderRadius:14, border:'1px solid var(--border)', padding:'16px 20px' }}>
          <div className="serif" style={{ fontSize:20, color:'var(--text)', fontWeight:600, marginBottom:10 }}>
            {new Date(selected+'T12:00:00').toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric'})}
          </div>
          {selectedEvents.map((e, i) => {
            const s = TYPE_STYLES[e.type] || TYPE_STYLES.class
            return (
              <div key={i} style={{ display:'flex', gap:12, padding:'9px 12px', borderRadius:8, marginBottom:6, background:s.bg, border:`1px solid ${s.border}`, opacity: e.done ? .5 : 1 }}>
                <div style={{ fontSize:10, letterSpacing:1, textTransform:'uppercase', color:s.text, minWidth:70, fontWeight:500, paddingTop:2 }}>{s.label}</div>
                <div style={{ fontSize:13, color:'var(--text)', textDecoration: e.done ? 'line-through' : 'none' }}>{e.label}</div>
              </div>
            )
          })}
        </div>
      )}

      <div className="divider" />
      <p className="section-label">All Events</p>
      {sortedAll.map((e, i) => {
        const s = TYPE_STYLES[e.type] || TYPE_STYLES.class
        const d = new Date(e.date+'T12:00:00')
        return (
          <div key={i} style={{ display:'flex', gap:12, alignItems:'flex-start', padding:'8px 0', borderBottom:'1px solid #F0EBE0', opacity: e.done ? .45 : 1 }}>
            <div style={{ fontSize:11, color:'var(--muted)', minWidth:56, flexShrink:0 }}>{d.toLocaleDateString('en-US',{month:'short',day:'numeric'})}</div>
            <div style={{ width:7, height:7, borderRadius:'50%', background:s.dot, marginTop:4, flexShrink:0 }} />
            <div style={{ fontSize:12, color:'var(--text)', textDecoration: e.done ? 'line-through' : 'none' }}>{e.label}</div>
          </div>
        )
      })}

      <div style={{ display:'flex', flexWrap:'wrap', gap:10, marginTop:18 }}>
        {Object.entries(TYPE_STYLES).map(([type, s]) => (
          <div key={type} style={{ display:'flex', alignItems:'center', gap:5 }}>
            <div style={{ width:7, height:7, borderRadius:'50%', background:s.dot }} />
            <span style={{ fontSize:11, color:'var(--muted)' }}>{s.label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
