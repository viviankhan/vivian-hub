import { useState } from 'react'
import { CALENDAR_EVENTS } from '../data/schedule.js'

const MONTHS = [
  { year:2026, month:2, name:'March' },
  { year:2026, month:3, name:'April' },
  { year:2026, month:4, name:'May'   },
  { year:2026, month:5, name:'June'  },
]

const TYPE_STYLES = {
  capstone: { bg:'#EFF6FF', border:'#3B82F6', text:'#1E3A8A', dot:'#2563EB', label:'Capstone' },
  lab:      { bg:'#ECFDF5', border:'#10B981', text:'#065F46', dot:'#059669', label:'Lab'      },
  quiz:     { bg:'#FEF3C7', border:'#F59E0B', text:'#92400E', dot:'#F59E0B', label:'Quiz'     },
  deadline: { bg:'#FEE2E2', border:'#EF4444', text:'#7F1D1D', dot:'#EF4444', label:'Due'      },
  travel:   { bg:'#DBEAFE', border:'#3B82F6', text:'#1E3A8A', dot:'#3B82F6', label:'Travel'   },
  event:    { bg:'#D1FAE5', border:'#10B981', text:'#064E3B', dot:'#10B981', label:'Event'    },
  noclass:  { bg:'#F3F4F6', border:'#9CA3AF', text:'#374151', dot:'#9CA3AF', label:'No Class' },
  class:    { bg:'#EDE9FE', border:'#7C3AED', text:'#3B0764', dot:'#7C3AED', label:'Class'    },
  optional: { bg:'#FDF4FF', border:'#C084FC', text:'#581C87', dot:'#C084FC', label:'Optional' },
}

function ds(year, month, day) {
  return `${year}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`
}

function todayStr() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}

export default function Calendar() {
  const [monthIdx, setMonthIdx] = useState(1)
  const [selected, setSelected] = useState(null)
  const today = todayStr()

  const { year, month, name } = MONTHS[monthIdx]
  const daysInMonth = new Date(year, month+1, 0).getDate()
  const firstDay = new Date(year, month, 1).getDay()

  const selectedEvents = selected ? CALENDAR_EVENTS.filter(e => e.date === selected) : []
  const sortedAll = [...CALENDAR_EVENTS].sort((a,b) => a.date.localeCompare(b.date))

  return (
    <div>
      <div className="page-title">Calendar</div>
      <div className="page-sub">Spring 2026 — all deadlines and events</div>

      {/* Month buttons */}
      <div className="cal-month-btns">
        {MONTHS.map((m, i) => (
          <button key={i} className={`cal-month-btn ${i===monthIdx ? 'active' : ''}`} onClick={() => { setMonthIdx(i); setSelected(null) }}>
            {m.name}
          </button>
        ))}
      </div>

      {/* Grid */}
      <div className="cal-scroll">
        <div className="cal-grid">
          {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d => (
            <div key={d} className="cal-day-header">{d}</div>
          ))}
          {Array.from({ length: firstDay }).map((_, i) => <div key={'e'+i} />)}
          {Array.from({ length: daysInMonth }).map((_, i) => {
            const day = i + 1
            const dateStr = ds(year, month, day)
            const evs = CALENDAR_EVENTS.filter(e => e.date === dateStr)
            const isSel = dateStr === selected
            const isTdy = dateStr === today
            return (
              <div
                key={day}
                className={`cal-cell ${isSel ? 'selected' : ''} ${isTdy ? 'today-cell' : ''}`}
                onClick={() => setSelected(isSel ? null : dateStr)}
              >
                <div className="cal-day-num" style={{ color: isTdy ? 'var(--teal)' : undefined, fontWeight: isTdy ? 700 : undefined }}>{day}</div>
                {evs.slice(0,2).map((e, j) => (
                  <div key={j} className="cal-evt">
                    <div className="cal-evt-dot" style={{ background: (TYPE_STYLES[e.type]||TYPE_STYLES.class).dot }} />
                    <div className="cal-evt-label">{e.label}</div>
                  </div>
                ))}
                {evs.length > 2 && <div style={{ fontSize:8, color:'var(--muted)', marginTop:1 }}>+{evs.length-2}</div>}
              </div>
            )
          })}
        </div>
      </div>

      {/* Selected day detail */}
      {selected && selectedEvents.length > 0 && (
        <div style={{ marginTop:14, background:'white', borderRadius:14, border:'1px solid var(--border)', padding:'16px 20px' }}>
          <div className="serif" style={{ fontSize:20, color:'var(--text)', fontWeight:600, marginBottom:10 }}>
            {new Date(selected+'T12:00:00').toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric'})}
          </div>
          {selectedEvents.map((e, i) => {
            const s = TYPE_STYLES[e.type] || TYPE_STYLES.class
            return (
              <div key={i} style={{ display:'flex', gap:12, padding:'9px 12px', borderRadius:8, marginBottom:6, background:s.bg, border:`1px solid ${s.border}` }}>
                <div style={{ fontSize:10, letterSpacing:1, textTransform:'uppercase', color:s.text, minWidth:55, fontWeight:500, paddingTop:2 }}>{s.label}</div>
                <div style={{ fontSize:13, color:'var(--text)' }}>{e.label}</div>
              </div>
            )
          })}
        </div>
      )}

      <div className="divider" />

      {/* All events list */}
      <p className="section-label">All Events</p>
      {sortedAll.map((e, i) => {
        const s = TYPE_STYLES[e.type] || TYPE_STYLES.class
        const d = new Date(e.date+'T12:00:00')
        return (
          <div key={i} style={{ display:'flex', gap:12, alignItems:'flex-start', padding:'8px 0', borderBottom:'1px solid #F0EBE0' }}>
            <div style={{ fontSize:11, color:'var(--muted)', minWidth:56, flexShrink:0 }}>{d.toLocaleDateString('en-US',{month:'short',day:'numeric'})}</div>
            <div style={{ width:7, height:7, borderRadius:'50%', background:s.dot, marginTop:4, flexShrink:0 }} />
            <div style={{ fontSize:12, color:'var(--text)' }}>{e.label}</div>
          </div>
        )
      })}

      {/* Legend */}
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
