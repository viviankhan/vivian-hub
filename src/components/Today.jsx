import { useState, useEffect } from 'react'
import { recurringOccurrencesForDate, taskProgress } from '../lib/occurrences.js'
import { findSlots } from '../lib/scheduler.js'
import { getRoutines } from '../lib/storage.js'
import { normalizeRoutineItems, sortByTime, to12 } from './Routines.jsx'
import { Icon } from './IconPicker.jsx'
import { iconColorOn, suggestGlyph } from '../lib/glyphs.jsx'
import { bloomBurst } from '../lib/bloom.js'
import AddItemModal from './AddItemModal.jsx'
import FocusMode from './FocusMode.jsx'
import DateField from './DateField.jsx'
import TimeField from './TimeField.jsx'
import { setItemReminders } from '../lib/notifications.js'

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

// ── Routine card — unified morning/night, explicit per-item times ──
function RoutineCard({ title, icon, items, prefix, open, setOpen, routineDone, toggleRoutine }) {
  const sorted = sortByTime(items)
  const doneCount = sorted.filter(item => routineDone[prefix+'-'+item.id]).length
  const withT = sorted.filter(i => i.time)
  const range = withT.length
    ? (to12(withT[0].time) === to12(withT[withT.length-1].time)
        ? to12(withT[0].time)
        : `${to12(withT[0].time)} – ${to12(withT[withT.length-1].time)}`)
    : ''
  return (
    <div className="routine-card" style={{background:'white',borderRadius:12,border:'1px solid var(--border)',marginBottom:20,overflow:'hidden'}}>
      <div onClick={()=>setOpen(o=>!o)}
        style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'12px 16px',cursor:'pointer',userSelect:'none'}}>
        <div style={{display:'flex',alignItems:'center',gap:10}}>
          <span style={{display:'flex',color:'var(--teal)'}}><Icon value={icon} size={20} /></span>
          <div>
            <div className="serif" style={{fontSize:15,fontWeight:600}}>{title}</div>
            <div style={{fontSize:11,color:'var(--muted)',marginTop:1}}>
              {range && `${range} · `}{doneCount}/{sorted.length} done · {open?'collapse':'expand'}
            </div>
          </div>
        </div>
        <span style={{color:'var(--muted)',fontSize:13,transform:open?'rotate(180deg)':'',transition:'transform .2s'}}>▾</span>
      </div>
      {open&&(
        <div onClick={e=>e.stopPropagation()} style={{borderTop:'1px solid var(--border)',padding:'6px 16px 14px'}}>
          {sorted.length===0 && (
            <div style={{fontSize:12,color:'var(--muted)',padding:'10px 0',fontStyle:'italic'}}>
              No items yet — add them in Settings ⚙️ → Routines.
            </div>
          )}
          {sorted.map(item=>{
            const key=prefix+'-'+item.id
            const done=!!routineDone[key]
            return (
              <div key={item.id}
                style={{display:'flex',gap:12,alignItems:'flex-start',padding:'10px 0',borderBottom:'1px solid #F5F3EF',opacity:done?.4:1,transition:'opacity .2s'}}>
                <div onClick={()=>toggleRoutine(key)}
                  style={{width:20,height:20,borderRadius:'50%',flexShrink:0,marginTop:2,cursor:'pointer',
                    border:done?'none':`2px solid ${item.color||'#D1D5DB'}`, background:done?(item.color||'#52B788'):'transparent',
                    display:'flex',alignItems:'center',justifyContent:'center',transition:'all .2s'}}>
                  {done&&<span style={{color:'white',fontSize:11,fontWeight:700}}>✓</span>}
                </div>
                <div style={{minWidth:24,textAlign:'center'}}><Icon value={item.icon} size={18} /></div>
                <div style={{flex:1}}>
                  <div style={{display:'flex',alignItems:'baseline',gap:8,flexWrap:'wrap'}}>
                    {item.time && <span style={{fontSize:10,color:item.color||'var(--muted)',fontWeight:600}}>{to12(item.time)}</span>}
                    <span className="serif" style={{fontSize:14,color:'var(--text)',fontWeight:600,textDecoration:done?'line-through':'none'}}>{item.label}</span>
                  </div>
                  {item.detail && <div style={{fontSize:11,color:'var(--muted)',marginTop:2,lineHeight:1.4}}>{item.detail}</div>}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Manage modal with smart scheduling ────────────────────────
function ManageModal({ task, dateKey, onClose, onDelete, onReschedule, onUnschedule, onDeleteSeries, scheduled }) {
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
            <button onClick={()=>setView('delete')} style={{padding:'10px',borderRadius:10,border:'1px solid #FECACA',background:'#FFF5F5',cursor:'pointer',textAlign:'left',fontSize:13,color:'#991B1B',fontFamily:'DM Sans,sans-serif'}}>{isRec ? '🗓️ Skip just this day' : '🗑️ Delete & log why'}</button>
            {isRec && onDeleteSeries && (
              <button onClick={()=>{onDeleteSeries(task);onClose()}} style={{padding:'10px',borderRadius:10,border:'1px solid #FECACA',background:'#FFF5F5',cursor:'pointer',textAlign:'left',fontSize:13,color:'#991B1B',fontFamily:'DM Sans,sans-serif'}}>🔁 Delete every occurrence</button>
            )}
          </div>
          <button onClick={onClose} style={{marginTop:10,width:'100%',padding:'8px',borderRadius:10,border:'1px solid var(--border)',background:'white',color:'var(--muted)',cursor:'pointer',fontSize:12,fontFamily:'DM Sans,sans-serif'}}>Cancel</button>
        </>}
        {view==='delete'&&<>
          <div className="serif" style={{fontSize:17,fontWeight:600,color:'#991B1B',marginBottom:6}}>{isRec ? 'Skip this day' : 'Delete Task'}</div>
          {isRec && <div style={{fontSize:12,color:'var(--muted)',marginBottom:10,lineHeight:1.5}}>Removes just this one occurrence — the recurring task keeps its other days. Use “Delete every occurrence” to remove the whole series.</div>}
          <textarea value={reason} onChange={e=>setReason(e.target.value)} placeholder="Reason (optional)…" rows={3} style={{...s,marginBottom:12,resize:'none',lineHeight:1.5}}/>
          <div style={{display:'flex',gap:8}}>
            <button onClick={()=>{onDelete(task,reason);onClose()}} style={{flex:1,padding:'10px',borderRadius:10,border:'none',background:'#EF4444',color:'white',cursor:'pointer',fontFamily:'DM Sans,sans-serif',fontWeight:600,fontSize:13}}>{isRec ? 'Skip this day' : 'Delete'}{reason?' & Log':''}</button>
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
// Lets you pick which later tasks get pushed down to make room (or all).
function ShiftChooser({ plan, onApply, onCancel }) {
  const [sel, setSel] = useState(() => new Set(plan.selected))
  const ids = plan.rest.map(t => t.id)
  const allOn = ids.length > 0 && ids.every(id => sel.has(id))
  const toggle = (id) => setSel(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
  const pivotTitle = plan.pivot.title || stripTimePrefix(plan.pivot.label)
  return (
    <div onClick={onCancel} style={{position:'fixed',inset:0,background:'rgba(0,0,0,.5)',zIndex:610,display:'flex',alignItems:'center',justifyContent:'center',padding:16}}>
      <div onClick={e=>e.stopPropagation()} style={{background:'white',borderRadius:18,width:'100%',maxWidth:400,maxHeight:'86vh',overflowY:'auto',boxShadow:'0 24px 64px rgba(0,0,0,.3)',padding:20}}>
        <div className="serif" style={{fontSize:18,fontWeight:600,color:'var(--text)',marginBottom:3}}>Start “{pivotTitle}” now</div>
        <div style={{fontSize:12.5,color:'var(--muted)',marginBottom:14}}>Choose which later tasks to push down to make room. Unchecked tasks stay where they are.</div>
        <button onClick={()=>setSel(allOn ? new Set() : new Set(ids))}
          style={{fontSize:11,padding:'5px 12px',borderRadius:16,border:'1px solid var(--border)',background:'white',color:'var(--teal)',fontWeight:600,cursor:'pointer',fontFamily:'DM Sans,sans-serif',marginBottom:10}}>
          {allOn ? 'Deselect all' : 'Select all'}
        </button>
        <div style={{display:'flex',flexDirection:'column',gap:2,marginBottom:16}}>
          {plan.rest.map(t=>{
            const on = sel.has(t.id)
            const title = t.title || stripTimePrefix(t.label)
            return (
              <div key={t.id} onClick={()=>toggle(t.id)}
                style={{display:'flex',alignItems:'center',gap:11,padding:'9px 4px',cursor:'pointer'}}>
                <div style={{width:20,height:20,borderRadius:6,flexShrink:0,border:on?'none':'2px solid #CDD3DA',background:on?'var(--teal)':'transparent',display:'flex',alignItems:'center',justifyContent:'center'}}>
                  {on && <span style={{color:'white',fontSize:12,fontWeight:700}}>✓</span>}
                </div>
                <span style={{fontSize:12,color:'var(--muted)',minWidth:64,fontVariantNumeric:'tabular-nums'}}>{fmtTimeLabel(t._mins)}</span>
                <span style={{flex:1,minWidth:0,fontSize:14,color:'var(--text)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{title}</span>
              </div>
            )
          })}
        </div>
        <div style={{display:'flex',gap:8}}>
          <button onClick={()=>onApply([...sel])}
            style={{flex:1,padding:'12px',borderRadius:12,border:'none',background:'var(--forest)',color:'var(--green-light)',fontWeight:700,fontSize:14,cursor:'pointer',fontFamily:'DM Sans,sans-serif'}}>
            {sel.size ? `Start now · push ${sel.size}` : 'Start now · push none'}
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
function hhmmToMins(t) {
  if (!t) return null
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}

// Vertical pixels per minute — shared by task blocks and gaps so the whole
// day reads at one consistent scale (a 2-hour task is twice a 1-hour task).
// Steep enough that a 30-min task is visibly shorter than a 1-hour one.
const PX_PER_MIN = 2.4

// A "free time" gap between two timed tasks, with a quick Add Task. Its height
// grows with the length of the gap, so the day reads at relative scale.
// A standalone band for a time block that has no tasks inside it yet, so an
// empty container (e.g. "WORK 9:00 AM – 5:00 PM") still shows on the timeline.
function BlockBand({ block, onOpen }) {
  const dur = Math.max(0, block.end - block.start)
  const h = Math.min(150, Math.max(46, Math.round(dur * PX_PER_MIN)))
  return (
    <div style={{ display:'flex', gap:0, minHeight:h }}>
      <div style={{ width:52, flexShrink:0, paddingTop:12, textAlign:'right', paddingRight:10 }}>
        <span style={{ fontSize:11, color:'var(--muted)', fontWeight:500, whiteSpace:'nowrap' }}>{fmtTimeLabel(block.start)}</span>
      </div>
      <div style={{ width:52, flexShrink:0 }} />
      <div style={{ flex:1, minWidth:0, padding:'4px 0 8px' }}>
        <button type="button" onClick={onOpen} title="Edit time block"
          style={{ width:'100%', minHeight:h-12, border:`1.5px dashed ${block.color}`, borderRadius:16, background:`${block.color}44`,
            cursor:'pointer', display:'flex', alignItems:'flex-start', gap:8, padding:'10px 12px', fontFamily:'DM Sans,sans-serif', textAlign:'left' }}>
          <span style={{ fontSize:9, fontWeight:800, letterSpacing:.9, textTransform:'uppercase', color:'#39434F', background:'rgba(255,255,255,.78)', padding:'2px 8px', borderRadius:9 }}>{block.label || 'Block'}</span>
          <span style={{ fontSize:11, color:'#48535F', fontWeight:600, marginTop:1 }}>{rangeLabel(block.start, block.end)}</span>
        </button>
      </div>
    </div>
  )
}

function GapRow({ mins, prevColor, nextColor, routineTint, onAdd }) {
  const h = Math.min(150, Math.max(34, Math.round(mins * PX_PER_MIN)))
  const dur = <b style={{ color:'var(--teal)' }}>{fmtMins(mins).trim()}</b>
  // Structured-style copy: a long empty stretch reads as opportunity, a
  // shorter one as breathing room before the next thing.
  const body = mins >= 120
    ? <>Long stretch — {dur} of potential!</>
    : <>Plan or chill for {dur} before action.</>
  const top = prevColor || '#C9C9D3'
  const bot = nextColor || top
  // The connector reads as a bridge between the two tasks: its dashes blend
  // from the finished task's color at the top into the upcoming task's color
  // at the bottom. A vertical color gradient paints the ink; a repeating mask
  // cuts it into dashes (‑webkit‑ prefix for iOS Safari / the PWA).
  const dashMask = 'repeating-linear-gradient(black 0 5px, transparent 5px 11px)'
  return (
    <div className="today-gap" style={{ position:'relative', zIndex:0, display:'flex', gap:0 }}>
      {/* Continue a routine's film through the gap between two same-routine
          tasks, square-edged so it butts flush against the pills above/below. */}
      {routineTint && (
        <div style={{ position:'absolute', top:0, bottom:0, left:44, right:0, background:routineTint, opacity:.5, zIndex:-1 }} />
      )}
      <div style={{ width:52, flexShrink:0 }} />
      <div style={{ width:52, flexShrink:0, display:'flex', justifyContent:'center' }}>
        <div style={{ width:3, minHeight:h, borderRadius:3, background:`linear-gradient(to bottom, ${top}, ${bot})`, WebkitMask:dashMask, mask:dashMask }} />
      </div>
      <div style={{ flex:1, minWidth:0, paddingLeft:8, paddingTop:4 }}>
        <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:9 }}>
          <span style={{ display:'flex', flexShrink:0 }}><Icon value="glyph:clock" size={16} color="#9AA6B2" /></span>
          <span style={{ fontSize:13, color:'var(--muted)' }}>{body}</span>
        </div>
        <button onClick={onAdd}
          style={{ display:'inline-flex', alignItems:'center', gap:5, fontSize:12, padding:'6px 14px', borderRadius:18, border:'none', background:'#E7F3F6', color:'var(--teal)', fontWeight:600, cursor:'pointer', fontFamily:'DM Sans,sans-serif' }}>
          <span style={{ fontSize:14, lineHeight:1 }}>＋</span> Add Task
        </button>
      </div>
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

function TimelineBlock({ task, categories, status, now, prevColor, nextColor, routineTint, filmTop = true, filmBottom = true, bandLabel = null, onBandLabel = null, isDone, elapsed, dateKey, onToggle, onManage, onShiftToNow, onOpen, onFocus, onToggleSub }) {
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
  const durH  = task._dur ? task._dur * PX_PER_MIN : 0
  const pillH = task._dur ? Math.min(300, Math.max(52, Math.round(durH))) : 52
  const blockMinH = task._dur ? Math.min(340, Math.max(84, Math.round(durH + 28))) : undefined

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
        <div style={{ position:'absolute', top:filmTop?6:0, bottom:filmBottom?6:0, left:44, right:0, background:routineTint, opacity:.5,
          borderTopLeftRadius:filmTop?16:0, borderTopRightRadius:filmTop?16:0, borderBottomLeftRadius:filmBottom?16:0, borderBottomRightRadius:filmBottom?16:0, zIndex:-1 }} />
      )}
      {/* Time-block (container) label, shown once at the top of its band. Tap to
          edit/delete the block. */}
      {routineTint && bandLabel && (
        <button type="button" onClick={onBandLabel || undefined} title={onBandLabel ? 'Edit time block' : undefined}
          style={{ position:'absolute', top:11, left:52, zIndex:1, fontSize:9, fontWeight:800, letterSpacing:.9, textTransform:'uppercase',
            color:'#39434F', background:'rgba(255,255,255,.72)', padding:'2px 8px', borderRadius:9, border:'none', fontFamily:'DM Sans,sans-serif',
            cursor: onBandLabel ? 'pointer' : 'default', pointerEvents: onBandLabel ? 'auto' : 'none' }}>{bandLabel}</button>
      )}
      {/* Time gutter */}
      <div style={{ width:52, flexShrink:0, paddingTop:16, textAlign:'right', paddingRight:10 }}>
        {timeMins!==null && (
          <span style={{ fontSize:11, color:isCurrent?'var(--teal)':'var(--muted)', fontWeight:isCurrent?700:500, whiteSpace:'nowrap' }}>{fmtTimeLabel(timeMins)}</span>
        )}
      </div>
      {/* Colored duration pill + progress spine. The spine reads as a progress
          bar: segments you've worked through are solid in the task's color,
          upcoming segments stay light gray. */}
      <div style={{ width:52, flexShrink:0, display:'flex', flexDirection:'column', alignItems:'center' }}>
        <div style={{ width:3, height:14, borderRadius:3, background: prevColor ? `linear-gradient(to bottom, ${prevColor}, ${color})` : color }} />
        <div style={{ position:'relative', overflow:'hidden', width:52, height:pillH, borderRadius:26, flexShrink:0, background:color, display:'flex', alignItems:'center', justifyContent:'center',
          boxShadow:isCurrent?`0 0 0 4px ${color}33`:'none' }}>
          {/* Progress shade — a lighter fill rises from the bottom by how far
              along the task is: elapsed time while it's happening, and/or the
              share of its subtasks that are checked off. */}
          {(() => {
            const p = isDone ? null : taskProgress({ date: dateKey, time: task._time, durationMins: task._dur, subDone: task.subDone, subCount: task.subCount, startedAt: task.startedAt })
            const shade = iconColorOn(color) === '#FFFFFF' ? 'rgba(255,255,255,.34)' : 'rgba(0,0,0,.16)'
            // Fill from the top so the elapsed portion (and its lower edge)
            // tracks downward as the day advances — matching the now-line.
            return p && p.show ? (
              <div style={{ position:'absolute', left:0, right:0, top:0, height:`${p.frac * 100}%`, background:shade, transition:'height .5s ease' }} />
            ) : null
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
          {(isCurrent||isOverdue) && !INFLEXIBLE_TAGS.has(task.tag) && timeMins!==null && (
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
            <div style={{ width:13, height:13, borderRadius:'50%', background:'white', border:'3px solid var(--teal)', boxShadow:'0 0 0 3px rgba(74,158,181,.16)' }} />
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
function NowMarker({ now }) {
  return (
    <div style={{ display:'flex', gap:0, alignItems:'center', margin:'4px 0' }}>
      <div style={{ width:52, flexShrink:0 }} />
      <div style={{ width:52, flexShrink:0, display:'flex', justifyContent:'center' }}>
        <div style={{ width:13, height:13, borderRadius:'50%', background:'white', border:'3px solid var(--teal)', boxShadow:'0 0 0 3px rgba(74,158,181,.16)' }} />
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
function WeekStrip({ viewDate, setViewDate, commitments, categories, doneCount, total, dayProgress, isToday, summary, todos, recurringTasks, recurringExceptions }) {
  const today = todayKey()
  const base = new Date(viewDate + 'T12:00:00')
  const start = new Date(base); start.setDate(base.getDate() - base.getDay())  // back to Sunday
  const days = Array.from({ length: 7 }, (_, i) => { const d = new Date(start); d.setDate(start.getDate() + i); return d })
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

  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ display:'flex', alignItems:'baseline', gap:9, marginBottom:12 }}>
        <span className="serif" style={{ fontSize:29, fontWeight:700, color:'var(--text)', lineHeight:1 }}>{monthDay},</span>
        <span className="serif" style={{ fontSize:29, fontWeight:700, color:'var(--teal)', lineHeight:1 }}>{year}</span>
      </div>
      <div style={{ display:'flex', gap:2 }}>
        {days.map(d => {
          const key = ymd(d)
          const sel = key === viewDate
          const isTod = key === today
          const dots = (commitments || []).filter(c => c.date === key && !c.block).slice(0, 5).map(colorFor)
          return (
            <button key={key} onClick={() => setViewDate(key)}
              style={{ flex:1, minWidth:0, border:'none', background:'none', cursor:'pointer', padding:'2px 0', display:'flex', flexDirection:'column', alignItems:'center', gap:5 }}>
              <span style={{ fontSize:11, color:'var(--muted)', fontWeight:500 }}>{d.toLocaleDateString('en-US', { weekday:'short' })}</span>
              <span style={{ width:34, height:34, borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center', fontSize:15,
                fontWeight: sel ? 700 : 600,
                background: sel ? 'var(--teal)' : (isTod ? 'rgba(14,158,142,.14)' : 'transparent'),
                color: sel ? 'white' : (isTod ? 'var(--teal)' : 'var(--text)') }}>{d.getDate()}</span>
              <span style={{ display:'flex', gap:2, height:15, alignItems:'center', justifyContent:'center' }}>
                {summary === 'streak'
                  ? (dayAllDone(key) ? <Icon value="glyph:flame" size={14} color="#E8863A" /> : null)
                  : dots.map((c, i) => <span key={i} style={{ width:5, height:5, borderRadius:'50%', background:c }} />)}
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
          {/* Track */}
          <div style={{ position:'absolute', inset:0, borderRadius:999, background:'rgba(90,120,100,.12)', overflow:'hidden' }}>
            {/* Completed-share fill — soft green gradient with a little glow. */}
            <div style={{ height:'100%', width:`${total>0?(doneCount/total)*100:0}%`, borderRadius:999,
              background:'linear-gradient(90deg, #46AE80, #77CE9F)', boxShadow:'0 1px 5px rgba(70,174,128,.45)', transition:'width .5s ease' }} />
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
export default function Today({ todos, weekState, syncToggle, commitments, addCommitment, updateCommitment, deleteCommitment, appendLog, scheduled, categories, recurringTasks, recurringExceptions, skipRecurringOccurrence, deleteRecurringTask, addRecurringTask, updateRecurringTask, routines = [], summary, labelModel = null }) {
  const [now,         setNow]         = useState(nowMins())
  // The day the timeline is showing. Defaults to today; the week strip up top
  // navigates to any day. "Now" logic (the progress marker, current/overdue,
  // start-now) only applies when we're actually looking at today.
  const [viewDate,    setViewDate]    = useState(todayKey())
  const [managing,    setManaging]    = useState(null)
  const [editing,     setEditing]     = useState(null)  // full commitment being edited
  const [editingRec,  setEditingRec]  = useState(null)  // recurring template being edited
  const [shiftPlan,   setShiftPlan]   = useState(null)  // {pivot, rest, selected} — "start now" push chooser
  const [focusTask,   setFocusTask]   = useState(null)  // task shown in full-screen Focus mode
  const [addingTask,  setAddingTask]  = useState(false)
  const [morningOpen, setMorningOpen] = useState(false)
  const [nightOpen,   setNightOpen]   = useState(false)
  const [expandedRoutines, setExpandedRoutines] = useState({})  // routineId → show its done tasks individually
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
  // routine completion tracking
  const [routineDone, setRoutineDone] = useState(()=>{
    try { return JSON.parse(localStorage.getItem('vivian_routine_'+todayKey())||'{}') } catch { return {} }
  })

  // Load routines from storage
  const [morningItems, setMorningItems] = useState([])
  const [nightItems,   setNightItems]   = useState([])
  const [morningEnabled, setMorningEnabled] = useState(true)
  const [nightEnabled,   setNightEnabled]   = useState(true)

  useEffect(()=>{
    getRoutines().then(r => {
      setMorningItems(normalizeRoutineItems(r?.morning))
      setNightItems(normalizeRoutineItems(r?.night))
      setMorningEnabled(r?.morningEnabled !== false)
      setNightEnabled(r?.nightEnabled !== false)
    })
  }, [])

  useEffect(()=>{ const t=setInterval(()=>setNow(nowMins()),30000); return ()=>clearInterval(t) },[])

  // Global day-start shift modal
  const [shiftDayOpen, setShiftDayOpen] = useState(false)
  const [shiftDayTime, setShiftDayTime] = useState('')

  const dateKey = viewDate
  const isToday = viewDate === todayKey()

  // Per-day local collections (custom tasks, deletions, time overrides, routine
  // ticks) are keyed by date in localStorage — reload them whenever the viewed
  // day changes so navigating the week strip shows the right day's state.
  useEffect(() => {
    const ra = k => { try { return JSON.parse(localStorage.getItem(k) || '[]') } catch { return [] } }
    const ro = k => { try { return JSON.parse(localStorage.getItem(k) || '{}') } catch { return {} } }
    setCustomTasks(ra('vivian_custom_' + viewDate))
    setDeleted(ra('vivian_deleted_' + viewDate))
    setTimeOverrides(ro('vivian_timeshift_' + viewDate))
    setRoutineDone(ro('vivian_routine_' + viewDate))
  }, [viewDate])

  const toggleRoutine = (key) => {
    setRoutineDone(prev=>{
      const next={...prev,[key]:!prev[key]}
      localStorage.setItem('vivian_routine_'+dateKey, JSON.stringify(next))
      return next
    })
  }

  // Recurring instances for this day come from the SAME shared computation the
  // Week and Calendar use, so all three agree. Legacy per-date localStorage
  // deletions (`deleted`) are still honored alongside the new synced skips.
  const templateTodos = recurringOccurrencesForDate(recurringTasks, dateKey, recurringExceptions)
    .filter(t=>!deleted.includes(t.id))
  // Keep done ones too — a finished task stays on the timeline, crossed off,
  // rather than vanishing.
  const todayCommitments = (commitments||[]).filter(c=>c.date===dateKey)

  // Time blocks (containers) — labeled windows that draw a soft film behind the
  // day. They aren't tasks; tasks whose start time lands inside one get its
  // film + label (see bandOf). Excluded from the task list below. Come from both
  // one-off commitments and repeating time blocks (e.g. Work every weekday).
  const blocks = [
    ...todayCommitments.filter(c => c.block && c.time && c.durationMins)
      .map(c => ({ id:c.id, label:(c.text||'').trim(), color: c.color || '#8AA0B8',
        start: hhmmToMins(c.time), end: hhmmToMins(c.time) + c.durationMins })),
    ...templateTodos.filter(o => o.block && o._time && o._dur)
      .map(o => ({ id:o.id, label:(o.title||o.text||'').trim(), color: o.color || '#8AA0B8',
        start: hhmmToMins(o._time), end: hhmmToMins(o._time) + o._dur })),
  ]
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
  const effectiveDone = (task) => {
    if (hasCompletionRecord(task)) return isDoneCheck(task.id, task.isCommitment)
    // No record: routine tasks default to done once their window has passed
    // (only on the day being viewed as today).
    if (task.routine && routineIds.has(task.routine) && isToday && task._mins!==null) {
      return now >= task._mins + (task._dur || 0)
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

  // Time blocks with no task inside them — rendered as their own labeled band so
  // an empty container ("Work 9–5") is still visible before you fill it.
  const emptyBlocks = blocks
    .filter(b => !tasksWithStatus.some(t => t._mins != null && t._mins >= b.start && t._mins < b.end))
    .sort((a,b) => a.start - b.start)

  const doneCount = tasksWithStatus.filter(t=>t._status==='past').length
  // When a task is in progress, the "now" indicator is drawn inside that task's
  // pill (see TimelineBlock), so we don't also drop a separate marker in the gap
  // after it. Only when nothing is current does the between-tasks marker show,
  // just before the first task that hasn't started yet.
  const hasCurrent = isToday && tasksWithStatus.some(t=>t._status==='current')
  const nowInsertIdx = (isToday && !hasCurrent) ? tasksWithStatus.findIndex(t=>t._mins!==null&&t._mins>now) : -1
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
    let shifted=0, committed=0, fixed=0

    const setStart = (t, mins) => {
      if (t.isCommitment && updateCommitment) updateCommitment(t.id, { time: minsToHHMM(mins) })
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
        if (isDoneCheck(t.id,t.isCommitment)) { cursor=Math.max(cursor,t._mins+dur); return }
        if (INFLEXIBLE_TAGS.has(t.tag)) { cursor=Math.max(cursor,t._mins+dur); return }
        if (!sel.has(t.id)) { cursor=Math.max(cursor,t._mins+dur); return }  // not chosen → leave
        if (t._mins >= cursor) { cursor=t._mins+dur; return }                // chosen but no overlap → leave
        if (cursor+dur > END_OF_DAY_MINS) { sendToTomorrow(t); return }
        setStart(t, cursor); shifted++
        cursor += dur
      })

    setTimeOverrides(overrides)
    localStorage.setItem('vivian_timeshift_'+dateKey, JSON.stringify(overrides))
    setShiftResult({ shifted, committed, fixed })
  }

  // "Start now": if later movable tasks exist, ask which to push; otherwise
  // just move this one to now.
  const handleShiftToNow = (pivotTask) => {
    const pivotMins = pivotTask._mins ?? parseTimeMins(pivotTask.label)
    if (pivotMins===null) return
    const pivotEnd = now + (pivotTask._dur || 0)
    const rest = tasksWithStatus
      .filter(t => t.id!==pivotTask.id && t._mins!==null && t._mins>=pivotMins
        && !isDoneCheck(t.id,t.isCommitment) && !INFLEXIBLE_TAGS.has(t.tag))
      .sort((a,b)=>a._mins-b._mins)
    if (rest.length === 0) { applyShift(pivotTask, []); return }
    // Pre-check the ones that actually overlap the task's new slot.
    const selected = new Set(rest.filter(t => t._mins < pivotEnd).map(t=>t.id))
    setShiftPlan({ pivot: pivotTask, rest, selected })
  }

  // New items are real commitments dated today, so they show on the Calendar
  // and Week and can carry their own reminder times. (Older local-only custom
  // tasks still render from customTasks for backward compatibility.)
  const handleAdd = (commitment, reminderMins) => {
    if (addCommitment) addCommitment(commitment)
    setItemReminders(commitment.id, reminderMins)
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
    // Tapping a recurring occurrence opens the same full editor as a normal
    // task — pre-filled from its template (edits the whole series). Per-day
    // actions (skip / reschedule this occurrence) stay on the ⋯ menu.
    if (task.isRecurring && updateRecurringTask) {
      const tmpl = (recurringTasks || []).find(t => t.id === (task.recurringId || task.id))
      if (tmpl) { setEditingRec(tmpl); return }
    }
    setManaging(task)
  }
  // Open a time block (container) for editing/deleting from its band label —
  // a one-off commitment block, or a repeating block's template.
  const openContainer = (id) => {
    const c = (commitments || []).find(x => x.id === id)
    if (c) { setEditing(c); return }
    const tmpl = (recurringTasks || []).find(t => t.id === id)
    if (tmpl && updateRecurringTask) setEditingRec(tmpl)
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
  const handleReschedule = (task, date, time) => {
    if (date === dateKey) {
      // Same-day — never delete the task. Apply time override if a time was given.
      if (time) {
        const [h, m] = time.split(':').map(Number)
        const newMins = h * 60 + m
        setTimeOverrides(prev => {
          const next = { ...prev, [task.id]: newMins }
          localStorage.setItem('vivian_timeshift_' + dateKey, JSON.stringify(next))
          return next
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

  return (
    <div>
      {/* Structured-style header: big date + week strip + progress bar */}
      <WeekStrip
        viewDate={viewDate} setViewDate={setViewDate}
        commitments={commitments} categories={categories}
        doneCount={doneCount} total={tasksWithStatus.length}
        dayProgress={dayProgress} isToday={isToday}
        summary={summary} todos={todos}
        recurringTasks={recurringTasks} recurringExceptions={recurringExceptions} />

      {/* Morning routine */}
      {morningEnabled && (
        <RoutineCard
          title="Morning Routine" icon="glyph:sun"
          items={morningItems} prefix="morning"
          open={morningOpen} setOpen={setMorningOpen}
          routineDone={routineDone} toggleRoutine={toggleRoutine} />
      )}

      {/* Timeline */}
      {tasksWithStatus.length===0 && emptyBlocks.length===0 ? (
        <div style={{textAlign:'center',padding:'40px 20px',color:'var(--muted)',fontSize:13}}>
          No schedule yet.{' '}
          <button onClick={()=>setAddingTask(true)} style={{color:'var(--teal)',background:'none',border:'none',cursor:'pointer',fontSize:13,fontFamily:'DM Sans,sans-serif',textDecoration:'underline'}}>Add a task</button>
          {' '}or set up recurring tasks in the Recurring tab.
        </div>
      ) : (
        (() => {
        // How many finished tasks each routine has, for the collapse summary.
        const doneRoutineCounts = {}
        tasksWithStatus.forEach(t => { if (t.routine && routineIds.has(t.routine) && t._status==='past') doneRoutineCounts[t.routine] = (doneRoutineCounts[t.routine]||0)+1 })
        const emittedCollapse = {}  // one summary/header per routine, per render
        const emittedBlocks = new Set()   // empty time-block bands already placed
        // Empty blocks starting at/before this task's time, not yet placed —
        // rendered just before it (they contain no tasks, so they sit in a gap).
        const bandsBefore = (task) => {
          const tm = task._mins ?? Infinity
          return emptyBlocks.filter(b => !emittedBlocks.has(b.id) && b.start <= tm)
            .map(b => { emittedBlocks.add(b.id); return <BlockBand key={'eb-'+b.id} block={b} onOpen={()=>openContainer(b.id)} /> })
        }
        return (
        <div style={{paddingBottom:8}}>
          {tasksWithStatus.map((task,i)=>{
            const before = bandsBefore(task)   // any empty time-block bands due before this row
            // Finished routine tasks collapse into a single summary row unless
            // their routine has been expanded. The first one emits the row (or
            // the expanded header); the rest are hidden while collapsed.
            const isDoneRoutine = task.routine && routineIds.has(task.routine) && task._status==='past'
            if (isDoneRoutine) {
              const r = routines.find(x=>x.id===task.routine)
              const isExp = !!expandedRoutines[task.routine]
              const firstOfRoutine = !emittedCollapse[task.routine]
              const header = firstOfRoutine
                ? (emittedCollapse[task.routine] = true,
                   <RoutineCollapseRow key={'rc-'+task.routine} routine={r} count={doneRoutineCounts[task.routine]} expanded={isExp}
                     onToggle={()=>setExpandedRoutines(p=>({...p,[task.routine]:!p[task.routine]}))} />)
                : null
              if (!isExp) return [...before, header]   // collapsed: summary (once), nothing else
              // expanded: header (once) then the task block below
              return [...before, (
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
            const prev = tasksWithStatus[i-1]
            const next = tasksWithStatus[i+1]
            const colorOf = t => t && (t.color || (categories||[]).find(x=>x.id===t.tag)?.color || TAG_COLORS[t.tag] || null)
            // A task's "band" is its containing time block (label + film), else
            // its routine group. Consecutive tasks in the SAME band read as one
            // continuous wash; the band label shows once at its top.
            const myBand = bandOf(task), prevBand = bandOf(prev), nextBand = bandOf(next)
            const myTint = myBand?.tint || null
            const prevSameRoutine = !!(myBand && prevBand && prevBand.id === myBand.id)
            const nextSameRoutine = !!(myBand && nextBand && nextBand.id === myBand.id)
            let gap = null, gapColor = null, gapNextColor = null, gapTint = null
            if (prev && prev._mins!==null && task._mins!==null && task._status!=='past') {
              const prevEnd = (prev._time && prev._dur) ? (hhmmToMins(prev._time)+prev._dur) : prev._mins
              const g = task._mins - prevEnd
              if (g >= 20) {
                gap = g
                gapColor = colorOf(prev) || '#C9C9D3'
                gapNextColor = colorOf(task) || gapColor
              }
            }
            // Gap film only when both sides share the routine (so the band is
            // truly continuous, not bleeding into an unrelated next task).
            if (prevSameRoutine) gapTint = myTint
            return [...before, (
              <div key={task.id}>
                {i===nowInsertIdx&&<NowMarker now={now}/>}
                {gap&&<GapRow mins={gap} prevColor={gapColor} nextColor={gapNextColor} routineTint={gapTint} onAdd={()=>setAddingTask(true)}/>}
                <TimelineBlock
                  task={task} categories={categories} status={task._status} now={now}
                  routineTint={myTint} filmTop={!prevSameRoutine} filmBottom={!nextSameRoutine}
                  bandLabel={!prevSameRoutine ? (myBand?.label || null) : null}
                  onBandLabel={myBand?.id?.startsWith('blk-') ? () => openContainer(myBand.id.slice(4)) : null}
                  prevColor={colorOf(prev)} nextColor={colorOf(next)}
                  isDone={task._status==='past'}
                  elapsed={isToday && task._mins!==null && task._mins<=now}
                  dateKey={dateKey}
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
          {/* Any empty blocks after the last task (or the whole day if empty). */}
          {emptyBlocks.filter(b=>!emittedBlocks.has(b.id)).map(b=>{ emittedBlocks.add(b.id); return <BlockBand key={'eb-'+b.id} block={b} onOpen={()=>openContainer(b.id)} /> })}
          {isToday && !hasCurrent && nowInsertIdx===-1 && <NowMarker now={now}/>}
        </div>
        )
        })()
      )}

      {/* Night routine — end of day */}
      {nightEnabled && (
        <RoutineCard
          title="Night Routine" icon="glyph:moon"
          items={nightItems} prefix="night"
          open={nightOpen} setOpen={setNightOpen}
          routineDone={routineDone} toggleRoutine={toggleRoutine} />
      )}

      {/* FAB — position lives in CSS (.today-fab) so it can lift above the
          mobile bottom bar; inline styles would otherwise override it. */}
      <button onClick={()=>setAddingTask(true)} className="today-fab"
        style={{position:'fixed',width:52,height:52,borderRadius:'50%',border:'none',
          background:'var(--glimmer, var(--teal))',color:'var(--on-accent)',fontSize:24,cursor:'pointer',
          boxShadow:'0 4px 20px rgba(0,0,0,.25)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:100}}>
        +
      </button>

      {focusTask&&<FocusMode
        title={focusTask.title || stripTimePrefix(focusTask.label)}
        icon={focusTask.icon || (categories||[]).find(x=>x.id===focusTask.tag)?.icon || ''}
        color={focusTask.color || (categories||[]).find(x=>x.id===focusTask.tag)?.color || TAG_COLORS[focusTask.tag] || 'var(--teal)'}
        time={focusTask._time}
        durationMins={focusTask._dur}
        onDone={()=>{ if(!effectiveDone(focusTask)) syncToggle(focusTask.id, focusTask.label, focusTask.tag, focusTask.isCommitment?null:dateKey, true); setFocusTask(null) }}
        onClose={()=>setFocusTask(null)} />}
      {shiftPlan&&<ShiftChooser plan={shiftPlan} onApply={(ids)=>{applyShift(shiftPlan.pivot, ids); setShiftPlan(null)}} onCancel={()=>setShiftPlan(null)}/>}
      {shiftResult&&<ShiftToast result={shiftResult} onClose={()=>setShiftResult(null)}/>}
      {addingTask&&<AddItemModal presetDate={dateKey} categories={categories} routines={routines} labelModel={labelModel} onSave={handleAdd} onSaveRecurring={addRecurringTask} onClose={()=>setAddingTask(false)} title="Add to Today"/>}
      {editing&&<AddItemModal existing={editing} categories={categories} routines={routines} onSave={handleSaveEdit}
        onSaveRecurring={addRecurringTask}
        onDelete={c=>deleteCommitment&&deleteCommitment(c.id)}
        onDuplicate={c=>addCommitment&&addCommitment({ ...c, id:'c-'+Date.now(), text:(c.text||'')+' (copy)', done:false, createdAt:new Date().toISOString() })}
        onMoveToInbox={c=>updateCommitment&&updateCommitment(c.id, { date:null, time:null, durationMins:null })}
        onClose={()=>setEditing(null)} title="Edit task"/>}
      {editingRec&&<AddItemModal existingRecurring={editingRec} categories={categories} routines={routines}
        onSaveRecurring={t=>{ updateRecurringTask&&updateRecurringTask(t.id,t); setEditingRec(null) }}
        onDelete={t=>{ deleteRecurringTask&&deleteRecurringTask(t.id); setEditingRec(null) }}
        onClose={()=>setEditingRec(null)} title="Edit recurring task"/>}
      {managing&&<ManageModal task={managing} dateKey={dateKey} onClose={()=>setManaging(null)} onDelete={handleDelete} onReschedule={handleReschedule} onUnschedule={handleUnschedule} onDeleteSeries={handleDeleteSeries} scheduled={scheduled}/>}
    </div>
  )
}
