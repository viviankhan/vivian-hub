import { useState } from 'react'
import { findSlots } from '../lib/scheduler.js'

const DURATIONS = [
  { label:'15 min', value:15 },
  { label:'30 min', value:30 },
  { label:'1 hour', value:60 },
  { label:'2 hours', value:120 },
  { label:'3 hours', value:180 },
]

const TAGS = ['class','lab','career','personal','fitness','health','urgent']

export default function Scheduler({ scheduled, addScheduledTask, todos, updateTodos }) {
  const [task,     setTask]     = useState('')
  const [duration, setDuration] = useState(30)
  const [tag,      setTag]      = useState('career')
  const [deadline, setDeadline] = useState('')
  const [slots,    setSlots]    = useState([])
  const [searched, setSearched] = useState(false)
  const [added,    setAdded]    = useState(null)

  const findAvail = () => {
    if (!task.trim()) return
    const results = findSlots(duration, scheduled, deadline || null)
    setSlots(results)
    setSearched(true)
    setAdded(null)
  }

  const pickSlot = async (slot) => {
    const entry = {
      id: 'sched-' + Date.now(),
      label: task,
      date: slot.date,
      startTime: slot.startTime,
      endTime: slot.endTime,
      durationMinutes: duration,
      tag,
      note: `${slot.startDisplay} – ${slot.endDisplay} · ${slot.context}`,
    }
    await addScheduledTask(entry)
    setAdded(slot)
    setSlots([])
    setTask('')
    setSearched(false)
  }

  return (
    <div>
      <div className="page-title">🧠 Smart Scheduler</div>
      <div className="page-sub">Add a task and I'll find the best open windows in your schedule</div>

      <div className="scheduler-card">
        <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
          <div>
            <label style={{ fontSize:11, color:'var(--muted)', letterSpacing:1, textTransform:'uppercase', display:'block', marginBottom:4 }}>Task</label>
            <input
              value={task}
              onChange={e => setTask(e.target.value)}
              placeholder="e.g. Email Rose Theisen about SE meeting"
              onKeyDown={e => e.key === 'Enter' && findAvail()}
            />
          </div>

          <div style={{ display:'flex', gap:10, flexWrap:'wrap' }}>
            <div style={{ flex:1, minWidth:120 }}>
              <label style={{ fontSize:11, color:'var(--muted)', letterSpacing:1, textTransform:'uppercase', display:'block', marginBottom:4 }}>Duration</label>
              <select value={duration} onChange={e => setDuration(Number(e.target.value))}>
                {DURATIONS.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
              </select>
            </div>
            <div style={{ flex:1, minWidth:120 }}>
              <label style={{ fontSize:11, color:'var(--muted)', letterSpacing:1, textTransform:'uppercase', display:'block', marginBottom:4 }}>Category</label>
              <select value={tag} onChange={e => setTag(e.target.value)}>
                {TAGS.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div style={{ flex:1, minWidth:120 }}>
              <label style={{ fontSize:11, color:'var(--muted)', letterSpacing:1, textTransform:'uppercase', display:'block', marginBottom:4 }}>Deadline (optional)</label>
              <input type="date" value={deadline} onChange={e => setDeadline(e.target.value)} />
            </div>
          </div>

          <button className="btn-primary" onClick={findAvail} disabled={!task.trim()}>
            Find Available Slots →
          </button>
        </div>
      </div>

      {searched && slots.length === 0 && (
        <div style={{ background:'#FEF2F2', border:'1px solid #FECACA', borderRadius:12, padding:'14px 18px', fontSize:13, color:'#7F1D1D' }}>
          No open slots found in the next 7 days. Try a shorter duration or further deadline.
        </div>
      )}

      {slots.length > 0 && (
        <>
          <p className="section-label">Best Available Slots</p>
          {slots.map((slot, i) => (
            <div key={i} className="slot-option" onClick={() => pickSlot(slot)}>
              <div>
                <div className="slot-time">{slot.dayLabel} · {slot.startDisplay} – {slot.endDisplay}</div>
                <div className="slot-context">{slot.context}</div>
              </div>
              <button className="slot-pick-btn">Add this →</button>
            </div>
          ))}
        </>
      )}

      {added && (
        <div style={{ background:'#F0FDF4', border:'1px solid #86EFAC', borderRadius:12, padding:'12px 18px', fontSize:13, color:'#166534', marginTop:12 }}>
          ✓ Added: <strong>{task || added.context}</strong> on {added.dayLabel} at {added.startDisplay}
        </div>
      )}

      {scheduled.length > 0 && (
        <>
          <div className="divider" />
          <p className="section-label">Scheduled Tasks</p>
          {scheduled.map(t => (
            <div key={t.id} style={{ background:'white', borderRadius:10, border:'1px solid var(--border)', padding:'10px 14px', marginBottom:8, display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
              <div>
                <div style={{ fontSize:13, color:'var(--text)', fontWeight:500 }}>{t.label}</div>
                <div style={{ fontSize:11, color:'var(--muted)', marginTop:2 }}>{t.note}</div>
              </div>
              <span className={`tag tag-${t.tag}`}>{t.tag}</span>
            </div>
          ))}
        </>
      )}
    </div>
  )
}
