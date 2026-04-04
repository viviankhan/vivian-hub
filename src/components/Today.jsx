import { useState, useEffect } from 'react'
import { DAILY_TODOS, MORNING_ROUTINE, FIXED_BLOCKS } from '../data/schedule.js'

const TAG_COLORS = {
  health:'#E07B2E', class:'#7C3AED', lab:'#059669', career:'#D97706',
  fitness:'#3B82F6', personal:'#A855F7', sleep:'#52B788', urgent:'#EF4444',
  carried:'#F59E0B', polish:'#EC4899', meeting:'#3B82F6', deadline:'#EF4444',
}

function todayKey() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}
function todayLabel() {
  return new Date().toLocaleDateString('en-US', { weekday:'long', month:'long', day:'numeric' })
}
function nowMins() {
  const d = new Date(); return d.getHours()*60 + d.getMinutes()
}
function parseTimeMins(label) {
  const m = label.match(/~?(\d{1,2}):(\d{2})\s*(AM|PM)/i)
  if (!m) return null
  let h = parseInt(m[1]); const min = parseInt(m[2]); const ap = m[3].toUpperCase()
  if (ap==='PM' && h!==12) h+=12; if (ap==='AM' && h===12) h=0
  return h*60+min
}
function timeToMins(t) {
  if (!t) return null; const [h,m] = t.split(':').map(Number); return h*60+m
}
function fmt12(t) {
  if (!t) return ''; const [h,m] = t.split(':').map(Number)
  return `${h%12||12}:${String(m).padStart(2,'0')} ${h>=12?'PM':'AM'}`
}

// Find unoccupied slots in the day
function getFreeSlotsForDay(dateStr) {
  const dayNames = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday']
  const dayName = dayNames[new Date(dateStr+'T12:00:00').getDay()]
  const blocks = (FIXED_BLOCKS[dayName] || []).map(b => ({
    start: timeToMins(b.start), end: timeToMins(b.end), label: b.label
  }))
  blocks.sort((a,b) => a.start-b.start)
  const slots = []
  let cursor = 8*60 // 8 AM
  for (const b of blocks) {
    if (b.start-cursor >= 30) {
      slots.push({ start: cursor, end: b.start, label:`${fmt12(String(Math.floor(cursor/60)).padStart(2,'0')+':'+String(cursor%60).padStart(2,'0'))} – ${fmt12(String(Math.floor(b.start/60)).padStart(2,'0')+':'+String(b.start%60).padStart(2,'0'))}` })
    }
    cursor = Math.max(cursor, b.end)
  }
  if (22*60-cursor >= 30) slots.push({ start: cursor, end: 22*60, label: `${fmt12(String(Math.floor(cursor/60)).padStart(2,'0')+':'+String(cursor%60).padStart(2,'0'))} onwards` })
  return slots
}

