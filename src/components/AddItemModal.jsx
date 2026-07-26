// src/components/AddItemModal.jsx
// A shared "add something to the calendar" sheet used by both the Today tab
// (locked to today) and the Calendar tab (any date). It creates a commitment
// — which shows on the Calendar + Week and feeds reminders — and lets you set
// a start time and end time (with quick-duration buttons that fill the end
// from the start), plus optional custom reminder lead times that override the
// global defaults just for this item.
import { useState } from 'react'
import DateField from './DateField.jsx'
import TimeField from './TimeField.jsx'
import { Icon } from './IconPicker.jsx'
import { LEAD_OPTIONS, getItemReminders, getItemSound, setItemSound } from '../lib/notifications.js'
import { SOUNDS, playSound } from '../lib/sounds.js'

const DEFAULT_CATEGORIES = [{ id:'other', label:'Other', color:'#8899AA' }]

// Quick-set buttons: each fills in the end time as (start + this many minutes).
const QUICK_DURATIONS = [
  { label:'15m',  mins:15 },
  { label:'30m',  mins:30 },
  { label:'45m',  mins:45 },
  { label:'1h',   mins:60 },
  { label:'1.5h', mins:90 },
  { label:'2h',   mins:120 },
  { label:'3h',   mins:180 },
]

// A per-task color palette (overrides the label color when picked).
const TASK_COLORS = ['#E0A33E','#C4728E','#EC6F9C','#7C9CBF','#4A9EB5','#52B788','#2A9D8F','#7C3AED','#E07B2E','#EF6B6B','#6B7A8D','#111827']

const inp = { width:'100%', fontSize:14, padding:'10px 12px', borderRadius:10, border:'1px solid var(--border)', fontFamily:'DM Sans,sans-serif', outline:'none', boxSizing:'border-box' }
const fieldLabel = { fontSize:10, color:'var(--muted)', letterSpacing:1, textTransform:'uppercase', marginBottom:4 }

function fmt12(t) {
  if (!t) return ''
  const [h, m] = t.split(':').map(Number)
  return `${h % 12 || 12}:${String(m).padStart(2,'0')} ${h >= 12 ? 'PM' : 'AM'}`
}
function prettyDate(dateStr) {
  if (!dateStr) return ''
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', { weekday:'long', month:'long', day:'numeric' })
}
// Add minutes to "HH:MM" → "HH:MM" (clamped within the day).
function addMinutes(time, mins) {
  if (!time) return ''
  const [h, m] = time.split(':').map(Number)
  const t = Math.max(0, Math.min(h * 60 + m + mins, 23 * 60 + 59))
  return `${String(Math.floor(t/60)).padStart(2,'0')}:${String(t%60).padStart(2,'0')}`
}
// Minutes between two "HH:MM" strings (end - start); null if invalid/negative.
function diffMinutes(start, end) {
  if (!start || !end) return null
  const [sh, sm] = start.split(':').map(Number)
  const [eh, em] = end.split(':').map(Number)
  const d = (eh * 60 + em) - (sh * 60 + sm)
  return d > 0 ? d : null
}
function prettyDur(mins) {
  if (!mins) return ''
  if (mins < 60) return `${mins} min`
  return mins % 60 === 0 ? `${mins/60} h` : `${(mins/60).toFixed(1)} h`
}

// ── Grouped detail-sheet building blocks (Structured-style) ────────
const ROW_ACCENT = '#3E9C86'  // calm green for the row icons

