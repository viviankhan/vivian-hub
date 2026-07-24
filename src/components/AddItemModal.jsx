// src/components/AddItemModal.jsx
// A shared "add something to the calendar" sheet used by both the Today tab
// (locked to today) and the Calendar tab (any date). It creates a commitment
// — which shows on the Calendar + Week and feeds reminders — and lets you set
// a start time and end time (with quick-duration buttons that fill the end
// from the start), plus optional custom reminder lead times that override the
// global defaults just for this item.
import { useState } from 'react'
import { LEAD_OPTIONS } from '../lib/notifications.js'

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

export default function AddItemModal({ presetDate = null, lockDate = false, categories = [], onSave, onClose, title = 'Add to calendar' }) {
  const cats = (categories && categories.length) ? categories : DEFAULT_CATEGORIES
  const [label, setLabel]         = useState('')
  const [date, setDate]           = useState(presetDate || '')
  const [time, setTime]           = useState('')  // start
  const [endTime, setEndTime]     = useState('')
  const [cat, setCat]             = useState(cats[0]?.id || 'other')
  // Reminders: default (use global) unless the user customizes.
  const [useDefault, setUseDefault] = useState(true)
  const [reminders, setReminders]   = useState([])

  const durationMins = diffMinutes(time, endTime)          // null unless a valid span
  const endInvalid = !!(time && endTime && !durationMins)  // end set but ≤ start
  const canSave = !!(label.trim() && date) && !endInvalid

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
    const commitment = {
      id: 'c-' + Date.now(),
      text: label.trim(),
      date,
      time: time || null,
      durationMins: durationMins || null,
      prepMin: null,
      cat,
      person: null,
      done: false,
      createdAt: new Date().toISOString(),
    }
    // null → use global defaults; otherwise this item's own lead-minute list.
    onSave(commitment, useDefault ? null : reminders)
    onClose()
  }

  return (
    <div onClick={onClose}
      style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.4)', zIndex:600, display:'flex', alignItems:'flex-end', justifyContent:'center', padding:16 }}>
      <div onClick={e => e.stopPropagation()}
        style={{ background:'white', borderRadius:16, padding:20, maxWidth:440, width:'100%', maxHeight:'86vh', overflowY:'auto', boxShadow:'0 -8px 40px rgba(0,0,0,.15)' }}>
        <div className="serif" style={{ fontSize:18, fontWeight:600, marginBottom:14, color:'var(--text)' }}>{title}</div>

        <input value={label} onChange={e => setLabel(e.target.value)} placeholder="What's happening?" autoFocus
          onKeyDown={e => e.key === 'Enter' && submit()} style={{ ...inp, marginBottom:12 }} />

        {/* Date — editable unless the caller locked it (Today) */}
        {lockDate ? (
          <div style={{ fontSize:13, color:'var(--muted)', marginBottom:12 }}>📅 {prettyDate(date)}</div>
        ) : (
          <div style={{ marginBottom:12 }}>
            <div style={fieldLabel}>Date</div>
            <input type="date" value={date} onChange={e => setDate(e.target.value)} style={inp} />
          </div>
        )}

        <div style={{ display:'flex', gap:8, marginBottom:8 }}>
          <div style={{ flex:1 }}>
            <div style={fieldLabel}>Start time</div>
            <input type="time" value={time} onChange={e => onStartChange(e.target.value)} style={inp} />
          </div>
          <div style={{ flex:1 }}>
            <div style={fieldLabel}>End time</div>
            <input type="time" value={endTime} onChange={e => setEndTime(e.target.value)} style={{ ...inp, borderColor: endInvalid ? '#DC2626' : 'var(--border)' }} />
          </div>
        </div>

        {/* Quick-set the end time as a duration after the start */}
        <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginBottom:4 }}>
          {QUICK_DURATIONS.map(q => {
            const on = durationMins === q.mins
            return (
              <button key={q.mins} onClick={() => setQuickDuration(q.mins)} disabled={!time}
                title={time ? `End at ${fmt12(addMinutes(time, q.mins))}` : 'Set a start time first'}
                style={{ fontSize:11, padding:'4px 11px', borderRadius:16, cursor: time ? 'pointer' : 'not-allowed', fontFamily:'DM Sans,sans-serif', fontWeight:600,
                  border: on ? 'none' : '1px solid var(--border)',
                  background: on ? 'var(--teal)' : 'white',
                  color: on ? 'white' : (time ? 'var(--muted)' : '#C7CDD4') }}>
                {q.label}
              </button>
            )
          })}
        </div>
        <div style={{ fontSize:11, color: endInvalid ? '#DC2626' : 'var(--muted)', marginBottom:12, minHeight:15 }}>
          {endInvalid
            ? 'End time must be after the start time.'
            : (time && durationMins)
              ? `${fmt12(time)} – ${fmt12(endTime)} · ${prettyDur(durationMins)}`
              : (!time ? 'Pick a start time, then tap a duration to set the end.' : '')}
        </div>

        {/* Category */}
        <div style={{ marginBottom:14 }}>
          <div style={fieldLabel}>Category</div>
          <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
            {cats.map(c => (
              <button key={c.id} onClick={() => setCat(c.id)}
                style={{ fontSize:11, padding:'4px 12px', borderRadius:20, border: cat === c.id ? 'none' : '1px solid var(--border)', background: cat === c.id ? c.color : 'white', color: cat === c.id ? 'white' : 'var(--muted)', cursor:'pointer', fontFamily:'DM Sans,sans-serif', fontWeight: cat === c.id ? 600 : 400 }}>
                {c.label}
              </button>
            ))}
          </div>
        </div>

        {/* Reminders */}
        <div style={{ marginBottom:16 }}>
          <div style={fieldLabel}>Remind me</div>
          <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
            <button onClick={chooseDefault}
              style={{ fontSize:11, padding:'5px 12px', borderRadius:20, cursor:'pointer', fontFamily:'DM Sans,sans-serif', fontWeight:600,
                border: useDefault ? 'none' : '1px solid var(--border)',
                background: useDefault ? 'var(--forest)' : 'white', color: useDefault ? 'var(--green-light)' : 'var(--muted)' }}>
              {useDefault ? '✓ ' : ''}Default
            </button>
            {LEAD_OPTIONS.map(opt => {
              const on = !useDefault && reminders.includes(opt.mins)
              return (
                <button key={opt.mins} onClick={() => toggleLead(opt.mins)}
                  style={{ fontSize:11, padding:'5px 12px', borderRadius:20, cursor:'pointer', fontFamily:'DM Sans,sans-serif', fontWeight:600,
                    border: on ? 'none' : '1px solid var(--border)',
                    background: on ? 'var(--forest)' : 'white', color: on ? 'var(--green-light)' : 'var(--muted)' }}>
                  {on ? '✓ ' : ''}{opt.label}
                </button>
              )
            })}
          </div>
          <div style={{ fontSize:10.5, color:'var(--muted)', marginTop:6 }}>
            {useDefault
              ? 'Uses your default reminder times (Settings → Reminders).'
              : reminders.length
                ? `This item only: ${reminders.map(m => LEAD_OPTIONS.find(o => o.mins===m)?.label || m+'m').join(', ')} before.`
                : 'No reminders for this item.'}
          </div>
        </div>

        <div style={{ display:'flex', gap:8 }}>
          <button onClick={submit} disabled={!canSave}
            style={{ flex:1, padding:'11px', borderRadius:10, border:'none', background: canSave ? 'var(--forest)' : '#E5E7EB', color: canSave ? 'var(--green-light)' : '#9CA3AF', cursor: canSave ? 'pointer' : 'default', fontFamily:'DM Sans,sans-serif', fontWeight:600, fontSize:14 }}>
            Add
          </button>
          <button onClick={onClose}
            style={{ padding:'11px 16px', borderRadius:10, border:'1px solid var(--border)', background:'white', color:'var(--muted)', cursor:'pointer', fontSize:13, fontFamily:'DM Sans,sans-serif' }}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
