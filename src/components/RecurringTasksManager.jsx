import { useState } from 'react'

const DAYS = ['monday','tuesday','wednesday','thursday','friday','saturday','sunday']
const DAY_LABELS = { monday:'Monday', tuesday:'Tuesday', wednesday:'Wednesday', thursday:'Thursday', friday:'Friday', saturday:'Saturday', sunday:'Sunday' }

const WEEK_CATS  = ['class','lab','career','health','fitness','personal','urgent','sleep']
const TODAY_TAGS = ['class','lab','career','health','fitness','personal','urgent','sleep','polish','carried']

const CAT_COLORS = {
  lab:'#059669', class:'#7C3AED', career:'#D97706', personal:'#A855F7',
  urgent:'#EF4444', health:'#E07B2E', fitness:'#3B82F6', sleep:'#52B788',
  polish:'#EC4899', carried:'#F59E0B',
}

function slugify(text) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 30)
}

// ── Small reusable UI ──────────────────────────────────────────
function Tag({ value }) {
  const color = CAT_COLORS[value] || '#9CA3AF'
  return (
    <span style={{ fontSize:9, padding:'2px 7px', borderRadius:10, background:`${color}18`, color, fontWeight:600, letterSpacing:1, textTransform:'uppercase' }}>
      {value}
    </span>
  )
}

function Pill({ label, color }) {
  return (
    <span style={{ fontSize:10, padding:'3px 9px', borderRadius:10, background:`${color}18`, color, fontWeight:600, letterSpacing:.5, textTransform:'uppercase' }}>
      {label}
    </span>
  )
}

// ── Week Task Row ──────────────────────────────────────────────
function WeekTaskRow({ task, onEdit, onDelete }) {
  return (
    <div style={{ display:'flex', gap:10, alignItems:'center', background:'white', borderRadius:10, border:'1px solid var(--border)', padding:'10px 13px', marginBottom:6 }}>
      <div style={{ flex:1 }}>
        <div style={{ fontSize:13, fontWeight:500, color:'var(--text)', marginBottom:4 }}>{task.text}</div>
        <div style={{ display:'flex', gap:5, flexWrap:'wrap', alignItems:'center' }}>
          <Tag value={task.cat} />
          {task.carry && <Pill label="carry-forward" color="#F59E0B" />}
          <span style={{ fontSize:10, color:'var(--muted)', fontFamily:'monospace' }}>id: {task.id}</span>
        </div>
      </div>
      <button onClick={onEdit}   style={btnStyle('var(--forest)','var(--green-light)')}>Edit</button>
      <button onClick={onDelete} style={btnStyle('#EF4444','white')}>Del</button>
    </div>
  )
}

// ── Today Task Row ─────────────────────────────────────────────
function TodayTaskRow({ task, onEdit, onDelete }) {
  return (
    <div style={{ display:'flex', gap:10, alignItems:'center', background:'white', borderRadius:10, border:'1px solid var(--border)', padding:'10px 13px', marginBottom:6 }}>
      <div style={{ flex:1 }}>
        <div style={{ fontSize:13, fontWeight:500, color:'var(--text)', marginBottom:3 }}>{task.label}</div>
        {task.note && <div style={{ fontSize:11, color:'var(--muted)', marginBottom:4 }}>{task.note}</div>}
        <div style={{ display:'flex', gap:5, flexWrap:'wrap', alignItems:'center' }}>
          <Tag value={task.tag} />
          <span style={{ fontSize:10, color:'var(--muted)', fontFamily:'monospace' }}>id: {task.id}</span>
        </div>
      </div>
      <button onClick={onEdit}   style={btnStyle('var(--forest)','var(--green-light)')}>Edit</button>
      <button onClick={onDelete} style={btnStyle('#EF4444','white')}>Del</button>
    </div>
  )
}

function btnStyle(bg, color) {
  return { fontSize:11, padding:'5px 10px', borderRadius:8, border:'none', background:bg, color, cursor:'pointer', fontFamily:'DM Sans,sans-serif', fontWeight:600, flexShrink:0 }
}

