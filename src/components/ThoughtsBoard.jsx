// src/components/ThoughtsBoard.jsx
// A sticky-note "thoughts" board. Jot a thought → it lands on the board as a
// sticky note, randomly placed and stamped with the date + time. Search the
// pool, sort by date, and schedule any note straight into your calendar.
import { useState, useEffect, useRef } from 'react'
import { getThoughts, setThoughts } from '../lib/storage.js'
import { setItemReminders } from '../lib/notifications.js'
import { bloomBurst } from '../lib/bloom.js'
import AddItemModal from './AddItemModal.jsx'

// Classic sticky-note pastels.
const COLORS = ['#FEF3B0', '#FBD1DE', '#C9E7F7', '#D2F0CE', '#F7DDB0', '#E7D6F5', '#FBC9A8']

function fmtStamp(iso) {
  const d = new Date(iso)
  return d.toLocaleString('en-US', { month:'short', day:'numeric', hour:'numeric', minute:'2-digit' })
}
// Deterministic ink color per sticky so the text sits nicely on its pastel.
function inkFor(color) { return '#4A4030' }

// ── One sticky note ────────────────────────────────────────────
function Sticky({ t, onSchedule, onDelete, style, compact }) {
  return (
    <div style={{
      background: t.color, borderRadius: 3, padding: '12px 12px 10px',
      boxShadow: t.scheduled ? '0 1px 4px rgba(0,0,0,.12)' : '0 6px 14px rgba(90,80,50,.22)',
      transform: compact ? 'none' : `rotate(${t.rot}deg)`,
      opacity: t.scheduled ? .62 : 1,
      display: 'flex', flexDirection: 'column', gap: 8, ...style,
    }}>
      {/* little piece of "tape" */}
      {!compact && <div style={{ position:'absolute', top:-7, left:'50%', transform:'translateX(-50%) rotate(-3deg)', width:44, height:14, background:'rgba(255,255,255,.5)', border:'1px solid rgba(0,0,0,.05)' }} />}
      <div style={{ fontSize:13.5, lineHeight:1.4, color:inkFor(t.color), whiteSpace:'pre-wrap', wordBreak:'break-word', fontWeight:500, textDecoration: t.scheduled ? 'line-through' : 'none' }}>
        {t.text}
      </div>
      <div style={{ marginTop:'auto', display:'flex', alignItems:'center', justifyContent:'space-between', gap:6 }}>
        <span style={{ fontSize:9.5, color:'rgba(74,64,48,.6)', letterSpacing:.3 }}>{fmtStamp(t.createdAt)}</span>
        <div style={{ display:'flex', gap:4 }}>
          {t.scheduled
            ? <span style={{ fontSize:8.5, letterSpacing:.5, textTransform:'uppercase', color:'#2F6B4F', fontWeight:700 }}>✓ Scheduled</span>
            : <button onClick={() => onSchedule(t)} title="Schedule into calendar"
                style={{ fontSize:12, lineHeight:1, background:'rgba(255,255,255,.55)', border:'none', borderRadius:6, padding:'3px 6px', cursor:'pointer' }}>📅</button>}
          <button onClick={() => onDelete(t.id)} title="Remove"
            style={{ fontSize:12, lineHeight:1, background:'none', border:'none', color:'rgba(74,64,48,.5)', cursor:'pointer', padding:'3px 4px' }}>✕</button>
        </div>
      </div>
    </div>
  )
}

