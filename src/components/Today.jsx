import { useState, useEffect } from 'react'
import { DAILY_TODOS, MORNING_ROUTINE } from '../data/schedule.js'

const TAG_CLASS = {
  health:'tag-health', class:'tag-class', lab:'tag-lab', career:'tag-career',
  fitness:'tag-fitness', personal:'tag-personal', sleep:'tag-sleep',
  urgent:'tag-urgent', carried:'tag-carried', polish:'tag-polish',
  meeting:'tag-career', deadline:'tag-urgent', social:'tag-personal',
}

function todayKey() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}

function todayLabel() {
  return new Date().toLocaleDateString('en-US', { weekday:'long', month:'long', day:'numeric' })
}

function nowMinutes() {
  const d = new Date(); return d.getHours() * 60 + d.getMinutes()
}

function parseTaskMinutes(label) {
  const m = label.match(/~?(\d{1,2}):(\d{2})\s*(AM|PM)/i)
  if (!m) return null
  let h = parseInt(m[1]); const min = parseInt(m[2]); const ampm = m[3].toUpperCase()
  if (ampm === 'PM' && h !== 12) h += 12
  if (ampm === 'AM' && h === 12) h = 0
  return h * 60 + min
}

function timeToMinutes(t) {
  if (!t) return null
  const [h, m] = t.split(':').map(Number); return h * 60 + m
}

function fmt12(t) {
  if (!t) return ''
  const [h, m] = t.split(':').map(Number)
  const ampm = h >= 12 ? 'PM' : 'AM'; const h12 = h % 12 || 12
  return `${h12}:${String(m).padStart(2,'0')} ${ampm}`
}

function TodoRow({ id, label, note, tag, done, overdue, onToggle }) {
  return (
    <div style={{
      display:'flex', gap:12, alignItems:'flex-start',
      background: overdue ? '#FFF5F5' : 'white',
      borderRadius:12,
      border: `1px solid ${overdue ? '#FECACA' : 'var(--border)'}`,
      padding:'12px 16px', marginBottom:8,
      opacity: done ? .42 : 1, cursor:'pointer',
    }} onClick={onToggle}>
      <div style={{
        width:20, height:20, borderRadius:'50%', flexShrink:0, marginTop:2,
        border: done ? 'none' : overdue ? '2px solid #FCA5A5' : '2px solid #D1D5DB',
        background: done ? '#52B788' : 'transparent',
        display:'flex', alignItems:'center', justifyContent:'center', transition:'all .2s',
      }}>
        {done && <span style={{ color:'white', fontSize:11, fontWeight:700 }}>✓</span>}
      </div>
      <div style={{ flex:1 }}>
        <div style={{ fontSize:13, fontWeight:500, color:'var(--text)', textDecoration: done ? 'line-through' : 'none' }}>{label}</div>
        {note && <div style={{ fontSize:11, color:'var(--muted)', marginTop:2, lineHeight:1.4 }}>{note}</div>}
        <div style={{ display:'flex', gap:6, marginTop:4, flexWrap:'wrap', alignItems:'center' }}>
          <span className={`tag ${TAG_CLASS[tag] || 'tag-class'}`}>{tag}</span>
          {overdue && !done && <span style={{ fontSize:9, letterSpacing:1, textTransform:'uppercase', padding:'2px 7px', borderRadius:10, background:'#FEE2E2', color:'#991B1B', fontWeight:600 }}>overdue</span>}
        </div>
      </div>
    </div>
  )
}

