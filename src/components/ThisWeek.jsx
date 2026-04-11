import { useState } from 'react'

const CAT_COLORS = {
  lab:     { dot:'#059669', bg:'#ECFDF5', text:'#065F46' },
  class:   { dot:'#7C3AED', bg:'#EDE9FE', text:'#3B0764' },
  career:  { dot:'#D97706', bg:'#FEF9E7', text:'#78350F' },
  personal:{ dot:'#A855F7', bg:'#F5EEF8', text:'#6B3FA0' },
  urgent:  { dot:'#EF4444', bg:'#FEE2E2', text:'#7F1D1D' },
  health:  { dot:'#E07B2E', bg:'#FFF3E4', text:'#7B4F1E' },
  meeting: { dot:'#3B82F6', bg:'#EFF6FF', text:'#1E3A8A' },
  deadline:{ dot:'#EF4444', bg:'#FEE2E2', text:'#7F1D1D' },
  fitness: { dot:'#3B82F6', bg:'#EDF2FB', text:'#1E3A8A' },
  sleep:   { dot:'#52B788', bg:'#E8F4F0', text:'#2D6A4F' },
  social:  { dot:'#A855F7', bg:'#F5EEF8', text:'#6B3FA0' },
}
const CATS = ['class','lab','career','health','fitness','personal','urgent','meeting','deadline']

function todayStr() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}
function fmt12(t) {
  if (!t) return ''
  const [h,m] = t.split(':').map(Number)
  return `${h%12||12}:${String(m).padStart(2,'0')} ${h>=12?'PM':'AM'}`
}

// ── Task row ───────────────────────────────────────────────────
function TaskRow({ id, text, cat, done, carried, carriedFrom, onToggle, onDelete }) {
  const c = CAT_COLORS[cat] || CAT_COLORS.career
  return (
    <div style={{ display:'flex', gap:10, alignItems:'center', padding:'8px 0', borderBottom:'1px solid #F5F3EF', opacity:done?.45:1 }}>
      <div onClick={onToggle}
        style={{ width:18, height:18, borderRadius:'50%', flexShrink:0, cursor:'pointer',
          border:done?'none':`2px solid ${c.dot}`, background:done?c.dot:'transparent',
          display:'flex', alignItems:'center', justifyContent:'center', transition:'all .2s' }}>
        {done&&<span style={{ color:'white', fontSize:10, fontWeight:700 }}>✓</span>}
      </div>
      <div style={{ flex:1, display:'flex', alignItems:'center', gap:6, flexWrap:'wrap', cursor:'pointer' }} onClick={onToggle}>
        <span style={{ fontSize:13, color:done?'var(--muted)':'var(--text)', textDecoration:done?'line-through':'none' }}>{text}</span>
        <span style={{ fontSize:9, letterSpacing:1, textTransform:'uppercase', padding:'1px 6px', borderRadius:10, background:c.bg, color:c.text }}>{cat}</span>
        {carried&&<span style={{ fontSize:9, letterSpacing:1, textTransform:'uppercase', padding:'1px 6px', borderRadius:10, background:'#FEF3C7', color:'#92400E' }}>↩ {carriedFrom}</span>}
      </div>
      {onDelete&&<button onClick={onDelete} style={{ fontSize:10, padding:'2px 6px', borderRadius:6, border:'1px solid var(--border)', background:'white', color:'var(--muted)', cursor:'pointer', flexShrink:0 }}>✕</button>}
    </div>
  )
}

// ── Quick add for a specific day ───────────────────────────────
function DayQuickAdd({ onAdd, onClose }) {
  const [text,setText] = useState('')
  const [cat,setCat]   = useState('personal')
  const [time,setTime] = useState('')
  const submit = () => {
    if (!text.trim()) return
    onAdd({ text: time ? `${fmt12(time)} — ${text.trim()}` : text.trim(), cat })
    onClose()
  }
  return (
    <div style={{ background:'#F7F6F3', borderRadius:10, border:'1px solid var(--border)', padding:10, marginTop:6 }}>
      <input value={text} onChange={e=>setText(e.target.value)} placeholder="Task…" autoFocus
        onKeyDown={e=>e.key==='Enter'&&submit()}
        style={{ width:'100%', fontSize:13, padding:'7px 10px', borderRadius:8, border:'1px solid var(--border)', fontFamily:'DM Sans,sans-serif', outline:'none', marginBottom:6, boxSizing:'border-box' }}/>
      <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
        <input type="time" value={time} onChange={e=>setTime(e.target.value)}
          style={{ fontSize:12, padding:'5px 8px', borderRadius:8, border:'1px solid var(--border)', fontFamily:'DM Sans,sans-serif' }}/>
        <select value={cat} onChange={e=>setCat(e.target.value)}
          style={{ fontSize:12, padding:'5px 8px', borderRadius:8, border:'1px solid var(--border)', fontFamily:'DM Sans,sans-serif', background:'white', cursor:'pointer', flex:1 }}>
          {CATS.map(c=><option key={c} value={c}>{c}</option>)}
        </select>
        <button onClick={submit} style={{ fontSize:12, padding:'5px 12px', borderRadius:8, border:'none', background:'var(--forest)', color:'var(--green-light)', cursor:'pointer', fontFamily:'DM Sans,sans-serif', fontWeight:600 }}>Add</button>
        <button onClick={onClose} style={{ fontSize:12, padding:'5px 8px', borderRadius:8, border:'1px solid var(--border)', background:'white', color:'var(--muted)', cursor:'pointer', fontFamily:'DM Sans,sans-serif' }}>✕</button>
      </div>
    </div>
  )
}

