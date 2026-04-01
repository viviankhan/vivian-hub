import { WEEK_PLAN } from '../data/schedule.js'

const CAT_COLORS = {
  lab:     { dot:'#059669', bg:'#ECFDF5', text:'#065F46' },
  class:   { dot:'#7C3AED', bg:'#EDE9FE', text:'#3B0764' },
  career:  { dot:'#D97706', bg:'#FEF9E7', text:'#78350F' },
  personal:{ dot:'#A855F7', bg:'#F5EEF8', text:'#6B3FA0' },
  urgent:  { dot:'#EF4444', bg:'#FEE2E2', text:'#7F1D1D' },
}

function todayStr() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}

export default function ThisWeek({ weekState, updateWeekState }) {
  const today = todayStr()
  const todayIdx = WEEK_PLAN.findIndex(d => d.date === today)

  const toggle = async (id) => {
    const next = { ...weekState, [id]: !weekState[id] }
    await updateWeekState(next)
  }

  return (
    <div>
      <div className="page-title">This Week</div>
      <div className="page-sub">Mar 30 – Apr 5 · Week 1 · Tap tasks to check off</div>

      {WEEK_PLAN.map((day, i) => {
        const isToday = day.date === today
        const isPast = i < todayIdx
        const done = day.tasks.filter(t => weekState[t.id]).length

        // Carry-forward: tasks from previous day with carry:true that aren't done
        const carried = i > 0
          ? WEEK_PLAN[i-1].tasks.filter(t => t.carry && !weekState[t.id])
          : []

        return (
          <div key={day.date} className={`week-day-card ${isToday ? 'today' : ''}`}>
            <div className="week-day-header">
              <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                <span className="week-day-label">{day.dayLabel}</span>
                {isToday && (
                  <span style={{ fontSize:10, letterSpacing:1, textTransform:'uppercase', color:'#7ABF5E' }}>Today</span>
                )}
              </div>
              <span style={{ fontSize:11, color: isToday ? 'var(--green-mid)' : 'var(--muted)' }}>{done}/{day.tasks.length + carried.length}</span>
            </div>

            <div style={{ padding:'6px 16px 12px' }}>
              {/* Carried tasks */}
              {carried.map(t => {
                const c = CAT_COLORS[t.cat] || CAT_COLORS.career
                return (
                  <div
                    key={'carried-'+t.id}
                    className="week-task-row carried"
                    onClick={() => toggle(t.id)}
                  >
                    <div className="week-task-dot" style={{ borderColor:'#F59E0B' }} />
                    <div style={{ flex:1 }}>
                      <span style={{ fontSize:13, color:'var(--text)' }}>{t.text}</span>
                      <span style={{ fontSize:9, letterSpacing:1, textTransform:'uppercase', padding:'1px 6px', borderRadius:10, marginLeft:6, background:'#FEF3C7', color:'#92400E' }}>
                        ↩ from {WEEK_PLAN[i-1].dayLabel}
                      </span>
                    </div>
                  </div>
                )
              })}

              {/* Day tasks */}
              {day.tasks.map(t => {
                const isDone = !!weekState[t.id]
                const c = CAT_COLORS[t.cat] || CAT_COLORS.career
                return (
                  <div
                    key={t.id}
                    className={`week-task-row ${isDone ? 'done' : ''}`}
                    onClick={() => toggle(t.id)}
                  >
                    <div
                      className="week-task-dot"
                      style={{ background: isDone ? c.dot : 'transparent', borderColor: isDone ? c.dot : '#D1D5DB' }}
                    >
                      {isDone && <span style={{ color:'white', fontSize:10, fontWeight:700 }}>✓</span>}
                    </div>
                    <div style={{ flex:1, display:'flex', alignItems:'center', gap:6, flexWrap:'wrap' }}>
                      <span className={`week-task-text`} style={{ fontSize:13, color: isDone ? 'var(--muted)' : 'var(--text)', textDecoration: isDone ? 'line-through' : 'none' }}>{t.text}</span>
                      <span style={{ fontSize:9, letterSpacing:1, textTransform:'uppercase', padding:'1px 6px', borderRadius:10, background:c.bg, color:c.text }}>{t.cat}</span>
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
