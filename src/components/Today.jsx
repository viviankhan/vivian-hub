// src/components/Today.jsx
import { useState, useEffect } from 'react'
import { DAILY_TODOS, MORNING_ROUTINE } from '../data/schedule.js'

const TAG_CLASS = {
  health:'tag-health', class:'tag-class', lab:'tag-lab', career:'tag-career',
  fitness:'tag-fitness', personal:'tag-personal', sleep:'tag-sleep',
  urgent:'tag-urgent', carried:'tag-carried', polish:'tag-polish',
  meeting:'tag-career', deadline:'tag-urgent', social:'tag-personal',
}

const TAGS = ['class','lab','career','personal','fitness','health','urgent','meeting','deadline','social']

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

// ── Skip / Reschedule panel ────────────────────────────────────
function ActionPanel({ onSkip, onReschedule, onCancel }) {
  const [mode,    setMode]    = useState(null) // null | 'skip' | 'reschedule'
  const [reason,  setReason]  = useState('')
  const [newDate, setNewDate] = useState('')
  const [newTime, setNewTime] = useState('')

  const handleSkip = () => {
    onSkip(reason.trim() || null)
  }

  const handleReschedule = () => {
    if (!newDate) return
    onReschedule(newDate, newTime || null, reason.trim() || null)
  }

  return (
    <div style={{ background:'#FAFAF7', border:'1px solid var(--border)', borderTop:'none', borderRadius:'0 0 10px 10px', padding:'12px 14px', marginTop:-4, marginBottom:8 }}>
      {!mode && (
        <div style={{ display:'flex', gap:8, flexWrap:'wrap', alignItems:'center' }}>
          <span style={{ fontSize:11, color:'var(--muted)', flex:1 }}>What do you want to do?</span>
          <button onClick={() => setMode('reschedule')}
            style={{ fontSize:11, padding:'5px 13px', borderRadius:10, border:'1px solid #D1E8D0', background:'#F0FDF4', color:'#059669', cursor:'pointer', fontFamily:'DM Sans, sans-serif', fontWeight:600 }}>
            📅 Reschedule
          </button>
          <button onClick={() => setMode('skip')}
            style={{ fontSize:11, padding:'5px 13px', borderRadius:10, border:'1px solid #FECACA', background:'#FEF2F2', color:'#DC2626', cursor:'pointer', fontFamily:'DM Sans, sans-serif', fontWeight:600 }}>
            ✕ Remove today
          </button>
          <button onClick={onCancel}
            style={{ fontSize:11, padding:'5px 10px', borderRadius:10, border:'1px solid var(--border)', background:'transparent', color:'var(--muted)', cursor:'pointer', fontFamily:'DM Sans, sans-serif' }}>
            Cancel
          </button>
        </div>
      )}

      {mode === 'skip' && (
        <div>
          <div style={{ fontSize:11, color:'#DC2626', fontWeight:600, marginBottom:8 }}>Remove from today</div>
          <input value={reason} onChange={e => setReason(e.target.value)}
            placeholder="Why? — optional, shows in log"
            autoFocus
            onKeyDown={e => { if (e.key === 'Enter') handleSkip(); if (e.key === 'Escape') setMode(null) }}
            style={{ width:'100%', fontSize:12, padding:'7px 10px', borderRadius:8, border:'1px solid var(--border)', marginBottom:8 }} />
          <div style={{ display:'flex', gap:8 }}>
            <button onClick={handleSkip}
              style={{ padding:'6px 18px', borderRadius:10, border:'none', background:'#DC2626', color:'white', cursor:'pointer', fontSize:11, fontFamily:'DM Sans, sans-serif', fontWeight:600 }}>
              Remove
            </button>
            <button onClick={() => { setMode(null); setReason('') }}
              style={{ padding:'6px 12px', borderRadius:10, border:'1px solid var(--border)', background:'transparent', color:'var(--muted)', cursor:'pointer', fontSize:11, fontFamily:'DM Sans, sans-serif' }}>
              Back
            </button>
          </div>
        </div>
      )}

      {mode === 'reschedule' && (
        <div>
          <div style={{ fontSize:11, color:'#059669', fontWeight:600, marginBottom:8 }}>Move to another time</div>
          <div style={{ display:'flex', gap:8, marginBottom:8, flexWrap:'wrap' }}>
            <div style={{ flex:1, minWidth:140 }}>
              <div style={{ fontSize:10, color:'var(--muted)', marginBottom:3 }}>New date <span style={{ color:'#DC2626' }}>*</span></div>
              <input type="date" value={newDate} onChange={e => setNewDate(e.target.value)}
                style={{ width:'100%', fontSize:12, padding:'6px 10px', borderRadius:8, border:'1px solid var(--border)' }} />
            </div>
            <div style={{ flex:1, minWidth:120 }}>
              <div style={{ fontSize:10, color:'var(--muted)', marginBottom:3 }}>New time — optional</div>
              <input type="time" value={newTime} onChange={e => setNewTime(e.target.value)}
                style={{ width:'100%', fontSize:12, padding:'6px 10px', borderRadius:8, border:'1px solid var(--border)' }} />
            </div>
          </div>
          <input value={reason} onChange={e => setReason(e.target.value)}
            placeholder="Why? — optional, shows in log"
            onKeyDown={e => { if (e.key === 'Escape') setMode(null) }}
            style={{ width:'100%', fontSize:12, padding:'7px 10px', borderRadius:8, border:'1px solid var(--border)', marginBottom:8 }} />
          <div style={{ display:'flex', gap:8 }}>
            <button onClick={handleReschedule} disabled={!newDate}
              style={{ padding:'6px 18px', borderRadius:10, border:'none', background: newDate ? '#059669' : '#E5E7EB', color: newDate ? 'white' : '#9CA3AF', cursor: newDate ? 'pointer' : 'default', fontSize:11, fontFamily:'DM Sans, sans-serif', fontWeight:600 }}>
              Move it
            </button>
            <button onClick={() => { setMode(null); setReason(''); setNewDate(''); setNewTime('') }}
              style={{ padding:'6px 12px', borderRadius:10, border:'1px solid var(--border)', background:'transparent', color:'var(--muted)', cursor:'pointer', fontSize:11, fontFamily:'DM Sans, sans-serif' }}>
              Back
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Todo row ───────────────────────────────────────────────────
function TodoRow({ id, label, note, tag, done, overdue, onToggle, onOpenAction, isCustom, onDeleteCustom, actionOpen }) {
  return (
    <div style={{
      background: overdue ? '#FFF5F5' : 'white',
      borderRadius: actionOpen ? '12px 12px 0 0' : 12,
      border: `1px solid ${actionOpen ? '#6B8060' : overdue ? '#FECACA' : 'var(--border)'}`,
      padding:'12px 16px',
      opacity: done ? .42 : 1,
    }}>
      <div style={{ display:'flex', gap:12, alignItems:'flex-start' }}>
        <div style={{
          width:20, height:20, borderRadius:'50%', flexShrink:0, marginTop:2,
          border: done ? 'none' : overdue ? '2px solid #FCA5A5' : '2px solid #D1D5DB',
          background: done ? '#52B788' : 'transparent',
          display:'flex', alignItems:'center', justifyContent:'center', transition:'all .2s', cursor:'pointer',
        }} onClick={onToggle}>
          {done && <span style={{ color:'white', fontSize:11, fontWeight:700 }}>✓</span>}
        </div>

        <div style={{ flex:1, cursor:'pointer' }} onClick={onToggle}>
          <div style={{ fontSize:13, fontWeight:500, color:'var(--text)', textDecoration: done ? 'line-through' : 'none' }}>{label}</div>
          {note && <div style={{ fontSize:11, color:'var(--muted)', marginTop:2, lineHeight:1.4 }}>{note}</div>}
          <div style={{ display:'flex', gap:6, marginTop:4, flexWrap:'wrap', alignItems:'center' }}>
            <span className={`tag ${TAG_CLASS[tag] || 'tag-class'}`}>{tag}</span>
            {overdue && !done && (
              <span style={{ fontSize:9, letterSpacing:1, textTransform:'uppercase', padding:'2px 7px', borderRadius:10, background:'#FEE2E2', color:'#991B1B', fontWeight:600 }}>overdue</span>
            )}
          </div>
        </div>

        {/* Action / delete button */}
        {!done && (
          isCustom ? (
            <button onClick={onDeleteCustom}
              title="Remove this task"
              style={{ background:'none', border:'none', cursor:'pointer', color:'#D1D5DB', fontSize:16, padding:'0 2px', flexShrink:0, marginTop:1 }}>✕</button>
          ) : (
            <button onClick={onOpenAction}
              title="Skip or reschedule"
              style={{
                background: actionOpen ? '#F0FDF4' : 'none',
                border: actionOpen ? '1px solid #86EFAC' : '1px solid var(--border)',
                borderRadius:8, cursor:'pointer',
                color: actionOpen ? '#059669' : '#C0BAB0',
                fontSize:13, padding:'2px 9px', flexShrink:0,
                fontFamily:'DM Sans, sans-serif', lineHeight:1,
              }}>
              ···
            </button>
          )
        )}
      </div>
    </div>
  )
}

// ── Add task form ──────────────────────────────────────────────
function AddTodoForm({ onAdd, onCancel }) {
  const [label, setLabel] = useState('')
  const [note,  setNote]  = useState('')
  const [tag,   setTag]   = useState('personal')

  const submit = () => {
    if (!label.trim()) return
    onAdd({ label: label.trim(), note: note.trim(), tag })
  }

  return (
    <div style={{ background:'white', borderRadius:12, border:'2px solid var(--forest)', padding:'14px 16px', marginBottom:16 }}>
      <div style={{ fontSize:11, color:'var(--muted)', letterSpacing:1, textTransform:'uppercase', marginBottom:10 }}>Add task for today</div>
      <input value={label} onChange={e => setLabel(e.target.value)}
        placeholder="Task (e.g. 7:00 PM — Review thesis notes)"
        autoFocus
        onKeyDown={e => { if (e.key === 'Enter') submit(); if (e.key === 'Escape') onCancel() }}
        style={{ marginBottom:8 }} />
      <input value={note} onChange={e => setNote(e.target.value)}
        placeholder="Note — optional"
        onKeyDown={e => { if (e.key === 'Enter') submit(); if (e.key === 'Escape') onCancel() }}
        style={{ marginBottom:10 }} />
      <div style={{ display:'flex', gap:8, alignItems:'center', flexWrap:'wrap' }}>
        <select value={tag} onChange={e => setTag(e.target.value)} style={{ flex:1, minWidth:120 }}>
          {TAGS.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <button className="btn-primary" onClick={submit} disabled={!label.trim()} style={{ padding:'8px 18px' }}>Add</button>
        <button className="btn-ghost" onClick={onCancel} style={{ padding:'8px 14px' }}>Cancel</button>
      </div>
    </div>
  )
}

// ── Main ───────────────────────────────────────────────────────
export default function Today({
  todos, weekState, syncToggle, commitments,
  customDailyTodos, updateCustomDailyTodos, deleteCustomTodo,
  skippedTasks, updateSkippedTasks,
  appendLog,
}) {
  const [morningOpen,  setMorningOpen]  = useState(false)
  const [now,          setNow]          = useState(nowMinutes())
  const [showAddForm,  setShowAddForm]  = useState(false)
  const [actionOpenId, setActionOpenId] = useState(null)

  useEffect(() => {
    const t = setInterval(() => setNow(nowMinutes()), 60000)
    return () => clearInterval(t)
  }, [])

  const dateKey       = todayKey()
  const templateTodos = DAILY_TODOS[dateKey] || []
  const customTodos   = (customDailyTodos || {})[dateKey] || []
  const skipped       = skippedTasks || {}

  const visibleTemplateTodos = templateTodos.filter(t => !skipped[`${dateKey}-${t.id}`])
  const todayCommitments = (commitments || []).filter(c => c.date === dateKey && !c.done)
  const isDone = id => !!(todos[id] || weekState[id])

  const sortedCommitments = [...todayCommitments].sort((a, b) => {
    if (!a.time && !b.time) return 0
    if (!a.time) return 1; if (!b.time) return -1
    return a.time.localeCompare(b.time)
  })

  const doneCount =
    visibleTemplateTodos.filter(t => isDone(t.id)).length +
    todayCommitments.filter(c => isDone(c.id)).length +
    customTodos.filter(t => isDone(t.id)).length
  const totalCount = visibleTemplateTodos.length + todayCommitments.length + customTodos.length

  // ── Handlers ─────────────────────────────────────────────────

  const handleAddCustom = async ({ label, note, tag }) => {
    const id = 'custom-' + Date.now()
    const existing = (customDailyTodos || {})[dateKey] || []
    const next = { ...(customDailyTodos || {}), [dateKey]: [...existing, { id, label, note, tag }] }
    await updateCustomDailyTodos(next)
    setShowAddForm(false)
  }

  const handleDeleteCustom = async todoId => {
    const existing = (customDailyTodos || {})[dateKey] || []
    const next = { ...(customDailyTodos || {}), [dateKey]: existing.filter(t => t.id !== todoId) }
    await updateCustomDailyTodos(next)
    if (deleteCustomTodo) await deleteCustomTodo(todoId)
  }

  const logAction = async (task, actionLabel) => {
    if (!appendLog) return
    const d = new Date()
    await appendLog({
      date: dateKey,
      dateLabel: d.toLocaleDateString('en-US', { weekday:'long', month:'long', day:'numeric' }),
      label: actionLabel,
      tag: task.tag,
      ts: d.toISOString(),
    })
  }

  const handleSkip = async (task, reason) => {
    const skipKey = `${dateKey}-${task.id}`
    await updateSkippedTasks({
      ...skipped,
      [skipKey]: { date:dateKey, label:task.label, tag:task.tag, action:'skipped', reason, ts:new Date().toISOString() }
    })
    await logAction(task, reason ? `Skipped: ${task.label} — "${reason}"` : `Skipped: ${task.label}`)
    setActionOpenId(null)
  }

  const handleReschedule = async (task, newDate, newTime, reason) => {
    const skipKey = `${dateKey}-${task.id}`
    await updateSkippedTasks({
      ...skipped,
      [skipKey]: { date:dateKey, label:task.label, tag:task.tag, action:'rescheduled', reason, rescheduledTo:newDate, rescheduledToTime:newTime, ts:new Date().toISOString() }
    })

    // Create custom todo on target date
    const timePrefix = newTime ? `${fmt12(newTime)} — ` : ''
    const newLabel = `${timePrefix}${task.label}`
    const noteText = `Rescheduled from ${dateKey}${reason ? ` — ${reason}` : ''}`
    const newId = 'rescheduled-' + Date.now()
    const existing = (customDailyTodos || {})[newDate] || []
    await updateCustomDailyTodos({
      ...(customDailyTodos || {}),
      [newDate]: [...existing, { id:newId, label:newLabel, note:noteText, tag:task.tag }]
    })

    const newDateLabel = new Date(newDate + 'T12:00:00').toLocaleDateString('en-US', { weekday:'short', month:'short', day:'numeric' })
    await logAction(task, reason
      ? `Rescheduled to ${newDateLabel}: ${task.label} — "${reason}"`
      : `Rescheduled to ${newDateLabel}: ${task.label}`)
    setActionOpenId(null)
  }

  // ── Render ────────────────────────────────────────────────────

  return (
    <div>
      <div className="page-title">{todayLabel()}</div>
      <div className="page-sub">{doneCount}/{totalCount} tasks done today</div>

      {/* ── ADD TASK — top ── */}
      {showAddForm ? (
        <AddTodoForm onAdd={handleAddCustom} onCancel={() => setShowAddForm(false)} />
      ) : (
        <button onClick={() => setShowAddForm(true)}
          style={{ width:'100%', background:'var(--forest)', border:'none', borderRadius:12, padding:'13px 18px', cursor:'pointer', display:'flex', alignItems:'center', gap:10, marginBottom:16 }}>
          <span style={{ fontSize:18, color:'var(--green-light)' }}>+</span>
          <span style={{ fontFamily:'DM Sans, sans-serif', fontSize:13, color:'var(--green-light)', fontWeight:600 }}>Add task for today</span>
        </button>
      )}

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
                <div>
                  <div className="routine-habit">{item.habit}</div>
                  <div className="routine-detail">{item.detail}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Commitments for today */}
      {sortedCommitments.length > 0 && (
        <>
          <p className="section-label">Commitments Today</p>
          {sortedCommitments.map(c => {
            const label = c.time ? `${fmt12(c.time)} — ${c.text}` : c.text
            const note = [c.person && `With: ${c.person}`, c.prepMin && `Leave ${c.prepMin} min early`].filter(Boolean).join(' · ')
            const mins = timeToMinutes(c.time)
            const overdue = mins !== null && now > mins + 10 && !c.done
            return (
              <div key={c.id} style={{ marginBottom:8 }}>
                <TodoRow id={c.id} label={label} note={note || undefined}
                  tag={c.cat} done={isDone(c.id)} overdue={overdue}
                  onToggle={() => syncToggle(c.id, c.text, c.cat)}
                  isCustom={true} />
              </div>
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
      ) : visibleTemplateTodos.map(t => {
        const done = isDone(t.id)
        const mins = parseTaskMinutes(t.label)
        const overdue = !done && mins !== null && now > mins + 10
        const isOpen = actionOpenId === t.id
        return (
          <div key={t.id} style={{ marginBottom: isOpen ? 0 : 8 }}>
            <TodoRow
              id={t.id} label={t.label} note={t.note}
              tag={t.tag} done={done} overdue={overdue}
              onToggle={() => { syncToggle(t.id, t.label, t.tag); setActionOpenId(null) }}
              onOpenAction={() => setActionOpenId(isOpen ? null : t.id)}
              isCustom={false}
              actionOpen={isOpen}
            />
            {isOpen && (
              <ActionPanel
                onSkip={reason => handleSkip(t, reason)}
                onReschedule={(newDate, newTime, reason) => handleReschedule(t, newDate, newTime, reason)}
                onCancel={() => setActionOpenId(null)}
              />
            )}
          </div>
        )
      })}

      {/* Custom todos */}
      {customTodos.length > 0 && (
        <>
          <p className="section-label" style={{ marginTop:16 }}>Added by You</p>
          {customTodos.map(t => (
            <div key={t.id} style={{ marginBottom:8 }}>
              <TodoRow
                id={t.id} label={t.label} note={t.note}
                tag={t.tag} done={isDone(t.id)} overdue={false}
                onToggle={() => syncToggle(t.id, t.label, t.tag)}
                isCustom={true}
                onDeleteCustom={() => handleDeleteCustom(t.id)}
              />
            </div>
          ))}
        </>
      )}

      <div style={{ marginTop:12 }}>
        <button className="btn-ghost" onClick={() => { if (confirm('Reset all checkboxes for today?')) window.location.reload() }}>Reset today</button>
      </div>
    </div>
  )
}
