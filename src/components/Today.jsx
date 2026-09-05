import { useState, useEffect, useRef, useMemo, useLayoutEffect } from 'react'
import { recurringOccurrencesForDate, taskSegments, occKey, recurringActiveOn } from '../lib/occurrences.js'
import { findSlots } from '../lib/scheduler.js'
import { Icon } from './IconPicker.jsx'
import { iconColorOn, suggestGlyph } from '../lib/glyphs.jsx'
import { bloomBurst } from '../lib/bloom.js'
import AddItemModal from './AddItemModal.jsx'
import AiAssistant from './AiAssistant.jsx'
import DayRail from './DayRail.jsx'
import { aiScheduleAvailable } from '../lib/parseEvent.js'
import FocusMode from './FocusMode.jsx'
import DateField from './DateField.jsx'
import TimeField from './TimeField.jsx'
import { setItemReminders } from '../lib/notifications.js'
import CalendarLegend from './CalendarLegend.jsx'
import ImportedCalendarCard from './ImportedCalendarCard.jsx'
import { importedOn, buildImportedRows, importedKey } from '../lib/importedTasks.js'

// Concentric-circle "focus" target, for the Focus Now button.
function TargetIcon({ size = 13 }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <circle cx="12" cy="12" r="8.5" /><circle cx="12" cy="12" r="4.5" /><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" />
    </svg>
  )
}

const TAG_COLORS = {
  health:'#E07B2E', class:'#7C3AED', lab:'#059669', career:'#D97706',
  fitness:'#3B82F6', personal:'#A855F7', sleep:'#52B788', urgent:'#EF4444',
  carried:'#F59E0B', polish:'#EC4899', meeting:'#3B82F6', deadline:'#EF4444',
}
const TAGS = ['class','lab','career','health','fitness','personal','urgent','sleep','polish']
const INFLEXIBLE_TAGS = new Set(['class','meeting','deadline','urgent'])
const END_OF_DAY_MINS = 22*60+30 // 10:30 PM
// Breathing room left on each side of a task created by filling a free-time gap
// — a cushion to transition out of the previous thing and into the next.
const TRANSITION_MIN = 15

function todayKey() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}
function todayLabel() {
  return new Date().toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric'})
}
function nowMins() { const d=new Date(); return d.getHours()*60+d.getMinutes() }
function parseTimeMins(label) {
  const m = label.match(/~?(\d{1,2}):(\d{2})\s*(AM|PM)/i)
  if (!m) return null
  let h=parseInt(m[1]); const min=parseInt(m[2]); const ap=m[3].toUpperCase()
  if (ap==='PM'&&h!==12) h+=12; if (ap==='AM'&&h===12) h=0
  return h*60+min
}
function fmt12(t) {
  if (!t) return ''; const [h,m]=t.split(':').map(Number)
  return `${h%12||12}:${String(m).padStart(2,'0')} ${h>=12?'PM':'AM'}`
}
function fmtMins(m) {
  if (m<60) return `${m}m`
  return `${Math.floor(m/60)}h ${m%60>0?m%60+'m':''}`
}
// "a" vs "an" for a spoken duration — the leading number decides it (8, 11 and
// 18 start with a vowel sound: "an 8m break", "an 18m break"). Durations here
// top out well under 80, so those three cases cover it.
function artForMins(m) {
  const lead = m >= 60 ? Math.floor(m/60) : m
  return (lead === 8 || lead === 11 || lead === 18) ? 'an' : 'a'
}
function fmtTimeLabel(mins) {
  const h=Math.floor(mins/60), m=mins%60
  return `${h%12||12}:${String(m).padStart(2,'0')} ${h>=12?'PM':'AM'}`
}
// Structured-style range: drop the meridiem on the start when it matches the end
// ("7:50 – 8:11 AM"), keep both when they differ ("11:50 AM – 12:10 PM").
function clockNoMer(mins) { const h=Math.floor(mins/60)%24, m=mins%60; return `${h%12||12}:${String(m).padStart(2,'0')}` }
function merOf(mins) { return (Math.floor(mins/60)%24) >= 12 ? 'PM' : 'AM' }
function rangeLabel(s, e) {
  return merOf(s) === merOf(e)
    ? `${clockNoMer(s)} – ${clockNoMer(e)} ${merOf(e)}`
    : `${clockNoMer(s)} ${merOf(s)} – ${clockNoMer(e)} ${merOf(e)}`
}
function durParen(mins) {
  if (mins < 60) return `(${mins} min)`
  const h=Math.floor(mins/60), m=mins%60
  return m === 0 ? `(${h} hr)` : `(${h}h ${m}m)`
}
function extractLocation(label, note='') {
  const combined=`${label} ${note}`
  const m=combined.match(/(Youngchild\s*\d*|Steitz\s*\d*|Briggs\s*\d*|Commons|B3\s*\w*)/i)
  return m?m[0].trim():null
}
// Replace time portion in a label string with new formatted time
function minsToHHMM(m) {
  const mm = Math.max(0, Math.min(23*60+59, Math.round(m)))
  return `${String(Math.floor(mm/60)).padStart(2,'0')}:${String(mm%60).padStart(2,'0')}`
}
function shiftLabelTime(label, newMins) {
  const newTime = fmtTimeLabel(newMins)
  // Replace leading time pattern like "9:50 AM — " or "~9:50 AM — "
  return label.replace(/~?\d{1,2}:\d{2}\s*(?:AM|PM)\s*(?:—\s*)?/i, newTime + ' — ')
}

// ── Manage modal with smart scheduling ────────────────────────
function ManageModal({ task, dateKey, onClose, onDelete, onReschedule, onUnschedule, onDeleteSeries, onDeleteFuture, scheduled }) {
  const [view,setView]     = useState('main')
  const [reason,setReason] = useState('')
  const isRec = !!task.isRecurring
  const [date,setDate]     = useState(dateKey)
  const [time,setTime]     = useState('')
  const [slots,setSlots]   = useState([])
  const s = { width:'100%',fontSize:13,padding:'8px 10px',borderRadius:9,border:'1px solid var(--border)',fontFamily:'DM Sans,sans-serif',outline:'none',boxSizing:'border-box' }

  const searchSlots = (d) => {
    if (!d) { setSlots([]); return }
    const results = findSlots(60, scheduled||[], d, 30)
    setSlots(results.filter(r => r.date === d))
  }

  // Search immediately when switching to reschedule view
  const handleViewReschedule = () => {
    setView('reschedule')
    searchSlots(date)
  }

  const handleDateChange = (d) => {
    setDate(d)
    setTime('')
    searchSlots(d)
  }

  return (
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,.5)',zIndex:600,display:'flex',alignItems:'center',justifyContent:'center',padding:16}}>
      <div style={{background:'white',borderRadius:16,padding:22,maxWidth:380,width:'100%',boxShadow:'0 24px 64px rgba(0,0,0,.3)',maxHeight:'90vh',overflowY:'auto'}}>
        {view==='main'&&<>
          <div className="serif" style={{fontSize:17,fontWeight:600,color:'var(--text)',marginBottom:8}}>Manage</div>
          <div style={{fontSize:13,color:'var(--muted)',marginBottom:16,padding:'9px 12px',background:'#F7F6F3',borderRadius:9,lineHeight:1.5}}>{task.label||task.text}</div>
          <div style={{display:'flex',flexDirection:'column',gap:8}}>
            <button onClick={handleViewReschedule} style={{padding:'10px',borderRadius:10,border:'1px solid var(--border)',background:'white',cursor:'pointer',textAlign:'left',fontSize:13,color:'var(--text)',fontFamily:'DM Sans,sans-serif'}}>📅 Reschedule</button>
            {task.isCommitment && onUnschedule && (
              <button onClick={()=>{onUnschedule(task);onClose()}} style={{padding:'10px',borderRadius:10,border:'1px solid var(--border)',background:'white',cursor:'pointer',textAlign:'left',fontSize:13,color:'var(--text)',fontFamily:'DM Sans,sans-serif'}}>🗓️ Unschedule · back to Commitments</button>
            )}
            <button onClick={()=>setView('delete')} style={{padding:'10px',borderRadius:10,border:'1px solid #FECACA',background:'#FFF5F5',cursor:'pointer',textAlign:'left',fontSize:13,color:'#991B1B',fontFamily:'DM Sans,sans-serif'}}>{isRec ? '🗓️ Delete just this day' : '🗑️ Delete & log why'}</button>
            {isRec && onDeleteFuture && (
              <button onClick={()=>{onDeleteFuture(task);onClose()}} style={{padding:'10px',borderRadius:10,border:'1px solid #FECACA',background:'#FFF5F5',cursor:'pointer',textAlign:'left',fontSize:13,color:'#991B1B',fontFamily:'DM Sans,sans-serif'}}>⏭️ Delete this &amp; all future</button>
            )}
            {isRec && onDeleteSeries && (
              <button onClick={()=>{onDeleteSeries(task);onClose()}} style={{padding:'10px',borderRadius:10,border:'1px solid #FECACA',background:'#FFF5F5',cursor:'pointer',textAlign:'left',fontSize:13,color:'#991B1B',fontFamily:'DM Sans,sans-serif'}}>🔁 Delete every occurrence (all time)</button>
            )}
          </div>
          <button onClick={onClose} style={{marginTop:10,width:'100%',padding:'8px',borderRadius:10,border:'1px solid var(--border)',background:'white',color:'var(--muted)',cursor:'pointer',fontSize:12,fontFamily:'DM Sans,sans-serif'}}>Cancel</button>
        </>}
        {view==='delete'&&<>
          <div className="serif" style={{fontSize:17,fontWeight:600,color:'#991B1B',marginBottom:6}}>{isRec ? 'Delete this day' : 'Delete Task'}</div>
          {isRec && <div style={{fontSize:12,color:'var(--muted)',marginBottom:10,lineHeight:1.5}}>Removes just this one occurrence — the recurring task keeps its other days. Use “Delete this &amp; all future” or “Delete every occurrence” to remove more.</div>}
          <textarea value={reason} onChange={e=>setReason(e.target.value)} placeholder="Reason (optional)…" rows={3} style={{...s,marginBottom:12,resize:'none',lineHeight:1.5}}/>
          <div style={{display:'flex',gap:8}}>
            <button onClick={()=>{onDelete(task,reason);onClose()}} style={{flex:1,padding:'10px',borderRadius:10,border:'none',background:'#EF4444',color:'white',cursor:'pointer',fontFamily:'DM Sans,sans-serif',fontWeight:600,fontSize:13}}>{isRec ? 'Delete this day' : 'Delete'}{reason?' & Log':''}</button>
            <button onClick={()=>setView('main')} style={{padding:'10px 14px',borderRadius:10,border:'1px solid var(--border)',background:'white',color:'var(--muted)',cursor:'pointer',fontSize:12,fontFamily:'DM Sans,sans-serif'}}>Back</button>
          </div>
        </>}
        {view==='reschedule'&&<>
          <div className="serif" style={{fontSize:17,fontWeight:600,color:'var(--text)',marginBottom:12}}>Reschedule</div>
          <div style={{display:'flex',gap:8,marginBottom:10}}>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontSize:10,color:'var(--muted)',letterSpacing:1,textTransform:'uppercase',marginBottom:4}}>Date</div>
              <DateField value={date} onChange={handleDateChange} style={{...s}}/>
            </div>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontSize:10,color:'var(--muted)',letterSpacing:1,textTransform:'uppercase',marginBottom:4}}>Time</div>
              <TimeField value={time} onChange={setTime} style={{...s}}/>
            </div>
          </div>

          {/* Smart slot suggestions */}
          {slots.length>0&&(
            <div style={{marginBottom:12}}>
              <div style={{fontSize:10,color:'var(--muted)',letterSpacing:1,textTransform:'uppercase',marginBottom:6}}>🧠 Best open windows</div>
              {slots.slice(0,3).map((slot,i)=>(
                <button key={i} onClick={()=>setTime(slot.startTime)}
                  style={{display:'block',width:'100%',textAlign:'left',padding:'8px 12px',borderRadius:9,border:`1.5px solid ${time===slot.startTime?'var(--teal)':'var(--border)'}`,background:time===slot.startTime?'#F0FDFB':'white',marginBottom:5,cursor:'pointer',fontFamily:'DM Sans,sans-serif'}}>
                  <span style={{fontSize:13,color:'var(--text)',fontWeight:500}}>{slot.startDisplay} – {slot.endDisplay}</span>
                  <span style={{fontSize:11,color:'var(--muted)',marginLeft:8}}>{slot.context}</span>
                </button>
              ))}
            </div>
          )}

          <div style={{display:'flex',gap:8}}>
            <button onClick={()=>{onReschedule(task,date,time);onClose()}} style={{flex:1,padding:'10px',borderRadius:10,border:'none',background:'var(--forest)',color:'var(--green-light)',cursor:'pointer',fontFamily:'DM Sans,sans-serif',fontWeight:600,fontSize:13}}>Reschedule</button>
            <button onClick={()=>setView('main')} style={{padding:'10px 14px',borderRadius:10,border:'1px solid var(--border)',background:'white',color:'var(--muted)',cursor:'pointer',fontSize:12,fontFamily:'DM Sans,sans-serif'}}>Back</button>
          </div>
        </>}
      </div>
    </div>
  )
}

// ── Shift result toast ─────────────────────────────────────────
function ShiftToast({ result, onClose }) {
  useEffect(()=>{ const t=setTimeout(onClose,6000); return ()=>clearTimeout(t) },[])
  return (
    <div style={{position:'fixed',bottom:100,left:'50%',transform:'translateX(-50%)',background:'var(--forest)',color:'var(--green-light)',borderRadius:12,padding:'12px 18px',maxWidth:340,width:'90%',zIndex:200,boxShadow:'0 8px 32px rgba(0,0,0,.3)',fontSize:12,lineHeight:1.6}}>
      <div style={{fontWeight:700,marginBottom:4}}>⏱ Schedule shifted</div>
      {result.shifted>0&&<div>✓ {result.shifted} task{result.shifted>1?'s':''} moved forward</div>}
      {result.committed>0&&<div>📋 {result.committed} task{result.committed>1?'s':''} sent to Commitments (overflowed day)</div>}
      {result.fixed>0&&<div>📌 {result.fixed} fixed task{result.fixed>1?'s':''} (class/meeting) left in place</div>}
      <button onClick={onClose} style={{marginTop:8,fontSize:11,padding:'3px 10px',borderRadius:6,border:'1px solid rgba(255,255,255,.2)',background:'transparent',color:'var(--green-light)',cursor:'pointer',fontFamily:'DM Sans,sans-serif'}}>Dismiss</button>
    </div>
  )
}

