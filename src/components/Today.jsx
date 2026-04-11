import { useState, useEffect } from 'react'
import { getDailyTodos, MORNING_ROUTINE, NIGHT_ROUTINE } from '../data/schedule.js'
import { findSlots } from '../lib/scheduler.js'
import { getRoutines } from '../lib/storage.js'
import { computeItemTimes } from './Routines.jsx'

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
function extractLocation(label, note='') {
  const combined=`${label} ${note}`
  const m=combined.match(/(Youngchild\s*\d*|Steitz\s*\d*|Briggs\s*\d*|Commons|B3\s*\w*)/i)
  return m?m[0].trim():null
}
// Replace time portion in a label string with new formatted time
function shiftLabelTime(label, newMins) {
  const newTime = fmtTimeLabel(newMins)
  // Replace leading time pattern like "9:50 AM — " or "~9:50 AM — "
  return label.replace(/~?\d{1,2}:\d{2}\s*(?:AM|PM)\s*(?:—\s*)?/i, newTime + ' — ')
}

// ── Morning routine card with start-time control ──────────────
function MorningRoutineCard({ items, startMins, onStartChange, sub, open, setOpen, routineDone, toggleRoutine }) {
  const [editingStart, setEditingStart] = useState(false)
  const [inputVal, setInputVal] = useState('')

  const hasDurations = items.some(i => i.durationMins !== undefined)
  // If items have time strings but no durations, infer durations from gaps
  const resolvedItems = !hasDurations ? (() => {
    const parseT = s => {
      if (!s) return null
      const m = s.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i)
      if (!m) return null
      let h = parseInt(m[1]); const min = parseInt(m[2]); const ap = m[3].toUpperCase()
      if (ap==='PM' && h!==12) h+=12; if (ap==='AM' && h===12) h=0
      return h*60+min
    }
    return items.map((item, i) => {
      const t0 = parseT(item.time)
      const t1 = i+1 < items.length ? parseT(items[i+1].time) : null
      return { ...item, durationMins: (t0!==null && t1!==null) ? t1-t0 : (t0!==null ? 10 : 10) }
    })
  })() : items
  const computedItems = computeItemTimes(resolvedItems, startMins)
  const doneCount = computedItems.filter(item => routineDone['morning-'+item.habit]).length

  const startLabel = (() => {
    const h = Math.floor(startMins/60), m = startMins%60
    return `${h%12||12}:${String(m).padStart(2,'0')} ${h>=12?'PM':'AM'}`
  })()
  const endItem = computedItems[computedItems.length-1]
  const endLabel = endItem?.time || ''
  const displaySub = sub || (endLabel ? `${startLabel} – ${endLabel}` : startLabel)

  const openStartEdit = (e) => {
    e.stopPropagation()
    const h = Math.floor(startMins/60), m = startMins%60
    setInputVal(`${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`)
    setEditingStart(true)
  }
  const commitStart = (e) => {
    e.stopPropagation()
    if (inputVal) {
      const [h, m] = inputVal.split(':').map(Number)
      onStartChange(h*60+m)
    }
    setEditingStart(false)
  }

  return (
    <div style={{background:'white',borderRadius:12,border:'1px solid var(--border)',marginBottom:20,overflow:'hidden'}}>
      <div onClick={()=>setOpen(o=>!o)}
        style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'12px 16px',cursor:'pointer',userSelect:'none'}}>
        <div style={{display:'flex',alignItems:'center',gap:10}}>
          <span style={{fontSize:18}}>☀️</span>
          <div>
            <div className="serif" style={{fontSize:15,fontWeight:600}}>Morning Routine</div>
            <div style={{display:'flex',alignItems:'center',gap:6,marginTop:1}}>
              {editingStart ? (
                <div onClick={e=>e.stopPropagation()} style={{display:'flex',gap:6,alignItems:'center'}}>
                  <input type="time" value={inputVal} onChange={e=>setInputVal(e.target.value)} autoFocus
                    style={{fontSize:12,padding:'3px 7px',borderRadius:7,border:'1px solid var(--teal)',fontFamily:'DM Sans,sans-serif',outline:'none'}}/>
                  <button onClick={commitStart}
                    style={{fontSize:11,padding:'3px 10px',borderRadius:7,border:'none',background:'var(--forest)',color:'var(--green-light)',cursor:'pointer',fontFamily:'DM Sans,sans-serif',fontWeight:600}}>
                    Set
                  </button>
                  <button onClick={e=>{e.stopPropagation();setEditingStart(false)}}
                    style={{fontSize:11,padding:'3px 8px',borderRadius:7,border:'1px solid var(--border)',background:'white',color:'var(--muted)',cursor:'pointer',fontFamily:'DM Sans,sans-serif'}}>
                    Cancel
                  </button>
                </div>
              ) : (
                <>
                  <span style={{fontSize:11,color:'var(--muted)'}}>{displaySub} · {doneCount}/{computedItems.length} done · {open?'collapse':'expand'}</span>
                  <button onClick={openStartEdit}
                    style={{fontSize:9,padding:'2px 7px',borderRadius:6,border:'1px solid var(--border)',background:'white',color:'var(--muted)',cursor:'pointer',fontFamily:'DM Sans,sans-serif',letterSpacing:.5}}>
                    ⏰ change start
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
        <span style={{color:'var(--muted)',fontSize:13,transform:open?'rotate(180deg)':'',transition:'transform .2s'}}>▾</span>
      </div>
      {open&&(
        <div onClick={e=>e.stopPropagation()} style={{borderTop:'1px solid var(--border)',padding:'6px 16px 14px'}}>
          {computedItems.map(item=>{
            const key='morning-'+item.habit
            const done=!!routineDone[key]
            return (
              <div key={item.habit}
                style={{display:'flex',gap:12,alignItems:'flex-start',padding:'10px 0',borderBottom:'1px solid #F5F3EF',opacity:done?.4:1,transition:'opacity .2s'}}>
                <div onClick={()=>toggleRoutine(key)}
                  style={{width:20,height:20,borderRadius:'50%',flexShrink:0,marginTop:2,cursor:'pointer',
                    border:done?'none':'2px solid #D1D5DB',background:done?'#52B788':'transparent',
                    display:'flex',alignItems:'center',justifyContent:'center',transition:'all .2s'}}>
                  {done&&<span style={{color:'white',fontSize:11,fontWeight:700}}>✓</span>}
                </div>
                <div style={{fontSize:18,minWidth:24,textAlign:'center'}}>{item.icon}</div>
                <div style={{flex:1}}>
                  <div style={{display:'flex',alignItems:'baseline',gap:8,flexWrap:'wrap'}}>
                    <span style={{fontSize:10,color:'var(--teal)',fontWeight:600}}>{item.time}</span>
                    {item.durationMins&&<span style={{fontSize:9,color:'var(--muted)'}}>{item.durationMins}min</span>}
                    <span className="serif" style={{fontSize:14,color:'var(--text)',fontWeight:600,textDecoration:done?'line-through':'none'}}>{item.habit}</span>
                  </div>
                  <div style={{fontSize:11,color:'var(--muted)',marginTop:2,lineHeight:1.4}}>{item.detail}</div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Routine accordion with checkboxes ─────────────────────────
function RoutineAccordion({ title, sub, icon, items, prefix, open, setOpen, routineDone, toggleRoutine }) {
  const doneCount = items.filter(item => routineDone[prefix+'-'+item.habit]).length
  return (
    <div style={{background:'white',borderRadius:12,border:'1px solid var(--border)',marginBottom:20,overflow:'hidden'}}>
      <div onClick={()=>setOpen(o=>!o)}
        style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'12px 16px',cursor:'pointer',userSelect:'none'}}>
        <div style={{display:'flex',alignItems:'center',gap:10}}>
          <span style={{fontSize:18}}>{icon}</span>
          <div>
            <div className="serif" style={{fontSize:15,fontWeight:600}}>{title}</div>
            <div style={{fontSize:11,color:'var(--muted)',marginTop:1}}>
              {sub} · {doneCount}/{items.length} done · {open?'collapse':'expand'}
            </div>
          </div>
        </div>
        <span style={{color:'var(--muted)',fontSize:13,transform:open?'rotate(180deg)':'',transition:'transform .2s'}}>▾</span>
      </div>
      {open&&(
        <div onClick={e=>e.stopPropagation()} style={{borderTop:'1px solid var(--border)',padding:'6px 16px 14px'}}>
          {items.map(item=>{
            const key=prefix+'-'+item.habit
            const done=!!routineDone[key]
            return (
              <div key={item.habit}
                style={{display:'flex',gap:12,alignItems:'flex-start',padding:'10px 0',borderBottom:'1px solid #F5F3EF',opacity:done?.4:1,transition:'opacity .2s'}}>
                <div onClick={()=>toggleRoutine(key)}
                  style={{width:20,height:20,borderRadius:'50%',flexShrink:0,marginTop:2,cursor:'pointer',
                    border:done?'none':'2px solid #D1D5DB', background:done?'#52B788':'transparent',
                    display:'flex',alignItems:'center',justifyContent:'center',transition:'all .2s'}}>
                  {done&&<span style={{color:'white',fontSize:11,fontWeight:700}}>✓</span>}
                </div>
                <div style={{fontSize:18,minWidth:24,textAlign:'center'}}>{item.icon}</div>
                <div style={{flex:1}}>
                  <div style={{display:'flex',alignItems:'baseline',gap:8,flexWrap:'wrap'}}>
                    <span style={{fontSize:10,color:'var(--muted)',letterSpacing:.3}}>{item.time}</span>
                    <span className="serif" style={{fontSize:14,color:'var(--text)',fontWeight:600,textDecoration:done?'line-through':'none'}}>{item.habit}</span>
                  </div>
                  <div style={{fontSize:11,color:'var(--muted)',marginTop:2,lineHeight:1.4}}>{item.detail}</div>
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
function ManageModal({ task, dateKey, onClose, onDelete, onReschedule, scheduled }) {
  const [view,setView]     = useState('main')
  const [reason,setReason] = useState('')
  const [date,setDate]     = useState(dateKey)
  const [time,setTime]     = useState('')
  const [slots,setSlots]   = useState([])
  const s = { width:'100%',fontSize:13,padding:'8px 10px',borderRadius:9,border:'1px solid var(--border)',fontFamily:'DM Sans,sans-serif',outline:'none',boxSizing:'border-box' }

  // When user picks a date, auto-find smart slots for that day
  const handleDateChange = (d) => {
    setDate(d)
    setTime('')
    if (d) {
      const results = findSlots(60, scheduled||[], d)
      setSlots(results.filter(r => r.date === d))
    } else {
      setSlots([])
    }
  }

  return (
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,.5)',zIndex:600,display:'flex',alignItems:'center',justifyContent:'center',padding:16}}>
      <div style={{background:'white',borderRadius:16,padding:22,maxWidth:380,width:'100%',boxShadow:'0 24px 64px rgba(0,0,0,.3)',maxHeight:'90vh',overflowY:'auto'}}>
        {view==='main'&&<>
          <div className="serif" style={{fontSize:17,fontWeight:600,color:'var(--text)',marginBottom:8}}>Manage</div>
          <div style={{fontSize:13,color:'var(--muted)',marginBottom:16,padding:'9px 12px',background:'#F7F6F3',borderRadius:9,lineHeight:1.5}}>{task.label||task.text}</div>
          <div style={{display:'flex',flexDirection:'column',gap:8}}>
            <button onClick={()=>setView('reschedule')} style={{padding:'10px',borderRadius:10,border:'1px solid var(--border)',background:'white',cursor:'pointer',textAlign:'left',fontSize:13,color:'var(--text)',fontFamily:'DM Sans,sans-serif'}}>📅 Reschedule</button>
            <button onClick={()=>setView('delete')} style={{padding:'10px',borderRadius:10,border:'1px solid #FECACA',background:'#FFF5F5',cursor:'pointer',textAlign:'left',fontSize:13,color:'#991B1B',fontFamily:'DM Sans,sans-serif'}}>🗑️ Delete & log why</button>
          </div>
          <button onClick={onClose} style={{marginTop:10,width:'100%',padding:'8px',borderRadius:10,border:'1px solid var(--border)',background:'white',color:'var(--muted)',cursor:'pointer',fontSize:12,fontFamily:'DM Sans,sans-serif'}}>Cancel</button>
        </>}
        {view==='delete'&&<>
          <div className="serif" style={{fontSize:17,fontWeight:600,color:'#991B1B',marginBottom:6}}>Delete Task</div>
          <textarea value={reason} onChange={e=>setReason(e.target.value)} placeholder="Reason (optional)…" rows={3} style={{...s,marginBottom:12,resize:'none',lineHeight:1.5}}/>
          <div style={{display:'flex',gap:8}}>
            <button onClick={()=>{onDelete(task,reason);onClose()}} style={{flex:1,padding:'10px',borderRadius:10,border:'none',background:'#EF4444',color:'white',cursor:'pointer',fontFamily:'DM Sans,sans-serif',fontWeight:600,fontSize:13}}>Delete{reason?' & Log':''}</button>
            <button onClick={()=>setView('main')} style={{padding:'10px 14px',borderRadius:10,border:'1px solid var(--border)',background:'white',color:'var(--muted)',cursor:'pointer',fontSize:12,fontFamily:'DM Sans,sans-serif'}}>Back</button>
          </div>
        </>}
        {view==='reschedule'&&<>
          <div className="serif" style={{fontSize:17,fontWeight:600,color:'var(--text)',marginBottom:12}}>Reschedule</div>
          <div style={{display:'flex',gap:8,marginBottom:10}}>
            <div style={{flex:1}}>
              <div style={{fontSize:10,color:'var(--muted)',letterSpacing:1,textTransform:'uppercase',marginBottom:4}}>Date</div>
              <input type="date" value={date} onChange={e=>handleDateChange(e.target.value)} style={{...s}}/>
            </div>
            <div style={{flex:1}}>
              <div style={{fontSize:10,color:'var(--muted)',letterSpacing:1,textTransform:'uppercase',marginBottom:4}}>Time</div>
              <input type="time" value={time} onChange={e=>setTime(e.target.value)} style={{...s}}/>
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

// ── Quick add ──────────────────────────────────────────────────
function QuickAdd({ onAdd, onClose }) {
  const [label,setLabel]=useState('')
  const [time,setTime]=useState('')
  const [tag,setTag]=useState('personal')
  const submit=()=>{
    if (!label.trim()) return
    onAdd({ id:'custom-'+Date.now(), label:time?`${fmt12(time)} — ${label.trim()}`:label.trim(), tag, note:'' })
    onClose()
  }
  return (
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,.4)',zIndex:500,display:'flex',alignItems:'flex-end',justifyContent:'center',padding:16}}>
      <div style={{background:'white',borderRadius:16,padding:20,maxWidth:420,width:'100%',boxShadow:'0 -8px 40px rgba(0,0,0,.15)'}}>
        <div className="serif" style={{fontSize:17,fontWeight:600,marginBottom:14,color:'var(--text)'}}>Add to Today</div>
        <input value={label} onChange={e=>setLabel(e.target.value)} placeholder="What do you need to do?" autoFocus
          onKeyDown={e=>e.key==='Enter'&&submit()}
          style={{width:'100%',fontSize:14,padding:'10px 12px',borderRadius:10,border:'1px solid var(--border)',marginBottom:10,fontFamily:'DM Sans,sans-serif',outline:'none',boxSizing:'border-box'}}/>
        <div style={{display:'flex',gap:8,flexWrap:'wrap',marginBottom:14}}>
          <input type="time" value={time} onChange={e=>setTime(e.target.value)}
            style={{fontSize:13,padding:'8px 10px',borderRadius:9,border:'1px solid var(--border)',fontFamily:'DM Sans,sans-serif'}}/>
          <select value={tag} onChange={e=>setTag(e.target.value)}
            style={{fontSize:13,padding:'8px 10px',borderRadius:9,border:'1px solid var(--border)',fontFamily:'DM Sans,sans-serif',background:'white',cursor:'pointer',flex:1}}>
            {TAGS.map(t=><option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div style={{display:'flex',gap:8}}>
          <button onClick={submit} style={{flex:1,padding:'11px',borderRadius:10,border:'none',background:'var(--forest)',color:'var(--green-light)',cursor:'pointer',fontFamily:'DM Sans,sans-serif',fontWeight:600,fontSize:14}}>Add Task</button>
          <button onClick={onClose} style={{padding:'11px 16px',borderRadius:10,border:'1px solid var(--border)',background:'white',color:'var(--muted)',cursor:'pointer',fontSize:13,fontFamily:'DM Sans,sans-serif'}}>Cancel</button>
        </div>
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

// ── Timeline task block ────────────────────────────────────────
function TimelineBlock({ task, status, now, minutesUntilNext, isDone, onToggle, onManage, onShiftToNow }) {
  const dot = TAG_COLORS[task.tag]||'#9CA3AF'
  const location = extractLocation(task.label, task.note)
  const timeMins = parseTimeMins(task.label)
  const minsRemaining = timeMins !== null && minutesUntilNext !== null
    ? minutesUntilNext - (now - timeMins)
    : null

  const isPast    = status==='past' || isDone
  const isCurrent = status==='current' && !isDone
  const isOverdue = status==='overdue' && !isDone
  const canShift  = (isCurrent || isOverdue) && !INFLEXIBLE_TAGS.has(task.tag) && timeMins!==null && !isDone

  const blockBg = isCurrent?'white': isOverdue?'#FFF5F5': isPast?'#FAFAF7':'white'
  const blockBorder = isCurrent?'2px solid #52B788': isOverdue?'1.5px solid #FECACA':'1.5px solid var(--border)'
  const dotBg = isDone?'#52B788': isCurrent?'white': isOverdue?'#FCA5A5':'white'
  const dotBorderColor = isDone?'#52B788': isCurrent?'#52B788': isOverdue?'#FCA5A5':'#D1D5DB'

  return (
    <div style={{display:'flex',gap:0,marginBottom:0,opacity:isPast&&!isCurrent?.45:1,transition:'opacity .3s'}}>
      {/* Time label */}
      <div style={{width:68,flexShrink:0,paddingTop:14,textAlign:'right',paddingRight:12}}>
        {timeMins!==null&&(
          <span style={{fontSize:10,color:isCurrent?'var(--teal)':isPast?'#C4BAAD':'var(--muted)',fontWeight:isCurrent?700:400,letterSpacing:.3,whiteSpace:'nowrap'}}>
            {fmtTimeLabel(timeMins)}
          </span>
        )}
      </div>
      {/* Spine + dot */}
      <div style={{width:28,flexShrink:0,display:'flex',flexDirection:'column',alignItems:'center'}}>
        <div style={{width:2,height:14,background:isPast?'#52B78866':'#E5E0D9',flexShrink:0}}/>
        <div onClick={onToggle}
          style={{width:18,height:18,borderRadius:'50%',flexShrink:0,cursor:'pointer',
            border:`2px solid ${dotBorderColor}`,background:dotBg,
            display:'flex',alignItems:'center',justifyContent:'center',
            boxShadow:isCurrent?'0 0 0 4px rgba(82,183,136,.2)':'none',
            transition:'all .2s',zIndex:1}}>
          {isDone&&<span style={{color:'white',fontSize:10,fontWeight:700}}>✓</span>}
          {isCurrent&&!isDone&&<div style={{width:6,height:6,borderRadius:'50%',background:'#52B788'}}/>}
        </div>
        <div style={{width:2,flex:1,minHeight:8,background:isPast?'#52B78866':'#E5E0D9'}}/>
      </div>
      {/* Card */}
      <div style={{flex:1,paddingTop:6,paddingBottom:10,paddingLeft:10,paddingRight:4}}>
        {isCurrent&&minsRemaining!==null&&minsRemaining>0&&(
          <div style={{fontSize:10,color:'var(--teal)',fontWeight:700,letterSpacing:.5,marginBottom:4}}>{fmtMins(minsRemaining)} remaining</div>
        )}
        {isOverdue&&<div style={{fontSize:10,color:'#EF4444',fontWeight:700,letterSpacing:.5,marginBottom:4}}>overdue</div>}

        <div style={{background:blockBg,borderRadius:12,border:blockBorder,padding:'10px 12px',transition:'all .2s'}}>
          <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',gap:8}}>
            <div style={{flex:1}}>
              <div style={{fontSize:14,fontWeight:isCurrent?600:500,color:isDone?'var(--muted)':'var(--text)',textDecoration:isDone?'line-through':'none',lineHeight:1.3}}>
                {task.label}
              </div>
              {task.note&&<div style={{fontSize:11,color:'var(--muted)',marginTop:3,lineHeight:1.4}}>{task.note}</div>}
              <div style={{display:'flex',gap:5,marginTop:6,flexWrap:'wrap',alignItems:'center'}}>
                <span style={{fontSize:9,padding:'2px 6px',borderRadius:6,background:`${dot}18`,color:dot,fontWeight:700,letterSpacing:.8,textTransform:'uppercase'}}>{task.tag}</span>
                {location&&!isDone&&<span style={{fontSize:9,padding:'2px 6px',borderRadius:6,background:'#EFF6FF',color:'#1E3A8A',fontWeight:600}}>📍 {location}</span>}
              </div>
            </div>
            {!isDone&&<button onClick={e=>{e.stopPropagation();onManage()}} style={{fontSize:11,padding:'3px 7px',borderRadius:7,border:'1px solid var(--border)',background:'white',color:'var(--muted)',cursor:'pointer',flexShrink:0}}>···</button>}
          </div>

          {/* Shift to now button */}
          {canShift&&(
            <button onClick={e=>{e.stopPropagation();onShiftToNow()}}
              style={{marginTop:8,width:'100%',padding:'7px',borderRadius:8,border:'1px solid var(--teal)',background:'#F0FDFB',color:'var(--teal)',cursor:'pointer',fontFamily:'DM Sans,sans-serif',fontSize:11,fontWeight:600,letterSpacing:.5}}>
              ⏱ Set start time to now · cascade remaining tasks
            </button>
          )}
        </div>

        {minutesUntilNext!==null&&minutesUntilNext>10&&!isDone&&!isCurrent&&status==='upcoming'&&(
          <div style={{fontSize:10,color:'#C4BAAD',marginTop:4,paddingLeft:4}}>— {fmtMins(minutesUntilNext)} until next</div>
        )}
      </div>
    </div>
  )
}

// ── NOW marker ─────────────────────────────────────────────────
function NowMarker({ now }) {
  return (
    <div style={{display:'flex',gap:0,alignItems:'center'}}>
      <div style={{width:68,flexShrink:0,textAlign:'right',paddingRight:12}}>
        <span style={{fontSize:10,color:'var(--teal)',fontWeight:700}}>{fmtTimeLabel(now)}</span>
      </div>
      <div style={{width:28,flexShrink:0,display:'flex',flexDirection:'column',alignItems:'center'}}>
        <div style={{width:2,height:6,background:'var(--teal)'}}/>
        <div style={{width:10,height:10,borderRadius:'50%',background:'var(--teal)',boxShadow:'0 0 0 4px rgba(14,158,142,.2)'}}/>
        <div style={{width:2,height:6,background:'var(--teal)'}}/>
      </div>
      <div style={{flex:1,paddingLeft:10}}>
        <span style={{fontSize:10,color:'var(--teal)',fontWeight:700,letterSpacing:1,textTransform:'uppercase'}}>now</span>
      </div>
    </div>
  )
}

// ── Main ───────────────────────────────────────────────────────
export default function Today({ todos, weekState, syncToggle, commitments, addCommitment, deleteCommitment, appendLog, dailyTodos, scheduled }) {
  const [now,         setNow]         = useState(nowMins())
  const [managing,    setManaging]    = useState(null)
  const [addingTask,  setAddingTask]  = useState(false)
  const [morningOpen, setMorningOpen] = useState(false)
  const [nightOpen,   setNightOpen]   = useState(false)
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

  // Load custom routines from storage (may differ from schedule.js defaults)
  const [morningItems, setMorningItems] = useState(MORNING_ROUTINE)
  const [nightItems,   setNightItems]   = useState(NIGHT_ROUTINE)
  const [morningSub,   setMorningSub]   = useState('')
  const [nightSub,     setNightSub]     = useState('')
  const [morningStartMins, setMorningStartMins] = useState(() => {
    // Per-day override takes priority, else fall back to stored default
    try { const v = localStorage.getItem('vivian_morning_start_'+todayKey()); return v ? parseInt(v) : 6*60 } catch { return 6*60 }
  })

  useEffect(()=>{
    getRoutines().then(r => {
      if (r?.morning) setMorningItems(r.morning)
      if (r?.night)   setNightItems(r.night)
      if (r?.morningSub) setMorningSub(r.morningSub)
      if (r?.nightSub)   setNightSub(r.nightSub)
      // Use stored default start time if no per-day override
      const perDay = localStorage.getItem('vivian_morning_start_'+todayKey())
      if (!perDay && r?.morningStartMins != null) setMorningStartMins(r.morningStartMins)
    })
  }, [])

  const handleMorningStartChange = (newMins) => {
    setMorningStartMins(newMins)
    localStorage.setItem('vivian_morning_start_'+todayKey(), String(newMins))
  }

  useEffect(()=>{ const t=setInterval(()=>setNow(nowMins()),30000); return ()=>clearInterval(t) },[])

  // Global day-start shift modal
  const [shiftDayOpen, setShiftDayOpen] = useState(false)
  const [shiftDayTime, setShiftDayTime] = useState('')

  const dateKey = todayKey()

  const toggleRoutine = (key) => {
    setRoutineDone(prev=>{
      const next={...prev,[key]:!prev[key]}
      localStorage.setItem('vivian_routine_'+dateKey, JSON.stringify(next))
      return next
    })
  }

  const templateTodos = getDailyTodos(dateKey, dailyTodos).filter(t=>!deleted.includes(t.id))
  const todayCommitments = (commitments||[]).filter(c=>c.date===dateKey&&!c.done)

  const isDoneCheck = (id, isCommitment) => isCommitment
    ? !!(todos[id]||weekState[id])
    : !!(todos[dateKey+'_'+id]||weekState[dateKey+'_'+id])

  // Apply time overrides to task labels
  const applyOverrides = (tasks) => tasks.map(t=>{
    if (timeOverrides[t.id]!==undefined) {
      return { ...t, label: shiftLabelTime(t.label, timeOverrides[t.id]) }
    }
    return t
  })

  const rawTasks = [
    ...todayCommitments.map(c=>({
      id:c.id, label:c.time?`${fmt12(c.time)} — ${c.text}`:c.text,
      note:[c.person&&`With: ${c.person}`,c.prepMin&&`Leave ${c.prepMin} min early`].filter(Boolean).join(' · '),
      tag:c.cat||'personal', isCommitment:true
    })),
    ...templateTodos,
    ...customTasks,
  ]
  const allTasks = applyOverrides(rawTasks)

  const timedSorted = allTasks
    .map(t=>({...t,_mins:parseTimeMins(t.label)}))
    .filter(t=>t._mins!==null)
    .sort((a,b)=>a._mins-b._mins)

  function getStatus(task) {
    if (isDoneCheck(task.id, task.isCommitment)) return 'past'
    if (task._mins===null) return 'anytime'
    if (task._mins>now) return 'upcoming'
    const lastStarted = timedSorted.filter(t=>t._mins<=now&&!isDoneCheck(t.id,t.isCommitment)).at(-1)
    if (task._mins===lastStarted?._mins) return 'current'
    return 'overdue'
  }

  const statusOrder = {overdue:0,current:1,upcoming:2,anytime:3,past:4}
  const tasksWithStatus = allTasks
    .filter(t=>!deleted.includes(t.id))
    .map(t=>({...t,_mins:parseTimeMins(t.label),_status:getStatus({...t,_mins:parseTimeMins(t.label)})}))
    .sort((a,b)=>{
      const so=statusOrder[a._status]-statusOrder[b._status]
      if (so!==0) return so
      return (a._mins??9999)-(b._mins??9999)
    })

  const doneCount = tasksWithStatus.filter(t=>t._status==='past').length
  const nowInsertIdx = tasksWithStatus.findIndex(t=>t._status==='upcoming'||t._status==='anytime')

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
  const handleShiftToNow = (pivotTask) => {
    const pivotMins = parseTimeMins(pivotTask.label)
    if (pivotMins===null) return
    const offset = now - pivotMins // how late we are in minutes

    const newOverrides = { ...timeOverrides }
    let shifted=0, committed=0, fixed=0

    // Get all undone timed tasks at or after the pivot, sorted by time
    const candidates = tasksWithStatus
      .filter(t=>!isDoneCheck(t.id,t.isCommitment) && t._mins!==null && t._mins>=pivotMins)
      .sort((a,b)=>a._mins-b._mins)

    candidates.forEach(task=>{
      if (INFLEXIBLE_TAGS.has(task.tag)) {
        fixed++
        return // leave inflexible tasks where they are
      }
      const newTime = task._mins + offset
      if (newTime > END_OF_DAY_MINS) {
        // Task overflows day → send to commitments
        committed++
        // Add to commitments for tomorrow
        const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate()+1)
        const tomorrowKey = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth()+1).padStart(2,'0')}-${String(tomorrow.getDate()).padStart(2,'0')}`
        if (addCommitment) {
          addCommitment({
            id: 'shifted-'+task.id+'-'+Date.now(),
            text: task.label.replace(/^~?\d{1,2}:\d{2}\s*(?:AM|PM)\s*(?:—\s*)?/i,'').trim(),
            date: tomorrowKey,
            cat: task.tag,
            note: `Shifted from ${dateKey} — ran out of day`,
            done: false,
          })
        }
        // Mark as deleted from today since it moved
        setDeleted(prev=>{
          const next=[...prev, task.id]
          localStorage.setItem('vivian_deleted_'+dateKey, JSON.stringify(next))
          return next
        })
      } else {
        // Shift forward
        newOverrides[task.id] = newTime
        shifted++
      }
    })

    setTimeOverrides(newOverrides)
    localStorage.setItem('vivian_timeshift_'+dateKey, JSON.stringify(newOverrides))
    setShiftResult({ shifted, committed, fixed })
  }

  const handleAdd = (task) => {
    const next=[...customTasks,task]
    setCustomTasks(next)
    localStorage.setItem('vivian_custom_'+dateKey, JSON.stringify(next))
  }
  const handleDelete = (task, reason) => {
    if (task.isCommitment && deleteCommitment) {
      // Commitment — remove from commitments array (syncs to Week, Calendar, Commitments tabs)
      deleteCommitment(task.id)
    } else {
      // Template or custom task — add to local deleted list for today only
      const next=[...deleted,task.id]
      setDeleted(next)
      localStorage.setItem('vivian_deleted_'+dateKey, JSON.stringify(next))
    }
    if (appendLog&&reason) appendLog({date:dateKey,dateLabel:todayLabel(),label:`Deleted: ${task.label||task.text} — ${reason}`,tag:'deleted',ts:new Date().toISOString()})
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
      {/* Header */}
      <div style={{marginBottom:20}}>
        <div className="page-title">{todayLabel()}</div>
        <div style={{display:'flex',alignItems:'center',gap:10,marginTop:4}}>
          <span style={{fontSize:12,color:'var(--muted)'}}>{doneCount} of {tasksWithStatus.length} done</span>
          <div style={{flex:1,height:3,background:'var(--border)',borderRadius:2,overflow:'hidden'}}>
            <div style={{height:'100%',width:`${tasksWithStatus.length>0?(doneCount/tasksWithStatus.length)*100:0}%`,background:'#52B788',borderRadius:2,transition:'width .4s'}}/>
          </div>
        </div>
      </div>

      {/* Morning routine — with start time control */}
      <MorningRoutineCard
        items={morningItems} startMins={morningStartMins}
        onStartChange={handleMorningStartChange}
        sub={morningSub}
        open={morningOpen} setOpen={setMorningOpen}
        routineDone={routineDone} toggleRoutine={toggleRoutine} />

      {/* Timeline */}
      {tasksWithStatus.length===0 ? (
        <div style={{textAlign:'center',padding:'40px 20px',color:'var(--muted)',fontSize:13}}>
          No schedule yet.{' '}
          <button onClick={()=>setAddingTask(true)} style={{color:'var(--teal)',background:'none',border:'none',cursor:'pointer',fontSize:13,fontFamily:'DM Sans,sans-serif',textDecoration:'underline'}}>Add a task</button>
          {' '}or set up recurring tasks in the Recurring tab.
        </div>
      ) : (
        <div style={{paddingBottom:8}}>
          {tasksWithStatus.map((task,i)=>(
            <div key={task.id}>
              {i===nowInsertIdx&&<NowMarker now={now}/>}
              <TimelineBlock
                task={task} status={task._status} now={now}
                minutesUntilNext={minsUntilNext(i)}
                isDone={task._status==='past'}
                onToggle={()=>syncToggle(task.id,task.label,task.tag,task.isCommitment?null:dateKey)}
                onManage={()=>setManaging(task)}
                onShiftToNow={()=>handleShiftToNow(task)}
              />
            </div>
          ))}
          {nowInsertIdx===-1&&<NowMarker now={now}/>}
        </div>
      )}

      {/* Night routine — end of day */}
      <RoutineAccordion
        title="Night Routine"
        sub={nightSub || (nightItems.length ? (nightItems[0].time || '') + (nightItems.length > 1 ? ' – ' + nightItems[nightItems.length-1].time : '') : '')} icon="🌙"
        items={nightItems} prefix="night"
        open={nightOpen} setOpen={setNightOpen}
        routineDone={routineDone} toggleRoutine={toggleRoutine} />

      {/* FAB */}
      <button onClick={()=>setAddingTask(true)}
        style={{position:'fixed',bottom:28,right:24,width:52,height:52,borderRadius:'50%',border:'none',
          background:'var(--forest)',color:'var(--green-light)',fontSize:24,cursor:'pointer',
          boxShadow:'0 4px 20px rgba(0,0,0,.25)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:100}}>
        +
      </button>

      {shiftResult&&<ShiftToast result={shiftResult} onClose={()=>setShiftResult(null)}/>}
      {addingTask&&<QuickAdd onAdd={handleAdd} onClose={()=>setAddingTask(false)}/>}
      {managing&&<ManageModal task={managing} dateKey={dateKey} onClose={()=>setManaging(null)} onDelete={handleDelete} onReschedule={handleReschedule} scheduled={scheduled}/>}
    </div>
  )
}
