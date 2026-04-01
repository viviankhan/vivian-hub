import { useState, useEffect } from 'react'
import { WEEK_PLAN } from '../data/schedule.js'

const CAT_COLORS = {
  lab:     { dot:'#059669', bg:'#ECFDF5', text:'#065F46' },
  class:   { dot:'#7C3AED', bg:'#EDE9FE', text:'#3B0764' },
  career:  { dot:'#D97706', bg:'#FEF9E7', text:'#78350F' },
  personal:{ dot:'#A855F7', bg:'#F5EEF8', text:'#6B3FA0' },
  urgent:  { dot:'#EF4444', bg:'#FEE2E2', text:'#7F1D1D' },
  health:  { dot:'#E07B2E', bg:'#FFF3E4', text:'#7B4F1E' },
}

function todayStr() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}

// Load tasks that were "carry to tomorrow" from Today
function loadCarriedTomorrow() {
  try { return JSON.parse(localStorage.getItem('vivian_carry_tomorrow') || '[]') } catch { return [] }
}
function clearCarriedForDate(date) {
  try {
    const all = loadCarriedTomorrow().filter(t => t.fromDate !== date)
    localStorage.setItem('vivian_carry_tomorrow', JSON.stringify(all))
  } catch {}
}

export default function ThisWeek({ todos, weekState, syncToggle }) {
  const today = todayStr()
  const todayIdx = WEEK_PLAN.findIndex(d => d.date === today)
  const [carried, setCarried] = useState([])

  useEffect(() => {
    // Load tasks explicitly rescheduled via "Carry to tomorrow" in Today
    const yesterday = WEEK_PLAN[Math.max(0, todayIdx - 1)]?.date
    const all = loadCarriedTomorrow()
    // Show today's carried-forward tasks (those set for yesterday)
    const forToday = all.filter(t => t.fromDate === yesterday)
    setCarried(forToday)
  }, [todayIdx])

  // Combined done: checked in either todos or weekState
  const isDone = (id) => !!(todos[id] || weekState[id])

  return (
    <div>
      <div className="page-title">This Week</div>
      <div className="page-sub">Mar 30 – Apr 5 · Week 1 · Checking here syncs with Today and the Log</div>

      {WEEK_PLAN.map((day, i) => {
        const isToday = day.date === today
        const isPast  = i < todayIdx

        // Carry-forward: flagged tasks from immediately previous day that aren't done
        const carriedFromPrev = i > 0
          ? WEEK_PLAN[i-1].tasks.filter(t => t.carry && !isDone(t.id))
          : []

        // Tasks explicitly rescheduled via Today's "Carry to tomorrow"
        const reschedCarried = isToday ? carried : []

        const totalTasks = day.tasks.length + carriedFromPrev.length + reschedCarried.length
        const doneCount  = day.tasks.filter(t => isDone(t.id)).length
          + carriedFromPrev.filter(t => isDone(t.id)).length

        return (
          <div key={day.date} className={`week-day-card ${isToday ? 'today' : ''}`}>
            <div className="week-day-header">
              <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                <span className="week-day-label">{day.dayLabel}</span>
                {isToday && <span style={{ fontSize:10, letterSpacing:1, textTransform:'uppercase', color:'#7ABF5E' }}>Today</span>}
              </div>
              <span style={{ fontSize:11, color: isToday ? 'var(--green-mid)' : 'var(--muted)' }}>
                {doneCount}/{totalTasks}
              </span>
            </div>

            <div style={{ padding:'6px 16px 12px' }}>
              {/* Explicitly rescheduled from Today */}
              {reschedCarried.map(t => {
                const c = CAT_COLORS[t.cat] || CAT_COLORS.career
                const done = isDone(t.id)
                return (
                  <div key={'resched-'+t.id} className="week-task-row"
                    style={{ background:'#FFFBEB', margin:'0 -16px', paddingLeft:16, paddingRight:16, borderBottom:'1px solid #FEF3C7', opacity: done ? .45 : 1 }}
                    onClick={() => syncToggle(t.id, t.label || t.text, t.tag || t.cat)}>
                    <div className="week-task-dot" style={{ background: done ? '#F59E0B' : 'transparent', borderColor:'#F59E0B' }}>
                      {done && <span style={{ color:'white', fontSize:10, fontWeight:700 }}>✓</span>}
                    </div>
                    <div style={{ flex:1, display:'flex', alignItems:'center', gap:6, flexWrap:'wrap' }}>
                      <span style={{ fontSize:13, color: done ? 'var(--muted)' : 'var(--text)', textDecoration: done ? 'line-through' : 'none' }}>{t.label || t.text}</span>
                      <span style={{ fontSize:9, letterSpacing:1, textTransform:'uppercase', padding:'1px 6px', borderRadius:10, background:'#FEF3C7', color:'#92400E' }}>rescheduled</span>
                    </div>
                  </div>
                )
              })}

              {/* Carried from previous day */}
              {carriedFromPrev.map(t => {
                const c = CAT_COLORS[t.cat] || CAT_COLORS.career
                const done = isDone(t.id)
                return (
                  <div key={'carry-'+t.id} className="week-task-row carried"
                    style={{ opacity: done ? .45 : 1 }}
                    onClick={() => syncToggle(t.id, t.text, t.cat)}>
                    <div className="week-task-dot" style={{ borderColor:'#F59E0B', background: done ? '#F59E0B' : 'transparent' }}>
                      {done && <span style={{ color:'white', fontSize:10, fontWeight:700 }}>✓</span>}
                    </div>
                    <div style={{ flex:1, display:'flex', alignItems:'center', gap:6, flexWrap:'wrap' }}>
                      <span style={{ fontSize:13, color: done ? 'var(--muted)' : 'var(--text)', textDecoration: done ? 'line-through' : 'none' }}>{t.text}</span>
                      <span style={{ fontSize:9, letterSpacing:1, textTransform:'uppercase', padding:'1px 6px', borderRadius:10, background:'#FEF3C7', color:'#92400E' }}>
                        ↩ from {WEEK_PLAN[i-1].dayLabel}
                      </span>
                    </div>
                  </div>
                )
              })}

              {/* Day tasks */}
              {day.tasks.map(t => {
                const done = isDone(t.id)
                const c = CAT_COLORS[t.cat] || CAT_COLORS.career
                return (
                  <div key={t.id}
                    className={`week-task-row ${done ? 'done' : ''}`}
                    onClick={() => syncToggle(t.id, t.text, t.cat)}>
                    <div className="week-task-dot"
                      style={{ background: done ? c.dot : 'transparent', borderColor: done ? c.dot : '#D1D5DB' }}>
                      {done && <span style={{ color:'white', fontSize:10, fontWeight:700 }}>✓</span>}
                    </div>
                    <div style={{ flex:1, display:'flex', alignItems:'center', gap:6, flexWrap:'wrap' }}>
                      <span className="week-task-text"
                        style={{ fontSize:13, color: done ? 'var(--muted)' : 'var(--text)', textDecoration: done ? 'line-through' : 'none' }}>
                        {t.text}
                      </span>
                      <span style={{ fontSize:9, letterSpacing:1, textTransform:'uppercase', padding:'1px 6px', borderRadius:10, background:c.bg, color:c.text }}>
                        {t.cat}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}