// ── "Start now" push chooser ───────────────────────────────────
// Lets you pick which later tasks get pushed down to make room. Tasks are
// grouped by their routine, so you can shift just "the rest of this routine"
// with one tap, or reach across the day and pick specific ones.
function ShiftChooser({ plan, routines = [], onApply, onCancel }) {
  const [sel, setSel] = useState(() => new Set(plan.selected))
  const ids = plan.rest.map(t => t.id)
  const allOn = ids.length > 0 && ids.every(id => sel.has(id))
  const toggle = (id) => setSel(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
  const setMany = (groupIds, on) => setSel(s => { const n = new Set(s); groupIds.forEach(id => on ? n.add(id) : n.delete(id)); return n })
  const pivotTitle = plan.pivot.title || stripTimePrefix(plan.pivot.label)
  // Two modes share this chooser: 'delta' (you changed a task's time — slide the
  // rest along by the same amount) and the default Start-now packing.
  const isDelta = plan.mode === 'delta'
  const deltaMins = Math.abs(plan.delta || 0)
  const deltaLabel = deltaMins >= 60
    ? `${Math.floor(deltaMins/60)}h${deltaMins%60 ? ' '+(deltaMins%60)+'m' : ''}`
    : `${deltaMins}m`
  const dir = (plan.delta || 0) >= 0 ? 'later' : 'earlier'
  const heading  = isDelta ? `Reschedule the rest?` : `Start “${pivotTitle}” now`
  const subhead  = isDelta
    ? `You moved “${pivotTitle}” ${deltaLabel} ${dir}. Shift the checked tasks along by the same ${deltaLabel} — unchecked tasks stay put. A re-timed routine step re-ticks itself once its new time passes.`
    : `Choose which later tasks to shift along. Unchecked tasks stay put. A re-timed routine step just re-ticks itself once its new time passes.`
  const applyLabel = isDelta
    ? (sel.size ? `Reschedule ${sel.size}` : `Reschedule none`)
    : (sel.size ? `Start now · shift ${sel.size}` : `Start now · shift none`)

  // Bucket the tasks by routine, preserving each group's earliest time so the
  // groups read top-to-bottom in day order. Tasks with no routine fall into a
  // trailing "Other" group.
  const rMap = new Map(routines.map(r => [r.id, r]))
  const groups = []
  const byKey = new Map()
  for (const t of plan.rest) {
    const key = (t.routine && rMap.has(t.routine)) ? t.routine : '__none'
    let g = byKey.get(key)
    if (!g) { g = { key, routine: rMap.get(key) || null, tasks: [] }; byKey.set(key, g); groups.push(g) }
    g.tasks.push(t)
  }

  return (
    <div onClick={onCancel} style={{position:'fixed',inset:0,background:'rgba(0,0,0,.5)',zIndex:610,display:'flex',alignItems:'center',justifyContent:'center',padding:16}}>
      <div onClick={e=>e.stopPropagation()} style={{background:'white',borderRadius:18,width:'100%',maxWidth:400,maxHeight:'86vh',overflowY:'auto',boxShadow:'0 24px 64px rgba(0,0,0,.3)',padding:20}}>
        <div className="serif" style={{fontSize:18,fontWeight:600,color:'var(--text)',marginBottom:3}}>{heading}</div>
        <div style={{fontSize:12.5,color:'var(--muted)',marginBottom:14}}>{subhead}</div>
        <button onClick={()=>setSel(allOn ? new Set() : new Set(ids))}
          style={{fontSize:11,padding:'5px 12px',borderRadius:16,border:'1px solid var(--border)',background:'white',color:'var(--teal)',fontWeight:600,cursor:'pointer',fontFamily:'DM Sans,sans-serif',marginBottom:12}}>
          {allOn ? 'Deselect all' : 'Select all'}
        </button>
        <div style={{display:'flex',flexDirection:'column',gap:14,marginBottom:16}}>
          {groups.map(g=>{
            const gids = g.tasks.map(t=>t.id)
            const gAllOn = gids.every(id=>sel.has(id))
            const tint = g.routine?.tint || 'var(--muted)'
            return (
              <div key={g.key}>
                <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:4,paddingBottom:4,borderBottom:'1px solid #F1EDF2'}}>
                  <span style={{width:9,height:9,borderRadius:'50%',background:tint,flexShrink:0}} />
                  <span style={{flex:1,minWidth:0,fontSize:11,fontWeight:700,letterSpacing:.6,textTransform:'uppercase',color:'var(--muted)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{g.routine ? g.routine.name : 'Other tasks'}</span>
                  <button onClick={()=>setMany(gids, !gAllOn)}
                    style={{fontSize:10.5,fontWeight:700,letterSpacing:.3,border:'none',background:'none',cursor:'pointer',color:'var(--teal)',padding:0,whiteSpace:'nowrap'}}>
                    {gAllOn ? 'Clear' : 'Select all'}
                  </button>
                </div>
                {g.tasks.map(t=>{
                  const on = sel.has(t.id)
                  const isDone = plan.doneIds?.has(t.id)
                  const title = t.title || stripTimePrefix(t.label)
                  return (
                    <div key={t.id} onClick={()=>toggle(t.id)}
                      style={{display:'flex',alignItems:'center',gap:11,padding:'8px 4px',cursor:'pointer'}}>
                      <div style={{width:20,height:20,borderRadius:6,flexShrink:0,border:on?'none':'2px solid #CDD3DA',background:on?'var(--teal)':'transparent',display:'flex',alignItems:'center',justifyContent:'center'}}>
                        {on && <span style={{color:'white',fontSize:12,fontWeight:700}}>✓</span>}
                      </div>
                      <span style={{fontSize:12,color:'var(--muted)',minWidth:64,fontVariantNumeric:'tabular-nums'}}>{fmtTimeLabel(t._mins)}</span>
                      <span style={{flex:1,minWidth:0,fontSize:14,color:'var(--text)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{title}</span>
                      {isDone && <span style={{fontSize:10,color:'var(--muted)',letterSpacing:.5,textTransform:'uppercase',fontWeight:600,flexShrink:0}}>done</span>}
                    </div>
                  )
                })}
              </div>
            )
          })}
        </div>
        <div style={{display:'flex',gap:8}}>
          <button onClick={()=>onApply([...sel])}
            style={{flex:1,padding:'12px',borderRadius:12,border:'none',background:'var(--forest)',color:'var(--green-light)',fontWeight:700,fontSize:14,cursor:'pointer',fontFamily:'DM Sans,sans-serif'}}>
            {applyLabel}
          </button>
          <button onClick={onCancel}
            style={{padding:'12px 16px',borderRadius:12,border:'1px solid var(--border)',background:'white',color:'var(--muted)',cursor:'pointer',fontSize:13,fontFamily:'DM Sans,sans-serif'}}>Cancel</button>
        </div>
      </div>
    </div>
  )
}

// ── Timeline task block ────────────────────────────────────────
// Strip a leading "9:30 AM — " time prefix so the title reads cleanly (the
// time is shown separately on a timeline).
function stripTimePrefix(label) {
  return (label || '').replace(/^~?\d{1,2}:\d{2}\s*(AM|PM)?\s*[—–-]\s*/i, '')
}
// Did editing this one occurrence change nothing but its start time? If so we can
// move just this day WITHOUT detaching it from its series (which would turn it
// into a one-off and lose its delete-this/future/all menu). Any real content
// change — title, notes, duration, labels, color/icon, subtasks, block,
// location, or a per-day custom reminder — still needs a detached copy, so this
// stays conservative: it only returns true when every content field matches the
// template, and treats an auto-suggested icon (derived from the title) as "no
// change" so an icon-less routine step isn't detached for no reason.
function occurrenceOnlyMovedTime(tmpl, occ, reminderMins) {
  if (reminderMins != null) return false                 // a per-day alert needs a real item id
  // Time blocks don't read the day-local time override (they're rendered from a
  // separate list), and an "end time" change wouldn't fit a start-only override
  // anyway — so a single-day block edit must detach, never day-move.
  if (occ.block || tmpl.block) return false
  const baseTitle = stripTimePrefix(tmpl.label ?? tmpl.text ?? '')
  const baseIcon  = tmpl.icon || suggestGlyph(baseTitle) || ''
  const sameCats  = JSON.stringify(occ.cats || []) === JSON.stringify(tmpl.cat ? [tmpl.cat] : [])
  const locOf = (l) => (l && typeof l.lat === 'number') ? { lat:+l.lat.toFixed(6), lng:+l.lng.toFixed(6), name:(l.name||'') } : null
  const sameLoc = JSON.stringify(locOf(occ.location)) === JSON.stringify(locOf(tmpl.location))
  return (
    (occ.text || '') === baseTitle &&
    (occ.description || '') === (tmpl.note || '') &&
    (occ.durationMins || null) === (tmpl.durationMins || null) &&
    (occ.color || '') === (tmpl.color || '') &&
    (occ.icon || '') === baseIcon &&
    !!occ.block === !!tmpl.block &&
    (occ.subtasks?.length || 0) === 0 &&
    sameCats && sameLoc
  )
}
function hhmmToMins(t) {
  if (!t) return null
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}

// Vertical pixels per minute — shared by task blocks, gaps and time-block
// bands so the whole day reads at one consistent scale (a 2-hour task is
// twice a 1-hour task). Steep enough that a 30-min task is visibly shorter
// than a 1-hour one.
const PX_PER_MIN = 2.4

// Height in px for a span of `mins`, on one shared scale so tasks, gaps and
// block bands are all proportional to real clock time. Fully proportional for
// the first two hours; beyond that a long empty stretch keeps growing but at a
// gentler rate, so a 9-hour evening of free time still reads as "a lot" without
// pushing everything else off the screen. Used everywhere a duration becomes a
// height, so the day reads at relative scale.
const FULL_SCALE_MIN = 120
function spanHeight(mins) {
  const m = Math.max(0, mins || 0)
  if (m <= FULL_SCALE_MIN) return m * PX_PER_MIN
  return FULL_SCALE_MIN * PX_PER_MIN + (m - FULL_SCALE_MIN) * 0.55
}

// Time-block films cover large stretches of the day, so they sit much fainter
// than a routine's small film — a soft tint you can read tasks over, not a
// saturated slab. (Routine films stay at 0.5.)
const BLOCK_FILM_OPACITY = 0.16

// A "free time" gap between two timed tasks, with a quick Add Task. Its height
// grows with the length of the gap, so the day reads at relative scale.

// The little round icon that marks a time block. Tapping it edits the block.
function BandIcon({ icon, color, onEdit }) {
  return (
    <button type="button" onClick={e=>{ e.stopPropagation(); onEdit && onEdit() }} title="Edit time block" aria-label="Edit time block"
      style={{ width:30, height:30, flexShrink:0, borderRadius:'50%', border:'none', background:'rgba(255,255,255,.72)', cursor:onEdit?'pointer':'default', padding:0, display:'flex', alignItems:'center', justifyContent:'center' }}>
      <Icon value={icon || 'glyph:clock'} size={16} color={color} />
    </button>
  )
}
// The collapse/expand chevron on the right edge of a block.
function BandChevron({ collapsed, onClick }) {
  const title = collapsed ? 'Expand time block' : 'Collapse time block'
  return (
    <button type="button" onClick={e=>{ e.stopPropagation(); onClick && onClick() }} title={title} aria-label={title}
      style={{ width:30, height:30, flexShrink:0, borderRadius:'50%', border:'none', background:'rgba(255,255,255,.72)', cursor:'pointer', padding:0, display:'flex', alignItems:'center', justifyContent:'center' }}>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#39434F" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"
        style={{ transform: collapsed?'none':'rotate(180deg)' }}><path d="M6 9l6 6 6-6"/></svg>
    </button>
  )
}
// A time block reads as a light "folder" for a slice of the day. Tapping the
// body opens the add sheet (a task scheduled inside the block); the icon edits
// the block; the chevron on the right collapses/expands it. No checkbox — the
// tasks inside auto-complete on their own.
function BlockBand({ seg, onEdit, onAdd, onCollapse }) {
  const label = (seg.label || 'Block').toUpperCase()
  // Collapsed: one compact row standing in for the whole block + its tasks.
  if (seg.collapsed) {
    const done = !!seg.done
    return (
      <div style={{ position:'relative', minHeight:54, margin:'4px 0', opacity: done?.7:1 }}>
        <div style={{ position:'absolute', top:0, bottom:0, left:44, right:0, background:seg.color, opacity: done?BLOCK_FILM_OPACITY*0.6:BLOCK_FILM_OPACITY, zIndex:-1, borderRadius:16 }} />
        <div style={{ position:'absolute', top:0, bottom:0, left:76.5, width:3, borderRadius:3, background:seg.color, opacity:.5, zIndex:-1 }} />
        <div style={{ position:'relative', display:'flex', alignItems:'center', minHeight:54 }}>
          {/* Spine spacer — the block's start time isn't repeated here; its full
              window already reads inline on the band. */}
          <div style={{ width:52, flexShrink:0 }} />
          <div onClick={onCollapse} title="Expand time block"
            style={{ flex:1, minWidth:0, paddingLeft:11, paddingRight:8, display:'flex', alignItems:'center', gap:9, cursor:'pointer', minHeight:54 }}>
            <BandIcon icon={seg.icon} color={seg.color} onEdit={onEdit} />
            <span style={{ fontSize:12, fontWeight:800, letterSpacing:.7, textTransform:'uppercase', color:'#39434F', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', maxWidth:'40%', textDecoration: done?'line-through':'none' }}>{label}</span>
            {done && <span style={{ flexShrink:0, display:'inline-flex', color:'#5C8A5C' }}><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5"/></svg></span>}
            <span style={{ fontSize:11, color:'var(--muted)', flexShrink:1, minWidth:0, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{done?'done · ':''}{rangeLabel(seg.start, seg.end)}{seg.count>0?` · ${seg.count} inside`:''}</span>
            <span style={{ marginLeft:'auto', flexShrink:0 }}><BandChevron collapsed onClick={onCollapse} /></span>
          </div>
        </div>
      </div>
    )
  }
  const dur = Math.max(0, seg.end - seg.start)
  const h = Math.max(30, Math.round(spanHeight(dur)))
  const tall = h >= 96
  return (
    <div onClick={onAdd} title="Add a task in this block"
      style={{ position:'relative', minHeight:h, cursor:'pointer' }}>
      <div style={{ position:'absolute', top: seg.roundTop?6:0, bottom: seg.roundBottom?6:0, left:44, right:0, background:seg.color, opacity:BLOCK_FILM_OPACITY, zIndex:-1,
        borderTopLeftRadius:seg.roundTop?16:0, borderTopRightRadius:seg.roundTop?16:0, borderBottomLeftRadius:seg.roundBottom?16:0, borderBottomRightRadius:seg.roundBottom?16:0 }} />
      {/* The timeline spine continues straight through the block as one solid
          line (the icon sits on it like a node), so the day reads unbroken —
          solid, not dashed, because a block is a real container, not empty gap. */}
      <div style={{ position:'absolute', top:0, bottom:0, left:76.5, width:3, borderRadius:3, background:seg.color, opacity:.5, zIndex:-1 }} />
      <div style={{ position:'relative', display:'flex' }}>
        {/* Spine spacer — the block's window already reads inline on the band
            (its range beside the label), so a gutter time here would be redundant. */}
        <div style={{ width:52, flexShrink:0 }} />
        {seg.label && (
          <div style={{ paddingTop:9, paddingLeft:11, flex:1, minWidth:0, display:'flex', alignItems:'center', gap:8 }}>
            <BandIcon icon={seg.icon} color={seg.color} onEdit={onEdit} />
            <span style={{ fontSize:10, fontWeight:800, letterSpacing:.9, textTransform:'uppercase', color:'#39434F', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', flexShrink:0 }}>{label}</span>
            {/* The block's full window, so you can read its end time without
                collapsing it. */}
            {seg.blockStart!=null && seg.blockEnd!=null && (
              <span style={{ fontSize:11, color:'var(--muted)', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', minWidth:0 }}>{rangeLabel(seg.blockStart, seg.blockEnd)}</span>
            )}
            {onCollapse && <span style={{ marginLeft:'auto', flexShrink:0 }}><BandChevron collapsed={false} onClick={onCollapse} /></span>}
          </div>
        )}
      </div>
      {/* Centered "add" hint so a big empty block invites tapping to fill it. */}
      {tall && (
        <div style={{ position:'absolute', left:52, right:12, top:'50%', transform:'translateY(-50%)', textAlign:'center', pointerEvents:'none' }}>
          <span style={{ fontSize:11, color:'#7A8794', fontWeight:600, background:'rgba(255,255,255,.5)', padding:'3px 10px', borderRadius:12 }}>+ Add a task in {seg.label || 'this block'}</span>
        </div>
      )}
    </div>
  )
}

// A break between two tasks, aware of where "now" sits in it:
//  • future — hasn't started: offers the full break ("Take a X break" / "Do
//    something during this X break?").
//  • active — now is inside it: the time counts down to what's LEFT.
//  • past   — now is beyond it (or a past day): it becomes "Took a/an X break",
//    muted, no Add Task (the moment has gone by with nothing scheduled).
function GapRow({ mins, phase = 'future', remaining = mins, prevColor, nextColor, routineTint, routineOpacity = 0.5, onAdd, onStartNow = null, startLabel = '' }) {
  // Proportional to real clock time, on the same scale as tasks and bands.
  const h = Math.max(18, Math.round(spanHeight(mins)))
  const top = prevColor || '#C9C9D3'
  const bot = nextColor || top
  // The connector reads as a bridge between the two tasks: its dashes blend
  // from the finished task's color at the top into the upcoming task's color
  // at the bottom. A vertical color gradient paints the ink; a repeating mask
  // cuts it into dashes (‑webkit‑ prefix for iOS Safari / the PWA).
  const dashMask = 'repeating-linear-gradient(black 0 5px, transparent 5px 11px)'
  const isPast   = phase === 'past'
  const isActive = phase === 'active'
  // While the break is running, the shown length is the time still LEFT (so it
  // ticks down); otherwise it's the whole break.
  const shownMins = isActive ? Math.max(1, remaining) : mins
  const durLabel = fmtMins(shownMins).trim()
  // A short gap (≤ 10 min) reads as a rest — "take a X min break", minimal, no
  // pressure to fill it. Anything longer offers to put the time to use with a
  // "do something during this X break?" prompt + Add Task. A past break shows
  // as a single quiet line regardless of length.
  const isBreak = mins <= 10
  const compact = isPast || isBreak
  // While a break is actually running, offer to pull the upcoming task forward
  // and start it now instead of waiting out the rest of the gap.
  const showStart = isActive && !!onStartNow
  const startBtn = (label) => (
    <button onClick={onStartNow}
      title={startLabel ? `Start “${startLabel}” now` : 'Start the next task now'}
      style={{ display:'inline-flex', alignItems:'center', gap:5, minWidth:0, maxWidth:'100%', fontSize:12, padding:'6px 14px', borderRadius:18, border:'none', background:'var(--teal)', color:'var(--on-accent, #fff)', fontWeight:700, cursor:'pointer', fontFamily:'DM Sans,sans-serif' }}>
      <span style={{ display:'flex', flexShrink:0 }}><Icon value="glyph:play" size={12} color="var(--on-accent, #fff)" /></span>
      <span style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{label}</span>
    </button>
  )
  return (
    <div className="today-gap" style={{ position:'relative', zIndex:0, display:'flex', gap:0, alignItems: compact?'center':'flex-start', opacity: isPast?0.6:1 }}>
      {/* Continue a routine's film through the gap between two same-routine
          tasks, square-edged so it butts flush against the pills above/below. */}
      {routineTint && (
        <div style={{ position:'absolute', top:0, bottom:0, left:44, right:0, background:routineTint, opacity:routineOpacity, zIndex:-1 }} />
      )}
      <div style={{ width:52, flexShrink:0 }} />
      <div style={{ width:52, flexShrink:0, display:'flex', justifyContent:'center' }}>
        <div style={{ width:3, minHeight:h, borderRadius:3, background:`linear-gradient(to bottom, ${top}, ${bot})`, WebkitMask:dashMask, mask:dashMask }} />
      </div>
      {isPast ? (
        <div style={{ flex:1, minWidth:0, paddingLeft:10, display:'flex', alignItems:'center', gap:7 }}>
          <span style={{ display:'flex', flexShrink:0 }}><Icon value="glyph:clock" size={15} color="#9AA6B2" /></span>
          <span style={{ fontSize:12.5, color:'var(--muted)', whiteSpace:'nowrap' }}>Took {artForMins(mins)} <b>{durLabel}</b> break</span>
        </div>
      ) : compact ? (
        <div style={{ flex:1, minWidth:0, paddingLeft:10, display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
          <span style={{ display:'flex', alignItems:'center', gap:7 }}>
            <span style={{ display:'flex', flexShrink:0 }}><Icon value="glyph:clock" size={15} color="#9AA6B2" /></span>
            <span style={{ fontSize:12.5, color:'var(--muted)', whiteSpace:'nowrap' }}>
              {isActive
                ? <><b style={{ color:'var(--teal)' }}>{durLabel}</b> left in your break</>
                : <>Take {artForMins(mins)} <b style={{ color:'var(--teal)' }}>{durLabel}</b> break</>}
            </span>
          </span>
          {showStart && startBtn('Start now')}
        </div>
      ) : (
        <div style={{ flex:1, minWidth:0, paddingLeft:8, paddingTop:4 }}>
          <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:9 }}>
            <span style={{ display:'flex', flexShrink:0 }}><Icon value="glyph:clock" size={16} color="#9AA6B2" /></span>
            <span style={{ fontSize:13, color:'var(--muted)' }}>
              {isActive
                ? <><b style={{ color:'var(--teal)' }}>{durLabel}</b> left — start early or fill it?</>
                : <>Do something during this <b style={{ color:'var(--teal)' }}>{durLabel}</b> break?</>}
            </span>
          </div>
          <div style={{ display:'flex', flexWrap:'wrap', gap:8 }}>
            {showStart && startBtn(startLabel ? `Start “${startLabel}” now` : 'Start now')}
            <button onClick={onAdd}
              style={{ display:'inline-flex', alignItems:'center', gap:5, fontSize:12, padding:'6px 14px', borderRadius:18, border:'none', background:'#E7F3F6', color:'var(--teal)', fontWeight:600, cursor:'pointer', fontFamily:'DM Sans,sans-serif' }}>
              <span style={{ fontSize:14, lineHeight:1 }}>＋</span> Add Task
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// A summary row that stands in for a routine's finished tasks — the morning
// ones collapse into "First thing in the morning", the evening ones into "Last
// of the evening". Tap to expand the individual done tasks (to uncheck one).
function collapseLabelFor(routine) {
  const n = (routine?.name || '').toLowerCase()
  if (n.includes('morning')) return 'First thing in the morning'
  if (n.includes('night') || n.includes('evening')) return 'Last of the evening'
  return `${routine?.name || 'Routine'} — done`
}
function RoutineCollapseRow({ routine, count, expanded, onToggle }) {
  const tint = routine?.tint || '#EDE7F0'
  const n = (routine?.name || '').toLowerCase()
  const glyph = n.includes('night') || n.includes('evening') ? 'glyph:moon' : 'glyph:sun'
  return (
    <div style={{ position:'relative', zIndex:0, display:'flex', gap:0, minHeight:52, opacity:.85 }}>
      <div style={{ position:'absolute', top:6, bottom:6, left:44, right:0, background:tint, opacity:.4, borderRadius:16, zIndex:-1 }} />
      <div style={{ width:52, flexShrink:0 }} />
      <div style={{ width:52, flexShrink:0, display:'flex', justifyContent:'center', alignItems:'center' }}>
        <div style={{ width:34, height:34, borderRadius:'50%', background:tint, display:'flex', alignItems:'center', justifyContent:'center' }}>
          <Icon value={glyph} size={17} color="#5A5560" />
        </div>
      </div>
      <button onClick={onToggle}
        style={{ flex:1, minWidth:0, textAlign:'left', border:'none', background:'transparent', cursor:'pointer', padding:'10px 10px', display:'flex', alignItems:'center', gap:8, fontFamily:'DM Sans,sans-serif' }}>
        <span style={{ fontSize:14.5, fontWeight:700, color:'var(--text)', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{collapseLabelFor(routine)}</span>
        <span style={{ fontSize:12, color:'var(--muted)', flexShrink:0 }}>{count} done</span>
        <span style={{ marginLeft:'auto', fontSize:11, color:'var(--muted)', transform:expanded?'rotate(180deg)':'none', transition:'transform .2s', flexShrink:0 }}>▾</span>
      </button>
    </div>
  )
}

// Unscheduled ("anytime") tasks — a day but no set time. Rendered as a compact
// standalone list rather than on the timeline spine, since they have no place
// on the clock. Sits at the top of the day on mobile and beside it on desktop.
function AnytimeCard({ tasks, categories, isDoneOf, onToggle, onOpen, onManage }) {
  if (!tasks.length) return null
  return (
    <div style={{ background:'linear-gradient(180deg, rgba(255,255,255,.9), rgba(255,255,255,.72))', border:'1px solid var(--border)', borderRadius:14, padding:'12px 14px', marginBottom:16 }}>
      <div style={{ display:'flex', alignItems:'center', gap:7, marginBottom:11 }}>
        <Icon value="glyph:list" size={15} color="#9AA6B2" />
        <span style={{ fontSize:10, fontWeight:800, letterSpacing:1.2, textTransform:'uppercase', color:'var(--muted)' }}>Anytime</span>
        <span style={{ fontSize:11, color:'var(--muted)', marginLeft:'auto', fontWeight:600 }}>{tasks.length}</span>
      </div>
      <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
        {tasks.map(task => {
          const catFound = (categories || []).find(x => x.id === task.tag)
          const color    = task.color || catFound?.color || TAG_COLORS[task.tag] || '#9CA3AF'
          const catIcon  = catFound?.icon || ''
          const title    = task.title || stripTimePrefix(task.label)
          const shownIcon = task.icon || catIcon || suggestGlyph(title)
          const isDone   = isDoneOf(task)
          return (
            <div key={task.id} onClick={()=>onOpen&&onOpen(task)}
              style={{ display:'flex', alignItems:'center', gap:10, cursor:onOpen?'pointer':'default', opacity:isDone?.5:1, transition:'opacity .3s' }}>
              <div style={{ width:34, height:34, borderRadius:'50%', flexShrink:0, background:color, display:'flex', alignItems:'center', justifyContent:'center' }}>
                {shownIcon
                  ? <Icon value={shownIcon} size={17} color={iconColorOn(color)} />
                  : <span style={{ color:iconColorOn(color), fontWeight:700, fontSize:15 }}>{(title || '?').charAt(0).toUpperCase()}</span>}
              </div>
              <span style={{ flex:1, minWidth:0, fontSize:14, fontWeight:600, color:isDone?'var(--muted)':'var(--text)', textDecoration:isDone?'line-through':'none', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{title}</span>
              {!isDone && onManage && (
                <button onClick={e=>{ e.stopPropagation(); onManage(task) }}
                  style={{ fontSize:14, padding:'0 2px', border:'none', background:'none', color:'#C0C6CE', cursor:'pointer', lineHeight:1, flexShrink:0 }}>···</button>
              )}
              <div onClick={e=>{ e.stopPropagation(); if(!isDone) bloomBurst(e.currentTarget); onToggle(task) }}
                style={{ width:22, height:22, borderRadius:'50%', flexShrink:0, cursor:'pointer', border:`2px solid ${color}`, background:isDone?color:'transparent', display:'flex', alignItems:'center', justifyContent:'center' }}>
                {isDone && <span style={{ color:iconColorOn(color), fontSize:12, fontWeight:700 }}>✓</span>}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function TimelineBlock({ task, categories, status, now, prevColor, nextColor, routineTint, tintOpacity = 0.5, filmTop = true, filmBottom = true, bandLabel = null, bandIcon = null, onBandLabel = null, onBandCollapse = null, isDone, elapsed, dateKey, pauseData = null, offerStartNow = false, onToggle, onManage, onShiftToNow, onOpen, onFocus, onToggleSub }) {
  const [subOpen, setSubOpen] = useState(false)
  const catFound = (categories || []).find(x => x.id === task.tag)
  const catColor = catFound?.color || TAG_COLORS[task.tag] || '#9CA3AF'
  const color    = task.color || catColor
  const catLabel = catFound?.label || (task.tag || '')
  const catIcon  = catFound?.icon || ''
  const timeMins = task._mins ?? parseTimeMins(task.label)
  const title    = task.title || stripTimePrefix(task.label)
  // The task's own icon wins, then its category's, then one auto-suggested from
  // the title, then (last resort) a letter — so a pill is almost never a bare
  // letter the way Structured always shows a glyph.
  const shownIcon = task.icon || catIcon || suggestGlyph(title)

  const isCurrent = status==='current' && !isDone
  const isOverdue = status==='overdue' && !isDone

  // Time range + duration (Structured-style: "7:50 – 8:11 AM (21 min)").
  let timeLine = ''
  if (task._time && task._dur) {
    const s = hhmmToMins(task._time)
    timeLine = `${rangeLabel(s, s + task._dur)} ${durParen(task._dur)}`
  } else if (timeMins !== null) {
    timeLine = fmtTimeLabel(timeMins)
  }

  // Block + pill height scale with the task's duration, so longer tasks visibly
  // take more of the day. The colored shape is a stadium: a circle for short
  // tasks (clamped to a legible minimum), a tall pill for long ones
  // (Structured-style). The icon sits centered. Tasks with no duration render
  // as the minimum circle.
  // Same proportional scale as gaps and time-block bands. A legible minimum
  // (52px) keeps a very short task's icon + title readable; above that the pill
  // grows with real duration so an hour visibly outweighs ten minutes.
  const durH  = task._dur ? spanHeight(task._dur) : 0
  const pillH = task._dur ? Math.max(52, Math.round(durH)) : 52
  const blockMinH = task._dur ? Math.max(84, Math.round(durH + 28)) : undefined

  // How far "now" sits into this task's pill (0–1), for the current task's
  // now-line + time label. Null unless this task is the one in progress.
  // (`isCurrent` is only ever true on the day being viewed as today, so no
  // separate isToday check is needed here — and it isn't in scope.)
  const nowFrac = (isCurrent && task._dur && timeMins !== null)
    ? Math.max(0, Math.min(1, (now - timeMins) / task._dur)) : null

  return (
    <div style={{ position:'relative', zIndex:0, display:'flex', gap:0, minHeight:blockMinH, opacity:isDone?.5:1, transition:'opacity .3s' }}>
      {/* Routine film — a soft wash of the routine's color behind the whole row
          (pink morning / blue night by default). zIndex:-1 keeps it under the
          pill + text; the block's zIndex:0 pins it to this row. When the
          neighbour shares the routine, the film runs to that edge (no inset +
          square corner) so consecutive tasks read as one continuous band. */}
      {routineTint && (
        <div style={{ position:'absolute', top:filmTop?6:0, bottom:filmBottom?6:0, left:44, right:0, background:routineTint, opacity:tintOpacity,
          borderTopLeftRadius:filmTop?16:0, borderTopRightRadius:filmTop?16:0, borderBottomLeftRadius:filmBottom?16:0, borderBottomRightRadius:filmBottom?16:0, zIndex:-1 }} />
      )}
      {/* Time-block (container) label, shown once at the top of its band: the
          block's icon (tap to edit) + name, and a collapse chevron. No checkbox —
          the tasks inside auto-complete on their own. */}
      {routineTint && bandLabel && (
        <div style={{ position:'absolute', top:9, left:52, right:8, zIndex:1, display:'flex', alignItems:'center', gap:7 }}>
          <BandIcon icon={bandIcon} color={routineTint} onEdit={onBandLabel} />
          <button type="button" onClick={onBandLabel || undefined} title={onBandLabel ? 'Edit time block' : undefined}
            style={{ fontSize:10, fontWeight:800, letterSpacing:.9, textTransform:'uppercase',
              color:'#39434F', background:'none', padding:0, border:'none', fontFamily:'DM Sans,sans-serif',
              cursor: onBandLabel ? 'pointer' : 'default', pointerEvents: onBandLabel ? 'auto' : 'none', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{(bandLabel||'').toUpperCase()}</button>
          {onBandCollapse && <span style={{ marginLeft:'auto', flexShrink:0 }}><BandChevron collapsed={false} onClick={onBandCollapse} /></span>}
        </div>
      )}
      {/* Spacer keeping the spine aligned with gaps + the now-marker. The task's
          time isn't repeated here — the card already shows the full range, so a
          gutter label would just be redundant. */}
      <div style={{ width:52, flexShrink:0 }} />
      {/* Colored duration pill + progress spine. The spine reads as a progress
          bar: segments you've worked through are solid in the task's color,
          upcoming segments stay light gray. */}
      <div style={{ width:52, flexShrink:0, display:'flex', flexDirection:'column', alignItems:'center' }}>
        <div style={{ width:3, height:14, borderRadius:3, background: prevColor ? `linear-gradient(to bottom, ${prevColor}, ${color})` : color }} />
        <div data-task-span="1"
          data-smin={timeMins != null ? timeMins : ''}
          data-emin={(timeMins != null && task._dur) ? timeMins + task._dur : ''}
          style={{ position:'relative', overflow:'hidden', width:52, height:pillH, borderRadius:26, flexShrink:0, background:color, display:'flex', alignItems:'center', justifyContent:'center',
          boxShadow:isCurrent?`0 0 0 4px ${color}33`:'none' }}>
          {/* Progress shade — lighter fill(s) marking how far along the task is:
              elapsed time while it's happening (and/or the share of subtasks
              checked off). When the task has been paused in Focus mode, the time
              it was paused stays UNSHADED, so the pill ends up as bands of
              worked time separated by gaps for each break. */}
          {(() => {
            const seg = isDone ? null : taskSegments({ date: dateKey, time: task._time, durationMins: task._dur, subDone: task.subDone, subCount: task.subCount, startedAt: task.startedAt, pauses: pauseData?.pauses, pausedAt: pauseData?.pausedAt })
            const shade = iconColorOn(color) === '#FFFFFF' ? 'rgba(255,255,255,.34)' : 'rgba(0,0,0,.16)'
            // Fill from the top so the elapsed portion (and its lower edge)
            // tracks downward as the day advances — matching the now-line.
            return seg && seg.show ? seg.segments.map((s, i) => (
              <div key={i} style={{ position:'absolute', left:0, right:0, top:`${s.top * 100}%`, height:`${s.height * 100}%`, background:shade, transition:'top .5s ease, height .5s ease' }} />
            )) : null
          })()}
          <span style={{ position:'relative', display:'flex' }}>
            {shownIcon
              ? <Icon value={shownIcon} size={24} color={iconColorOn(color)} />
              : <span style={{ color:iconColorOn(color), fontWeight:700, fontSize:20 }}>{(title || '?').charAt(0).toUpperCase()}</span>}
          </span>
        </div>
        <div style={{ width:3, flex:1, minHeight:14, borderRadius:3, background: nextColor ? `linear-gradient(to bottom, ${color}, ${nextColor})` : color }} />
      </div>
      {/* Card */}
      <div style={{ flex:1, minWidth:0, paddingTop:8, paddingBottom:12, paddingLeft:10 }}>
        <div onClick={()=>onOpen&&onOpen()} style={{ cursor:onOpen?'pointer':'default' }}>
          {timeLine && (
            <div style={{ fontSize:12, color:isCurrent?'var(--teal)':'var(--muted)', fontWeight:600, marginBottom:2, display:'flex', alignItems:'center', gap:6 }}>
              {timeLine}
              {task.isRecurring && <Icon value="glyph:repeat" size={12} color={isCurrent?'var(--teal)':'#9AA6B2'} />}
              {isOverdue && <span style={{ fontSize:10, color:'#EF4444', fontWeight:700 }}>OVERDUE</span>}
            </div>
          )}
          <div style={{ display:'flex', alignItems:'flex-start', gap:10 }}>
            <span style={{ flex:1, minWidth:0, fontSize:16, fontWeight:700, color:isDone?'var(--muted)':'var(--text)', textDecoration:isDone?'line-through':'none', lineHeight:1.25 }}>{title}</span>
            <div onClick={e=>{ e.stopPropagation(); if(!isDone) bloomBurst(e.currentTarget); onToggle() }}
              style={{ width:24, height:24, borderRadius:'50%', flexShrink:0, marginTop:1, cursor:'pointer', border:`2px solid ${color}`, background:isDone?color:'transparent', display:'flex', alignItems:'center', justifyContent:'center' }}>
              {isDone && <span style={{ color:iconColorOn(color), fontSize:13, fontWeight:700 }}>✓</span>}
            </div>
          </div>
          {task.note && <div style={{ fontSize:12, color:'var(--muted)', marginTop:3, lineHeight:1.4 }}>{task.note}</div>}
          <div style={{ display:'flex', gap:6, marginTop:7, flexWrap:'wrap', alignItems:'center' }}>
            {catLabel && <span style={{ display:'inline-flex', alignItems:'center', gap:3, fontSize:9, padding:'2px 7px', borderRadius:6, background:`${color}1c`, color, fontWeight:700, letterSpacing:.6, textTransform:'uppercase' }}>{catIcon && <Icon value={catIcon} size={11} />}{catLabel}</span>}
            {task.subCount>0 && (
              <button onClick={e=>{ e.stopPropagation(); onToggleSub ? setSubOpen(o=>!o) : null }}
                style={{ display:'inline-flex', alignItems:'center', gap:4, fontSize:10, fontWeight:700, padding:'2px 8px', borderRadius:12, border:'none', background:'#EEECF0', color:'var(--muted)', cursor:onToggleSub?'pointer':'default', fontFamily:'DM Sans,sans-serif' }}>
                <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="4" width="16" height="16" rx="4.5"/><path d="M8.4 12.3l2.4 2.4 4.6-5"/></svg>
                {task.subDone}/{task.subCount}
                {onToggleSub && <span style={{ fontSize:9, transform:subOpen?'rotate(180deg)':'none', transition:'transform .2s' }}>▾</span>}
              </button>
            )}
            {!isDone && <button onClick={e=>{ e.stopPropagation(); onManage() }} style={{ marginLeft:'auto', fontSize:14, padding:'0 4px', border:'none', background:'none', color:'#C0C6CE', cursor:'pointer', lineHeight:1 }}>···</button>}
          </div>
          {/* Inline subtasks — check them off without opening the task. */}
          {subOpen && onToggleSub && task.subCount>0 && (
            <div onClick={e=>e.stopPropagation()} style={{ marginTop:8, marginLeft:2 }}>
              {(task.subtasks||[]).map(s => (
                <div key={s.id} onClick={()=>onToggleSub(s.id)}
                  style={{ display:'flex', alignItems:'center', gap:9, padding:'5px 0', cursor:'pointer' }}>
                  <span style={{ width:18, height:18, borderRadius:5, flexShrink:0, border: s.done?'none':`2px solid ${color}`, background:s.done?color:'transparent', display:'flex', alignItems:'center', justifyContent:'center' }}>
                    {s.done && <span style={{ color:iconColorOn(color), fontSize:11, fontWeight:700 }}>✓</span>}
                  </span>
                  <span style={{ fontSize:13, color:s.done?'var(--muted)':'var(--text)', textDecoration:s.done?'line-through':'none' }}>{s.text}</span>
                </div>
              ))}
            </div>
          )}
        </div>
        <div style={{ display:'flex', flexWrap:'wrap', gap:8 }}>
          {isCurrent && timeMins!==null && (
            <button onClick={e=>{ e.stopPropagation(); onFocus&&onFocus() }}
              style={{ marginTop:9, padding:'7px 14px', borderRadius:9, border:'none', background:color, color:iconColorOn(color), cursor:'pointer', fontFamily:'DM Sans,sans-serif', fontSize:11, fontWeight:700, display:'inline-flex', alignItems:'center', gap:5 }}>
              <TargetIcon /> Focus Now
            </button>
          )}
          {(isCurrent||isOverdue||offerStartNow) && !INFLEXIBLE_TAGS.has(task.tag) && timeMins!==null && (
            <button onClick={e=>{ e.stopPropagation(); onShiftToNow() }}
              style={{ marginTop:9, padding:'7px 12px', borderRadius:9, border:`1px solid ${color}`, background:`${color}12`, color, cursor:'pointer', fontFamily:'DM Sans,sans-serif', fontSize:11, fontWeight:600 }}>
              ⏱ Start now · shift the rest
            </button>
          )}
        </div>
      </div>
      {/* NOW — a ringed dot on the spine at the elapsed point of the current
          task, with the time on its right. This lands inside the class you're
          in, instead of floating after it. */}
      {nowFrac !== null && (
        <div style={{ position:'absolute', top:`${14 + nowFrac * pillH}px`, left:0, transform:'translateY(-50%)', display:'flex', alignItems:'center', zIndex:4, pointerEvents:'none' }}>
          <div style={{ width:52, flexShrink:0 }} />
          <div style={{ width:52, flexShrink:0, display:'flex', justifyContent:'center' }}>
            <div data-now-nodule="1" style={{ width:13, height:13, borderRadius:'50%', background:'white', border:'3px solid var(--teal)', boxShadow:'0 0 0 3px rgba(74,158,181,.16)' }} />
          </div>
          <div style={{ marginLeft:6, fontSize:11, fontWeight:800, color:'var(--teal)', background:'var(--cream)', padding:'1px 7px', borderRadius:8, boxShadow:'0 1px 3px rgba(0,0,0,.14)', whiteSpace:'nowrap' }}>{fmtTimeLabel(now)}</div>
        </div>
      )}
    </div>
  )
}

// ── NOW marker ─────────────────────────────────────────────────
// Shown only when nothing is in progress (now falls in a gap). A ringed dot
// sits on the spine with the time to its right — no full-width line — matching
// the in-task now-line. Uses the SAME column widths as TimelineBlock and GapRow
// (52 gutter + 52 spine) so the dot lands exactly on the spine.
function NowMarker({ now, bandTint = null, bandOpacity = 0.5 }) {
  // Inside a time block the marker must not break the band: it drops its
  // vertical margin and carries the block's film full-bleed behind it, so the
  // blue reads as one continuous wash with just a thin "now" line over it.
  return (
    <div style={{ position:'relative', zIndex:0, display:'flex', gap:0, alignItems:'center', margin: bandTint?0:'4px 0' }}>
      {bandTint && (
        <div style={{ position:'absolute', top:0, bottom:0, left:44, right:0, background:bandTint, opacity:bandOpacity, zIndex:-1 }} />
      )}
      <div style={{ width:52, flexShrink:0 }} />
      <div style={{ width:52, flexShrink:0, display:'flex', justifyContent:'center' }}>
        <div data-now-nodule="1" style={{ width:13, height:13, borderRadius:'50%', background:'white', border:'3px solid var(--teal)', boxShadow:'0 0 0 3px rgba(74,158,181,.16)' }} />
      </div>
      <div style={{ marginLeft:6, fontSize:11, fontWeight:800, color:'var(--teal)', background:'var(--cream)', padding:'1px 7px', borderRadius:8, boxShadow:'0 1px 3px rgba(0,0,0,.14)', whiteSpace:'nowrap' }}>{fmtTimeLabel(now)}</div>
    </div>
  )
}

// ── Structured-style week strip header ─────────────────────────
// Big date up top, then a Sun–Sat row of the current week. The selected day is
// a filled teal circle, today gets a soft ring, and small colored dots under
// each day preview that day's scheduled items. Tapping a day navigates to it.
function ymd(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}
// Shift a YYYY-MM-DD key by `delta` days (noon anchor dodges DST edges).
function addDays(key, delta) {
  const d = new Date(key + 'T12:00:00')
  d.setDate(d.getDate() + delta)
  return ymd(d)
}
// How many days the scroll wheel reaches on either side of today. Wide enough
// to feel endless while you flick, bounded so the strip stays light.
const WHEEL_BACK = 120
const WHEEL_FWD  = 120
function WeekStrip({ viewDate, setViewDate, commitments, categories, doneCount, total, dayProgress, isToday, summary, todos, recurringTasks, recurringExceptions }) {
  const today = todayKey()
  const base = new Date(viewDate + 'T12:00:00')
  const wheelRef = useRef(null)
  const colorFor = (c) => c.color || (categories || []).find(x => x.id === c.cat)?.color || TAG_COLORS[c.cat] || '#9CA3AF'
  // Streak mode: a day "lights up" when it has scheduled items and every one is
  // done (commitments + recurring instances, matching the timeline).
  const dayAllDone = (key) => {
    const cs = (commitments || []).filter(c => c.date === key && !c.block)
    const rs = recurringOccurrencesForDate(recurringTasks, key, recurringExceptions).filter(o=>!o.block)
    const items = [
      ...cs.map(c => !!(todos?.[c.id] || c.done)),
      ...rs.map(o => !!(todos?.[`${key}_${o.id}`])),
    ]
    return items.length > 0 && items.every(Boolean)
  }
  const monthDay = base.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })
  const year = base.getFullYear()

  // The wheel's day keys — a stable window around today (recomputed only when
  // the calendar day rolls over), so flicking through it never re-lays-out.
  const days = useMemo(() => {
    const arr = []
    for (let i = -WHEEL_BACK; i <= WHEEL_FWD; i++) arr.push(addDays(today, i))
    return arr
  }, [today])
  // Per-day markers (dots or streak flame), memoized so a 30s "now" re-render
  // of the parent doesn't recompute recurring occurrences for every day.
  const dayMeta = useMemo(() => {
    const m = {}
    for (const key of days) {
      m[key] = summary === 'streak'
        ? { streak: dayAllDone(key) }
        : { dots: (commitments || []).filter(c => c.date === key && !c.block).slice(0, 5).map(colorFor) }
    }
    return m
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days, summary, commitments, categories, todos, recurringTasks, recurringExceptions])

  // Center a given day in the wheel by setting scrollLeft directly — no page
  // scroll side effects, unlike scrollIntoView. Selection is never touched here;
  // scrolling only moves the viewport, tapping is what selects.
  const centerOn = (key, smooth) => {
    const cont = wheelRef.current
    if (!cont) return
    const el = cont.querySelector(`[data-daykey="${key}"]`)
    if (!el) return
    const target = el.offsetLeft - (cont.clientWidth - el.clientWidth) / 2
    cont.scrollTo({ left: Math.max(0, target), behavior: smooth ? 'smooth' : 'auto' })
  }
  // Start the wheel centered on today (once, on mount, before paint so the far
  // end never flashes) — not on every re-render, so a flick that scrolls away
  // is never yanked back.
  useLayoutEffect(() => { centerOn(today, false) }, [])  // eslint-disable-line react-hooks/exhaustive-deps
  const goToday = () => { setViewDate(today); centerOn(today, true) }

  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ display:'flex', alignItems:'baseline', gap:9, marginBottom:12 }}>
        <span className="serif" style={{ fontSize:29, fontWeight:700, color:'var(--text)', lineHeight:1 }}>{monthDay},</span>
        <span className="serif" style={{ fontSize:29, fontWeight:700, color:'var(--teal)', lineHeight:1 }}>{year}</span>
        {!isToday && (
          <button onClick={goToday}
            style={{ marginLeft:'auto', alignSelf:'center', fontSize:11.5, fontWeight:700, color:'var(--teal)', background:'rgba(14,158,142,.12)',
              border:'none', borderRadius:14, padding:'5px 12px', cursor:'pointer', fontFamily:'DM Sans,sans-serif', whiteSpace:'nowrap' }}>
            Today
          </button>
        )}
      </div>
      <div ref={wheelRef} className="day-wheel">
        {days.map(key => {
          const d = new Date(key + 'T12:00:00')
          const sel = key === viewDate
          const isTod = key === today
          const meta = dayMeta[key] || {}
          // The 1st of a month labels itself with the month, so scrolling far
          // stays oriented without a separate month header.
          const topLabel = d.getDate() === 1
            ? d.toLocaleDateString('en-US', { month:'short' })
            : d.toLocaleDateString('en-US', { weekday:'short' })
          return (
            <button key={key} data-daykey={key} onClick={() => setViewDate(key)} className="day-cell"
              style={{ border:'none', background:'none', cursor:'pointer', padding:'2px 0', display:'flex', flexDirection:'column', alignItems:'center', gap:5 }}>
              <span style={{ fontSize:11, color: d.getDate()===1 ? 'var(--teal)' : 'var(--muted)', fontWeight: d.getDate()===1 ? 700 : 500 }}>{topLabel}</span>
              <span style={{ width:34, height:34, borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center', fontSize:15,
                fontWeight: sel ? 700 : 600,
                background: sel ? 'var(--teal)' : (isTod ? 'rgba(14,158,142,.14)' : 'transparent'),
                color: sel ? 'white' : (isTod ? 'var(--teal)' : 'var(--text)') }}>{d.getDate()}</span>
              <span style={{ display:'flex', gap:2, height:15, alignItems:'center', justifyContent:'center' }}>
                {summary === 'streak'
                  ? (meta.streak ? <Icon value="glyph:flame" size={14} color="#E8863A" /> : null)
                  : (meta.dots || []).map((c, i) => <span key={i} style={{ width:5, height:5, borderRadius:'50%', background:c }} />)}
              </span>
            </button>
          )
        })}
      </div>
      {/* Progress bar — how far through the day we are, and how much is done. */}
      <div style={{ marginTop:16 }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:7 }}>
          <span style={{ fontSize:12.5, color:'var(--text)', fontWeight:600 }}>{doneCount} of {total} done</span>
          {isToday && total>0 && (
            <span style={{ fontSize:11, color:'var(--muted)', fontWeight:500 }}>{Math.round(dayProgress*100)}% through today</span>
          )}
        </div>
        <div style={{ position:'relative', height:10 }}>
          {/* Track — a pale wash of the active theme accent. */}
          <div style={{ position:'absolute', inset:0, borderRadius:999, background:'var(--green-light)', overflow:'hidden' }}>
            {/* Completed-share fill — the theme accent's shimmer, so it follows
                whatever theme color is set. */}
            <div style={{ height:'100%', width:`${total>0?(doneCount/total)*100:0}%`, borderRadius:999,
              background:'var(--glimmer, var(--teal))', boxShadow:'0 1px 5px rgba(0,0,0,.18)', transition:'width .5s ease' }} />
          </div>
          {/* "You are here" handle — a ringed dot riding along the day. */}
          {isToday && total>0 && (
            <div style={{ position:'absolute', top:'50%', left:`${Math.max(3, Math.min(97, dayProgress*100))}%`, transform:'translate(-50%,-50%)',
              width:15, height:15, borderRadius:'50%', background:'white', border:'3px solid var(--teal)', boxShadow:'0 1px 5px rgba(0,0,0,.22)' }} />
          )}
        </div>
      </div>
    </div>
  )
}

// ── Main ───────────────────────────────────────────────────────
export default function Today({ todos, weekState, syncToggle, clearCompletion, pushUndo, commitments, addCommitment, updateCommitment, deleteCommitment, moveCommitmentToThoughts, addEvent, appendLog, scheduled, categories, recurringTasks, recurringExceptions, occStarted = {}, skipRecurringOccurrence, deleteRecurringTask, addRecurringTask, updateRecurringTask, routines = [], taskTemplates = [], summary, labelModel = null, externalEvents = [], externalCalendars = [], toggleCalendar, importedAdoptions = {}, adoptImportedEvent,
  wlCheckins = [], persistWlCheckins, wlEffects, persistWlEffects, wlEpisodes = [], persistWlEpisodes, wlGame, persistWlGame, wlLog = [], wlEmotions, persistWlEmotions, onOpenWellness }) {
  const [now,         setNow]         = useState(nowMins())
  // The day the timeline is showing. Defaults to today; the week strip up top
  // navigates to any day. "Now" logic (the progress marker, current/overdue,
  // start-now) only applies when we're actually looking at today.
  const [viewDate,    setViewDate]    = useState(todayKey())
  const [managing,    setManaging]    = useState(null)
  const [editing,     setEditing]     = useState(null)  // full commitment being edited
  const [editingRec,  setEditingRec]  = useState(null)  // recurring template being edited
  const [editingRecDate, setEditingRecDate] = useState(null)  // which occurrence's date (for single-event edits)
  const [shiftPlan,   setShiftPlan]   = useState(null)  // {pivot, rest, selected} — "start now" push chooser
  const [focusTask,   setFocusTask]   = useState(null)  // task shown in full-screen Focus mode
  // Focus pauses — the wall-clock spans a task was paused in Focus mode, keyed
  // by "<date>:<taskId>". They drive the unshaded gaps in the pill (a task's
  // pill shades the time worked and leaves gaps where it was paused, instead of
  // the old behaviour of splitting the remainder off as a rescheduled task).
  // Device-local: a focus session lives on one device, so no cloud sync needed.
  const [focusPauses, setFocusPauses] = useState(() => {
    try {
      const all = JSON.parse(localStorage.getItem('bloom_focus_pauses') || '{}')
      // Drop entries from earlier days so the store can't grow without bound.
      const today = todayKey()
      const kept = {}
      for (const [k, v] of Object.entries(all)) { if (k.slice(0, 10) === today) kept[k] = v }
      return kept
    } catch { return {} }
  })
  const persistFocusPauses = (next) => {
    setFocusPauses(next)
    try { localStorage.setItem('bloom_focus_pauses', JSON.stringify(next)) } catch {}
  }
  const pauseKeyFor = (task) => `${dateKey}:${task.id}`
  const [addingTask,  setAddingTask]  = useState(false)
  const [addPreset,   setAddPreset]   = useState(null)  // {time, cat} when adding inside a block
  const [pasterOpen,  setPasterOpen]  = useState(false) // AI assistant sheet
  const [expandedRoutines, setExpandedRoutines] = useState({})  // routineId → show its done tasks individually
  // Explicit collapse overrides for time blocks (keyed by block id). A stored
  // true/false is the user's choice; NO entry means "auto" — a block folds up on
  // its own once its window has passed (see isBlockCollapsed). Toggling always
  // writes an explicit value so the manual choice sticks.
  const [collapsedBlocks, setCollapsedBlocks] = useState(()=>{
    try { return JSON.parse(localStorage.getItem('vivian_collapsed_blocks')||'{}') } catch { return {} }
  })
  const toggleBlockCollapsed = (id, effectiveCollapsed) => setCollapsedBlocks(prev => {
    const next = { ...prev, [id]: !effectiveCollapsed }
    try { localStorage.setItem('vivian_collapsed_blocks', JSON.stringify(next)) } catch {}
    return next
  })
  const [shiftResult, setShiftResult] = useState(null)
  const [customTasks, setCustomTasks] = useState(()=>{
    try { return JSON.parse(localStorage.getItem('vivian_custom_'+todayKey())||'[]') } catch { return [] }
  })
  const [deleted, setDeleted] = useState(()=>{
    try { return JSON.parse(localStorage.getItem('vivian_deleted_'+todayKey())||'[]') } catch { return [] }
  })
  // time overrides: { taskId: newMins } — applied when user shifts a task
  const [timeOverrides, setTimeOverrides] = useState(()=>{
    try { return JSON.parse(localStorage.getItem('vivian_timeshift_'+todayKey())||'{}') } catch { return {} }
  })

  useEffect(()=>{ const t=setInterval(()=>setNow(nowMins()),30000); return ()=>clearInterval(t) },[])

  // Global day-start shift modal
  const [shiftDayOpen, setShiftDayOpen] = useState(false)
  const [shiftDayTime, setShiftDayTime] = useState('')

  const dateKey = viewDate
  const isToday = viewDate === todayKey()

  // Per-day local collections (custom tasks, deletions, time overrides) are
  // keyed by date in localStorage — reload them whenever the viewed day
  // changes so navigating the week strip shows the right day's state.
  useEffect(() => {
    const ra = k => { try { return JSON.parse(localStorage.getItem(k) || '[]') } catch { return [] } }
    const ro = k => { try { return JSON.parse(localStorage.getItem(k) || '{}') } catch { return {} } }
    setCustomTasks(ra('vivian_custom_' + viewDate))
    setDeleted(ra('vivian_deleted_' + viewDate))
    setTimeOverrides(ro('vivian_timeshift_' + viewDate))
  }, [viewDate])

  // Recurring instances for this day come from the SAME shared computation the
  // Week and Calendar use, so all three agree. Legacy per-date localStorage
  // deletions (`deleted`) are still honored alongside the new synced skips.
  const templateTodos = recurringOccurrencesForDate(recurringTasks, dateKey, recurringExceptions)
    .filter(t=>!deleted.includes(t.id))
    // Merge in an arrival-started timestamp (set when you reach the task's
    // location), so a located recurring task shows live progress like a one-off.
    .map(t => { const s = occStarted[occKey(t.id, dateKey)]; return s ? { ...t, startedAt: s } : t })
  // Keep done ones too — a finished task stays on the timeline, crossed off,
  // rather than vanishing.
  const todayCommitments = (commitments||[]).filter(c=>c.date===dateKey)

  // Time blocks (containers) — labeled windows that draw a soft film behind the
  // day. They aren't tasks; tasks whose start time lands inside one get its
  // film + label (see bandOf). Excluded from the task list below. Come from both
  // one-off commitments and repeating time blocks (e.g. Work every weekday).
  // A block with no explicit color inherits its category's color (the "From
  // label" choice in the editor), falling back to a neutral slate only when it
  // has no category at all — so it renders as the color shown while editing it,
  // not a fixed grey.
  const catColorOf = (catId) => (categories || []).find(x => x.id === catId)?.color || TAG_COLORS[catId] || null
  // A block can be nudged for just this day by the same day-local time override
  // the shift chooser writes for tasks — so a block (e.g. "Work") can ride along
  // when you push the rest of the day's events later. A commitment block that
  // moved for real (its own time changed) carries no override and reads its new
  // time; a recurring block moves via the override, since its template time is
  // shared across every day.
  const blockStart = (id, baseMins) => (timeOverrides[id] != null ? timeOverrides[id] : baseMins)
  const blocks = [
    ...todayCommitments.filter(c => c.block && c.time && c.durationMins)
      .map(c => { const s = blockStart(c.id, hhmmToMins(c.time)); return { id:c.id, label:(c.text||'').trim(), color: c.color || catColorOf(c.cat) || '#8AA0B8', icon: c.icon || null, cat: c.cat || null, isCommitment:true,
        start: s, end: s + c.durationMins } }),
    ...templateTodos.filter(o => o.block && o._time && o._dur)
      .map(o => { const s = blockStart(o.id, hhmmToMins(o._time)); return { id:o.id, label:(o.title||o.text||'').trim(), color: o.color || catColorOf(o.cat || o.tag) || '#8AA0B8', icon: o.icon || null, cat: o.cat || o.tag || null, isCommitment:false,
        start: s, end: s + o._dur } }),
  ]
  // Blocks recast as shiftable candidates, shaped like timeline tasks so the
  // shift chooser can list them and applyTimeShift can move them alongside tasks.
  const blockShiftItems = () => blocks.map(b => ({
    id: b.id, _mins: b.start, _dur: b.end - b.start, _time: minsToHHMM(b.start),
    title: b.label, label: b.label, tag: b.cat, isCommitment: b.isCommitment,
    isBlock: true, routine: null,
  }))
  // A block whose window has fully passed today reads as "done" — and folds up
  // on its own (like a finished routine) unless the user has explicitly set it
  // open/closed. An explicit toggle (in collapsedBlocks) always wins.
  const blockPastWindow = (b) => isToday && b.end != null && now >= b.end
  const isBlockCollapsed = (b) => (b.id in collapsedBlocks) ? !!collapsedBlocks[b.id] : blockPastWindow(b)
  // Add a task inside a block — a "folder" for a slice of the day. Opens the add
  // sheet pre-scheduled at the tapped time (kept inside the block's window) and
  // pre-labeled with the block's own category, so events land in the window;
  // one dragged outside is just an ordinary task with that label.
  const addInBlock = (b, atMins) => {
    const t = Math.max(b.start, Math.min(b.end - 1, atMins ?? b.start))
    setAddPreset({ time: minsToHHMM(t), cat: b.cat || '' })
    setAddingTask(true)
  }
  // Tapping a free-time gap's "Add Task" fills that break with a new task —
  // pre-scheduled to occupy the window minus a TRANSITION_MIN cushion before it
  // (after the previous task ends) and after it (before the next task starts),
  // so the day always leaves breathing room to move between things. The Add
  // sheet opens pre-timed and pre-sized; you just name it. When the gap is too
  // short for two full cushions, they shrink evenly rather than overrun.
  const addInGap = (gapStart, gapEnd) => {
    const gap = gapEnd - gapStart
    const MIN_TASK = 10
    let buffer = TRANSITION_MIN
    if (gap - 2 * buffer < MIN_TASK) buffer = Math.max(0, Math.floor((gap - MIN_TASK) / 2))
    const start = gapStart + buffer
    const dur = Math.max(MIN_TASK, gap - 2 * buffer)
    setAddPreset({ time: minsToHHMM(start), dur })
    setAddingTask(true)
  }
  // The "band" behind a task row: a containing time block wins, else its routine
  // group. Returns { id, tint, label } or null.
  const bandOf = (t) => {
    if (t && t._mins != null) {
      const b = blocks.find(b => t._mins >= b.start && t._mins < b.end)
      if (b) return { id:'blk-'+b.id, tint:b.color, label:b.label }
    }
    if (t && t.routine) { const r = (routines||[]).find(x=>x.id===t.routine); if (r) return { id:'rt-'+r.id, tint:r.tint, label:null } }
    return null
  }

  const isDoneCheck = (id, isCommitment) => isCommitment
    ? !!(todos[id]||weekState[id])
    : !!(todos[dateKey+'_'+id]||weekState[dateKey+'_'+id])

  // Whether a stored check/uncheck record exists (vs. no record at all). A
  // routine task with no record auto-completes once its time has passed; an
  // explicit tap (check or uncheck) always wins over that default.
  const routineIds = new Set((routines||[]).map(r=>r.id))
  const hasCompletionRecord = (task) => task.isCommitment ? (task.id in (todos||{})) : ((dateKey+'_'+task.id) in (todos||{}))
  const inAnyBlock = (task) => task._mins != null && blocks.some(b => task._mins >= b.start && task._mins < b.end)
  const isPastDay = viewDate < todayKey()
  const effectiveDone = (task) => {
    if (hasCompletionRecord(task)) return isDoneCheck(task.id, task.isCommitment)
    // No record: a task auto-completes once its window has passed when it opts
    // in explicitly (task.autoComplete), belongs to a routine, or lives inside
    // a time block. The explicit flag lets tasks outside any routine do this too.
    const autoRoutine = task.routine && routineIds.has(task.routine)
    if ((task.autoComplete === true || autoRoutine || inAnyBlock(task)) && task._mins!==null) {
      // Today: done once the task's own window has passed. A past day is wholly
      // over, so every such task auto-completes (matching how it looked at the
      // end of that day). A future day: nothing has happened yet.
      if (isToday) return now >= task._mins + (task._dur || 0)
      return isPastDay
    }
    return false
  }

  // Apply time overrides to task labels. Commitments carry their real start
  // time (_time) and are updated directly, so overrides only apply to the
  // local template/custom todos that have no stored time — otherwise a stale
  // override would fight the real time and scramble the ordering.
  const applyOverrides = (tasks) => tasks.map(t=>{
    if (!t.isCommitment && timeOverrides[t.id]!==undefined) {
      // Move both the shown label and the authoritative start time, so a
      // rescheduled recurring/local task actually re-sorts on the timeline
      // (taskMins prefers _time when present).
      return { ...t, label: shiftLabelTime(t.label, timeOverrides[t.id]), _time: minsToHHMM(timeOverrides[t.id]) }
    }
    return t
  })
  // A task's authoritative start minutes: commitments from their stored time
  // (so gutter, order, and "now" always match the shown range); todos from the
  // time in their label.
  const taskMins = (t) => (t._time != null ? hhmmToMins(t._time) : parseTimeMins(t.label))

  const rawTasks = [
    ...todayCommitments.filter(c=>!c.block).map(c=>({
      id:c.id, label:c.time?`${fmt12(c.time)} — ${c.text}`:c.text,
      title:c.text,
      note:[c.person&&`With: ${c.person}`,c.prepMin&&`Leave ${c.prepMin} min early`].filter(Boolean).join(' · '),
      tag:c.cat||null, isCommitment:true,
      color:c.color||null, icon:c.icon||null, _time:c.time||null, _dur:c.durationMins||null,
      // A one-off commitment can now belong to a routine (film + grouping) and
      // opt into auto-complete, just like a recurring task.
      routine:c.routine||null, autoComplete:!!c.autoComplete,
      startedAt:c.startedAt||null,
      subtasks:Array.isArray(c.subtasks)?c.subtasks:[],
      subCount:Array.isArray(c.subtasks)?c.subtasks.length:0,
      subDone:Array.isArray(c.subtasks)?c.subtasks.filter(s=>s.done).length:0,
    })),
    ...templateTodos.filter(t=>!t.block),
    ...customTasks,
  ]
  const allTasks = applyOverrides(rawTasks)

  const timedSorted = allTasks
    .map(t=>({...t,_mins:taskMins(t)}))
    .filter(t=>t._mins!==null)
    .sort((a,b)=>a._mins-b._mins)

  function getStatus(task) {
    if (effectiveDone(task)) return 'past'
    // On any day other than today there's no "now" — nothing is current/overdue.
    if (!isToday) return task._mins===null ? 'anytime' : 'upcoming'
    if (task._mins===null) return 'anytime'
    if (task._mins>now) return 'upcoming'
    // It's started and isn't done. "Current" means now is genuinely inside its
    // window — for a timed task that's [start, start+duration]; a task with no
    // duration only counts as current for a short grace period after its start.
    // Anything older than that is overdue, so the now-indicator never sticks to
    // a task that ended hours ago (e.g. a 7 AM task still showing "now" at 8 PM).
    const dur = task._dur ?? task.durationMins ?? 0
    if (dur) return (now < task._mins + dur) ? 'current' : 'overdue'
    return (now - task._mins <= 30) ? 'current' : 'overdue'
  }

  // Pure chronological order — a completed task keeps its place on the
  // timeline (crossed off) instead of being shuffled to the bottom. Untimed
  // ("anytime") tasks sink to the end.
  const tasksWithStatus = allTasks
    .filter(t=>!deleted.includes(t.id))
    .map(t=>({...t,_mins:taskMins(t),_status:getStatus({...t,_mins:taskMins(t)})}))
    .sort((a,b)=>(a._mins??99999)-(b._mins??99999))

  // A time block reads as one continuous film across its whole window. Tasks
  // inside it carry the film (see bandOf); these are the EMPTY stretches — the
  // head before its first task, the tail after its last — rendered as band
  // segments so the container spans e.g. 8:30–5 even with only one task in it.
  // `blockHeadIds` / `blockTailIds` let the adjacent task drop its rounded edge
  // so the segment and the task film join seamlessly.
  const blockSegments = []
  const blockHeadIds = new Set()
  const blockTailIds = new Set()
  const collapsedBlockIds = new Set()   // blocks shown as one compact row
  for (const b of blocks) {
    const inside = tasksWithStatus
      .filter(t => t._mins != null && t._mins >= b.start && t._mins < b.end)
      .sort((x,y) => x._mins - y._mins)
    // Collapsed → one compact summary row in place of the whole band + its
    // inner tasks (which get filtered out of the render list below).
    if (isBlockCollapsed(b)) {
      collapsedBlockIds.add(b.id)
      blockSegments.push({ id:b.id+':collapsed', bid:b.id, collapsed:true, start:b.start, end:b.end, color:b.color, label:b.label, icon:b.icon, count:inside.length, done:blockPastWindow(b), roundTop:true, roundBottom:true })
      continue
    }
    if (!inside.length) {
      blockSegments.push({ id:b.id+':full', bid:b.id, start:b.start, end:b.end, color:b.color, label:b.label, icon:b.icon, blockStart:b.start, blockEnd:b.end, roundTop:true, roundBottom:true })
      blockHeadIds.add(b.id)
      continue
    }
    const firstMins = inside[0]._mins
    const lastEnd = Math.max(...inside.map(t => t._mins + (t._dur || 0)))
    if (b.start < firstMins) {
      blockSegments.push({ id:b.id+':head', bid:b.id, start:b.start, end:firstMins, color:b.color, label:b.label, icon:b.icon, blockStart:b.start, blockEnd:b.end, roundTop:true, roundBottom:false })
      blockHeadIds.add(b.id)
    }
    if (lastEnd < b.end) {
      blockSegments.push({ id:b.id+':tail', bid:b.id, start:lastEnd, end:b.end, color:b.color, label:null, roundTop:false, roundBottom:true })
      blockTailIds.add(b.id)
    }
  }
  blockSegments.sort((a,b) => a.start - b.start)

  // The tasks actually rendered on the timeline — everything except those tucked
  // inside a collapsed block (they're represented by the block's summary row).
  const blockIdOf = (t) => (t && t._mins != null) ? (blocks.find(b => t._mins >= b.start && t._mins < b.end)?.id ?? null) : null
  const renderTasks = collapsedBlockIds.size
    ? tasksWithStatus.filter(t => !collapsedBlockIds.has(blockIdOf(t)))
    : tasksWithStatus
  // Unscheduled ("anytime") tasks — those with a day but no set time — are
  // lifted out of the inline timeline into their own list: the top of the day
  // on mobile, a sidebar beside it on desktop (see .today-split in index.css).
  // The timeline itself renders only the timed tasks. Timed tasks always sort
  // ahead of untimed ones, so a timed task's index is the same in either list.
  const anytimeTasks = renderTasks.filter(t => t._mins === null)
  const renderTimed  = renderTasks.filter(t => t._mins !== null)
  const hasAnytime   = anytimeTasks.length > 0

  // ── Subscribed ("imported") calendar events for this day ──────
  // The events a subscribed calendar dropped on this day, surfaced as
  // unscheduled tasks with a recommended time. A timed event keeps its own
  // time; an all-day / untimed one is recommended into the first open gap,
  // clear of everything already on the timeline (and of earlier recommendations).
  const importedSpansForDay = importedOn(externalEvents, dateKey)
  const dayOccupied = [
    ...tasksWithStatus.filter(t => t._mins != null).map(t => ({ start: t._mins, end: t._mins + (t._dur || t.durationMins || 0) })),
    ...importedSpansForDay.filter(s => !s.allDay && s.startTime).map(s => {
      const st = hhmmToMins(s.startTime); const et = s.endTime ? hhmmToMins(s.endTime) : st + 30
      return { start: st, end: Math.max(et, st + 15) }
    }),
  ]
  const importedRows = buildImportedRows(importedSpansForDay, dateKey, dayOccupied, isToday ? now : null)
  const isImportedDone = (row) => !!(todos[row.key] || weekState[row.key])
  const onToggleImported = (row) => syncToggle(row.key, row.span.label || 'Busy', null, null, !isImportedDone(row))
  const onAdoptImported  = (row) => adoptImportedEvent && adoptImportedEvent(row.span, dateKey, row.timeHHMM, row.dur)

  const doneCount = tasksWithStatus.filter(t=>t._status==='past').length
  // When a task is in progress, the "now" indicator is drawn inside that task's
  // pill (see TimelineBlock), so we don't also drop a separate marker in the gap
  // after it. Only when nothing is current does the between-tasks marker show,
  // just before the first task that hasn't started yet.
  const hasCurrent = isToday && renderTasks.some(t=>t._status==='current')
  const nowInsertIdx = (isToday && !hasCurrent) ? renderTimed.findIndex(t=>t._mins!==null&&t._mins>now) : -1
  // When nothing is in progress, you're on a break — so the very next task that
  // hasn't started yet gets a "Start now" button, letting you pull it forward
  // however small the gap before it is (a rendered break card only appears for
  // 5-min-plus gaps, so short lulls would otherwise have no way to start early).
  const nextUpcomingId = (isToday && !hasCurrent)
    ? (renderTasks.find(t => t._mins!==null && t._mins>now && t._status==='upcoming' && !INFLEXIBLE_TAGS.has(t.tag) && !effectiveDone(t))?.id ?? null)
    : null
  // How far through today's schedule we are (0–1), for the header progress bar:
  // elapsed span from the first task's start to the last task's end.
  const dayStart = tasksWithStatus.find(t=>t._mins!==null)?._mins ?? null
  const lastTimed = [...tasksWithStatus].reverse().find(t=>t._mins!==null)
  const dayEnd = lastTimed ? ((lastTimed._time && lastTimed._dur) ? hhmmToMins(lastTimed._time)+lastTimed._dur : lastTimed._mins) : null
  const dayProgress = (isToday && dayStart!==null && dayEnd!==null && dayEnd>dayStart)
    ? Math.max(0, Math.min(1, (now - dayStart) / (dayEnd - dayStart))) : (isToday ? 0 : 0)

  function minsUntilNext(i) {
    const cur=tasksWithStatus[i]
    if (cur._mins===null) return null
    for (let j=i+1;j<tasksWithStatus.length;j++) {
      if (tasksWithStatus[j]._mins!==null) return tasksWithStatus[j]._mins-cur._mins
    }
    return null
  }

  // ── Shift whole day to new start ─────────────────────────────
  const handleShiftDay = (newStartTime) => {
    if (!newStartTime) return
    const [h, m] = newStartTime.split(':').map(Number)
    const newStartMins = h * 60 + m

    // Find earliest timed undone task to use as anchor
    const timedUndone = tasksWithStatus
      .filter(t => t._mins !== null && t._status !== 'past')
      .sort((a, b) => a._mins - b._mins)
    if (!timedUndone.length) return

    const earliestMins = timedUndone[0]._mins
    const offset = newStartMins - earliestMins

    const newOverrides = { ...timeOverrides }
    const prevOverrides = timeOverrides                 // for Undo
    let shifted = 0, committed = 0, fixed = 0
    timedUndone.forEach(task => {
      if (INFLEXIBLE_TAGS.has(task.tag)) { fixed++; return }
      const newTime = task._mins + offset
      if (newTime > END_OF_DAY_MINS) {
        committed++
        const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1)
        const tomorrowKey = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth()+1).padStart(2,'0')}-${String(tomorrow.getDate()).padStart(2,'0')}`
        if (addCommitment) addCommitment({
          id: 'shifted-' + task.id + '-' + Date.now(),
          text: task.label.replace(/^~?\d{1,2}:\d{2}\s*(?:AM|PM)\s*(?:—\s*)?/i, '').trim(),
          date: tomorrowKey, cat: task.tag, done: false,
          note: 'Shifted from ' + dateKey + ' — ran out of day',
        })
        setDeleted(prev => {
          const next = [...prev, task.id]
          localStorage.setItem('vivian_deleted_' + dateKey, JSON.stringify(next))
          return next
        })
      } else {
        newOverrides[task.id] = newTime
        shifted++
      }
    })
    setTimeOverrides(newOverrides)
    localStorage.setItem('vivian_timeshift_' + dateKey, JSON.stringify(newOverrides))
    setShiftResult({ shifted, committed, fixed })
    setShiftDayOpen(false)
    if (pushUndo && shifted) {
      pushUndo('shifted the day', () => {
        setTimeOverrides(prevOverrides)
        localStorage.setItem('vivian_timeshift_' + dateKey, JSON.stringify(prevOverrides))
      })
    }
  }

  // ── Shift to now ──────────────────────────────────────────────
  // Actually move things: the tapped task starts now, and the tasks the user
  // chose (selectedIds) get packed in after it. Anything not chosen stays put.
  // Commitment times update for real; local todos use the label-shift override.
  const applyShift = (pivotTask, selectedIds) => {
    const pivotMins = pivotTask._mins ?? parseTimeMins(pivotTask.label)
    if (pivotMins===null) return
    const sel = new Set(selectedIds)
    const overrides = { ...timeOverrides }
    const prevOverrides = timeOverrides                 // for Undo
    const commitReverts = []                            // {id, time} for Undo
    let shifted=0, committed=0, fixed=0

    const setStart = (t, mins) => {
      if (t.isCommitment && updateCommitment) { commitReverts.push({ id: t.id, time: t._time || null }); updateCommitment(t.id, { time: minsToHHMM(mins) }) }
      else overrides[t.id] = mins
    }
    const sendToTomorrow = (t) => {
      committed++
      const tm = new Date(); tm.setDate(tm.getDate()+1)
      const key = `${tm.getFullYear()}-${String(tm.getMonth()+1).padStart(2,'0')}-${String(tm.getDate()).padStart(2,'0')}`
      if (t.isCommitment && updateCommitment) updateCommitment(t.id, { date: key, time: null })
      else if (addCommitment) {
        addCommitment({ id:'shifted-'+t.id+'-'+Date.now(), text:(t.title||t.label||'').replace(/^~?\d{1,2}:\d{2}\s*(?:AM|PM)\s*(?:—\s*)?/i,'').trim(), date:key, cat:t.tag, note:`Shifted from ${dateKey} — ran out of day`, done:false })
        setDeleted(prev=>{ const next=[...prev,t.id]; localStorage.setItem('vivian_deleted_'+dateKey, JSON.stringify(next)); return next })
      }
    }

    const pivotDur = pivotTask._dur || 0
    setStart(pivotTask, now); shifted++
    let cursor = now + pivotDur

    tasksWithStatus
      .filter(t => t.id!==pivotTask.id && t._mins!==null && t._mins>=pivotMins)
      .sort((a,b)=>a._mins-b._mins)
      .forEach(t=>{
        const dur = t._dur || 0
        if (INFLEXIBLE_TAGS.has(t.tag)) { cursor=Math.max(cursor,t._mins+dur); return }
        if (!sel.has(t.id)) { cursor=Math.max(cursor,t._mins+dur); return }   // not chosen → leave
        if (t._mins >= cursor) { cursor=t._mins+dur; return }                 // no overlap → leave in place
        if (cursor+dur > END_OF_DAY_MINS) { sendToTomorrow(t); return }
        setStart(t, cursor); shifted++
        // A routine / block / auto-complete task's checkmark should follow its
        // NEW time, not a stale tap: drop any explicit record so it re-derives
        // from the clock — ticked once the new slot has passed, unticked until
        // then. That's the whole point when you push a routine later.
        if ((t.autoComplete || (t.routine && routineIds.has(t.routine)) || inAnyBlock(t)) && clearCompletion) {
          clearCompletion(t.id, t.isCommitment ? null : dateKey)
        }
        cursor += dur
      })

    setTimeOverrides(overrides)
    localStorage.setItem('vivian_timeshift_'+dateKey, JSON.stringify(overrides))
    setShiftResult({ shifted, committed, fixed })
    // Undo restores the timeline to exactly where it was: the recurring/local
    // overrides and any commitment start times we moved. Re-timed routine steps
    // then re-derive their checkmarks from the restored times.
    if (pushUndo && (shifted || committed)) {
      pushUndo('shifted the schedule', () => {
        setTimeOverrides(prevOverrides)
        localStorage.setItem('vivian_timeshift_'+dateKey, JSON.stringify(prevOverrides))
        commitReverts.forEach(r => updateCommitment && updateCommitment(r.id, { time: r.time }))
      })
    }
  }

  // "Start now": if later movable tasks exist, ask which to push; otherwise
  // just move this one to now.
  const handleShiftToNow = (pivotTask) => {
    const pivotMins = pivotTask._mins ?? parseTimeMins(pivotTask.label)
    if (pivotMins===null) return
    const pivotEnd = now + (pivotTask._dur || 0)
    // Everything scheduled at/after the pivot that could move. We KEEP tasks
    // already ticked off here: when you push a routine later (a slower morning),
    // its steps come along too — a re-timed step's checkmark then just follows
    // the clock again. Only genuinely fixed things (class/meeting/deadline/
    // urgent) are left out.
    const rest = tasksWithStatus
      .filter(t => t.id!==pivotTask.id && t._mins!==null && t._mins>=pivotMins
        && !INFLEXIBLE_TAGS.has(t.tag))
      .sort((a,b)=>a._mins-b._mins)
    if (rest.length === 0) { applyShift(pivotTask, []); return }
    const doneIds = new Set(rest.filter(t => isDoneCheck(t.id,t.isCommitment)).map(t=>t.id))
    // Default selection: if the pivot belongs to a routine, pre-check the rest of
    // that routine's steps — the common case is "shift the rest of THIS routine".
    // Otherwise fall back to the still-open tasks that overlap the new slot.
    const selected = pivotTask.routine
      ? new Set(rest.filter(t => t.routine === pivotTask.routine).map(t=>t.id))
      : new Set(rest.filter(t => !doneIds.has(t.id) && t._mins < pivotEnd).map(t=>t.id))
    setShiftPlan({ pivot: pivotTask, rest, selected, doneIds })
  }

  // ── Reschedule the rest after a time edit ────────────────────
  // Slide the chosen later tasks by the SAME amount the edited task moved
  // (keeping their spacing), instead of packing them to "now" like the Start-now
  // shift. Commitment times move for real; local/recurring todos use the day's
  // override. Re-timed routine/block/auto-complete steps drop their explicit
  // check so the checkmark re-derives from the clock — ticked once the new slot
  // has passed, unticked until then.
  const applyTimeShift = (pivot, delta, selectedIds) => {
    if (!delta) return
    const sel = new Set(selectedIds)
    const overrides = { ...timeOverrides }
    const prevOverrides = timeOverrides
    const commitReverts = []
    let shifted = 0, committed = 0
    const setStart = (t, mins) => {
      if (t.isCommitment && updateCommitment) { commitReverts.push({ id: t.id, time: t._time || null }); updateCommitment(t.id, { time: minsToHHMM(mins) }) }
      else overrides[t.id] = mins
    }
    // Timeline tasks plus blocks (e.g. "Work") — a block can ride along with the
    // rest of the day when selected, moving by the same delta as everything else.
    const pool = [...tasksWithStatus, ...blockShiftItems()]
    pool
      .filter(t => sel.has(t.id) && t._mins !== null && !INFLEXIBLE_TAGS.has(t.tag))
      .sort((a, b) => a._mins - b._mins)
      .forEach(t => {
        const target = t._mins + delta
        if (target < 0) return
        if (target > END_OF_DAY_MINS) {
          // A block that ran off the end of the day just clamps at its old start
          // rather than being torn out of its series and dumped onto tomorrow.
          if (t.isBlock) return
          // Ran off the end of the day → send it to tomorrow, like the other shifts.
          committed++
          const tm = new Date(); tm.setDate(tm.getDate() + 1)
          const key = `${tm.getFullYear()}-${String(tm.getMonth()+1).padStart(2,'0')}-${String(tm.getDate()).padStart(2,'0')}`
          if (t.isCommitment && updateCommitment) updateCommitment(t.id, { date: key, time: null })
          else if (addCommitment) {
            addCommitment({ id:'shifted-'+t.id+'-'+Date.now(), text:(t.title||t.label||'').replace(/^~?\d{1,2}:\d{2}\s*(?:AM|PM)\s*(?:—\s*)?/i,'').trim(), date:key, cat:t.tag, note:`Shifted from ${dateKey} — ran out of day`, done:false })
            setDeleted(prev=>{ const next=[...prev,t.id]; localStorage.setItem('vivian_deleted_'+dateKey, JSON.stringify(next)); return next })
          }
          return
        }
        setStart(t, target)
        shifted++
        if (!t.isBlock && (t.autoComplete || (t.routine && routineIds.has(t.routine)) || inAnyBlock(t)) && clearCompletion) {
          clearCompletion(t.id, t.isCommitment ? null : dateKey)
        }
      })
    setTimeOverrides(overrides)
    localStorage.setItem('vivian_timeshift_'+dateKey, JSON.stringify(overrides))
    setShiftResult({ shifted, committed, fixed:0 })
    if (pushUndo && (shifted || committed)) {
      pushUndo('rescheduled the routine', () => {
        setTimeOverrides(prevOverrides)
        localStorage.setItem('vivian_timeshift_'+dateKey, JSON.stringify(prevOverrides))
        commitReverts.forEach(r => updateCommitment && updateCommitment(r.id, { time: r.time }))
      })
    }
  }

  // After a task's time is changed in the editor, offer to slide the rest of its
  // routine along by the same amount. Only routine steps cascade (the common
  // "my morning ran late, push the rest" case); the chooser still lets you reach
  // other tasks. `newMins` is the task's new start in minutes (null = untimed).
  //
  // A time block (e.g. "Work") isn't in the task list at all, so when its start
  // moves we handle it separately below: sliding a block offers to bring the
  // tasks scheduled *inside* its window (a "clock in", say) along with it, so
  // they don't get left behind at the block's old start.
  const maybePromptShift = (pivotId, newMins) => {
    if (newMins === null || newMins === undefined) return
    const pivot = tasksWithStatus.find(t => t.id === pivotId)
    if (!pivot) { maybePromptBlockShift(pivotId, newMins); return }
    if (pivot._mins === null) return
    if (!pivot.routine) return                       // only routines cascade
    const delta = newMins - pivot._mins
    if (delta === 0) return
    // Later movable tasks by their current position — candidates to slide.
    // Blocks (e.g. "Work") that start after the pivot ride along too, so pushing
    // the morning later can bring Work down with everything else.
    const laterBlocks = blockShiftItems().filter(b => b._mins > pivot._mins && !INFLEXIBLE_TAGS.has(b.tag))
    const rest = [
      ...tasksWithStatus.filter(t => t.id !== pivotId && t._mins !== null && t._mins > pivot._mins && !INFLEXIBLE_TAGS.has(t.tag)),
      ...laterBlocks,
    ].sort((a, b) => a._mins - b._mins)
    if (!rest.length) return
    const doneIds = new Set(rest.filter(t => isDoneCheck(t.id, t.isCommitment)).map(t => t.id))
    // Blend of "just this routine" + "pick your own": pre-check the rest of this
    // task's routine plus any later blocks, but show every later task so any can
    // be added/removed.
    const selected = new Set([
      ...rest.filter(t => !t.isBlock && t.routine === pivot.routine).map(t => t.id),
      ...laterBlocks.map(b => b.id),
    ])
    setShiftPlan({ pivot, rest, selected, doneIds, delta, mode:'delta' })
  }

  // Moving a time block's start (e.g. rescheduling "Work" earlier/later): offer
  // to slide the tasks that sit inside the block's window along by the same
  // amount, so a "clock in" scheduled inside Work follows Work instead of being
  // stranded at the old start. `blocks` still reflects the block's OLD window
  // here (the save's state update hasn't flushed yet), so the delta and the
  // tasks-inside lookup are both against the pre-move window.
  const maybePromptBlockShift = (pivotId, newMins) => {
    const block = blocks.find(b => b.id === pivotId)
    if (!block || block.start == null) return
    const delta = newMins - block.start
    if (delta === 0) return
    // Movable tasks whose start currently lands inside the block's window.
    const rest = tasksWithStatus
      .filter(t => t._mins !== null && t._mins >= block.start && t._mins < block.end && !INFLEXIBLE_TAGS.has(t.tag))
      .sort((a, b) => a._mins - b._mins)
    if (!rest.length) return
    const doneIds = new Set(rest.filter(t => isDoneCheck(t.id, t.isCommitment)).map(t => t.id))
    // Everything inside the block is pre-checked — the common case is "the block
    // moved, bring what's in it" — but each row can still be unchecked.
    const selected = new Set(rest.map(t => t.id))
    // A lightweight pivot for the chooser's heading ("You moved 'Work' …").
    const pivot = { id: block.id, title: block.label, label: block.label, _mins: block.start, routine: null }
    setShiftPlan({ pivot, rest, selected, doneIds, delta, mode:'delta' })
  }

  // Move a recurring occurrence's start for just THIS day via the day-local
  // override — the same mechanism the shift chooser uses — so the task keeps
  // repeating and keeps its delete-this/future/all menu instead of being
  // detached into a one-off. Undoable.
  const moveOccurrenceForDay = (id, mins) => {
    const prev = timeOverrides
    const next = { ...prev, [id]: mins }
    setTimeOverrides(next)
    localStorage.setItem('vivian_timeshift_'+dateKey, JSON.stringify(next))
    if (pushUndo) pushUndo('moved the task', () => {
      setTimeOverrides(prev)
      localStorage.setItem('vivian_timeshift_'+dateKey, JSON.stringify(prev))
    })
  }

  // ── Pause & resume (Focus mode) ──────────────────────────────
  // Pausing no longer splits the task or reschedules a remainder — the task
  // keeps its place on the timeline. We just record the wall-clock span it was
  // paused; the pill leaves that span unshaded and resumes shading when you pick
  // the task back up (see taskSegments + the pill render). Pauses are keyed by
  // the day + task id and stored device-local.
  const pauseFocus = (task) => {
    const key = pauseKeyFor(task)
    const cur = focusPauses[key] || { pauses: [], pausedAt: null }
    if (cur.pausedAt) return                       // already paused
    persistFocusPauses({ ...focusPauses, [key]: { pauses: cur.pauses || [], pausedAt: Date.now() } })
  }
  const resumeFocus = (task) => {
    const key = pauseKeyFor(task)
    const cur = focusPauses[key]
    if (!cur || !cur.pausedAt) return              // not paused
    const closed = { from: cur.pausedAt, to: Date.now() }
    persistFocusPauses({ ...focusPauses, [key]: { pauses: [...(cur.pauses || []), closed], pausedAt: null } })
  }

  // ── End now from Focus mode ──────────────────────────────────
  // Finish a task before its window is up: mark it done and, for a real
  // commitment, trim its duration to the time actually spent so the timeline
  // ends the block at "now" instead of its planned end. Any recorded pauses are
  // cleared so the finished pill isn't left with a trailing gap.
  const handleEndNow = (task, elapsedMins) => {
    if (!effectiveDone(task)) syncToggle(task.id, task.label, task.tag, task.isCommitment ? null : dateKey, true)
    if (task.isCommitment && updateCommitment && task._dur) {
      updateCommitment(task.id, { durationMins: Math.max(1, Math.round(elapsedMins || 0)) })
    }
    const key = pauseKeyFor(task)
    if (focusPauses[key]) { const n = { ...focusPauses }; delete n[key]; persistFocusPauses(n) }
    setFocusTask(null)
  }

  // ── Add time from Focus mode ─────────────────────────────────
  // Extend a running task (the "+5m" buttons that appear as it nears the end).
  // `totalExtra` is the cumulative minutes added this session, so setting the
  // duration to the task's original length + that total is race-free even on
  // rapid taps. Only real commitments carry an editable duration.
  const handleExtend = (task, totalExtra) => {
    if (!task.isCommitment || !updateCommitment) return
    const base = task._dur ?? 0
    updateCommitment(task.id, { durationMins: Math.max(1, base + totalExtra) })
  }

  // New items are real commitments dated today, so they show on the Calendar
  // and Week and can carry their own reminder times. (Older local-only custom
  // tasks still render from customTasks for backward compatibility.)
  const handleAdd = (commitment, reminderMins) => {
    if (addCommitment) addCommitment(commitment)
    setItemReminders(commitment.id, reminderMins)
  }

  // ── AI assistant ─────────────────────────────────────────────
  // Snapshot of the user's one-off tasks (commitments) sent to the assistant so
  // it can act on existing ones by id. Recurring tasks aren't editable this way,
  // so they're left out; the assistant creates a new task if it can't find a
  // match here.
  const assistantTasks = useMemo(() => (commitments || []).map(c => ({
    id: c.id,
    title: c.text || '',
    date: c.date || '',
    time: c.time || '',
    done: !!(todos[c.id] || weekState[c.id] || c.done),
    subtasks: Array.isArray(c.subtasks) ? c.subtasks.map(s => ({ text: s.text, done: !!s.done })) : [],
  })), [commitments, todos, weekState])

  // Apply a confirmed plan of assistant actions using the ordinary task ops.
  const applyAssistantActions = (actions) => {
    (actions || []).forEach((a, idx) => {
      if (a.kind === 'create') {
        const base = Date.now() + idx
        const id = 'c-' + base + '-' + Math.random().toString(36).slice(2, 6)
        const subtasks = (a.subtasks || []).map((s, i) => ({ id: 'st-' + base + '-' + i, text: s.text, done: !!s.done }))
        const commitment = {
          id, text: a.title, date: a.date || null, time: a.time || null,
          durationMins: a.durationMins || null,
          cat: (a.categoryIds && a.categoryIds[0]) || null, cats: Array.isArray(a.categoryIds) ? a.categoryIds : [],
          description: a.description || '', subtasks, done: false, person: null, prepMin: null,
          createdAt: new Date().toISOString(),
        }
        if (addCommitment) addCommitment(commitment)
        if (Array.isArray(a.reminders) && a.reminders.length) setItemReminders(id, a.reminders)
      } else if (a.kind === 'event') {
        if (!addEvent || !a.startDate) return
        const allDay = a.allDay !== false
        addEvent({
          id: 'ev-' + (Date.now() + idx) + '-' + Math.random().toString(36).slice(2, 6),
          label: a.title,
          startDate: a.startDate,
          endDate: a.endDate || a.startDate,
          allDay,
          startTime: allDay ? null : (a.startTime || null),
          endTime: allDay ? null : (a.endTime || null),
        })
      } else if (a.kind === 'addSubtasks') {
        const c = (commitments || []).find(x => x.id === a.taskId)
        if (!c || !updateCommitment) return
        const existing = Array.isArray(c.subtasks) ? c.subtasks : []
        const base = Date.now() + idx
        const added = (a.subtasks || []).map((s, i) => ({ id: 'st-' + base + '-' + i + '-' + Math.random().toString(36).slice(2, 5), text: s.text, done: !!s.done }))
        updateCommitment(a.taskId, { subtasks: [...existing, ...added] })
      } else if (a.kind === 'setDone') {
        const c = (commitments || []).find(x => x.id === a.taskId)
        if (c && syncToggle) syncToggle(a.taskId, c.text, c.cat, null, !!a.done)
      } else if (a.kind === 'reschedule') {
        if (!updateCommitment) return
        const changes = {}
        if (a.date) changes.date = a.date
        if (a.time) changes.time = a.time
        if (a.durationMins) changes.durationMins = a.durationMins
        if (Object.keys(changes).length) updateCommitment(a.taskId, changes)
      }
    })
  }
  // Check a subtask off right on the timeline (commitments only). Writes back
  // the whole subtasks array; App auto-completes the parent when all are done.
  const toggleSubtask = (task, subId) => {
    if (!task.isCommitment || !updateCommitment) return
    const subs = (Array.isArray(task.subtasks) ? task.subtasks : []).map(s => s.id === subId ? { ...s, done: !s.done } : s)
    updateCommitment(task.id, { subtasks: subs })
  }
  // Tapping a task opens its full detail sheet (subtasks, color, alerts).
  // Commitments open the editor; template/custom todos fall back to Manage.
  const openTask = (task) => {
    if (task.isCommitment) {
      const c = (commitments || []).find(x => x.id === task.id)
      if (c) { setEditing(c); return }
    }
    // Tapping a recurring occurrence opens the full editor pre-filled from its
    // template. The editor offers "just this event" vs "whole series" (the date
    // tells it which occurrence). Per-day skip/reschedule stay on the ⋯ menu.
    if (task.isRecurring && updateRecurringTask) {
      const tmpl = (recurringTasks || []).find(t => t.id === (task.recurringId || task.id))
      if (tmpl) {
        // If this day carries a local time move (from a one-day nudge or a
        // routine shift), open the editor showing THAT moved time — not the
        // series' original — so re-saving doesn't quietly revert today's move.
        const ov = timeOverrides[tmpl.id]
        const forEdit = ov !== undefined ? { ...tmpl, label: shiftLabelTime(tmpl.label, ov) } : tmpl
        setEditingRecDate(dateKey); setEditingRec(forEdit); return
      }
    }
    setManaging(task)
  }
  // Open a time block (container) for editing/deleting from its band label —
  // a one-off commitment block, or a repeating block's template.
  const openContainer = (id) => {
    const c = (commitments || []).find(x => x.id === id)
    if (c) { setEditing(c); return }
    const tmpl = (recurringTasks || []).find(t => t.id === id)
    if (tmpl && updateRecurringTask) { setEditingRecDate(dateKey); setEditingRec(tmpl) }
  }
  // Unschedule → strip the date/time so it drops off the timeline and returns
  // to Commitments as an unscheduled item (keeps everything else).
  const handleUnschedule = (task) => {
    if (task.isCommitment && updateCommitment) {
      updateCommitment(task.id, { date: null, time: null, durationMins: null })
    }
  }
  const handleSaveEdit = (commitment, reminderMins) => {
    const { id, ...changes } = commitment
    if (updateCommitment) updateCommitment(id, changes)
    setItemReminders(id, reminderMins)
    setEditing(null)
    // If this moved a routine task's time, offer to slide the rest of the
    // routine along. Read against the pre-update timeline, so `id`'s old time is
    // still the baseline for the delta.
    maybePromptShift(id, commitment.time ? hhmmToMins(commitment.time) : null)
  }
  const handleDelete = (task, reason) => {
    if (task.isCommitment && deleteCommitment) {
      // Commitment — remove from commitments array (syncs to Week, Calendar, Commitments tabs)
      deleteCommitment(task.id)
    } else if (task.isRecurring && skipRecurringOccurrence) {
      // Recurring instance — skip just this occurrence (synced → hidden on
      // Today, Week and Calendar everywhere).
      skipRecurringOccurrence(task.id, dateKey)
    } else {
      // Legacy local custom task — add to local deleted list for today only
      const next=[...deleted,task.id]
      setDeleted(next)
      localStorage.setItem('vivian_deleted_'+dateKey, JSON.stringify(next))
    }
    if (appendLog&&reason) appendLog({date:dateKey,dateLabel:todayLabel(),label:`${task.isRecurring?'Skipped':'Deleted'}: ${task.label||task.text} — ${reason}`,tag:'deleted',ts:new Date().toISOString()})
  }
  // Delete the whole recurring series (every occurrence, all days).
  const handleDeleteSeries = (task) => {
    if (task.isRecurring && deleteRecurringTask) deleteRecurringTask(task.id)
  }
  // Delete this occurrence and every future one — cap the template's end date at
  // the day before this occurrence, so today and everything after it drop off
  // while past occurrences stay in the history. (endDate is inclusive.)
  const handleDeleteFuture = (task) => {
    if (!task.isRecurring || !updateRecurringTask) return
    // updateRecurringTask rebuilds the whole DB row from what it's given, so we
    // must pass the full template (not just the changed field) or the other
    // columns get wiped. Spread the existing enriched template + new endDate.
    const tmpl = (recurringTasks || []).find(t => t.id === (task.recurringId || task.id))
    if (!tmpl) return
    const x = new Date(dateKey + 'T12:00:00')
    x.setDate(x.getDate() - 1)
    const endDate = `${x.getFullYear()}-${String(x.getMonth()+1).padStart(2,'0')}-${String(x.getDate()).padStart(2,'0')}`
    updateRecurringTask(tmpl.id, { ...tmpl, endDate })
    if (appendLog) appendLog({ date:dateKey, dateLabel:todayLabel(), label:`Ended recurring: ${task.label||task.text} — this day onward`, tag:'deleted', ts:new Date().toISOString() })
  }
  const handleReschedule = (task, date, time) => {
    if (date === dateKey) {
      // Same-day — never delete the task. Apply time override if a time was given.
      if (time) {
        const [h, m] = time.split(':').map(Number)
        const newMins = h * 60 + m
        const hadOverride = task.id in timeOverrides
        const prevMins = timeOverrides[task.id]
        setTimeOverrides(prev => {
          const next = { ...prev, [task.id]: newMins }
          localStorage.setItem('vivian_timeshift_' + dateKey, JSON.stringify(next))
          return next
        })
        if (pushUndo) pushUndo('moved “' + (task.title || stripTimePrefix(task.label)) + '”', () => {
          setTimeOverrides(prev => {
            const next = { ...prev }
            if (hadOverride) next[task.id] = prevMins; else delete next[task.id]
            localStorage.setItem('vivian_timeshift_' + dateKey, JSON.stringify(next))
            return next
          })
        })
      }
    } else {
      // Different day — remove from today, land in Commitments on the target date
      handleDelete(task, null)
      if (addCommitment) {
        addCommitment({
          id: 'rescheduled-' + task.id + '-' + Date.now(),
          text: task.label.replace(/^~?\d{1,2}:\d{2}\s*(?:AM|PM)\s*(?:—\s*)?/i, '').trim() || task.label,
          date, cat: task.tag, done: false,
          note: 'Rescheduled from ' + dateKey,
          ...(time ? { time } : {}),
        })
      }
    }
    if (appendLog) appendLog({ date:dateKey, dateLabel:todayLabel(), label:'Rescheduled: ' + task.label + ' → ' + date + (time ? ' @ ' + fmt12(time) : ''), tag:'rescheduled', ts:new Date().toISOString() })
  }

  // Show the wellness rail for today and any past day (a read-only record of
  // what was tracked then); future days have nothing to show, so no rail.
  const showRail = viewDate <= todayKey()
  return (
    <div className={showRail ? 'today-root has-rail' : 'today-root'}>
      {/* The wellness day-rail: today, the mind blob rides the current time down
          the left edge and logs new moments; on a past day it stays as the
          record of that day's mood moments and status effects. */}
      {showRail && (
        <DayRail
          checkins={wlCheckins} persistCheckins={persistWlCheckins}
          effects={wlEffects} persistEffects={persistWlEffects}
          episodes={wlEpisodes} persistEpisodes={persistWlEpisodes}
          game={wlGame} persistGame={persistWlGame}
          emotionPrefs={wlEmotions} persistEmotionPrefs={persistWlEmotions}
          dateKey={viewDate} isToday={isToday} />
      )}
      {/* Structured-style header: big date + week strip + progress bar */}
      <WeekStrip
        viewDate={viewDate} setViewDate={setViewDate}
        commitments={commitments} categories={categories}
        doneCount={doneCount} total={tasksWithStatus.length}
        dayProgress={dayProgress} isToday={isToday}
        summary={summary} todos={todos}
        recurringTasks={recurringTasks} recurringExceptions={recurringExceptions} />

      {/* Subscribed-calendar visibility toggles — hide/show each imported feed
          across the whole app right from the day view. */}
      <CalendarLegend calendars={externalCalendars} onToggle={toggleCalendar} />

      {/* Imported events for this day, as unscheduled tasks with recommended
          times — tick them off, or add them into your own schedule. */}
      <ImportedCalendarCard rows={importedRows} adoptions={importedAdoptions}
        isDone={isImportedDone} onToggle={onToggleImported} onAdopt={onAdoptImported}
        dayLabel={isToday ? 'today' : new Date(dateKey+'T12:00:00').toLocaleDateString('en-US',{weekday:'long',month:'short',day:'numeric'})} />

      <div className={hasAnytime ? 'today-split' : undefined}>
      {/* Unscheduled tasks — top of the day on mobile, sidebar on desktop. */}
      {hasAnytime && (
        <div className="today-split-aside">
          <AnytimeCard tasks={anytimeTasks} categories={categories}
            isDoneOf={effectiveDone}
            onToggle={(t)=>syncToggle(t.id,t.label,t.tag,t.isCommitment?null:dateKey, !effectiveDone(t))}
            onOpen={openTask} onManage={setManaging} />
        </div>
      )}
      <div className={hasAnytime ? 'today-split-main' : undefined}>
      {/* Timeline */}
      {renderTimed.length===0 && blockSegments.length===0 ? (
        hasAnytime ? null : (
        <div style={{textAlign:'center',padding:'40px 20px',color:'var(--muted)',fontSize:13}}>
          No schedule yet.{' '}
          <button onClick={()=>setAddingTask(true)} style={{color:'var(--teal)',background:'none',border:'none',cursor:'pointer',fontSize:13,fontFamily:'DM Sans,sans-serif',textDecoration:'underline'}}>Add a task</button>
          {' '}or set up recurring tasks in the Recurring tab.
        </div>
        )
      ) : (
        (() => {
        // How many finished tasks each routine has, for the collapse summary.
        const doneRoutineCounts = {}
        tasksWithStatus.forEach(t => { if (t.routine && routineIds.has(t.routine) && t._status==='past') doneRoutineCounts[t.routine] = (doneRoutineCounts[t.routine]||0)+1 })
        const emittedCollapse = {}  // one summary/header per routine, per render
        const emittedBlocks = new Set()   // block band segments already placed
        // The "now" line is emitted exactly once. When it falls inside a block's
        // empty band we split the band and drop it in there (so "now" sits at its
        // true time inside the block, not after it); otherwise it's placed
        // between tasks (below).
        const wantNow = isToday && !hasCurrent
        const nowState = { done: false }
        // The time span of each collapsed routine, so the summary row advances
        // the cursor over its whole window (and a gap can open before/after it).
        const routineSpans = {}
        renderTasks.forEach(t => {
          if (t.routine && routineIds.has(t.routine) && t._mins != null) {
            const e = (t._time && t._dur) ? hhmmToMins(t._time)+t._dur : t._mins
            const s = routineSpans[t.routine] || { start: Infinity, end: -Infinity }
            routineSpans[t.routine] = { start: Math.min(s.start, t._mins), end: Math.max(s.end, e) }
          }
        })
        // A single moving "cursor" tracks where on the clock the last emitted row
        // ended, so a gap opens for ANY unscheduled stretch — between two tasks,
        // between a routine and a block, or after a block before the next thing —
        // not just between adjacent tasks. `tint` keeps a gap inside a block on
        // that block's film; boundary gaps between regions stay plain.
        const cur = { end: null, color: null, band: null }
        const maybeGap = (startMins, nextColor, tint, upcoming = null) => {
          if (cur.end == null || startMins == null) return null
          const g = startMins - cur.end
          if (g < 5) return null
          // Capture this gap's real clock window so its "Add Task" can pre-fill a
          // task that fills the break (minus a transition on each side).
          const gapStart = cur.end, gapEnd = startMins
          // Where "now" sits in the break: it counts down while you're in it and
          // becomes "took a break" once it's gone by. A wholly-past day reads as
          // past; other days stay future (no live clock to count against).
          let phase = 'future', remaining = g
          if (isToday) {
            if (now >= gapEnd) phase = 'past'
            else if (now >= gapStart) { phase = 'active'; remaining = gapEnd - now }
          } else if (isPastDay) {
            phase = 'past'
          }
          // While the break is live, let the upcoming task be pulled forward and
          // started now — but only a real, movable, still-open timed task.
          const canStart = upcoming && upcoming._mins != null && !INFLEXIBLE_TAGS.has(upcoming.tag) && !effectiveDone(upcoming)
          return <GapRow key={'gap-'+cur.end+'-'+startMins} mins={g} phase={phase} remaining={remaining}
            prevColor={cur.color} nextColor={nextColor}
            routineTint={tint || null} routineOpacity={tint ? BLOCK_FILM_OPACITY : 0.5} onAdd={()=>addInGap(gapStart, gapEnd)}
            onStartNow={canStart ? ()=>handleShiftToNow(upcoming) : null}
            startLabel={upcoming ? (upcoming.title || stripTimePrefix(upcoming.label)) : ''} />
        }
        const advance = (endMins, color, band=null) => {
          if (endMins != null && (cur.end == null || endMins >= cur.end)) { cur.end = endMins; cur.color = color || cur.color }
          cur.band = band
        }
        // Render one block segment, splitting it around "now" when the current
        // time lands inside it so the now-line reads at the right height. A gap
        // opens before the block if the day was idle up to its start.
        const renderSeg = (s) => {
          const b = blocks.find(x=>x.id===s.bid)
          const bandId = 'blk-'+s.bid
          const bb = (seg, controls) => <BlockBand key={'seg-'+seg.id} seg={seg}
            onEdit={()=>openContainer(s.bid)}
            onAdd={b ? ()=>addInBlock(b, seg.start) : undefined}
            onCollapse={controls ? ()=>toggleBlockCollapsed(s.bid, !!seg.collapsed) : undefined} />
          // Gap before this segment — only for a block's true top (roundTop),
          // since head→task→tail within one block are contiguous by construction.
          const gapEl = s.roundTop ? maybeGap(s.start, s.color, null) : null
          const out = gapEl ? [gapEl] : []
          if (wantNow && !nowState.done && !s.collapsed && now > s.start && now < s.end) {
            nowState.done = true
            out.push(
              bb({ ...s, id:s.id+':nt', end:now, roundBottom:false }, true),
              <NowMarker key={'now-'+s.id} now={now} bandTint={s.color} bandOpacity={BLOCK_FILM_OPACITY} />,
              bb({ ...s, id:s.id+':nb', start:now, roundTop:false, label:null }, false),
            )
          } else {
            out.push(bb(s, true))
          }
          advance(s.end, s.color, bandId)
          return out
        }
        // Block band segments starting before this task's time, not yet placed —
        // rendered just before it (they sit in the block's empty gaps). Strict
        // `<` so a tail segment starting exactly at a task's time (a task with no
        // duration) renders AFTER that task, not before it.
        const bandsBefore = (task) => {
          const tm = task._mins ?? Infinity
          const out = []
          for (const s of blockSegments) {
            if (emittedBlocks.has(s.id) || s.start >= tm) continue
            emittedBlocks.add(s.id)
            out.push(...renderSeg(s))
          }
          return out
        }
        return (
        <div style={{paddingBottom:8}}>
          {renderTimed.map((task,i)=>{
            const before = bandsBefore(task)   // any empty time-block bands due before this row
            // Finished routine tasks collapse into a single summary row unless
            // their routine has been expanded. The first one emits the row (or
            // the expanded header); the rest are hidden while collapsed.
            const isDoneRoutine = task.routine && routineIds.has(task.routine) && task._status==='past'
            if (isDoneRoutine) {
              const r = routines.find(x=>x.id===task.routine)
              const isExp = !!expandedRoutines[task.routine]
              const firstOfRoutine = !emittedCollapse[task.routine]
              const span = routineSpans[task.routine]
              // A gap opens before the routine if the day was idle up to it.
              const rtGap = firstOfRoutine && span ? maybeGap(span.start, r?.tint || null, null) : null
              const header = firstOfRoutine
                ? (emittedCollapse[task.routine] = true,
                   <RoutineCollapseRow key={'rc-'+task.routine} routine={r} count={doneRoutineCounts[task.routine]} expanded={isExp}
                     onToggle={()=>setExpandedRoutines(p=>({...p,[task.routine]:!p[task.routine]}))} />)
                : null
              if (!isExp) {
                // Collapsed: advance the cursor over the whole routine window once.
                if (firstOfRoutine && span) advance(span.end, r?.tint || null, 'rt-'+task.routine)
                return [...before, rtGap, header]
              }
              // Expanded: advance per task; only the first shows the leading gap.
              const tEnd = (task._time && task._dur) ? hhmmToMins(task._time)+task._dur : task._mins
              advance(tEnd, r?.tint || null, 'rt-'+task.routine)
              return [...before, rtGap, (
                <div key={task.id}>
                  {header}
                  <TimelineBlock
                    task={task} categories={categories} status={task._status} now={now}
                    routineTint={routines.find(x=>x.id===task.routine)?.tint || null} filmTop filmBottom
                    isDone dateKey={dateKey}
                    onToggle={()=>syncToggle(task.id,task.label,task.tag,task.isCommitment?null:dateKey, !effectiveDone(task))}
                    onManage={()=>setManaging(task)} onOpen={()=>openTask(task)}
                    onShiftToNow={()=>handleShiftToNow(task)} onFocus={()=>setFocusTask(task)}
                    onToggleSub={(sid)=>toggleSubtask(task, sid)} />
                </div>
              )]
            }
            // Free-time gap between the previous task's end and this one's start.
            const prev = renderTimed[i-1]
            const next = renderTimed[i+1]
            const colorOf = t => t && (t.color || (categories||[]).find(x=>x.id===t.tag)?.color || TAG_COLORS[t.tag] || null)
            // A task's "band" is its containing time block (label + film), else
            // its routine group. Consecutive tasks in the SAME band read as one
            // continuous wash; the band label shows once at its top.
            const myBand = bandOf(task), prevBand = bandOf(prev), nextBand = bandOf(next)
            const myTint = myBand?.tint || null
            const prevSameRoutine = !!(myBand && prevBand && prevBand.id === myBand.id)
            const nextSameRoutine = !!(myBand && nextBand && nextBand.id === myBand.id)
            // Join the task film to a block's head/tail segments: the first task
            // in a block that has a head segment drops its rounded top (and its
            // label, which the segment shows); the last drops its rounded bottom.
            const inBlockId = myBand?.id?.startsWith('blk-') ? myBand.id.slice(4) : null
            const inBlockBand = inBlockId ? blocks.find(b=>b.id===inBlockId) : null
            const isFirstInBand = !!myBand && !prevSameRoutine
            const isLastInBand  = !!myBand && !nextSameRoutine
            const joinHead = !!(inBlockId && isFirstInBand && blockHeadIds.has(inBlockId))
            const joinTail = !!(inBlockId && isLastInBand  && blockTailIds.has(inBlockId))
            // Free time before this task, measured from wherever the day last
            // ended (a task, a routine, or a block) — tinted with the block's
            // film only when the gap sits inside that same block.
            const sameBandAsCursor = !!(myBand && cur.band === myBand.id)
            const gapEl = maybeGap(task._mins, colorOf(task), sameBandAsCursor ? myTint : null, task)
            const tEnd = (task._time && task._dur) ? (hhmmToMins(task._time)+task._dur) : task._mins
            advance(tEnd, colorOf(task), myBand?.id || null)
            // Only drop the between-tasks now-line if a band split didn't already
            // place it (that happens when "now" falls inside a block's gap).
            const emitNow = wantNow && !nowState.done && i===nowInsertIdx
            if (emitNow) nowState.done = true
            return [...before, (
              <div key={task.id}>
                {emitNow&&<NowMarker now={now} bandTint={(myBand && (joinHead || prevSameRoutine)) ? myTint : null} bandOpacity={inBlockId ? BLOCK_FILM_OPACITY : 0.5}/>}
                {gapEl}
                <TimelineBlock
                  task={task} categories={categories} status={task._status} now={now}
                  routineTint={myTint} tintOpacity={inBlockId ? BLOCK_FILM_OPACITY : 0.5}
                  filmTop={!prevSameRoutine && !joinHead} filmBottom={!nextSameRoutine && !joinTail}
                  bandLabel={(isFirstInBand && !joinHead) ? (myBand?.label || null) : null}
                  bandIcon={inBlockBand?.icon || null}
                  onBandLabel={inBlockId ? () => openContainer(inBlockId) : null}
                  onBandCollapse={(inBlockId && isFirstInBand && !joinHead) ? () => toggleBlockCollapsed(inBlockId, false) : null}
                  prevColor={colorOf(prev)} nextColor={colorOf(next)}
                  isDone={task._status==='past'}
                  elapsed={isToday && task._mins!==null && task._mins<=now}
                  dateKey={dateKey}
                  pauseData={focusPauses[`${dateKey}:${task.id}`] || null}
                  offerStartNow={task.id===nextUpcomingId}
                  onToggle={()=>syncToggle(task.id,task.label,task.tag,task.isCommitment?null:dateKey, !effectiveDone(task))}
                  onManage={()=>setManaging(task)}
                  onOpen={()=>openTask(task)}
                  onShiftToNow={()=>handleShiftToNow(task)}
                  onFocus={()=>setFocusTask(task)}
                  onToggleSub={(sid)=>toggleSubtask(task, sid)}
                />
              </div>
            )]
          })}
          {/* Block segments after the last task (or the whole day if task-less). */}
          {blockSegments.filter(s=>!emittedBlocks.has(s.id)).flatMap(s=>{ emittedBlocks.add(s.id); return renderSeg(s) })}
          {wantNow && !nowState.done && <NowMarker now={now}/>}
        </div>
        )
        })()
      )}

      </div>{/* /today-split-main */}
      </div>{/* /today-split */}

      {/* FAB — position lives in CSS (.today-fab) so it can lift above the
          mobile bottom bar; inline styles would otherwise override it. */}
      <button onClick={()=>setAddingTask(true)} className="today-fab"
        style={{position:'fixed',width:52,height:52,borderRadius:'50%',border:'none',
          background:'var(--glimmer, var(--teal))',color:'var(--on-accent)',fontSize:24,cursor:'pointer',
          boxShadow:'0 4px 20px rgba(0,0,0,.25)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:100}}>
        +
      </button>
      {/* AI assistant button, stacked above the + FAB. Only shown when the AI
          function can be reached (Supabase configured). */}
      {aiScheduleAvailable && (
        <button onClick={()=>setPasterOpen(true)} className="today-fab-ai" title="AI assistant — type it or add a photo" aria-label="AI assistant"
          style={{position:'fixed',width:44,height:44,borderRadius:'50%',border:'none',
            background:'linear-gradient(135deg,#7BBFD4,#C8BFDF)',color:'#17313f',fontSize:19,cursor:'pointer',
            boxShadow:'0 4px 16px rgba(0,0,0,.22)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:100}}>
          ✨
        </button>
      )}

      {focusTask&&<FocusMode
        title={focusTask.title || stripTimePrefix(focusTask.label)}
        icon={focusTask.icon || (categories||[]).find(x=>x.id===focusTask.tag)?.icon || ''}
        color={focusTask.color || (categories||[]).find(x=>x.id===focusTask.tag)?.color || TAG_COLORS[focusTask.tag] || 'var(--teal)'}
        time={focusTask._time}
        durationMins={focusTask._dur}
        pauses={(focusPauses[pauseKeyFor(focusTask)]||{}).pauses || []}
        pausedAt={(focusPauses[pauseKeyFor(focusTask)]||{}).pausedAt || null}
        onDone={()=>{ if(!effectiveDone(focusTask)) syncToggle(focusTask.id, focusTask.label, focusTask.tag, focusTask.isCommitment?null:dateKey, true); setFocusTask(null) }}
        onPause={()=>pauseFocus(focusTask)}
        onResume={()=>resumeFocus(focusTask)}
        onExtend={focusTask.isCommitment ? (mins)=>handleExtend(focusTask, mins) : null}
        onEndNow={({elapsedMins})=>handleEndNow(focusTask, elapsedMins)}
        onClose={()=>setFocusTask(null)} />}
      {shiftPlan&&<ShiftChooser plan={shiftPlan} routines={routines}
        onApply={(ids)=>{ shiftPlan.mode==='delta' ? applyTimeShift(shiftPlan.pivot, shiftPlan.delta, ids) : applyShift(shiftPlan.pivot, ids); setShiftPlan(null) }}
        onCancel={()=>setShiftPlan(null)}/>}
      {shiftResult&&<ShiftToast result={shiftResult} onClose={()=>setShiftResult(null)}/>}
      {addingTask&&<AddItemModal presetDate={dateKey} presetTime={addPreset?.time||''} presetDur={addPreset?.dur||null} presetCat={addPreset?.cat||''} categories={categories} routines={routines} templates={taskTemplates} labelModel={labelModel} onSave={handleAdd} onSaveRecurring={addRecurringTask} onClose={()=>{ setAddingTask(false); setAddPreset(null) }} title="Add to Today"/>}
      {/* AI assistant: command → plan → confirm → apply. */}
      {pasterOpen&&<AiAssistant categories={categories} tasks={assistantTasks}
        onApply={applyAssistantActions} onClose={()=>setPasterOpen(false)} />}
      {editing&&<AddItemModal existing={editing} categories={categories} routines={routines} onSave={handleSaveEdit}
        onSaveRecurring={addRecurringTask}
        onDelete={c=>deleteCommitment&&deleteCommitment(c.id)}
        onDuplicate={c=>addCommitment&&addCommitment({ ...c, id:'c-'+Date.now(), text:(c.text||'')+' (copy)', done:false, createdAt:new Date().toISOString() })}
        onMoveToThoughts={c=>moveCommitmentToThoughts&&moveCommitmentToThoughts(c)}
        onClose={()=>setEditing(null)} title="Edit task"/>}
      {editingRec&&<AddItemModal existingRecurring={editingRec} categories={categories} routines={routines}
        occurrenceDate={editingRecDate}
        onSaveOccurrence={(origDate, occ, reminderMins)=>{
          const pivotId = editingRec.id
          const newMins = occ.time ? hhmmToMins(occ.time) : null
          // Time-only change that stays on the same day → just move it for today
          // and keep it in its series (so it still repeats and keeps its
          // delete-this/future/all menu), instead of detaching it into a one-off.
          // A day change (occ.date !== origDate) always detaches so it can land
          // on the new day and vacate the old one.
          if (occ.date === origDate && origDate === dateKey && newMins !== null && occurrenceOnlyMovedTime(editingRec, occ, reminderMins)) {
            moveOccurrenceForDay(pivotId, newMins)
            setEditingRec(null); setEditingRecDate(null)
            maybePromptShift(pivotId, newMins)
            return
          }
          // A real per-occurrence content edit (new title, subtasks, per-day
          // alert, moved to another day, …) detaches: hide the series on its
          // ORIGINAL date and add a one-off commitment carrying the edits, on
          // whatever day it now lands (occ.date). Other days stay as-is.
          skipRecurringOccurrence && skipRecurringOccurrence(editingRec.id, origDate)
          // If it moved onto a day the series already lands on, skip that day's
          // instance too, so the moved copy doesn't sit next to a duplicate.
          if (occ.date !== origDate && skipRecurringOccurrence &&
              recurringActiveOn(editingRec, occ.date) &&
              !(recurringExceptions || {})[occKey(editingRec.id, occ.date)]) {
            skipRecurringOccurrence(editingRec.id, occ.date)
          }
          if (addCommitment) addCommitment(occ)
          setItemReminders(occ.id, reminderMins)
          setEditingRec(null); setEditingRecDate(null)
          maybePromptShift(pivotId, newMins)
        }}
        onSaveFuture={(origDate, newSeries, reminderMins)=>{
          // Split the series at this occurrence: end the old template the day
          // before, and begin the edited one from here. Past days keep the old
          // definition, so a change tonight never rewrites the showers you
          // already did.
          const tmpl=(recurringTasks||[]).find(t=>t.id===editingRec.id)
          if (tmpl && updateRecurringTask) {
            const x=new Date(origDate+'T12:00:00'); x.setDate(x.getDate()-1)
            const endDate=`${x.getFullYear()}-${String(x.getMonth()+1).padStart(2,'0')}-${String(x.getDate()).padStart(2,'0')}`
            updateRecurringTask(tmpl.id, { ...tmpl, endDate })
          }
          addRecurringTask && addRecurringTask(newSeries)
          if (reminderMins != null) setItemReminders(newSeries.id, reminderMins)
          setEditingRec(null); setEditingRecDate(null)
          maybePromptShift(newSeries.id, parseTimeMins(newSeries.label))
        }}
        onSaveRecurring={t=>{ const pivotId=t.id; updateRecurringTask&&updateRecurringTask(t.id,t); setEditingRec(null); setEditingRecDate(null); maybePromptShift(pivotId, parseTimeMins(t.label)) }}
        onDeleteOccurrence={date=>{ skipRecurringOccurrence&&skipRecurringOccurrence(editingRec.id, date); setEditingRec(null); setEditingRecDate(null) }}
        onDeleteFuture={date=>{
          // End the series the day before this occurrence — today onward drops
          // off, past days stay in history. (endDate is inclusive.)
          const tmpl=(recurringTasks||[]).find(t=>t.id===editingRec.id)
          if (tmpl && updateRecurringTask) {
            const x=new Date(date+'T12:00:00'); x.setDate(x.getDate()-1)
            const endDate=`${x.getFullYear()}-${String(x.getMonth()+1).padStart(2,'0')}-${String(x.getDate()).padStart(2,'0')}`
            updateRecurringTask(tmpl.id, { ...tmpl, endDate })
          }
          setEditingRec(null); setEditingRecDate(null)
        }}
        onDelete={t=>{ deleteRecurringTask&&deleteRecurringTask(t.id); setEditingRec(null); setEditingRecDate(null) }}
        onClose={()=>{ setEditingRec(null); setEditingRecDate(null) }} title="Edit recurring task"/>}
      {managing&&<ManageModal task={managing} dateKey={dateKey} onClose={()=>setManaging(null)} onDelete={handleDelete} onReschedule={handleReschedule} onUnschedule={handleUnschedule} onDeleteSeries={handleDeleteSeries} onDeleteFuture={handleDeleteFuture} scheduled={scheduled}/>}
    </div>
  )
}
