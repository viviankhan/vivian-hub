import { useState, useEffect, useCallback } from 'react'
import { dbGet, dbSet } from '../lib/storage.js'

// ── Storage helpers ────────────────────────────────────────────
async function loadCommitments() {
  return (await dbGet('commitments')) ?? []
}
async function saveCommitments(data) {
  await dbSet('commitments', data)
}

// ── Helpers ────────────────────────────────────────────────────
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

function isPast(dateStr) {
  if (!dateStr) return false
  const d = new Date(dateStr + 'T23:59:00')
  return d < new Date()
}

function isToday(dateStr) {
  return dateStr === todayStr()
}

function isSoon(dateStr) {
  if (!dateStr) return false
  const d = new Date(dateStr + 'T12:00:00')
  const today = new Date(); today.setHours(0,0,0,0)
  const diff = Math.round((d - today) / 86400000)
  return diff >= 0 && diff <= 2
}

const CATEGORIES = [
  { id:'meeting',   label:'Meeting',        color:'#3B82F6', bg:'#EFF6FF' },
  { id:'deadline',  label:'Deadline',       color:'#EF4444', bg:'#FEF2F2' },
  { id:'social',    label:'Social',         color:'#A855F7', bg:'#F5F3FF' },
  { id:'lab',       label:'Lab / Research', color:'#059669', bg:'#ECFDF5' },
  { id:'class',     label:'Class / Study',  color:'#7C3AED', bg:'#EDE9FE' },
  { id:'personal',  label:'Personal',       color:'#D97706', bg:'#FEF9E7' },
  { id:'other',     label:'Other',          color:'#6B7280', bg:'#F3F4F6' },
]

