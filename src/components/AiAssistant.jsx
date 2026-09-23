// src/components/AiAssistant.jsx
// The AI assistant sheet: type an instruction ("add these to my orgo task and
// check them off", "reschedule the dentist to Friday 3pm", "make a task for…")
// AND/OR add photos of the thing — a screenshot of an email about a seminar, a
// syllabus page, a flyer, a handwritten list. It plans the actions against your
// current tasks, shows the plan for you to confirm, then the parent applies it.
// Nothing changes until you tap Apply.
import { useEffect, useRef, useState } from 'react'
import { runAssistant, MAX_ASSISTANT_IMAGES } from '../lib/parseEvent.js'
import { compressImage, dataUrlToBase64 } from '../lib/trackers.js'
import { holdUpdateReload } from '../lib/notifications.js'

function fmt12(t) {
  if (!t) return ''
  const [h, m] = t.split(':').map(Number)
  return `${h % 12 || 12}:${String(m).padStart(2,'0')} ${h >= 12 ? 'PM' : 'AM'}`
}
function prettyDate(d) {
  if (!d) return ''
  const dt = new Date(d + 'T12:00:00')
  return dt.toLocaleDateString('en-US', { weekday:'short', month:'short', day:'numeric' })
}
function prettyDur(mins) {
  if (!mins) return ''
  if (mins < 60) return `${mins} min`
  return mins % 60 === 0 ? `${mins/60} h` : `${(mins/60).toFixed(1)} h`
}
function remindLabel(mins) {
  if (mins === 0) return 'at start'
  if (mins % 1440 === 0) return `${mins/1440}d before`
  if (mins % 60 === 0) return `${mins/60}h before`
  return `${mins}m before`
}

// The bold headline for a planned action.
function headline(a, titleOf) {
  const t = a.taskId ? (titleOf(a.taskId) || 'that task') : ''
  if (a.kind === 'create')  return `Create “${a.title}”`
  if (a.kind === 'event')   return `Add event “${a.title}”`
  if (a.kind === 'addSubtasks') {
    const allDone = a.subtasks.every(s => s.done)
    const someDone = a.subtasks.some(s => s.done)
    const tag = allDone ? ' (checked off)' : someDone ? ' (some checked)' : ''
    return `Add ${a.subtasks.length} subtask${a.subtasks.length > 1 ? 's' : ''} to “${t}”${tag}`
  }
  if (a.kind === 'setDone')    return `Mark “${t}” ${a.done ? 'complete' : 'not complete'}`
  if (a.kind === 'reschedule') return `Reschedule “${t}”`
  return 'Change'
}

const REMIND_PRESETS = [0, 5, 10, 15, 30, 60, 120, 1440, 2880, 10080]

const field = { width:'100%', fontSize:13.5, padding:'8px 10px', borderRadius:9, border:'1px solid var(--border)', fontFamily:'DM Sans,sans-serif', outline:'none', background:'white', color:'var(--text)', boxSizing:'border-box' }
const lbl = { fontSize:11, fontWeight:700, color:'var(--muted)', textTransform:'uppercase', letterSpacing:.6, marginBottom:4, display:'block' }
const pill = (on) => ({ fontSize:12, fontWeight:600, borderRadius:8, padding:'4px 9px', cursor:'pointer', fontFamily:'DM Sans,sans-serif',
  border: on ? '1px solid var(--forest)' : '1px solid var(--border)', background: on ? 'var(--forest)' : 'white', color: on ? 'var(--green-light)' : 'var(--muted)' })

function Field({ label, children, style }) {
  return <label style={{ display:'block', ...style }}><span style={lbl}>{label}</span>{children}</label>
}

