// src/components/TaskMenu.jsx
// The "Task Menu" — a library of reusable, date-less task presets. You build up
// tasks here with a duration, description, tags, color/icon and subtasks but no
// date or time. When you later create a task (from Today, the Calendar, or your
// Commitments), you can pick one of these off the menu and everything preset
// auto-fills, so all that's left is to choose a start time.
import { useState, useEffect, useRef } from 'react'
import { Icon } from './IconPicker.jsx'
import ColorIconPicker from './ColorIconPicker.jsx'
import { suggestGlyph, iconColorOn } from '../lib/glyphs.jsx'
import { activeAccent } from '../lib/appearance.js'
import { getDurationPresets, setDurationPresets, resetDurationPresets, parseDuration, durationLabel } from '../lib/durations.js'

const DEFAULT_CATEGORIES = [{ id:'other', label:'Other', color:'#8899AA' }]

// A one-line-looking field that wraps long text and grows to fit, so a long
// subtask no longer runs off the edge of its row.
function GrowField({ value, onChange, placeholder, style, onKeyDown }) {
  const ref = useRef(null)
  const fit = (el) => { if (el) { el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px' } }
  useEffect(() => { fit(ref.current) }, [value])
  return (
    // minHeight:0 overrides the global `textarea { min-height:160px }` rule that
    // would otherwise force each subtask field into a giant box.
    <textarea ref={ref} rows={1} value={value} placeholder={placeholder} onKeyDown={onKeyDown}
      onChange={e => { onChange(e); fit(e.target) }}
      style={{ ...style, boxSizing:'border-box', resize:'none', overflow:'hidden', lineHeight:1.4, minHeight:0, height:'auto' }} />
  )
}

const inp = { width:'100%', fontSize:14, padding:'10px 12px', borderRadius:10, border:'1px solid var(--border)', fontFamily:'DM Sans,sans-serif', outline:'none', boxSizing:'border-box' }
const ROW_ACCENT = '#3E9C86'

function prettyDur(mins) {
  if (!mins) return ''
  if (mins < 60) return `${mins} min`
  return mins % 60 === 0 ? `${mins/60} h` : `${(mins/60).toFixed(1)} h`
}
function hexToBg(hex) {
  if (!hex || hex[0] !== '#' || hex.length < 7) return '#EEF1F4'
  const r=parseInt(hex.slice(1,3),16), g=parseInt(hex.slice(3,5),16), b=parseInt(hex.slice(5,7),16)
  const lr=Math.round(r+(.85*(255-r))), lg=Math.round(g+(.85*(255-g))), lb=Math.round(b+(.85*(255-b)))
  return `rgb(${lr},${lg},${lb})`
}

// ── Template editor sheet ──────────────────────────────────────
// A trimmed-down cousin of the Add sheet: everything that can be preset on a
// task WITHOUT a date or time. No scheduling, repeat, reminders or location —
// those belong to the moment you actually place the task on a day.
function TemplateEditor({ existing = null, categories = [], onSave, onClose }) {
  const cats = (categories && categories.length) ? categories : DEFAULT_CATEGORIES
  const isEdit = !!existing

  const [text, setText] = useState(existing?.text ?? '')
  const [selectedCats, setSelectedCats] = useState(() =>
    (Array.isArray(existing?.cats) && existing.cats.length) ? existing.cats : (existing?.cat ? [existing.cat] : []))
  const [description, setDescription] = useState(existing?.description ?? '')
  const [subtasks, setSubtasks] = useState(() => Array.isArray(existing?.subtasks) ? existing.subtasks : [])
  const [newSub, setNewSub] = useState('')
  const [person, setPerson] = useState(existing?.person ?? '')

  // Duration — the same editable per-device presets the Add sheet uses, plus a
  // forgiving typed length. A template has no start time, so it only ever holds
  // a length in minutes.
  const [manualDur, setManualDur] = useState(existing?.durationMins ?? null)
  const [durText, setDurText] = useState('')
  const [presets, setPresets] = useState(() => getDurationPresets())
  const [editingPresets, setEditingPresets] = useState(false)
  const [newPreset, setNewPreset] = useState('')

  // Color + icon (same picker + auto-suggest behavior as the Add sheet).
  const [color, setColor] = useState(existing?.color ?? '')
  const [icon, setIcon] = useState(existing?.icon ?? '')
  const [iconTouched, setIconTouched] = useState(!!existing?.icon)
  const [showColorIcon, setShowColorIcon] = useState(false)
  const chooseIcon = (v) => { setIcon(v); setIconTouched(true) }
  const autoIcon = (!iconTouched && !icon) ? suggestGlyph(text) : null
  const effectiveIcon = icon || autoIcon || ''

  const toggleCat = (id) => setSelectedCats(prev => prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id])

  const applyDuration = (mins) => { if (!mins) return; setManualDur(mins); setDurText('') }
  const onDurTextChange = (v) => {
    setDurText(v)
    const mins = parseDuration(v)
    if (mins) setManualDur(mins)
    else if (!v.trim()) setManualDur(null)
  }
  const addPreset = () => {
    const mins = parseDuration(newPreset)
    if (!mins) return
    setPresets(setDurationPresets([...presets, mins]))
    setNewPreset('')
  }
  const removePreset = (mins) => setPresets(setDurationPresets(presets.filter(p => p !== mins)))
  const resetPresets = () => setPresets(resetDurationPresets())

  const addSub = () => {
    if (!newSub.trim()) return
    setSubtasks(prev => [...prev, { id: 'st-' + Date.now(), text: newSub.trim(), done: false }])
    setNewSub('')
  }
  const editSub = (id, t) => setSubtasks(prev => prev.map(s => s.id === id ? { ...s, text: t } : s))
  const removeSub = (id) => setSubtasks(prev => prev.filter(s => s.id !== id))
  const moveSub = (id, dir) => setSubtasks(prev => {
    const i = prev.findIndex(s => s.id === id)
    const j = i + dir
    if (i < 0 || j < 0 || j >= prev.length) return prev
    const next = [...prev]
    ;[next[i], next[j]] = [next[j], next[i]]
    return next
  })

  const primaryCat = cats.find(c => c.id === selectedCats[0]) || null
  const headerColor = color || primaryCat?.color || activeAccent()
  const headerFg = iconColorOn(headerColor)
  const onLight = headerFg !== '#FFFFFF'
  const headerHair = onLight ? 'rgba(0,0,0,.28)' : 'rgba(255,255,255,.45)'
  const shownIcon = effectiveIcon || primaryCat?.icon || ''
  const labelNames = selectedCats.map(id => (cats.find(c => c.id === id)?.label) || id)

  const canSave = !!text.trim()
  const submit = () => {
    if (!canSave) return
    onSave({
      id: existing?.id ?? ('tpl-' + Date.now()),
      text: text.trim(),
      durationMins: manualDur || null,
      cat: selectedCats[0] || null,
      cats: selectedCats,
      color: color || null,
      icon: effectiveIcon || null,
      description: description.trim() || '',
      subtasks,
      person: person.trim() || null,
      createdAt: existing?.createdAt ?? new Date().toISOString(),
    })
    onClose()
  }

  const card = { background:'white', borderRadius:16, boxShadow:'0 1px 4px rgba(60,72,88,.06)', marginBottom:16, overflow:'hidden' }
  const fieldLabel = { fontSize:10, color:'var(--muted)', letterSpacing:1, textTransform:'uppercase', marginBottom:6 }

  return (
    <div onClick={onClose}
      style={{ position:'fixed', inset:0, background:'rgba(20,28,38,.5)', zIndex:600, display:'flex', alignItems:'flex-end', justifyContent:'center' }}>
      <div onClick={e => e.stopPropagation()}
        style={{ background:'#F3F2F6', borderRadius:'22px 22px 0 0', width:'100%', maxWidth:480, minWidth:0, maxHeight:'94vh', overflowY:'auto', overflowX:'hidden', boxShadow:'0 -10px 44px rgba(20,40,60,.28)' }}>

        {/* Colored header band with the title input */}
        <div style={{ background:headerColor, backgroundImage:'linear-gradient(158deg, rgba(255,255,255,.14), rgba(0,0,0,.20))', padding:'14px 16px 20px' }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:14 }}>
            <button onClick={onClose} aria-label="Close"
              style={{ width:34, height:34, borderRadius:'50%', border:'none', background: onLight ? 'rgba(0,0,0,.10)' : 'rgba(255,255,255,.26)', color:headerFg, fontSize:16, cursor:'pointer' }}>✕</button>
            <span style={{ fontSize:11, letterSpacing:1.5, textTransform:'uppercase', color: onLight ? 'rgba(0,0,0,.6)' : 'rgba(255,255,255,.9)', fontWeight:600 }}>{isEdit ? 'Edit task' : 'New menu task'}</span>
            <span style={{ width:34 }} />
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:13 }}>
            <button type="button" onClick={() => setShowColorIcon(true)} aria-label="Choose color and icon"
              style={{ position:'relative', flexShrink:0, width:52, height:52, borderRadius:16, background:'rgba(255,255,255,.22)', border:'2px solid rgba(255,255,255,.7)', display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', padding:0 }}>
              {shownIcon
                ? <Icon value={shownIcon} size={26} color={headerFg} />
                : <span style={{ color:headerFg, fontSize:24, fontWeight:700 }}>{(text.trim()[0] || '?').toUpperCase()}</span>}
              <span style={{ position:'absolute', bottom:-5, left:-5, width:24, height:24, borderRadius:'50%', background:'white', boxShadow:'0 1px 4px rgba(0,0,0,.25)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:13, lineHeight:1 }}>🎨</span>
            </button>
            <div style={{ flex:1, minWidth:0 }}>
              <input value={text} onChange={e => setText(e.target.value)} placeholder="Name this task" autoFocus={!isEdit}
                onKeyDown={e => e.key === 'Enter' && canSave && submit()}
                className="add-title-input"
                style={{ width:'100%', background:'transparent', border:'none', borderBottom:`1px solid ${headerHair}`, color:headerFg, fontSize:21, fontWeight:700, fontFamily:'DM Sans,sans-serif', outline:'none', padding:'3px 0',
                  '--title-ph': onLight ? 'rgba(0,0,0,.42)' : 'rgba(255,255,255,.72)' }} />
            </div>
          </div>
        </div>

        <div style={{ padding:'16px 14px calc(20px + env(safe-area-inset-bottom))' }}>
          {/* Duration */}
          <div style={{ ...card, padding:'14px 15px' }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:8 }}>
              <div style={{ ...fieldLabel, marginBottom:0 }}>Duration</div>
              <button type="button" onClick={() => setEditingPresets(e => !e)}
                style={{ fontSize:10.5, fontWeight:700, letterSpacing:.4, border:'none', background:'none', cursor:'pointer', color:'var(--teal)', padding:0 }}>
                {editingPresets ? 'Done' : 'Edit'}
              </button>
            </div>
            <div style={{ display:'flex', gap:6, flexWrap:'wrap', alignItems:'center' }}>
              {presets.map(mins => {
                const on = manualDur === mins
                return (
                  <button key={mins} onClick={() => editingPresets ? removePreset(mins) : applyDuration(mins)}
                    style={{ fontSize:11, padding:'4px 11px', borderRadius:16, cursor:'pointer', fontFamily:'DM Sans,sans-serif', fontWeight:600,
                      border: on && !editingPresets ? 'none' : '1px solid var(--border)',
                      background: editingPresets ? '#FDECEC' : (on ? 'var(--teal)' : 'white'),
                      color: editingPresets ? '#DC2626' : (on ? 'white' : 'var(--muted)') }}>
                    {editingPresets ? '✕ ' : ''}{durationLabel(mins)}
                  </button>
                )
              })}
              {editingPresets && (
                <button onClick={resetPresets} style={{ fontSize:10.5, padding:'4px 10px', borderRadius:16, cursor:'pointer', fontFamily:'DM Sans,sans-serif', fontWeight:600, border:'1px dashed var(--border)', background:'white', color:'var(--muted)' }}>Reset</button>
              )}
            </div>
            {editingPresets ? (
              <div style={{ display:'flex', gap:6, marginTop:8 }}>
                <input value={newPreset} onChange={e => setNewPreset(e.target.value)} placeholder="Add preset, e.g. 25m or 1h30"
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addPreset() } }}
                  style={{ ...inp, flex:1, fontSize:12.5 }} />
                <button onClick={addPreset} disabled={!parseDuration(newPreset)}
                  style={{ fontSize:12, padding:'0 14px', borderRadius:10, border:'none', cursor: parseDuration(newPreset) ? 'pointer' : 'default', fontFamily:'DM Sans,sans-serif', fontWeight:700, background: parseDuration(newPreset) ? ROW_ACCENT : '#E1E1E6', color: parseDuration(newPreset) ? 'white' : '#9CA3AF' }}>Add</button>
              </div>
            ) : (
              <div style={{ display:'flex', gap:6, marginTop:8, alignItems:'center' }}>
                <input value={durText} onChange={e => onDurTextChange(e.target.value)}
                  placeholder="Or type a duration — 90, 1h30, 45 min"
                  style={{ ...inp, flex:1, fontSize:12.5 }} />
                {manualDur > 0 && (
                  <button onClick={() => { setManualDur(null); setDurText('') }}
                    style={{ fontSize:11, padding:'0 12px', borderRadius:10, border:'1px solid var(--border)', background:'white', color:'var(--muted)', cursor:'pointer', fontFamily:'DM Sans,sans-serif', fontWeight:600, whiteSpace:'nowrap' }}>Clear</button>
                )}
              </div>
            )}
            <div style={{ fontSize:11, color:'var(--muted)', marginTop:8 }}>
              {manualDur ? `${prettyDur(manualDur)} long — carried over when you place this task.` : 'Optional. Set how long this task usually takes.'}
            </div>
          </div>

          {/* Tags / labels */}
          <div style={{ ...card, padding:'14px 15px' }}>
            <div style={fieldLabel}>Tags</div>
            <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
              {cats.map(c => {
                const on = selectedCats.includes(c.id)
                const primary = selectedCats[0] === c.id
                return (
                  <button key={c.id} onClick={() => toggleCat(c.id)}
                    style={{ fontSize:11, padding:'5px 12px', borderRadius:20, border: on ? 'none' : '1px solid var(--border)', background: on ? c.color : 'white', color: on ? 'white' : 'var(--muted)', cursor:'pointer', fontFamily:'DM Sans,sans-serif', fontWeight: on ? 600 : 400, boxShadow: primary ? '0 0 0 2px rgba(0,0,0,.16)' : 'none' }}>
                    {on ? '✓ ' : ''}{c.label}
                  </button>
                )
              })}
            </div>
            <div style={{ fontSize:10.5, color:'var(--muted)', marginTop:7 }}>
              {labelNames.length > 1 ? 'The outlined tag is the primary — it sets the color.' : 'Optional — pick one or more tags.'}
            </div>
          </div>

          {/* Color */}
          <div style={{ ...card, padding:'14px 15px' }}>
            <div style={{ display:'flex', alignItems:'center', gap:10 }}>
              <span style={{ width:15, height:15, borderRadius:'50%', background:headerColor, flexShrink:0 }} />
              <span style={{ flex:1, fontSize:14, fontWeight:500, color:'var(--text)' }}>Color &amp; icon</span>
              <button onClick={() => setShowColorIcon(true)}
                style={{ fontSize:12, padding:'6px 14px', borderRadius:16, cursor:'pointer', fontFamily:'DM Sans,sans-serif', fontWeight:600, border:'1px solid var(--border)', background:'white', color:'var(--teal)' }}>
                {color || icon ? 'Change' : 'Choose'}
              </button>
            </div>
          </div>

          {/* Subtasks + notes */}
          <div style={{ ...card, padding:'6px 15px 14px' }}>
            {subtasks.map((s, i) => (
              <div key={s.id} style={{ display:'flex', alignItems:'center', gap:8, padding:'8px 0', borderBottom:'1px solid #F1EDF2' }}>
                <span style={{ width:18, height:18, borderRadius:5, flexShrink:0, border:'2px solid #CDD3DA' }} />
                <GrowField value={s.text} onChange={e => editSub(s.id, e.target.value)}
                  style={{ flex:1, minWidth:0, fontSize:14, padding:'2px 0', border:'none', background:'transparent', fontFamily:'DM Sans,sans-serif', outline:'none', color:'var(--text)' }} />
                {subtasks.length > 1 && (
                  <span style={{ display:'inline-flex', flexDirection:'column', flexShrink:0, lineHeight:0 }}>
                    <button onClick={() => moveSub(s.id, -1)} disabled={i === 0} aria-label="Move subtask up"
                      style={{ background:'none', border:'none', cursor: i === 0 ? 'default' : 'pointer', color: i === 0 ? '#E2E4E9' : '#AEB6C0', fontSize:10, padding:'0 3px', lineHeight:1 }}>▲</button>
                    <button onClick={() => moveSub(s.id, 1)} disabled={i === subtasks.length - 1} aria-label="Move subtask down"
                      style={{ background:'none', border:'none', cursor: i === subtasks.length - 1 ? 'default' : 'pointer', color: i === subtasks.length - 1 ? '#E2E4E9' : '#AEB6C0', fontSize:10, padding:'0 3px', lineHeight:1 }}>▼</button>
                  </span>
                )}
                <button onClick={() => removeSub(s.id)} aria-label="Remove subtask" style={{ background:'none', border:'none', cursor:'pointer', color:'#CBD0D8', fontSize:16, padding:'0 2px', flexShrink:0 }}>✕</button>
              </div>
            ))}
            <div style={{ display:'flex', alignItems:'center', gap:10, padding:'9px 0 6px' }}>
              <div style={{ width:18, height:18, borderRadius:5, flexShrink:0, border:'2px solid #DBDFE5' }} />
              <input value={newSub} onChange={e => setNewSub(e.target.value)} placeholder="Add subtask"
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addSub() } }}
                style={{ flex:1, minWidth:0, fontSize:14, padding:'2px 0', border:'none', background:'transparent', fontFamily:'DM Sans,sans-serif', outline:'none', color:'var(--text)' }} />
              {newSub.trim() && (
                <button onClick={addSub} style={{ fontSize:12, padding:'5px 11px', borderRadius:14, border:'none', background:ROW_ACCENT, color:'white', cursor:'pointer', fontFamily:'DM Sans,sans-serif', fontWeight:600, flexShrink:0 }}>Add</button>
              )}
            </div>
            <div style={{ height:1, background:'#F1EDF2', margin:'6px 0 4px' }} />
            <textarea value={description} onChange={e => setDescription(e.target.value)}
              placeholder="Add notes, details, anything to remember…" rows={3}
              style={{ width:'100%', minHeight:0, fontSize:14, padding:'8px 0 2px', border:'none', background:'transparent', resize:'vertical', lineHeight:1.5, fontFamily:'DM Sans,sans-serif', outline:'none', color:'var(--text)' }} />
          </div>

          {/* Who you committed to */}
          <div style={{ ...card, padding:'14px 15px' }}>
            <div style={fieldLabel}>Who you committed to</div>
            <input value={person} onChange={e => setPerson(e.target.value)} placeholder="Optional — e.g. Sam, Mom, my manager…"
              style={inp} />
          </div>

          <button onClick={submit} disabled={!canSave}
            style={{ width:'100%', padding:'14px', borderRadius:14, border:'none', background: canSave ? headerColor : '#E1E1E6', color: canSave ? 'white' : '#9CA3AF', cursor: canSave ? 'pointer' : 'default', fontFamily:'DM Sans,sans-serif', fontWeight:700, fontSize:15, letterSpacing:.3 }}>
            {isEdit ? 'Save changes' : 'Add to Task Menu'}
          </button>
        </div>
      </div>

      {showColorIcon && (
        <ColorIconPicker
          color={color} icon={effectiveIcon}
          onColor={setColor} onIcon={chooseIcon}
          onClose={() => setShowColorIcon(false)} />
      )}
    </div>
  )
}

