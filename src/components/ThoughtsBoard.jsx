// src/components/ThoughtsBoard.jsx
// A sticky-note "thoughts" board. Jot a thought → it lands on the board as a
// sticky note in the first open spot (the board grows taller as it fills) and
// stamped with the date + time. Drag to rearrange, tap to read a long note in
// full, "Tidy up" to re-grid a piled-up board. Search the pool, sort by date,
// and schedule any note straight into your calendar.
import { useState, useEffect, useRef, useCallback } from 'react'
import { NOTE_W, noteLeft, noteTop, boardHeight, freeSpot, tidy, hasPileUp } from '../lib/stickyLayout.js'
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
function Sticky({ t, onSchedule, onComplete, onDelete, style, compact, clampLines = 0 }) {
  // A scheduled thought stays on the board as a faded record. (Completing a
  // thought removes it from the board entirely — it lives on as the dated
  // event on the day it was finished — so there's no "completed" note state.)
  const settled = t.scheduled
  return (
    <div style={{
      background: t.color, borderRadius: 3, padding: '12px 12px 10px',
      boxShadow: settled ? '0 1px 4px rgba(0,0,0,.12)' : '0 6px 14px rgba(90,80,50,.22)',
      transform: compact ? 'none' : `rotate(${t.rot}deg)`,
      opacity: settled ? .62 : 1,
      display: 'flex', flexDirection: 'column', gap: 8, ...style,
    }}>
      {/* little piece of "tape" */}
      {!compact && <div style={{ position:'absolute', top:-7, left:'50%', transform:'translateX(-50%) rotate(-3deg)', width:44, height:14, background:'rgba(255,255,255,.5)', border:'1px solid rgba(0,0,0,.05)' }} />}
      <div style={{ fontSize:13.5, lineHeight:1.4, color:inkFor(t.color), whiteSpace:'pre-wrap', wordBreak:'break-word', fontWeight:500, textDecoration: settled ? 'line-through' : 'none',
        // On the board a long note shows its first few lines; tap it to read the rest.
        ...(clampLines ? { display:'-webkit-box', WebkitLineClamp:clampLines, WebkitBoxOrient:'vertical', overflow:'hidden' } : {}) }}>
        {t.text}
      </div>
      <div style={{ marginTop:'auto', display:'flex', alignItems:'center', justifyContent:'space-between', gap:6 }}>
        <span style={{ fontSize:9.5, color:'rgba(74,64,48,.6)', letterSpacing:.3 }}>{fmtStamp(t.createdAt)}</span>
        <div style={{ display:'flex', gap:4, alignItems:'center' }}>
          {t.scheduled ? (
            <span style={{ fontSize:8.5, letterSpacing:.5, textTransform:'uppercase', color:'#2F6B4F', fontWeight:700 }}>✓ Scheduled</span>
          ) : (
            <>
              <button onClick={e => onComplete(t, e.currentTarget)} title="Mark completed"
                style={{ fontSize:12, lineHeight:1, background:'rgba(255,255,255,.55)', border:'none', borderRadius:6, padding:'3px 6px', cursor:'pointer' }}>✓</button>
              <button onClick={() => onSchedule(t)} title="Schedule into calendar"
                style={{ fontSize:12, lineHeight:1, background:'rgba(255,255,255,.55)', border:'none', borderRadius:6, padding:'3px 6px', cursor:'pointer' }}>📅</button>
            </>
          )}
          <button onClick={() => onDelete(t.id)} title="Remove"
            style={{ fontSize:12, lineHeight:1, background:'none', border:'none', color:'rgba(74,64,48,.5)', cursor:'pointer', padding:'3px 4px' }}>✕</button>
        </div>
      </div>
    </div>
  )
}

