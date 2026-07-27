// src/components/AddItemModal.jsx
// A shared "add something to the calendar" sheet used by both the Today tab
// (locked to today) and the Calendar tab (any date). It creates a commitment
// — which shows on the Calendar + Week and feeds reminders — and lets you set
// a start time and end time (with quick-duration buttons that fill the end
// from the start), plus optional custom reminder lead times that override the
// global defaults just for this item.
import { useState, useEffect } from 'react'
import DateField from './DateField.jsx'
import TimeField from './TimeField.jsx'
import MiniCalendar from './MiniCalendar.jsx'
import FocusMode from './FocusMode.jsx'
import { nowProgress, taskProgress } from '../lib/occurrences.js'
import { Icon } from './IconPicker.jsx'
import ColorIconPicker from './ColorIconPicker.jsx'
import { suggestGlyph } from '../lib/glyphs.jsx'
import { LEAD_OPTIONS, getItemReminders, getItemSound, setItemSound } from '../lib/notifications.js'
import { SOUNDS, playSound } from '../lib/sounds.js'

const DEFAULT_CATEGORIES = [{ id:'other', label:'Other', color:'#8899AA' }]

// Quick-set buttons: each fills in the end time as (start + this many minutes).
const QUICK_DURATIONS = [
  { label:'15m',  mins:15 },
  { label:'30m',  mins:30 },
  { label:'45m',  mins:45 },
  { label:'1h',   mins:60 },
  { label:'1.5h', mins:90 },
  { label:'2h',   mins:120 },
  { label:'3h',   mins:180 },
]

// A per-task color palette (overrides the label color when picked).
const TASK_COLORS = ['#E0A33E','#C4728E','#EC6F9C','#7C9CBF','#4A9EB5','#52B788','#2A9D8F','#7C3AED','#E07B2E','#EF6B6B','#6B7A8D','#111827']

const inp = { width:'100%', fontSize:14, padding:'10px 12px', borderRadius:10, border:'1px solid var(--border)', fontFamily:'DM Sans,sans-serif', outline:'none', boxSizing:'border-box' }
const fieldLabel = { fontSize:10, color:'var(--muted)', letterSpacing:1, textTransform:'uppercase', marginBottom:4 }

function fmt12(t) {
  if (!t) return ''
  const [h, m] = t.split(':').map(Number)
  return `${h % 12 || 12}:${String(m).padStart(2,'0')} ${h >= 12 ? 'PM' : 'AM'}`
}
function prettyDate(dateStr) {
  if (!dateStr) return ''
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', { weekday:'long', month:'long', day:'numeric' })
}
// Add minutes to "HH:MM" → "HH:MM" (clamped within the day).
function addMinutes(time, mins) {
  if (!time) return ''
  const [h, m] = time.split(':').map(Number)
  const t = Math.max(0, Math.min(h * 60 + m + mins, 23 * 60 + 59))
  return `${String(Math.floor(t/60)).padStart(2,'0')}:${String(t%60).padStart(2,'0')}`
}
// Minutes between two "HH:MM" strings (end - start); null if invalid/negative.
function diffMinutes(start, end) {
  if (!start || !end) return null
  const [sh, sm] = start.split(':').map(Number)
  const [eh, em] = end.split(':').map(Number)
  const d = (eh * 60 + em) - (sh * 60 + sm)
  return d > 0 ? d : null
}
function prettyDur(mins) {
  if (!mins) return ''
  if (mins < 60) return `${mins} min`
  return mins % 60 === 0 ? `${mins/60} h` : `${(mins/60).toFixed(1)} h`
}

// ── Grouped detail-sheet building blocks (Structured-style) ────────
const ROW_ACCENT = '#3E9C86'  // calm green for the row icons