// ── Template card ──────────────────────────────────────────────
function TemplateCard({ t, categories, onEdit, onDelete }) {
  const cats = (categories && categories.length) ? categories : DEFAULT_CATEGORIES
  const primaryCat = cats.find(c => c.id === (t.cats?.[0] || t.cat)) || null
  const accent = t.color || primaryCat?.color || '#8899AA'
  const shownIcon = t.icon || primaryCat?.icon || ''
  const catList = ((t.cats && t.cats.length) ? t.cats : (t.cat ? [t.cat] : []))
    .map(id => cats.find(c => c.id === id)).filter(Boolean)
  const subCount = Array.isArray(t.subtasks) ? t.subtasks.length : 0

  return (
    <div style={{ background:'white', borderRadius:12, border:'1px solid var(--border)', padding:'14px 16px', marginBottom:8, display:'flex', gap:12, alignItems:'flex-start' }}>
      <span style={{ width:38, height:38, borderRadius:11, flexShrink:0, background:accent, display:'flex', alignItems:'center', justifyContent:'center' }}>
        {shownIcon
          ? <Icon value={shownIcon} size={20} color={iconColorOn(accent)} />
          : <span style={{ color:iconColorOn(accent), fontSize:17, fontWeight:700 }}>{(t.text?.trim()[0] || '?').toUpperCase()}</span>}
      </span>
      <div style={{ flex:1, minWidth:0, cursor:'pointer' }} onClick={() => onEdit(t)}>
        <div style={{ fontSize:14.5, fontWeight:600, color:'var(--text)', marginBottom:3 }}>{t.text}</div>
        <div style={{ display:'flex', gap:7, flexWrap:'wrap', alignItems:'center' }}>
          {t.durationMins ? <span style={{ fontSize:11, color:'var(--muted)' }}>⏱ {prettyDur(t.durationMins)}</span> : null}
          {subCount > 0 && <span style={{ fontSize:11, color:'var(--muted)' }}>☑ {subCount} subtask{subCount>1?'s':''}</span>}
          {catList.map((c, i) => (
            <span key={i} style={{ display:'inline-flex', alignItems:'center', gap:3, fontSize:10, padding:'2px 8px', borderRadius:10, background:hexToBg(c.color), color:c.color, fontWeight:500 }}>
              {c.icon && <Icon value={c.icon} size={11} />}{c.label}
            </span>
          ))}
        </div>
        {t.description && <div style={{ fontSize:12, color:'var(--muted)', lineHeight:1.5, marginTop:6, whiteSpace:'pre-wrap', display:'-webkit-box', WebkitLineClamp:2, WebkitBoxOrient:'vertical', overflow:'hidden' }}>{t.description}</div>}
      </div>
      <div style={{ display:'flex', gap:6, flexShrink:0, alignItems:'flex-start' }}>
        <button onClick={() => onEdit(t)} title="Edit"
          style={{ background:'none', border:'none', cursor:'pointer', color:'#9CA3AF', fontSize:14, padding:'0 2px' }}>✎</button>
        <button onClick={() => onDelete(t.id)} title="Delete"
          style={{ background:'none', border:'none', cursor:'pointer', color:'#D1D5DB', fontSize:16, padding:'0 2px' }}>✕</button>
      </div>
    </div>
  )
}

