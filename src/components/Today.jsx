import { useState, useMemo } from 'react'
import { DAILY_TODOS, MORNING_ROUTINE } from '../data/schedule.js'

const TAG_CLASS = {
  health:'tag-health', class:'tag-class', lab:'tag-lab', career:'tag-career',
  fitness:'tag-fitness', personal:'tag-personal', sleep:'tag-sleep',
  urgent:'tag-urgent', carried:'tag-carried', polish:'tag-polish',
}

function todayKey() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}

function todayLabel() {
  return new Date().toLocaleDateString('en-US', { weekday:'long', month:'long', day:'numeric' })
}

export default function Today({ todos, updateTodos, appendLog }) {
  const [morningOpen, setMorningOpen] = useState(false)
  const dateKey = todayKey()
  const dayTodos = DAILY_TODOS[dateKey] || []

  const toggle = async (id, label, tag) => {
    const current = todos[id] ?? false
    const next = { ...todos, [id]: !current }
    await updateTodos(next)
    if (!current) {
      // Just checked — add to log
      await appendLog({ date: dateKey, dateLabel: todayLabel(), label, tag })
    }
  }

  const resetDay = async () => {
    if (!confirm('Reset all of today\'s checkboxes?')) return
    const next = { ...todos }
    dayTodos.forEach(t => { delete next[t.id] })
    await updateTodos(next)
  }

  const doneCount = dayTodos.filter(t => todos[t.id]).length

  return (
    <div>
      <div className="page-title">{todayLabel()}</div>
      <div className="page-sub">{doneCount}/{dayTodos.length} tasks done today</div>

      {/* Morning routine collapsible */}
      <div
        onClick={() => setMorningOpen(o => !o)}
        style={{ background:'white', borderRadius:12, border:'1px solid var(--border)', padding:'12px 16px', marginBottom:12, cursor:'pointer', userSelect:'none' }}
      >
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            <span style={{ fontSize:18 }}>☀️</span>
            <div>
              <div className="serif" style={{ fontSize:16, color:'var(--text)', fontWeight:600 }}>Morning Routine</div>
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
                <div>
                  <div className="routine-habit">{item.habit}</div>
                  <div className="routine-detail">{item.detail}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Today's todos */}
      <p className="section-label">Today's Schedule</p>

      {dayTodos.length === 0 ? (
        <div style={{ background:'white', borderRadius:12, border:'1px solid var(--border)', padding:'20px', textAlign:'center', color:'var(--muted)', fontSize:13 }}>
          No schedule loaded for today ({dateKey}).
          <div style={{ marginTop:8, fontSize:11 }}>Claude adds new days to DAILY_TODOS in schedule.js.</div>
        </div>
      ) : (
        dayTodos.map(t => {
          const done = todos[t.id] ?? false
          return (
            <div key={t.id} className={`todo-item ${done ? 'done' : ''}`} onClick={() => toggle(t.id, t.label, t.tag)}>
              <div className="todo-check">
                <span className="todo-check-mark">✓</span>
              </div>
              <div style={{ flex:1 }}>
                <div className="todo-label">{t.label}</div>
                {t.note && <div className="todo-note">{t.note}</div>}
                <span className={`tag ${TAG_CLASS[t.tag] || 'tag-class'}`}>{t.tag}</span>
              </div>
            </div>
          )
        })
      )}

      <div style={{ display:'flex', gap:8, marginTop:12, flexWrap:'wrap' }}>
        <button className="btn-ghost" onClick={resetDay}>Reset today</button>
      </div>
    </div>
  )
}
