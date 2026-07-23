// src/components/EventsManager.jsx
// The "Events" tab. Holds two kinds of multi-day spans:
//   • Events (e.g. "Immunology Retreat") — a colored band on the calendar
//     that does NOT block scheduling tasks within it.
//   • Vacations / time off — spans that pause recurring tasks (as before).
import { useState } from 'react'
import { IconPicker, Icon } from './IconPicker.jsx'

const EVENT_COLORS = ['#7C9CBF','#059669','#7C3AED','#D97706','#C4728E','#3B82F6','#E07B2E','#52B788','#EF4444','#A855F7']

function fmtRange(s, e) {
  const sd = new Date(s + 'T12:00:00').toLocaleDateString('en-US', { month:'short', day:'numeric' })
  const ed = new Date(e + 'T12:00:00').toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' })
  return s === e ? ed : `${sd} – ${ed}`
}
function fmt12(t) {
  if (!t) return ''
  const [h, m] = t.split(':').map(Number)
  return `${h % 12 || 12}:${String(m).padStart(2,'0')} ${h >= 12 ? 'PM' : 'AM'}`
}

const inp = { width:'100%', fontSize:12, padding:'8px 10px', borderRadius:10, border:'1px solid var(--border)', fontFamily:'DM Sans,sans-serif', boxSizing:'border-box', color:'var(--text)' }
const fieldLabel = { fontSize:10, color:'var(--muted)', letterSpacing:1, textTransform:'uppercase', marginBottom:4 }

