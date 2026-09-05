// src/components/AiAssistant.jsx
// The AI assistant sheet: type an instruction ("add these to my orgo task and
// check them off", "reschedule the dentist to Friday 3pm", "make a task for…")
// AND/OR add photos of the thing — a screenshot of an email about a seminar, a
// syllabus page, a flyer, a handwritten list. It plans the actions against your
// current tasks, shows the plan for you to confirm, then the parent applies it.
// Nothing changes until you tap Apply.
import { useRef, useState } from 'react'
import { runAssistant, MAX_ASSISTANT_IMAGES } from '../lib/parseEvent.js'
import { compressImage, dataUrlToBase64 } from '../lib/trackers.js'

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

export default function AiAssistant({ categories = [], tasks = [], onApply, onClose }) {
  const [command, setCommand] = useState('')
  const [busy, setBusy]       = useState(false)
  const [err, setErr]         = useState('')
  const [plan, setPlan]       = useState(null)   // { summary, actions }
  const [photos, setPhotos]   = useState([])     // { id, url, data, mimeType }
  const [loadingPhotos, setLoadingPhotos] = useState(0)
  const fileRef = useRef(null)

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
      setPlan(res)
    } catch (e) {
      setErr((e && e.message) || 'Something went wrong.')
    } finally { setBusy(false) }
  }

  const apply = () => { onApply(plan.actions); onClose() }

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
              return (
              <div key={i} style={card}>
                <div style={{ fontSize:13.5, fontWeight:600, color:'var(--text)', lineHeight:1.4, overflowWrap:'anywhere' }}>{headline(a, titleOf)}</div>
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
            <div style={{ display:'flex', gap:8, marginTop:14 }}>
              <button onClick={()=>setPlan(null)}
                style={{ padding:'13px 16px', borderRadius:12, border:'1px solid var(--border)', background:'white', color:'var(--muted)', cursor:'pointer', fontFamily:'DM Sans,sans-serif', fontWeight:600, fontSize:14 }}>Back</button>
              <button onClick={apply} disabled={!plan.actions.length}
                style={{ flex:1, padding:'13px', borderRadius:12, border:'none', background: plan.actions.length ? 'var(--forest)' : '#E1E1E6', color: plan.actions.length ? 'var(--green-light)' : '#9CA3AF', cursor: plan.actions.length ? 'pointer' : 'default', fontFamily:'DM Sans,sans-serif', fontWeight:700, fontSize:15 }}>
                Apply {plan.actions.length ? `${plan.actions.length} change${plan.actions.length > 1 ? 's' : ''}` : ''}
              </button>
            </div>
          </>)}
        </div>
      </div>
    </div>
  )
}