export default function Today({ todos, weekState, syncToggle, commitments }) {
  const [morningOpen, setMorningOpen] = useState(false)
  const [now, setNow] = useState(nowMinutes())

  useEffect(() => {
    const t = setInterval(() => setNow(nowMinutes()), 60000)
    return () => clearInterval(t)
  }, [])

  const dateKey = todayKey()
  const templateTodos = DAILY_TODOS[dateKey] || []

  // Commitments for today
  const todayCommitments = (commitments || []).filter(c => c.date === dateKey && !c.done)

  const isDone = (id) => !!(todos[id] || weekState[id])

  // Sort commitments by time, put untimed ones at end
  const sortedCommitments = [...todayCommitments].sort((a, b) => {
    if (!a.time && !b.time) return 0
    if (!a.time) return 1
    if (!b.time) return -1
    return a.time.localeCompare(b.time)
  })

  const doneCount = templateTodos.filter(t => isDone(t.id)).length
    + todayCommitments.filter(c => isDone(c.id)).length
  const totalCount = templateTodos.length + todayCommitments.length

  return (
    <div>
      <div className="page-title">{todayLabel()}</div>
      <div className="page-sub">{doneCount}/{totalCount} tasks done today</div>

      {/* Morning routine */}
      <div onClick={() => setMorningOpen(o => !o)}
        style={{ background:'white', borderRadius:12, border:'1px solid var(--border)', padding:'12px 16px', marginBottom:12, cursor:'pointer', userSelect:'none' }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            <span style={{ fontSize:18 }}>☀️</span>
            <div>
              <div className="serif" style={{ fontSize:16, fontWeight:600 }}>Morning Routine</div>
              <div style={{ fontSize:11, color:'var(--muted)', marginTop:1 }}>6:00 – 7:50 AM · {morningOpen ? 'tap to collapse' : 'tap to expand'}</div>
            </div>
          </div>
          <span style={{ color:'var(--muted)', fontSize:14, transform: morningOpen ? 'rotate(180deg)' : '', transition:'transform .2s' }}>▾</span>
        </div>
        {morningOpen && (
          <div onClick={e => e.stopPropagation()} style={{ marginTop:14, borderTop:'1px solid var(--border)', paddingTop:12 }}>
            {MORNING_ROUTINE.map(item => (
              <div key={item.habit} className="routine-item">
                <div className="routine-time">{item.time}</div>
                <div className="routine-icon">{item.icon}</div>
                <div><div className="routine-habit">{item.habit}</div><div className="routine-detail">{item.detail}</div></div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Today's commitments (shown first, with time if set) */}
      {sortedCommitments.length > 0 && (
        <>
          <p className="section-label">Commitments Today</p>
          {sortedCommitments.map(c => {
            const label = c.time ? `${fmt12(c.time)} — ${c.text}` : c.text
            const note = [c.person && `With: ${c.person}`, c.prepMin && `Leave ${c.prepMin} min early`].filter(Boolean).join(' · ')
            const mins = timeToMinutes(c.time)
            const overdue = mins !== null && now > mins + 10 && !c.done
            return (
              <TodoRow key={c.id} id={c.id} label={label} note={note || undefined}
                tag={c.cat} done={isDone(c.id)} overdue={overdue}
                onToggle={() => syncToggle(c.id, c.text, c.cat)} />
            )
          })}
        </>
      )}

      {/* Template schedule */}
      <p className="section-label">Today's Schedule</p>
      {templateTodos.length === 0 ? (
        <div style={{ background:'white', borderRadius:12, border:'1px solid var(--border)', padding:20, textAlign:'center', color:'var(--muted)', fontSize:13 }}>
          No schedule for {dateKey} — Claude adds new days to DAILY_TODOS in schedule.js.
        </div>
      ) : templateTodos.map(t => {
        const done = isDone(t.id)
        const mins = parseTaskMinutes(t.label)
        const overdue = !done && mins !== null && now > mins + 10
        return (
          <TodoRow key={t.id} id={t.id} label={t.label} note={t.note}
            tag={t.tag} done={done} overdue={overdue}
            onToggle={() => syncToggle(t.id, t.label, t.tag)} />
        )
      })}

      <div style={{ marginTop:12 }}>
        <button className="btn-ghost" onClick={() => { if (confirm('Reset all checkboxes for today?')) window.location.reload() }}>Reset today</button>
      </div>
    </div>
  )
}
