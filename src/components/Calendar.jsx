import { useState } from 'react'
import { Icon } from './IconPicker.jsx'

// Pastel shading for how busy a day is (number of events on it).
const BUSY_SHADES = ['#F4F0FA', '#EAE1F4', '#DBC9EC', '#C9AEDF']
function busyShade(count) {
  if (count <= 0) return null
  return BUSY_SHADES[Math.min(count, BUSY_SHADES.length) - 1]
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

export default function Calendar({ commitments, vacations, categories }) {
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

  const resolveCat = (id) => {
    const found = (categories || []).find(c => c.id === id)
    return { color: found?.color || '#9CA3AF', icon: found?.icon || '', label: found?.label || id || 'Commitment' }
  }

  // Each commitment event now carries its own category's color + icon, so the
  // calendar matches the tag you picked on the Commitments tab (no longer a
  // single generic "commitment" style).
  const allEvents = (commitments || [])
    .filter(c => c.date)
    .map(c => {
      const cat = resolveCat(c.cat)
      return {
        date: c.date,
        text: c.text,
        label: c.time ? `${fmt12(c.time)} ${c.text}` : c.text,
        done: c.done,
        color: cat.color, icon: cat.icon, catLabel: cat.label,
      }
    })
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
            // Busier days get a deeper pastel wash. Selected keeps its own bg.
            const shade = busyShade(evs.length)
            return (
              <div key={day}
                className={`cal-cell ${isSel ? 'selected' : ''} ${isTdy ? 'today-cell' : ''}`}
                style={!isSel && shade ? { background: shade } : undefined}
                onClick={() => setSelected(isSel ? null : dateStr)}>
                <div className="cal-day-num" style={{ color: isTdy ? 'var(--teal)' : undefined, fontWeight: isTdy ? 700 : undefined }}>{day}</div>
                {evs.slice(0,2).map((e, j) => (
                  <div key={j} className="cal-evt">
                    <div className="cal-evt-dot" style={{ background: e.color, opacity: e.done ? .4 : 1 }} />
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
          {selectedEvents.map((e, i) => (
            <div key={i} style={{ display:'flex', gap:10, alignItems:'center', padding:'9px 12px', borderRadius:8, marginBottom:6, background:`${e.color}14`, border:`1px solid ${e.color}44`, opacity: e.done ? .5 : 1 }}>
              <span style={{ display:'inline-flex', alignItems:'center', gap:4, fontSize:10, letterSpacing:1, textTransform:'uppercase', color:e.color, minWidth:70, fontWeight:600 }}>
                {e.icon && <Icon value={e.icon} size={12} />}{e.catLabel}
              </span>
              <div style={{ fontSize:13, color:'var(--text)', textDecoration: e.done ? 'line-through' : 'none' }}>{e.label}</div>
            </div>
          ))}
        </div>
      )}

      <div className="divider" />
      {/* Busyness legend */}
      <div style={{ display:'flex', alignItems:'center', gap:6, marginTop:18 }}>
        <span style={{ fontSize:11, color:'var(--muted)' }}>Quieter</span>
        <div style={{ width:16, height:16, borderRadius:4, background:'white', border:'1px solid var(--border)' }} />
        {BUSY_SHADES.map(c => <div key={c} style={{ width:16, height:16, borderRadius:4, background:c }} />)}
        <span style={{ fontSize:11, color:'var(--muted)' }}>Busier</span>
      </div>
    </div>
  )
}
