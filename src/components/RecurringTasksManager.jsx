import { useState, useMemo } from 'react'
import { Icon } from './IconPicker.jsx'
import DateField from './DateField.jsx'
import TimeField from './TimeField.jsx'
import AddItemModal from './AddItemModal.jsx'
import ColorSwatchRow from './ColorSwatchRow.jsx'
import { splitTimePrefix, recursDaily } from '../lib/occurrences.js'

const DAYS = ['monday','tuesday','wednesday','thursday','friday','saturday','sunday']
const DAY_SHORT = { monday:'Mon', tuesday:'Tue', wednesday:'Wed', thursday:'Thu', friday:'Fri', saturday:'Sat', sunday:'Sun' }

// ── Time helpers for shifting a whole routine ──────────────────
// A recurring task keeps its time in the label prefix ("7:00 AM — …"). These
// helpers read that time, and rewrite the prefix when a routine is nudged
// earlier/later so every step moves together and keeps its spacing.
const MAX_MIN = 23 * 60 + 59
function fmt12Mins(mins) {
  const h = Math.floor(mins / 60), m = mins % 60
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`
}
// The field that carries a task's display text (and its time prefix): 'week'
// tasks store it in `text`, 'today' tasks in `label`.
function labelField(task) { return task.type === 'week' ? 'text' : 'label' }
// Minutes-since-midnight of a task's time prefix, or null if it has none.
function taskTimeMins(task) {
  const { time } = splitTimePrefix(task[labelField(task)] || task.label || task.text || '')
  if (!time) return null
  const [h, m] = time.split(':').map(Number)
  return h * 60 + m
}
// Rewrite a label's leading time prefix to `mins`. Labels with no time prefix
// come back unchanged (a routine can hold un-timed steps; they just don't move).
function setLabelTime(label, mins) {
  const { time, title } = splitTimePrefix(label || '')
  if (!time) return label
  return `${fmt12Mins(mins)} — ${title}`
}
// The earliest → latest window across a routine's timed tasks, or null.
function routineTimeRange(tasks) {
  const mins = tasks.map(taskTimeMins).filter(x => x != null)
  if (!mins.length) return null
  return { start: Math.min(...mins), end: Math.max(...mins) }
}

// Categories are the shared, user-editable list (Settings → Categories),
// passed in as a prop. This resolves a category id to its label + color + icon.
function resolveCat(id, categories) {
  const found = (categories || []).find(c => c.id === id)
  return { label: found?.label || id, color: found?.color || '#9CA3AF', icon: found?.icon || '' }
}

// Current day-of-week name. JS getDay(): 0=Sun…6=Sat → mapped to DAYS (Mon-indexed)
const JS_DAY_TO_NAME = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday']
function todayName() { return JS_DAY_TO_NAME[new Date().getDay()] }

// ── Convert old per-day format → flat array ────────────────────
export function migrateLegacyTasks(recurringTasks) {
  if (!recurringTasks) return null
  // Already migrated
  if (Array.isArray(recurringTasks.tasks)) return recurringTasks
  const tasks = []
  const wt = recurringTasks.weekTasks  || {}
  const dt = recurringTasks.dailyTodos || {}
  DAYS.forEach(day => {
    ;(wt[day]||[]).forEach(t => {
      tasks.push({ ...t, type:'week',  days:[day], startDate:null, endDate:null })
    })
    ;(dt[day]||[]).forEach(t => {
      tasks.push({ ...t, type:'today', days:[day], startDate:null, endDate:null })
    })
  })
  return { tasks }
}

// ── Convert flat array → per-day (for schedule engine) ─────────
export function flatToPerDay(flat, dateStr) {
  if (!flat?.tasks) return null
  const today = dateStr ? new Date(dateStr+'T12:00:00') : new Date()
  const weekTasks  = {}
  const dailyTodos = {}
  DAYS.forEach(d => { weekTasks[d] = []; dailyTodos[d] = [] })
  flat.tasks.forEach(task => {
    // Check date range
    if (task.startDate) {
      const start = new Date(task.startDate+'T00:00:00')
      if (today < start) return
    }
    if (task.endDate) {
      const end = new Date(task.endDate+'T23:59:59')
      if (today > end) return
    }
    ;(task.days||[]).forEach(day => {
      const { type, days, startDate, endDate, ...rest } = task
      if (type === 'week')  weekTasks[day]  = [...(weekTasks[day]||[]),  rest]
      else                  dailyTodos[day] = [...(dailyTodos[day]||[]), rest]
    })
  })
  return { weekTasks, dailyTodos }
}

// ── Helpers ────────────────────────────────────────────────────
function slugify(t) { return t.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/(^-|-$)/g,'').slice(0,28) }
// "Jul 27, 2026" — matches the month/day/year style used elsewhere (Events, etc.)
// rather than the raw 07/27/2026 slashes.
function fmtDate(d) {
  if (!d) return ''
  return new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' })
}
// A clean one-line summary of a task's active window. Handles start-only,
// end-only, and both — with proper spacing (the old inline version ran
// "From 07/27/2026" straight into "No end date").
function dateRangeText(startDate, endDate) {
  if (startDate && endDate) return `${fmtDate(startDate)} – ${fmtDate(endDate)}`
  if (startDate) return `From ${fmtDate(startDate)}`
  if (endDate)   return `Until ${fmtDate(endDate)}`
  return ''
}

function Tag({ label, color, icon }) {
  const c = color || '#9CA3AF'
  return <span style={{ display:'inline-flex', alignItems:'center', gap:3, fontSize:9, padding:'2px 6px', borderRadius:6, background:`${c}20`, color:c, fontWeight:700, letterSpacing:.8, textTransform:'uppercase' }}>{icon && <Icon value={icon} size={11} />}{label}</span>
}
function TypeBadge({ type }) {
  return <span style={{ fontSize:9, padding:'2px 6px', borderRadius:6,
    background:type==='week'?'#E0F2FE':'#FEF9C3', color:type==='week'?'#0369A1':'#854D0E',
    fontWeight:700, letterSpacing:.8, textTransform:'uppercase' }}>{type==='week'?'Week':'Today'}</span>
}
function DayPill({ day, active, onClick }) {
  return (
    <button onClick={onClick} style={{ fontSize:10, padding:'4px 9px', borderRadius:16,
      border:`1.5px solid ${active?'var(--forest)':'var(--border)'}`,
      background:active?'var(--forest)':'white', color:active?'var(--green-light)':'var(--muted)',
      cursor:'pointer', fontFamily:'DM Sans,sans-serif', fontWeight:600 }}>
      {DAY_SHORT[day]}
    </button>
  )
}

// ── Task editor modal ──────────────────────────────────────────
function TaskModal({ initial, onSave, onDelete, onClose, categories }) {
  const isNew = !initial
  const catList = (categories && categories.length) ? categories : [{ id:'other', label:'Other', color:'#8899AA' }]
  const [text,      setText]      = useState(initial?.text||initial?.label||'')
  const [note,      setNote]      = useState(initial?.note||'')
  const [type,      setType]      = useState(initial?.type||'week')
  const [cat,       setCat]       = useState(initial?.cat||initial?.tag||catList[0].id)
  const [carry,     setCarry]     = useState(initial?.carry||false)
  const [days,      setDays]      = useState(initial?.days||['monday'])
  const [startDate, setStartDate] = useState(initial?.startDate||'')
  const [endDate,   setEndDate]   = useState(initial?.endDate||'')
  const [noEnd,     setNoEnd]     = useState(!initial?.endDate)

  const toggleDay = (d) => setDays(prev => prev.includes(d) ? prev.filter(x=>x!==d) : [...prev,d])

  const save = () => {
    if (!text.trim() || days.length===0) return
    const id = initial?.id || `${days[0].slice(0,3)}-${slugify(text)}`
    const base = { id, days, type, cat, startDate:startDate||null, endDate:(!noEnd&&endDate)||null }
    if (type==='week')  onSave({ ...base, text:text.trim(), carry })
    else                onSave({ ...base, label:text.trim(), note:note.trim(), tag:cat })
  }

  const inp = { width:'100%', fontSize:13, padding:'9px 12px', borderRadius:10, border:'1px solid var(--border)', fontFamily:'DM Sans,sans-serif', outline:'none', boxSizing:'border-box', marginBottom:10, background:'white', color:'var(--text)' }

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.5)', zIndex:600, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
      <div style={{ background:'white', borderRadius:18, maxWidth:420, width:'100%', boxShadow:'0 24px 64px rgba(0,0,0,.25)', overflow:'hidden' }}>

        {/* Modal header */}
        <div style={{ background:'var(--forest)', padding:'18px 20px', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <div className="serif" style={{ color:'var(--green-light)', fontSize:18, fontWeight:600 }}>{isNew ? 'New Recurring Task' : 'Edit Task'}</div>
          <button onClick={onClose} style={{ background:'rgba(255,255,255,.1)', border:'none', color:'var(--green-light)', borderRadius:8, width:30, height:30, cursor:'pointer', fontSize:16 }}>✕</button>
        </div>

        <div style={{ padding:'18px 20px' }}>
          {/* Type toggle */}
          <div style={{ fontSize:10, color:'var(--muted)', letterSpacing:1.5, textTransform:'uppercase', marginBottom:6 }}>Appears in</div>
          <div style={{ display:'flex', gap:0, marginBottom:14, borderRadius:10, overflow:'hidden', border:'1px solid var(--border)', width:'fit-content' }}>
            {[['week','Week tab'],['today','Today tab']].map(([v,l])=>(
              <button key={v} onClick={()=>setType(v)}
                style={{ fontSize:12, padding:'7px 16px', border:'none', cursor:'pointer', fontFamily:'DM Sans,sans-serif', fontWeight:600,
                  background:type===v?'var(--forest)':'white', color:type===v?'var(--green-light)':'var(--muted)' }}>{l}</button>
            ))}
          </div>

          {/* Text */}
          <input value={text} onChange={e=>setText(e.target.value)} autoFocus
            placeholder={type==='today'?'Label (e.g. 9:50 AM — Coral Reef class)…':'Task description…'}
            style={inp} />

          {/* Note (Today only) */}
          {type==='today' && (
            <input value={note} onChange={e=>setNote(e.target.value)} placeholder="Note (optional sub-text)…"
              style={{ ...inp, color:'var(--muted)', fontSize:12 }} />
          )}

          {/* Category */}
          <div style={{ display:'flex', gap:8, alignItems:'center', marginBottom:14, flexWrap:'wrap' }}>
            <select value={cat} onChange={e=>setCat(e.target.value)}
              style={{ fontSize:12, padding:'7px 10px', borderRadius:9, border:'1px solid var(--border)', fontFamily:'DM Sans,sans-serif', background:'white', cursor:'pointer' }}>
              {catList.map(c=><option key={c.id} value={c.id}>{c.label}</option>)}
            </select>
            {type==='week' && (
              <label style={{ display:'flex', alignItems:'center', gap:5, fontSize:12, color:'var(--muted)', cursor:'pointer' }}>
                <input type="checkbox" checked={carry} onChange={e=>setCarry(e.target.checked)} />
                carry forward if undone
              </label>
            )}
          </div>

          {/* Days */}
          <div style={{ fontSize:10, color:'var(--muted)', letterSpacing:1.5, textTransform:'uppercase', marginBottom:8 }}>Repeats on</div>
          <div style={{ display:'flex', gap:5, flexWrap:'wrap', marginBottom:14 }}>
            {DAYS.map(d=>(
              <DayPill key={d} day={d} active={days.includes(d)} onClick={()=>toggleDay(d)} />
            ))}
          </div>
          {days.length===0 && <div style={{ fontSize:11, color:'#EF4444', marginBottom:10 }}>Select at least one day.</div>}

          {/* Date range */}
          <div style={{ display:'flex', gap:8, marginBottom:4 }}>
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ fontSize:10, color:'var(--muted)', letterSpacing:1, textTransform:'uppercase', marginBottom:4 }}>Start date</div>
              <DateField value={startDate} onChange={setStartDate}
                style={{ ...inp, marginBottom:0, fontSize:12 }} />
            </div>
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ fontSize:10, color:'var(--muted)', letterSpacing:1, textTransform:'uppercase', marginBottom:4 }}>End date</div>
              <DateField value={endDate} onChange={setEndDate} disabled={noEnd}
                style={{ ...inp, marginBottom:0, fontSize:12, opacity:noEnd?.45:1 }} />
            </div>
          </div>
          <label style={{ display:'flex', alignItems:'center', gap:5, fontSize:11, color:'var(--muted)', cursor:'pointer', marginBottom:16 }}>
            <input type="checkbox" checked={noEnd} onChange={e=>setNoEnd(e.target.checked)} />
            No end date — repeats indefinitely
          </label>

          {/* Actions */}
          <div style={{ display:'flex', gap:8, justifyContent:'space-between' }}>
            <div style={{ display:'flex', gap:8 }}>
              <button onClick={save} disabled={!text.trim()||days.length===0}
                style={{ fontSize:13, padding:'10px 20px', borderRadius:10, border:'none', background:'var(--forest)', color:'var(--green-light)', cursor:'pointer', fontFamily:'DM Sans,sans-serif', fontWeight:600, opacity:(!text.trim()||days.length===0)?.5:1 }}>
                {isNew ? 'Add Task' : 'Save Changes'}
              </button>
              <button onClick={onClose}
                style={{ fontSize:13, padding:'10px 14px', borderRadius:10, border:'1px solid var(--border)', background:'white', color:'var(--muted)', cursor:'pointer', fontFamily:'DM Sans,sans-serif' }}>
                Cancel
              </button>
            </div>
            {!isNew && (
              <button onClick={onDelete}
                style={{ fontSize:12, padding:'8px 12px', borderRadius:10, border:'1px solid #FECACA', background:'white', color:'#EF4444', cursor:'pointer', fontFamily:'DM Sans,sans-serif' }}>
                Delete
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Task list row ──────────────────────────────────────────────
function TaskListRow({ task, onEdit, today, categories, routines }) {
  const text = task.text||task.label||''
  const catId = task.cat||task.tag||'other'
  const { label: catLabel, color: catColor, icon: catIcon } = resolveCat(catId, categories)
  const hasDateRange = task.startDate || task.endDate
  const isToday = task.days?.includes(today)
  const routine = task.routine ? (routines||[]).find(r => r.id === task.routine) : null
  return (
    <div onClick={onEdit}
      style={{ display:'flex', gap:10, alignItems:'center', background:isToday?'#F0FDFB':'white', borderRadius:11, border:`1px solid ${isToday?'var(--teal)':'var(--border)'}`, borderLeft:isToday?'3px solid var(--teal)':'1px solid var(--border)', padding:'11px 14px', marginBottom:7, cursor:'pointer', transition:'border-color .15s' }}
      onMouseEnter={e=>e.currentTarget.style.borderColor='#52B788'}
      onMouseLeave={e=>e.currentTarget.style.borderColor=isToday?'var(--teal)':'var(--border)'}>
      {routine && <span title={routine.name} style={{ width:9, height:9, borderRadius:'50%', background:routine.tint, boxShadow:'inset 0 0 0 1px rgba(0,0,0,.12)', flexShrink:0 }} />}
      {/* Text */}
      <div style={{ flex:1, minWidth:0 }}>
        <div style={{ fontSize:13, color:'var(--text)', fontWeight:500, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{text}</div>
        {task.note && <div style={{ fontSize:11, color:'var(--muted)', marginTop:1 }}>{task.note}</div>}
        {(hasDateRange || task.autoComplete) && (
          <div style={{ display:'flex', alignItems:'center', gap:6, flexWrap:'wrap', fontSize:10, color:'var(--muted)', marginTop:3 }}>
            {hasDateRange && <span>{dateRangeText(task.startDate, task.endDate)}</span>}
            {task.autoComplete && (
              <span style={{ display:'inline-flex', alignItems:'center', gap:3, fontSize:9, padding:'1px 6px', borderRadius:6, background:'#EAF5F8', color:'#2A7A90', fontWeight:700, letterSpacing:.4, textTransform:'uppercase' }}>✓ Auto</span>
            )}
          </div>
        )}
      </div>
      <Tag label={catLabel} color={catColor} icon={catIcon} />
      {/* Frequency — a Daily/Monthly chip, or the weekday pills for weekly.
          A weekly rule with all seven days reads as DAILY too (it lands daily). */}
      <div style={{ display:'flex', gap:3, flexWrap:'wrap', justifyContent:'flex-end', maxWidth:150, flexShrink:0 }}>
        {recursDaily(task) ? (
          <span style={{ fontSize:9, padding:'2px 7px', borderRadius:6, background:'var(--forest)', color:'var(--green-light)', fontWeight:700, letterSpacing:.5 }}>DAILY{task.interval>1?` ×${task.interval}`:''}</span>
        ) : task.freq==='monthly' ? (
          <span style={{ fontSize:9, padding:'2px 7px', borderRadius:6, background:'var(--forest)', color:'var(--green-light)', fontWeight:700, letterSpacing:.5 }}>MONTHLY</span>
        ) : (
          DAYS.filter(d=>task.days?.includes(d)).map(d=>(
            <span key={d} style={{ fontSize:9, padding:'2px 6px', borderRadius:6, background:d===today?'var(--teal)':'var(--forest)', color:d===today?'white':'var(--green-light)', fontWeight:700, letterSpacing:.5 }}>{DAY_SHORT[d]}</span>
          ))
        )}
      </div>
      <span style={{ fontSize:11, color:'var(--muted)', flexShrink:0 }}>›</span>
    </div>
  )
}

// ── Per-routine start-time shifter ─────────────────────────────
// Move a whole routine earlier or later in one go: set a new start time (the
// earliest step lands there and the rest follow, keeping their spacing) or nudge
// every timed step by a few minutes. Nothing downstream has to be edited by hand.
function RoutineShiftBar({ range, onShift, onSetStart }) {
  const steps = [-15, -5, 5, 15]
  const btn = { fontSize:11, padding:'4px 9px', borderRadius:7, border:'1px solid var(--border)', background:'white', color:'var(--text)', cursor:'pointer', fontFamily:'DM Sans,sans-serif', fontWeight:700, lineHeight:1 }
  return (
    <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap', marginBottom:9, padding:'8px 10px', background:'#FBFAF8', border:'1px solid var(--border)', borderRadius:9 }}>
      <span style={{ fontSize:10, color:'var(--muted)', letterSpacing:.5, textTransform:'uppercase', fontWeight:700 }}>Starts</span>
      <TimeField value={`${String(Math.floor(range.start/60)).padStart(2,'0')}:${String(range.start%60).padStart(2,'0')}`}
        onChange={hhmm => { if (!hhmm) return; const [h,m] = hhmm.split(':').map(Number); onSetStart(h*60+m) }}
        style={{ width:98, fontSize:12, padding:'5px 8px', borderRadius:8, border:'1px solid var(--border)', fontFamily:'DM Sans,sans-serif', color:'var(--text)' }} />
      {range.end !== range.start && (
        <span style={{ fontSize:11, color:'var(--muted)' }}>→ {fmt12Mins(range.end)}</span>
      )}
      <div style={{ display:'flex', gap:4, marginLeft:'auto', flexWrap:'wrap' }}>
        {steps.map(s => (
          <button key={s} onClick={()=>onShift(s)} title={`${s<0?'Earlier':'Later'} by ${Math.abs(s)} min`} style={btn}>
            {s<0?'−':'+'}{Math.abs(s)}m
          </button>
        ))}
      </div>
    </div>
  )
}

// ── Routines view — tasks grouped by routine, with group management ─────
function RoutinesView({ routines, tasks, categories, today, onEditTask, updateRecurringTask, addRoutine, updateRoutine, deleteRoutine }) {
  const [newName, setNewName] = useState('')
  const [newTint, setNewTint] = useState('#D9C7EE')
  const [confirmDel, setConfirmDel] = useState(null)
  const [tintOpen, setTintOpen] = useState(null)     // routine id whose tint picker is open
  const [newTintOpen, setNewTintOpen] = useState(false)
  const rInp = { fontSize:13, padding:'9px 12px', borderRadius:10, border:'1px solid var(--border)', fontFamily:'DM Sans,sans-serif', outline:'none', background:'white', color:'var(--text)', boxSizing:'border-box' }

  const byRoutine = (rid) => tasks.filter(t => (t.routine || '') === rid)
  const unassigned = tasks.filter(t => !t.routine || !routines.some(r => r.id === t.routine))
  const addNew = () => { if (newName.trim()) { addRoutine(newName.trim(), newTint); setNewName('') } }

  // Shift every timed task in a routine by `delta` minutes, clamped so no step
  // spills before midnight or past 11:59 PM (which would break the spacing).
  // Each task keeps every other field — category, days, and its routine tag —
  // so nothing downstream needs re-editing by hand.
  const shiftRoutine = (rid, delta) => {
    if (!updateRecurringTask || !delta) return
    const items = byRoutine(rid)
    const mins = items.map(taskTimeMins).filter(x => x != null)
    if (!mins.length) return
    const lo = Math.min(...mins), hi = Math.max(...mins)
    const d = Math.max(-lo, Math.min(MAX_MIN - hi, delta))
    if (!d) return
    items.forEach(task => {
      const cur = taskTimeMins(task)
      if (cur == null) return
      const f = labelField(task)
      updateRecurringTask(task.id, { ...task, [f]: setLabelTime(task[f], cur + d) })
    })
  }

  return (
    <div>
      <div className="page-sub" style={{ marginBottom:16 }}>
        Group recurring tasks into routines. A task's routine washes a soft color film behind it on the timeline — set it when you add or edit the task. Use each routine's start time to shift the whole thing earlier or later; every step moves together.
      </div>

      {/* Add a routine group — kept at the top so it's the first thing you reach. */}
      <div style={{ marginBottom:20, paddingBottom:16, borderBottom:'1px solid var(--border)' }}>
        <div style={{ fontSize:10, color:'var(--muted)', letterSpacing:1, textTransform:'uppercase', marginBottom:8 }}>New routine group</div>
        <div style={{ display:'flex', gap:8, alignItems:'center' }}>
          <button onClick={()=>setNewTintOpen(o=>!o)} title="Film color"
            style={{ width:34, height:34, borderRadius:9, background:newTint, border: newTintOpen ? '2px solid var(--text)' : '1px solid rgba(0,0,0,.12)', cursor:'pointer', flexShrink:0, padding:0 }} />
          <input value={newName} onChange={e=>setNewName(e.target.value)} placeholder="e.g. Afternoon routine…"
            onKeyDown={e=>{ if(e.key==='Enter') addNew() }} style={{ ...rInp, flex:1, minWidth:0 }} />
          <button onClick={addNew} disabled={!newName.trim()}
            style={{ fontSize:12, padding:'10px 16px', borderRadius:10, border:'none', background:'var(--forest)', color:'var(--green-light)', cursor:newName.trim()?'pointer':'default', opacity:newName.trim()?1:.5, fontFamily:'DM Sans,sans-serif', fontWeight:600, flexShrink:0 }}>Add</button>
        </div>
        {newTintOpen && (
          <div style={{ marginTop:8 }}>
            <ColorSwatchRow value={newTint} onChange={setNewTint} size={26} />
          </div>
        )}
      </div>

      {routines.map(r => {
        const items = byRoutine(r.id)
        const range = routineTimeRange(items)
        return (
          <div key={r.id} style={{ marginBottom:18 }}>
            {/* Group header — swatch (tap to recolor), editable name, count, delete */}
            <div style={{ display:'flex', alignItems:'center', gap:9, marginBottom:8 }}>
              <button onClick={()=>setTintOpen(o=>o===r.id?null:r.id)} title="Change film color"
                style={{ width:24, height:24, borderRadius:7, background:r.tint, border: tintOpen===r.id ? '2px solid var(--text)' : '1px solid rgba(0,0,0,.12)', cursor:'pointer', flexShrink:0, padding:0 }} />
              <input value={r.name} onChange={e=>updateRoutine(r.id,{ name:e.target.value })} aria-label="Routine name"
                style={{ flex:1, minWidth:0, fontSize:15, fontWeight:700, color:'var(--text)', border:'none', background:'transparent', fontFamily:'DM Sans,sans-serif', outline:'none', padding:'2px 0' }} />
              <span style={{ fontSize:11, color:'var(--muted)', flexShrink:0 }}>{items.length} task{items.length===1?'':'s'}</span>
              <button onClick={()=>setConfirmDel(confirmDel===r.id?null:r.id)} title="Delete routine"
                style={{ background:'none', border:'none', cursor:'pointer', color:'#C08872', fontSize:14, padding:'0 4px', flexShrink:0 }}>✕</button>
            </div>
            {tintOpen===r.id && (
              <div style={{ marginBottom:9 }}>
                <ColorSwatchRow value={r.tint} onChange={v=>updateRoutine(r.id,{ tint:v })} size={26} />
              </div>
            )}
            {confirmDel===r.id && (
              <div style={{ background:'#FFF5F5', border:'1px solid #FECACA', borderRadius:10, padding:11, marginBottom:9 }}>
                <div style={{ fontSize:12, color:'#991B1B', marginBottom:8 }}>Delete “{r.name}”? Its {items.length} task{items.length===1?'':'s'} stay — they just lose this routine.</div>
                <div style={{ display:'flex', gap:8 }}>
                  <button onClick={()=>{ deleteRoutine(r.id); setConfirmDel(null) }}
                    style={{ fontSize:12, padding:'6px 14px', borderRadius:8, border:'none', background:'#EF4444', color:'white', cursor:'pointer', fontFamily:'DM Sans,sans-serif', fontWeight:600 }}>Delete routine</button>
                  <button onClick={()=>setConfirmDel(null)}
                    style={{ fontSize:12, padding:'6px 12px', borderRadius:8, border:'1px solid var(--border)', background:'white', color:'var(--muted)', cursor:'pointer', fontFamily:'DM Sans,sans-serif' }}>Cancel</button>
                </div>
              </div>
            )}
            {/* Shift the whole routine earlier/later — only when it has timed steps */}
            {range && (
              <RoutineShiftBar range={range}
                onShift={(delta)=>shiftRoutine(r.id, delta)}
                onSetStart={(mins)=>shiftRoutine(r.id, mins - range.start)} />
            )}
            {/* A tinted rail down the group's tasks so the film color reads here too */}
            <div style={{ borderLeft:`3px solid ${r.tint}`, paddingLeft:10, borderRadius:2 }}>
              {items.length===0 ? (
                <div style={{ fontSize:12, color:'var(--muted)', padding:'4px 2px 6px', fontStyle:'italic' }}>No tasks yet — open a task and pick this routine.</div>
              ) : items.map(task => (
                <TaskListRow key={task.id+task.type+(task.days||[]).join('')} task={task} onEdit={()=>onEditTask(task)} today={today} categories={categories} routines={routines} />
              ))}
            </div>
          </div>
        )
      })}

      {/* Unassigned tasks */}
      {unassigned.length>0 && (
        <div style={{ marginBottom:18 }}>
          <div style={{ fontSize:15, fontWeight:700, color:'var(--muted)', marginBottom:8 }}>No routine</div>
          {unassigned.map(task => (
            <TaskListRow key={task.id+task.type+(task.days||[]).join('')} task={task} onEdit={()=>onEditTask(task)} today={today} categories={categories} routines={routines} />
          ))}
        </div>
      )}

    </div>
  )
}

// ── Main ───────────────────────────────────────────────────────
export default function RecurringTasksManager({ recurringTasks, addRecurringTask, updateRecurringTask, deleteRecurringTask, clearRecurringTasks, categories, routines = [], taskTemplates = [], labelModel = null, addRoutine, updateRoutine, deleteRoutine, defaultWeekTasks, defaultDailyTodos }) {
  const [editing,     setEditing]     = useState(null) // null | 'new' | task object
  const [view,        setView]        = useState('routines') // 'routines' | 'schedule'
  const [filterDay,   setFilterDay]   = useState(todayName())
  const [filterType,  setFilterType]  = useState('all')
  const [confirmClear, setConfirmClear] = useState(false)
  const [clearing,     setClearing]     = useState(false)
  const today = todayName()

  // Build flat tasks array — migrate legacy format if needed
  // Deduplicates tasks with the same text+type into one entry with merged days
  const flatData = useMemo(() => {
    if (Array.isArray(recurringTasks?.tasks)) return recurringTasks.tasks

    // Build raw list from defaults or legacy per-day format
    const raw = []
    const wt = recurringTasks?.weekTasks  || defaultWeekTasks
    const dt = recurringTasks?.dailyTodos || defaultDailyTodos
    DAYS.forEach(day => {
      ;(wt[day]||[]).forEach(t => raw.push({ ...t, type:'week',  days:[day], startDate:null, endDate:null }))
      ;(dt[day]||[]).forEach(t => raw.push({ ...t, type:'today', days:[day], startDate:null, endDate:null }))
    })

    // Deduplicate: group by (text|label) + type + cat/tag → merge days arrays
    const map = new Map()
    raw.forEach(task => {
      const key = `${task.text||task.label}||${task.type}||${task.cat||task.tag}`
      if (map.has(key)) {
        const existing = map.get(key)
        const merged = [...new Set([...existing.days, ...task.days])]
        map.set(key, { ...existing, days: merged })
      } else {
        map.set(key, { ...task })
      }
    })
    // Sort days within each task to canonical order
    const result = Array.from(map.values()).map(t => ({
      ...t, days: DAYS.filter(d => t.days.includes(d))
    }))
    return result
  }, [recurringTasks])

  // Each of these is now one atomic row operation (add/update/delete a single
  // task, or delete every row) rather than a whole-array overwrite — and
  // addRecurringTask/updateRecurringTask/etc. (in App.jsx) already surface
  // cloud-write failures via alert, so a failed save no longer looks like it
  // silently succeeded.
  const handleSave = async (task) => {
    if (editing === 'new') {
      await addRecurringTask(task)
    } else {
      await updateRecurringTask(editing.id, task)
    }
    setEditing(null)
  }
  const handleDelete = async () => {
    await deleteRecurringTask(editing.id)
    setEditing(null)
  }
  // Wait for the cloud write to finish before closing — prevents a fast refresh
  // from canceling the save and letting old data reload.
  const handleClearAll = async () => {
    setClearing(true)
    try {
      await clearRecurringTasks()
      setConfirmClear(false)
      setFilterDay(todayName())
    } finally {
      setClearing(false)
    }
  }

  // A task's frequency bucket. "Every day" covers a daily rule and a weekly rule
  // with all 7 days ticked — both land on every date, so they get one Daily home
  // rather than appearing under every weekday. Day-of-month tasks are Monthly.
  const freqBucket = (t) => {
    if (recursDaily(t)) return 'daily'
    if ((t.freq || 'weekly') === 'monthly') return 'monthly'
    return 'weekly'
  }

  // Frequency-aware filter. `filterDay` is one of:
  //   'all'     — everything (grouped into Daily / Weekly / Monthly on render)
  //   'daily'   — only tasks that land every day
  //   'monthly' — only day-of-month tasks
  //   a weekday — only the weekly tasks that fall on that weekday
  // Daily and monthly tasks no longer clutter every weekday column; each shows
  // once, in its own bucket.
  const visible = flatData.filter(t => {
    if (filterType !== 'all' && t.type !== filterType) return false
    const bucket = freqBucket(t)
    if (filterDay === 'all')     return true
    if (filterDay === 'daily')   return bucket === 'daily'
    if (filterDay === 'monthly') return bucket === 'monthly'
    return bucket === 'weekly' && (t.days||[]).includes(filterDay)   // a weekday
  })

  // Sort: by first day, then type
  const dayOrder = Object.fromEntries(DAYS.map((d,i)=>[d,i]))
  const byDayThenType = (a,b)=>{
    const da = Math.min(...(a.days||[]).map(d=>dayOrder[d]??99))
    const db = Math.min(...(b.days||[]).map(d=>dayOrder[d]??99))
    if (da!==db) return da-db
    return (a.type==='week'?0:1)-(b.type==='week'?0:1)
  }
  const sorted = [...visible].sort(byDayThenType)
  // "All days" splits the list into labeled sections so a daily habit reads once
  // under "Every day" and a monthly task once under "Monthly", never repeated
  // down each weekday. A specific filter collapses to just its own section.
  const sections = [
    { key:'daily',   label:'Every day', items: sorted.filter(t=>freqBucket(t)==='daily') },
    { key:'weekly',  label:'Weekly',    items: sorted.filter(t=>freqBucket(t)==='weekly') },
    { key:'monthly', label:'Monthly',   items: sorted.filter(t=>freqBucket(t)==='monthly') },
  ].filter(s => s.items.length)

  return (
    <div>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:10 }}>
        <div className="page-title" style={{ marginBottom:0 }}>Recurring</div>
        <button onClick={()=>setEditing('new')}
          style={{ fontSize:12, padding:'8px 16px', borderRadius:10, border:'none', background:'var(--forest)', color:'var(--green-light)', cursor:'pointer', fontFamily:'DM Sans,sans-serif', fontWeight:600, flexShrink:0 }}>
          + New Task
        </button>
      </div>

      {/* Sub-tabs: the full schedule, or grouped by routine. */}
      <div style={{ display:'flex', gap:4, padding:4, borderRadius:12, background:'#EAE7EE', marginBottom:14 }}>
        {[['routines','Routines'],['schedule','Schedule']].map(([v,l])=>(
          <button key={v} onClick={()=>setView(v)}
            style={{ flex:1, padding:'9px 6px', borderRadius:9, border:'none', cursor:'pointer', fontFamily:'DM Sans,sans-serif', fontSize:13, fontWeight:700,
              background: view===v ? 'var(--forest)' : 'transparent', color: view===v ? 'var(--green-light)' : 'var(--muted)' }}>{l}</button>
        ))}
      </div>

      {view==='routines' ? (
        <RoutinesView routines={routines} tasks={flatData} categories={categories} today={today}
          onEditTask={(t)=>setEditing(t)} updateRecurringTask={updateRecurringTask}
          addRoutine={addRoutine} updateRoutine={updateRoutine} deleteRoutine={deleteRoutine} />
      ) : (<>
      <div className="page-sub">
        {filterDay==='all'
          ? `${flatData.length} recurring task${flatData.length===1?'':'s'} — grouped by how often they repeat`
          : filterDay==='daily'
            ? `${sorted.length} task${sorted.length===1?'':'s'} that repeat every day`
          : filterDay==='monthly'
            ? `${sorted.length} monthly task${sorted.length===1?'':'s'}`
            : `${sorted.length} weekly on ${DAY_SHORT[filterDay]}${filterDay===today?' — Today':''} · ${flatData.length} total`}
      </div>

      {/* Filters — All / Daily, then the weekdays (weekly only), then Monthly.
          Daily and monthly tasks live in their own buckets, so tapping a weekday
          shows just that day's weekly tasks. */}
      <div style={{ display:'flex', gap:5, flexWrap:'wrap', marginBottom:8 }}>
        <button onClick={()=>setFilterDay('all')} style={filterPill(filterDay==='all')}>All</button>
        <button onClick={()=>setFilterDay(filterDay==='daily'?'all':'daily')} style={filterPill(filterDay==='daily')}>Daily</button>
        {DAYS.map(d=>{
          const isToday = d===today
          return (
            <button key={d} onClick={()=>setFilterDay(filterDay===d?'all':d)}
              title={isToday?'Today':undefined}
              style={{ ...filterPill(filterDay===d), ...(isToday ? { borderColor:'var(--teal)', boxShadow:'0 0 0 2px rgba(74,158,181,.3)' } : {}) }}>
              {isToday?'• ':''}{DAY_SHORT[d]}
            </button>
          )
        })}
        <button onClick={()=>setFilterDay(filterDay==='monthly'?'all':'monthly')} style={filterPill(filterDay==='monthly')}>Monthly</button>
      </div>
      <div style={{ display:'flex', gap:5, marginBottom:16 }}>
        {[['all','All types'],['week','Week only'],['today','Today only']].map(([v,l])=>(
          <button key={v} onClick={()=>setFilterType(v)}
            style={{ fontSize:10, padding:'4px 11px', borderRadius:16, border:`1.5px solid ${filterType===v?'var(--teal)':'var(--border)'}`,
              background:filterType===v?'#F0FDFB':'white', color:filterType===v?'var(--teal)':'var(--muted)',
              cursor:'pointer', fontFamily:'DM Sans,sans-serif', fontWeight:600, letterSpacing:.5 }}>{l}</button>
        ))}
      </div>

      {/* Task list — sectioned by frequency (Every day / Weekly / Monthly) so a
          daily habit reads once and a monthly task only under Monthly. */}
      {sorted.length===0 ? (
        <div style={{ textAlign:'center', padding:'28px 0', color:'var(--muted)', fontSize:13 }}>
          No tasks match this filter.
        </div>
      ) : sections.map(sec=>(
        <div key={sec.key} style={{ marginBottom:14 }}>
          {sections.length>1 && (
            <div style={{ fontSize:10, color:'var(--muted)', letterSpacing:1.2, textTransform:'uppercase', fontWeight:700, margin:'2px 2px 8px' }}>
              {sec.label} · {sec.items.length}
            </div>
          )}
          {sec.items.map(task=>(
            <TaskListRow key={task.id+task.type+(task.days||[]).join('')} task={task} onEdit={()=>setEditing(task)} today={today} categories={categories} routines={routines} />
          ))}
        </div>
      ))}

      {/* Clear all */}
      <div style={{ marginTop:24, paddingTop:16, borderTop:'1px solid var(--border)' }}>
        {!confirmClear ? (
          <button onClick={()=>setConfirmClear(true)}
            style={{ fontSize:11, padding:'7px 14px', borderRadius:8, border:'1px solid #FECACA', background:'#FFF5F5', color:'#991B1B', cursor:'pointer', fontFamily:'DM Sans,sans-serif' }}>
            Clear all recurring events
          </button>
        ) : (
          <div style={{ background:'#FFF5F5', borderRadius:10, border:'1px solid #FECACA', padding:12 }}>
            <div style={{ fontSize:13, color:'#991B1B', marginBottom:8 }}>Remove every recurring event? This cannot be undone.</div>
            <div style={{ display:'flex', gap:8 }}>
              <button onClick={handleClearAll} disabled={clearing}
                style={{ fontSize:12, padding:'6px 14px', borderRadius:8, border:'none', background:'#EF4444', color:'white', cursor:clearing?'default':'pointer', fontFamily:'DM Sans,sans-serif', fontWeight:600, opacity:clearing?.6:1 }}>{clearing ? 'Clearing…' : 'Yes, clear all'}</button>
              <button onClick={()=>setConfirmClear(false)} disabled={clearing}
                style={{ fontSize:12, padding:'6px 12px', borderRadius:8, border:'1px solid var(--border)', background:'white', color:'var(--muted)', cursor:clearing?'default':'pointer', fontFamily:'DM Sans,sans-serif' }}>Cancel</button>
            </div>
          </div>
        )}
      </div>
      </>)}

      {/* New task — uses the same add sheet as the rest of the app, opened
          straight into its Repeat section. */}
      {editing==='new' && (
        <AddItemModal
          categories={categories}
          routines={routines}
          templates={taskTemplates}
          labelModel={labelModel}
          defaultRepeat
          onSaveRecurring={(task)=>{ addRecurringTask(task); setEditing(null) }}
          onClose={()=>setEditing(null)}
          title="New recurring task" />
      )}
      {/* Editing an existing recurring task — same add sheet, prefilled. */}
      {editing && editing!=='new' && (
        <AddItemModal
          existingRecurring={editing}
          categories={categories}
          routines={routines}
          templates={taskTemplates}
          labelModel={labelModel}
          onSaveRecurring={(task)=>{ updateRecurringTask(task.id, task); setEditing(null) }}
          onDelete={(t)=>{ deleteRecurringTask(t.id); setEditing(null) }}
          onClose={()=>setEditing(null)}
          title="Edit recurring task" />
      )}
    </div>
  )
}

function filterPill(active) {
  return { fontSize:10, padding:'4px 11px', borderRadius:16,
    border:`1.5px solid ${active?'var(--forest)':'var(--border)'}`,
    background:active?'var(--forest)':'white', color:active?'var(--green-light)':'var(--muted)',
    cursor:'pointer', fontFamily:'DM Sans,sans-serif', fontWeight:600, letterSpacing:.5 }
}
