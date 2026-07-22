import { useState, useEffect, useRef, useCallback } from 'react'
import { getRoutines, setRoutines } from '../lib/storage.js'

// ── Shared helpers (also used by Today's routine cards) ─────────
export const ROUTINE_PRESET_COLORS = [
  '#059669','#7C3AED','#4A9EB5','#C4728E','#D97706','#7A8EC4',
  '#E07B2E','#3B82F6','#A855F7','#9A7CC4','#EF4444','#52B788','#8899AA',
]
const QUICK_EMOJIS = ['☀️','🌙','💧','☕','🏃‍♀️','🧘','📚','📝','💊','🪥','🛁','🍽️','📵','🎹','💤','✨','🚪','🔬']

// Old category → color, for one-time normalization of any legacy items.
const LEGACY_CAT_COLOR = { sleep:'#52B788', health:'#E07B2E', polish:'#A855F7', fitness:'#3B82F6', career:'#D97706', personal:'#06D6A0', lab:'#059669' }

let _idc = 0
export const newRoutineId = () => `r-${Date.now().toString(36)}-${_idc++}`

// 12h "5:00 PM" or 24h "17:00" → 24h "HH:MM" (for <input type="time">)
export function to24(s) {
  if (!s) return ''
  const ampm = s.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i)
  if (ampm) {
    let h = parseInt(ampm[1]); const mn = ampm[2]; const ap = ampm[3].toUpperCase()
    if (ap === 'PM' && h !== 12) h += 12
    if (ap === 'AM' && h === 12) h = 0
    return `${String(h).padStart(2,'0')}:${mn}`
  }
  const h24 = s.match(/^(\d{1,2}):(\d{2})$/)
  if (h24) return `${String(parseInt(h24[1])).padStart(2,'0')}:${h24[2]}`
  return ''
}
// 24h "HH:MM" → 12h "H:MM AM/PM" for display
export function to12(s) {
  if (!s) return ''
  const [h, m] = s.split(':').map(Number)
  if (isNaN(h)) return ''
  return `${h % 12 || 12}:${String(m).padStart(2,'0')} ${h >= 12 ? 'PM' : 'AM'}`
}

// Normalize any stored items (including legacy shapes) to the current model:
// { id, time (24h ''), label, icon, color, detail }
export function normalizeRoutineItems(items) {
  return (items || []).map(it => ({
    id:     it.id || newRoutineId(),
    time:   to24(it.time),
    label:  it.label ?? it.habit ?? '',
    icon:   it.icon || '⭐',
    color:  it.color || LEGACY_CAT_COLOR[it.cat] || '#52B788',
    detail: it.detail || '',
  }))
}

// Sort by time for display; timeless items keep their order, at the end.
export function sortByTime(items) {
  return [...items]
    .map((it, i) => ({ it, i }))
    .sort((a, b) => {
      const ta = a.it.time || '99:99', tb = b.it.time || '99:99'
      if (ta !== tb) return ta.localeCompare(tb)
      return a.i - b.i
    })
    .map(x => x.it)
}

// Close a popover when clicking anywhere outside its wrapper.
function useOutsideClose(open, setOpen) {
  const ref = useRef(null)
  useEffect(() => {
    if (!open) return
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open, setOpen])
  return ref
}

// ── Emoji input — type/paste ANY emoji, plus quick picks ───────
function EmojiInput({ value, onChange }) {
  const [open, setOpen] = useState(false)
  const ref = useOutsideClose(open, setOpen)
  return (
    <div ref={ref} style={{ position:'relative', flexShrink:0 }}>
      <input value={value} onChange={e => onChange(e.target.value)} onFocus={() => setOpen(true)}
        maxLength={4} aria-label="Emoji"
        style={{ width:44, fontSize:20, textAlign:'center', padding:'5px 4px', borderRadius:8, border:'1px solid var(--border)', background:'white', cursor:'pointer' }} />
      {open && (
        <div style={{ position:'absolute', top:'110%', left:0, background:'white', border:'1px solid var(--border)', borderRadius:10, padding:8, boxShadow:'0 8px 24px rgba(0,0,0,.12)', display:'flex', flexWrap:'wrap', gap:4, zIndex:60, width:200 }}>
          <div style={{ width:'100%', fontSize:10, color:'var(--muted)', marginBottom:2 }}>Pick one, or type any emoji in the box.</div>
          {QUICK_EMOJIS.map(e => (
            <button key={e} onClick={() => { onChange(e); setOpen(false) }}
              style={{ fontSize:18, background:'none', border:'none', cursor:'pointer', padding:3, borderRadius:4 }}>{e}</button>
          ))}
          <button onClick={() => setOpen(false)} style={{ width:'100%', marginTop:4, fontSize:11, background:'none', border:'1px solid var(--border)', borderRadius:6, padding:'4px', cursor:'pointer', color:'var(--muted)' }}>Done</button>
        </div>
      )}
    </div>
  )
}

