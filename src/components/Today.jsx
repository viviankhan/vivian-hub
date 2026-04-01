import { useState, useEffect, useRef } from 'react'
import { DAILY_TODOS, MORNING_ROUTINE } from '../data/schedule.js'

const TAG_CLASS = {
  health:'tag-health', class:'tag-class', lab:'tag-lab', career:'tag-career',
  fitness:'tag-fitness', personal:'tag-personal', sleep:'tag-sleep',
  urgent:'tag-urgent', carried:'tag-carried', polish:'tag-polish',
}

// ── Helpers ────────────────────────────────────────────────────
function todayKey() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}
function todayLabel() {
  return new Date().toLocaleDateString('en-US', { weekday:'long', month:'long', day:'numeric' })
}
function nowMinutes() {
  const d = new Date()
  return d.getHours() * 60 + d.getMinutes()
}

// Parse a time string like "12:20 PM", "~7:00 PM", "9:35 PM" from a label
function parseTaskMinutes(label) {
  const m = label.match(/~?(\d{1,2}):(\d{2})\s*(AM|PM)/i)
  if (!m) return null
  let h = parseInt(m[1])
  const min = parseInt(m[2])
  const ampm = m[3].toUpperCase()
  if (ampm === 'PM' && h !== 12) h += 12
  if (ampm === 'AM' && h === 12) h = 0
  return h * 60 + min
}

function formatTime(minutes) {
  const h = Math.floor(minutes / 60) % 24
  const m = minutes % 60
  const ampm = h >= 12 ? 'PM' : 'AM'
  const h12 = h % 12 || 12
  return `${h12}:${String(m).padStart(2,'0')} ${ampm}`
}

