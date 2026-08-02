import { useState, useEffect } from 'react'
import { Icon } from './IconPicker.jsx'
import AddItemModal from './AddItemModal.jsx'
import { setItemReminders } from '../lib/notifications.js'
import { recurringOccurrencesForDate, recursDaily } from '../lib/occurrences.js'
import { iconColorOn } from '../lib/glyphs.jsx'

// Pastel shading for how busy a day is (number of events on it).
const BUSY_SHADES = ['#F4F0FA', '#EAE1F4', '#DBC9EC', '#C9AEDF']
function busyShade(count) {
  if (count <= 0) return null
  return BUSY_SHADES[Math.min(count, BUSY_SHADES.length) - 1]
}

const calNavBtn = { fontSize:16, lineHeight:1, width:32, height:32, borderRadius:9, border:'1px solid var(--border)', background:'white', color:'var(--muted)', cursor:'pointer', fontFamily:'DM Sans,sans-serif', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }

function ds(year, month, day) {
  return `${year}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`
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
// End time from a start "HH:MM" + duration in minutes (for start–end display).
function endTimeFrom(start, mins) {
  if (!start || !mins) return ''
  const [h, m] = start.split(':').map(Number)
  const total = Math.min(h * 60 + m + mins, 23 * 60 + 59)
  return `${String(Math.floor(total/60)).padStart(2,'0')}:${String(total%60).padStart(2,'0')}`
}

export default function Calendar({ commitments, vacations, events, log, categories, jumpTo, addCommitment, updateCommitment, deleteCommitment, todos, recurringTasks, recurringExceptions, skipRecurringOccurrence, addRecurringTask, updateRecurringTask, deleteRecurringTask, routines = [], labelModel = null }) {
  // monthOffset shifts by whole months from the current month: 0 = this month,
  // -1 = last month, +1 = next month, and so on — unbounded either way.
  const [monthOffset, setMonthOffset] = useState(0)
  const [selected, setSelected] = useState(null)
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState(null)
  const [editingRec, setEditingRec] = useState(null)  // recurring template being edited
  const today = todayStr()

  // Add a commitment on any date (long-term planning), with its own optional
  // duration + reminder times. Shows immediately on the calendar + Week.
  const handleAdd = (commitment, reminderMins) => {
    if (addCommitment) addCommitment(commitment)
    setItemReminders(commitment.id, reminderMins)
  }
  const handleEdit = (commitment, reminderMins) => {
    const { id, ...changes } = commitment
    if (updateCommitment) updateCommitment(id, changes)
    setItemReminders(id, reminderMins)
    setEditing(null)
  }
  const toggleSubtask = (raw, sid) => {
    if (!updateCommitment) return
    const subs = (Array.isArray(raw.subtasks) ? raw.subtasks : []).map(s => s.id === sid ? { ...s, done: !s.done } : s)
    updateCommitment(raw.id, { subtasks: subs })
  }

  // Jump the calendar to the month containing a given date and select it.
  const goToDate = (dateStr) => {
    const [y, m] = dateStr.split('-').map(Number)
    const nowD = new Date()
    setMonthOffset((y - nowD.getFullYear()) * 12 + (m - 1 - nowD.getMonth()))
    setSelected(dateStr)
  }

  // The global search overlay hands us a { date, nonce } when the user picks a
  // suggestion — navigate there. The nonce makes re-picking the same date work.
  useEffect(() => {
    if (jumpTo && jumpTo.date) goToDate(jumpTo.date)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jumpTo?.date, jumpTo?.nonce])

  // Completion history — each time a task was checked off it was logged
  // (date + label). This stays even after the task itself is deleted, so the
  // calendar keeps a record of what happened when.
  const doneByDate = {}
  ;(log || []).forEach(e => {
    const d = e.date || (e.ts ? e.ts.split('T')[0] : null)
    if (!d) return
    ;(doneByDate[d] = doneByDate[d] || []).push(e)
  })

  const now = new Date()
  const base = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1)
  const year = base.getFullYear(), month = base.getMonth()
  const monthName = base.toLocaleString('en-US', { month:'long' })
  const daysInMonth = new Date(year, month+1, 0).getDate()
  const firstDay = new Date(year, month, 1).getDay()

  const goMonth = (delta) => { setMonthOffset(o => o + delta); setSelected(null) }

  const resolveCat = (id) => {
    const found = (categories || []).find(c => c.id === id)
    return { color: found?.color || '#9CA3AF', icon: found?.icon || '', label: found?.label || id || 'Commitment' }
  }

  // Each commitment event now carries its own category's color + icon, so the
  // calendar matches the tag you picked on the Commitments tab (no longer a
  // single generic "commitment" style).
  const allEvents = (commitments || [])
    .filter(c => c.date)
    .map(c => {
      const cat = resolveCat(c.cat)
      const end = endTimeFrom(c.time, c.durationMins)
      const timeLabel = c.time ? `${fmt12(c.time)}${end ? '–'+fmt12(end) : ''} ` : ''
      return {
        id: c.id, raw: c,
        date: c.date,
        text: c.text,
        label: `${timeLabel}${c.text}`,
        done: c.done,
        description: c.description, subtasks: Array.isArray(c.subtasks) ? c.subtasks : [],
        color: cat.color, icon: cat.icon, catLabel: cat.label,
      }
    })
  const selectedEvents = selected ? allEvents.filter(e => e.date === selected) : []

  // Recurring instances landing on a date — the SAME computation Today and Week
  // use, so the month view shows the recurring schedule too. Everyday habits
  // (daily, or weekly-on-all-7-days) are left off the month view on purpose:
  // they'd land on every cell and bury the things you actually plan around.
  // They still show on Today and Week, where daily items belong.
  const calendarRecurring = (recurringTasks || []).filter(t => !recursDaily(t))
  const recurringEventsOn = (dateStr) => recurringOccurrencesForDate(calendarRecurring, dateStr, recurringExceptions).map(o => {
    const cat = resolveCat(o.cat)
    return {
      id: o.id, date: dateStr, isRecurring: true,
      text: o.text, label: o.label,
      done: !!(todos && todos[`${dateStr}_${o.id}`]),
      color: cat.color, icon: cat.icon, catLabel: cat.label,
    }
  })
  const selectedRecurring = selected ? recurringEventsOn(selected) : []

  // Multi-day events covering a given date (for the colored bands + detail).
  const eventsOn = (dateStr) => (events || []).filter(ev => dateStr >= ev.startDate && dateStr <= ev.endDate)
  const selectedSpans = selected ? eventsOn(selected) : []

  return (
    <div>
      <div className="page-title">Calendar</div>
      <div className="page-sub">Plan ahead — add anything to any day, with its own time, duration, and reminders.</div>

      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:10, marginBottom:14, flexWrap:'wrap' }}>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <button onClick={()=>goMonth(-1)} title="Previous month" style={calNavBtn}>‹</button>
          <div className="serif" style={{ fontSize:18, fontWeight:600, color:'var(--text)', minWidth:150, textAlign:'center' }}>{monthName} {year}</div>
          <button onClick={()=>goMonth(1)} title="Next month" style={calNavBtn}>›</button>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          {monthOffset !== 0 && (
            <button onClick={()=>{ setMonthOffset(0); setSelected(null) }}
              style={{ fontSize:11, padding:'7px 12px', borderRadius:9, border:'1px solid var(--teal)', background:'#F0FDFB', color:'var(--teal)', cursor:'pointer', fontFamily:'DM Sans,sans-serif', fontWeight:600 }}>
              This month
            </button>
          )}
          <button onClick={()=>setAdding(true)}
            style={{ fontSize:11, padding:'7px 14px', borderRadius:9, border:'none', background:'var(--forest)', color:'var(--green-light)', cursor:'pointer', fontFamily:'DM Sans,sans-serif', fontWeight:600 }}>
            + Add
          </button>
        </div>
      </div>

      <div className="cal-scroll">
        <div className="cal-grid">
          {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d => (
            <div key={d} className="cal-day-header">{d}</div>
          ))}
          {Array.from({ length: firstDay }).map((_, i) => <div key={'e'+i} />)}
          {Array.from({ length: daysInMonth }).map((_, i) => {
            const day = i + 1
            const dateStr = ds(year, month, day)
            const evs = [...allEvents.filter(e => e.date === dateStr), ...recurringEventsOn(dateStr)]
            const spans = eventsOn(dateStr)
            const dow = new Date(dateStr+'T12:00:00').getDay()
            const isSel = dateStr === selected
            const isTdy = dateStr === today
            // Busier days get a deeper pastel wash. Selected keeps its own bg.
            const shade = busyShade(evs.length)
            return (
              <div key={day}
                className={`cal-cell ${isSel ? 'selected' : ''} ${isTdy ? 'today-cell' : ''}`}
                style={!isSel && shade ? { background: shade } : undefined}
                onClick={() => setSelected(isSel ? null : dateStr)}>
                <div className="cal-day-num" style={{ color: isTdy ? 'var(--teal)' : undefined, fontWeight: isTdy ? 700 : undefined }}>{day}</div>
                {/* Multi-day event bands — label shows on the event's start day or a week's first column */}
                {spans.slice(0,2).map((ev, j) => {
                  const isStart = dateStr === ev.startDate
                  const isEnd = dateStr === ev.endDate
                  const showLabel = isStart || dow === 0
                  return (
                    <div key={'sp'+j} title={ev.label}
                      style={{ display:'flex', alignItems:'center', gap:2, height:13, marginTop:2, paddingLeft:3, overflow:'hidden',
                        background:`${ev.color}`, color:iconColorOn(ev.color),
                        borderTopLeftRadius:isStart?4:0, borderBottomLeftRadius:isStart?4:0,
                        borderTopRightRadius:isEnd?4:0, borderBottomRightRadius:isEnd?4:0,
                        marginLeft:isStart?0:-5, marginRight:isEnd?0:-5 }}>
                      {showLabel && ev.icon && <Icon value={ev.icon} size={9} />}
                      {showLabel && <span style={{ fontSize:8, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', fontWeight:600 }}>{ev.label}</span>}
                    </div>
                  )
                })}
                {spans.length > 2 && <div style={{ fontSize:8, color:'var(--muted)', marginTop:1 }}>+{spans.length-2} event(s)</div>}
                {evs.slice(0,2).map((e, j) => (
                  <div key={j} className="cal-evt">
                    <div className="cal-evt-dot" style={{ background: e.color, opacity: e.done ? .4 : 1 }} />
                    <div className="cal-evt-label" style={{ textDecoration: e.done ? 'line-through' : 'none', opacity: e.done ? .5 : 1 }}>{e.label}</div>
                  </div>
                ))}
                {evs.length > 2 && <div style={{ fontSize:8, color:'var(--muted)', marginTop:1 }}>+{evs.length-2}</div>}
                {(doneByDate[dateStr]?.length > 0) && (
                  <div style={{ fontSize:8, color:'#52B788', marginTop:1, fontWeight:700 }}>✓ {doneByDate[dateStr].length}</div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {selected && (
        <div style={{ marginTop:14, background:'white', borderRadius:14, border:'1px solid var(--border)', padding:'16px 20px' }}>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:10, marginBottom:10 }}>
            <div className="serif" style={{ fontSize:20, color:'var(--text)', fontWeight:600 }}>
              {new Date(selected+'T12:00:00').toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric'})}
            </div>
            <button onClick={()=>setAdding(true)}
              style={{ fontSize:11, padding:'6px 12px', borderRadius:9, border:'1px solid var(--teal)', background:'#F0FDFB', color:'var(--teal)', cursor:'pointer', fontFamily:'DM Sans,sans-serif', fontWeight:600, whiteSpace:'nowrap' }}>
              + Add to this day
            </button>
          </div>
          {selectedEvents.length === 0 && selectedSpans.length === 0 && selectedRecurring.length === 0 && !(doneByDate[selected]?.length > 0) && (
            <div style={{ fontSize:12, color:'var(--muted)', fontStyle:'italic', paddingBottom:2 }}>Nothing scheduled yet. Use “+ Add to this day.”</div>
          )}
          {/* Multi-day events covering this day */}
          {selectedSpans.map((ev, i) => (
            <div key={'sp'+i} style={{ display:'flex', gap:10, alignItems:'center', padding:'9px 12px', borderRadius:8, marginBottom:6, background:`${ev.color}18`, borderLeft:`4px solid ${ev.color}`, border:`1px solid ${ev.color}44` }}>
              {ev.icon && <Icon value={ev.icon} size={14} />}
              <div style={{ flex:1 }}>
                <div style={{ fontSize:13, color:'var(--text)', fontWeight:600 }}>{ev.label}</div>
                <div style={{ fontSize:10, color:ev.color, fontWeight:600, letterSpacing:.5 }}>
                  Event · {ev.allDay || !ev.startTime ? 'all day' : `${fmt12(ev.startTime)}${ev.endTime ? '–'+fmt12(ev.endTime) : ''}`}
                </div>
              </div>
            </div>
          ))}
          {selectedEvents.map((e, i) => (
            <div key={i} style={{ padding:'9px 12px', borderRadius:8, marginBottom:6, background:`${e.color}14`, border:`1px solid ${e.color}44`, opacity: e.done ? .6 : 1 }}>
              <div style={{ display:'flex', gap:10, alignItems:'center' }}>
                <span style={{ display:'inline-flex', alignItems:'center', gap:4, fontSize:10, letterSpacing:1, textTransform:'uppercase', color:e.color, minWidth:70, fontWeight:600 }}>
                  {e.icon && <Icon value={e.icon} size={12} />}{e.catLabel}
                </span>
                <div style={{ flex:1, fontSize:13, color:'var(--text)', textDecoration: e.done ? 'line-through' : 'none' }}>{e.label}</div>
                <button onClick={() => setEditing(e.raw)} title="Edit"
                  style={{ background:'none', border:'none', cursor:'pointer', color:'#9CA3AF', fontSize:13, padding:'0 2px', flexShrink:0 }}>✎</button>
              </div>
              {e.description && (
                <div style={{ fontSize:12, color:'var(--muted)', lineHeight:1.5, whiteSpace:'pre-wrap', marginTop:6, paddingLeft:2 }}>{e.description}</div>
              )}
              {e.subtasks.length > 0 && (
                <div style={{ marginTop:6, paddingLeft:2 }}>
                  {e.subtasks.map(s => (
                    <div key={s.id} onClick={() => toggleSubtask(e.raw, s.id)}
                      style={{ display:'flex', alignItems:'center', gap:8, marginBottom:4, cursor:'pointer' }}>
                      <div style={{ width:15, height:15, borderRadius:4, flexShrink:0, border: s.done ? 'none' : `2px solid ${e.color}`, background: s.done ? e.color : 'transparent', display:'flex', alignItems:'center', justifyContent:'center' }}>
                        {s.done && <span style={{ color:'white', fontSize:9, fontWeight:700 }}>✓</span>}
                      </div>
                      <span style={{ fontSize:12.5, color: s.done ? 'var(--muted)' : 'var(--text)', textDecoration: s.done ? 'line-through' : 'none' }}>{s.text}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
          {/* Recurring instances on this day — same items shown on Today/Week.
              The ✕ skips just this occurrence (synced to every view). */}
          {selectedRecurring.map((e, i) => (
            <div key={'rec'+i} style={{ display:'flex', gap:10, alignItems:'center', padding:'9px 12px', borderRadius:8, marginBottom:6, background:`${e.color}14`, border:`1px solid ${e.color}44`, opacity: e.done ? .6 : 1 }}>
              <span style={{ display:'inline-flex', alignItems:'center', gap:4, fontSize:10, letterSpacing:1, textTransform:'uppercase', color:e.color, minWidth:70, fontWeight:600 }}>
                {e.icon && <Icon value={e.icon} size={12} />}{e.catLabel}
              </span>
              <div style={{ flex:1, fontSize:13, color:'var(--text)', textDecoration: e.done ? 'line-through' : 'none' }}>{e.label}</div>
              <span style={{ fontSize:9, letterSpacing:.5, textTransform:'uppercase', color:'var(--muted)', flexShrink:0 }}>Repeats</span>
              <button onClick={() => { const t=(recurringTasks||[]).find(r=>r.id===e.id); if(t) setEditingRec(t) }} title="Edit"
                style={{ background:'none', border:'none', cursor:'pointer', color:'#9CA3AF', fontSize:13, padding:'0 2px', flexShrink:0 }}>✎</button>
              <button onClick={() => skipRecurringOccurrence && skipRecurringOccurrence(e.id, selected)} title="Skip just this day"
                style={{ background:'none', border:'none', cursor:'pointer', color:'#9CA3AF', fontSize:14, padding:'0 2px', flexShrink:0 }}>✕</button>
            </div>
          ))}
          {/* Completed that day — history that persists even after deletion */}
          {(doneByDate[selected] || []).map((e, i) => (
            <div key={'done'+i} style={{ display:'flex', gap:10, alignItems:'center', padding:'7px 12px' }}>
              <span style={{ color:'#52B788', fontSize:13, flexShrink:0 }}>✓</span>
              <div style={{ fontSize:12, color:'var(--muted)', textDecoration:'line-through' }}>{e.label}</div>
            </div>
          ))}
        </div>
      )}

      <div className="divider" />
      {/* Busyness legend */}
      <div style={{ display:'flex', alignItems:'center', gap:6, marginTop:18 }}>
        <span style={{ fontSize:11, color:'var(--muted)' }}>Quieter</span>
        <div style={{ width:16, height:16, borderRadius:4, background:'white', border:'1px solid var(--border)' }} />
        {BUSY_SHADES.map(c => <div key={c} style={{ width:16, height:16, borderRadius:4, background:c }} />)}
        <span style={{ fontSize:11, color:'var(--muted)' }}>Busier</span>
      </div>

      {adding && (
        <AddItemModal
          routines={routines}
          presetDate={selected || ''}
          categories={categories}
          labelModel={labelModel}
          onSave={handleAdd}
          onSaveRecurring={addRecurringTask}
          onClose={()=>setAdding(false)}
          title="Add to calendar" />
      )}
      {editing && (
        <AddItemModal
          existing={editing}
          categories={categories}
          routines={routines}
          onSave={handleEdit}
          onSaveRecurring={addRecurringTask}
          onDelete={c => deleteCommitment && deleteCommitment(c.id)}
          onDuplicate={c => addCommitment && addCommitment({ ...c, id:'c-'+Date.now(), text:(c.text||'')+' (copy)', done:false, createdAt:new Date().toISOString() })}
          onMoveToInbox={c => updateCommitment && updateCommitment(c.id, { date:null, time:null, durationMins:null })}
          onClose={()=>setEditing(null)}
          title="Edit event" />
      )}
      {editingRec && (
        <AddItemModal
          existingRecurring={editingRec}
          categories={categories}
          routines={routines}
          onSaveRecurring={t => { updateRecurringTask && updateRecurringTask(t.id, t); setEditingRec(null) }}
          onDelete={t => { deleteRecurringTask && deleteRecurringTask(t.id); setEditingRec(null) }}
          onClose={()=>setEditingRec(null)}
          title="Edit recurring task" />
      )}
    </div>
  )
}
