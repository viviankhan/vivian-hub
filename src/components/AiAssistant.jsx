// src/components/AiAssistant.jsx
// The AI assistant sheet: type an instruction ("add these to my orgo task and
// check them off", "reschedule the dentist to Friday 3pm", "make a task for…")
// AND/OR add photos of the thing — a screenshot of an email about a seminar, a
// syllabus page, a flyer, a handwritten list — or attach a document: a whole
// syllabus or event agenda as a PDF or Word file. It plans the actions against your
// current tasks and suggests changes. Nothing changes until you accept them.
//
// Requests go into a queue (lib/assistantQueue.js) rather than making you
// wait: tap "Plan it" and you're free to close the sheet — or the app. Each
// request is read in the background, and its suggestions wait in the queue to
// be edited, accepted, or deleted whenever you come back to them.
import { useEffect, useRef, useState } from 'react'
import { runAssistant, MAX_ASSISTANT_IMAGES, REPEAT_FREQS, describeRepeat, normalizeRepeat } from '../lib/parseEvent.js'
import { compressImage, dataUrlToBase64 } from '../lib/trackers.js'
import { readDocument, docKind, DOC_ACCEPT, MAX_ASSISTANT_DOCS } from '../lib/docText.js'
import { defaultLeadsLabel } from '../lib/notifications.js'
import { suggestGlyph, iconColorOn } from '../lib/glyphs.jsx'
import { activeAccent } from '../lib/appearance.js'
import { Icon } from './IconPicker.jsx'
import ColorIconPicker from './ColorIconPicker.jsx'
import {
  STATUS, getQueue, subscribe, loadQueue, enqueue, updatePlan, removeItem, clearQueue, retry,
  markAllSeen, itemLabel,
} from '../lib/assistantQueue.js'

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
  if (a.kind === 'repeat')     return `Make “${t}” repeat`
  return 'Change'
}

const FREQ_LABELS = { daily: 'Daily', weekly: 'Weekly', monthly: 'Monthly', yearly: 'Yearly' }
const DAY_PILLS = [['monday','Mo'],['tuesday','Tu'],['wednesday','We'],['thursday','Th'],['friday','Fr'],['saturday','Sa'],['sunday','Su']]

