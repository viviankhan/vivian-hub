import { useState, useMemo } from 'react'
import { Icon } from './IconPicker.jsx'
import AddItemModal from './AddItemModal.jsx'
import { splitTimePrefix, recursDaily } from '../lib/occurrences.js'

const DAYS = ['monday','tuesday','wednesday','thursday','friday','saturday','sunday']
const DAY_SHORT = { monday:'Mon', tuesday:'Tue', wednesday:'Wed', thursday:'Thu', friday:'Fri', saturday:'Sat', sunday:'Sun' }

// Categories are the shared, user-editable list (Settings → Categories),
// passed in as a prop. This resolves a category id to its label + color + icon.
function resolveCat(id, categories) {
  const found = (categories || []).find(c => c.id === id)
  return { label: found?.label || id, color: found?.color || '#9CA3AF', icon: found?.icon || '' }
}

// Current day-of-week name. JS getDay(): 0=Sun…6=Sat → mapped to DAYS (Mon-indexed)
const JS_DAY_TO_NAME = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday']
function todayName() { return JS_DAY_TO_NAME[new Date().getDay()] }

// ── Helpers ────────────────────────────────────────────────────
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
  if (startDate) return `Started ${fmtDate(startDate)}`
  if (endDate)   return `Until ${fmtDate(endDate)}`
  return ''
}

function Tag({ label, color, icon }) {
  const c = color || '#9CA3AF'
  return <span style={{ display:'inline-flex', alignItems:'center', gap:3, fontSize:9, padding:'2px 6px', borderRadius:6, background:`${c}20`, color:c, fontWeight:700, letterSpacing:.8, textTransform:'uppercase' }}>{icon && <Icon value={icon} size={11} />}{label}</span>
}

// ── Task list row ──────────────────────────────────────────────
function TaskListRow({ task, onEdit, today, categories }) {
  const text = task.text||task.label||''
  const catId = task.cat||task.tag||'other'
  const { label: catLabel, color: catColor, icon: catIcon } = resolveCat(catId, categories)
  const hasDateRange = task.startDate || task.endDate
  const isToday = task.days?.includes(today)
  return (
    <div onClick={onEdit}
      style={{ display:'flex', gap:10, alignItems:'center', background:isToday?'#F0FDFB':'white', borderRadius:11, border:`1px solid ${isToday?'var(--teal)':'var(--border)'}`, borderLeft:isToday?'3px solid var(--teal)':'1px solid var(--border)', padding:'11px 14px', marginBottom:7, cursor:'pointer', transition:'border-color .15s' }}
      onMouseEnter={e=>e.currentTarget.style.borderColor='#52B788'}
      onMouseLeave={e=>e.currentTarget.style.borderColor=isToday?'var(--teal)':'var(--border)'}>
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

// ── Main ───────────────────────────────────────────────────────
export default function RecurringTasksManager({ recurringTasks, addRecurringTask, updateRecurringTask, deleteRecurringTask, clearRecurringTasks, categories, taskTemplates = [], labelModel = null }) {
  const [editing,     setEditing]     = useState(null) // null | 'new' | task object
  const [filterDay,   setFilterDay]   = useState(todayName())
  const [confirmClear, setConfirmClear] = useState(false)
  const [clearing,     setClearing]     = useState(false)
  const today = todayName()

  // Build flat tasks array — expand the legacy per-day shape if that's what's
  // still stored. Deduplicates tasks with the same text into one entry with
  // merged days.
  const flatData = useMemo(() => {
    if (Array.isArray(recurringTasks?.tasks)) return recurringTasks.tasks

    // Build raw list from the legacy per-day format. Its two buckets are no
    // longer different kinds of task, so both land in the same list.
    const raw = []
    const wt = recurringTasks?.weekTasks  || {}
    const dt = recurringTasks?.dailyTodos || {}
    DAYS.forEach(day => {
      ;[...(wt[day]||[]), ...(dt[day]||[])].forEach(t =>
        raw.push({ ...t, days:[day], startDate:null, endDate:null }))
    })

    // Deduplicate: group by (text|label) + cat/tag → merge days arrays
    const map = new Map()
    raw.forEach(task => {
      const key = `${task.text||task.label}||${task.cat||task.tag}`
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
    const bucket = freqBucket(t)
    if (filterDay === 'all')     return true
    if (filterDay === 'daily')   return bucket === 'daily'
    if (filterDay === 'monthly') return bucket === 'monthly'
    return bucket === 'weekly' && (t.days||[]).includes(filterDay)   // a weekday
  })

  // Sort: by first day
  const dayOrder = Object.fromEntries(DAYS.map((d,i)=>[d,i]))
  const byDay = (a,b)=>{
    const da = Math.min(...(a.days||[]).map(d=>dayOrder[d]??99))
    const db = Math.min(...(b.days||[]).map(d=>dayOrder[d]??99))
    return da-db
  }
  const sorted = [...visible].sort(byDay)
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
            <TaskListRow key={task.id+(task.days||[]).join('')} task={task} onEdit={()=>setEditing(task)} today={today} categories={categories} />
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

      {/* New task — uses the same add sheet as the rest of the app, opened
          straight into its Repeat section. */}
      {editing==='new' && (
        <AddItemModal
          categories={categories}
         
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
