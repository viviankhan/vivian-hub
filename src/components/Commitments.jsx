// src/components/Commitments.jsx
import { useState } from 'react'
import { findSlots } from '../lib/scheduler.js'

const DAYS = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday']
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

function todayStr() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}

function formatDate(dateStr) {
  if (!dateStr) return ''
  const d = new Date(dateStr + 'T12:00:00')
  const today = new Date(); today.setHours(12,0,0,0)
  const diff = Math.round((d - today) / 86400000)
  const dayName = DAYS[d.getDay()]
  const monthDay = `${MONTHS[d.getMonth()]} ${d.getDate()}`
  if (diff === 0) return `Today · ${monthDay}`
  if (diff === 1) return `Tomorrow · ${monthDay}`
  if (diff === -1) return `Yesterday · ${monthDay}`
  if (diff > 0 && diff < 7) return `${dayName} · ${monthDay}`
  if (diff < 0) return `${monthDay} (past)`
  return `${dayName} · ${monthDay}`
}

function fmt12(t) {
  if (!t) return ''
  const [h, m] = t.split(':').map(Number)
  return `${h % 12 || 12}:${String(m).padStart(2,'0')} ${h >= 12 ? 'PM' : 'AM'}`
}

function isPast(dateStr) {
  if (!dateStr) return false
  return new Date(dateStr + 'T23:59:00') < new Date()
}

function isSoon(dateStr) {
  if (!dateStr) return false
  const d = new Date(dateStr + 'T12:00:00')
  const today = new Date(); today.setHours(0,0,0,0)
  const diff = Math.round((d - today) / 86400000)
  return diff >= 0 && diff <= 2
}

const CATEGORIES = [
  { id:'meeting',  label:'Meeting',       color:'#3B82F6', bg:'#EFF6FF' },
  { id:'deadline', label:'Deadline',      color:'#EF4444', bg:'#FEF2F2' },
  { id:'social',   label:'Social',        color:'#A855F7', bg:'#F5F3FF' },
  { id:'lab',      label:'Lab/Research',  color:'#059669', bg:'#ECFDF5' },
  { id:'class',    label:'Class/Study',   color:'#7C3AED', bg:'#EDE9FE' },
  { id:'personal', label:'Personal',      color:'#D97706', bg:'#FEF9E7' },
  { id:'other',    label:'Other',         color:'#6B7280', bg:'#F3F4F6' },
]

const DURATIONS = [
  { label:'15 min', value:15 },
  { label:'30 min', value:30 },
  { label:'1 hour', value:60 },
  { label:'2 hours', value:120 },
]

function getCat(id) { return CATEGORIES.find(c => c.id === id) || CATEGORIES[CATEGORIES.length-1] }