function IconCircle({ children, color = ROW_ACCENT }) {
  return (
    <span style={{ width:30, height:30, borderRadius:'50%', flexShrink:0, background:`${color}20`, color, display:'inline-flex', alignItems:'center', justifyContent:'center' }}>
      {children}
    </span>
  )
}
function Chevron({ open }) {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="#C2C7D0" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"
      style={{ transform: open ? 'rotate(90deg)' : 'none', transition:'transform .2s' }} aria-hidden="true">
      <polyline points="9 6 15 12 9 18" />
    </svg>
  )
}
const CalIcon   = () => (<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="4.5" width="18" height="16" rx="3"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="8" y1="2.5" x2="8" y2="6"/><line x1="16" y1="2.5" x2="16" y2="6"/></svg>)
const ClockIcon = () => (<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><polyline points="12 7.5 12 12 15.5 14"/></svg>)
const TagIcon   = () => (<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.5 13.3 12.7 21a2 2 0 0 1-2.8 0l-6.9-6.9a2 2 0 0 1-.6-1.4V4.5a2 2 0 0 1 2-2h7.2a2 2 0 0 1 1.4.6l7 7a2 2 0 0 1 0 2.6Z"/><circle cx="7.6" cy="7.6" r="1.3"/></svg>)
const BellIcon  = () => (<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9a6 6 0 0 1 12 0c0 5.5 2.3 6.8 2.3 6.8H3.7S6 14.5 6 9Z"/><path d="M10 20a2 2 0 0 0 4 0"/></svg>)

// A tappable grouped-list row: [icon] main text … [hint] [chevron], with an
// optional expanded body underneath.
function DetailRow({ icon, iconColor, text, textMuted, hint, open, onClick, children }) {
  return (
    <div>
      <div onClick={onClick}
        style={{ display:'flex', alignItems:'center', gap:12, padding:'13px 15px', cursor: onClick ? 'pointer' : 'default', userSelect:'none' }}>
        <IconCircle color={iconColor}>{icon}</IconCircle>
        <span style={{ fontSize:15, fontWeight:500, color: textMuted ? 'var(--muted)' : 'var(--text)', minWidth:0, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{text}</span>
        <span style={{ marginLeft:'auto', display:'inline-flex', alignItems:'center', gap:7, flexShrink:0 }}>
          {hint && <span style={{ fontSize:13, color:'var(--muted)' }}>{hint}</span>}
          {onClick && <Chevron open={open} />}
        </span>
      </div>
      {open && <div style={{ padding:'2px 15px 15px 15px' }}>{children}</div>}
    </div>
  )
}
const RowDivider = () => <div style={{ height:1, background:'#EEEAF1', marginLeft:57 }} />

// Short relative label for the date row ("Today", "Tomorrow", weekday).
function relativeDay(dateStr) {
  if (!dateStr) return null
  const d = new Date(dateStr + 'T12:00:00')
  const t = new Date(); t.setHours(12,0,0,0)
  const diff = Math.round((d - t) / 86400000)
  if (diff === 0) return 'Today'
  if (diff === 1) return 'Tomorrow'
  if (diff === -1) return 'Yesterday'
  if (diff > 1 && diff < 7) return d.toLocaleDateString('en-US', { weekday:'long' })
  return null
}

export default function AddItemModal({ existing = null, presetDate = null, presetText = '', lockDate = false, categories = [], onSave, onClose, title = 'Add to calendar' }) {
  const cats = (categories && categories.length) ? categories : DEFAULT_CATEGORIES
  const isEdit = !!existing
  const [label, setLabel]         = useState(existing?.text || presetText || '')
  const [date, setDate]           = useState(existing?.date || presetDate || '')
  const [time, setTime]           = useState(existing?.time || '')  // start
  const [endTime, setEndTime]     = useState(existing?.time && existing?.durationMins ? addMinutes(existing.time, existing.durationMins) : '')
  // One or more category labels. The first stays the "primary" — it drives the
  // color dot, scheduling behavior, and everything that still reads a single
  // `cat`. Extra labels are purely additional tags.
  const [selectedCats, setSelectedCats] = useState(() => {
    if (Array.isArray(existing?.cats) && existing.cats.length) return existing.cats
    return [existing?.cat || cats[0]?.id || 'other']
  })
  const toggleCat = (id) => setSelectedCats(prev =>
    prev.includes(id)
      ? (prev.length > 1 ? prev.filter(c => c !== id) : prev)  // keep at least one
      : [...prev, id]
  )
  const [description, setDescription] = useState(existing?.description || '')
  const [subtasks, setSubtasks]   = useState(() => Array.isArray(existing?.subtasks) ? existing.subtasks : [])
  const [newSub, setNewSub]       = useState('')
  // Reminders: default (use global) unless the user customizes. When editing,
  // prefill from the item's saved override.
  const existingReminders = isEdit ? getItemReminders(existing.id) : null
  const [useDefault, setUseDefault] = useState(!existingReminders)
  const [reminders, setReminders]   = useState(existingReminders || [])

  // ── Sub-checkbox helpers ─────────────────────────────────────
  const addSub = () => {
    if (!newSub.trim()) return
    setSubtasks(prev => [...prev, { id: 'st-' + Date.now(), text: newSub.trim(), done: false }])
    setNewSub('')
  }
  const toggleSub = (id) => setSubtasks(prev => prev.map(s => s.id === id ? { ...s, done: !s.done } : s))
  const editSub   = (id, text) => setSubtasks(prev => prev.map(s => s.id === id ? { ...s, text } : s))
  const removeSub = (id) => setSubtasks(prev => prev.filter(s => s.id !== id))

  // Optional per-task color. Empty = inherit the primary label's color.
  const [color, setColor] = useState(existing?.color || '')
  // In-app alert sound for this item's reminders (device-local).
  const [sound, setSound] = useState(() => getItemSound(existing?.id) || 'chime')

  // Which grouped row is expanded for editing (only one open at a time).
  const [expanded, setExpanded] = useState(null)
  const toggleRow = (k) => setExpanded(e => (e === k ? null : k))

  const durationMins = diffMinutes(time, endTime)          // null unless a valid span
  const endInvalid = !!(time && endTime && !durationMins)  // end set but ≤ start
  // Date is optional — a task with no date is a valid "unscheduled" commitment
  // (used by the Commitments tab). Today/Calendar preset or lock the date.
  const canSave = !!label.trim() && !endInvalid

  // Quick-set: fill the end time as start + N minutes. Needs a start time.
  const setQuickDuration = (mins) => {
    if (!time) return
    setEndTime(addMinutes(time, mins))
  }
  // If they set/adjust the start after picking an end, keep the same duration
  // by shifting the end along with it (feels like "move the block").
  const onStartChange = (v) => {
    const keep = durationMins
    setTime(v)
    if (v && keep) setEndTime(addMinutes(v, keep))
  }

  const toggleLead = (mins) => {
    // Choosing a specific lead switches this item off the global defaults.
    if (useDefault) { setUseDefault(false); setReminders([mins]); return }
    setReminders(prev => prev.includes(mins) ? prev.filter(m => m !== mins) : [...prev, mins].sort((a,b)=>b-a))
  }
  const chooseDefault = () => { setUseDefault(true); setReminders([]) }

  const submit = () => {
    if (!canSave) return
    const base = existing
      ? { ...existing }
      : { id: 'c-' + Date.now(), prepMin: null, person: null, done: false, createdAt: new Date().toISOString() }
    const commitment = {
      ...base,
      text: label.trim(),
      date: date || null,
      time: time || null,
      durationMins: durationMins || null,
      cat: selectedCats[0],
      cats: selectedCats,
      color: color || null,
      description: description.trim() || '',
      subtasks,
    }
    setItemSound(commitment.id, sound)
    // null → use global defaults; otherwise this item's own lead-minute list.
    onSave(commitment, useDefault ? null : reminders, isEdit)
    onClose()
  }

  // Primary label drives the header color + icon.
  const primaryCat = cats.find(c => c.id === selectedCats[0]) || cats[0] || { color:'#4A9EB5', label:'', icon:'' }
  const headerColor = color || primaryCat.color || '#4A9EB5'
  const isCustomColor = !!color && !TASK_COLORS.includes(color)
  const labelNames = selectedCats.map(id => (cats.find(c => c.id === id)?.label) || id)
  const card = { background:'white', borderRadius:16, boxShadow:'0 1px 4px rgba(60,72,88,.06)', marginBottom:16, overflow:'hidden' }
  const baseRemind = useDefault ? 'Default' : (reminders.length ? `${reminders.length} alert${reminders.length>1?'s':''}` : 'No alerts')
  const soundLabel = (SOUNDS.find(s => s.id === sound) || {}).label || 'Chime'
  const remindText = sound === 'none' ? baseRemind : `${baseRemind} · ${soundLabel}`

  return (
    <div onClick={onClose}
      style={{ position:'fixed', inset:0, background:'rgba(20,28,38,.5)', zIndex:600, display:'flex', alignItems:'flex-end', justifyContent:'center' }}>
      <div onClick={e => e.stopPropagation()}
        style={{ background:'#F3F2F6', borderRadius:'22px 22px 0 0', width:'100%', maxWidth:480, minWidth:0, maxHeight:'94vh', overflowY:'auto', overflowX:'hidden', boxShadow:'0 -10px 44px rgba(20,40,60,.28)' }}>

        {/* ── Colored header band ─────────────────────────────── */}
        <div style={{ background:headerColor, backgroundImage:'linear-gradient(158deg, rgba(255,255,255,.14), rgba(0,0,0,.20))', padding:'14px 16px 20px' }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:14 }}>
            <button onClick={onClose} aria-label="Close"
              style={{ width:34, height:34, borderRadius:'50%', border:'none', background:'rgba(255,255,255,.28)', color:'white', fontSize:16, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>✕</button>
            <span style={{ fontSize:11, letterSpacing:1.5, textTransform:'uppercase', color:'rgba(255,255,255,.85)', fontWeight:600 }}>{isEdit ? 'Edit' : title}</span>
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:13 }}>
            {primaryCat.icon && (
              <div style={{ width:52, height:52, borderRadius:16, flexShrink:0, background:'rgba(255,255,255,.22)', border:'2px solid rgba(255,255,255,.7)', display:'flex', alignItems:'center', justifyContent:'center' }}>
                <Icon value={primaryCat.icon} size={26} />
              </div>
            )}
            <div style={{ flex:1, minWidth:0 }}>
              {time && <div style={{ fontSize:12.5, color:'rgba(255,255,255,.9)', fontWeight:600, marginBottom:1 }}>{fmt12(time)}{endTime && durationMins ? ` – ${fmt12(endTime)}` : ''}</div>}
              <input value={label} onChange={e => setLabel(e.target.value)} placeholder="What's happening?" autoFocus={!isEdit}
                onKeyDown={e => e.key === 'Enter' && canSave && submit()}
                style={{ width:'100%', background:'transparent', border:'none', borderBottom:'1px solid rgba(255,255,255,.45)', color:'white', fontSize:21, fontWeight:700, fontFamily:'DM Sans,sans-serif', outline:'none', padding:'3px 0' }} />
            </div>
          </div>
        </div>

        <div style={{ padding:'16px 14px calc(20px + env(safe-area-inset-bottom))' }}>
          {/* ── Scheduling rows ───────────────────────────────── */}
          <div style={card}>
            {/* Date */}
            <DetailRow icon={<CalIcon />} text={date ? prettyDate(date) : 'Add a date'} textMuted={!date}
              hint={relativeDay(date)} open={expanded==='date'}
              onClick={lockDate ? undefined : () => toggleRow('date')}>
              <DateField value={date} onChange={setDate} style={inp} />
            </DetailRow>
            <RowDivider />
            {/* Time */}
            <DetailRow icon={<ClockIcon />} text={time ? `${fmt12(time)}${endTime && durationMins ? ' – '+fmt12(endTime) : ''}` : 'Add a time'} textMuted={!time}
              open={expanded==='time'} onClick={() => toggleRow('time')}>
              <div style={{ display:'flex', gap:8, marginBottom:8 }}>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={fieldLabel}>Start</div>
                  <TimeField value={time} onChange={onStartChange} style={inp} />
                </div>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={fieldLabel}>End</div>
                  <TimeField value={endTime} onChange={setEndTime} style={{ ...inp, borderColor: endInvalid ? '#DC2626' : 'var(--border)' }} />
                </div>
              </div>
              <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
                {QUICK_DURATIONS.map(q => {
                  const on = durationMins === q.mins
                  return (
                    <button key={q.mins} onClick={() => setQuickDuration(q.mins)} disabled={!time}
                      style={{ fontSize:11, padding:'4px 11px', borderRadius:16, cursor: time ? 'pointer' : 'not-allowed', fontFamily:'DM Sans,sans-serif', fontWeight:600,
                        border: on ? 'none' : '1px solid var(--border)', background: on ? 'var(--teal)' : 'white', color: on ? 'white' : (time ? 'var(--muted)' : '#C7CDD4') }}>
                      {q.label}
                    </button>
                  )
                })}
              </div>
              <div style={{ fontSize:11, color: endInvalid ? '#DC2626' : 'var(--muted)', marginTop:8 }}>
                {endInvalid ? 'End time must be after the start time.'
                  : (time && durationMins) ? `${prettyDur(durationMins)} long`
                  : (!time ? 'Type a start time, then tap a duration.' : '')}
              </div>
            </DetailRow>
            <RowDivider />
            {/* Labels */}
            <DetailRow icon={<TagIcon />} iconColor={headerColor} text={labelNames.join(', ')}
              hint={selectedCats.length > 1 ? `${selectedCats.length}` : null}
              open={expanded==='labels'} onClick={() => toggleRow('labels')}>
              <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
                {cats.map(c => {
                  const on = selectedCats.includes(c.id)
                  const primary = selectedCats[0] === c.id
                  return (
                    <button key={c.id} onClick={() => toggleCat(c.id)}
                      style={{ fontSize:11, padding:'5px 12px', borderRadius:20, border: on ? 'none' : '1px solid var(--border)', background: on ? c.color : 'white', color: on ? 'white' : 'var(--muted)', cursor:'pointer', fontFamily:'DM Sans,sans-serif', fontWeight: on ? 600 : 400, boxShadow: primary ? '0 0 0 2px rgba(0,0,0,.16)' : 'none' }}>
                      {on ? '✓ ' : ''}{c.label}
                    </button>
                  )
                })}
              </div>
              {selectedCats.length > 1 && (
                <div style={{ fontSize:10.5, color:'var(--muted)', marginTop:7 }}>The outlined label is the primary — it sets the color and scheduling.</div>
              )}
            </DetailRow>
            <RowDivider />
            {/* Color */}
            <DetailRow icon={<span style={{ width:15, height:15, borderRadius:'50%', background:headerColor }} />} iconColor={headerColor}
              text="Color" hint={color ? 'Custom' : 'From label'} open={expanded==='color'} onClick={() => toggleRow('color')}>
              <div style={{ display:'flex', gap:9, flexWrap:'wrap', alignItems:'center' }}>
                {TASK_COLORS.map(cx => (
                  <button key={cx} onClick={() => setColor(cx)} aria-label={`Color ${cx}`}
                    style={{ width:28, height:28, borderRadius:'50%', background:cx, cursor:'pointer', padding:0,
                      border: color===cx ? '3px solid white' : '3px solid transparent',
                      boxShadow: color===cx ? `0 0 0 2px ${cx}` : '0 0 0 1px rgba(0,0,0,.10)' }} />
                ))}
                {/* Any custom color via the native color wheel */}
                <label title="Custom color" style={{ width:28, height:28, borderRadius:'50%', cursor:'pointer', position:'relative', overflow:'hidden', display:'inline-block',
                  background: isCustomColor ? color : 'conic-gradient(from 90deg, #EF6B6B, #E0A33E, #52B788, #4A9EB5, #7C3AED, #EC6F9C, #EF6B6B)',
                  border: isCustomColor ? '3px solid white' : '3px solid transparent',
                  boxShadow: isCustomColor ? `0 0 0 2px ${color}` : '0 0 0 1px rgba(0,0,0,.10)' }}>
                  <input type="color" value={color || '#4A9EB5'} onChange={e => setColor(e.target.value)}
                    style={{ position:'absolute', top:'-40%', left:'-40%', width:'180%', height:'180%', opacity:0, cursor:'pointer', border:'none', padding:0 }} />
                </label>
              </div>
              <button onClick={() => setColor('')}
                style={{ marginTop:11, fontSize:11, padding:'5px 12px', borderRadius:16, cursor:'pointer', fontFamily:'DM Sans,sans-serif', fontWeight:600,
                  border: color ? '1px solid var(--border)' : 'none', background: color ? 'white' : 'var(--forest)', color: color ? 'var(--muted)' : 'var(--green-light)' }}>
                {color ? 'Match label color' : '✓ Matching label color'}
              </button>
            </DetailRow>
            <RowDivider />
            {/* Reminders */}
            <DetailRow icon={<BellIcon />} text="Remind me" hint={remindText}
              open={expanded==='remind'} onClick={() => toggleRow('remind')}>
              <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
                <button onClick={chooseDefault}
                  style={{ fontSize:11, padding:'5px 12px', borderRadius:20, cursor:'pointer', fontFamily:'DM Sans,sans-serif', fontWeight:600, border: useDefault ? 'none' : '1px solid var(--border)', background: useDefault ? 'var(--forest)' : 'white', color: useDefault ? 'var(--green-light)' : 'var(--muted)' }}>
                  {useDefault ? '✓ ' : ''}Default
                </button>
                {LEAD_OPTIONS.map(opt => {
                  const on = !useDefault && reminders.includes(opt.mins)
                  return (
                    <button key={opt.mins} onClick={() => toggleLead(opt.mins)}
                      style={{ fontSize:11, padding:'5px 12px', borderRadius:20, cursor:'pointer', fontFamily:'DM Sans,sans-serif', fontWeight:600, border: on ? 'none' : '1px solid var(--border)', background: on ? 'var(--forest)' : 'white', color: on ? 'var(--green-light)' : 'var(--muted)' }}>
                      {on ? '✓ ' : ''}{opt.label}
                    </button>
                  )
                })}
              </div>
              <div style={{ fontSize:10.5, color:'var(--muted)', marginTop:7 }}>
                {useDefault ? 'Uses your default reminder times (Settings → Reminders).'
                  : reminders.length ? `This item only: ${reminders.map(m => LEAD_OPTIONS.find(o => o.mins===m)?.label || m+'m').join(', ')} before.`
                  : 'No reminders for this item.'}
              </div>
              {/* Sound — tap to choose + preview */}
              <div style={{ fontSize:10, color:'var(--muted)', letterSpacing:1, textTransform:'uppercase', margin:'14px 0 6px' }}>Sound</div>
              <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
                {SOUNDS.map(s => {
                  const on = sound === s.id
                  return (
                    <button key={s.id} onClick={() => { setSound(s.id); if (s.id !== 'none') playSound(s.id) }}
                      style={{ fontSize:11, padding:'5px 12px', borderRadius:20, cursor:'pointer', fontFamily:'DM Sans,sans-serif', fontWeight:600, border: on ? 'none' : '1px solid var(--border)', background: on ? 'var(--forest)' : 'white', color: on ? 'var(--green-light)' : 'var(--muted)' }}>
                      {on ? '♪ ' : ''}{s.label}
                    </button>
                  )
                })}
              </div>
              <div style={{ fontSize:10.5, color:'var(--muted)', marginTop:6 }}>Plays in-app when a reminder fires. Your phone controls the system notification sound.</div>
            </DetailRow>
          </div>

          {/* ── Subtasks + notes ──────────────────────────────── */}
          <div style={{ ...card, padding:'6px 15px 14px' }}>
            {subtasks.map(s => (
              <div key={s.id} style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 0', borderBottom:'1px solid #F1EDF2' }}>
                <div onClick={() => toggleSub(s.id)}
                  style={{ width:20, height:20, borderRadius:6, flexShrink:0, cursor:'pointer', border: s.done ? 'none' : '2px solid #CDD3DA', background: s.done ? ROW_ACCENT : 'transparent', display:'flex', alignItems:'center', justifyContent:'center' }}>
                  {s.done && <span style={{ color:'white', fontSize:12, fontWeight:700 }}>✓</span>}
                </div>
                <input value={s.text} onChange={e => editSub(s.id, e.target.value)}
                  style={{ flex:1, minWidth:0, fontSize:14, padding:'2px 0', border:'none', background:'transparent', fontFamily:'DM Sans,sans-serif', outline:'none', textDecoration: s.done ? 'line-through' : 'none', color: s.done ? 'var(--muted)' : 'var(--text)' }} />
                <button onClick={() => removeSub(s.id)} style={{ background:'none', border:'none', cursor:'pointer', color:'#CBD0D8', fontSize:16, padding:'0 2px', flexShrink:0 }}>✕</button>
              </div>
            ))}
            <div style={{ display:'flex', alignItems:'center', gap:10, padding:'9px 0 6px' }}>
              <div style={{ width:20, height:20, borderRadius:6, flexShrink:0, border:'2px solid #DBDFE5' }} />
              <input value={newSub} onChange={e => setNewSub(e.target.value)} placeholder="Add subtask"
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addSub() } }}
                style={{ flex:1, minWidth:0, fontSize:14, padding:'2px 0', border:'none', background:'transparent', fontFamily:'DM Sans,sans-serif', outline:'none', color:'var(--text)' }} />
              {newSub.trim() && (
                <button onClick={addSub} style={{ fontSize:12, padding:'5px 11px', borderRadius:14, border:'none', background:ROW_ACCENT, color:'white', cursor:'pointer', fontFamily:'DM Sans,sans-serif', fontWeight:600, flexShrink:0 }}>Add</button>
              )}
            </div>
            <div style={{ height:1, background:'#F1EDF2', margin:'6px 0 4px' }} />
            <textarea value={description} onChange={e => setDescription(e.target.value)}
              placeholder="Add notes, details, anything to remember…" rows={3}
              style={{ width:'100%', minHeight:0, fontSize:14, padding:'8px 0 2px', border:'none', background:'transparent', resize:'vertical', lineHeight:1.5, fontFamily:'DM Sans,sans-serif', outline:'none', color:'var(--text)' }} />
          </div>

          {/* ── Save ──────────────────────────────────────────── */}
          <button onClick={submit} disabled={!canSave}
            style={{ width:'100%', padding:'14px', borderRadius:14, border:'none', background: canSave ? headerColor : '#E1E1E6', color: canSave ? 'white' : '#9CA3AF', cursor: canSave ? 'pointer' : 'default', fontFamily:'DM Sans,sans-serif', fontWeight:700, fontSize:15, letterSpacing:.3 }}>
            {isEdit ? 'Save changes' : title}
          </button>
        </div>
      </div>
    </div>
  )
}