function IconCircle({ children, color = ROW_ACCENT }) {
  return (
    <span style={{ width:30, height:30, borderRadius:'50%', flexShrink:0, background:`${color}20`, color, display:'inline-flex', alignItems:'center', justifyContent:'center' }}>
      {children}
    </span>
  )
}
function Chevron({ open }) {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="#C2C7D0" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"
      style={{ transform: open ? 'rotate(90deg)' : 'none', transition:'transform .2s' }} aria-hidden="true">
      <polyline points="9 6 15 12 9 18" />
    </svg>
  )
}
const CalIcon   = () => (<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="4.5" width="18" height="16" rx="3"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="8" y1="2.5" x2="8" y2="6"/><line x1="16" y1="2.5" x2="16" y2="6"/></svg>)
const RepeatIcon = () => (<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>)
const ClockIcon = () => (<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><polyline points="12 7.5 12 12 15.5 14"/></svg>)
const TagIcon   = () => (<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.5 13.3 12.7 21a2 2 0 0 1-2.8 0l-6.9-6.9a2 2 0 0 1-.6-1.4V4.5a2 2 0 0 1 2-2h7.2a2 2 0 0 1 1.4.6l7 7a2 2 0 0 1 0 2.6Z"/><circle cx="7.6" cy="7.6" r="1.3"/></svg>)
const BellIcon  = () => (<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9a6 6 0 0 1 12 0c0 5.5 2.3 6.8 2.3 6.8H3.7S6 14.5 6 9Z"/><path d="M10 20a2 2 0 0 0 4 0"/></svg>)

// A tappable grouped-list row: [icon] main text … [hint] [chevron], with an
// optional expanded body underneath.
function DetailRow({ icon, iconColor, text, textMuted, hint, open, onClick, children }) {
  return (
    <div>
      <div onClick={onClick}
        style={{ display:'flex', alignItems:'center', gap:12, padding:'13px 15px', cursor: onClick ? 'pointer' : 'default', userSelect:'none' }}>
        <IconCircle color={iconColor}>{icon}</IconCircle>
        <span style={{ fontSize:15, fontWeight:500, color: textMuted ? 'var(--muted)' : 'var(--text)', minWidth:0, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{text}</span>
        <span style={{ marginLeft:'auto', display:'inline-flex', alignItems:'center', gap:7, flexShrink:0 }}>
          {hint && <span style={{ fontSize:13, color:'var(--muted)' }}>{hint}</span>}
          {onClick && <Chevron open={open} />}
        </span>
      </div>
      {open && <div style={{ padding:'2px 15px 15px 15px' }}>{children}</div>}
    </div>
  )
}
const RowDivider = () => <div style={{ height:1, background:'#EEEAF1', marginLeft:57 }} />

// ── Weekday helpers for the Repeat row ─────────────────────────
const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
const WEEKDAY_SHORT = { sunday:'Su', monday:'Mo', tuesday:'Tu', wednesday:'We', thursday:'Th', friday:'Fr', saturday:'Sa' }
const WEEKDAY_ORDER = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
function weekdayOf(dateStr) {
  if (!dateStr) return null
  return WEEKDAYS[new Date(dateStr + 'T12:00:00').getDay()]
}
function daysSummary(days) {
  if (!days || !days.length) return 'Pick days'
  const set = new Set(days)
  if (set.size === 7) return 'Every day'
  const weekdays = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday']
  if (weekdays.every(d => set.has(d)) && set.size === 5) return 'Weekdays'
  return WEEKDAY_ORDER.filter(d => set.has(d)).map(d => WEEKDAY_SHORT[d]).join(' · ')
}
function localTodayStr() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}
function ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd'], v = n % 100
  return n + (s[(v - 20) % 10] || s[v] || s[0])
}

// Short relative label for the date row ("Today", "Tomorrow", weekday).
function relativeDay(dateStr) {
  if (!dateStr) return null
  const d = new Date(dateStr + 'T12:00:00')
  const t = new Date(); t.setHours(12,0,0,0)
  const diff = Math.round((d - t) / 86400000)
  if (diff === 0) return 'Today'
  if (diff === 1) return 'Tomorrow'
  if (diff === -1) return 'Yesterday'
  if (diff > 1 && diff < 7) return d.toLocaleDateString('en-US', { weekday:'long' })
  return null
}

// A row in the header ⋯ menu (Duplicate / Move to Inbox / Delete).
function MenuRow({ icon, label, danger, onClick }) {
  return (
    <button onClick={onClick}
      style={{ display:'flex', alignItems:'center', gap:12, width:'100%', padding:'12px 16px', border:'none', background:'transparent', cursor:'pointer',
        fontFamily:'DM Sans,sans-serif', fontSize:15, color: danger ? '#DC2626' : 'var(--text)', textAlign:'left' }}>
      <span style={{ display:'inline-flex', color: danger ? '#DC2626' : 'var(--text)' }}>{icon}</span>{label}
    </button>
  )
}
const DupIcon = () => (<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h8"/></svg>)
const InboxIcon2 = () => (<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 13h4l2 3h4l2-3h4"/><path d="M4 13 6 5.5A2 2 0 0 1 7.9 4h8.2A2 2 0 0 1 18 5.5L20 13v5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2Z"/></svg>)
const TrashIcon2 = () => (<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4.5 7h15M9 7V5.2A1.2 1.2 0 0 1 10.2 4h3.6A1.2 1.2 0 0 1 15 5.2V7M6.5 7l1 12.5h9L17.5 7"/></svg>)
const TargetIcon = () => (<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none"/></svg>)

export default function AddItemModal({ existing = null, presetDate = null, presetText = '', lockDate = false, categories = [], onSave, onSaveRecurring = null, onDelete = null, onDuplicate = null, onMoveToInbox = null, onClose, title = 'Add to calendar' }) {
  const cats = (categories && categories.length) ? categories : DEFAULT_CATEGORIES
  const isEdit = !!existing
  const [label, setLabel]         = useState(existing?.text || presetText || '')
  const [date, setDate]           = useState(existing?.date || presetDate || '')
  const [time, setTime]           = useState(existing?.time || '')  // start
  const [endTime, setEndTime]     = useState(existing?.time && existing?.durationMins ? addMinutes(existing.time, existing.durationMins) : '')
  // One or more category labels. The first stays the "primary" — it drives the
  // color dot, scheduling behavior, and everything that still reads a single
  // `cat`. Extra labels are purely additional tags.
  const [selectedCats, setSelectedCats] = useState(() => {
    if (Array.isArray(existing?.cats) && existing.cats.length) return existing.cats
    return [existing?.cat || cats[0]?.id || 'other']
  })
  const toggleCat = (id) => setSelectedCats(prev =>
    prev.includes(id)
      ? (prev.length > 1 ? prev.filter(c => c !== id) : prev)  // keep at least one
      : [...prev, id]
  )
  const [description, setDescription] = useState(existing?.description || '')
  const [subtasks, setSubtasks]   = useState(() => Array.isArray(existing?.subtasks) ? existing.subtasks : [])
  const [newSub, setNewSub]       = useState('')
  // Reminders: default (use global) unless the user customizes. When editing,
  // prefill from the item's saved override.
  const existingReminders = isEdit ? getItemReminders(existing.id) : null
  const [useDefault, setUseDefault] = useState(!existingReminders)
  const [reminders, setReminders]   = useState(existingReminders || [])

  // ── Sub-checkbox helpers ─────────────────────────────────────
  const addSub = () => {
    if (!newSub.trim()) return
    setSubtasks(prev => [...prev, { id: 'st-' + Date.now(), text: newSub.trim(), done: false }])
    setNewSub('')
  }
  const toggleSub = (id) => setSubtasks(prev => prev.map(s => s.id === id ? { ...s, done: !s.done } : s))
  const editSub   = (id, text) => setSubtasks(prev => prev.map(s => s.id === id ? { ...s, text } : s))
  const removeSub = (id) => setSubtasks(prev => prev.filter(s => s.id !== id))

  // Optional per-task color. Empty = inherit the primary label's color.
  const [color, setColor] = useState(existing?.color || '')
  // Optional per-task icon (glyph / emoji / uploaded image). Empty = auto:
  // suggest one from the title, then inherit the label's icon, then a letter.
  const [icon, setIcon] = useState(existing?.icon || '')
  const [showColorIcon, setShowColorIcon] = useState(false)
  // Once you pick or clear an icon yourself, stop auto-suggesting from the
  // title. (Editing a task that already has an icon counts as "chosen".)
  const [iconTouched, setIconTouched] = useState(!!existing?.icon)
  const chooseIcon = (v) => { setIcon(v); setIconTouched(true) }
  // The icon actually shown/saved: your explicit pick if any, otherwise a
  // live suggestion matched from the title until you touch it.
  const autoIcon = (!iconTouched && !icon) ? suggestGlyph(label) : null
  const effectiveIcon = icon || autoIcon || ''
  // In-app alert sound for this item's reminders (device-local).
  const [sound, setSound] = useState(() => getItemSound(existing?.id) || 'chime')

  // ── Repeat ───────────────────────────────────────────────────
  // Turning this on makes the item a recurring task instead of a one-off — it
  // then shows on every matching day across Today, Week and Calendar, and is
  // editable in the Recurring tab. Only offered for brand-new items (editing a
  // one-off shouldn't silently morph it into a series) and only when the parent
  // handed us an onSaveRecurring handler.
  const canRepeat = !isEdit && !!onSaveRecurring
  const [repeatFreq, setRepeatFreq] = useState('once')   // once | daily | weekly | monthly
  const [repeatInterval, setRepeatInterval] = useState(1)
  const [repeatDays, setRepeatDays] = useState(() => {
    const wd = weekdayOf(existing?.date || presetDate || '')
    return wd ? [wd] : ['monday']
  })
  const [repeatEnd, setRepeatEnd] = useState('')
  const repeatOn = repeatFreq !== 'once'
  const toggleRepeatDay = (d) => setRepeatDays(prev =>
    prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d])
  const pickFreq = (f) => {
    setRepeatFreq(f)
    setRepeatInterval(1)
    if (f === 'weekly' && repeatDays.length === 0) {
      const wd = weekdayOf(date); if (wd) setRepeatDays([wd])
    }
  }
  const intervalUnit = repeatFreq === 'daily' ? 'day' : repeatFreq === 'monthly' ? 'month' : 'week'
  const bumpInterval = (d) => setRepeatInterval(n => Math.max(1, Math.min(99, n + d)))

  // Which grouped row is expanded for editing (only one open at a time).
  const [expanded, setExpanded] = useState(null)
  const toggleRow = (k) => setExpanded(e => (e === k ? null : k))
  // Header ⋯ overflow menu (edit mode only) — Duplicate / Move to Inbox / Delete.
  const [menuOpen, setMenuOpen] = useState(false)
  const hasMenu = isEdit && (onDuplicate || onMoveToInbox || onDelete)
  const runMenu = (fn) => { setMenuOpen(false); onClose(); fn(existing) }

  // Live "happening now" state — re-tick so the remaining-time and shade update.
  const [, forceTick] = useState(0)
  useEffect(() => {
    if (!isEdit) return
    const t = setInterval(() => forceTick(x => x + 1), 15000)
    return () => clearInterval(t)
  }, [isEdit])
  // Time window drives "Xm remaining" + Focus Now; the icon fill reflects the
  // combined progress (time elapsed and/or live subtask completion).
  const timeProg = isEdit ? nowProgress(existing?.date, existing?.time, existing?.durationMins) : null
  const fill = isEdit ? taskProgress({ date: existing?.date, time: existing?.time, durationMins: existing?.durationMins, subDone: subtasks.filter(s => s.done).length, subCount: subtasks.length }) : null
  const [focusOpen, setFocusOpen] = useState(false)

  const durationMins = diffMinutes(time, endTime)          // null unless a valid span
  const endInvalid = !!(time && endTime && !durationMins)  // end set but ≤ start
  // Date is optional — a task with no date is a valid "unscheduled" commitment
  // (used by the Commitments tab). Today/Calendar preset or lock the date.
  // A weekly repeat needs at least one weekday chosen.
  const repeatInvalid = repeatFreq === 'weekly' && repeatDays.length === 0
  const canSave = !!label.trim() && !endInvalid && !repeatInvalid

  // Quick-set: fill the end time as start + N minutes. Needs a start time.
  const setQuickDuration = (mins) => {
    if (!time) return
    setEndTime(addMinutes(time, mins))
  }
  // If they set/adjust the start after picking an end, keep the same duration
  // by shifting the end along with it (feels like "move the block").
  const onStartChange = (v) => {
    const keep = durationMins
    setTime(v)
    if (v && keep) setEndTime(addMinutes(v, keep))
  }

  const toggleLead = (mins) => {
    // Choosing a specific lead switches this item off the global defaults.
    if (useDefault) { setUseDefault(false); setReminders([mins]); return }
    setReminders(prev => prev.includes(mins) ? prev.filter(m => m !== mins) : [...prev, mins].sort((a,b)=>b-a))
  }
  const chooseDefault = () => { setUseDefault(true); setReminders([]) }

  const submit = () => {
    if (!canSave) return
    // Repeating → create a recurring template (Recurring tab format) rather than
    // a single commitment. It carries its time in the label prefix ('today'
    // type) so it lands on the timeline; category, note, start/end date and the
    // repeat rule (freq/interval/day-of-month) come along too. Duration and
    // subtasks aren't part of the recurring schema.
    if (repeatOn && onSaveRecurring) {
      const primaryCatId = selectedCats[0]
      const startDate = date || localTodayStr()
      const recurringTask = {
        id: 'r-' + Date.now(),
        type: 'today',
        freq: repeatFreq,
        interval: Math.max(1, repeatInterval),
        days: repeatFreq === 'weekly' ? WEEKDAY_ORDER.filter(d => repeatDays.includes(d)) : [],
        monthDay: repeatFreq === 'monthly' ? parseInt(startDate.slice(8, 10), 10) : null,
        cat: primaryCatId,
        tag: primaryCatId,
        label: time ? `${fmt12(time)} — ${label.trim()}` : label.trim(),
        note: description.trim() || '',
        startDate,
        endDate: repeatEnd || null,
      }
      onSaveRecurring(recurringTask)
      onClose()
      return
    }
    const base = existing
      ? { ...existing }
      : { id: 'c-' + Date.now(), prepMin: null, person: null, done: false, createdAt: new Date().toISOString() }
    const commitment = {
      ...base,
      text: label.trim(),
      date: date || null,
      time: time || null,
      durationMins: durationMins || null,
      cat: selectedCats[0],
      cats: selectedCats,
      color: color || null,
      icon: effectiveIcon || null,
      description: description.trim() || '',
      subtasks,
    }
    setItemSound(commitment.id, sound)
    // null → use global defaults; otherwise this item's own lead-minute list.
    onSave(commitment, useDefault ? null : reminders, isEdit)
    onClose()
  }

  // Primary label drives the header color + icon.
  const primaryCat = cats.find(c => c.id === selectedCats[0]) || cats[0] || { color:'#4A9EB5', label:'', icon:'' }
  const headerColor = color || primaryCat.color || '#4A9EB5'
  // The task's shown icon: explicit/suggested, else the label's, else a letter.
  const shownIcon = effectiveIcon || primaryCat.icon || ''
  const isCustomColor = !!color && !TASK_COLORS.includes(color)
  const labelNames = selectedCats.map(id => (cats.find(c => c.id === id)?.label) || id)
  const card = { background:'white', borderRadius:16, boxShadow:'0 1px 4px rgba(60,72,88,.06)', marginBottom:16, overflow:'hidden' }
  const baseRemind = useDefault ? 'Default' : (reminders.length ? `${reminders.length} alert${reminders.length>1?'s':''}` : 'No alerts')
  const soundLabel = (SOUNDS.find(s => s.id === sound) || {}).label || 'Chime'
  const remindText = sound === 'none' ? baseRemind : `${baseRemind} · ${soundLabel}`
  // One-line summary for the collapsed Repeat row.
  const repeatRowSummary = (() => {
    if (!repeatOn) return 'Does not repeat'
    const every = repeatInterval > 1
    if (repeatFreq === 'daily')   return every ? `Every ${repeatInterval} days` : 'Daily'
    if (repeatFreq === 'monthly') {
      const d = date ? parseInt(date.slice(8, 10), 10) : new Date().getDate()
      return `Monthly on the ${ordinal(d)}${every ? ` · every ${repeatInterval} mo` : ''}`
    }
    const base = every ? `Every ${repeatInterval} weeks` : 'Weekly'
    return `${base} · ${daysSummary(repeatDays)}`
  })()

  return (
    <div onClick={onClose}
      style={{ position:'fixed', inset:0, background:'rgba(20,28,38,.5)', zIndex:600, display:'flex', alignItems:'flex-end', justifyContent:'center' }}>
      <div onClick={e => e.stopPropagation()}
        style={{ background:'#F3F2F6', borderRadius:'22px 22px 0 0', width:'100%', maxWidth:480, minWidth:0, maxHeight:'94vh', overflowY:'auto', overflowX:'hidden', boxShadow:'0 -10px 44px rgba(20,40,60,.28)' }}>

        {/* ── Colored header band ─────────────────────────────── */}
        <div style={{ background:headerColor, backgroundImage:'linear-gradient(158deg, rgba(255,255,255,.14), rgba(0,0,0,.20))', padding:'14px 16px 20px' }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:14, position:'relative' }}>
            <button onClick={onClose} aria-label="Close"
              style={{ width:34, height:34, borderRadius:'50%', border:'none', background:'rgba(255,255,255,.28)', color:'white', fontSize:16, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>✕</button>
            <span style={{ fontSize:11, letterSpacing:1.5, textTransform:'uppercase', color:'rgba(255,255,255,.85)', fontWeight:600 }}>{isEdit ? 'Edit' : title}</span>
            {hasMenu ? (
              <button onClick={() => setMenuOpen(o => !o)} aria-label="More actions"
                style={{ width:34, height:34, borderRadius:'50%', border:'none', background:'rgba(255,255,255,.28)', color:'white', fontSize:18, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', lineHeight:1, paddingBottom:4 }}>⋯</button>
            ) : <span style={{ width:34 }} />}
            {menuOpen && (
              <>
                <div onClick={() => setMenuOpen(false)} style={{ position:'fixed', inset:0, zIndex:5 }} />
                <div style={{ position:'absolute', top:42, right:0, zIndex:6, background:'white', borderRadius:14, boxShadow:'0 12px 40px rgba(20,30,45,.28)', overflow:'hidden', minWidth:196, paddingTop:4, paddingBottom:4 }}>
                  {onDuplicate && <MenuRow icon={<DupIcon />} label="Duplicate" onClick={() => runMenu(onDuplicate)} />}
                  {onMoveToInbox && <MenuRow icon={<InboxIcon2 />} label="Move to Inbox" onClick={() => runMenu(onMoveToInbox)} />}
                  {onDelete && <div style={{ height:1, background:'#EEEAF1', margin:'4px 0' }} />}
                  {onDelete && <MenuRow icon={<TrashIcon2 />} label="Delete" danger onClick={() => runMenu(onDelete)} />}
                </div>
              </>
            )}
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:13 }}>
            {/* Icon tile — tap the palette badge to pick a color + icon */}
            <div style={{ position:'relative', flexShrink:0 }}>
              <button type="button" onClick={() => setShowColorIcon(true)} aria-label="Choose color and icon"
                style={{ position:'relative', overflow:'hidden', width:52, height:52, borderRadius:16, background:'rgba(255,255,255,.22)', border:'2px solid rgba(255,255,255,.7)', display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', padding:0 }}>
                {fill && fill.show && (
                  <span style={{ position:'absolute', left:0, right:0, bottom:0, height:`${fill.frac * 100}%`, background:'rgba(255,255,255,.4)', transition:'height .5s ease' }} />
                )}
                <span style={{ position:'relative', display:'flex' }}>
                  {shownIcon
                    ? <Icon value={shownIcon} size={26} color="#fff" />
                    : <span style={{ color:'white', fontSize:24, fontWeight:700 }}>{(label.trim()[0] || '?').toUpperCase()}</span>}
                </span>
              </button>
              <span onClick={() => setShowColorIcon(true)}
                style={{ position:'absolute', bottom:-5, left:-5, width:24, height:24, borderRadius:'50%', background:'white', boxShadow:'0 1px 4px rgba(0,0,0,.25)', display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer' }}>
                <span style={{ fontSize:13, lineHeight:1 }}>🎨</span>
              </span>
            </div>
            <div style={{ flex:1, minWidth:0 }}>
              {timeProg
                ? <div style={{ fontSize:12.5, color:'rgba(255,255,255,.92)', fontWeight:600, marginBottom:1 }}>{timeProg.remaining}m remaining</div>
                : (time && <div style={{ fontSize:12.5, color:'rgba(255,255,255,.9)', fontWeight:600, marginBottom:1 }}>{fmt12(time)}{endTime && durationMins ? ` – ${fmt12(endTime)}` : ''}</div>)}
              <input value={label} onChange={e => setLabel(e.target.value)} placeholder="What's happening?" autoFocus={!isEdit}
                onKeyDown={e => e.key === 'Enter' && canSave && submit()}
                style={{ width:'100%', background:'transparent', border:'none', borderBottom:'1px solid rgba(255,255,255,.45)', color:'white', fontSize:21, fontWeight:700, fontFamily:'DM Sans,sans-serif', outline:'none', padding:'3px 0' }} />
            </div>
          </div>
          {timeProg && (
            <button type="button" onClick={() => setFocusOpen(true)}
              style={{ marginTop:16, width:'100%', padding:'13px', borderRadius:16, border:'none', background:'rgba(255,255,255,.26)', color:'white', fontWeight:700, fontSize:15, cursor:'pointer', fontFamily:'DM Sans,sans-serif', display:'flex', alignItems:'center', justifyContent:'center', gap:9 }}>
              <TargetIcon /> Focus Now
            </button>
          )}
        </div>

        <div style={{ padding:'16px 14px calc(20px + env(safe-area-inset-bottom))' }}>
          {/* ── Scheduling rows ───────────────────────────────── */}
          <div style={card}>
            {/* Date */}
            <DetailRow icon={<CalIcon />} text={date ? prettyDate(date) : 'Add a date'} textMuted={!date}
              hint={relativeDay(date)} open={expanded==='date'}
              onClick={lockDate ? undefined : () => toggleRow('date')}>
              <div style={{ fontSize:10, color:'var(--muted)', letterSpacing:1, textTransform:'uppercase', marginBottom:4 }}>Type it</div>
              <DateField value={date} onChange={setDate} style={inp} />
              <div style={{ fontSize:10, color:'var(--muted)', letterSpacing:1, textTransform:'uppercase', margin:'12px 0 0' }}>Or pick a day</div>
              <MiniCalendar value={date} onChange={setDate} />
              {date && (
                <button onClick={() => setDate('')}
                  style={{ marginTop:10, fontSize:11, padding:'5px 12px', borderRadius:16, cursor:'pointer', fontFamily:'DM Sans,sans-serif', fontWeight:600, border:'1px solid var(--border)', background:'white', color:'var(--muted)' }}>
                  Clear date
                </button>
              )}
            </DetailRow>
            <RowDivider />
            {/* Time */}
            <DetailRow icon={<ClockIcon />} text={time ? `${fmt12(time)}${endTime && durationMins ? ' – '+fmt12(endTime) : ''}` : 'Add a time'} textMuted={!time}
              open={expanded==='time'} onClick={() => toggleRow('time')}>
              <div style={{ display:'flex', gap:8, marginBottom:8 }}>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={fieldLabel}>Start</div>
                  <TimeField value={time} onChange={onStartChange} style={inp} />
                </div>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={fieldLabel}>End</div>
                  <TimeField value={endTime} onChange={setEndTime} style={{ ...inp, borderColor: endInvalid ? '#DC2626' : 'var(--border)' }} />
                </div>
              </div>
              <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
                {QUICK_DURATIONS.map(q => {
                  const on = durationMins === q.mins
                  return (
                    <button key={q.mins} onClick={() => setQuickDuration(q.mins)} disabled={!time}
                      style={{ fontSize:11, padding:'4px 11px', borderRadius:16, cursor: time ? 'pointer' : 'not-allowed', fontFamily:'DM Sans,sans-serif', fontWeight:600,
                        border: on ? 'none' : '1px solid var(--border)', background: on ? 'var(--teal)' : 'white', color: on ? 'white' : (time ? 'var(--muted)' : '#C7CDD4') }}>
                      {q.label}
                    </button>
                  )
                })}
              </div>
              <div style={{ fontSize:11, color: endInvalid ? '#DC2626' : 'var(--muted)', marginTop:8 }}>
                {endInvalid ? 'End time must be after the start time.'
                  : (time && durationMins) ? `${prettyDur(durationMins)} long`
                  : (!time ? 'Type a start time, then tap a duration.' : '')}
              </div>
            </DetailRow>
            {canRepeat && <>
              <RowDivider />
              {/* Repeat — turns this into a recurring task shown on every matching day */}
              <DetailRow icon={<RepeatIcon />} text={repeatRowSummary} textMuted={!repeatOn}
                hint={repeatOn ? 'On' : null} open={expanded==='repeat'} onClick={() => toggleRow('repeat')}>
                {/* Once / Daily / Weekly / Monthly */}
                <div style={{ display:'flex', gap:4, padding:4, borderRadius:12, background:'#EAE7EE', marginBottom: repeatOn ? 14 : 0 }}>
                  {[['once','Once'],['daily','Daily'],['weekly','Weekly'],['monthly','Monthly']].map(([v,l]) => {
                    const on = repeatFreq === v
                    return (
                      <button key={v} onClick={() => pickFreq(v)}
                        style={{ flex:1, padding:'8px 4px', borderRadius:9, border:'none', cursor:'pointer', fontFamily:'DM Sans,sans-serif', fontSize:12.5, fontWeight:600,
                          background: on ? 'var(--forest)' : 'transparent', color: on ? 'var(--green-light)' : 'var(--muted)' }}>{l}</button>
                    )
                  })}
                </div>
                {repeatOn && <>
                  {/* Interval stepper */}
                  <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:8, marginBottom:14 }}>
                    <span style={{ fontSize:13.5, color:'var(--text)' }}>Every {repeatInterval > 1 ? repeatInterval : ''} {intervalUnit}{repeatInterval > 1 ? 's' : ''}</span>
                    <div style={{ display:'flex', alignItems:'center', gap:0, border:'1px solid var(--border)', borderRadius:10, overflow:'hidden' }}>
                      <button onClick={() => bumpInterval(-1)} disabled={repeatInterval <= 1}
                        style={{ width:38, height:34, border:'none', background:'white', cursor: repeatInterval<=1?'default':'pointer', fontSize:18, color: repeatInterval<=1?'#CBD2DA':'var(--text)' }}>−</button>
                      <span style={{ width:34, textAlign:'center', fontSize:14, fontWeight:600, color:'var(--text)' }}>{repeatInterval}</span>
                      <button onClick={() => bumpInterval(1)}
                        style={{ width:38, height:34, border:'none', borderLeft:'1px solid var(--border)', background:'white', cursor:'pointer', fontSize:18, color:'var(--text)' }}>+</button>
                    </div>
                  </div>
                  {/* Weekday picker (weekly) */}
                  {repeatFreq === 'weekly' && (
                    <>
                      <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginBottom:6 }}>
                        {WEEKDAY_ORDER.map(d => {
                          const on = repeatDays.includes(d)
                          return (
                            <button key={d} onClick={() => toggleRepeatDay(d)}
                              style={{ width:38, height:38, borderRadius:'50%', border: on ? 'none' : '1px solid var(--border)', background: on ? 'var(--forest)' : 'white', color: on ? 'var(--green-light)' : 'var(--muted)', cursor:'pointer', fontFamily:'DM Sans,sans-serif', fontWeight:600, fontSize:11.5 }}>
                              {WEEKDAY_SHORT[d]}
                            </button>
                          )
                        })}
                      </div>
                      {repeatInvalid && <div style={{ fontSize:10.5, color:'#DC2626', marginBottom:6 }}>Pick at least one day.</div>}
                    </>
                  )}
                  {/* Monthly note */}
                  {repeatFreq === 'monthly' && (
                    <div style={{ fontSize:12.5, color:'var(--muted)', marginBottom:12 }}>
                      Repeats on the <b style={{ color:'var(--text)' }}>{ordinal(date ? parseInt(date.slice(8,10), 10) : new Date().getDate())}</b> of each month{date ? '' : ' (from today)'}.
                    </div>
                  )}
                  {/* End date */}
                  <div style={{ fontSize:10, color:'var(--muted)', letterSpacing:1, textTransform:'uppercase', margin:'6px 0 6px' }}>Ends</div>
                  <div style={{ display:'flex', gap:8, alignItems:'center' }}>
                    <DateField value={repeatEnd} onChange={setRepeatEnd} style={{ ...inp, flex:1 }} />
                    {repeatEnd && (
                      <button onClick={() => setRepeatEnd('')}
                        style={{ fontSize:11, padding:'8px 12px', borderRadius:16, cursor:'pointer', fontFamily:'DM Sans,sans-serif', fontWeight:600, border:'1px solid var(--border)', background:'white', color:'var(--muted)', whiteSpace:'nowrap' }}>Clear</button>
                    )}
                  </div>
                  <div style={{ fontSize:10.5, color:'var(--muted)', marginTop:8 }}>
                    {repeatEnd ? 'Stops repeating after this date.' : 'No end date — repeats indefinitely. Shows on Today, Week & Calendar; manage it in the Recurring tab.'}
                  </div>
                </>}
              </DetailRow>
            </>}
            <RowDivider />
            {/* Labels */}
            <DetailRow icon={<TagIcon />} iconColor={headerColor} text={labelNames.join(', ')}
              hint={selectedCats.length > 1 ? `${selectedCats.length}` : null}
              open={expanded==='labels'} onClick={() => toggleRow('labels')}>
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
              {selectedCats.length > 1 && (
                <div style={{ fontSize:10.5, color:'var(--muted)', marginTop:7 }}>The outlined label is the primary — it sets the color and scheduling.</div>
              )}
            </DetailRow>
            <RowDivider />
            {/* Color */}
            <DetailRow icon={<span style={{ width:15, height:15, borderRadius:'50%', background:headerColor }} />} iconColor={headerColor}
              text="Color" hint={color ? 'Custom' : 'From label'} open={expanded==='color'} onClick={() => toggleRow('color')}>
              <div style={{ display:'flex', gap:9, flexWrap:'wrap', alignItems:'center' }}>
                {TASK_COLORS.map(cx => (
                  <button key={cx} onClick={() => setColor(cx)} aria-label={`Color ${cx}`}
                    style={{ width:28, height:28, borderRadius:'50%', background:cx, cursor:'pointer', padding:0,
                      border: color===cx ? '3px solid white' : '3px solid transparent',
                      boxShadow: color===cx ? `0 0 0 2px ${cx}` : '0 0 0 1px rgba(0,0,0,.10)' }} />
                ))}
                {/* Any custom color via the native color wheel */}
                <label title="Custom color" style={{ width:28, height:28, borderRadius:'50%', cursor:'pointer', position:'relative', overflow:'hidden', display:'inline-block',
                  background: isCustomColor ? color : 'conic-gradient(from 90deg, #EF6B6B, #E0A33E, #52B788, #4A9EB5, #7C3AED, #EC6F9C, #EF6B6B)',
                  border: isCustomColor ? '3px solid white' : '3px solid transparent',
                  boxShadow: isCustomColor ? `0 0 0 2px ${color}` : '0 0 0 1px rgba(0,0,0,.10)' }}>
                  <input type="color" value={color || '#4A9EB5'} onChange={e => setColor(e.target.value)}
                    style={{ position:'absolute', top:'-40%', left:'-40%', width:'180%', height:'180%', opacity:0, cursor:'pointer', border:'none', padding:0 }} />
                </label>
              </div>
              <button onClick={() => setColor('')}
                style={{ marginTop:11, fontSize:11, padding:'5px 12px', borderRadius:16, cursor:'pointer', fontFamily:'DM Sans,sans-serif', fontWeight:600,
                  border: color ? '1px solid var(--border)' : 'none', background: color ? 'white' : 'var(--forest)', color: color ? 'var(--muted)' : 'var(--green-light)' }}>
                {color ? 'Match label color' : '✓ Matching label color'}
              </button>
            </DetailRow>
            <RowDivider />
            {/* Reminders */}
            <DetailRow icon={<BellIcon />} text="Remind me" hint={remindText}
              open={expanded==='remind'} onClick={() => toggleRow('remind')}>
              <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
                <button onClick={chooseDefault}
                  style={{ fontSize:11, padding:'5px 12px', borderRadius:20, cursor:'pointer', fontFamily:'DM Sans,sans-serif', fontWeight:600, border: useDefault ? 'none' : '1px solid var(--border)', background: useDefault ? 'var(--forest)' : 'white', color: useDefault ? 'var(--green-light)' : 'var(--muted)' }}>
                  {useDefault ? '✓ ' : ''}Default
                </button>
                {LEAD_OPTIONS.map(opt => {
                  const on = !useDefault && reminders.includes(opt.mins)
                  return (
                    <button key={opt.mins} onClick={() => toggleLead(opt.mins)}
                      style={{ fontSize:11, padding:'5px 12px', borderRadius:20, cursor:'pointer', fontFamily:'DM Sans,sans-serif', fontWeight:600, border: on ? 'none' : '1px solid var(--border)', background: on ? 'var(--forest)' : 'white', color: on ? 'var(--green-light)' : 'var(--muted)' }}>
                      {on ? '✓ ' : ''}{opt.label}
                    </button>
                  )
                })}
              </div>
              <div style={{ fontSize:10.5, color:'var(--muted)', marginTop:7 }}>
                {useDefault ? 'Uses your default reminder times (Settings → Reminders).'
                  : reminders.length ? `This item only: ${reminders.map(m => LEAD_OPTIONS.find(o => o.mins===m)?.label || m+'m').join(', ')} before.`
                  : 'No reminders for this item.'}
              </div>
              {/* Sound — tap to choose + preview */}
              <div style={{ fontSize:10, color:'var(--muted)', letterSpacing:1, textTransform:'uppercase', margin:'14px 0 6px' }}>Sound</div>
              <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
                {SOUNDS.map(s => {
                  const on = sound === s.id
                  return (
                    <button key={s.id} onClick={() => { setSound(s.id); if (s.id !== 'none') playSound(s.id) }}
                      style={{ fontSize:11, padding:'5px 12px', borderRadius:20, cursor:'pointer', fontFamily:'DM Sans,sans-serif', fontWeight:600, border: on ? 'none' : '1px solid var(--border)', background: on ? 'var(--forest)' : 'white', color: on ? 'var(--green-light)' : 'var(--muted)' }}>
                      {on ? '♪ ' : ''}{s.label}
                    </button>
                  )
                })}
              </div>
              <div style={{ fontSize:10.5, color:'var(--muted)', marginTop:6 }}>Plays in-app when a reminder fires. Your phone controls the system notification sound.</div>
            </DetailRow>
          </div>

          {/* ── Subtasks + notes ──────────────────────────────── */}
          <div style={{ ...card, padding:'6px 15px 14px' }}>
            {subtasks.map(s => (
              <div key={s.id} style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 0', borderBottom:'1px solid #F1EDF2' }}>
                <div onClick={() => toggleSub(s.id)}
                  style={{ width:20, height:20, borderRadius:6, flexShrink:0, cursor:'pointer', border: s.done ? 'none' : '2px solid #CDD3DA', background: s.done ? ROW_ACCENT : 'transparent', display:'flex', alignItems:'center', justifyContent:'center' }}>
                  {s.done && <span style={{ color:'white', fontSize:12, fontWeight:700 }}>✓</span>}
                </div>
                <input value={s.text} onChange={e => editSub(s.id, e.target.value)}
                  style={{ flex:1, minWidth:0, fontSize:14, padding:'2px 0', border:'none', background:'transparent', fontFamily:'DM Sans,sans-serif', outline:'none', textDecoration: s.done ? 'line-through' : 'none', color: s.done ? 'var(--muted)' : 'var(--text)' }} />
                <button onClick={() => removeSub(s.id)} style={{ background:'none', border:'none', cursor:'pointer', color:'#CBD0D8', fontSize:16, padding:'0 2px', flexShrink:0 }}>✕</button>
              </div>
            ))}
            <div style={{ display:'flex', alignItems:'center', gap:10, padding:'9px 0 6px' }}>
              <div style={{ width:20, height:20, borderRadius:6, flexShrink:0, border:'2px solid #DBDFE5' }} />
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

          {/* ── Save ──────────────────────────────────────────── */}
          <button onClick={submit} disabled={!canSave}
            style={{ width:'100%', padding:'14px', borderRadius:14, border:'none', background: canSave ? headerColor : '#E1E1E6', color: canSave ? 'white' : '#9CA3AF', cursor: canSave ? 'pointer' : 'default', fontFamily:'DM Sans,sans-serif', fontWeight:700, fontSize:15, letterSpacing:.3 }}>
            {isEdit ? 'Save changes' : (repeatOn ? 'Add recurring task' : title)}
          </button>
        </div>
      </div>

      {showColorIcon && (
        <ColorIconPicker
          color={color} icon={effectiveIcon}
          onColor={setColor} onIcon={chooseIcon}
          onClose={() => setShowColorIcon(false)} />
      )}

      {focusOpen && (
        <FocusMode
          title={label.trim() || 'Focus'}
          icon={shownIcon}
          color={headerColor}
          time={time}
          durationMins={durationMins || existing?.durationMins || null}
          onClose={() => setFocusOpen(false)} />
      )}
    </div>
  )
}