// ── Main ───────────────────────────────────────────────────────
export default function TaskMenu({ templates = [], addTemplate, updateTemplate, deleteTemplate, categories = [] }) {
  const [editing, setEditing] = useState(null)  // template object being edited
  const [adding, setAdding] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(null)

  const handleSave = (tpl) => {
    if (editing) updateTemplate(tpl.id, tpl)
    else addTemplate(tpl)
    setEditing(null); setAdding(false)
  }

  const sorted = [...(templates || [])].sort((a, b) =>
    (a.text || '').localeCompare(b.text || ''))

  return (
    <div>
      <div className="page-title">Task Menu</div>
      <div className="page-sub">A library of reusable tasks — set the duration, tags, notes and look here, with no date. When you add a task anywhere, pick one off the menu and it all fills in; you just choose a start time.</div>

      <button onClick={() => setAdding(true)}
        style={{ width:'100%', background:'linear-gradient(135deg, #7BBFD4, #C8BFDF)', border:'none', borderRadius:14, padding:'14px 18px', cursor:'pointer', display:'flex', alignItems:'center', gap:10, marginBottom:16 }}>
        <span style={{ fontSize:20, color:'#1A3A4E' }}>+</span>
        <span style={{ fontFamily:'DM Sans, sans-serif', fontSize:13, color:'#1A3A4E', fontWeight:600 }}>Add a task to the menu</span>
      </button>

      {sorted.length === 0 ? (
        <div style={{ background:'white', borderRadius:12, border:'1px solid var(--border)', padding:24, textAlign:'center' }}>
          <div style={{ fontSize:28, marginBottom:8 }}>📋</div>
          <div style={{ fontSize:13, color:'var(--muted)' }}>Your Task Menu is empty. Add tasks you do again and again — with their usual duration, tags and notes — so creating them later is one tap plus a time.</div>
        </div>
      ) : sorted.map(t => (
        <TemplateCard key={t.id} t={t} categories={categories}
          onEdit={setEditing} onDelete={setConfirmDelete} />
      ))}

      {(adding || editing) && (
        <TemplateEditor
          existing={editing}
          categories={categories}
          onSave={handleSave}
          onClose={() => { setEditing(null); setAdding(false) }} />
      )}

      {confirmDelete && (
        <div onClick={() => setConfirmDelete(null)}
          style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.5)', zIndex:700, display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}>
          <div onClick={e => e.stopPropagation()}
            style={{ background:'white', borderRadius:18, padding:20, maxWidth:330, width:'100%', boxShadow:'0 24px 64px rgba(0,0,0,.3)' }}>
            <div className="serif" style={{ fontSize:17, fontWeight:600, color:'var(--text)', marginBottom:6 }}>Remove from Task Menu?</div>
            <div style={{ fontSize:13, color:'var(--muted)', marginBottom:16, lineHeight:1.5 }}>Tasks you already created from it are not affected.</div>
            <div style={{ display:'flex', flexDirection:'column', gap:9 }}>
              <button type="button" onClick={() => { deleteTemplate(confirmDelete); setConfirmDelete(null) }}
                style={{ padding:'12px', borderRadius:12, border:'none', background:'#EF4444', color:'white', cursor:'pointer', fontFamily:'DM Sans,sans-serif', fontWeight:700, fontSize:14 }}>Delete</button>
              <button type="button" onClick={() => setConfirmDelete(null)}
                style={{ padding:'9px', borderRadius:12, border:'none', background:'none', color:'var(--muted)', cursor:'pointer', fontFamily:'DM Sans,sans-serif', fontSize:13 }}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
