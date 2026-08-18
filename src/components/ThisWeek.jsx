import { useState, useEffect } from 'react'
import { buildWeekPlanFromTasks } from '../data/schedule.js'
import { recurringOccurrencesForDate } from '../lib/occurrences.js'
import { Icon } from './IconPicker.jsx'
import { bloomBurst } from '../lib/bloom.js'
import TimeField from './TimeField.jsx'
import AddItemModal from './AddItemModal.jsx'
import { setItemReminders } from '../lib/notifications.js'
import RecurringFilter from './RecurringFilter.jsx'
import { getRecurringFilter, RECURRING_FILTER_EVENT, visibleRecurring } from '../lib/viewFilter.js'
import CalendarLegend from './CalendarLegend.jsx'
import { DEFAULT_CAL_COLOR } from '../lib/calendars.js'
import { importedOn, buildImportedRows, hhmmToMins, fmt12 as importedFmt12, minsToHHMM } from '../lib/importedTasks.js'

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
function TaskRow({ id, text, cat, categories, done, carried, carriedFrom, onToggle, onDelete }) {
  const found = (categories || []).find(x => x.id === cat)
  const fallback = CAT_COLORS[cat] || CAT_COLORS.career
  const dot = found?.color || fallback.dot
  const label = found?.label || cat
  const icon = found?.icon || ''
  return (
    <div style={{ display:'flex', gap:10, alignItems:'center', padding:'8px 0', borderBottom:'1px solid #F5F3EF', opacity:done?.45:1 }}>
      <div onClick={e=>{ if(!done) bloomBurst(e.currentTarget); onToggle() }}
        style={{ width:18, height:18, borderRadius:'50%', flexShrink:0, cursor:'pointer',
          border:done?'none':`2px solid ${dot}`, background:done?dot:'transparent',
          display:'flex', alignItems:'center', justifyContent:'center', transition:'all .2s' }}>
        {done&&<span style={{ color:'white', fontSize:10, fontWeight:700 }}>✓</span>}
      </div>
      <div style={{ flex:1, display:'flex', alignItems:'center', gap:6, flexWrap:'wrap', cursor:'pointer' }} onClick={onToggle}>
        {icon && <Icon value={icon} size={15} />}
        <span style={{ fontSize:13, color:done?'var(--muted)':'var(--text)', textDecoration:done?'line-through':'none' }}>{text}</span>
        <span style={{ display:'inline-flex', alignItems:'center', gap:3, fontSize:9, letterSpacing:1, textTransform:'uppercase', padding:'1px 6px', borderRadius:10, background:`${dot}20`, color:dot }}>{label}</span>
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
        <TimeField value={time} onChange={setTime}
          style={{ width:110, fontSize:12, padding:'5px 8px', borderRadius:8, border:'1px solid var(--border)', fontFamily:'DM Sans,sans-serif' }}/>
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
function fmtRange(startDate, endDate) {
  const opts = { month:'short', day:'numeric' }
  const s = new Date(startDate+'T12:00:00').toLocaleDateString('en-US', opts)
  const e = new Date(endDate+'T12:00:00').toLocaleDateString('en-US', { ...opts, year:'numeric' })
  return `${s} – ${e}`
}

export default function ThisWeek({ todos, weekState, syncToggle, commitments, addCommitment, deleteCommitment, categories, recurringTasks, recurringExceptions, skipRecurringOccurrence, addRecurringTask, routines = [], taskTemplates = [], labelModel = null, externalEvents = [], externalCalendars = [], toggleCalendar, importedAdoptions = {}, adoptImportedEvent }) {
  const today = todayStr()
  const [weekOffset, setWeekOffset] = useState(0)
  // Just the 7-day Sun→Sat scaffold; recurring items are filled per-day below
  // from the same shared computation Today and Calendar use.
  const weekPlan = buildWeekPlanFromTasks({}, weekOffset)
  // Which repeating groups / everyday habits show here — user-controlled via the
  // Repeating filter (synced with the Calendar). Everyday habits hidden default.
  const [recFilter, setRecFilter] = useState(getRecurringFilter)
  useEffect(() => {
    const h = () => setRecFilter(getRecurringFilter())
    window.addEventListener(RECURRING_FILTER_EVENT, h)
    return () => window.removeEventListener(RECURRING_FILTER_EVENT, h)
  }, [])
  const weekRecurring = visibleRecurring(recurringTasks, recFilter)
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

  // ── Effective done, mirroring Today ──────────────────────────
  // The Week view used to read only the stored check/uncheck record, so a
  // routine / time-block / auto-complete task that Today shows ticked once its
  // window has passed still looked un-done here — and tapping it flipped the
  // wrong way. These helpers reproduce Today's effectiveDone so both screens
  // agree on what's checked and a tap always flips what's actually shown.
  const nowMins = (() => { const d = new Date(); return d.getHours() * 60 + d.getMinutes() })()
  const routineIdSet = new Set((routines || []).map(r => r.id))
  const hhmm = (t) => { if (!t) return null; const [h, m] = String(t).split(':').map(Number); return h * 60 + m }
  const doneKey = (task, date) => task.isCommitment ? task.id : (date + '_' + task.id)
  const hasRecord = (task, date) => doneKey(task, date) in (todos || {})
  const recordDone = (task, date) => !!(todos[doneKey(task, date)] || weekState[doneKey(task, date)])
  const effectiveDone = (task, date, isToday, isPast, dayBlocks) => {
    // An explicit tap (check or uncheck) always wins over the time default.
    if (hasRecord(task, date)) return recordDone(task, date)
    const autoRoutine = task.routine && routineIdSet.has(task.routine)
    const inBlock = task._mins != null && (dayBlocks || []).some(b => task._mins >= b.start && task._mins < b.end)
    if ((task.autoComplete === true || autoRoutine || inBlock) && task._mins != null) {
      // Today: done once the task's own window has passed. A past day is wholly
      // over; a future day hasn't happened yet.
      return isToday ? (nowMins >= task._mins + (task._dur || 0)) : isPast
    }
    return false
  }

  const commitsByDate = {}
  ;(commitments||[]).forEach(c => {
    if (!c.date || c.block) return   // time blocks show only on the Today timeline
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

  const rangeLabel = fmtRange(weekPlan[0].date, weekPlan[6].date)
  const weekTitle = weekOffset === 0 ? 'This Week' : weekOffset === -1 ? 'Last Week' : weekOffset === 1 ? 'Next Week' : rangeLabel
  const navBtn = { fontSize:16, lineHeight:1, width:32, height:32, borderRadius:9, border:'1px solid var(--border)', background:'white', color:'var(--muted)', cursor:'pointer', fontFamily:'DM Sans,sans-serif', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }

  return (
    <div>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:10, marginBottom:6, flexWrap:'wrap' }}>
        <div className="page-title" style={{ marginBottom:0 }}>{weekTitle}</div>
        <div style={{ display:'flex', alignItems:'center', gap:6 }}>
          <RecurringFilter routines={routines} rows={recurringTasks} />
          {weekOffset !== 0 && (
            <button onClick={()=>setWeekOffset(0)}
              style={{ fontSize:11, padding:'7px 12px', borderRadius:9, border:'1px solid var(--teal)', background:'#F0FDFB', color:'var(--teal)', cursor:'pointer', fontFamily:'DM Sans,sans-serif', fontWeight:600, flexShrink:0 }}>
              This week
            </button>
          )}
          <button onClick={()=>setWeekOffset(o=>o-1)} title="Previous week" style={navBtn}>‹</button>
          <button onClick={()=>setWeekOffset(o=>o+1)} title="Next week" style={navBtn}>›</button>
        </div>
      </div>
      <div className="page-sub">{rangeLabel} · tap any circle to mark done</div>

      <CalendarLegend calendars={externalCalendars} onToggle={toggleCalendar} />

      {weekPlan.map((day, i) => {
        const isToday = day.date === today
        const isPast  = day.date < today
        const deleted = deletedByDay[day.date] || []

        const dayCommitments = (commitsByDate[day.date]||[])
          .sort((a,b) => (a.time||'99').localeCompare(b.time||'99'))

        // Recurring instances for this day (minus per-occurrence skips and any
        // legacy per-day localStorage deletions). Everyday habits (daily, or
        // weekly-on-all-7-days) are left off the Week view — they belong on the
        // daily Today screen — matching how the month calendar treats them.
        const recurringForDay = recurringOccurrencesForDate(weekRecurring, day.date, recurringExceptions)
          .filter(t => !deleted.includes(t.id) && !t.block)

        // Repeating time blocks + block commitments for this day, so a task
        // sitting inside one auto-completes here exactly as it does on Today.
        const dayBlocks = [
          ...recurringOccurrencesForDate(weekRecurring, day.date, recurringExceptions)
            .filter(t => t.block && t._time && t._dur)
            .map(t => ({ start: hhmm(t._time), end: hhmm(t._time) + t._dur })),
          ...(commitments || [])
            .filter(c => c.date === day.date && c.block && c.time && c.durationMins)
            .map(c => ({ start: hhmm(c.time), end: hhmm(c.time) + c.durationMins })),
        ]

        // Carry-forward: yesterday's carry-flagged recurring items left undone.
        const prevDate = i > 0 ? weekPlan[i-1].date : null
        const carriedFromPrev = prevDate
          ? recurringOccurrencesForDate(weekRecurring, prevDate, recurringExceptions)
              .filter(t => t.carry && !isDone(t.id, prevDate, false))
          : []

        const customTasks = customByDay[day.date] || []

        const allTasks = [
          ...dayCommitments.map(c=>({ id:c.id, text:c.time?`${fmt12(c.time)} — ${c.text}`:c.text, cat:c.cat||'personal', isCommitment:true, _sortTime:c.time||'99:99', _mins:hhmm(c.time), _dur:c.durationMins||null, autoComplete:c.autoComplete, routine:c.routine })),
          ...carriedFromPrev.map(t=>({ id:t.id, text:t.text, cat:t.cat, isRecurring:true, carried:true, carriedFrom:weekPlan[i-1].dayLabel, _sortTime:'00:00' })),
          ...recurringForDay.map(t=>({ id:t.id, text:t.label, cat:t.cat, isRecurring:true, _sortTime: t._time || '50:00', _mins:hhmm(t._time), _dur:t._dur||null, autoComplete:t.autoComplete, routine:t.routine })),
          ...customTasks.map(t=>({ ...t, _sortTime: (() => { const m=t.text?.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i); if(!m)return'50:00'; let h=parseInt(m[1]); if(m[3].toUpperCase()==='PM'&&h!==12)h+=12; if(m[3].toUpperCase()==='AM'&&h===12)h=0; return `${String(h).padStart(2,'0')}:${m[2]}`; })() })),
        ].sort((a,b) => (a._sortTime||'99:99').localeCompare(b._sortTime||'99:99'))

        // Imported (subscribed-calendar) events landing on this day — read-only
        // rows you can tick off or add into your own schedule. Untimed ones get
        // a recommended time clear of the day's already-timed items.
        const dayOccupied = [
          ...dayCommitments.filter(c=>c.time).map(c=>({ start:hhmmToMins(c.time), end:hhmmToMins(c.time)+(c.durationMins||30) })),
          ...recurringForDay.filter(t=>t._time).map(t=>({ start:hhmmToMins(t._time), end:hhmmToMins(t._time)+(t._dur||30) })),
        ]
        const importedRows = buildImportedRows(importedOn(externalEvents, day.date), day.date, dayOccupied, null)

        const doneCount = allTasks.filter(t=>effectiveDone(t, day.date, isToday, isPast, dayBlocks)).length

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
              {allTasks.length===0&&importedRows.length===0&&addingDay!==day.date&&(
                <div style={{ fontSize:12, color:'var(--muted)', padding:'8px 0', fontStyle:'italic' }}>
                  No tasks — {isPast?'nothing was scheduled':'use + Add or set up Recurring tasks'}
                </div>
              )}

              {allTasks.map(t => (
                <TaskRow key={t.id} id={t.id} text={t.text} cat={t.cat} categories={categories}
                  done={effectiveDone(t, day.date, isToday, isPast, dayBlocks)}
                  carried={t.carried} carriedFrom={t.carriedFrom}
                  onToggle={()=>syncToggle(t.id, t.text, t.cat, t.isCommitment?null:day.date, !effectiveDone(t, day.date, isToday, isPast, dayBlocks))}
                  onDelete={t.carried ? null
                    : t.isCommitment
                      ? ()=>deleteCommitment&&deleteCommitment(t.id)
                      : t.isRecurring
                        ? ()=>skipRecurringOccurrence&&skipRecurringOccurrence(t.id, day.date)
                        : ()=>customByDay[day.date]?.find(c=>c.id===t.id)
                            ? handleDeleteCustom(day.date, t.id)
                            : handleDeleteTemplate(day.date, t.id)}
                />
              ))}

              {importedRows.map(row => {
                const { span, key } = row
                const color = span.color || DEFAULT_CAL_COLOR
                const done = !!(todos[key] || weekState[key])
                const adopted = !!importedAdoptions[key]
                const timeText = row.startMins != null
                  ? `${importedFmt12(minsToHHMM(row.startMins))}${span.allDay ? ' (suggested)' : ''}`
                  : (span.allDay ? 'all-day' : '')
                return (
                  <div key={key} style={{ display:'flex', gap:10, alignItems:'center', padding:'8px 0', borderBottom:'1px solid #F5F3EF', opacity:done?.5:1 }}>
                    <div onClick={()=>syncToggle(key, span.label||'Busy', null, null, !done)}
                      style={{ width:18, height:18, borderRadius:'50%', flexShrink:0, cursor:'pointer',
                        border:done?'none':`2px solid ${color}`, background:done?color:'transparent',
                        display:'flex', alignItems:'center', justifyContent:'center' }}>
                      {done&&<span style={{ color:'white', fontSize:10, fontWeight:700 }}>✓</span>}
                    </div>
                    <div style={{ flex:1, minWidth:0, display:'flex', alignItems:'center', gap:6, flexWrap:'wrap' }}>
                      <span style={{ fontSize:13, color:done?'var(--muted)':'var(--text)', textDecoration:done?'line-through':'none' }}>{span.label||'Busy'}</span>
                      {timeText && <span style={{ fontSize:11, color:'var(--muted)' }}>{timeText}</span>}
                      <span style={{ display:'inline-flex', alignItems:'center', gap:3, fontSize:9, letterSpacing:1, textTransform:'uppercase', padding:'1px 6px', borderRadius:10, background:`${color}20`, color }}>
                        <span style={{ width:6, height:6, borderRadius:'50%', background:color }} />{span.calendarName||'Calendar'}
                      </span>
                    </div>
                    {adopted
                      ? <span style={{ fontSize:9, letterSpacing:.5, textTransform:'uppercase', color:'#5C8A5C', flexShrink:0, fontWeight:700 }}>✓ Added</span>
                      : <button onClick={()=>adoptImportedEvent&&adoptImportedEvent(span, day.date, row.timeHHMM, row.dur)}
                          title="Add to my schedule"
                          style={{ fontSize:10, padding:'2px 8px', borderRadius:6, border:'1px solid var(--teal)', background:'#F0FDFB', color:'var(--teal)', cursor:'pointer', flexShrink:0, fontFamily:'DM Sans,sans-serif', fontWeight:600 }}>+ Schedule</button>}
                  </div>
                )
              })}

              {addingDay===day.date&&(
                <AddItemModal presetDate={day.date} categories={categories} routines={routines} templates={taskTemplates} labelModel={labelModel}
                  onSave={(commitment, reminderMins)=>{ if(addCommitment) addCommitment(commitment); setItemReminders(commitment.id, reminderMins); setAddingDay(null) }}
                  onSaveRecurring={addRecurringTask}
                  onClose={()=>setAddingDay(null)} title="Add to this day" />
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