function getCat(id) {
  return CATEGORIES.find(c => c.id === id) || CATEGORIES[CATEGORIES.length - 1]
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

  const reset = () => { setText(''); setDate(''); setTime(''); setPrepMin(''); setPerson(''); setCat('meeting'); setOpen(false) }

  const submit = () => {
    if (!text.trim()) return
    const id = 'c-' + Date.now()
    onAdd({
      id, text: text.trim(), date: date || null, time: time || null,
      prepMin: prepMin ? parseInt(prepMin) : null,
      cat, person: person.trim() || null,
      done: false, createdAt: new Date().toISOString()
    })
    reset()
  }

  if (!open) return (
    <button onClick={() => setOpen(true)}
      style={{ width:'100%', background:'var(--forest)', border:'none', borderRadius:14, padding:'14px 18px', cursor:'pointer', display:'flex', alignItems:'center', gap:10, marginBottom:16 }}>
      <span style={{ fontSize:20 }}>＋</span>
      <span style={{ fontFamily:'DM Sans, sans-serif', fontSize:13, color:'var(--green-light)', fontWeight:600, letterSpacing:.5 }}>Add a commitment</span>
    </button>
  )

  return (
    <div style={{ background:'white', borderRadius:14, border:'2px solid var(--forest)', padding:'18px', marginBottom:16 }}>
      <div style={{ fontFamily:'Cormorant Garamond, serif', fontSize:18, fontWeight:600, color:'var(--text)', marginBottom:14 }}>New Commitment</div>

      {/* Main description */}
      <textarea
        value={text} onChange={e => setText(e.target.value)}
        placeholder="What did you commit to? e.g. Pitch Synbio to molbio students"
        autoFocus
        style={{ width:'100%', minHeight:72, fontSize:13, padding:'10px 12px', borderRadius:10, border:'1px solid var(--border)', resize:'none', marginBottom:10, fontFamily:'DM Sans, sans-serif', lineHeight:1.5, outline:'none' }}
      />

      {/* Person */}
      <input value={person} onChange={e => setPerson(e.target.value)}
        placeholder="Who did you commit to? (optional)"
        style={{ width:'100%', fontSize:12, padding:'8px 12px', borderRadius:10, border:'1px solid var(--border)', marginBottom:10, fontFamily:'DM Sans, sans-serif' }} />

      {/* Date + time row */}
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

      {/* Category */}
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

// ── Single commitment card ─────────────────────────────────────
function CommitCard({ c, onToggle, onDelete }) {
  const cat = getCat(c.cat)
  const past = isPast(c.date) && !c.done
  const today = isToday(c.date)
  const soon = isSoon(c.date) && !past

  let borderColor = 'var(--border)'
  let bg = 'white'
  if (c.done)   { bg = '#FAFAF7'; borderColor = '#E5E7EB' }
  else if (past) { bg = '#FFF5F5'; borderColor = '#FECACA' }
  else if (today){ bg = '#F0FDF4'; borderColor = '#86EFAC' }
  else if (soon) { bg = '#FFFBEB'; borderColor = '#FDE68A' }

  return (
    <div style={{ background:bg, borderRadius:12, border:`1px solid ${borderColor}`, padding:'14px 16px', marginBottom:8, opacity: c.done ? .55 : 1, transition:'all .2s' }}>
      <div style={{ display:'flex', gap:10, alignItems:'flex-start' }}>
        {/* Checkbox */}
        <div onClick={() => onToggle(c.id)}
          style={{ width:20, height:20, borderRadius:'50%', flexShrink:0, marginTop:2, cursor:'pointer', border: c.done ? 'none' : `2px solid ${cat.color}`, background: c.done ? cat.color : 'transparent', display:'flex', alignItems:'center', justifyContent:'center', transition:'all .2s' }}>
          {c.done && <span style={{ color:'white', fontSize:11, fontWeight:700 }}>✓</span>}
        </div>

        <div style={{ flex:1, minWidth:0 }}>
          {/* Title */}
          <div style={{ fontSize:14, fontWeight:600, color: c.done ? 'var(--muted)' : 'var(--text)', textDecoration: c.done ? 'line-through' : 'none', lineHeight:1.4, marginBottom:4 }}>
            {c.text}
          </div>

          {/* Person */}
          {c.person && (
            <div style={{ fontSize:11, color:'var(--muted)', marginBottom:4 }}>
              👤 {c.person}
            </div>
          )}

          {/* Date / time / prep */}
          <div style={{ display:'flex', gap:8, flexWrap:'wrap', alignItems:'center' }}>
            {c.date && (
              <span style={{ fontSize:11, color: past ? '#DC2626' : today ? '#059669' : 'var(--muted)', fontWeight: (today || past) ? 600 : 400 }}>
                📅 {formatDate(c.date)}{c.time ? ` @ ${c.time}` : ''}
              </span>
            )}
            {c.prepMin && (
              <span style={{ fontSize:11, color:'var(--muted)' }}>
                ⏰ Leave {c.prepMin} min early
              </span>
            )}
            <span style={{ fontSize:10, padding:'2px 8px', borderRadius:10, background:cat.bg, color:cat.color, fontWeight:500 }}>
              {cat.label}
            </span>
            {past && !c.done && (
              <span style={{ fontSize:10, padding:'2px 8px', borderRadius:10, background:'#FEE2E2', color:'#DC2626', fontWeight:600 }}>
                PAST DUE
              </span>
            )}
            {today && !c.done && (
              <span style={{ fontSize:10, padding:'2px 8px', borderRadius:10, background:'#DCFCE7', color:'#059669', fontWeight:600 }}>
                TODAY
              </span>
            )}
          </div>
        </div>

        {/* Delete */}
        <button onClick={() => onDelete(c.id)}
          style={{ background:'none', border:'none', cursor:'pointer', color:'#D1D5DB', fontSize:16, padding:'0 2px', flexShrink:0, lineHeight:1 }}>
          ✕
        </button>
      </div>
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────
export default function Commitments() {
  const [items,   setItems]   = useState([])
  const [loading, setLoading] = useState(true)
  const [filter,  setFilter]  = useState('upcoming') // upcoming | all | done

  useEffect(() => {
    loadCommitments().then(data => { setItems(data); setLoading(false) })
  }, [])

  const persist = useCallback(async (next) => {
    setItems(next)
    await saveCommitments(next)
  }, [])

  const handleAdd = async (commitment) => {
    await persist([commitment, ...items])
  }

  const handleToggle = async (id) => {
    await persist(items.map(c => c.id === id ? { ...c, done: !c.done } : c))
  }

  const handleDelete = async (id) => {
    if (!confirm('Remove this commitment?')) return
    await persist(items.filter(c => c.id !== id))
  }

  // Sort: today first, then by date, then undated, then done
  const sorted = [...items].sort((a, b) => {
    if (a.done !== b.done) return a.done ? 1 : -1
    if (!a.date && !b.date) return 0
    if (!a.date) return 1
    if (!b.date) return -1
    return a.date.localeCompare(b.date)
  })

  const visible = sorted.filter(c => {
    if (filter === 'upcoming') return !c.done
    if (filter === 'done')     return c.done
    return true
  })

  const todayCount   = items.filter(c => !c.done && isToday(c.date)).length
  const pastCount    = items.filter(c => !c.done && isPast(c.date)).length
  const upcomingCount = items.filter(c => !c.done && !isPast(c.date)).length

  if (loading) return <div style={{ padding:20, color:'var(--muted)', fontSize:13 }}>Loading…</div>

  return (
    <div>
      <div className="page-title">Commitments</div>
      <div className="page-sub">Things you said yes to — never forget again</div>

      <QuickAdd onAdd={handleAdd} />

      {/* Stats row */}
      {items.length > 0 && (
        <div style={{ display:'flex', gap:8, marginBottom:16, flexWrap:'wrap' }}>
          {[
            { label:'Upcoming', count:upcomingCount, color:'#1C2B1A', active: filter==='upcoming' },
            { label:'All',      count:items.length,   color:'#6B7280', active: filter==='all' },
            { label:'Done',     count:items.filter(c=>c.done).length, color:'#059669', active: filter==='done' },
          ].map(f => (
            <button key={f.label} onClick={() => setFilter(f.label.toLowerCase())}
              style={{ fontSize:11, padding:'5px 14px', borderRadius:20, border:'none', cursor:'pointer', fontFamily:'DM Sans, sans-serif', fontWeight:600, background: f.active ? f.color : '#F3F4F6', color: f.active ? 'white' : 'var(--muted)' }}>
              {f.label} {f.count > 0 ? `(${f.count})` : ''}
            </button>
          ))}
          {pastCount > 0 && (
            <span style={{ fontSize:11, padding:'5px 14px', borderRadius:20, background:'#FEE2E2', color:'#DC2626', fontWeight:600 }}>
              ⚠️ {pastCount} past due
            </span>
          )}
        </div>
      )}

      {visible.length === 0 ? (
        <div style={{ background:'white', borderRadius:12, border:'1px solid var(--border)', padding:24, textAlign:'center' }}>
          <div style={{ fontSize:28, marginBottom:8 }}>🤝</div>
          <div style={{ fontSize:13, color:'var(--muted)' }}>
            {filter === 'done' ? 'Nothing marked done yet.' : 'No commitments yet. Use the button above to add one.'}
          </div>
        </div>
      ) : (
        visible.map(c => (
          <CommitCard key={c.id} c={c} onToggle={handleToggle} onDelete={handleDelete} />
        ))
      )}
    </div>
  )
}