// ── Board ──────────────────────────────────────────────────────
export default function ThoughtsBoard({ addCommitment, addRecurringTask, categories, routines = [], taskTemplates = [], labelModel = null, appendLog }) {
  const [thoughts, setThoughtsState] = useState([])
  const [loaded, setLoaded] = useState(false)
  const [text, setText]   = useState('')
  const [query, setQuery] = useState('')
  const [view, setView]   = useState('board')   // 'board' | 'list'
  const [sortDir, setSortDir] = useState('new')  // 'new' | 'old'
  const [scheduling, setScheduling] = useState(null)
  const [dragId, setDragId] = useState(null)
  const [openId, setOpenId] = useState(null)   // a note tapped open to read in full
  const [zOrder, setZOrder] = useState([])     // ids, most recently touched last
  const [boardW, setBoardW] = useState(0)
  const lastW = useRef(0)
  // The board used to be a fixed 64vh box and notes stored their top as a % of
  // it; that's still the board's minimum height and what an old `y` % means.
  const [minH, setMinH] = useState(() => Math.round((typeof window !== 'undefined' ? window.innerHeight : 800) * 0.64))

  useEffect(() => { getThoughts().then(t => { setThoughtsState(t); setLoaded(true) }) }, [])

  // Also keep the old `y` % roughly right, so an older copy of the app (e.g. a
  // phone still running a cached build offline) shows the notes sensibly too.
  const withCompatY = (list) => {
    const H = boardHeight(list, minH, minH)
    return list.map(t => typeof t.py === 'number' ? { ...t, y: Math.max(0, Math.min(92, (t.py / H) * 100)) } : t)
  }
  const persist = (next) => { setThoughtsState(next); setThoughts(next).catch(() => {}) }

  // ── Measure the board (its width decides how many notes fit per row) ──
  const roRef = useRef(null)
  const boardRef = useRef(null)
  const setBoardEl = useCallback((el) => {
    roRef.current?.disconnect()
    boardRef.current = el
    if (!el) return
    const measure = () => {
      const w = el.clientWidth
      if (w) { setBoardW(w); lastW.current = w }
      setMinH(Math.round(window.innerHeight * 0.64))
    }
    measure()
    roRef.current = new ResizeObserver(measure)
    roRef.current.observe(el)
  }, [])
  useEffect(() => () => roRef.current?.disconnect(), [])

  // Notes pinned from elsewhere (e.g. "Move to Thoughts" on a task) arrive
  // flagged autoPlace — drop each into an open spot once the board is measured.
  useEffect(() => {
    if (!boardW || !thoughts.some(t => t.autoPlace)) return
    let placed = thoughts.filter(t => !t.autoPlace)
    const out = thoughts.map(t => {
      if (!t.autoPlace) return t
      const { autoPlace, ...rest } = t
      const n = { ...rest, ...freeSpot(placed, boardW, minH) }
      placed = [...placed, n]
      return n
    })
    persist(withCompatY(out))
  }, [boardW, thoughts]) // eslint-disable-line react-hooks/exhaustive-deps

  const bringToFront = (id) => setZOrder(z => [...z.filter(x => x !== id), id])

  // ── Drag a sticky note around the board (a tap opens it instead) ──
  const dragRef = useRef(null)
  const onNotePointerDown = (e, t) => {
    // Let the schedule/delete buttons work — only drag from the note body.
    if (e.target.closest('button')) return
    const board = boardRef.current
    if (!board) return
    e.preventDefault()
    const W = board.clientWidth
    const H = board.clientHeight
    dragRef.current = { id: t.id, startX: e.clientX, startY: e.clientY,
      origL: noteLeft(t, W), origT: noteTop(t, minH), W, H, moved: false }
    bringToFront(t.id)
    setDragId(t.id)
    window.addEventListener('pointermove', onDragMove)
    window.addEventListener('pointerup', onDragEnd)
  }
  const onDragMove = (e) => {
    const d = dragRef.current
    if (!d) return
    const dx = e.clientX - d.startX, dy = e.clientY - d.startY
    // A few px of finger wobble is still a tap.
    if (!d.moved && Math.hypot(dx, dy) < 6) return
    d.moved = true
    const left = Math.max(0, Math.min(d.W - NOTE_W - 8, d.origL + dx))
    const top = Math.max(0, Math.min(d.H - 40, d.origT + dy))   // board grows as you near its bottom
    const nx = Math.max(0, Math.min(92, (left / d.W) * 100))
    setThoughtsState(prev => prev.map(x => x.id === d.id ? { ...x, x: nx, py: Math.round(top) } : x))
  }
  const onDragEnd = () => {
    const d = dragRef.current
    window.removeEventListener('pointermove', onDragMove)
    window.removeEventListener('pointerup', onDragEnd)
    dragRef.current = null
    setDragId(null)
    if (!d) return
    if (d.moved) {
      // Persist the new position.
      setThoughtsState(prev => { const next = withCompatY(prev); setThoughts(next).catch(() => {}); return next })
    } else {
      // A tap: open the note to read all of it (tap again to fold it back).
      setOpenId(cur => cur === d.id ? null : d.id)
    }
  }

  // Re-grid the whole board: open notes newest-first, then scheduled ones.
  const tidyUp = () => {
    const W = boardRef.current?.clientWidth || lastW.current
    if (!W) return
    const order = [...thoughts].sort((a, b) =>
      (a.scheduled === b.scheduled ? 0 : a.scheduled ? 1 : -1) || b.createdAt.localeCompare(a.createdAt))
    setOpenId(null)
    persist(withCompatY(tidy(order, W)))
  }

  const addThought = (e) => {
    if (e?.currentTarget) bloomBurst(e.currentTarget)
    const body = text.trim()
    if (!body) return
    const W = boardRef.current?.clientWidth || lastW.current
    const note = {
      id: 'th-' + Date.now(),
      text: body,
      createdAt: new Date().toISOString(),
      // First open spot on the board; if the board isn't on screen (List
      // view), it's placed the next time the board is.
      ...(W ? freeSpot(thoughts, W, minH) : { x: 3, y: 3, autoPlace: true }),
      rot: -7 + Math.random() * 14,   // slight tilt
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      scheduled: false,
    }
    persist(withCompatY([note, ...thoughts]))
    bringToFront(note.id)
    setText('')
  }

  const deleteThought = (id) => persist(thoughts.filter(t => t.id !== id))
  const markScheduled = (id) => persist(thoughts.map(t => t.id === id ? { ...t, scheduled: true } : t))

  // Mark a thought completed. Completing drops it onto the day it was finished
  // as an already-done, unscheduled ("anytime") commitment — so it shows up in
  // the Day and Week views for that date — and records that completion in the
  // shared activity log (keyed to the same commitment). That log is what powers
  // the Informatics page and the calendar's streak flame, so a finished thought
  // counts toward the gamified stats without having to be scheduled to a time
  // first. Once completed, the note leaves the board: it now lives on as the
  // dated event. (To reverse it, uncheck or remove that event on its day.)
  const completeThought = (t, anchorEl) => {
    if (anchorEl) bloomBurst(anchorEl)
    const label = (t.text || '').trim()
    const d = new Date()
    const date = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
    const dateLabel = d.toLocaleDateString('en-US', { weekday:'long', month:'long', day:'numeric' })
    const cid = 'c-th-' + Date.now().toString(36)
    // A dated commitment with no time is an "unscheduled" item; done:true so it
    // lands already crossed off on that day.
    addCommitment?.({
      id: cid, text: label, date, time: null, durationMins: null,
      cat: '', done: true, createdAt: new Date().toISOString(),
    })
    appendLog?.({ date, dateLabel, label, tag:'', storageKey: cid })
    persist(thoughts.filter(x => x.id !== t.id))
  }

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
      <div className="page-sub">Jot a thought — it lands on the board with a timestamp. Drag notes to rearrange them, search, sort, schedule one into your calendar, or mark it ✓ completed to count toward your progress.</div>

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
        {view === 'board' && thoughts.length > 1 && (
          <button onClick={tidyUp} title="Line the notes up so none are hidden"
            style={{ fontSize:11, padding:'5px 12px', borderRadius:20, border:'1px solid var(--border)', background:'white', color:'var(--muted)', cursor:'pointer', fontFamily:'DM Sans,sans-serif', fontWeight:600 }}>
            ✨ Tidy up
          </button>
        )}
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
      ) : view === 'board' ? (<>
        {boardW > 0 && hasPileUp(thoughts, boardW, minH) && (
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:10, marginBottom:10, padding:'8px 12px', borderRadius:12, background:'#FFF8E6', border:'1px solid #F0DDB0', fontSize:12, color:'#6B5530' }}>
            <span>Some notes are piled on top of each other.</span>
            <button onClick={tidyUp}
              style={{ fontSize:11, padding:'5px 12px', borderRadius:20, border:'none', background:'linear-gradient(135deg, #F7DDB0, #FBD1DE)', color:'#5A4030', cursor:'pointer', fontFamily:'DM Sans,sans-serif', fontWeight:700, whiteSpace:'nowrap' }}>
              ✨ Tidy up
            </button>
          </div>
        )}
        {/* ── Scattered board — grows taller as it fills ── */}
        <div ref={setBoardEl} style={{
          position:'relative', height: boardHeight(thoughts, minH, minH), borderRadius:16, overflow:'hidden',
          border:'1px solid #D8C7A8',
          background:'repeating-linear-gradient(45deg, #E9D8B8 0 2px, #E4D2AE 2px 4px), radial-gradient(circle at 50% 40%, #EAD9B9, #DFC9A2)',
          boxShadow:'inset 0 2px 18px rgba(120,95,50,.28)',
          padding:8,
        }}>
          {/* oldest first, so newer notes sit on top of older ones */}
          {[...filtered].sort((a, b) => a.createdAt.localeCompare(b.createdAt)).map(t => {
            const dragging = dragId === t.id
            const open = openId === t.id
            const z = zOrder.indexOf(t.id)
            return (
              <div key={t.id}
                onPointerDown={e => onNotePointerDown(e, t)}
                style={{ position:'absolute', width:NOTE_W,
                  left:`min(${t.x || 0}%, calc(100% - ${NOTE_W + 8}px))`, top: noteTop(t, minH),
                  touchAction:'none', cursor: dragging ? 'grabbing' : 'grab',
                  zIndex: dragging ? 1000 : open ? 999 : 1 + (z < 0 ? 0 : z + 1),
                  transition: dragging ? 'none' : 'box-shadow .15s' }}>
                <div style={{ position:'relative', transform: dragging ? 'scale(1.05)' : 'none', transition:'transform .12s' }}>
                  <Sticky t={t} onSchedule={setScheduling} onComplete={completeThought} onDelete={deleteThought}
                    clampLines={open ? 0 : 5} />
                </div>
              </div>
            )
          })}
        </div>
      </>) : (
        // ── Sorted list ──
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(150px, 1fr))', gap:10 }}>
          {sorted.map(t => (
            <Sticky key={t.id} t={t} onSchedule={setScheduling} onComplete={completeThought} onDelete={deleteThought} compact
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
