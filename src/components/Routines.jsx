import { useState, useEffect, useCallback } from 'react'
import { MORNING_ROUTINE, NIGHT_ROUTINE } from '../data/schedule.js'
import { getRoutines, setRoutines, getRoutineLog, setRoutineLog } from '../lib/storage.js'

// ── Constants ──────────────────────────────────────────────────
const CATS = ['sleep','health','polish','fitness','career','personal','lab']
const CAT_COLORS = {
  sleep:   { bg:'#E8F4F0', text:'#2D6A4F', dot:'#52B788' },
  health:  { bg:'#FFF3E4', text:'#7B4F1E', dot:'#E07B2E' },
  polish:  { bg:'#F5EEF8', text:'#6B3FA0', dot:'#A855F7' },
  fitness: { bg:'#EDF2FB', text:'#1E3A8A', dot:'#3B82F6' },
  career:  { bg:'#FEF9E7', text:'#78350F', dot:'#D97706' },
  personal:{ bg:'#F0FDF4', text:'#065F46', dot:'#06D6A0' },
  lab:     { bg:'#ECFDF5', text:'#065F46', dot:'#059669' },
}
const DEFAULT_EMOJIS = ['☀️','💧','✨','👗','📚','🗒️','🚪','🥚','🔬','🌙','📞','📝','📵','🗂️','🎹','💤','🏃‍♀️','⏰','🍽️','📖','💊','🧘','🪥','🛁']

function todayKey() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}