// ── Manage Task Modal ──────────────────────────────────────────
function TaskModal({ task, dateKey, todos, onClose, onDelete, onReschedule }) {
  const [view, setView] = useState('main') // main | delete | reschedule
  const [reason, setReason] = useState('')
  const [reschedDate, setReschedDate] = useState(dateKey)
  const [reschedTime, setReschedTime] = useState('')
  const [conflict, setConflict] = useState(null)
  const freeSlots = getFreeSlotsForDay(reschedDate)

  const handleDelete = () => {
    onDelete(task, reason || null)
    onClose()
  }

  const checkConflict = (date, time) => {
    if (!time) { setConflict(null); return }
    const dayNames = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday']
    const dayName = dayNames[new Date(date+'T12:00:00').getDay()]
    const blocks = FIXED_BLOCKS[dayName] || []
    const mins = timeToMins(time)
    for (const b of blocks) {
      const bs = timeToMins(b.start), be = timeToMins(b.end)
      if (mins >= bs && mins < be) { setConflict(b.label); return }
    }
    // Also check today's todos
    const dayTodos = DAILY_TODOS[date] || []
    for (const t of dayTodos) {
      if (t.id === task.id) continue
      const tm = parseTimeMins(t.label || '')
      if (tm !== null && Math.abs(tm - mins) < 30 && todos[t.id] !== true) {
        setConflict(`existing task "${t.label?.substring(0,40)}"`)
        return
      }
    }
    setConflict(null)
  }

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.5)', zIndex:600, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
      <div style={{ background:'white', borderRadius:16, padding:24, maxWidth:400, width:'100%', boxShadow:'0 24px 64px rgba(0,0,0,.3)' }}>
        {view === 'main' && (
          <>
            <div className="serif" style={{ fontSize:18, fontWeight:600, color:'var(--text)', marginBottom:6 }}>Manage Task</div>
            <div style={{ fontSize:13, color:'var(--muted)', marginBottom:20, lineHeight:1.5, padding:'10px 14px', background:'#F7F6F3', borderRadius:10 }}>{task.label || task.text}</div>
            <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
              <button onClick={() => setView('reschedule')}
                style={{ padding:'12px', borderRadius:10, border:'1px solid var(--border)', background:'white', cursor:'pointer', textAlign:'left', fontSize:13, color:'var(--text)', fontFamily:'DM Sans, sans-serif' }}>
                📅 Reschedule — pick a new time or date
              </button>
              <button onClick={() => setView('delete')}
                style={{ padding:'12px', borderRadius:10, border:'1px solid #FECACA', background:'#FFF5F5', cursor:'pointer', textAlign:'left', fontSize:13, color:'#991B1B', fontFamily:'DM Sans, sans-serif' }}>
                🗑️ Delete — remove and log why
              </button>
            </div>
            <button onClick={onClose} style={{ marginTop:14, width:'100%', padding:'9px', borderRadius:10, border:'1px solid var(--border)', background:'white', color:'var(--muted)', cursor:'pointer', fontSize:12, fontFamily:'DM Sans, sans-serif' }}>
              Cancel
            </button>
          </>
        )}

        {view === 'delete' && (
          <>
            <div className="serif" style={{ fontSize:18, fontWeight:600, color:'#991B1B', marginBottom:6 }}>Delete Task</div>
            <div style={{ fontSize:13, color:'var(--muted)', marginBottom:14, fontStyle:'italic' }}>{task.label || task.text}</div>
            <div style={{ fontSize:11, color:'var(--muted)', letterSpacing:1, textTransform:'uppercase', marginBottom:6 }}>Reason (optional — shows in log)</div>
            <textarea value={reason} onChange={e => setReason(e.target.value)}
              placeholder="e.g. ran out of time, not relevant today…"
              rows={3}
              style={{ width:'100%', fontSize:13, padding:'10px 12px', borderRadius:10, border:'1px solid var(--border)', marginBottom:14, fontFamily:'DM Sans, sans-serif', resize:'none', outline:'none', lineHeight:1.5 }} />
            <div style={{ display:'flex', gap:8 }}>
              <button onClick={handleDelete}
                style={{ flex:1, padding:'10px', borderRadius:10, border:'none', background:'#EF4444', color:'white', cursor:'pointer', fontFamily:'DM Sans, sans-serif', fontWeight:600, fontSize:13 }}>
                Delete{reason ? ' & Log' : ''}
              </button>
              <button onClick={() => setView('main')}
                style={{ padding:'10px 16px', borderRadius:10, border:'1px solid var(--border)', background:'white', color:'var(--muted)', cursor:'pointer', fontSize:12, fontFamily:'DM Sans, sans-serif' }}>
                Back
              </button>
            </div>
          </>
        )}

        {view === 'reschedule' && (
          <>
            <div className="serif" style={{ fontSize:18, fontWeight:600, color:'var(--text)', marginBottom:6 }}>Reschedule</div>
            <div style={{ fontSize:13, color:'var(--muted)', marginBottom:16, fontStyle:'italic' }}>{task.label || task.text}</div>

            <div style={{ display:'flex', gap:8, marginBottom:12 }}>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:10, color:'var(--muted)', letterSpacing:1, textTransform:'uppercase', marginBottom:4 }}>Date</div>
                <input type="date" value={reschedDate} onChange={e => { setReschedDate(e.target.value); checkConflict(e.target.value, reschedTime) }}
                  style={{ width:'100%', fontSize:12, padding:'8px 10px', borderRadius:10, border:'1px solid var(--border)', fontFamily:'DM Sans, sans-serif' }} />
              </div>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:10, color:'var(--muted)', letterSpacing:1, textTransform:'uppercase', marginBottom:4 }}>Time</div>
                <input type="time" value={reschedTime} onChange={e => { setReschedTime(e.target.value); checkConflict(reschedDate, e.target.value) }}
                  style={{ width:'100%', fontSize:12, padding:'8px 10px', borderRadius:10, border:'1px solid var(--border)', fontFamily:'DM Sans, sans-serif' }} />
              </div>
            </div>

            {/* Free slots suggestion */}
            {freeSlots.length > 0 && (
              <div style={{ marginBottom:12 }}>
                <div style={{ fontSize:10, color:'var(--muted)', letterSpacing:1, textTransform:'uppercase', marginBottom:6 }}>Open slots on {reschedDate}</div>
                <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
                  {freeSlots.slice(0,4).map((s,i) => (
                    <button key={i} onClick={() => { const t=String(Math.floor(s.start/60)).padStart(2,'0')+':'+String(s.start%60).padStart(2,'0'); setReschedTime(t); checkConflict(reschedDate,t) }}
                      style={{ fontSize:10, padding:'4px 10px', borderRadius:20, border:'1px solid #B2DFDB', background:'#E0F2F1', color:'#00695C', cursor:'pointer', fontFamily:'DM Sans, sans-serif' }}>
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Conflict warning */}
            {conflict && (
              <div style={{ background:'#FEF3C7', border:'1px solid #F59E0B', borderRadius:10, padding:'10px 14px', marginBottom:12, fontSize:12, color:'#92400E' }}>
                <strong>Conflict with:</strong> {conflict}
                <div style={{ display:'flex', gap:6, marginTop:8 }}>
                  <button onClick={() => { onReschedule(task, reschedDate, reschedTime, 'replace'); onClose() }}
                    style={{ fontSize:10, padding:'4px 10px', borderRadius:10, border:'none', background:'#F59E0B', color:'white', cursor:'pointer', fontFamily:'DM Sans, sans-serif' }}>
                    Replace it
                  </button>
                  <button onClick={() => { onReschedule(task, reschedDate, reschedTime, 'alongside'); onClose() }}
                    style={{ fontSize:10, padding:'4px 10px', borderRadius:10, border:'1px solid #F59E0B', background:'white', color:'#92400E', cursor:'pointer', fontFamily:'DM Sans, sans-serif' }}>
                    Schedule alongside
                  </button>
                </div>
              </div>
            )}

            <div style={{ display:'flex', gap:8 }}>
              <button onClick={() => { if(!conflict) { onReschedule(task, reschedDate, reschedTime, 'normal'); onClose() } else setConflict(conflict) }}
                style={{ flex:1, padding:'10px', borderRadius:10, border:'none', background:'var(--forest)', color:'var(--green-light)', cursor:'pointer', fontFamily:'DM Sans, sans-serif', fontWeight:600, fontSize:13 }}>
                Reschedule
              </button>
              <button onClick={() => setView('main')}
                style={{ padding:'10px 16px', borderRadius:10, border:'1px solid var(--border)', background:'white', color:'var(--muted)', cursor:'pointer', fontSize:12, fontFamily:'DM Sans, sans-serif' }}>
                Back
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ── Task row ───────────────────────────────────────────────────
function TaskRow({ id, label, note, tag, done, overdue, onToggle, onManage }) {
  const dot = TAG_COLORS[tag] || '#9CA3AF'
  return (
    <div style={{ display:'flex', gap:10, alignItems:'flex-start', background: overdue?'#FFF5F5':'white', borderRadius:12, border:`1px solid ${overdue?'#FECACA':'var(--border)'}`, padding:'11px 14px', marginBottom:7, opacity:done?.45:1 }}>
      <div onClick={onToggle}
        style={{ width:20, height:20, borderRadius:'50%', flexShrink:0, marginTop:2, cursor:'pointer', border:done?'none':`2px solid ${overdue?'#FCA5A5':dot}`, background:done?'#52B788':'transparent', display:'flex', alignItems:'center', justifyContent:'center' }}>
        {done && <span style={{ color:'white', fontSize:11, fontWeight:700 }}>✓</span>}
      </div>
      <div style={{ flex:1, cursor:'pointer' }} onClick={onToggle}>
        <div style={{ fontSize:13, fontWeight:500, color:'var(--text)', textDecoration:done?'line-through':'none' }}>{label}</div>
        {note && <div style={{ fontSize:11, color:'var(--muted)', marginTop:2, lineHeight:1.4 }}>{note}</div>}
        <div style={{ display:'flex', gap:5, marginTop:4, flexWrap:'wrap', alignItems:'center' }}>
          <span style={{ fontSize:9, padding:'2px 7px', borderRadius:10, background:`${dot}18`, color:dot, fontWeight:600, letterSpacing:1, textTransform:'uppercase' }}>{tag}</span>
          {overdue && !done && <span style={{ fontSize:9, padding:'2px 7px', borderRadius:10, background:'#FEE2E2', color:'#991B1B', fontWeight:600, letterSpacing:1, textTransform:'uppercase' }}>overdue</span>}
        </div>
      </div>
      {/* Manage button */}
      {!done && (
        <button onClick={onManage}
          style={{ fontSize:11, padding:'4px 8px', borderRadius:8, border:'1px solid var(--border)', background:'white', color:'var(--muted)', cursor:'pointer', flexShrink:0, alignSelf:'center' }}>
          ···
        </button>
      )}
    </div>
  )
}

// ── MCAT Banner ────────────────────────────────────────────────
function MCATBanner() {
  const [expanded, setExpanded] = useState(false)
  // Quiz 1 is April 6 — count days to MCAT (placeholder target)
  const mcatDate = new Date('2026-08-01')
  const today = new Date(); today.setHours(0,0,0,0)
  const daysLeft = Math.ceil((mcatDate-today)/86400000)
  return (
    <div style={{ background:'linear-gradient(135deg,#1C2B1A,#2D4A28)', borderRadius:14, padding:'14px 18px', marginBottom:16, border:'1px solid rgba(90,180,90,.25)', cursor:'pointer' }}
      onClick={() => setExpanded(o=>!o)}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <span style={{ fontSize:22 }}>📚</span>
          <div>
            <div className="serif" style={{ fontSize:16, fontWeight:600, color:'var(--sand)' }}>MCAT Review — 30 min</div>
            <div style={{ fontSize:11, color:'var(--green-mid)', marginTop:1 }}>6:19 – 6:49 AM · One focused concept block · {daysLeft} days to go</div>
          </div>
        </div>
        <span style={{ color:'var(--green-mid)', fontSize:13 }}>{expanded?'▴':'▾'}</span>
      </div>
      {expanded && (
        <div style={{ marginTop:14, borderTop:'1px solid rgba(255,255,255,.08)', paddingTop:12 }} onClick={e=>e.stopPropagation()}>
          <div style={{ fontSize:12, color:'var(--green-light)', lineHeight:1.7 }}>
            <div style={{ marginBottom:6 }}><strong style={{ color:'var(--sand)' }}>Today's focus:</strong> Pick one content block — biochemistry, biology, or C/P — and go deep for 30 minutes. No skimming.</div>
            <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
              {['Biochem','Cell Bio','Genetics','Physiology','Psych/Soc','C/P','CARS'].map(sub => (
                <span key={sub} style={{ fontSize:10, padding:'3px 10px', borderRadius:10, background:'rgba(90,180,90,.15)', border:'1px solid rgba(90,180,90,.25)', color:'var(--green-light)' }}>{sub}</span>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Main ───────────────────────────────────────────────────────
export default function Today({ todos, weekState, syncToggle, commitments, appendLog }) {
  const [morningOpen, setMorningOpen] = useState(false)
  const [now, setNow] = useState(nowMins())
  const [managingTask, setManagingTask] = useState(null)
  const [rescheduled, setRescheduled] = useState(() => {
    try { return JSON.parse(localStorage.getItem('vivian_rescheduled_today') || '{}') } catch { return {} }
  })
  const [deleted, setDeleted] = useState(() => {
    try { return JSON.parse(localStorage.getItem('vivian_deleted_' + new Date().toISOString().split('T')[0]) || '[]') } catch { return [] }
  })

  useEffect(() => {
    const t = setInterval(() => setNow(nowMins()), 60000)
    return () => clearInterval(t)
  }, [])

  const dateKey = todayKey()
  const templateTodos = (DAILY_TODOS[dateKey] || []).filter(t => !deleted.includes(t.id))
  const todayCommitments = (commitments || []).filter(c => c.date === dateKey && !c.done)
  const isDone = id => !!(todos[id] || weekState[id])

  const doneCount = templateTodos.filter(t => isDone(t.id)).length + todayCommitments.filter(c => isDone(c.id)).length
  const totalCount = templateTodos.length + todayCommitments.length

  // Handle delete with reason
  const handleDelete = (task, reason) => {
    const id = task.id
    const newDeleted = [...deleted, id]
    setDeleted(newDeleted)
    localStorage.setItem('vivian_deleted_' + dateKey, JSON.stringify(newDeleted))
    if (appendLog) {
      const d = new Date()
      appendLog({
        date: dateKey,
        dateLabel: todayLabel(),
        label: `Deleted: ${task.label || task.text}${reason ? ` — Reason: ${reason}` : ''}`,
        tag: 'deleted',
        ts: d.toISOString()
      })
    }
  }

  // Handle reschedule
  const handleReschedule = (task, date, time, mode) => {
    const id = task.id
    // Mark as rescheduled (remove from today)
    const newDeleted = [...deleted, id]
    setDeleted(newDeleted)
    localStorage.setItem('vivian_deleted_' + dateKey, JSON.stringify(newDeleted))
    // Store in rescheduled for the target date
    const key = 'vivian_rescheduled_' + date
    try {
      const existing = JSON.parse(localStorage.getItem(key) || '[]')
      const entry = { ...task, rescheduledTime: time, rescheduledFrom: dateKey, mode }
      localStorage.setItem(key, JSON.stringify([...existing, entry]))
    } catch {}
    if (appendLog) {
      appendLog({
        date: dateKey, dateLabel: todayLabel(),
        label: `Rescheduled: ${task.label || task.text} → ${date}${time ? ' @ '+fmt12(time) : ''}`,
        tag: 'rescheduled', ts: new Date().toISOString()
      })
    }
  }

  const sortedCommitments = [...todayCommitments].sort((a,b) => (a.time||'99').localeCompare(b.time||'99'))

  return (
    <div>
      {/* MCAT Banner — always at top */}
      <MCATBanner />

      <div className="page-title">{todayLabel()}</div>
      <div className="page-sub">{doneCount}/{totalCount} tasks done today</div>

      {/* Morning routine collapsible */}
      <div onClick={() => setMorningOpen(o=>!o)}
        style={{ background:'white', borderRadius:12, border:'1px solid var(--border)', padding:'12px 16px', marginBottom:12, cursor:'pointer', userSelect:'none' }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            <span style={{ fontSize:18 }}>☀️</span>
            <div>
              <div className="serif" style={{ fontSize:15, fontWeight:600 }}>Morning Routine</div>
              <div style={{ fontSize:11, color:'var(--muted)', marginTop:1 }}>6:00 – 7:50 AM · {morningOpen?'collapse':'expand'}</div>
            </div>
          </div>
          <span style={{ color:'var(--muted)', fontSize:14, transform:morningOpen?'rotate(180deg)':'', transition:'transform .2s' }}>▾</span>
        </div>
        {morningOpen && (
          <div onClick={e=>e.stopPropagation()} style={{ marginTop:14, borderTop:'1px solid var(--border)', paddingTop:12 }}>
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

      {/* Commitments today */}
      {sortedCommitments.length > 0 && (
        <>
          <p className="section-label">Commitments Today</p>
          {sortedCommitments.map(c => {
            const label = c.time ? `${fmt12(c.time)} — ${c.text}` : c.text
            const note = [c.person&&`With: ${c.person}`, c.prepMin&&`Leave ${c.prepMin} min early`].filter(Boolean).join(' · ')
            const mins = timeToMins(c.time)
            const overdue = mins!==null && now>mins+10 && !isDone(c.id)
            return (
              <TaskRow key={c.id} id={c.id} label={label} note={note||undefined}
                tag={c.cat} done={isDone(c.id)} overdue={overdue}
                onToggle={() => syncToggle(c.id, c.text, c.cat)}
                onManage={() => setManagingTask(c)} />
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
        const mins = parseTimeMins(t.label)
        const overdue = !done && mins!==null && now>mins+10
        return (
          <TaskRow key={t.id} id={t.id} label={t.label} note={t.note}
            tag={t.tag} done={done} overdue={overdue}
            onToggle={() => syncToggle(t.id, t.label, t.tag)}
            onManage={() => setManagingTask(t)} />
        )
      })}

      {deleted.length > 0 && (
        <div style={{ fontSize:11, color:'var(--muted)', textAlign:'center', marginTop:8 }}>
          {deleted.length} task{deleted.length>1?'s':''} removed today ·
          <button onClick={() => { setDeleted([]); localStorage.removeItem('vivian_deleted_'+dateKey) }}
            style={{ background:'none', border:'none', color:'var(--teal)', cursor:'pointer', fontSize:11, marginLeft:4 }}>
            Undo all
          </button>
        </div>
      )}

      {managingTask && (
        <TaskModal
          task={managingTask} dateKey={dateKey} todos={todos}
          onClose={() => setManagingTask(null)}
          onDelete={handleDelete}
          onReschedule={handleReschedule}
        />
      )}
    </div>
  )
}