// ── Inline slot picker ─────────────────────────────────────────
function SlotPicker({ commitmentId, commitmentLabel, scheduled, onPick, onCancel, targetDate }) {
  const [duration, setDuration] = useState(30)
  const [slots, setSlots] = useState(null)
  const [loading, setLoading] = useState(false)

  const search = () => {
    setLoading(true)
    if (targetDate) {
      // Date is set but no time — find slots on that specific day only
      const all = findSlots(duration, scheduled || [], null, 30)
      setSlots(all.filter(s => s.date === targetDate))
    } else {
      // No date — search next 7 days
      const results = findSlots(duration, scheduled || [], null, 7)
      setSlots(results)
    }
    setLoading(false)
  }

  // Auto-search when targetDate is provided (date-only commitments)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useState(() => { if (targetDate) search() }, [])

  return (
    <div style={{ background:'#F7F9F5', border:'1px solid #D1E8D0', borderRadius:10, padding:'12px 14px', marginTop:10 }}>
      <div style={{ fontSize:11, color:'#52B788', fontWeight:600, letterSpacing:1, textTransform:'uppercase', marginBottom:10 }}>
        {targetDate
          ? `Find a time on ${new Date(targetDate+'T12:00:00').toLocaleDateString('en-US',{weekday:'long',month:'short',day:'numeric'})}`
          : 'Find a time slot'}
      </div>

      <div style={{ display:'flex', gap:8, alignItems:'center', marginBottom:10, flexWrap:'wrap' }}>
        <select value={duration} onChange={e => setDuration(Number(e.target.value))}
          style={{ fontSize:12, padding:'6px 10px', borderRadius:8, border:'1px solid var(--border)', flex:1, minWidth:100 }}>
          {DURATIONS.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
        </select>
        <button className="btn-primary" onClick={search} style={{ padding:'6px 16px', fontSize:10 }}>
          {loading ? 'Searching…' : 'Search →'}
        </button>
        <button className="btn-ghost" onClick={onCancel} style={{ padding:'6px 12px', fontSize:10 }}>
          Cancel
        </button>
      </div>

      {slots !== null && slots.length === 0 && (
        <div style={{ fontSize:12, color:'#7F1D1D', padding:'6px 0' }}>
          No open slots found in the next 7 days. Try a shorter duration.
        </div>
      )}

      {slots && slots.map((slot, i) => (
        <div
          key={i}
          onClick={() => onPick(slot, duration)}
          style={{ background:'white', border:'1px solid #D1E8D0', borderRadius:8, padding:'9px 12px', marginBottom:6, cursor:'pointer', display:'flex', justifyContent:'space-between', alignItems:'center' }}
        >
          <div>
            <div style={{ fontFamily:'Cormorant Garamond, serif', fontSize:15, color:'var(--text)', fontWeight:600 }}>
              {targetDate ? '' : slot.dayLabel + ' · '}{slot.startDisplay} – {slot.endDisplay}
            </div>
            <div style={{ fontSize:11, color:'var(--muted)', marginTop:1 }}>{slot.context}</div>
          </div>
          <span style={{ fontSize:10, letterSpacing:1, textTransform:'uppercase', padding:'4px 10px', borderRadius:12, border:'none', background:'var(--forest)', color:'var(--green-light)', cursor:'pointer' }}>
            Pick →
          </span>
        </div>
      ))}
    </div>
  )
}

// ── Quick-add form ─────────────────────────────────────────────
function QuickAdd({ onAdd }) {
  const [open,    setOpen]    = useState(false)
  const [text,    setText]    = useState('')
  const [date,    setDate]    = useState('')
  const [time,    setTime]    = useState('')
  const [prepMin, setPrepMin] = useState('')
  const [cat,     setCat]     = useState('meeting')
  const [person,  setPerson]  = useState('')
  const [overlap, setOverlap] = useState(null)

  const reset = () => { setText(''); setDate(''); setTime(''); setPrepMin(''); setPerson(''); setCat('meeting'); setOverlap(null); setOpen(false) }

  const submit = async () => {
    if (!text.trim()) return
    const id = 'c-' + Date.now()
    const warning = await onAdd({
      id, text: text.trim(), date: date || null, time: time || null,
      prepMin: prepMin ? parseInt(prepMin) : null,
      cat, person: person.trim() || null,
      done: false, createdAt: new Date().toISOString()
    })
    if (warning) {
      setOverlap(warning)
    } else {
      reset()
    }
  }

  if (!open) return (
    <button onClick={() => setOpen(true)}
      style={{ width:'100%', background:'var(--forest)', border:'none', borderRadius:14, padding:'14px 18px', cursor:'pointer', display:'flex', alignItems:'center', gap:10, marginBottom:16 }}>
      <span style={{ fontSize:20 }}>+</span>
      <span style={{ fontFamily:'DM Sans, sans-serif', fontSize:13, color:'var(--green-light)', fontWeight:600 }}>Add a commitment</span>
    </button>
  )

  return (
    <div style={{ background:'white', borderRadius:14, border:'2px solid var(--forest)', padding:'18px', marginBottom:16 }}>
      <div className="serif" style={{ fontSize:18, fontWeight:600, color:'var(--text)', marginBottom:14 }}>New Commitment</div>

      {overlap && (
        <div style={{ background:'#FEF3C7', border:'1px solid #F59E0B', borderRadius:10, padding:'10px 14px', marginBottom:12, fontSize:12, color:'#92400E' }}>
          <strong>Schedule overlap:</strong> This conflicts with <em>{overlap}</em>. Save anyway or pick a different time?
          <div style={{ display:'flex', gap:8, marginTop:8 }}>
            <button className="btn-primary" style={{ fontSize:11, padding:'5px 14px' }} onClick={reset}>Save anyway</button>
            <button className="btn-ghost" style={{ fontSize:11, padding:'5px 14px' }} onClick={() => setOverlap(null)}>Change time</button>
          </div>
        </div>
      )}

      <textarea value={text} onChange={e => setText(e.target.value)}
        placeholder="What did you commit to?"
        autoFocus rows={2}
        style={{ width:'100%', fontSize:13, padding:'10px 12px', borderRadius:10, border:'1px solid var(--border)', resize:'none', marginBottom:10, fontFamily:'DM Sans, sans-serif', lineHeight:1.5, outline:'none' }} />

      <input value={person} onChange={e => setPerson(e.target.value)}
        placeholder="Who did you commit to? (optional)"
        style={{ width:'100%', fontSize:12, padding:'8px 12px', borderRadius:10, border:'1px solid var(--border)', marginBottom:10, fontFamily:'DM Sans, sans-serif' }} />

      <div style={{ display:'flex', gap:8, marginBottom:10, flexWrap:'wrap' }}>
        <div style={{ flex:1, minWidth:130 }}>
          <div style={{ fontSize:10, color:'var(--muted)', letterSpacing:1, textTransform:'uppercase', marginBottom:4 }}>Date</div>
          <input type="date" value={date} onChange={e => setDate(e.target.value)}
            style={{ width:'100%', fontSize:12, padding:'7px 10px', borderRadius:10, border:'1px solid var(--border)', fontFamily:'DM Sans, sans-serif' }} />
        </div>
        <div style={{ flex:1, minWidth:110 }}>
          <div style={{ fontSize:10, color:'var(--muted)', letterSpacing:1, textTransform:'uppercase', marginBottom:4 }}>Time</div>
          <input type="time" value={time} onChange={e => setTime(e.target.value)}
            style={{ width:'100%', fontSize:12, padding:'7px 10px', borderRadius:10, border:'1px solid var(--border)', fontFamily:'DM Sans, sans-serif' }} />
        </div>
        <div style={{ flex:1, minWidth:110 }}>
          <div style={{ fontSize:10, color:'var(--muted)', letterSpacing:1, textTransform:'uppercase', marginBottom:4 }}>Prep time</div>
          <select value={prepMin} onChange={e => setPrepMin(e.target.value)}
            style={{ width:'100%', fontSize:12, padding:'7px 10px', borderRadius:10, border:'1px solid var(--border)', fontFamily:'DM Sans, sans-serif', background:'white' }}>
            <option value=''>None</option>
            <option value='15'>15 min before</option>
            <option value='30'>30 min before</option>
            <option value='60'>1 hr before</option>
            <option value='120'>2 hrs before</option>
          </select>
        </div>
      </div>

      <div style={{ marginBottom:14 }}>
        <div style={{ fontSize:10, color:'var(--muted)', letterSpacing:1, textTransform:'uppercase', marginBottom:6 }}>Category</div>
        <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
          {CATEGORIES.map(c => (
            <button key={c.id} onClick={() => setCat(c.id)}
              style={{ fontSize:11, padding:'4px 12px', borderRadius:20, border: cat === c.id ? 'none' : '1px solid var(--border)', background: cat === c.id ? c.color : 'white', color: cat === c.id ? 'white' : 'var(--muted)', cursor:'pointer', fontFamily:'DM Sans, sans-serif', fontWeight: cat === c.id ? 600 : 400 }}>
              {c.label}
            </button>
          ))}
        </div>
      </div>

      <div style={{ display:'flex', gap:8 }}>
        <button onClick={submit} disabled={!text.trim()}
          style={{ flex:1, background: text.trim() ? 'var(--forest)' : '#E5E7EB', color: text.trim() ? 'var(--green-light)' : '#9CA3AF', border:'none', borderRadius:10, padding:'10px', fontSize:13, fontWeight:600, cursor: text.trim() ? 'pointer' : 'default', fontFamily:'DM Sans, sans-serif' }}>
          Save commitment
        </button>
        <button onClick={reset}
          style={{ padding:'10px 16px', borderRadius:10, border:'1px solid var(--border)', background:'white', color:'var(--muted)', cursor:'pointer', fontSize:12, fontFamily:'DM Sans, sans-serif' }}>
          Cancel
        </button>
      </div>
    </div>
  )
}

// ── Commitment card ────────────────────────────────────────────
function CommitCard({ c, todos, weekState, syncToggle, onDelete, onSchedule, scheduled }) {
  const [showScheduler, setShowScheduler] = useState(false)
  const cat = getCat(c.cat)
  const done = !!(todos[c.id] || weekState[c.id] || c.done)
  const past = isPast(c.date) && !done
  const today = c.date === todayStr()
  const soon = isSoon(c.date) && !past
  const needsTime = !c.time  // has date but no time, OR has no date at all
  const unscheduled = !c.date

  let borderColor = 'var(--border)', bg = 'white'
  if (done)         { bg = '#FAFAF7'; borderColor = '#E5E7EB' }
  else if (past)    { bg = '#FFF5F5'; borderColor = '#FECACA' }
  else if (today)   { bg = '#F0FDF4'; borderColor = '#86EFAC' }
  else if (soon)    { bg = '#FFFBEB'; borderColor = '#FDE68A' }
  else if (unscheduled) { borderColor = '#E5E7EB' }

  const handlePickSlot = (slot, duration) => {
    onSchedule(c.id, { date: slot.date, time: slot.startTime })
    setShowScheduler(false)
  }

  return (
    <div style={{ background:bg, borderRadius:12, border:`1px solid ${borderColor}`, padding:'14px 16px', marginBottom:8, opacity: done ? .55 : 1 }}>
      <div style={{ display:'flex', gap:10, alignItems:'flex-start' }}>
        <div onClick={() => syncToggle(c.id, c.text, c.cat)}
          style={{ width:20, height:20, borderRadius:'50%', flexShrink:0, marginTop:2, cursor:'pointer', border: done ? 'none' : `2px solid ${cat.color}`, background: done ? cat.color : 'transparent', display:'flex', alignItems:'center', justifyContent:'center' }}>
          {done && <span style={{ color:'white', fontSize:11, fontWeight:700 }}>✓</span>}
        </div>

        <div style={{ flex:1, cursor:'pointer' }} onClick={() => syncToggle(c.id, c.text, c.cat)}>
          <div style={{ fontSize:14, fontWeight:600, color: done ? 'var(--muted)' : 'var(--text)', textDecoration: done ? 'line-through' : 'none', lineHeight:1.4, marginBottom:4 }}>
            {c.text}
          </div>
          {c.person && <div style={{ fontSize:11, color:'var(--muted)', marginBottom:4 }}>With: {c.person}</div>}
          <div style={{ display:'flex', gap:8, flexWrap:'wrap', alignItems:'center' }}>
            {c.date && (
              <span style={{ fontSize:11, color: past ? '#DC2626' : today ? '#059669' : 'var(--muted)', fontWeight: (today||past) ? 600 : 400 }}>
                {formatDate(c.date)}{c.time ? ` @ ${fmt12(c.time)}` : ''}
              </span>
            )}
            {c.prepMin && <span style={{ fontSize:11, color:'var(--muted)' }}>Leave {c.prepMin} min early</span>}
            <span style={{ fontSize:10, padding:'2px 8px', borderRadius:10, background:cat.bg, color:cat.color, fontWeight:500 }}>{cat.label}</span>
            {past  && !done && <span style={{ fontSize:10, padding:'2px 8px', borderRadius:10, background:'#FEE2E2', color:'#DC2626', fontWeight:600 }}>PAST DUE</span>}
            {today && !done && <span style={{ fontSize:10, padding:'2px 8px', borderRadius:10, background:'#DCFCE7', color:'#059669', fontWeight:600 }}>TODAY</span>}
            {unscheduled && !done && <span style={{ fontSize:10, padding:'2px 8px', borderRadius:10, background:'#F3F4F6', color:'#6B7280' }}>Unscheduled</span>}
            {!unscheduled && !c.time && !done && <span style={{ fontSize:10, padding:'2px 8px', borderRadius:10, background:'#FEF9C3', color:'#854D0E', fontWeight:500 }}>⏰ No time set</span>}
          </div>
        </div>

        <div style={{ display:'flex', gap:6, flexShrink:0, alignItems:'flex-start' }}>
          {/* Find time — show when no date, or has date but no time */}
          {needsTime && !done && (
            <button
              onClick={e => { e.stopPropagation(); setShowScheduler(s => !s) }}
              title="Find a time slot for this"
              style={{ fontSize:10, letterSpacing:.5, textTransform:'uppercase', padding:'4px 10px', borderRadius:10, border:'1px solid #D1E8D0', background: showScheduler ? 'var(--forest)' : '#F7F9F5', color: showScheduler ? 'var(--green-light)' : '#52B788', cursor:'pointer', fontFamily:'DM Sans, sans-serif', fontWeight:600, whiteSpace:'nowrap' }}
            >
              {showScheduler ? 'Cancel' : unscheduled ? '🗓 Find time' : '⏰ Find time'}
            </button>
          )}
          <button onClick={() => onDelete(c.id)}
            style={{ background:'none', border:'none', cursor:'pointer', color:'#D1D5DB', fontSize:16, padding:'0 2px' }}>✕</button>
        </div>
      </div>

      {/* Inline scheduler panel */}
      {showScheduler && (
        <SlotPicker
          commitmentId={c.id}
          commitmentLabel={c.text}
          scheduled={scheduled}
          onPick={handlePickSlot}
          onCancel={() => setShowScheduler(false)}
          targetDate={c.date || null}
        />
      )}
    </div>
  )
}

// ── Main ───────────────────────────────────────────────────────
export default function Commitments({ commitments, addCommitment, updateCommitment, deleteCommitment, todos, weekState, syncToggle, scheduled }) {
  const [filter, setFilter] = useState('upcoming')

  const isDone = c => !!(todos[c.id] || weekState[c.id] || c.done)

  const sorted = [...(commitments || [])].sort((a, b) => {
    const aDone = isDone(a), bDone = isDone(b)
    if (aDone !== bDone) return aDone ? 1 : -1
    if (!a.date && !b.date) return 0
    if (!a.date) return 1; if (!b.date) return -1
    const dateCmp = a.date.localeCompare(b.date)
    if (dateCmp !== 0) return dateCmp
    // Same date — sort by time
    return (a.time || '99:99').localeCompare(b.time || '99:99')
  })

  const visible = sorted.filter(c => {
    if (filter === 'upcoming') return !isDone(c)
    if (filter === 'done')     return isDone(c)
    return true
  })

  const pastCount = (commitments||[]).filter(c => !isDone(c) && isPast(c.date)).length
  const unscheduled    = (commitments||[]).filter(c => !isDone(c) && !c.date).length
  const needsTimeCount = (commitments||[]).filter(c => !isDone(c) && c.date && !c.time).length

  const handleSchedule = (id, { date, time }) => {
    updateCommitment(id, { date, time })
  }

  return (
    <div>
      <div className="page-title">Commitments</div>
      <div className="page-sub">Things you said yes to. Tap 🗓 Find time on unscheduled items to auto-schedule them.</div>

      <QuickAdd onAdd={addCommitment} />

      {(commitments||[]).length > 0 && (
        <div style={{ display:'flex', gap:8, marginBottom:16, flexWrap:'wrap', alignItems:'center' }}>
          {[['upcoming','Upcoming'], ['all','All'], ['done','Done']].map(([id, label]) => (
            <button key={id} onClick={() => setFilter(id)}
              style={{ fontSize:11, padding:'5px 14px', borderRadius:20, border:'none', cursor:'pointer', fontFamily:'DM Sans, sans-serif', fontWeight:600, background: filter===id ? 'var(--forest)' : '#F3F4F6', color: filter===id ? 'white' : 'var(--muted)' }}>
              {label}
            </button>
          ))}
          {pastCount > 0 && <span style={{ fontSize:11, padding:'5px 12px', borderRadius:20, background:'#FEE2E2', color:'#DC2626', fontWeight:600 }}>{pastCount} past due</span>}
          {unscheduled > 0 && <span style={{ fontSize:11, padding:'5px 12px', borderRadius:20, background:'#F0FDF4', color:'#059669', fontWeight:600 }}>🗓 {unscheduled} unscheduled</span>}
          {needsTimeCount > 0 && <span style={{ fontSize:11, padding:'5px 12px', borderRadius:20, background:'#FEF9C3', color:'#854D0E', fontWeight:600 }}>⏰ {needsTimeCount} need a time</span>}
        </div>
      )}

      {visible.length === 0 ? (
        <div style={{ background:'white', borderRadius:12, border:'1px solid var(--border)', padding:24, textAlign:'center' }}>
          <div style={{ fontSize:28, marginBottom:8 }}>🤝</div>
          <div style={{ fontSize:13, color:'var(--muted)' }}>
            {filter === 'done' ? 'Nothing marked done yet.' : 'No commitments. Use the button above to add one.'}
          </div>
        </div>
      ) : visible.map(c => (
        <CommitCard
          key={c.id} c={c} todos={todos} weekState={weekState}
          syncToggle={syncToggle} onDelete={deleteCommitment}
          onSchedule={handleSchedule} scheduled={scheduled}
        />
      ))}
    </div>
  )
}
