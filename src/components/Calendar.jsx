import { useState } from 'react'

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

const calNavBtn = { fontSize:16, lineHeight:1, width:32, height:32, borderRadius:9, border:'1px solid var(--border)', background:'white', color:'var(--muted)', cursor:'pointer', fontFamily:'DM Sans,sans-serif', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }

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

export default function Calendar({ commitments, vacations }) {
  // monthOffset shifts by whole months from the current month: 0 = this month,
  // -1 = last month, +1 = next month, and so on — unbounded either way.
  const [monthOffset, setMonthOffset] = useState(0)
  const [selected, setSelected] = useState(null)
  const today = todayStr()

  const now = new Date()
  const base = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1)
  const year = base.getFullYear(), month = base.getMonth()
  const monthName = base.toLocaleString('en-US', { month:'long' })
  const daysInMonth = new Date(year, month+1, 0).getDate()
  const firstDay = new Date(year, month, 1).getDay()

  const goMonth = (delta) => { setMonthOffset(o => o + delta); setSelected(null) }

  // The calendar shows your scheduled commitments. (Vacation blocks are set
  // on the Commitments tab; nothing else is pre-populated here.)
  const allEvents = (commitments || [])
    .filter(c => c.date)
    .map(c => ({
      date: c.date,
      label: c.time ? `${fmt12(c.time)} ${c.text}` : c.text,
      type: 'commitment',
      done: c.done,
    }))
  const selectedEvents = selected ? allEvents.filter(e => e.date === selected) : []

  return (
    <div>
      <div className="page-title">Calendar</div>
      <div className="page-sub">Your scheduled commitments</div>

      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:10, marginBottom:14, flexWrap:'wrap' }}>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <button onClick={()=>goMonth(-1)} title="Previous month" style={calNavBtn}>‹</button>
          <div className="serif" style={{ fontSize:18, fontWeight:600, color:'var(--text)', minWidth:150, textAlign:'center' }}>{monthName} {year}</div>
          <button onClick={()=>goMonth(1)} title="Next month" style={calNavBtn}>›</button>
        </div>
        {monthOffset !== 0 && (
          <button onClick={()=>{ setMonthOffset(0); setSelected(null) }}
            style={{ fontSize:11, padding:'7px 12px', borderRadius:9, border:'1px solid var(--teal)', background:'#F0FDFB', color:'var(--teal)', cursor:'pointer', fontFamily:'DM Sans,sans-serif', fontWeight:600 }}>
            This month
          </button>
        )}
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