// ── Board ──────────────────────────────────────────────────────
export default function ThoughtsBoard({ addCommitment, addRecurringTask, categories, routines = [], taskTemplates = [], labelModel = null }) {
  const [thoughts, setThoughtsState] = useState([])
  const [loaded, setLoaded] = useState(false)
  const [text, setText]   = useState('')
  const [query, setQuery] = useState('')
  const [view, setView]   = useState('board')   // 'board' | 'list'
  const [sortDir, setSortDir] = useState('new')  // 'new' | 'old'
  const [scheduling, setScheduling] = useState(null)
  const [dragId, setDragId] = useState(null)

  useEffect(() => { getThoughts().then(t => { setThoughtsState(t); setLoaded(true) }) }, [])

  const persist = (next) => { setThoughtsState(next); setThoughts(next).catch(() => {}) }

  // ── Drag a sticky note around the board ──────────────────────
  const boardRef = useRef(null)
  const dragRef = useRef(null)
  const onNotePointerDown = (e, t) => {
    // Let the schedule/delete buttons work — only drag from the note body.
    if (e.target.closest('button')) return
    const board = boardRef.current
    if (!board) return
    e.preventDefault()
    const rect = board.getBoundingClientRect()
    dragRef.current = { id: t.id, startX: e.clientX, startY: e.clientY, origX: t.x, origY: t.y, rect, moved: false }
    setDragId(t.id)
    window.addEventListener('pointermove', onDragMove)
    window.addEventListener('pointerup', onDragEnd)
  }
  const onDragMove = (e) => {
    const d = dragRef.current
    if (!d) return
    const dxPct = ((e.clientX - d.startX) / d.rect.width) * 100
    const dyPct = ((e.clientY - d.startY) / d.rect.height) * 100
    const nx = Math.max(0, Math.min(92, d.origX + dxPct))
    const ny = Math.max(0, Math.min(92, d.origY + dyPct))
    d.moved = true
    setThoughtsState(prev => prev.map(x => x.id === d.id ? { ...x, x: nx, y: ny } : x))
  }
  const onDragEnd = () => {
    const d = dragRef.current
    window.removeEventListener('pointermove', onDragMove)
    window.removeEventListener('pointerup', onDragEnd)
    dragRef.current = null
    setDragId(null)
    // Persist the new position (only if it actually moved).
    if (d && d.moved) setThoughtsState(prev => { setThoughts(prev).catch(() => {}); return prev })
  }

  const addThought = (e) => {
    if (e?.currentTarget) bloomBurst(e.currentTarget)
    const body = text.trim()
    if (!body) return
    const note = {
      id: 'th-' + Date.now(),
      text: body,
      createdAt: new Date().toISOString(),
      x: 3 + Math.random() * 66,      // % from left (clamped in style)
      y: 3 + Math.random() * 80,      // % from top
      rot: -7 + Math.random() * 14,   // slight tilt
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      scheduled: false,
    }
    persist([note, ...thoughts])
    setText('')
  }

  const deleteThought = (id) => persist(thoughts.filter(t => t.id !== id))
  const markScheduled = (id) => persist(thoughts.map(t => t.id === id ? { ...t, scheduled: true } : t))

  const q = query.trim().toLowerCase()
  const filtered = thoughts.filter(t => !q || t.text.toLowerCase().includes(q))
  const sorted = [...filtered].sort((a, b) =>
    sortDir === 'new' ? b.createdAt.localeCompare(a.createdAt) : a.createdAt.localeCompare(b.createdAt))

  // Scheduling a thought → a real commitment on the calendar; the note is then
  // marked scheduled (kept as a record, faded out).
  const handleScheduled = (commitment, reminderMins) => {
    if (addCommitment) addCommitment(commitment)
    setItemReminders(commitment.id, reminderMins)
    if (scheduling) markScheduled(scheduling.id)
    setScheduling(null)
  }
  // Turning the thought into a recurring task instead of a one-off commitment —
  // same "mark this thought scheduled" bookkeeping as the commitment path.
  const handleScheduledRecurring = (task) => {
    if (addRecurringTask) addRecurringTask(task)
    if (scheduling) markScheduled(scheduling.id)
    setScheduling(null)
  }

  const tabBtn = (active) => ({
    fontSize: 11, padding: '5px 12px', borderRadius: 20, border: 'none', cursor: 'pointer',
    fontFamily: 'DM Sans,sans-serif', fontWeight: 600,
    background: active ? 'linear-gradient(135deg, #7BBFD4, #C8BFDF)' : '#EEF1F4',
    color: active ? '#1A3A4E' : 'var(--muted)',
  })

  return (
    <div>
      <div className="page-title">Thoughts</div>
      <div className="page-sub">Jot a thought — it lands on the board with a timestamp. Drag notes to rearrange them, search, sort, or schedule one into your calendar.</div>

      {/* Add a thought */}
      <div style={{ display:'flex', gap:8, marginBottom:14, alignItems:'flex-start' }}>
        <textarea value={text} onChange={e => setText(e.target.value)}
          placeholder="What's on your mind?" rows={1}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); addThought() } }}
          style={{ flex:1, fontSize:13, padding:'11px 14px', borderRadius:12, border:'1px solid var(--border)', resize:'vertical', fontFamily:'DM Sans,sans-serif', outline:'none', lineHeight:1.5, minHeight:0 }} />
        <button onClick={addThought} disabled={!text.trim()}
          style={{ background: text.trim() ? 'linear-gradient(135deg, #F7DDB0, #FBD1DE)' : '#E5E7EB', color: text.trim() ? '#5A4030' : '#9CA3AF', border:'none', borderRadius:12, padding:'11px 18px', fontSize:13, fontWeight:700, cursor: text.trim() ? 'pointer' : 'default', fontFamily:'DM Sans,sans-serif', whiteSpace:'nowrap' }}>
          + Pin it
        </button>
      </div>

      {/* Controls: search · view · sort */}
      <div style={{ display:'flex', gap:8, marginBottom:14, flexWrap:'wrap', alignItems:'center' }}>
        <div style={{ position:'relative', flex:1, minWidth:160 }}>
          <span style={{ position:'absolute', left:12, top:'50%', transform:'translateY(-50%)', fontSize:13, color:'var(--muted)' }}>🔎</span>
          <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search thoughts…"
            style={{ width:'100%', fontSize:13, padding:'8px 12px 8px 32px', borderRadius:20, border:'1px solid var(--border)', fontFamily:'DM Sans,sans-serif', outline:'none' }} />
        </div>
        <button style={tabBtn(view==='board')} onClick={() => setView('board')}>🧷 Board</button>
        <button style={tabBtn(view==='list')} onClick={() => setView('list')}>☰ List</button>
        {view === 'list' && (
          <button onClick={() => setSortDir(d => d === 'new' ? 'old' : 'new')}
            style={{ fontSize:11, padding:'5px 12px', borderRadius:20, border:'1px solid var(--border)', background:'white', color:'var(--muted)', cursor:'pointer', fontFamily:'DM Sans,sans-serif', fontWeight:600 }}>
            {sortDir === 'new' ? '↓ Newest first' : '↑ Oldest first'}
          </button>
        )}
      </div>

      {!loaded ? (
        <div style={{ textAlign:'center', padding:'40px 0', color:'var(--muted)', fontSize:13 }}>Loading your board…</div>
      ) : sorted.length === 0 ? (
        <div style={{ background:'white', borderRadius:12, border:'1px solid var(--border)', padding:28, textAlign:'center' }}>
          <div style={{ fontSize:30, marginBottom:8 }}>🗒️</div>
          <div style={{ fontSize:13, color:'var(--muted)' }}>
            {q ? 'No thoughts match your search.' : 'Nothing here yet — jot your first thought above.'}
          </div>
        </div>
      ) : view === 'board' ? (
        // ── Scattered board ──
        <div ref={boardRef} style={{
          position:'relative', minHeight:'64vh', borderRadius:16, overflow:'hidden',
          border:'1px solid #D8C7A8',
          background:'repeating-linear-gradient(45deg, #E9D8B8 0 2px, #E4D2AE 2px 4px), radial-gradient(circle at 50% 40%, #EAD9B9, #DFC9A2)',
          boxShadow:'inset 0 2px 18px rgba(120,95,50,.28)',
          padding:8,
        }}>
          {sorted.map(t => {
            const dragging = dragId === t.id
            return (
              <div key={t.id}
                onPointerDown={e => onNotePointerDown(e, t)}
                style={{ position:'absolute', width:150,
                  left:`min(${t.x}%, calc(100% - 158px))`, top:`min(${t.y}%, calc(100% - 128px))`,
                  touchAction:'none', cursor: dragging ? 'grabbing' : 'grab',
                  zIndex: dragging ? 5 : 1, transition: dragging ? 'none' : 'box-shadow .15s' }}>
                <div style={{ position:'relative', transform: dragging ? 'scale(1.05)' : 'none', transition:'transform .12s' }}>
                  <Sticky t={t} onSchedule={setScheduling} onDelete={deleteThought} />
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        // ── Sorted list ──
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(150px, 1fr))', gap:10 }}>
          {sorted.map(t => (
            <Sticky key={t.id} t={t} onSchedule={setScheduling} onDelete={deleteThought} compact
              style={{ minHeight:96 }} />
          ))}
        </div>
      )}

      {scheduling && (
        <AddItemModal
          presetText={scheduling.text}
          categories={categories}
          routines={routines}
          templates={taskTemplates}
          labelModel={labelModel}
          onSave={handleScheduled}
          onSaveRecurring={handleScheduledRecurring}
          onClose={() => setScheduling(null)}
          title="Schedule this thought" />
      )}
    </div>
  )
}