// ── Reschedule modal ───────────────────────────────────────────
function RescheduleModal({ task, onClose, onPostpone, onSkip }) {
  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.45)', zIndex:500, display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}>
      <div style={{ background:'white', borderRadius:16, padding:24, maxWidth:380, width:'100%', boxShadow:'0 20px 60px rgba(0,0,0,.25)' }}>
        <div style={{ fontFamily:'Cormorant Garamond, serif', fontSize:20, fontWeight:600, color:'var(--text)', marginBottom:6 }}>
          Reschedule Task
        </div>
        <div style={{ fontSize:13, color:'var(--text-light)', marginBottom:20, lineHeight:1.5 }}>
          <strong>{task.label}</strong>
        </div>
        <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
          <button className="btn-primary" style={{ padding:'10px', textAlign:'left', fontSize:12 }} onClick={() => onPostpone('tomorrow')}>
            📅 Carry to tomorrow — appears at top of next day
          </button>
          <button className="btn-ghost" style={{ padding:'10px', textAlign:'left', fontSize:12 }} onClick={() => onPostpone('later')}>
            🕐 Later today — keep on list, remove time warning
          </button>
          <button className="btn-ghost" style={{ padding:'10px', textAlign:'left', fontSize:12, color:'var(--muted)' }} onClick={onSkip}>
            ✕ Skip — remove from today without logging
          </button>
        </div>
        <button className="btn-ghost" style={{ marginTop:12, width:'100%', fontSize:11 }} onClick={onClose}>Cancel</button>
      </div>
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────
export default function Today({ todos, weekState, syncToggle }) {
  const [morningOpen, setMorningOpen] = useState(false)
  const [now, setNow]                 = useState(nowMinutes())
  const [rescheduling, setRescheduling] = useState(null) // task being rescheduled
  const [postponed, setPostponed]       = useState(() => {
    try { return JSON.parse(localStorage.getItem('vivian_postponed_later') || '[]') } catch { return [] }
  })
  const [skipped, setSkipped] = useState(() => {
    try { return JSON.parse(localStorage.getItem(`vivian_skipped_${todayKey()}`) || '[]') } catch { return [] }
  })

  // Tick every minute to keep overdue status fresh
  useEffect(() => {
    const timer = setInterval(() => setNow(nowMinutes()), 60000)
    return () => clearInterval(timer)
  }, [])

  const dateKey  = todayKey()
  const dayTodos = DAILY_TODOS[dateKey] || []

  // Combined done state: true if checked in either todos or weekState
  const isDone = (id) => !!(todos[id] || weekState[id])

  const doneCount = dayTodos.filter(t => isDone(t.id) && !skipped.includes(t.id)).length
  const visibleTodos = dayTodos.filter(t => !skipped.includes(t.id))

  const handleReschedule = (task, choice) => {
    if (choice === 'tomorrow') {
      // Store in a "carry to tomorrow" list — This Week will pick it up
      try {
        const key = 'vivian_carry_tomorrow'
        const existing = JSON.parse(localStorage.getItem(key) || '[]')
        if (!existing.find(t => t.id === task.id)) {
          localStorage.setItem(key, JSON.stringify([...existing, { ...task, fromDate: dateKey }]))
        }
      } catch {}
    } else if (choice === 'later') {
      // Mark as "later today" — removes overdue warning
      const next = [...postponed, task.id]
      setPostponed(next)
      try { localStorage.setItem('vivian_postponed_later', JSON.stringify(next)) } catch {}
    }
    setRescheduling(null)
  }

  const handleSkip = (task) => {
    const next = [...skipped, task.id]
    setSkipped(next)
    try { localStorage.setItem(`vivian_skipped_${dateKey}`, JSON.stringify(next)) } catch {}
    setRescheduling(null)
  }

  const resetDay = () => {
    if (!confirm('Reset all checkboxes for today?')) return
    // Clear todos and weekState for today's task IDs
    const cleared = { ...todos }
    dayTodos.forEach(t => { delete cleared[t.id] })
    // This will be handled by syncToggle — just reload
    try {
      localStorage.removeItem('vivian_postponed_later')
      localStorage.removeItem(`vivian_skipped_${dateKey}`)
    } catch {}
    window.location.reload()
  }

  return (
    <div>
      <div className="page-title">{todayLabel()}</div>
      <div className="page-sub">{doneCount}/{visibleTodos.length} tasks done</div>

      {/* Morning routine collapsible */}
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
                <div>
                  <div className="routine-habit">{item.habit}</div>
                  <div className="routine-detail">{item.detail}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Todo list */}
      <p className="section-label">Today's Schedule</p>

      {visibleTodos.length === 0 ? (
        <div style={{ background:'white', borderRadius:12, border:'1px solid var(--border)', padding:20, textAlign:'center', color:'var(--muted)', fontSize:13 }}>
          No schedule for {dateKey} — Claude adds new days to DAILY_TODOS in schedule.js.
        </div>
      ) : (
        visibleTodos.map(t => {
          const done       = isDone(t.id)
          const taskMins   = parseTaskMinutes(t.label)
          const isPostponed = postponed.includes(t.id)
          // Overdue: has a time, that time has passed, not done, not postponed
          const overdue = !done && !isPostponed && taskMins !== null && now > taskMins + 10

          return (
            <div key={t.id}
              style={{
                display:'flex', gap:12, alignItems:'flex-start',
                background: overdue ? '#FFF5F5' : 'white',
                borderRadius:12,
                border: overdue ? '1px solid #FECACA' : '1px solid var(--border)',
                padding:'12px 16px', marginBottom:8,
                opacity: done ? .42 : 1,
                transition:'all .2s',
              }}>
              {/* Checkbox */}
              <div onClick={() => syncToggle(t.id, t.label, t.tag)}
                style={{
                  width:20, height:20, borderRadius:'50%', flexShrink:0, marginTop:2, cursor:'pointer',
                  border: done ? 'none' : overdue ? '2px solid #FCA5A5' : '2px solid #D1D5DB',
                  background: done ? '#52B788' : 'transparent',
                  display:'flex', alignItems:'center', justifyContent:'center', transition:'all .2s',
                }}>
                {done && <span style={{ color:'white', fontSize:11, fontWeight:700 }}>✓</span>}
              </div>

              {/* Content */}
              <div style={{ flex:1, cursor:'pointer' }} onClick={() => syncToggle(t.id, t.label, t.tag)}>
                <div style={{ fontSize:13, fontWeight:500, color: done ? 'var(--muted)' : 'var(--text)', textDecoration: done ? 'line-through' : 'none' }}>
                  {t.label}
                </div>
                {t.note && <div style={{ fontSize:11, color:'var(--muted)', marginTop:2, lineHeight:1.4 }}>{t.note}</div>}
                <div style={{ display:'flex', gap:6, marginTop:4, alignItems:'center', flexWrap:'wrap' }}>
                  <span className={`tag ${TAG_CLASS[t.tag] || 'tag-class'}`}>{t.tag}</span>
                  {overdue && (
                    <span style={{ fontSize:9, letterSpacing:1, textTransform:'uppercase', padding:'2px 7px', borderRadius:10, background:'#FEE2E2', color:'#991B1B', fontWeight:600 }}>
                      ⏰ overdue
                    </span>
                  )}
                  {isPostponed && !done && (
                    <span style={{ fontSize:9, letterSpacing:1, textTransform:'uppercase', padding:'2px 7px', borderRadius:10, background:'#FEF3C7', color:'#92400E' }}>
                      later today
                    </span>
                  )}
                </div>
              </div>

              {/* Reschedule button for overdue tasks */}
              {overdue && !done && (
                <button onClick={() => setRescheduling(t)}
                  style={{ fontSize:10, letterSpacing:.5, padding:'4px 10px', borderRadius:10, border:'1px solid #FECACA', background:'transparent', color:'#991B1B', cursor:'pointer', flexShrink:0, alignSelf:'center' }}>
                  Reschedule
                </button>
              )}
            </div>
          )
        })
      )}

      <div style={{ display:'flex', gap:8, marginTop:12, flexWrap:'wrap' }}>
        <button className="btn-ghost" onClick={resetDay}>Reset today</button>
      </div>

      {/* Reschedule modal */}
      {rescheduling && (
        <RescheduleModal
          task={rescheduling}
          onClose={() => setRescheduling(null)}
          onPostpone={(choice) => handleReschedule(rescheduling, choice)}
          onSkip={() => handleSkip(rescheduling)}
        />
      )}
    </div>
  )
}
