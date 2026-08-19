// src/components/AiAssistant.jsx
// The AI assistant sheet: type an instruction ("add these to my orgo task and
// check them off", "reschedule the dentist to Friday 3pm", "make a task for…"),
// it plans the actions against your current tasks, shows the plan for you to
// confirm, then the parent applies it. Nothing changes until you tap Apply.
import { useState } from 'react'
import { runAssistant } from '../lib/parseEvent.js'

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

  const titleOf = (id) => (tasks.find(t => t.id === id) || {}).title
  const labelsOf = (ids) => (Array.isArray(ids) ? ids : [])
    .map(id => (categories.find(c => c.id === id) || {}).label)
    .filter(Boolean)

  const plated = async () => {
    const c = command.trim()
    if (!c || busy) return
    setBusy(true); setErr('')
    try {
      const res = await runAssistant(c, { categories, tasks })
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
            Add a task, paste an event, or give an instruction about your existing tasks — I’ll show you the plan before anything changes.
          </div>
        </div>

        <div style={{ padding:'16px 14px calc(20px + env(safe-area-inset-bottom))' }}>
          {!plan ? (<>
            <textarea value={command} onChange={e => setCommand(e.target.value)} autoFocus
              placeholder={"e.g. Add the Aug 17 assignments to my Orgo task’s subtasks and check them off. Or: Dentist next Tue 3pm, bring insurance card."}
              style={{ width:'100%', fontSize:14, padding:'12px 14px', borderRadius:12, border:'1px solid var(--border)', fontFamily:'DM Sans,sans-serif', outline:'none', lineHeight:1.55, resize:'vertical', minHeight:140, background:'white', color:'var(--text)', boxSizing:'border-box' }} />
            {err && <div style={{ fontSize:12, color:'#B42318', background:'#FEF3F2', border:'1px solid #FECDCA', borderRadius:10, padding:'9px 12px', marginTop:10, lineHeight:1.45 }}>{err}</div>}
            <button onClick={plated} disabled={!command.trim() || busy}
              style={{ width:'100%', marginTop:12, padding:'14px', borderRadius:14, border:'none',
                background:(!command.trim()||busy)?'#E1E1E6':'var(--forest)', color:(!command.trim()||busy)?'#9CA3AF':'var(--green-light)',
                cursor:(!command.trim()||busy)?'default':'pointer', fontFamily:'DM Sans,sans-serif', fontWeight:700, fontSize:15 }}>
              {busy ? 'Thinking…' : 'Plan it'}
            </button>
            <div style={{ fontSize:10.5, color:'var(--muted)', marginTop:10, textAlign:'center', lineHeight:1.5 }}>
              Uses a free AI model — your text and a list of your task titles are sent to Google Gemini. Nothing changes until you review and tap Apply.
            </div>
          </>) : (<>
            {/* Plan review */}
            <div style={{ fontSize:14, fontWeight:700, color:'var(--text)', marginBottom:4 }}>Here’s the plan</div>
            {plan.summary && <div style={{ fontSize:13, color:'var(--muted)', lineHeight:1.5, marginBottom:12 }}>{plan.summary}</div>}
            {plan.actions.length === 0 ? (
              <div style={{ ...card, color:'var(--muted)', fontSize:13 }}>No changes to make.</div>
            ) : plan.actions.map((a, i) => {
              const chips = []
              if (a.date) chips.push(prettyDate(a.date))
              if (a.time) chips.push(fmt12(a.time))
              if (a.durationMins) chips.push(prettyDur(a.durationMins))
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