// ── Color input — full picker + preset swatches ────────────────
function ColorInput({ value, onChange }) {
  const [open, setOpen] = useState(false)
  const ref = useOutsideClose(open, setOpen)
  return (
    <div ref={ref} style={{ position:'relative', flexShrink:0 }}>
      <button onClick={() => setOpen(o => !o)} title="Color"
        style={{ width:28, height:28, borderRadius:8, border:'1px solid var(--border)', background:value, cursor:'pointer' }} />
      {open && (
        <div style={{ position:'absolute', top:'110%', left:0, background:'white', border:'1px solid var(--border)', borderRadius:10, padding:10, boxShadow:'0 8px 24px rgba(0,0,0,.12)', zIndex:60, width:180 }}>
          <div style={{ display:'flex', flexWrap:'wrap', gap:5, marginBottom:8 }}>
            {ROUTINE_PRESET_COLORS.map(c => (
              <button key={c} onClick={() => onChange(c)}
                style={{ width:22, height:22, borderRadius:6, background:c, cursor:'pointer', border: value===c ? '2px solid var(--text)' : '2px solid transparent' }} />
            ))}
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            <input type="color" value={value} onChange={e => onChange(e.target.value)}
              style={{ width:32, height:28, border:'none', borderRadius:6, cursor:'pointer', padding:0, background:'none' }} />
            <span style={{ fontSize:11, color:'var(--muted)' }}>Custom</span>
            <button onClick={() => setOpen(false)} style={{ marginLeft:'auto', fontSize:11, background:'none', border:'1px solid var(--border)', borderRadius:6, padding:'4px 8px', cursor:'pointer', color:'var(--muted)' }}>Done</button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── One editable routine item row ──────────────────────────────
function ItemEditor({ item, onChange, onDelete }) {
  return (
    <div style={{ background:'white', border:'1px solid var(--border)', borderRadius:12, padding:'12px', marginBottom:8 }}>
      <div style={{ display:'flex', gap:8, alignItems:'center', flexWrap:'wrap' }}>
        <EmojiInput value={item.icon} onChange={v => onChange({ ...item, icon: v })} />
        <ColorInput value={item.color} onChange={v => onChange({ ...item, color: v })} />
        <input type="time" value={item.time} onChange={e => onChange({ ...item, time: e.target.value })}
          style={{ fontSize:12, padding:'6px 8px', borderRadius:8, border:'1px solid var(--border)', fontFamily:'DM Sans,sans-serif', color:'var(--text)' }} />
        <input value={item.label} onChange={e => onChange({ ...item, label: e.target.value })}
          placeholder="What is it?"
          style={{ flex:1, minWidth:120, fontSize:13, padding:'6px 10px', borderRadius:8, border:'1px solid var(--border)', fontFamily:'DM Sans,sans-serif', color:'var(--text)' }} />
        <button onClick={onDelete} title="Delete"
          style={{ background:'#FFF5F5', border:'1px solid #FECACA', color:'#EF4444', borderRadius:8, padding:'6px 10px', cursor:'pointer', fontSize:12, flexShrink:0 }}>✕</button>
      </div>
      <input value={item.detail} onChange={e => onChange({ ...item, detail: e.target.value })}
        placeholder="Note (optional)"
        style={{ width:'100%', marginTop:8, fontSize:12, padding:'7px 10px', borderRadius:8, border:'1px solid var(--border)', fontFamily:'DM Sans,sans-serif', color:'var(--muted)', boxSizing:'border-box' }} />
    </div>
  )
}

// ── One routine (morning / night) editor section ───────────────
function RoutineEditor({ title, icon, items, enabled, onChangeItems, onSetEnabled }) {
  const timed = sortByTime(items)
  const range = (() => {
    const withT = timed.filter(i => i.time)
    if (!withT.length) return ''
    const first = to12(withT[0].time), last = to12(withT[withT.length-1].time)
    return first === last ? first : `${first} – ${last}`
  })()

  const updateItem = (id, next) => onChangeItems(items.map(it => it.id === id ? next : it))
  const deleteItem = (id) => onChangeItems(items.filter(it => it.id !== id))
  const addItem = () => onChangeItems([...items, { id: newRoutineId(), time:'', label:'', icon:'⭐', color:'#52B788', detail:'' }])

  return (
    <div style={{ marginBottom:18, background:'var(--forest)', borderRadius:14, overflow:'hidden' }}>
      {/* Header with enable toggle */}
      <div style={{ padding:'14px 18px', display:'flex', alignItems:'center', justifyContent:'space-between', gap:10 }}>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <span style={{ fontSize:22 }}>{icon}</span>
          <div>
            <div className="serif" style={{ fontSize:18, color:'var(--sand)', fontWeight:600 }}>{title}</div>
            <div style={{ fontSize:11, color:'var(--green-mid)', marginTop:1 }}>
              {enabled ? (range || `${items.length} item${items.length===1?'':'s'}`) : 'Turned off'}
            </div>
          </div>
        </div>
        {/* Toggle switch */}
        <button onClick={() => onSetEnabled(!enabled)} title={enabled ? 'Turn off' : 'Turn on'}
          style={{ width:44, height:24, borderRadius:12, border:'none', cursor:'pointer', position:'relative',
            background: enabled ? 'var(--teal)' : 'rgba(255,255,255,.2)', transition:'background .2s', flexShrink:0 }}>
          <span style={{ position:'absolute', top:2, left: enabled ? 22 : 2, width:20, height:20, borderRadius:'50%', background:'white', transition:'left .2s' }} />
        </button>
      </div>

      {/* Body — only editable when enabled */}
      {enabled && (
        <div style={{ background:'var(--cream)', padding:'14px' }}>
          {items.length === 0 && (
            <div style={{ fontSize:12, color:'var(--muted)', padding:'4px 2px 12px' }}>No items yet — add your first below.</div>
          )}
          {/* Edit in insertion order so time fields don't jump around while typing */}
          {items.map(item => (
            <ItemEditor key={item.id} item={item}
              onChange={next => updateItem(item.id, next)}
              onDelete={() => deleteItem(item.id)} />
          ))}
          <button onClick={addItem}
            style={{ fontSize:12, padding:'8px 16px', borderRadius:20, border:'1px solid var(--border)', background:'white', color:'var(--teal)', cursor:'pointer', fontFamily:'DM Sans,sans-serif', fontWeight:600 }}>
            + Add item
          </button>
        </div>
      )}
    </div>
  )
}

// ── Main ───────────────────────────────────────────────────────
export default function Routines() {
  const [morning, setMorning] = useState([])
  const [night,   setNight]   = useState([])
  const [morningEnabled, setMorningEnabled] = useState(true)
  const [nightEnabled,   setNightEnabled]   = useState(true)
  const [loading, setLoading] = useState(true)
  // latest holds the full current routines state so the debounced flush always
  // writes everything at once — a single shared timer must never write a
  // partial payload, or a quick edit to one field clobbers another.
  const latest = useRef({ morning:[], night:[], morningEnabled:true, nightEnabled:true })
  const saveTimer = useRef(null)

  useEffect(() => {
    getRoutines().then(r => {
      const m = normalizeRoutineItems(r?.morning)
      const n = normalizeRoutineItems(r?.night)
      const me = r?.morningEnabled !== false
      const ne = r?.nightEnabled !== false
      setMorning(m); setNight(n); setMorningEnabled(me); setNightEnabled(ne)
      latest.current = { morning:m, night:n, morningEnabled:me, nightEnabled:ne }
      setLoading(false)
    })
  }, [])

  // Debounced persistence — writes the complete routines object 500ms after
  // the last edit. dbSet serializes writes per key, so this can't race itself.
  const scheduleSave = useCallback(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(async () => {
      try {
        const cur = await getRoutines()
        await setRoutines({ ...cur, ...latest.current })
      } catch (e) {
        console.error(e)
        alert(`⚠️ ${e.message || e}\n\nRoutine change was NOT saved. Check your connection and try again.`)
      }
    }, 500)
  }, [])

  const changeMorning = (items) => { setMorning(items); latest.current.morning = items; scheduleSave() }
  const changeNight   = (items) => { setNight(items);   latest.current.night = items;   scheduleSave() }
  const enableMorning = (on)    => { setMorningEnabled(on); latest.current.morningEnabled = on; scheduleSave() }
  const enableNight   = (on)    => { setNightEnabled(on);   latest.current.nightEnabled = on;   scheduleSave() }

  if (loading) return <div style={{ padding:20, color:'var(--muted)', fontSize:13 }}>Loading…</div>

  return (
    <div>
      <div className="page-title">Routines</div>
      <div className="page-sub">Set a time, emoji, and color for each step. Toggle a routine off if you don't use it. Changes save automatically.</div>
      <RoutineEditor title="Morning Routine" icon="☀️" items={morning} enabled={morningEnabled}
        onChangeItems={changeMorning} onSetEnabled={enableMorning} />
      <RoutineEditor title="Night Routine" icon="🌙" items={night} enabled={nightEnabled}
        onChangeItems={changeNight} onSetEnabled={enableNight} />
    </div>
  )
}