// Inline editor for one planned action. Works on a draft copy so Cancel throws
// the edits away; Done hands the edited action back to the plan.
function ActionEditor({ action, categories, onSave, onCancel }) {
  const [d, setD] = useState(() => ({ ...action,
    subtasks: Array.isArray(action.subtasks) ? action.subtasks.map(s => ({ ...s })) : action.subtasks,
    reminders: Array.isArray(action.reminders) ? [...action.reminders] : [],
    categoryIds: Array.isArray(action.categoryIds) ? [...action.categoryIds] : [] }))
  const set = (k, v) => setD(prev => ({ ...prev, [k]: v }))
  const row = { display:'flex', gap:8, marginTop:10 }
  const hasTitle = d.kind === 'create' || d.kind === 'event'
  const hasWhen  = d.kind === 'create' || d.kind === 'reschedule'
  const canSave  = !hasTitle || !!(d.title || '').trim()

  const save = () => {
    if (!canSave) return
    const out = { ...d }
    if (hasTitle) out.title = d.title.trim()
    if (hasWhen) {
      out.date = d.date || null
      out.time = d.time || null
      const mins = parseInt(d.durationMins, 10)
      out.durationMins = mins > 0 ? mins : null
    }
    if (d.kind === 'event') {
      if (d.endDate && d.startDate && d.endDate < d.startDate) out.endDate = d.startDate
      if (d.allDay === false && d.startTime && d.endTime && d.endTime <= d.startTime && (!out.endDate || out.endDate === d.startDate)) out.endTime = null
    }
    if (Array.isArray(d.subtasks)) out.subtasks = d.subtasks.filter(s => (s.text || '').trim()).map(s => ({ ...s, text: s.text.trim() }))
    out.reminders = [...new Set(d.reminders)].sort((a, b) => a - b)
    onSave(out)
  }

  const setSub = (j, patch) => set('subtasks', d.subtasks.map((s, k) => k === j ? { ...s, ...patch } : s))

  return (
    <div>
      {hasTitle && (
        <Field label="Title">
          <textarea value={d.title || ''} onChange={e => set('title', e.target.value)} rows={2} autoFocus
            style={{ ...field, resize:'vertical', lineHeight:1.45 }} />
        </Field>
      )}

      {hasWhen && (<>
        <div style={row}>
          <Field label="Date" style={{ flex:1 }}>
            <input type="date" value={d.date || ''} onChange={e => set('date', e.target.value)} style={field} />
          </Field>
          <Field label="Time" style={{ flex:1 }}>
            <input type="time" value={d.time || ''} onChange={e => set('time', e.target.value)} style={field} />
          </Field>
        </div>
        <Field label="Duration (minutes)" style={{ marginTop:10 }}>
          <input type="number" min="0" step="5" inputMode="numeric" value={d.durationMins || ''} onChange={e => set('durationMins', e.target.value)} style={field} />
        </Field>
      </>)}

      {d.kind === 'event' && (<>
        <div style={row}>
          <Field label="Start" style={{ flex:1 }}>
            <input type="date" value={d.startDate || ''} onChange={e => set('startDate', e.target.value)} style={field} />
          </Field>
          <Field label="End" style={{ flex:1 }}>
            <input type="date" value={d.endDate || ''} onChange={e => set('endDate', e.target.value)} style={field} />
          </Field>
        </div>
        <label style={{ display:'flex', alignItems:'center', gap:8, marginTop:10, fontSize:13, color:'var(--text)' }}>
          <input type="checkbox" checked={d.allDay !== false} onChange={e => set('allDay', e.target.checked)} /> All day
        </label>
        {d.allDay === false && (
          <div style={row}>
            <Field label="From" style={{ flex:1 }}>
              <input type="time" value={d.startTime || ''} onChange={e => set('startTime', e.target.value)} style={field} />
            </Field>
            <Field label="To" style={{ flex:1 }}>
              <input type="time" value={d.endTime || ''} onChange={e => set('endTime', e.target.value)} style={field} />
            </Field>
          </div>
        )}
      </>)}

      {d.kind === 'setDone' && (
        <div style={{ ...row, alignItems:'center' }}>
          <button type="button" onClick={() => set('done', true)} style={pill(!!d.done)}>Mark complete</button>
          <button type="button" onClick={() => set('done', false)} style={pill(!d.done)}>Mark not complete</button>
        </div>
      )}

      {d.kind === 'create' && categories.length > 0 && (
        <div style={{ marginTop:10 }}>
          <span style={lbl}>Labels</span>
          <div style={{ display:'flex', flexWrap:'wrap', gap:6 }}>
            {categories.map(c => {
              const on = d.categoryIds.includes(c.id)
              return <button key={c.id} type="button" style={pill(on)}
                onClick={() => set('categoryIds', on ? d.categoryIds.filter(x => x !== c.id) : [...d.categoryIds, c.id])}>{c.label}</button>
            })}
          </div>
        </div>
      )}

      {d.kind === 'create' && (
        <Field label="Notes" style={{ marginTop:10 }}>
          <textarea value={d.description || ''} onChange={e => set('description', e.target.value)} rows={3}
            style={{ ...field, resize:'vertical', lineHeight:1.45 }} />
        </Field>
      )}

      {Array.isArray(d.subtasks) && (d.kind === 'create' || d.kind === 'addSubtasks') && (
        <div style={{ marginTop:10 }}>
          <span style={lbl}>Subtasks</span>
          {d.subtasks.map((s, j) => (
            <div key={j} style={{ display:'flex', gap:6, alignItems:'center', marginBottom:5 }}>
              <input type="checkbox" checked={!!s.done} onChange={e => setSub(j, { done: e.target.checked })} aria-label="Done" />
              <input value={s.text || ''} onChange={e => setSub(j, { text: e.target.value })} style={{ ...field, padding:'6px 9px' }} />
              <button type="button" aria-label="Remove subtask" onClick={() => set('subtasks', d.subtasks.filter((_, k) => k !== j))}
                style={{ border:'none', background:'none', color:'var(--muted)', cursor:'pointer', fontSize:13, padding:4 }}>✕</button>
            </div>
          ))}
          <button type="button" onClick={() => set('subtasks', [...d.subtasks, { text:'', done:false }])}
            style={{ ...pill(false), marginTop:2 }}>+ Subtask</button>
        </div>
      )}
      {d.kind === 'create' && !Array.isArray(d.subtasks) && (
        <button type="button" onClick={() => set('subtasks', [{ text:'', done:false }])} style={{ ...pill(false), marginTop:10 }}>+ Subtask</button>
      )}

      {d.kind === 'create' && (
        <div style={{ marginTop:10 }}>
          <span style={lbl}>Reminders</span>
          <div style={{ display:'flex', flexWrap:'wrap', gap:6, alignItems:'center' }}>
            {d.reminders.map((m, j) => (
              <span key={j} style={{ fontSize:12, background:'#F3F2F6', border:'1px solid var(--border)', borderRadius:8, padding:'3px 4px 3px 8px', display:'inline-flex', alignItems:'center', gap:4 }}>
                {remindLabel(m)}
                <button type="button" aria-label="Remove reminder" onClick={() => set('reminders', d.reminders.filter((_, k) => k !== j))}
                  style={{ border:'none', background:'none', color:'var(--muted)', cursor:'pointer', fontSize:11, padding:'0 3px' }}>✕</button>
              </span>
            ))}
            <select value="" onChange={e => { if (e.target.value !== '') set('reminders', [...d.reminders, Number(e.target.value)]) }}
              style={{ ...field, width:'auto', padding:'4px 8px', fontSize:12 }}>
              <option value="">+ Add reminder</option>
              {REMIND_PRESETS.filter(m => !d.reminders.includes(m)).map(m => <option key={m} value={m}>{remindLabel(m)}</option>)}
            </select>
          </div>
        </div>
      )}

      <div style={{ display:'flex', gap:8, marginTop:12, justifyContent:'flex-end' }}>
        <button type="button" onClick={onCancel}
          style={{ padding:'8px 14px', borderRadius:10, border:'1px solid var(--border)', background:'white', color:'var(--muted)', cursor:'pointer', fontFamily:'DM Sans,sans-serif', fontWeight:600, fontSize:13 }}>Cancel</button>
        <button type="button" onClick={save} disabled={!canSave}
          style={{ padding:'8px 16px', borderRadius:10, border:'none', background: canSave ? 'var(--forest)' : '#E1E1E6', color: canSave ? 'var(--green-light)' : '#9CA3AF', cursor: canSave ? 'pointer' : 'default', fontFamily:'DM Sans,sans-serif', fontWeight:700, fontSize:13 }}>Done</button>
      </div>
    </div>
  )
}