// ── Multi-day events ───────────────────────────────────────────
function EventSection({ events, addEvent, deleteEvent }) {
  const [open, setOpen] = useState(false)
  const [label, setLabel] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [allDay, setAllDay] = useState(true)
  const [startTime, setStartTime] = useState('')
  const [endTime, setEndTime] = useState('')
  const [color, setColor] = useState(EVENT_COLORS[0])
  const [icon, setIcon] = useState('')
  // Events used to delete on a single ✕ tap — no confirm, no undo — which is
  // the most likely way an event (like a retreat) vanished by accident. Now a
  // delete asks first, and the last-deleted one can be brought straight back.
  const [confirmId, setConfirmId] = useState(null)
  const [justDeleted, setJustDeleted] = useState(null)

  const reset = () => { setLabel(''); setStartDate(''); setEndDate(''); setAllDay(true); setStartTime(''); setEndTime(''); setColor(EVENT_COLORS[0]); setIcon(''); setOpen(false) }
  const canSave = label.trim() && startDate && endDate && endDate >= startDate

  const submit = () => {
    if (!canSave) return
    addEvent({
      id: 'ev-' + Date.now(), label: label.trim(), startDate, endDate,
      allDay, startTime: allDay ? null : (startTime || null), endTime: allDay ? null : (endTime || null),
      color, icon,
    })
    reset()
  }

  const doDelete = (ev) => {
    setConfirmId(null)
    // Keep a full copy so Undo can re-add it exactly (minus the id, which is
    // regenerated so it's a fresh row).
    const { id, ...rest } = ev
    setJustDeleted(rest)
    deleteEvent(ev.id)
  }
  const undoDelete = () => {
    if (!justDeleted) return
    addEvent({ id: 'ev-' + Date.now(), ...justDeleted })
    setJustDeleted(null)
  }

  return (
    <div style={{ marginBottom:24 }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:8 }}>
        <div style={{ fontSize:11, color:'var(--muted)', letterSpacing:1.5, textTransform:'uppercase', fontWeight:600 }}>📅 Events</div>
        <button onClick={() => setOpen(o => !o)}
          style={{ fontSize:11, padding:'5px 12px', borderRadius:20, border:'1px solid var(--border)', background: open ? 'var(--forest)' : 'white', color: open ? 'var(--green-light)' : 'var(--muted)', cursor:'pointer', fontFamily:'DM Sans,sans-serif', fontWeight:600 }}>
          {open ? 'Cancel' : '+ Add event'}
        </button>
      </div>
      <div style={{ fontSize:11, color:'var(--muted)', marginBottom:10 }}>Multi-day happenings like a retreat or conference. Shown as a colored band on the calendar — you can still schedule tasks during them.</div>

      {(events || []).length === 0 && !open && !justDeleted && (
        <div style={{ fontSize:12, color:'var(--muted)', padding:'4px 0' }}>No events yet.</div>
      )}

      {/* Undo bar for the last deleted event */}
      {justDeleted && (
        <div style={{ display:'flex', alignItems:'center', gap:10, padding:'9px 14px', background:'#FBF6E4', border:'1px solid var(--gold-line)', borderRadius:10, marginBottom:6 }}>
          <span style={{ fontSize:12, color:'var(--text)', flex:1 }}>Deleted <b>{justDeleted.label}</b>.</span>
          <button onClick={undoDelete}
            style={{ fontSize:11, padding:'5px 12px', borderRadius:16, border:'1px solid var(--gold-deep)', background:'var(--gold)', color:'#4A3B08', cursor:'pointer', fontFamily:'DM Sans,sans-serif', fontWeight:700 }}>↩ Undo</button>
          <button onClick={() => setJustDeleted(null)}
            style={{ background:'none', border:'none', cursor:'pointer', color:'#9CA3AF', fontSize:15, padding:'0 2px' }}>✕</button>
        </div>
      )}

      {(events || []).map(ev => (
        <div key={ev.id} style={{ display:'flex', alignItems:'center', gap:10, padding:'9px 14px', background:`${ev.color}12`, borderRadius:10, borderLeft:`4px solid ${ev.color}`, border:`1px solid ${ev.color}33`, marginBottom:6 }}>
          {ev.icon && <Icon value={ev.icon} size={18} />}
          <div style={{ flex:1 }}>
            <div style={{ fontSize:13, fontWeight:600, color:'var(--text)' }}>{ev.label}</div>
            <div style={{ fontSize:11, color:'var(--muted)', marginTop:2 }}>
              {fmtRange(ev.startDate, ev.endDate)}
              {!ev.allDay && ev.startTime ? ` · ${fmt12(ev.startTime)}${ev.endTime ? '–'+fmt12(ev.endTime) : ''}` : ' · all day'}
            </div>
          </div>
          {confirmId === ev.id ? (
            <span style={{ display:'inline-flex', alignItems:'center', gap:6 }}>
              <span style={{ fontSize:11, color:'#991B1B' }}>Delete?</span>
              <button onClick={() => doDelete(ev)}
                style={{ fontSize:11, padding:'4px 10px', borderRadius:14, border:'none', background:'#EF4444', color:'white', cursor:'pointer', fontFamily:'DM Sans,sans-serif', fontWeight:600 }}>Yes</button>
              <button onClick={() => setConfirmId(null)}
                style={{ fontSize:11, padding:'4px 10px', borderRadius:14, border:'1px solid var(--border)', background:'white', color:'var(--muted)', cursor:'pointer', fontFamily:'DM Sans,sans-serif' }}>No</button>
            </span>
          ) : (
            <button onClick={() => setConfirmId(ev.id)} title="Delete event"
              style={{ background:'none', border:'none', cursor:'pointer', color:'#9CA3AF', fontSize:16, padding:'0 2px' }}>✕</button>
          )}
        </div>
      ))}

      {open && (
        <div style={{ background:'white', borderRadius:12, border:'1px solid var(--border)', padding:'14px 16px', marginTop:4 }}>
          <div style={{ display:'flex', gap:8, alignItems:'center', marginBottom:10 }}>
            <IconPicker value={icon} onChange={setIcon} allowClear size={36} />
            <input value={label} onChange={e => setLabel(e.target.value)} placeholder="Event name (e.g. Immunology Retreat)" style={{ ...inp, marginBottom:0, flex:1 }} />
          </div>
          <div style={{ display:'flex', gap:8, marginBottom:10 }}>
            <div style={{ flex:1 }}>
              <div style={fieldLabel}>Start</div>
              <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} style={{ ...inp, marginBottom:0 }} />
            </div>
            <div style={{ flex:1 }}>
              <div style={fieldLabel}>End</div>
              <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} style={{ ...inp, marginBottom:0 }} />
            </div>
          </div>
          {endDate && startDate && endDate < startDate && (
            <div style={{ fontSize:11, color:'#DC2626', marginBottom:8 }}>End date must be on or after start date.</div>
          )}
          <label style={{ display:'flex', alignItems:'center', gap:6, fontSize:12, color:'var(--muted)', cursor:'pointer', marginBottom:10 }}>
            <input type="checkbox" checked={allDay} onChange={e => setAllDay(e.target.checked)} />
            All day
          </label>
          {!allDay && (
            <div style={{ display:'flex', gap:8, marginBottom:10 }}>
              <div style={{ flex:1 }}>
                <div style={fieldLabel}>Start time</div>
                <input type="time" value={startTime} onChange={e => setStartTime(e.target.value)} style={{ ...inp, marginBottom:0 }} />
              </div>
              <div style={{ flex:1 }}>
                <div style={fieldLabel}>End time</div>
                <input type="time" value={endTime} onChange={e => setEndTime(e.target.value)} style={{ ...inp, marginBottom:0 }} />
              </div>
            </div>
          )}
          <div style={fieldLabel}>Color</div>
          <div style={{ display:'flex', gap:5, flexWrap:'wrap', marginBottom:12 }}>
            {EVENT_COLORS.map(c => (
              <button key={c} onClick={() => setColor(c)}
                style={{ width:24, height:24, borderRadius:6, background:c, cursor:'pointer', border: color===c ? '2px solid var(--text)' : '2px solid transparent' }} />
            ))}
            <input type="color" value={color} onChange={e => setColor(e.target.value)}
              style={{ width:28, height:24, border:'none', borderRadius:6, cursor:'pointer', padding:0, background:'none' }} title="Custom color" />
          </div>
          <button onClick={submit} disabled={!canSave}
            style={{ width:'100%', background: canSave ? 'var(--forest)' : '#E5E7EB', color: canSave ? 'var(--green-light)' : '#9CA3AF', border:'none', borderRadius:10, padding:'10px', fontSize:13, fontWeight:600, cursor: canSave ? 'pointer' : 'default', fontFamily:'DM Sans,sans-serif' }}>
            Save event
          </button>
        </div>
      )}
    </div>
  )
}