// ── Emoji picker ───────────────────────────────────────────────
function EmojiPicker({ value, onChange }) {
  const [open, setOpen] = useState(false)
  return (
    <div style={{ position:'relative', display:'inline-block' }}>
      <button onClick={() => setOpen(o=>!o)}
        style={{ fontSize:22, background:'rgba(255,255,255,.08)', border:'1px solid var(--border)', borderRadius:8, padding:'4px 8px', cursor:'pointer' }}>
        {value}
      </button>
      {open && (
        <div style={{ position:'absolute', top:'110%', left:0, background:'var(--forest)', border:'1px solid var(--border)', borderRadius:10, padding:8, display:'flex', flexWrap:'wrap', gap:4, zIndex:50, width:180 }}>
          {DEFAULT_EMOJIS.map(e => (
            <button key={e} onClick={() => { onChange(e); setOpen(false) }}
              style={{ fontSize:18, background:'none', border:'none', cursor:'pointer', padding:3, borderRadius:4, opacity: e===value ? 1 : .6 }}>
              {e}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Single editable item ───────────────────────────────────────
function ItemRow({ item, editMode, done, onToggle, onChange, onDelete, hideCheck }) {
  const c = CAT_COLORS[item.cat] || CAT_COLORS.career

  if (editMode) return (
    <div style={{ background:'rgba(255,255,255,.04)', borderRadius:12, padding:'12px 14px', marginBottom:8, border:'1px solid var(--border)' }}>
      <div style={{ display:'flex', gap:8, alignItems:'flex-start', flexWrap:'wrap' }}>
        {/* Emoji */}
        <EmojiPicker value={item.icon} onChange={v => onChange({ ...item, icon: v })} />
        {/* Time */}
        <input value={item.time} onChange={e => onChange({ ...item, time: e.target.value })}
          placeholder="Time"
          style={{ width:90, fontSize:12, padding:'6px 8px', borderRadius:8, border:'1px solid var(--border)', background:'rgba(255,255,255,.06)', color:'var(--text)', fontFamily:'DM Sans, sans-serif' }} />
        {/* Habit name */}
        <input value={item.habit} onChange={e => onChange({ ...item, habit: e.target.value })}
          placeholder="Habit name"
          style={{ flex:1, minWidth:120, fontSize:13, padding:'6px 10px', borderRadius:8, border:'1px solid var(--border)', background:'rgba(255,255,255,.06)', color:'var(--text)', fontFamily:'DM Sans, sans-serif' }} />
        {/* Category */}
        <select value={item.cat} onChange={e => onChange({ ...item, cat: e.target.value })}
          style={{ fontSize:11, padding:'6px 8px', borderRadius:8, border:'1px solid var(--border)', background:'var(--forest)', color:'var(--green-light)', fontFamily:'DM Sans, sans-serif', cursor:'pointer' }}>
          {CATS.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        {/* Delete */}
        <button onClick={onDelete}
          style={{ background:'rgba(255,100,100,.1)', border:'1px solid rgba(255,100,100,.3)', color:'#FF9494', borderRadius:8, padding:'6px 10px', cursor:'pointer', fontSize:12 }}>
          ✕
        </button>
      </div>
      {/* Detail text */}
      <textarea value={item.detail} onChange={e => onChange({ ...item, detail: e.target.value })}
        placeholder="Detail / reminder text…"
        style={{ width:'100%', marginTop:8, fontSize:12, padding:'8px 10px', borderRadius:8, border:'1px solid var(--border)', background:'rgba(255,255,255,.04)', color:'var(--muted)', fontFamily:'DM Sans, sans-serif', resize:'vertical', minHeight:48, lineHeight:1.5 }} />
    </div>
  )

  return (
    <div style={{ display:'flex', gap:12, alignItems:'flex-start', padding:'12px 16px', borderBottom:'1px solid rgba(255,255,255,.05)', opacity: done ? .45 : 1 }}>
      {/* Checkoff circle — only shown in Today, not in settings */}
      {!hideCheck && <div onClick={onToggle}
        style={{ width:20, height:20, borderRadius:'50%', flexShrink:0, marginTop:3, cursor:'pointer',
          border: done ? 'none' : `2px solid ${c.dot}`,
          background: done ? c.dot : 'transparent',
          display:'flex', alignItems:'center', justifyContent:'center', transition:'all .2s' }}>
        {done && <span style={{ color:'white', fontSize:11, fontWeight:700 }}>✓</span>}
      </div>}
      <div style={{ fontSize:20, minWidth:26, textAlign:'center' }}>{item.icon}</div>
      <div style={{ flex:1 }}>
        <div style={{ display:'flex', alignItems:'baseline', gap:8, marginBottom:3, flexWrap:'wrap' }}>
          <span style={{ fontFamily:'DM Sans, sans-serif', fontSize:11, color:'var(--muted)', letterSpacing:.5 }}>{item.time}</span>
          <span className="serif" style={{ fontSize:15, color:'var(--sand)', fontWeight:600, textDecoration: done ? 'line-through' : 'none' }}>{item.habit}</span>
        </div>
        <div style={{ fontSize:12, color:'var(--muted)', lineHeight:1.5, marginBottom:4 }}>{item.detail}</div>
        <span style={{ fontSize:9, letterSpacing:1.5, textTransform:'uppercase', padding:'2px 7px', borderRadius:10, background:c.bg, color:c.text, fontWeight:600 }}>{item.cat}</span>
      </div>
    </div>
  )
}

// ── Single routine section ─────────────────────────────────────
function RoutineSection({ title, sub, icon, items, routineKey, routineLog, onUpdateItems, onUpdateLog, isDefault, settingsMode }) {
  const [editMode, setEditMode] = useState(false)
  const [localItems, setLocalItems] = useState(items)
  const [localSub, setLocalSub] = useState(sub)
  const [open, setOpen] = useState(false)
  const today = todayKey()
  const doneSet = new Set(Object.keys(routineLog[today] || {}).filter(k => routineLog[today][k]))

  // Keep in sync when items prop changes
  useEffect(() => { setLocalItems(items) }, [items])

  const doneCount = localItems.filter(it => doneSet.has(`${routineKey}-${it.habit}`)).length

  const toggleItem = async (habit) => {
    const key = `${routineKey}-${habit}`
    const isNowDone = !doneSet.has(key)
    const updated = {
      ...routineLog,
      [today]: { ...(routineLog[today] || {}), [key]: isNowDone }
    }
    await onUpdateLog(updated)
  }

  const saveEdits = async () => {
    await onUpdateItems(routineKey, localItems, localSub)
    setEditMode(false)
  }

  const cancelEdits = () => {
    setLocalItems(items)
    setLocalSub(sub)
    setEditMode(false)
  }

  const addItem = () => {
    setLocalItems(prev => [...prev, {
      time: '', habit: 'New habit', icon: '⭐', cat: 'health', detail: ''
    }])
  }

  return (
    <div style={{ marginBottom:12 }}>
      {/* Header */}
      <div style={{ background:'var(--forest)', borderRadius: open ? '14px 14px 0 0' : 14, padding:'14px 18px', display:'flex', alignItems:'center', gap:10, justifyContent:'space-between' }}>
        <div style={{ display:'flex', alignItems:'center', gap:10, cursor:'pointer', flex:1 }} onClick={() => setOpen(o=>!o)}>
          <span style={{ fontSize:22 }}>{icon}</span>
          <div>
            <div className="serif" style={{ fontSize:18, color:'var(--sand)', fontWeight:600 }}>{title}</div>
            <div style={{ fontSize:11, color:'var(--green-mid)', marginTop:1 }}>
              {editMode
                ? <input value={localSub} onChange={e=>setLocalSub(e.target.value)}
                    onClick={e=>e.stopPropagation()}
                    style={{ fontSize:11, background:'rgba(255,255,255,.08)', border:'1px solid rgba(255,255,255,.2)', borderRadius:6, padding:'2px 8px', color:'var(--green-light)', fontFamily:'DM Sans,sans-serif', width:200 }}/>
                : <>{localSub} · {doneCount}/{localItems.length} done today</>}
            </div>
          </div>
        </div>
        <div style={{ display:'flex', gap:8, alignItems:'center' }}>
          {!editMode ? (
            <button onClick={(e) => { e.stopPropagation(); setOpen(true); setEditMode(true) }}
              style={{ fontSize:12, padding:'5px 12px', borderRadius:20, border:'1px solid rgba(255,255,255,.15)', background:'none', color:'var(--green-light)', cursor:'pointer', fontFamily:'DM Sans, sans-serif' }}>
              ✏️ Edit
            </button>
          ) : (
            <>
              <button onClick={saveEdits}
                style={{ fontSize:12, padding:'5px 12px', borderRadius:20, border:'none', background:'var(--teal)', color:'var(--ocean)', cursor:'pointer', fontFamily:'DM Sans, sans-serif', fontWeight:600 }}>
                Save
              </button>
              <button onClick={cancelEdits}
                style={{ fontSize:12, padding:'5px 12px', borderRadius:20, border:'1px solid rgba(255,255,255,.15)', background:'none', color:'var(--muted)', cursor:'pointer', fontFamily:'DM Sans, sans-serif' }}>
                Cancel
              </button>
            </>
          )}
          <span style={{ color:'var(--green-mid)', cursor:'pointer' }} onClick={() => setOpen(o=>!o)}>
            {open ? '▴' : '▾'}
          </span>
        </div>
      </div>

      {/* Body */}
      {open && (
        <div style={{ background:'rgba(7,26,62,.8)', borderRadius:'0 0 14px 14px', border:'1px solid var(--border)', borderTop:'none' }}>
          {editMode ? (
            <div style={{ padding:'14px 14px 8px' }}>
              {localItems.map((item, i) => (
                <ItemRow key={i} item={item} editMode
                  onChange={updated => setLocalItems(prev => prev.map((it,j) => j===i ? updated : it))}
                  onDelete={() => setLocalItems(prev => prev.filter((_,j) => j!==i))}
                  done={false} onToggle={() => {}}
                />
              ))}
              <div style={{ display:'flex', gap:8, padding:'8px 0 4px', flexWrap:'wrap' }}>
                <button onClick={addItem}
                  style={{ fontSize:11, padding:'7px 16px', borderRadius:20, border:'1px solid var(--border)', background:'none', color:'var(--teal)', cursor:'pointer', fontFamily:'DM Sans, sans-serif' }}>
                  + Add item
                </button>
                {!isDefault && (
                  <button onClick={() => onUpdateItems(routineKey, null)}
                    style={{ fontSize:11, padding:'7px 16px', borderRadius:20, border:'1px solid rgba(255,100,100,.3)', background:'none', color:'#FF9494', cursor:'pointer', fontFamily:'DM Sans, sans-serif' }}>
                    ↩ Reset to defaults
                  </button>
                )}
              </div>
            </div>
          ) : (
            localItems.map((item, i) => (
              <ItemRow key={i} item={item} editMode={false}
                done={doneSet.has(`${routineKey}-${item.habit}`)}
                onToggle={() => toggleItem(item.habit)}
                onChange={() => {}} onDelete={() => {}}
                hideCheck={settingsMode}
              />
            ))
          )}
        </div>
      )}
    </div>
  )
}

// ── Main ───────────────────────────────────────────────────────
export default function Routines() {
  const [morningItems, setMorningItems] = useState(MORNING_ROUTINE)
  const [nightItems,   setNightItems]   = useState(NIGHT_ROUTINE)
  const [morningSub,   setMorningSub]   = useState('6:00 – 7:50 AM · Weekdays')
  const [nightSub,     setNightSub]     = useState('5:00 PM – 10:30 PM')
  const [routineLog,   setRoutineLog_]  = useState({})
  const [morningIsDefault, setMorningIsDefault] = useState(true)
  const [nightIsDefault,   setNightIsDefault]   = useState(true)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([getRoutines(), getRoutineLog()]).then(([routines, log]) => {
      if (routines.morning) { setMorningItems(routines.morning); setMorningIsDefault(false) }
      if (routines.night)   { setNightItems(routines.night);     setNightIsDefault(false)   }
      if (routines.morningSub) setMorningSub(routines.morningSub)
      if (routines.nightSub)   setNightSub(routines.nightSub)
      setRoutineLog_(log)
      setLoading(false)
    })
  }, [])

  const updateLog = useCallback(async (next) => {
    setRoutineLog_(next)
    await setRoutineLog(next)
  }, [])

  const updateItems = useCallback(async (key, items, sub) => {
    // items = null means reset to default
    if (key === 'morning') {
      const next = items ?? MORNING_ROUTINE
      setMorningItems(next)
      setMorningIsDefault(items === null)
      const cur = await getRoutines()
      await setRoutines({ ...cur, morning: items, morningSub: sub ?? cur.morningSub })
    } else {
      const next = items ?? NIGHT_ROUTINE
      setNightItems(next)
      setNightIsDefault(items === null)
      const cur = await getRoutines()
      await setRoutines({ ...cur, night: items, nightSub: sub ?? cur.nightSub })
    }
  }, [])

  if (loading) return <div style={{ padding:20, color:'var(--muted)', fontSize:13 }}>Loading…</div>

  return (
    <div>
      <div className="page-title">Routines</div>
      <div className="page-sub">Tap ✏️ Edit to customize · changes save permanently</div>
      <RoutineSection
        title="Morning Routine" sub={morningSub} icon="☀️"
        items={morningItems} routineKey="morning"
        routineLog={routineLog} onUpdateLog={updateLog}
        onUpdateItems={updateItems} isDefault={morningIsDefault} settingsMode
      />
      <RoutineSection
        title="Night Routine" sub={nightSub} icon="🌙"
        items={nightItems} routineKey="night"
        routineLog={routineLog} onUpdateLog={updateLog}
        onUpdateItems={updateItems} isDefault={nightIsDefault} settingsMode
      />
    </div>
  )
}