export default function AiAssistant({ categories = [], tasks = [], onApply, onClose }) {
  const [command, setCommand] = useState('')
  const [busy, setBusy]       = useState(false)
  const [err, setErr]         = useState('')
  const [plan, setPlan]       = useState(null)   // { summary, actions }
  const [editingIdx, setEditingIdx] = useState(null) // which planned action is open for editing
  const [photos, setPhotos]   = useState([])     // { id, url, data, mimeType }
  const [loadingPhotos, setLoadingPhotos] = useState(0)
  const fileRef = useRef(null)

  // Don't let an app update reload the page while this sheet is open — it
  // would throw away the request in flight, the photos, and an unapplied plan.
  useEffect(() => holdUpdateReload(), [])

  // Take photos from the picker, the camera, or a paste. Each is downscaled in
  // the browser (a full-res phone photo is far more than the model needs and
  // slow to upload); only the shrunken JPEG ever leaves the device.
  const addPhotos = async (fileList) => {
    const files = Array.from(fileList || []).filter(f => f && f.type && f.type.startsWith('image/'))
    if (!files.length) return
    const room = MAX_ASSISTANT_IMAGES - photos.length
    if (room <= 0) { setErr(`You can add up to ${MAX_ASSISTANT_IMAGES} photos at a time.`); return }
    const take = files.slice(0, room)
    setErr(files.length > room ? `Only the first ${room} photo${room > 1 ? 's' : ''} fit — up to ${MAX_ASSISTANT_IMAGES} at a time.` : '')
    setLoadingPhotos(n => n + take.length)
    for (const file of take) {
      try {
        // Text on a screenshot has to stay legible, so keep more detail than a
        // receipt scan does.
        const url = await compressImage(file, { maxDim: 1400, quality: 0.85 })
        const data = dataUrlToBase64(url)
        if (!data) throw new Error('Could not read that image.')
        setPhotos(prev => prev.length >= MAX_ASSISTANT_IMAGES ? prev
          : [...prev, { id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, url, data, mimeType: 'image/jpeg' }])
      } catch (e) {
        setErr((e && e.message) || 'Could not read that image.')
      } finally {
        setLoadingPhotos(n => Math.max(0, n - 1))
      }
    }
  }

  const removePhoto = (id) => setPhotos(prev => prev.filter(p => p.id !== id))

  // Screenshot → ⌘V straight into the box, no file picker.
  const onPaste = (e) => {
    const files = Array.from(e.clipboardData?.files || [])
    if (files.some(f => f.type && f.type.startsWith('image/'))) { e.preventDefault(); addPhotos(files) }
  }

  const titleOf = (id) => (tasks.find(t => t.id === id) || {}).title
  const labelsOf = (ids) => (Array.isArray(ids) ? ids : [])
    .map(id => (categories.find(c => c.id === id) || {}).label)
    .filter(Boolean)

  const canPlan = !!command.trim() || photos.length > 0

  const plated = async () => {
    if (!canPlan || busy || loadingPhotos) return
    setBusy(true); setErr('')
    try {
      const res = await runAssistant(command.trim(), {
        categories, tasks,
        images: photos.map(p => ({ data: p.data, mimeType: p.mimeType })),
      })
      setPlan(res); setEditingIdx(null)
    } catch (e) {
      setErr((e && e.message) || 'Something went wrong.')
    } finally { setBusy(false) }
  }

  const canApply = !!plan && plan.actions.length > 0 && editingIdx === null
  const apply = () => { if (canApply) { onApply(plan.actions); onClose() } }

  const updateAction = (i, next) => { setPlan(p => ({ ...p, actions: p.actions.map((a, k) => k === i ? next : a) })); setEditingIdx(null) }
  const removeAction = (i) => { setPlan(p => ({ ...p, actions: p.actions.filter((_, k) => k !== i) })); setEditingIdx(null) }

  const card = { background:'white', borderRadius:12, border:'1px solid var(--border)', padding:'12px 14px', marginBottom:8 }

  return (
    <div onClick={busy ? undefined : onClose}
      style={{ position:'fixed', inset:0, background:'rgba(20,28,38,.5)', zIndex:640, display:'flex', alignItems:'flex-end', justifyContent:'center' }}>
      <div onClick={e => e.stopPropagation()}
        style={{ background:'#F3F2F6', borderRadius:'22px 22px 0 0', width:'100%', maxWidth:480, maxHeight:'92vh', overflowY:'auto', boxShadow:'0 -10px 44px rgba(20,40,60,.28)' }}>
        {/* Header */}
        <div style={{ background:'linear-gradient(135deg,#7BBFD4,#C8BFDF)', padding:'16px 18px 20px' }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
            <span style={{ fontSize:11, letterSpacing:1.5, textTransform:'uppercase', color:'rgba(0,0,0,.55)', fontWeight:700 }}>AI assistant</span>
            <button onClick={onClose} aria-label="Close"
              style={{ width:32, height:32, borderRadius:'50%', border:'none', background:'rgba(255,255,255,.4)', color:'#17313f', fontSize:15, cursor:'pointer' }}>✕</button>
          </div>
          <div style={{ fontSize:20, fontWeight:800, color:'#17313f', marginTop:8, fontFamily:'DM Sans,sans-serif' }}>✨ Tell me what to do</div>
          <div style={{ fontSize:12.5, color:'rgba(0,0,0,.62)', marginTop:4, lineHeight:1.5 }}>
            Add a task, paste an event, add a photo of one, or give an instruction about your existing tasks — I’ll show you the plan before anything changes.
          </div>
        </div>

        <div style={{ padding:'16px 14px calc(20px + env(safe-area-inset-bottom))' }}>
          {!plan ? (<>
            <div style={{ position:'relative' }}>
              <textarea value={command} onChange={e => setCommand(e.target.value)} onPaste={onPaste} autoFocus
                placeholder={"e.g. Add the Aug 17 assignments to my Orgo task’s subtasks and check them off. Or: Dentist next Tue 3pm, bring insurance card. Or add a photo below and leave this empty."}
                style={{ width:'100%', fontSize:14, padding:'12px 14px', borderRadius:12, border:'1px solid var(--border)', fontFamily:'DM Sans,sans-serif', outline:'none', lineHeight:1.55, resize:'vertical', minHeight:140, background:'white', color:'var(--text)', boxSizing:'border-box' }} />
              {command && (
                <button type="button" onClick={() => { setCommand(''); setErr('') }} aria-label="Clear"
                  style={{ position:'absolute', top:8, right:8, height:26, padding:'0 10px', borderRadius:13, border:'1px solid var(--border)', background:'rgba(255,255,255,.9)', color:'var(--muted)', fontSize:12, fontWeight:600, cursor:'pointer', fontFamily:'DM Sans,sans-serif' }}>Clear</button>
              )}
            </div>

            {/* Photos of the thing to schedule — a screenshot of an email, a
                flyer, a syllabus page. Read alongside whatever you type. */}
            <input ref={fileRef} type="file" accept="image/*" multiple hidden
              onChange={e => { addPhotos(e.target.files); e.target.value = '' }} />
            <div style={{ display:'flex', alignItems:'center', gap:8, marginTop:10, flexWrap:'wrap' }}>
              <button type="button" onClick={() => fileRef.current?.click()}
                disabled={busy || photos.length >= MAX_ASSISTANT_IMAGES}
                style={{ padding:'9px 14px', borderRadius:12, border:'1px solid var(--border)', fontFamily:'DM Sans,sans-serif', fontWeight:600, fontSize:13,
                  background: (busy || photos.length >= MAX_ASSISTANT_IMAGES) ? '#EDEDF1' : 'white',
                  color: (busy || photos.length >= MAX_ASSISTANT_IMAGES) ? '#9CA3AF' : 'var(--forest)',
                  cursor: (busy || photos.length >= MAX_ASSISTANT_IMAGES) ? 'default' : 'pointer' }}>
                📷 {photos.length ? 'Add another photo' : 'Add a photo'}
              </button>
              <span style={{ fontSize:11.5, color:'var(--muted)' }}>
                {loadingPhotos > 0
                  ? 'Preparing photo…'
                  : photos.length
                    ? `${photos.length} of ${MAX_ASSISTANT_IMAGES} added`
                    : 'Screenshot an email, snap a flyer — or paste one in.'}
              </span>
            </div>

            {photos.length > 0 && (
              <div style={{ display:'flex', gap:8, marginTop:10, flexWrap:'wrap' }}>
                {photos.map(p => (
                  <div key={p.id} style={{ position:'relative' }}>
                    <img src={p.url} alt="Attached" style={{ width:74, height:74, objectFit:'cover', borderRadius:10, border:'1px solid var(--border)', display:'block', background:'white' }} />
                    <button type="button" onClick={() => removePhoto(p.id)} disabled={busy} aria-label="Remove photo"
                      style={{ position:'absolute', top:-6, right:-6, width:22, height:22, borderRadius:'50%', border:'1px solid var(--border)', background:'white', color:'var(--muted)', fontSize:11, lineHeight:1, cursor: busy ? 'default' : 'pointer', boxShadow:'0 1px 4px rgba(20,40,60,.18)' }}>✕</button>
                  </div>
                ))}
              </div>
            )}

            {err && <div style={{ fontSize:12, color:'#B42318', background:'#FEF3F2', border:'1px solid #FECDCA', borderRadius:10, padding:'9px 12px', marginTop:10, lineHeight:1.45 }}>{err}</div>}
            <button onClick={plated} disabled={!canPlan || busy || loadingPhotos > 0}
              style={{ width:'100%', marginTop:12, padding:'14px', borderRadius:14, border:'none',
                background:(!canPlan||busy||loadingPhotos>0)?'#E1E1E6':'var(--forest)', color:(!canPlan||busy||loadingPhotos>0)?'#9CA3AF':'var(--green-light)',
                cursor:(!canPlan||busy||loadingPhotos>0)?'default':'pointer', fontFamily:'DM Sans,sans-serif', fontWeight:700, fontSize:15 }}>
              {busy ? (photos.length ? 'Reading the photo…' : 'Thinking…') : 'Plan it'}
            </button>
            <div style={{ fontSize:10.5, color:'var(--muted)', marginTop:10, textAlign:'center', lineHeight:1.5 }}>
              Uses a free AI model — your text, any photos you add, and a list of your task titles are sent to Google Gemini. Photos are shrunk on your phone first and are never saved to your planner. Nothing changes until you review and tap Apply.
            </div>
          </>) : (<>
            {/* Plan review */}
            <div style={{ fontSize:14, fontWeight:700, color:'var(--text)', marginBottom:4 }}>Here’s the plan</div>
            {plan.summary && <div style={{ fontSize:13, color:'var(--muted)', lineHeight:1.5, marginBottom:12 }}>{plan.summary}</div>}
            {plan.actions.length === 0 ? (
              <div style={{ ...card, color:'var(--muted)', fontSize:13 }}>No changes to make.</div>
            ) : plan.actions.map((a, i) => {
              const chips = []
              if (a.kind === 'event') {
                const span = a.endDate && a.endDate !== a.startDate
                  ? `${prettyDate(a.startDate)} → ${prettyDate(a.endDate)}`
                  : prettyDate(a.startDate)
                if (span) chips.push(span)
                if (a.allDay === false) {
                  if (a.startTime) chips.push(fmt12(a.startTime) + (a.endTime ? '–' + fmt12(a.endTime) : ''))
                } else {
                  chips.push('all day')
                }
              } else {
                if (a.date) chips.push(prettyDate(a.date))
                if (a.time) chips.push(fmt12(a.time))
                if (a.durationMins) chips.push(prettyDur(a.durationMins))
              }
              labelsOf(a.categoryIds).forEach(l => chips.push(l))
              const reminders = Array.isArray(a.reminders) ? a.reminders : []
              if (editingIdx === i) return (
                <div key={i} style={{ ...card, borderColor:'var(--forest)' }}>
                  <ActionEditor action={a} categories={categories}
                    onSave={next => updateAction(i, next)} onCancel={() => setEditingIdx(null)} />
                </div>
              )
              const small = { border:'1px solid var(--border)', background:'white', borderRadius:8, padding:'3px 9px', fontSize:12, fontWeight:600, cursor:'pointer', fontFamily:'DM Sans,sans-serif' }
              return (
              <div key={i} style={card}>
                <div style={{ display:'flex', gap:8, alignItems:'flex-start' }}>
                  <div style={{ flex:1, minWidth:0, fontSize:13.5, fontWeight:600, color:'var(--text)', lineHeight:1.4, overflowWrap:'anywhere' }}>{headline(a, titleOf)}</div>
                  <div style={{ display:'flex', gap:5, flexShrink:0 }}>
                    <button type="button" onClick={() => setEditingIdx(i)} style={{ ...small, color:'var(--forest)' }}>Edit</button>
                    <button type="button" onClick={() => removeAction(i)} aria-label="Remove this change" style={{ ...small, color:'var(--muted)' }}>✕</button>
                  </div>
                </div>
                {chips.length > 0 && (
                  <div style={{ marginTop:7, display:'flex', flexWrap:'wrap', gap:6 }}>
                    {chips.map((c, j) => (
                      <span key={j} style={{ fontSize:11.5, fontWeight:600, color:'var(--forest)', background:'rgba(123,191,212,.16)', border:'1px solid rgba(123,191,212,.35)', borderRadius:8, padding:'2px 8px' }}>{c}</span>
                    ))}
                  </div>
                )}
                {a.description && (
                  <div style={{ marginTop:8, fontSize:12.5, color:'var(--muted)', lineHeight:1.5, whiteSpace:'pre-wrap', overflowWrap:'anywhere' }}>{a.description}</div>
                )}
                {Array.isArray(a.subtasks) && a.subtasks.length > 0 && (
                  <div style={{ marginTop:8, display:'flex', flexDirection:'column', gap:4 }}>
                    {a.subtasks.map((s, j) => (
                      <div key={j} style={{ display:'flex', alignItems:'flex-start', gap:7, fontSize:12.5, color:'var(--muted)' }}>
                        <span style={{ flexShrink:0, marginTop:1 }}>{s.done ? '☑' : '☐'}</span>
                        <span style={{ minWidth:0, overflowWrap:'anywhere' }}>{s.text}</span>
                      </div>
                    ))}
                  </div>
                )}
                {reminders.length > 0 && (
                  <div style={{ marginTop:8, fontSize:11.5, color:'var(--muted)', display:'flex', flexWrap:'wrap', gap:6, alignItems:'center' }}>
                    <span style={{ opacity:.8 }}>🔔</span>
                    {reminders.map((m, j) => (
                      <span key={j} style={{ background:'#F3F2F6', border:'1px solid var(--border)', borderRadius:8, padding:'2px 7px' }}>{remindLabel(m)}</span>
                    ))}
                  </div>
                )}
              </div>
            )})}
            {editingIdx !== null && <div style={{ fontSize:11.5, color:'var(--muted)', marginTop:6 }}>Tap Done on the change you’re editing to apply.</div>}
            <div style={{ display:'flex', gap:8, marginTop:14 }}>
              <button onClick={()=>{ setPlan(null); setEditingIdx(null) }}
                style={{ padding:'13px 16px', borderRadius:12, border:'1px solid var(--border)', background:'white', color:'var(--muted)', cursor:'pointer', fontFamily:'DM Sans,sans-serif', fontWeight:600, fontSize:14 }}>Back</button>
              <button onClick={apply} disabled={!canApply}
                style={{ flex:1, padding:'13px', borderRadius:12, border:'none', background: canApply ? 'var(--forest)' : '#E1E1E6', color: canApply ? 'var(--green-light)' : '#9CA3AF', cursor: canApply ? 'pointer' : 'default', fontFamily:'DM Sans,sans-serif', fontWeight:700, fontSize:15 }}>
                Apply {plan.actions.length ? `${plan.actions.length} change${plan.actions.length > 1 ? 's' : ''}` : ''}
              </button>
            </div>
          </>)}
        </div>
      </div>
    </div>
  )
}