// ── Main ───────────────────────────────────────────────────────
export default function ThisWeek({ todos, weekState, syncToggle, commitments, addCommitment, weekPlan }) {
  const today = todayStr()
  const [addingDay, setAddingDay] = useState(null)
  // Custom tasks per day stored in localStorage (keyed by date)
  const [customByDay, setCustomByDay] = useState(() => {
    try { return JSON.parse(localStorage.getItem('vivian_week_custom')||'{}') } catch { return {} }
  })
  const [deletedByDay, setDeletedByDay] = useState(() => {
    try { return JSON.parse(localStorage.getItem('vivian_week_deleted')||'{}') } catch { return {} }
  })

  const isDone = (id, date, isCommitment) => isCommitment
    ? !!(todos[id] || weekState[id])
    : !!(todos[date+'_'+id] || weekState[date+'_'+id])

  const commitsByDate = {}
  ;(commitments||[]).forEach(c => {
    if (!c.date) return
    if (!commitsByDate[c.date]) commitsByDate[c.date] = []
    commitsByDate[c.date].push(c)
  })

  const handleAddCustom = (date, task) => {
    const id = 'week-custom-'+Date.now()
    const entry = { id, text:task.text, cat:task.cat }
    const next = { ...customByDay, [date]: [...(customByDay[date]||[]), entry] }
    setCustomByDay(next)
    localStorage.setItem('vivian_week_custom', JSON.stringify(next))
    setAddingDay(null)
  }

  const handleDeleteCustom = (date, id) => {
    const next = { ...customByDay, [date]: (customByDay[date]||[]).filter(t=>t.id!==id) }
    setCustomByDay(next)
    localStorage.setItem('vivian_week_custom', JSON.stringify(next))
  }

  const handleDeleteTemplate = (date, id) => {
    const next = { ...deletedByDay, [date]: [...(deletedByDay[date]||[]), id] }
    setDeletedByDay(next)
    localStorage.setItem('vivian_week_deleted', JSON.stringify(next))
  }

  return (
    <div>
      <div className="page-title">This Week</div>
      <div className="page-sub">Today → next 7 days · tap any circle to mark done</div>

      {weekPlan.map((day, i) => {
        const isToday = day.date === today
        const isPast  = day.date < today
        const deleted = deletedByDay[day.date] || []

        const dayCommitments = (commitsByDate[day.date]||[])
          .sort((a,b) => (a.time||'99').localeCompare(b.time||'99'))

        const templateTasks = (day.tasks||[]).filter(t => !deleted.includes(t.id))

        const carriedFromPrev = i > 0
          ? (weekPlan[i-1].tasks||[]).filter(t => t.carry && !isDone(t.id, weekPlan[i-1].date, false))
          : []

        const customTasks = customByDay[day.date] || []

        const allTasks = [
          ...dayCommitments.map(c=>({ id:c.id, text:c.time?`${fmt12(c.time)} — ${c.text}`:c.text, cat:c.cat||'personal', isCommitment:true })),
          ...carriedFromPrev.map(t=>({ ...t, carried:true, carriedFrom:weekPlan[i-1].dayLabel })),
          ...templateTasks,
          ...customTasks,
        ]

        const doneCount = allTasks.filter(t=>isDone(t.id, day.date, t.isCommitment)).length

        return (
          <div key={day.date} className={`week-day-card ${isToday?'today':''}`}
            style={{ opacity: isPast&&!isToday ? .65 : 1 }}>
            <div className="week-day-header">
              <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                <span className="week-day-label">{day.dayLabel}</span>
                {isToday&&<span style={{ fontSize:10, letterSpacing:1, textTransform:'uppercase', color:'#7ABF5E' }}>Today</span>}
                {isPast&&!isToday&&<span style={{ fontSize:10, color:'var(--muted)' }}>past</span>}
              </div>
              <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                <span style={{ fontSize:11, color:isToday?'var(--green-mid)':'var(--muted)' }}>{doneCount}/{allTasks.length}</span>
                <button onClick={()=>setAddingDay(addingDay===day.date?null:day.date)}
                  style={{ fontSize:11, padding:'2px 8px', borderRadius:6, border:'1px solid var(--border)', background:'white', color:'var(--muted)', cursor:'pointer', fontFamily:'DM Sans,sans-serif' }}>
                  + Add
                </button>
              </div>
            </div>

            <div style={{ padding:'4px 16px 12px' }}>
              {allTasks.length===0&&addingDay!==day.date&&(
                <div style={{ fontSize:12, color:'var(--muted)', padding:'8px 0', fontStyle:'italic' }}>
                  No tasks — {isPast?'nothing was scheduled':'use + Add or set up Recurring tasks'}
                </div>
              )}

              {allTasks.map(t => (
                <TaskRow key={t.id} id={t.id} text={t.text} cat={t.cat}
                  done={isDone(t.id, day.date, t.isCommitment)}
                  carried={t.carried} carriedFrom={t.carriedFrom}
                  onToggle={()=>syncToggle(t.id, t.text, t.cat, t.isCommitment?null:day.date)}
                  onDelete={!t.isCommitment&&!t.carried
                    ? ()=>customByDay[day.date]?.find(c=>c.id===t.id)
                        ? handleDeleteCustom(day.date, t.id)
                        : handleDeleteTemplate(day.date, t.id)
                    : null}
                />
              ))}

              {addingDay===day.date&&(
                <DayQuickAdd
                  onAdd={task=>handleAddCustom(day.date, task)}
                  onClose={()=>setAddingDay(null)}/>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
