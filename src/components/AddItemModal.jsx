// src/components/AddItemModal.jsx
// A shared "add something to the calendar" sheet used by both the Today tab
// (locked to today) and the Calendar tab (any date). It creates a commitment
// — which shows on the Calendar + Week and feeds reminders — and lets you set
// a start time, a duration, and (optionally) custom reminder lead times that
// override the global defaults just for this item.
import { useState } from 'react'
import { LEAD_OPTIONS } from '../lib/notifications.js'

const DEFAULT_CATEGORIES = [{ id:'other', label:'Other', color:'#8899AA' }]

const DURATIONS = [
  { label:'—',       value:'' },
  { label:'15 min',  value:'15' },
  { label:'30 min',  value:'30' },
  { label:'45 min',  value:'45' },
  { label:'1 hour',  value:'60' },
  { label:'1.5 hrs', value:'90' },
  { label:'2 hours', value:'120' },
  { label:'3 hours', value:'180' },
  { label:'4 hours', value:'240' },
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

export default function AddItemModal({ presetDate = null, lockDate = false, categories = [], onSave, onClose, title = 'Add to calendar' }) {
  const cats = (categories && categories.length) ? categories : DEFAULT_CATEGORIES
  const [label, setLabel]         = useState('')
  const [date, setDate]           = useState(presetDate || '')
  const [time, setTime]           = useState('')
  const [durationMins, setDur]    = useState('')
  const [cat, setCat]             = useState(cats[0]?.id || 'other')
  // Reminders: default (use global) unless the user customizes.
  const [useDefault, setUseDefault] = useState(true)
  const [reminders, setReminders]   = useState([])

  const canSave = label.trim() && date

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
      durationMins: durationMins ? parseInt(durationMins) : null,
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

        <div style={{ display:'flex', gap:8, marginBottom:12 }}>
          <div style={{ flex:1 }}>
            <div style={fieldLabel}>Start time</div>
            <input type="time" value={time} onChange={e => setTime(e.target.value)} style={inp} />
          </div>
          <div style={{ flex:1 }}>
            <div style={fieldLabel}>Duration</div>
            <select value={durationMins} onChange={e => setDur(e.target.value)} style={{ ...inp, background:'white', cursor:'pointer' }}>
              {DURATIONS.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
            </select>
          </div>
        </div>
        {time && durationMins && (
          <div style={{ fontSize:11, color:'var(--muted)', marginTop:-6, marginBottom:12 }}>
            {fmt12(time)} – {fmt12((() => { const [h,m]=time.split(':').map(Number); const t=Math.min(h*60+m+parseInt(durationMins), 23*60+59); return `${String(Math.floor(t/60)).padStart(2,'0')}:${String(t%60).padStart(2,'0')}` })())}
          </div>
        )}

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
