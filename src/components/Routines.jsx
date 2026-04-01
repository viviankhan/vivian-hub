// src/components/Routines.jsx
import { useState } from 'react'
import { MORNING_ROUTINE, NIGHT_ROUTINE } from '../data/schedule.js'

const CAT_COLORS = {
  sleep:   { bg:'#E8F4F0', text:'#2D6A4F' },
  health:  { bg:'#FFF3E4', text:'#7B4F1E' },
  polish:  { bg:'#F5EEF8', text:'#6B3FA0' },
  fitness: { bg:'#EDF2FB', text:'#1E3A8A' },
  career:  { bg:'#FEF9E7', text:'#78350F' },
}

function RoutineList({ items }) {
  return items.map(item => {
    const c = CAT_COLORS[item.cat] || CAT_COLORS.career
    return (
      <div key={item.habit} className="routine-item">
        <div className="routine-time">{item.time}</div>
        <div className="routine-icon">{item.icon}</div>
        <div style={{ flex:1 }}>
          <div className="routine-habit">{item.habit}</div>
          <div className="routine-detail">{item.detail}</div>
          <span className="tag" style={{ background:c.bg, color:c.text }}>{item.cat}</span>
        </div>
      </div>
    )
  })
}

function Accordion({ title, sub, icon, children }) {
  const [open, setOpen] = useState(false)
  return (
    <div style={{ marginBottom:10 }}>
      <div className={`accordion-header ${open ? 'open' : ''}`} onClick={() => setOpen(o=>!o)}>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <span style={{ fontSize:20 }}>{icon}</span>
          <div>
            <div className="serif" style={{ fontSize:18, color:'var(--sand)', fontWeight:600 }}>{title}</div>
            <div style={{ fontSize:11, color:'var(--green-mid)', marginTop:1 }}>{sub}</div>
          </div>
        </div>
        <span className={`accordion-chevron ${open ? 'open' : ''}`}>▾</span>
      </div>
      {open && <div className="accordion-body">{children}</div>}
    </div>
  )
}

export function Routines() {
  return (
    <div>
      <div className="page-title">Routines</div>
      <div className="page-sub">Daily habits · Weekdays</div>
      <Accordion title="Morning Routine" sub="6:00 – 7:50 AM · Weekdays" icon="☀️">
        <RoutineList items={MORNING_ROUTINE} />
      </Accordion>
      <Accordion title="Night Routine" sub="5:00 PM – 10:30 PM" icon="🌙">
        <RoutineList items={NIGHT_ROUTINE} />
      </Accordion>
    </div>
  )
}

export default Routines