// Once / Daily / Weekly / Monthly / Yearly, with weekdays for weekly and an
// optional end date — the same choices as the add sheet's Repeat row.
function RepeatField({ value, date, allowOnce, onChange }) {
  const r = normalizeRepeat(value, date)
  const pick = (freq) => onChange(freq ? normalizeRepeat({ ...(r || {}), freq, days: r && r.days }, date) : null)
  return (
    <div style={{ marginTop:10 }}>
      <span style={lbl}>Repeat</span>
      <div style={{ display:'flex', flexWrap:'wrap', gap:6 }}>
        {allowOnce && <button type="button" style={pill(!r)} onClick={() => pick(null)}>Once</button>}
        {REPEAT_FREQS.map(f => <button key={f} type="button" style={pill(r && r.freq === f)} onClick={() => pick(f)}>{FREQ_LABELS[f]}</button>)}
      </div>
      {r && r.freq === 'weekly' && (
        <div style={{ display:'flex', flexWrap:'wrap', gap:5, marginTop:8 }}>
          {DAY_PILLS.map(([d, l]) => {
            const on = r.days.includes(d)
            return <button key={d} type="button" style={pill(on)}
              onClick={() => { const days = on ? r.days.filter(x => x !== d) : [...r.days, d]; if (days.length) onChange({ ...r, days }) }}>{l}</button>
          })}
        </div>
      )}
      {r && (
        <div style={{ display:'flex', gap:8, marginTop:8, alignItems:'center' }}>
          <span style={{ fontSize:12.5, color:'var(--muted)' }}>Every</span>
          <input type="number" min="1" max="99" value={r.interval} inputMode="numeric"
            onChange={e => onChange({ ...r, interval: Math.max(1, Math.min(99, parseInt(e.target.value, 10) || 1)) })}
            style={{ ...field, width:60, padding:'5px 8px' }} />
          <span style={{ fontSize:12.5, color:'var(--muted)' }}>{{ daily:'day', weekly:'week', monthly:'month', yearly:'year' }[r.freq]}{r.interval > 1 ? 's' : ''}, until</span>
          <input type="date" value={r.endDate || ''} onChange={e => onChange({ ...r, endDate: e.target.value })}
            style={{ ...field, width:'auto', flex:1, padding:'5px 8px' }} />
        </div>
      )}
      {r && r.freq === 'yearly' && date && (
        <div style={{ fontSize:11.5, color:'var(--muted)', marginTop:6 }}>
          Every year on {new Date(date + 'T12:00:00').toLocaleDateString('en-US', { month:'long', day:'numeric' })}.
        </div>
      )}
    </div>
  )
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
  const [pickIcon, setPickIcon] = useState(false)
  // Until you pick one yourself, the icon follows the title as you retype it.
  const [iconTouched, setIconTouched] = useState(false)
  const row = { display:'flex', gap:8, marginTop:10 }
  const hasTitle = d.kind === 'create' || d.kind === 'event'
  const hasWhen  = d.kind === 'create' || d.kind === 'reschedule'
  const canSave  = !hasTitle || !!(d.title || '').trim()

  const save = () => {
    if (!canSave) return
    const out = { ...d }
    if (hasTitle) out.title = d.title.trim()
    if (d.kind === 'create' && !iconTouched && out.title !== action.title) out.icon = guessIcon({ ...out, icon: '' }) || action.icon || ''
    if (hasWhen) {
      out.date = d.date || null
      out.time = d.time || null
      const mins = parseInt(d.durationMins, 10)
      out.durationMins = mins > 0 ? mins : null
    }
    // Saving the editor is the user choosing the date, so a flagged "needs a
    // date" item is settled once it has one.
    if (d.kind === 'create' && out.date) { delete out.needsDate; delete out.guessedToday }
    if (d.kind === 'event' && d.startDate) {
      delete out.needsDate; delete out.guessedToday
      if (!d.endDate) out.endDate = d.startDate
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

  const tint = d.color || (categories.find(c => c.id === d.categoryIds[0]) || {}).color || activeAccent()
  const liveIcon = (!iconTouched && d.kind === 'create' && d.title !== action.title) ? (guessIcon({ ...d, icon: '' }) || d.icon) : d.icon

  return (
    <div>
      {hasTitle && (
        <div style={{ display:'flex', gap:10, alignItems:'flex-start' }}>
          {d.kind === 'create' && (
            <div style={{ flexShrink:0 }}>
              <span style={lbl}>Icon</span>
              <button type="button" onClick={() => setPickIcon(true)} aria-label="Change icon and color" data-testid="assistant-icon-btn"
                style={{ position:'relative', width:50, height:50, borderRadius:14, border:'none', background:tint, color:iconColorOn(tint), cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', padding:0 }}>
                {liveIcon ? <Icon value={liveIcon} size={24} color={iconColorOn(tint)} />
                  : <span style={{ fontSize:20, fontWeight:700 }}>{((d.title || '').trim()[0] || '?').toUpperCase()}</span>}
                <span aria-hidden="true" style={{ position:'absolute', bottom:-5, right:-5, width:20, height:20, borderRadius:'50%', background:'white', boxShadow:'0 1px 4px rgba(0,0,0,.25)', fontSize:10, display:'flex', alignItems:'center', justifyContent:'center' }}>✎</span>
              </button>
            </div>
          )}
          <Field label="Title" style={{ flex:1 }}>
            <textarea value={d.title || ''} onChange={e => set('title', e.target.value)} rows={2} autoFocus
              style={{ ...field, resize:'vertical', lineHeight:1.45 }} />
          </Field>
        </div>
      )}
      {pickIcon && (
        <ColorIconPicker color={d.color || ''} icon={liveIcon || ''}
          onColor={c => set('color', c)}
          onIcon={v => { set('icon', v); setIconTouched(true) }}
          onClose={() => setPickIcon(false)} />
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

      {(d.kind === 'create' || d.kind === 'repeat') && (
        <RepeatField value={d.repeat} date={d.date} allowOnce={d.kind === 'create'} onChange={r => set('repeat', r)} />
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

// ── Icons for what the AI suggests ─────────────────────────────
// The AI names a pictogram in a word or two ("tooth"); that, else the title,
// else the notes, is matched against the icon set — so a new task arrives with
// a real icon rather than just its first letter. You can change it in Edit.
export function guessIcon(a) {
  if (!a) return null
  if (typeof a.icon === 'string' && (a.icon.startsWith('glyph:') || a.icon.startsWith('data:'))) return a.icon
  return suggestGlyph(a.icon) || suggestGlyph(a.title) || suggestGlyph(String(a.description || '').slice(0, 300)) || null
}
export function decoratePlan(plan) {
  if (!plan) return plan
  const actions = (plan.actions || []).map(a => (a && a.kind === 'create') ? { ...a, icon: guessIcon(a) || '' } : a)
  return { ...plan, actions }
}

// ── The queue, for React ───────────────────────────────────────
export function useAssistantQueue() {
  const [items, setItems] = useState(getQueue)
  useEffect(() => {
    const off = subscribe(setItems)
    loadQueue().then(() => setItems(getQueue()))
    return off
  }, [])
  return items
}

// What actually reads a queued request. Photos are kept as data URLs; the
// base64 the AI needs is cut from them right before sending.
export function runQueued(item, { categories = [], tasks = [] } = {}) {
  return runAssistant(item.command.trim(), {
    categories, tasks, today: item.today,
    images: (item.photos || []).map(p => ({ data: dataUrlToBase64(p.url), mimeType: p.mimeType || 'image/jpeg' })).filter(p => p.data),
    documents: (item.docs || []).map(d => d.data ? { name: d.name, mimeType: d.mimeType, data: d.data } : { name: d.name, text: d.text }),
  })
}

function agoLabel(ms) {
  const mins = Math.round((Date.now() - ms) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins} min ago`
  const h = Math.round(mins / 60)
  if (h < 24) return `${h} h ago`
  return new Date(ms).toLocaleDateString('en-US', { month:'short', day:'numeric' })
}

const card = { background:'white', borderRadius:12, border:'1px solid var(--border)', padding:'12px 14px', marginBottom:8 }
const small = { border:'1px solid var(--border)', background:'white', borderRadius:8, padding:'3px 9px', fontSize:12, fontWeight:600, cursor:'pointer', fontFamily:'DM Sans,sans-serif' }

// One suggested change, read-only, with Edit and ✕.
function ActionCard({ a, categories, titleOf, onEdit, onRemove }) {
  const labelsOf = (ids) => (Array.isArray(ids) ? ids : []).map(id => (categories.find(c => c.id === id) || {}).label).filter(Boolean)
  const chips = []
  if (a.kind === 'event') {
    const span = a.endDate && a.endDate !== a.startDate ? `${prettyDate(a.startDate)} → ${prettyDate(a.endDate)}` : prettyDate(a.startDate)
    if (span) chips.push(span)
    if (a.allDay === false) { if (a.startTime) chips.push(fmt12(a.startTime) + (a.endTime ? '–' + fmt12(a.endTime) : '')) }
    else chips.push('all day')
  } else {
    if (a.date) chips.push(prettyDate(a.date))
    if (a.time) chips.push(fmt12(a.time))
    if (a.durationMins) chips.push(prettyDur(a.durationMins))
  }
  if (a.repeat) chips.push(describeRepeat(normalizeRepeat(a.repeat, a.date)))
  labelsOf(a.categoryIds).forEach(l => chips.push(l))
  const flag = a.needsDate ? (a.guessedToday ? 'Check the date — no date found, so it defaulted to today' : 'Needs a date — pick the day it falls on') : ''
  const reminders = Array.isArray(a.reminders) ? a.reminders : []
  const tint = a.color || (categories.find(c => c.id === (a.categoryIds || [])[0]) || {}).color || activeAccent()
  const icon = a.kind === 'create' ? (a.icon || (categories.find(c => c.id === (a.categoryIds || [])[0]) || {}).icon || '') : ''
  return (
    <div style={card}>
      <div style={{ display:'flex', gap:9, alignItems:'flex-start' }}>
        {a.kind === 'create' && (
          <button type="button" onClick={onEdit} aria-label="Change icon" title="Change icon"
            style={{ width:30, height:30, borderRadius:9, background:tint, border:'none', padding:0, flexShrink:0, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', color:iconColorOn(tint) }}>
            {icon ? <Icon value={icon} size={17} color={iconColorOn(tint)} /> : <span style={{ fontWeight:700, fontSize:14 }}>{((a.title || '').trim()[0] || '?').toUpperCase()}</span>}
          </button>
        )}
        <div style={{ flex:1, minWidth:0, fontSize:13.5, fontWeight:600, color:'var(--text)', lineHeight:1.4, overflowWrap:'anywhere', paddingTop: a.kind === 'create' ? 5 : 0 }}>{headline(a, titleOf)}</div>
        <div style={{ display:'flex', gap:5, flexShrink:0 }}>
          <button type="button" onClick={onEdit} style={{ ...small, color:'var(--forest)' }}>Edit</button>
          <button type="button" onClick={onRemove} aria-label="Remove this change" style={{ ...small, color:'var(--muted)' }}>✕</button>
        </div>
      </div>
      {flag && (
        <button type="button" onClick={onEdit}
          style={{ marginTop:7, display:'block', textAlign:'left', fontSize:11.5, fontWeight:700, color:'#B4341F', background:'#FBEBE7', border:'1px solid #F3C6BC', borderRadius:8, padding:'4px 9px', cursor:'pointer', fontFamily:'DM Sans,sans-serif' }}>
          ⚠ {flag} · tap to set it
        </button>
      )}
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
      {reminders.length === 0 && a.kind === 'create' && (
        <div style={{ marginTop:8, fontSize:11.5, color:'var(--muted)', display:'flex', gap:6, alignItems:'center' }}>
          <span style={{ opacity:.8 }}>🔔</span><span>Your default reminders: {defaultLeadsLabel()}</span>
        </div>
      )}
      {reminders.length > 0 && (
        <div style={{ marginTop:8, fontSize:11.5, color:'var(--muted)', display:'flex', flexWrap:'wrap', gap:6, alignItems:'center' }}>
          <span style={{ opacity:.8 }}>🔔</span>
          {reminders.map((m, j) => <span key={j} style={{ background:'#F3F2F6', border:'1px solid var(--border)', borderRadius:8, padding:'2px 7px' }}>{remindLabel(m)}</span>)}
        </div>
      )}
    </div>
  )
}

// One request in the queue: what you sent, where it's at, and — once read —
// its suggestions, each editable, with Accept and Delete for the lot.
function QueueItem({ item, categories, titleOf, onAccept }) {
  const [editingIdx, setEditingIdx] = useState(null)
  const [open, setOpen] = useState(true)
  const plan = item.plan || { summary: '', actions: [] }
  const actions = plan.actions || []
  const undated = actions.filter(a => a && a.needsDate).length
  const ready = item.status === STATUS.READY
  const working = item.status === STATUS.PENDING || item.status === STATUS.RUNNING
  const canAccept = ready && actions.length > 0 && editingIdx === null && undated === 0

  const setActions = (next) => updatePlan(item.id, { ...plan, actions: next })
  const statusPill = working
    ? { text: item.status === STATUS.RUNNING ? 'Reading…' : 'Waiting…', bg:'#EEF4FA', fg:'#2D5B78' }
    : item.status === STATUS.ERROR ? { text:'Couldn’t read', bg:'#FEF3F2', fg:'#B42318' }
    : { text: `${actions.length} suggestion${actions.length === 1 ? '' : 's'}`, bg:'rgba(62,156,134,.14)', fg:'var(--forest)' }

  return (
    <div data-testid="assistant-queue-item" data-status={item.status}
      style={{ background:'#FBFAFD', border:'1px solid var(--border)', borderRadius:16, padding:12, marginBottom:12 }}>
      <div style={{ display:'flex', gap:10, alignItems:'center', cursor: ready ? 'pointer' : 'default' }} onClick={() => ready && setOpen(o => !o)}>
        {item.photos && item.photos[0]
          ? <img src={item.photos[0].url} alt="" style={{ width:42, height:42, objectFit:'cover', borderRadius:9, border:'1px solid var(--border)', flexShrink:0, background:'white' }} />
          : <span aria-hidden="true" style={{ width:42, height:42, borderRadius:9, background:'linear-gradient(135deg,#7BBFD4,#C8BFDF)', flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center', fontSize:18 }}>{(item.docs || []).length ? '📄' : '✨'}</span>}
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ fontSize:13, fontWeight:700, color:'var(--text)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{itemLabel(item)}</div>
          <div style={{ fontSize:11.5, color:'var(--muted)', marginTop:2 }}>
            {agoLabel(item.createdAt)}{(item.photos || []).length > 1 ? ` · ${item.photos.length} photos` : ''}
          </div>
        </div>
        <span style={{ fontSize:11, fontWeight:700, borderRadius:10, padding:'3px 9px', background:statusPill.bg, color:statusPill.fg, flexShrink:0, display:'inline-flex', alignItems:'center', gap:5 }}>
          {working && <span className="aq-spin" aria-hidden="true" />}{statusPill.text}
        </span>
      </div>

      {working && (
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginTop:10, gap:8 }}>
          <span style={{ fontSize:11.5, color:'var(--muted)', lineHeight:1.45 }}>You can close this — I’ll let you know when the suggestions are ready.</span>
          <button type="button" onClick={() => removeItem(item.id)} style={{ ...small, color:'#B42318', flexShrink:0 }}>Delete</button>
        </div>
      )}

      {item.status === STATUS.ERROR && (<>
        <div style={{ fontSize:12, color:'#B42318', background:'#FEF3F2', border:'1px solid #FECDCA', borderRadius:10, padding:'8px 11px', marginTop:10, lineHeight:1.45 }}>{item.error}</div>
        <div style={{ display:'flex', gap:6, justifyContent:'flex-end', marginTop:8 }}>
          <button type="button" onClick={() => removeItem(item.id)} style={{ ...small, color:'#B42318' }}>Delete</button>
          <button type="button" onClick={() => retry(item.id)} style={{ ...small, color:'var(--forest)' }}>Try again</button>
        </div>
      </>)}

      {ready && open && (<div style={{ marginTop:10 }}>
        {plan.summary && <div style={{ fontSize:12.5, color:'var(--muted)', lineHeight:1.5, marginBottom:8 }}>{plan.summary}</div>}
        {actions.length === 0
          ? <div style={{ ...card, color:'var(--muted)', fontSize:13 }}>No changes to make.</div>
          : actions.map((a, i) => editingIdx === i ? (
              <div key={i} style={{ ...card, borderColor:'var(--forest)' }}>
                <ActionEditor action={a} categories={categories}
                  onSave={next => { setActions(actions.map((x, k) => k === i ? next : x)); setEditingIdx(null) }}
                  onCancel={() => setEditingIdx(null)} />
              </div>
            ) : (
              <ActionCard key={i} a={a} categories={categories} titleOf={titleOf}
                onEdit={() => setEditingIdx(i)}
                onRemove={() => { setActions(actions.filter((_, k) => k !== i)); setEditingIdx(null) }} />
            ))}
        {editingIdx !== null && <div style={{ fontSize:11.5, color:'var(--muted)', marginTop:4 }}>Tap Done on the change you’re editing to accept.</div>}
        {editingIdx === null && undated > 0 && (
          <div style={{ fontSize:11.5, color:'#B4341F', marginTop:4, lineHeight:1.45 }}>
            Set a date for the {undated === 1 ? 'item' : `${undated} items`} marked ⚠ (or remove {undated === 1 ? 'it' : 'them'}) to accept — so nothing lands on the wrong day.
          </div>
        )}
        <div style={{ display:'flex', gap:8, marginTop:10 }}>
          <button type="button" onClick={() => removeItem(item.id)}
            style={{ padding:'11px 14px', borderRadius:12, border:'1px solid var(--border)', background:'white', color:'#B42318', cursor:'pointer', fontFamily:'DM Sans,sans-serif', fontWeight:600, fontSize:13.5 }}>Delete</button>
          <button type="button" onClick={() => { if (canAccept) onAccept(item) }} disabled={!canAccept}
            style={{ flex:1, padding:'11px', borderRadius:12, border:'none', background: canAccept ? 'var(--forest)' : '#E1E1E6', color: canAccept ? 'var(--green-light)' : '#9CA3AF', cursor: canAccept ? 'pointer' : 'default', fontFamily:'DM Sans,sans-serif', fontWeight:700, fontSize:14 }}>
            {actions.length ? `Accept ${actions.length} change${actions.length > 1 ? 's' : ''}` : 'Accept'}
          </button>
        </div>
      </div>)}
    </div>
  )
}

export default function AiAssistant({ categories = [], tasks = [], onApply, onClose, onView, initialView = 'new' }) {
  const items = useAssistantQueue()
  const [view, setView]       = useState(initialView === 'queue' ? 'queue' : 'new')
  const [command, setCommand] = useState('')
  const [err, setErr]         = useState('')
  const [justQueued, setJustQueued] = useState(false)
  const [confirmClear, setConfirmClear] = useState(false)
  const [photos, setPhotos]   = useState([])     // { id, url, data, mimeType }
  const [loadingPhotos, setLoadingPhotos] = useState(0)
  const [docs, setDocs]       = useState([])     // { id, name, kind, data?, mimeType?, text?, truncated? }
  const [loadingDocs, setLoadingDocs] = useState(0)
  const fileRef = useRef(null)
  const docRef = useRef(null)

  // Looking at the queue is reading it: the ✨ badge settles.
  const unseen = items.filter(it => it.status === STATUS.READY && !it.seen).length
  useEffect(() => { if (view === 'queue' && unseen) markAllSeen() }, [view, unseen])
  useEffect(() => { onView?.(view) }, [view])

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
        // receipt scan does. maxDim caps the LONG side, and a phone screenshot
        // is over twice as tall as it is wide — at 1400 its text shrank to
        // ~650px across, too small to read reliably.
        const url = await compressImage(file, { maxDim: 2000, quality: 0.85 })
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

  // A syllabus or agenda as a file. A PDF is sent whole (the model reads it,
  // tables and scans included); a Word file is turned into text right here.
  // The file itself never leaves the device any other way, and isn't saved to
  // your planner — only to this device's queue until you clear it.
  const addDocs = async (fileList) => {
    const files = Array.from(fileList || []).filter(Boolean)
    if (!files.length) return
    const room = MAX_ASSISTANT_DOCS - docs.length
    if (room <= 0) { setErr(`You can add up to ${MAX_ASSISTANT_DOCS} documents at a time.`); return }
    const take = files.slice(0, room)
    setErr(files.length > room ? `Only the first ${room} document${room > 1 ? 's' : ''} fit — up to ${MAX_ASSISTANT_DOCS} at a time.` : '')
    setLoadingDocs(n => n + take.length)
    for (const file of take) {
      try {
        const d = await readDocument(file)
        setDocs(prev => prev.length >= MAX_ASSISTANT_DOCS ? prev
          : [...prev, { ...d, id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}` }])
        if (d.truncated) setErr(`“${d.name}” is very long, so only its first part will be read.`)
      } catch (e) {
        setErr((e && e.message) || 'Could not read that file.')
      } finally {
        setLoadingDocs(n => Math.max(0, n - 1))
      }
    }
  }
  const removeDoc = (id) => setDocs(prev => prev.filter(d => d.id !== id))

  // Picked or pasted files go where they belong: pictures to photos, anything
  // else to documents (which says so if it can't read one).
  const addFiles = (fileList) => {
    const files = Array.from(fileList || []).filter(Boolean)
    const imgs = files.filter(f => f.type && f.type.startsWith('image/'))
    const rest = files.filter(f => !(f.type && f.type.startsWith('image/')))
    if (imgs.length) addPhotos(imgs)
    if (rest.length) addDocs(rest)
  }

  // Screenshot → ⌘V straight into the box, no file picker. A copied PDF or
  // Word file pastes in the same way.
  const onPaste = (e) => {
    const files = Array.from(e.clipboardData?.files || [])
    if (files.some(f => (f.type && f.type.startsWith('image/')) || docKind(f))) { e.preventDefault(); addFiles(files) }
  }

  const titleOf = (id) => (tasks.find(t => t.id === id) || {}).title

  const canPlan = !!command.trim() || photos.length > 0 || docs.length > 0
  const preparing = loadingPhotos + loadingDocs

  // File the request and clear the box for the next one. The queue does the
  // waiting, so you don't have to.
  const plated = () => {
    if (!canPlan || preparing) return
    enqueue({ command: command.trim(), photos, docs })
    setCommand(''); setPhotos([]); setDocs([]); setErr('')
    setJustQueued(true)
    setView('queue')
  }

  const accept = (item) => {
    onApply((item.plan && item.plan.actions) || [])
    removeItem(item.id)
    if (getQueue().length === 0) onClose()
  }

  const working = items.filter(it => it.status === STATUS.PENDING || it.status === STATUS.RUNNING).length
  const tab = (on) => ({ flex:1, padding:'8px 10px', borderRadius:10, border:'none', cursor:'pointer', fontFamily:'DM Sans,sans-serif', fontWeight:700, fontSize:13,
    background: on ? 'white' : 'transparent', color: on ? 'var(--text)' : 'var(--muted)', boxShadow: on ? '0 1px 4px rgba(20,40,60,.12)' : 'none' })

  return (
    <div onClick={onClose}
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
            Add a task, paste an event, add a photo of one, attach a syllabus or agenda (PDF or Word), or give an instruction about your existing tasks. It goes into your queue — close this anytime, and review the suggestions when they’re ready.
          </div>
          <div style={{ display:'flex', gap:4, marginTop:12, background:'rgba(255,255,255,.35)', borderRadius:12, padding:3 }}>
            <button type="button" style={tab(view === 'new')} onClick={() => setView('new')}>New request</button>
            <button type="button" style={tab(view === 'queue')} onClick={() => { setView('queue'); setJustQueued(false) }} data-testid="assistant-queue-tab">
              Queue{items.length ? ` (${items.length})` : ''}{unseen && view !== 'queue' ? ' •' : ''}
            </button>
          </div>
        </div>

        <div style={{ padding:'16px 14px calc(20px + env(safe-area-inset-bottom))' }}>
          {view === 'new' ? (<>
            <div style={{ position:'relative' }}>
              <textarea value={command} onChange={e => setCommand(e.target.value)} onPaste={onPaste} autoFocus
                placeholder={"e.g. Add the Aug 17 assignments to my Orgo task’s subtasks and check them off. Or: Dentist next Tue 3pm, bring insurance card. Or attach a syllabus below and say “just the exams and due dates”."}
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
            <input ref={docRef} type="file" accept={DOC_ACCEPT} multiple hidden data-testid="assistant-doc-input"
              onChange={e => { addDocs(e.target.files); e.target.value = '' }} />
            <div style={{ display:'flex', alignItems:'center', gap:8, marginTop:10, flexWrap:'wrap' }}>
              <button type="button" onClick={() => fileRef.current?.click()}
                disabled={photos.length >= MAX_ASSISTANT_IMAGES}
                style={{ padding:'9px 14px', borderRadius:12, border:'1px solid var(--border)', fontFamily:'DM Sans,sans-serif', fontWeight:600, fontSize:13,
                  background: photos.length >= MAX_ASSISTANT_IMAGES ? '#EDEDF1' : 'white',
                  color: photos.length >= MAX_ASSISTANT_IMAGES ? '#9CA3AF' : 'var(--forest)',
                  cursor: photos.length >= MAX_ASSISTANT_IMAGES ? 'default' : 'pointer' }}>
                📷 {photos.length ? 'Add another photo' : 'Add a photo'}
              </button>
              <button type="button" onClick={() => docRef.current?.click()}
                disabled={docs.length >= MAX_ASSISTANT_DOCS}
                style={{ padding:'9px 14px', borderRadius:12, border:'1px solid var(--border)', fontFamily:'DM Sans,sans-serif', fontWeight:600, fontSize:13,
                  background: docs.length >= MAX_ASSISTANT_DOCS ? '#EDEDF1' : 'white',
                  color: docs.length >= MAX_ASSISTANT_DOCS ? '#9CA3AF' : 'var(--forest)',
                  cursor: docs.length >= MAX_ASSISTANT_DOCS ? 'default' : 'pointer' }}>
                📄 {docs.length ? 'Add another file' : 'Add a PDF or Word file'}
              </button>
              <span style={{ fontSize:11.5, color:'var(--muted)' }}>
                {loadingDocs > 0
                  ? 'Reading the file…'
                  : loadingPhotos > 0
                  ? 'Preparing photo…'
                  : (photos.length || docs.length)
                    ? [photos.length ? `${photos.length} photo${photos.length > 1 ? 's' : ''}` : '', docs.length ? `${docs.length} file${docs.length > 1 ? 's' : ''}` : ''].filter(Boolean).join(' · ') + ' added'
                    : 'Screenshot an email, snap a flyer, or attach a syllabus or agenda.'}
              </span>
            </div>

            {photos.length > 0 && (
              <div style={{ display:'flex', gap:8, marginTop:10, flexWrap:'wrap' }}>
                {photos.map(p => (
                  <div key={p.id} style={{ position:'relative' }}>
                    <img src={p.url} alt="Attached" style={{ width:74, height:74, objectFit:'cover', borderRadius:10, border:'1px solid var(--border)', display:'block', background:'white' }} />
                    <button type="button" onClick={() => removePhoto(p.id)} aria-label="Remove photo"
                      style={{ position:'absolute', top:-6, right:-6, width:22, height:22, borderRadius:'50%', border:'1px solid var(--border)', background:'white', color:'var(--muted)', fontSize:11, lineHeight:1, cursor:'pointer', boxShadow:'0 1px 4px rgba(20,40,60,.18)' }}>✕</button>
                  </div>
                ))}
              </div>
            )}

            {docs.length > 0 && (
              <div style={{ display:'flex', flexDirection:'column', gap:6, marginTop:10 }}>
                {docs.map(d => (
                  <div key={d.id} style={{ display:'flex', alignItems:'center', gap:10, background:'white', border:'1px solid var(--border)', borderRadius:10, padding:'8px 10px' }}>
                    <span aria-hidden="true" style={{ width:30, height:30, borderRadius:8, flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center', fontSize:9.5, fontWeight:800, letterSpacing:.4, color:'white',
                      background: d.kind === 'pdf' ? '#C2410C' : d.kind === 'docx' ? '#2B579A' : '#64748B' }}>
                      {d.kind === 'pdf' ? 'PDF' : d.kind === 'docx' ? 'DOC' : 'TXT'}
                    </span>
                    <span style={{ flex:1, minWidth:0, fontSize:13, color:'var(--text)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{d.name}</span>
                    <button type="button" onClick={() => removeDoc(d.id)} aria-label={`Remove ${d.name}`}
                      style={{ width:24, height:24, flexShrink:0, borderRadius:'50%', border:'1px solid var(--border)', background:'white', color:'var(--muted)', fontSize:11, lineHeight:1, cursor:'pointer' }}>✕</button>
                  </div>
                ))}
              </div>
            )}

            {err && <div style={{ fontSize:12, color:'#B42318', background:'#FEF3F2', border:'1px solid #FECDCA', borderRadius:10, padding:'9px 12px', marginTop:10, lineHeight:1.45 }}>{err}</div>}
            <button onClick={plated} disabled={!canPlan || preparing > 0}
              style={{ width:'100%', marginTop:12, padding:'14px', borderRadius:14, border:'none',
                background:(!canPlan||preparing>0)?'#E1E1E6':'var(--forest)', color:(!canPlan||preparing>0)?'#9CA3AF':'var(--green-light)',
                cursor:(!canPlan||preparing>0)?'default':'pointer', fontFamily:'DM Sans,sans-serif', fontWeight:700, fontSize:15 }}>
              Plan it
            </button>
            <div style={{ fontSize:10.5, color:'var(--muted)', marginTop:10, textAlign:'center', lineHeight:1.5 }}>
              Uses a free AI model — your text, any photos or files you add, and a list of your task titles are sent to Google Gemini. Photos are shrunk on your phone first; a Word file is turned into text first. They wait in this device’s queue until you accept, delete, or clear them — never in your planner. Nothing changes until you tap Accept.
            </div>
          </>) : (<>
            {justQueued && working > 0 && (
              <div style={{ fontSize:12.5, color:'#2D5B78', background:'#EEF4FA', border:'1px solid #CFE0EE', borderRadius:12, padding:'10px 12px', marginBottom:12, lineHeight:1.5 }}>
                Added to your queue. Feel free to close this or leave the app — I’ll keep reading, and let you know when the suggestions are ready.
              </div>
            )}
            {items.length === 0 ? (
              <div style={{ textAlign:'center', color:'var(--muted)', fontSize:13, padding:'26px 10px', lineHeight:1.6 }}>
                Your queue is empty.<br />
                <button type="button" onClick={() => setView('new')} style={{ ...small, marginTop:10, color:'var(--forest)', padding:'7px 14px', fontSize:13 }}>＋ New request</button>
              </div>
            ) : (<>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10 }}>
                <span style={{ fontSize:12, color:'var(--muted)' }}>
                  {[working ? `${working} reading` : '', items.length - working ? `${items.length - working} to review` : ''].filter(Boolean).join(' · ')}
                </span>
                {confirmClear ? (
                  <span style={{ display:'inline-flex', gap:6 }}>
                    <button type="button" onClick={() => setConfirmClear(false)} style={{ ...small, color:'var(--muted)' }}>Keep</button>
                    <button type="button" onClick={() => { clearQueue(); setConfirmClear(false) }} style={{ ...small, color:'white', background:'#B42318', borderColor:'#B42318' }} data-testid="assistant-clear-confirm">Clear all {items.length}</button>
                  </span>
                ) : (
                  <button type="button" onClick={() => setConfirmClear(true)} style={{ ...small, color:'#B42318' }} data-testid="assistant-clear">Clear queue</button>
                )}
              </div>
              {[...items].reverse().map(it => (
                <QueueItem key={it.id} item={it} categories={categories} titleOf={titleOf} onAccept={accept} />
              ))}
            </>)}
          </>)}
        </div>
      </div>
    </div>
  )
}