// ── Week Task Form ─────────────────────────────────────────────
function WeekTaskForm({ initial, dayName, onSave, onCancel }) {
  const [text,  setText]  = useState(initial?.text  || '')
  const [cat,   setCat]   = useState(initial?.cat   || 'lab')
  const [carry, setCarry] = useState(initial?.carry || false)
  const [id,    setId]    = useState(initial?.id    || '')

  const handleSave = () => {
    if (!text.trim()) return
    const finalId = id.trim() || `${dayName.slice(0,3)}-${slugify(text)}`
    onSave({ id: finalId, text: text.trim(), cat, carry })
  }

  return (
    <div style={{ background:'#F7F6F3', borderRadius:12, border:'1px solid var(--border)', padding:14, marginBottom:10 }}>
      <div style={{ fontSize:11, color:'var(--muted)', letterSpacing:1, textTransform:'uppercase', marginBottom:8 }}>
        {initial ? 'Edit Week Task' : 'New Week Task'}
      </div>
      <input value={text} onChange={e => setText(e.target.value)} placeholder="Task text…"
        style={inputStyle} />
      <div style={{ display:'flex', gap:8, flexWrap:'wrap', marginBottom:8 }}>
        <select value={cat} onChange={e => setCat(e.target.value)} style={selectStyle}>
          {WEEK_CATS.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <label style={{ display:'flex', alignItems:'center', gap:5, fontSize:12, color:'var(--text)', cursor:'pointer' }}>
          <input type="checkbox" checked={carry} onChange={e => setCarry(e.target.checked)} />
          Carry forward if undone
        </label>
      </div>
      <div style={{ marginBottom:10 }}>
        <div style={{ fontSize:10, color:'var(--muted)', letterSpacing:1, textTransform:'uppercase', marginBottom:3 }}>
          Custom ID (optional — auto-generated if blank)
        </div>
        <input value={id} onChange={e => setId(e.target.value)} placeholder={`e.g. ${dayName.slice(0,3)}-lab`}
          style={{ ...inputStyle, fontFamily:'monospace', fontSize:12 }} />
      </div>
      <div style={{ display:'flex', gap:8 }}>
        <button onClick={handleSave} style={btnStyle('var(--forest)','var(--green-light)')}>Save</button>
        <button onClick={onCancel}   style={btnStyle('#E5E7EB','var(--text)')}>Cancel</button>
      </div>
    </div>
  )
}

// ── Today Task Form ────────────────────────────────────────────
function TodayTaskForm({ initial, dayName, onSave, onCancel }) {
  const [label, setLabel] = useState(initial?.label || '')
  const [note,  setNote]  = useState(initial?.note  || '')
  const [tag,   setTag]   = useState(initial?.tag   || 'lab')
  const [id,    setId]    = useState(initial?.id    || '')

  const handleSave = () => {
    if (!label.trim()) return
    const finalId = id.trim() || `${dayName.slice(0,3)}-${slugify(label)}`
    onSave({ id: finalId, label: label.trim(), note: note.trim(), tag })
  }

  return (
    <div style={{ background:'#F7F6F3', borderRadius:12, border:'1px solid var(--border)', padding:14, marginBottom:10 }}>
      <div style={{ fontSize:11, color:'var(--muted)', letterSpacing:1, textTransform:'uppercase', marginBottom:8 }}>
        {initial ? 'Edit Today Task' : 'New Today Task'}
      </div>
      <input value={label} onChange={e => setLabel(e.target.value)} placeholder="Label (e.g. 9:50 AM — Coral Reef class)…"
        style={inputStyle} />
      <input value={note} onChange={e => setNote(e.target.value)} placeholder="Note (optional sub-text)…"
        style={{ ...inputStyle, marginTop:6 }} />
      <div style={{ display:'flex', gap:8, flexWrap:'wrap', marginBottom:8 }}>
        <select value={tag} onChange={e => setTag(e.target.value)} style={selectStyle}>
          {TODAY_TAGS.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>
      <div style={{ marginBottom:10 }}>
        <div style={{ fontSize:10, color:'var(--muted)', letterSpacing:1, textTransform:'uppercase', marginBottom:3 }}>
          Custom ID (optional — auto-generated if blank)
        </div>
        <input value={id} onChange={e => setId(e.target.value)} placeholder={`e.g. ${dayName.slice(0,3)}-lab-am`}
          style={{ ...inputStyle, fontFamily:'monospace', fontSize:12 }} />
      </div>
      <div style={{ display:'flex', gap:8 }}>
        <button onClick={handleSave} style={btnStyle('var(--forest)','var(--green-light)')}>Save</button>
        <button onClick={onCancel}   style={btnStyle('#E5E7EB','var(--text)')}>Cancel</button>
      </div>
    </div>
  )
}

const inputStyle = { width:'100%', fontSize:13, padding:'8px 10px', borderRadius:9, border:'1px solid var(--border)', fontFamily:'DM Sans,sans-serif', outline:'none', boxSizing:'border-box', marginBottom:8 }
const selectStyle = { fontSize:12, padding:'6px 10px', borderRadius:9, border:'1px solid var(--border)', fontFamily:'DM Sans,sans-serif', background:'white', cursor:'pointer' }

// ── Main ───────────────────────────────────────────────────────
export default function RecurringTasksManager({ recurringTasks, updateRecurringTasks, defaultWeekTasks, defaultDailyTodos }) {
  const [activeDay,   setActiveDay]   = useState('monday')
  const [activePanel, setActivePanel] = useState('week') // 'week' | 'today'
  const [editingWeek,  setEditingWeek]  = useState(null)  // null | 'new' | task object
  const [editingToday, setEditingToday] = useState(null)
  const [confirmReset, setConfirmReset] = useState(false)

  // Live data — stored overrides or defaults
  const weekTasks  = recurringTasks?.weekTasks  ?? defaultWeekTasks
  const dailyTodos = recurringTasks?.dailyTodos ?? defaultDailyTodos

  function saveWeekTasks(day, tasks) {
    const next = { weekTasks: { ...weekTasks, [day]: tasks }, dailyTodos }
    updateRecurringTasks(next)
  }
  function saveDailyTodos(day, tasks) {
    const next = { weekTasks, dailyTodos: { ...dailyTodos, [day]: tasks } }
    updateRecurringTasks(next)
  }

  // ── Week task handlers ────────────────────────────────────
  const handleSaveWeekTask = (task) => {
    const current = weekTasks[activeDay] || []
    if (editingWeek && editingWeek !== 'new') {
      // editing existing — replace by id
      saveWeekTasks(activeDay, current.map(t => t.id === editingWeek.id ? task : t))
    } else {
      saveWeekTasks(activeDay, [...current, task])
    }
    setEditingWeek(null)
  }
  const handleDeleteWeekTask = (id) => {
    saveWeekTasks(activeDay, (weekTasks[activeDay] || []).filter(t => t.id !== id))
  }

  // ── Today task handlers ───────────────────────────────────
  const handleSaveTodayTask = (task) => {
    const current = dailyTodos[activeDay] || []
    if (editingToday && editingToday !== 'new') {
      saveDailyTodos(activeDay, current.map(t => t.id === editingToday.id ? task : t))
    } else {
      saveDailyTodos(activeDay, [...current, task])
    }
    setEditingToday(null)
  }
  const handleDeleteTodayTask = (id) => {
    saveDailyTodos(activeDay, (dailyTodos[activeDay] || []).filter(t => t.id !== id))
  }

  const handleReset = () => {
    updateRecurringTasks(null)
    setConfirmReset(false)
  }

  const currentWeekTasks  = weekTasks[activeDay]  || []
  const currentDailyTodos = dailyTodos[activeDay] || []

  return (
    <div>
      <div className="page-title">Recurring Tasks</div>
      <div className="page-sub">
        Edit the weekly templates shown in the <strong>Week</strong> and <strong>Today</strong> tabs every week.
        Changes sync to cloud immediately.
      </div>

      {/* Day selector */}
      <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginBottom:16 }}>
        {DAYS.map(d => (
          <button key={d} onClick={() => { setActiveDay(d); setEditingWeek(null); setEditingToday(null) }}
            style={{ fontSize:12, padding:'7px 14px', borderRadius:20, border:`1.5px solid ${activeDay===d?'var(--forest)':'var(--border)'}`,
              background:activeDay===d?'var(--forest)':'white', color:activeDay===d?'var(--green-light)':'var(--text)',
              cursor:'pointer', fontFamily:'DM Sans,sans-serif', fontWeight:activeDay===d?600:400 }}>
            {DAY_LABELS[d]}
          </button>
        ))}
      </div>

      {/* Panel toggle */}
      <div style={{ display:'flex', gap:0, marginBottom:16, borderRadius:10, overflow:'hidden', border:'1px solid var(--border)', width:'fit-content' }}>
        {['week','today'].map(p => (
          <button key={p} onClick={() => { setActivePanel(p); setEditingWeek(null); setEditingToday(null) }}
            style={{ fontSize:12, padding:'8px 20px', border:'none', cursor:'pointer', fontFamily:'DM Sans,sans-serif', fontWeight:600,
              background:activePanel===p?'var(--forest)':'white', color:activePanel===p?'var(--green-light)':'var(--muted)' }}>
            {p === 'week' ? 'Week Panel' : 'Today Schedule'}
          </button>
        ))}
      </div>

      {/* ── Week Panel tasks ── */}
      {activePanel === 'week' && (
        <div>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:10 }}>
            <p className="section-label" style={{ margin:0 }}>
              {DAY_LABELS[activeDay]} — Week Panel ({currentWeekTasks.length} tasks)
            </p>
            {!editingWeek && (
              <button onClick={() => setEditingWeek('new')}
                style={{ fontSize:12, padding:'6px 14px', borderRadius:9, border:'none', background:'var(--forest)', color:'var(--green-light)', cursor:'pointer', fontFamily:'DM Sans,sans-serif', fontWeight:600 }}>
                + Add Task
              </button>
            )}
          </div>

          <div style={{ fontSize:11, color:'var(--muted)', marginBottom:10, padding:'8px 12px', background:'#F7F6F3', borderRadius:9 }}>
            These appear as brief summary items in the <strong>This Week</strong> tab. Keep them concise.
          </div>

          {editingWeek === 'new' && (
            <WeekTaskForm dayName={activeDay} onSave={handleSaveWeekTask} onCancel={() => setEditingWeek(null)} />
          )}

          {currentWeekTasks.length === 0 ? (
            <div style={{ textAlign:'center', color:'var(--muted)', fontSize:13, padding:20 }}>No tasks for {DAY_LABELS[activeDay]} yet.</div>
          ) : currentWeekTasks.map(task => (
            editingWeek?.id === task.id
              ? <WeekTaskForm key={task.id} initial={task} dayName={activeDay}
                  onSave={handleSaveWeekTask} onCancel={() => setEditingWeek(null)} />
              : <WeekTaskRow key={task.id} task={task}
                  onEdit={() => setEditingWeek(task)}
                  onDelete={() => handleDeleteWeekTask(task.id)} />
          ))}
        </div>
      )}

      {/* ── Today Schedule tasks ── */}
      {activePanel === 'today' && (
        <div>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:10 }}>
            <p className="section-label" style={{ margin:0 }}>
              {DAY_LABELS[activeDay]} — Today Schedule ({currentDailyTodos.length} items)
            </p>
            {!editingToday && (
              <button onClick={() => setEditingToday('new')}
                style={{ fontSize:12, padding:'6px 14px', borderRadius:9, border:'none', background:'var(--forest)', color:'var(--green-light)', cursor:'pointer', fontFamily:'DM Sans,sans-serif', fontWeight:600 }}>
                + Add Item
              </button>
            )}
          </div>

          <div style={{ fontSize:11, color:'var(--muted)', marginBottom:10, padding:'8px 12px', background:'#F7F6F3', borderRadius:9 }}>
            These are the hour-by-hour items shown on the <strong>Today</strong> tab. Include times in the label (e.g. "9:50 AM — Coral Reef class").
          </div>

          {editingToday === 'new' && (
            <TodayTaskForm dayName={activeDay} onSave={handleSaveTodayTask} onCancel={() => setEditingToday(null)} />
          )}

          {currentDailyTodos.length === 0 ? (
            <div style={{ textAlign:'center', color:'var(--muted)', fontSize:13, padding:20 }}>No schedule items for {DAY_LABELS[activeDay]} yet.</div>
          ) : currentDailyTodos.map(task => (
            editingToday?.id === task.id
              ? <TodayTaskForm key={task.id} initial={task} dayName={activeDay}
                  onSave={handleSaveTodayTask} onCancel={() => setEditingToday(null)} />
              : <TodayTaskRow key={task.id} task={task}
                  onEdit={() => setEditingToday(task)}
                  onDelete={() => handleDeleteTodayTask(task.id)} />
          ))}
        </div>
      )}

      {/* Reset to defaults */}
      <div style={{ marginTop:32, paddingTop:20, borderTop:'1px solid var(--border)' }}>
        {!confirmReset ? (
          <button onClick={() => setConfirmReset(true)}
            style={{ fontSize:12, padding:'8px 16px', borderRadius:9, border:'1px solid #FECACA', background:'#FFF5F5', color:'#991B1B', cursor:'pointer', fontFamily:'DM Sans,sans-serif' }}>
            Reset all recurring tasks to built-in defaults
          </button>
        ) : (
          <div style={{ background:'#FFF5F5', borderRadius:12, border:'1px solid #FECACA', padding:14 }}>
            <div style={{ fontSize:13, color:'#991B1B', marginBottom:10 }}>
              This will discard ALL your custom recurring tasks and restore the original schedule. Are you sure?
            </div>
            <div style={{ display:'flex', gap:8 }}>
              <button onClick={handleReset} style={{ ...btnStyle('#EF4444','white') }}>Yes, reset to defaults</button>
              <button onClick={() => setConfirmReset(false)} style={{ ...btnStyle('#E5E7EB','var(--text)') }}>Cancel</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