// ── Vacations / time off (moved here from the Commitments tab) ──
function VacationSection({ vacations, addVacation, deleteVacation }) {
  const [open, setOpen] = useState(false)
  const [label, setLabel] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')

  const reset = () => { setLabel(''); setStartDate(''); setEndDate(''); setOpen(false) }
  const canSave = startDate && endDate && endDate >= startDate
  const submit = () => {
    if (!canSave) return
    addVacation({ id: 'v-' + Date.now(), label: label.trim() || 'Time off', startDate, endDate })
    reset()
  }

  return (
    <div style={{ marginBottom:16 }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:8 }}>
        <div style={{ fontSize:11, color:'var(--muted)', letterSpacing:1.5, textTransform:'uppercase', fontWeight:600 }}>🏝 Vacation / Time Off</div>
        <button onClick={() => setOpen(o => !o)}
          style={{ fontSize:11, padding:'5px 12px', borderRadius:20, border:'1px solid var(--border)', background: open ? '#4A9EB5' : 'white', color: open ? 'white' : 'var(--muted)', cursor:'pointer', fontFamily:'DM Sans,sans-serif', fontWeight:600 }}>
          {open ? 'Cancel' : '+ Add vacation'}
        </button>
      </div>
      <div style={{ fontSize:11, color:'var(--muted)', marginBottom:10 }}>Time off that pauses your recurring tasks during the span.</div>

      {(vacations || []).length === 0 && !open && (
        <div style={{ fontSize:12, color:'var(--muted)', padding:'4px 0' }}>No time off yet.</div>
      )}
      {(vacations || []).map(v => (
        <div key={v.id} style={{ display:'flex', alignItems:'center', gap:10, padding:'9px 14px', background:'#EAF5F8', borderRadius:10, border:'1px solid #A8D8E4', marginBottom:6 }}>
          <div style={{ flex:1 }}>
            <div style={{ fontSize:13, fontWeight:600, color:'var(--text)' }}>{v.label}</div>
            <div style={{ fontSize:11, color:'#2A7A90', marginTop:2 }}>{fmtRange(v.startDate, v.endDate)} · recurring tasks paused</div>
          </div>
          <button onClick={() => deleteVacation(v.id)}
            style={{ background:'none', border:'none', cursor:'pointer', color:'#9CA3AF', fontSize:16, padding:'0 2px' }}>✕</button>
        </div>
      ))}

      {open && (
        <div style={{ background:'white', borderRadius:12, border:'1px solid #A8D8E4', padding:'14px 16px', marginTop:4 }}>
          <input value={label} onChange={e => setLabel(e.target.value)} placeholder='Label (e.g. Bonaire Trip, Spring Break)' style={{ ...inp, marginBottom:10 }} />
          <div style={{ display:'flex', gap:8, marginBottom:12 }}>
            <div style={{ flex:1 }}>
              <div style={fieldLabel}>Start</div>
              <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} style={{ ...inp, marginBottom:0 }} />
            </div>
            <div style={{ flex:1 }}>
              <div style={fieldLabel}>End</div>
              <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} style={{ ...inp, marginBottom:0 }} />
            </div>
          </div>
          {endDate && startDate && endDate < startDate && (
            <div style={{ fontSize:11, color:'#DC2626', marginBottom:8 }}>End date must be on or after start date.</div>
          )}
          <button onClick={submit} disabled={!canSave}
            style={{ width:'100%', background: canSave ? 'linear-gradient(135deg, #4A9EB5, #7BBFD4)' : '#E5E7EB', color: canSave ? 'white' : '#9CA3AF', border:'none', borderRadius:10, padding:'9px', fontSize:13, fontWeight:600, cursor: canSave ? 'pointer' : 'default', fontFamily:'DM Sans,sans-serif' }}>
            Save vacation block
          </button>
        </div>
      )}
    </div>
  )
}

export default function EventsManager({ events, addEvent, deleteEvent, vacations, addVacation, deleteVacation }) {
  return (
    <div>
      <div className="page-title">Events</div>
      <div className="page-sub">Multi-day events and time off — both show on your Calendar.</div>
      <EventSection events={events} addEvent={addEvent} deleteEvent={deleteEvent} />
      <VacationSection vacations={vacations} addVacation={addVacation} deleteVacation={deleteVacation} />
    </div>
  )
}
