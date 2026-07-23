// src/components/Commitments.jsx
import { useState, useEffect } from 'react'
import { findSlots } from '../lib/scheduler.js'
import { Icon } from './IconPicker.jsx'
import { bloomBurst } from '../lib/bloom.js'

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

// Add minutes to a "HH:MM" string, returning "HH:MM" (clamped within a day).
function addMinutes(time, mins) {
  if (!time || !mins) return ''
  const [h, m] = time.split(':').map(Number)
  let total = h * 60 + m + mins
  total = Math.max(0, Math.min(total, 23 * 60 + 59))
  return `${String(Math.floor(total/60)).padStart(2,'0')}:${String(total%60).padStart(2,'0')}`
}
// Minutes between two "HH:MM" strings (end - start); null if invalid/negative.
function diffMinutes(start, end) {
  if (!start || !end) return null
  const [sh, sm] = start.split(':').map(Number)
  const [eh, em] = end.split(':').map(Number)
  const d = (eh * 60 + em) - (sh * 60 + sm)
  return d > 0 ? d : null
}
// End time for a commitment given its start time + duration.
function endOf(c) {
  if (!c.time || !c.durationMins) return ''
  return addMinutes(c.time, c.durationMins)
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

// Fallback used only for the brief window before the shared categories load,
// or if the list is somehow empty. The real list comes from Settings →
// Categories via the `categories` prop.
const DEFAULT_CATEGORIES = [
  { id:'other', label:'Other', color:'#8899AA' },
]

function hexToBg(hex) {
  // Lighten hex color for background by mixing with white
  if (!hex || hex[0] !== '#' || hex.length < 7) return '#EEF1F4'
  const r=parseInt(hex.slice(1,3),16), g=parseInt(hex.slice(3,5),16), b=parseInt(hex.slice(5,7),16)
  const lr=Math.round(r+(.85*(255-r))), lg=Math.round(g+(.85*(255-g))), lb=Math.round(b+(.85*(255-b)))
  return `rgb(${lr},${lg},${lb})`
}

const DURATIONS = [
  { label:'15 min', value:15 },
  { label:'30 min', value:30 },
  { label:'1 hour', value:60 },
  { label:'2 hours', value:120 },
]

// Resolve a category id to a {label, color, bg} used for rendering. Categories
// from the shared table have no bg field, so it's derived from color here.
function getCat(id, categories) {
  const list = (categories && categories.length) ? categories : DEFAULT_CATEGORIES
  const found = list.find(c => c.id === id) || list[list.length - 1]
  return { ...found, bg: found.bg || hexToBg(found.color) }
}

// ── Inline slot picker ─────────────────────────────────────────
// Two ways to land a time on a commitment:
//   • Suggested — auto-found open windows in the next 7 days.
//   • Manual    — pick a date + a start and end time yourself.
// Either way we resolve to { date, time, durationMins } so the item gets a
// real start AND end.
function SlotPicker({ scheduled, onPick, onCancel, targetDate, commitmentDuration, reschedule }) {
  // Rescheduling a past item (or a date-less one) starts on the manual tab so
  // you can pick a fresh future date + start/end straight away.
  const [mode, setMode]         = useState(targetDate && !reschedule ? 'suggested' : 'manual')
  const [duration, setDuration] = useState(commitmentDuration || 30)
  const [slots, setSlots]       = useState(null)
  const [loading, setLoading]   = useState(false)

  // Manual fields
  const [mDate, setMDate]   = useState(targetDate && !reschedule ? targetDate : '')
  const [mStart, setMStart] = useState('')
  const [mEnd, setMEnd]     = useState('')

  const search = () => {
    setLoading(true)
    const dur = commitmentDuration || duration
    if (targetDate && !reschedule) {
      const all = findSlots(dur, scheduled || [], null, 30)
      setSlots(all.filter(s => s.date === targetDate))
    } else {
      setSlots(findSlots(dur, scheduled || [], null, 7))
    }
    setLoading(false)
  }

  // Auto-search once when the picker opens on the "suggested" tab for an item
  // that already has a target date (a date set, just missing a time).
  useEffect(() => {
    if (mode === 'suggested' && targetDate && !reschedule && slots === null) search()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // When you set a start time manually, prefill the end using the known/est.
  // duration so you rarely have to type both.
  const onStartChange = (v) => {
    setMStart(v)
    if (v && !mEnd) setMEnd(addMinutes(v, commitmentDuration || duration))
  }

  const manualDur = diffMinutes(mStart, mEnd)
  const canSaveManual = mDate && mStart && mEnd && manualDur

  const saveManual = () => {
    if (!canSaveManual) return
    onPick({ date: mDate, time: mStart, durationMins: manualDur })
  }

  const tabBtn = (active) => ({
    fontSize:10, letterSpacing:.5, textTransform:'uppercase', fontWeight:600,
    padding:'5px 12px', borderRadius:8, cursor:'pointer', fontFamily:'DM Sans,sans-serif',
    border: active ? 'none' : '1px solid #C4DDE8',
    background: active ? '#4A9EB5' : 'white', color: active ? 'white' : '#2A7A90',
  })

  return (
    <div style={{ background:'#EAF5F8', border:'1px solid #A8D8E4', borderRadius:10, padding:'12px 14px', marginTop:10 }}>
      <div style={{ display:'flex', gap:6, marginBottom:12, flexWrap:'wrap' }}>
        <button style={tabBtn(mode==='suggested')} onClick={() => { setMode('suggested'); if (!slots) search() }}>✦ Suggested times</button>
        <button style={tabBtn(mode==='manual')} onClick={() => setMode('manual')}>✎ Enter manually</button>
      </div>

      {mode === 'suggested' && (
        <>
          <div style={{ display:'flex', gap:8, alignItems:'center', marginBottom:10, flexWrap:'wrap' }}>
            {commitmentDuration
              ? <span style={{ fontSize:11, color:'var(--muted)' }}>Duration: <strong>{commitmentDuration < 60 ? commitmentDuration+'min' : commitmentDuration/60+'h'}</strong></span>
              : (
                <select value={duration} onChange={e => setDuration(Number(e.target.value))}
                  style={{ fontSize:12, padding:'6px 10px', borderRadius:8, border:'1px solid var(--border)', flex:1, minWidth:100 }}>
                  {DURATIONS.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
                </select>
              )}
            <button className="btn-primary" onClick={search} style={{ padding:'6px 16px', fontSize:10 }}>
              {loading ? 'Searching…' : 'Search →'}
            </button>
          </div>

          {slots !== null && slots.length === 0 && (
            <div style={{ fontSize:12, color:'#7F1D1D', padding:'6px 0' }}>
              No open slots found. Try a shorter duration or enter a time manually.
            </div>
          )}

          {slots && slots.map((slot, i) => (
            <div key={i}
              onClick={() => onPick({ date: slot.date, time: slot.startTime, durationMins: diffMinutes(slot.startTime, slot.endTime) })}
              style={{ background:'white', border:'1px solid #C4DDE8', borderRadius:8, padding:'9px 12px', marginBottom:6, cursor:'pointer', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <div>
                <div style={{ fontFamily:'Cormorant Garamond, serif', fontSize:15, color:'var(--text)', fontWeight:600 }}>
                  {targetDate && !reschedule ? '' : slot.dayLabel + ' · '}{slot.startDisplay} – {slot.endDisplay}
                </div>
                <div style={{ fontSize:11, color:'var(--muted)', marginTop:1 }}>{slot.context}</div>
              </div>
              <span style={{ fontSize:10, letterSpacing:1, textTransform:'uppercase', padding:'4px 10px', borderRadius:12, background:'#4A9EB5', color:'white', fontWeight:600 }}>Pick →</span>
            </div>
          ))}
        </>
      )}

      {mode === 'manual' && (
        <>
          <div style={{ display:'flex', gap:8, marginBottom:10, flexWrap:'wrap' }}>
            <div style={{ flex:1, minWidth:130 }}>
              <div style={{ fontSize:10, color:'var(--muted)', letterSpacing:1, textTransform:'uppercase', marginBottom:4 }}>Date</div>
              <input type="date" value={mDate} onChange={e => setMDate(e.target.value)}
                style={{ width:'100%', fontSize:12, padding:'7px 10px', borderRadius:10, border:'1px solid var(--border)', fontFamily:'DM Sans,sans-serif' }} />
            </div>
            <div style={{ flex:1, minWidth:100 }}>
              <div style={{ fontSize:10, color:'var(--muted)', letterSpacing:1, textTransform:'uppercase', marginBottom:4 }}>Start time</div>
              <input type="time" value={mStart} onChange={e => onStartChange(e.target.value)}
                style={{ width:'100%', fontSize:12, padding:'7px 10px', borderRadius:10, border:'1px solid var(--border)', fontFamily:'DM Sans,sans-serif' }} />
            </div>
            <div style={{ flex:1, minWidth:100 }}>
              <div style={{ fontSize:10, color:'var(--muted)', letterSpacing:1, textTransform:'uppercase', marginBottom:4 }}>End time</div>
              <input type="time" value={mEnd} onChange={e => setMEnd(e.target.value)}
                style={{ width:'100%', fontSize:12, padding:'7px 10px', borderRadius:10, border:'1px solid var(--border)', fontFamily:'DM Sans,sans-serif' }} />
            </div>
          </div>
          {mStart && mEnd && !manualDur && (
            <div style={{ fontSize:11, color:'#DC2626', marginBottom:8 }}>End time must be after the start time.</div>
          )}
          {manualDur && (
            <div style={{ fontSize:11, color:'var(--muted)', marginBottom:8 }}>
              {fmt12(mStart)} – {fmt12(mEnd)} · {manualDur < 60 ? manualDur+' min' : (manualDur/60 % 1 === 0 ? manualDur/60+'h' : (manualDur/60).toFixed(1)+'h')}
            </div>
          )}
          <button onClick={saveManual} disabled={!canSaveManual}
            style={{ width:'100%', background: canSaveManual ? 'linear-gradient(135deg, #4A9EB5, #7BBFD4)' : '#E5E7EB', color: canSaveManual ? 'white' : '#9CA3AF', border:'none', borderRadius:10, padding:'9px', fontSize:12, fontWeight:600, cursor: canSaveManual ? 'pointer' : 'default', fontFamily:'DM Sans,sans-serif' }}>
            {reschedule ? 'Reschedule' : 'Set time'}
          </button>
        </>
      )}

      <button className="btn-ghost" onClick={onCancel} style={{ padding:'6px 12px', fontSize:10, marginTop:8, width:'100%' }}>Cancel</button>
    </div>
  )
}

// ── Quick-add form ─────────────────────────────────────────────
function QuickAdd({ onAdd, categories }) {
  const cats = (categories && categories.length) ? categories : DEFAULT_CATEGORIES
  const defaultCat = cats[0]?.id || 'other'
  const [open,        setOpen]        = useState(false)
  const [text,        setText]        = useState('')
  const [date,        setDate]        = useState('')
  const [time,        setTime]        = useState('')
  const [endTime,     setEndTime]     = useState('')
  const [prepMin,     setPrepMin]     = useState('')
  const [durationMins,setDurationMins]= useState('')
  const [cat,         setCat]         = useState(defaultCat)
  const [person,      setPerson]      = useState('')

  const reset = () => { setText(''); setDate(''); setTime(''); setEndTime(''); setPrepMin(''); setDurationMins(''); setPerson(''); setCat(defaultCat); setOpen(false) }

  const submit = async () => {
    if (!text.trim()) return
    // If both a start and end time are given, the span wins and sets duration.
    const spanDur = diffMinutes(time, endTime)
    const finalDur = spanDur || (durationMins ? parseInt(durationMins) : null)
    const id = 'c-' + Date.now()
    await onAdd({
      id, text: text.trim(), date: date || null, time: time || null,
      prepMin: prepMin ? parseInt(prepMin) : null,
      durationMins: finalDur,
      cat, person: person.trim() || null,
      done: false, createdAt: new Date().toISOString()
    })
    reset()
  }

  if (!open) return (
    <button onClick={() => setOpen(true)}
      style={{ width:'100%', background:'linear-gradient(135deg, #7BBFD4, #C8BFDF)', border:'none', borderRadius:14, padding:'14px 18px', cursor:'pointer', display:'flex', alignItems:'center', gap:10, marginBottom:16 }}>
      <span style={{ fontSize:20 }}>+</span>
      <span style={{ fontFamily:'DM Sans, sans-serif', fontSize:13, color:'#1A3A4E', fontWeight:600 }}>Add a commitment</span>
    </button>
  )

  return (
    <div style={{ background:'white', borderRadius:14, border:'2px solid #A8D0E0', padding:'18px', marginBottom:16 }}>
      <div className="serif" style={{ fontSize:18, fontWeight:600, color:'var(--text)', marginBottom:14 }}>New Commitment</div>

      <textarea value={text} onChange={e => setText(e.target.value)}
        placeholder="What did you commit to?"
        autoFocus rows={2}
        style={{ width:'100%', fontSize:13, padding:'10px 12px', borderRadius:10, border:'1px solid var(--border)', resize:'none', marginBottom:10, fontFamily:'DM Sans, sans-serif', lineHeight:1.5, outline:'none' }} />

      <input value={person} onChange={e => setPerson(e.target.value)}
        placeholder="Who did you commit to? (optional)"
        style={{ width:'100%', fontSize:12, padding:'8px 12px', borderRadius:10, border:'1px solid var(--border)', marginBottom:10, fontFamily:'DM Sans, sans-serif' }} />

      <div style={{ display:'flex', gap:8, marginBottom:10, flexWrap:'wrap' }}>
        <div style={{ flex:1, minWidth:120 }}>
          <div style={{ fontSize:10, color:'var(--muted)', letterSpacing:1, textTransform:'uppercase', marginBottom:4 }}>Date</div>
          <input type="date" value={date} onChange={e => setDate(e.target.value)}
            style={{ width:'100%', fontSize:12, padding:'7px 10px', borderRadius:10, border:'1px solid var(--border)', fontFamily:'DM Sans, sans-serif' }} />
        </div>
        <div style={{ flex:1, minWidth:95 }}>
          <div style={{ fontSize:10, color:'var(--muted)', letterSpacing:1, textTransform:'uppercase', marginBottom:4 }}>Start time</div>
          <input type="time" value={time} onChange={e => setTime(e.target.value)}
            style={{ width:'100%', fontSize:12, padding:'7px 10px', borderRadius:10, border:'1px solid var(--border)', fontFamily:'DM Sans, sans-serif' }} />
        </div>
        <div style={{ flex:1, minWidth:95 }}>
          <div style={{ fontSize:10, color:'var(--muted)', letterSpacing:1, textTransform:'uppercase', marginBottom:4 }}>End time</div>
          <input type="time" value={endTime} onChange={e => setEndTime(e.target.value)}
            style={{ width:'100%', fontSize:12, padding:'7px 10px', borderRadius:10, border:'1px solid var(--border)', fontFamily:'DM Sans, sans-serif' }} />
        </div>
      </div>

      <div style={{ display:'flex', gap:8, marginBottom:10, flexWrap:'wrap' }}>
        <div style={{ flex:1, minWidth:110 }}>
          <div style={{ fontSize:10, color:'var(--muted)', letterSpacing:1, textTransform:'uppercase', marginBottom:4 }}>Duration {diffMinutes(time,endTime) ? '(from times)' : ''}</div>
          <select value={diffMinutes(time,endTime) || durationMins} disabled={!!diffMinutes(time,endTime)} onChange={e => setDurationMins(e.target.value)}
            style={{ width:'100%', fontSize:12, padding:'7px 10px', borderRadius:10, border:'1px solid var(--border)', fontFamily:'DM Sans, sans-serif', background: diffMinutes(time,endTime) ? '#F3F4F6' : 'white' }}>
            <option value=''>Unknown</option>
            <option value='15'>15 min</option>
            <option value='30'>30 min</option>
            <option value='60'>1 hour</option>
            <option value='90'>1.5 hrs</option>
            <option value='120'>2 hours</option>
            <option value='180'>3 hours</option>
            <option value='240'>4 hours</option>
          </select>
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
          {cats.map(c => (
            <button key={c.id} onClick={() => setCat(c.id)}
              style={{ fontSize:11, padding:'4px 12px', borderRadius:20, border: cat === c.id ? 'none' : '1px solid var(--border)', background: cat === c.id ? c.color : 'white', color: cat === c.id ? 'white' : 'var(--muted)', cursor:'pointer', fontFamily:'DM Sans, sans-serif', fontWeight: cat === c.id ? 600 : 400 }}>
              {c.label}
            </button>
          ))}
        </div>
      </div>

      <div style={{ display:'flex', gap:8 }}>
        <button onClick={submit} disabled={!text.trim()}
          style={{ flex:1, background: text.trim() ? 'linear-gradient(135deg, #4A9EB5, #7BBFD4)' : '#E5E7EB', color: text.trim() ? 'white' : '#9CA3AF', border:'none', borderRadius:10, padding:'10px', fontSize:13, fontWeight:600, cursor: text.trim() ? 'pointer' : 'default', fontFamily:'DM Sans, sans-serif' }}>
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
function CommitCard({ c, todos, weekState, syncToggle, onDelete, onSchedule, scheduled, categories }) {
  const [showScheduler, setShowScheduler] = useState(false)
  const cat = getCat(c.cat, categories)
  const done = !!(todos[c.id] || weekState[c.id] || c.done)
  const past = isPast(c.date) && !done
  const today = c.date === todayStr()
  const soon = isSoon(c.date) && !past
  const needsTime = c.date && !c.time  // has a date but no time yet
  const unscheduled = !c.date
  const end = endOf(c)

  let borderColor = 'var(--border)', bg = 'white'
  if (done)         { bg = '#F8F6F8'; borderColor = '#E0D4DC' }
  else if (past)    { bg = '#FDF4F6'; borderColor = '#F0C4CC' }
  else if (today)   { bg = '#EAF5F8'; borderColor = '#A8D8E4' }
  else if (soon)    { bg = '#FAF5EC'; borderColor = '#E4D0A8' }
  else if (unscheduled) { borderColor = '#E0D4DC' }

  const handlePickSlot = ({ date, time, durationMins }) => {
    const changes = { date, time }
    if (durationMins) changes.durationMins = durationMins
    onSchedule(c.id, changes)
    setShowScheduler(false)
  }

  return (
    <div style={{ background:bg, borderRadius:12, border:`1px solid ${borderColor}`, padding:'14px 16px', marginBottom:8, opacity: done ? .55 : 1 }}>
      <div style={{ display:'flex', gap:10, alignItems:'flex-start' }}>
        <div onClick={e => { if (!done) bloomBurst(e.currentTarget); syncToggle(c.id, c.text, c.cat) }}
          style={{ width:20, height:20, borderRadius:'50%', flexShrink:0, marginTop:2, cursor:'pointer', border: done ? 'none' : `2px solid ${cat.color}`, background: done ? cat.color : 'transparent', display:'flex', alignItems:'center', justifyContent:'center' }}>
          {done && <span style={{ color:'white', fontSize:11, fontWeight:700 }}>✓</span>}
        </div>

        <div style={{ flex:1, cursor:'pointer' }} onClick={() => syncToggle(c.id, c.text, c.cat)}>
          <div style={{ display:'flex', alignItems:'center', gap:7, marginBottom:4 }}>
            {cat.icon && <Icon value={cat.icon} size={16} />}
            <span style={{ fontSize:14, fontWeight:600, color: done ? 'var(--muted)' : 'var(--text)', textDecoration: done ? 'line-through' : 'none', lineHeight:1.4 }}>
              {c.text}
            </span>
          </div>
          {c.person && <div style={{ fontSize:11, color:'var(--muted)', marginBottom:4 }}>With: {c.person}</div>}
          <div style={{ display:'flex', gap:8, flexWrap:'wrap', alignItems:'center' }}>
            {c.date && (
              <span style={{ fontSize:11, color: past ? '#B44A6A' : today ? '#2A7A90' : 'var(--muted)', fontWeight: (today||past) ? 600 : 400 }}>
                {formatDate(c.date)}{c.time ? ` @ ${fmt12(c.time)}${end ? '–'+fmt12(end) : ''}` : ''}
              </span>
            )}
            {c.durationMins && !end && <span style={{ fontSize:11, color:'var(--muted)' }}>~{c.durationMins < 60 ? c.durationMins+'min' : (c.durationMins/60 % 1 === 0 ? c.durationMins/60+'h' : (c.durationMins/60).toFixed(1)+'h')}</span>}
            {c.prepMin && <span style={{ fontSize:11, color:'var(--muted)' }}>Leave {c.prepMin} min early</span>}
            <span style={{ display:'inline-flex', alignItems:'center', gap:3, fontSize:10, padding:'2px 8px', borderRadius:10, background:cat.bg, color:cat.color, fontWeight:500 }}>{cat.icon && <Icon value={cat.icon} size={11} />}{cat.label}</span>
            {past  && !done && <span style={{ fontSize:10, padding:'2px 8px', borderRadius:10, background:'#FBF0F4', color:'#B44A6A', fontWeight:600 }}>PAST DUE</span>}
            {today && !done && <span style={{ fontSize:10, padding:'2px 8px', borderRadius:10, background:'#D4EEF4', color:'#2A7A90', fontWeight:600 }}>TODAY</span>}
            {unscheduled && !done && <span style={{ fontSize:10, padding:'2px 8px', borderRadius:10, background:'#F3F4F6', color:'#6B7280' }}>Unscheduled</span>}
            {needsTime && !done && <span style={{ fontSize:10, padding:'2px 8px', borderRadius:10, background:'#FAF3EC', color:'#8A6030', fontWeight:500 }}>⏰ No time set</span>}
          </div>
        </div>

        <div style={{ display:'flex', gap:6, flexShrink:0, alignItems:'flex-start' }}>
          {/* Reschedule — for past-due items */}
          {past && !done && (
            <button
              onClick={e => { e.stopPropagation(); setShowScheduler(s => !s) }}
              title="Pick a new time for this"
              style={{ fontSize:10, letterSpacing:.5, textTransform:'uppercase', padding:'4px 10px', borderRadius:10, border:'1px solid #F0C4CC', background: showScheduler ? '#B44A6A' : '#FDF0F3', color: showScheduler ? 'white' : '#B44A6A', cursor:'pointer', fontFamily:'DM Sans, sans-serif', fontWeight:700, whiteSpace:'nowrap' }}
            >
              {showScheduler ? 'Cancel' : '↻ Reschedule?'}
            </button>
          )}
          {/* Find time — items needing a date or a time (not past) */}
          {!past && (needsTime || unscheduled) && !done && (
            <button
              onClick={e => { e.stopPropagation(); setShowScheduler(s => !s) }}
              title="Find a time slot for this"
              style={{ fontSize:10, letterSpacing:.5, textTransform:'uppercase', padding:'4px 10px', borderRadius:10, border:'1px solid #A8D8E4', background: showScheduler ? '#4A9EB5' : '#EAF5F8', color: showScheduler ? 'white' : '#2A7A90', cursor:'pointer', fontFamily:'DM Sans, sans-serif', fontWeight:600, whiteSpace:'nowrap' }}
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
          scheduled={scheduled}
          onPick={handlePickSlot}
          onCancel={() => setShowScheduler(false)}
          targetDate={c.date || null}
          commitmentDuration={c.durationMins || null}
          reschedule={past}
        />
      )}
    </div>
  )
}

// ── Main ───────────────────────────────────────────────────────
export default function Commitments({ commitments, addCommitment, updateCommitment, deleteCommitment, todos, weekState, syncToggle, scheduled, categories }) {
  const [filter, setFilter] = useState('toschedule')
  const [confirmClear, setConfirmClear] = useState(false)

  const isDone = c => !!(todos[c.id] || weekState[c.id] || c.done)
  const doneCount = (commitments || []).filter(isDone).length

  // A commitment is "fully scheduled" once it has both a date and a start
  // time and isn't past. Those live on the Calendar + Week now, so they leave
  // the default "To schedule" view (that's the depopulate-on-schedule behavior).
  const isFullyScheduled = c => !isDone(c) && c.date && c.time && !isPast(c.date)
  const isPastDue     = c => !isDone(c) && isPast(c.date)
  const isUnscheduled = c => !isDone(c) && !c.date
  const needsTime     = c => !isDone(c) && c.date && !c.time && !isPast(c.date)
  // Still needs your attention to land on the calendar.
  const needsAction   = c => isUnscheduled(c) || needsTime(c)

  const handleClearCompleted = () => {
    (commitments || []).filter(isDone).forEach(c => deleteCommitment(c.id))
    setConfirmClear(false)
  }

  const sorted = [...(commitments || [])].sort((a, b) => {
    const aDone = isDone(a), bDone = isDone(b)
    if (aDone !== bDone) return aDone ? 1 : -1
    if (!a.date && !b.date) return 0
    if (!a.date) return 1; if (!b.date) return -1
    const dateCmp = a.date.localeCompare(b.date)
    if (dateCmp !== 0) return dateCmp
    return (a.time || '99:99').localeCompare(b.time || '99:99')
  })

  const visible = sorted.filter(c => {
    if (filter === 'toschedule') return needsAction(c)
    if (filter === 'pastdue')    return isPastDue(c)
    if (filter === 'unscheduled')return isUnscheduled(c)
    if (filter === 'scheduled')  return isFullyScheduled(c)
    if (filter === 'done')       return isDone(c)
    return true // 'all'
  })

  const pastCount      = (commitments||[]).filter(isPastDue).length
  const unscheduled    = (commitments||[]).filter(isUnscheduled).length
  const toScheduleCount= (commitments||[]).filter(needsAction).length
  const scheduledCount = (commitments||[]).filter(isFullyScheduled).length

  const handleSchedule = (id, changes) => {
    updateCommitment(id, changes)
  }

  // Filter tabs: label, id, count, and an accent color when active.
  const TABS = [
    { id:'toschedule',  label:'To schedule', count:toScheduleCount, active:'linear-gradient(135deg, #7BBFD4, #C8BFDF)', activeText:'#1A3A4E' },
    { id:'pastdue',     label:'Past due',    count:pastCount,        active:'#FEE2E2', activeText:'#DC2626' },
    { id:'unscheduled', label:'Unscheduled', count:unscheduled,      active:'#E4F5F8', activeText:'#2A7A90' },
    { id:'scheduled',   label:'Scheduled',   count:scheduledCount,   active:'#DDF0E4', activeText:'#2F6B4F' },
    { id:'done',        label:'Done',        count:doneCount,        active:'#EFE6F4', activeText:'#6B2A8A' },
    { id:'all',         label:'All',         count:null,             active:'#EEF1F4', activeText:'var(--text)' },
  ]

  const emptyMessage = {
    toschedule:  'Nothing waiting to be scheduled — everything with a date & time is on your Calendar and Week. 🎉',
    pastdue:     'No past-due commitments. Nicely kept up.',
    unscheduled: 'No unscheduled commitments — every item has a date.',
    scheduled:   'Nothing fully scheduled yet. Give an item a date and time and it\'ll show here, on your Calendar, and in your Week.',
    done:        'Nothing marked done yet.',
    all:         'No commitments. Use the button above to add one.',
  }

  return (
    <div>
      <div className="page-title">Commitments</div>
      <div className="page-sub">Things you said yes to. Give one a date + time (a start and end) and it moves onto your Calendar and Week.</div>

      <QuickAdd onAdd={addCommitment} categories={categories} />

      {(commitments||[]).length > 0 && (
        <>
          <div style={{ display:'flex', gap:8, marginBottom:12, flexWrap:'wrap', alignItems:'center' }}>
            {TABS.map(t => {
              const on = filter === t.id
              return (
                <button key={t.id} onClick={() => setFilter(t.id)}
                  style={{ fontSize:11, padding:'5px 13px', borderRadius:20, border:'none', cursor:'pointer', fontFamily:'DM Sans, sans-serif', fontWeight:600,
                    background: on ? t.active : '#F1F1F4', color: on ? t.activeText : 'var(--muted)',
                    display:'inline-flex', alignItems:'center', gap:6 }}>
                  {t.label}
                  {t.count != null && t.count > 0 && (
                    <span style={{ fontSize:10, fontWeight:700, padding:'1px 6px', borderRadius:10, background: on ? 'rgba(0,0,0,.12)' : '#E2E2E6', color:'inherit' }}>{t.count}</span>
                  )}
                </button>
              )
            })}
          </div>

          {doneCount > 0 && (
            <div style={{ marginBottom:14 }}>
              {confirmClear ? (
                <span style={{ display:'inline-flex', alignItems:'center', gap:6 }}>
                  <span style={{ fontSize:11, color:'#991B1B' }}>Delete {doneCount} completed?</span>
                  <button onClick={handleClearCompleted} style={{ fontSize:11, padding:'5px 10px', borderRadius:20, border:'none', background:'#EF4444', color:'white', cursor:'pointer', fontFamily:'DM Sans,sans-serif', fontWeight:600 }}>Yes, clear</button>
                  <button onClick={() => setConfirmClear(false)} style={{ fontSize:11, padding:'5px 10px', borderRadius:20, border:'1px solid var(--border)', background:'white', color:'var(--muted)', cursor:'pointer', fontFamily:'DM Sans,sans-serif' }}>Cancel</button>
                </span>
              ) : (
                <button onClick={() => setConfirmClear(true)} style={{ fontSize:11, padding:'5px 12px', borderRadius:20, border:'1px solid #FECACA', background:'#FFF5F5', color:'#991B1B', cursor:'pointer', fontFamily:'DM Sans,sans-serif', fontWeight:600 }}>
                  🗑 Clear completed ({doneCount})
                </button>
              )}
            </div>
          )}
        </>
      )}

      {/* A gentle explainer when viewing the Scheduled bucket. */}
      {filter === 'scheduled' && visible.length > 0 && (
        <div style={{ fontSize:11.5, color:'#2F6B4F', background:'#EDF7F0', border:'1px solid #CDE8D6', borderRadius:10, padding:'8px 12px', marginBottom:10 }}>
          ✓ These are booked — find them on your Calendar and in the matching day of your Week.
        </div>
      )}

      {visible.length === 0 ? (
        <div style={{ background:'white', borderRadius:12, border:'1px solid var(--border)', padding:24, textAlign:'center' }}>
          <div style={{ fontSize:28, marginBottom:8 }}>🤝</div>
          <div style={{ fontSize:13, color:'var(--muted)' }}>{emptyMessage[filter]}</div>
        </div>
      ) : visible.map(c => (
        <CommitCard
          key={c.id} c={c} todos={todos} weekState={weekState}
          syncToggle={syncToggle} onDelete={deleteCommitment}
          onSchedule={handleSchedule} scheduled={scheduled}
          categories={categories}
        />
      ))}
    </div>
  )
}
