
const CAT_COLORS = {
  lab:     { dot:'#059669', bg:'#ECFDF5', text:'#065F46' },
  class:   { dot:'#7C3AED', bg:'#EDE9FE', text:'#3B0764' },
  career:  { dot:'#D97706', bg:'#FEF9E7', text:'#78350F' },
  personal:{ dot:'#A855F7', bg:'#F5EEF8', text:'#6B3FA0' },
  urgent:  { dot:'#EF4444', bg:'#FEE2E2', text:'#7F1D1D' },
  health:  { dot:'#E07B2E', bg:'#FFF3E4', text:'#7B4F1E' },
  meeting: { dot:'#3B82F6', bg:'#EFF6FF', text:'#1E3A8A' },
  deadline:{ dot:'#EF4444', bg:'#FEE2E2', text:'#7F1D1D' },
  social:  { dot:'#A855F7', bg:'#F5EEF8', text:'#6B3FA0' },
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

function TaskRow({ id, text, cat, done, carried, carriedFrom, onToggle }) {
  const c = CAT_COLORS[cat] || CAT_COLORS.career
  return (
    <div className={`week-task-row ${done ? 'done' : ''} ${carried ? 'carried' : ''}`}
      style={{ opacity: done ? .45 : 1, background: carried ? '#FFFBEB' : undefined,
        margin: carried ? '0 -16px' : undefined, paddingLeft: carried ? 16 : undefined, paddingRight: carried ? 16 : undefined }}
      onClick={onToggle}>
      <div className="week-task-dot" style={{ background: done ? c.dot : carried ? 'transparent' : 'transparent', borderColor: done ? c.dot : carried ? '#F59E0B' : '#D1D5DB' }}>
        {done && <span style={{ color:'white', fontSize:10, fontWeight:700 }}>✓</span>}
      </div>
      <div style={{ flex:1, display:'flex', alignItems:'center', gap:6, flexWrap:'wrap' }}>
        <span style={{ fontSize:13, color: done ? 'var(--muted)' : 'var(--text)', textDecoration: done ? 'line-through' : 'none' }}>{text}</span>
        <span style={{ fontSize:9, letterSpacing:1, textTransform:'uppercase', padding:'1px 6px', borderRadius:10, background:c.bg, color:c.text }}>{cat}</span>
        {carried && <span style={{ fontSize:9, letterSpacing:1, textTransform:'uppercase', padding:'1px 6px', borderRadius:10, background:'#FEF3C7', color:'#92400E' }}>↩ from {carriedFrom}</span>}
      </div>
    </div>
  )
}

export default function ThisWeek({ todos, weekState, syncToggle, commitments, weekPlan }) {
  const today = todayStr()
  const todayIdx = WEEK_PLAN.findIndex(d => d.date === today)
  // Template tasks scoped by date; commitments use their UUID directly
  const isDone = (id, date, isCommitment) => isCommitment
    ? !!(todos[id] || weekState[id])
    : !!(todos[date+'_'+id] || weekState[date+'_'+id])

  // Index commitments by date for quick lookup
  const commitsByDate = {}
  ;(commitments || []).forEach(c => {
    if (!c.date) return
    if (!commitsByDate[c.date]) commitsByDate[c.date] = []
    commitsByDate[c.date].push(c)
  })

  return (
    <div>
      <div className="page-title">This Week</div>
      <div className="page-sub">Checking off here syncs with Today and the Log</div>

      {WEEK_PLAN.map((day, i) => {
        const isToday = day.date === today
        const dayCommitments = (commitsByDate[day.date] || [])
          .sort((a, b) => (a.time || '99').localeCompare(b.time || '99'))

        const carriedFromPrev = i > 0
          ? WEEK_PLAN[i-1].tasks.filter(t => t.carry && !isDone(t.id, WEEK_PLAN[i-1].date, false))
          : []

        const total = day.tasks.length + carriedFromPrev.length + dayCommitments.length
        const done  = day.tasks.filter(t => isDone(t.id, day.date, false)).length
          + dayCommitments.filter(c => isDone(c.id, day.date, true)).length

        return (
          <div key={day.date} className={`week-day-card ${isToday ? 'today' : ''}`}>
            <div className="week-day-header">
              <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                <span className="week-day-label">{day.dayLabel}</span>
                {isToday && <span style={{ fontSize:10, letterSpacing:1, textTransform:'uppercase', color:'#7ABF5E' }}>Today</span>}
              </div>
              <span style={{ fontSize:11, color: isToday ? 'var(--green-mid)' : 'var(--muted)' }}>{done}/{total}</span>
            </div>

            <div style={{ padding:'6px 16px 12px' }}>
              {/* Commitments for this day */}
              {dayCommitments.map(c => (
                <TaskRow key={c.id} id={c.id}
                  text={c.time ? `${fmt12(c.time)} — ${c.text}` : c.text}
                  cat={c.cat} done={isDone(c.id, day.date, true)}
                  onToggle={() => syncToggle(c.id, c.text, c.cat, null)} />
              ))}

              {/* Carried from previous day */}
              {carriedFromPrev.map(t => (
                <TaskRow key={'carry-'+t.id} id={t.id} text={t.text} cat={t.cat}
                  done={isDone(t.id, day.date, false)} carried carriedFrom={WEEK_PLAN[i-1].dayLabel}
                  onToggle={() => syncToggle(t.id, t.text, t.cat, day.date)} />
              ))}

              {/* Template tasks */}
              {day.tasks.map(t => (
                <TaskRow key={t.id} id={t.id} text={t.text} cat={t.cat}
                  done={isDone(t.id, day.date, false)}
                  onToggle={() => syncToggle(t.id, t.text, t.cat, day.date)} />
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}
