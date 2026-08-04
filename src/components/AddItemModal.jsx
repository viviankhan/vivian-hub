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
import { nowProgress, taskProgress, splitTimePrefix } from '../lib/occurrences.js'
import { Icon } from './IconPicker.jsx'
import ColorIconPicker from './ColorIconPicker.jsx'
import ColorSwatchRow, { TASK_COLORS } from './ColorSwatchRow.jsx'
import { suggestGlyph, iconColorOn } from '../lib/glyphs.jsx'
import { LEAD_OPTIONS, getItemReminders, getItemSound, setItemSound, defaultLeadsLabel, leadLabel } from '../lib/notifications.js'
import { SOUNDS, playSound } from '../lib/sounds.js'
import { getDurationPresets, setDurationPresets, resetDurationPresets, parseDuration, durationLabel } from '../lib/durations.js'
import { predictLabel } from '../lib/predictLabel.js'
import { geolocationSupported, getCurrentLocation, searchPlaces, DEFAULT_RADIUS_M } from '../lib/geofence.js'

const DEFAULT_CATEGORIES = [{ id:'other', label:'Other', color:'#8899AA' }]

// A neutral slate used for the header when a task has no label yet (so an
// unlabeled task doesn't borrow a real category's color and read as tagged).
const UNLABELED_COLOR = '#6B7A8D'

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
const PinIcon   = () => (<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 21s6-5.6 6-10.2A6 6 0 0 0 6 10.8C6 15.4 12 21 12 21Z"/><circle cx="12" cy="10.8" r="2.2"/></svg>)
const BlockIcon = () => (<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="M3 9.5h18"/></svg>)

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

export default function AddItemModal({ existing = null, existingRecurring = null, occurrenceDate = null, onSaveOccurrence = null, onDeleteOccurrence = null, onDeleteFuture = null, presetDate = null, presetText = '', presetTime = '', presetCat = '', lockDate = false, defaultRepeat = false, categories = [], routines = [], labelModel = null, onSave, onSaveRecurring = null, onDelete = null, onDuplicate = null, onMoveToInbox = null, onClose, title = 'Add to calendar' }) {
  const cats = (categories && categories.length) ? categories : DEFAULT_CATEGORIES
  const isEdit = !!existing
  // Editing an existing recurring task: it comes in the Recurring-tab row shape
  // (label with a time prefix, days, freq/interval/monthDay/durationMins). Split
  // it into the same fields the sheet uses so one editor serves both.
  const rec = existingRecurring
  const isRecEdit = !!rec
  // Editing one occurrence of a series: offer "just this event" vs "whole
  // series". Only possible when the parent supplied the occurrence's date and a
  // handler for detaching it. Default to this-event so a one-off tweak never
  // silently rewrites every day.
  const canEditOccurrence = isRecEdit && !!occurrenceDate && !!onSaveOccurrence
  const canScopedDelete = isRecEdit && !!occurrenceDate && (!!onDeleteOccurrence || !!onDeleteFuture)
  const [scopePrompt, setScopePrompt] = useState(false)   // save-time "this event / all events" chooser
  const recSplit = rec ? splitTimePrefix(rec.label ?? rec.text ?? '') : { time:null, title:'' }
  const [label, setLabel]         = useState(existing?.text ?? (rec ? recSplit.title : presetText) ?? '')
  const [date, setDate]           = useState(existing?.date ?? rec?.startDate ?? presetDate ?? '')
  const [time, setTime]           = useState(existing?.time ?? (rec ? (recSplit.time || '') : (presetTime || '')) ?? '')  // start
  const [endTime, setEndTime]     = useState(() => {
    if (existing?.time && existing?.durationMins) return addMinutes(existing.time, existing.durationMins)
    if (rec && recSplit.time && rec.durationMins) return addMinutes(recSplit.time, rec.durationMins)
    return ''
  })
  // One or more category labels. The first stays the "primary" — it drives the
  // color dot, scheduling behavior, and everything that still reads a single
  // `cat`. Extra labels are purely additional tags. A brand-new task starts
  // with NO label — we only ever fill one in when it can be predicted from
  // past tasks (see `predictedCat` below), never a blind default.
  const [selectedCats, setSelectedCats] = useState(() => {
    if (Array.isArray(existing?.cats) && existing.cats.length) return existing.cats
    const explicit = existing?.cat || rec?.cat || rec?.tag || presetCat
    return explicit ? [explicit] : []
  })
  // Once you touch the labels yourself, stop auto-predicting from the title.
  // (Editing something that already carries a label counts as chosen. A block's
  // preset category counts as chosen too.)
  const [catsTouched, setCatsTouched] = useState(!!(existing?.cat || rec?.cat || rec?.tag || presetCat || (existing?.cats && existing.cats.length)))
  // A prediction from history — only offered for a still-untouched, unlabeled
  // task, and only when the model is confident. Otherwise null (stays unlabeled).
  const validCatIds = new Set(cats.map(c => c.id))
  const predictedCat = (!catsTouched && !selectedCats.length && labelModel)
    ? predictLabel(label, labelModel, validCatIds) : null
  // What the task actually gets: your explicit picks, else the live prediction.
  const effectiveCats = selectedCats.length ? selectedCats : (predictedCat ? [predictedCat] : [])
  const usingPrediction = !selectedCats.length && !!predictedCat
  const toggleCat = (id) => {
    setCatsTouched(true)
    setSelectedCats(prev => {
      const base = prev.length ? prev : effectiveCats
      return base.includes(id) ? base.filter(c => c !== id) : [...base, id]
    })
  }
  const [description, setDescription] = useState(existing?.description ?? rec?.note ?? '')
  const [subtasks, setSubtasks]   = useState(() => Array.isArray(existing?.subtasks) ? existing.subtasks : [])
  const [newSub, setNewSub]       = useState('')

  // ── Duration ─────────────────────────────────────────────────
  // A task's length can come from an end time, a tapped preset, or a typed
  // duration. `manualDur` holds the length when there's no end time to derive
  // it from (e.g. a duration with no fixed start). The quick presets are
  // user-editable and stored per-device.
  const [manualDur, setManualDur] = useState(existing?.durationMins ?? rec?.durationMins ?? null)
  const [durText, setDurText]     = useState('')
  const [presets, setPresets]     = useState(() => getDurationPresets())
  const [editingPresets, setEditingPresets] = useState(false)
  const [newPreset, setNewPreset] = useState('')

  // ── Location ─────────────────────────────────────────────────
  // An optional place. When the device arrives within its radius, the task's
  // progress auto-starts regardless of the time it's set for (see App wiring).
  const [location, setLocation] = useState(existing?.location ?? null)
  const [locBusy, setLocBusy]   = useState(false)
  const [locErr, setLocErr]     = useState('')
  // Type-to-search a place (geocoded), so a location can be set without being there.
  const [locQuery, setLocQuery]   = useState('')
  const [locResults, setLocResults] = useState([])
  const [locSearching, setLocSearching] = useState(false)
  useEffect(() => {
    const q = locQuery.trim()
    if (q.length < 3) { setLocResults([]); setLocSearching(false); return }
    setLocSearching(true)
    let cancelled = false
    const t = setTimeout(async () => {
      const results = await searchPlaces(q)
      if (!cancelled) { setLocResults(results); setLocSearching(false) }
    }, 450)
    return () => { cancelled = true; clearTimeout(t) }
  }, [locQuery])

  // ── Time block (container) ───────────────────────────────────
  // When on, this item isn't a task — it's a labeled window (e.g. "Work") that
  // draws a soft film behind the day's timeline for its time span; tasks
  // scheduled inside it stay normal. Can be one-off or repeat (e.g. weekdays).
  const [block, setBlock] = useState(existing?.block ?? rec?.block ?? false)
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
  const [color, setColor] = useState(existing?.color ?? rec?.color ?? '')
  // Optional per-task icon (glyph / emoji / uploaded image). Empty = auto:
  // suggest one from the title, then inherit the label's icon, then a letter.
  const [icon, setIcon] = useState(existing?.icon ?? rec?.icon ?? '')
  const [showColorIcon, setShowColorIcon] = useState(false)
  // Once you pick or clear an icon yourself, stop auto-suggesting from the
  // title. (Editing a task that already has an icon counts as "chosen".)
  const [iconTouched, setIconTouched] = useState(!!(existing?.icon || rec?.icon))
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
  // editable in the Recurring tab. Offered for new items, when editing a
  // recurring template, and when editing a one-off (so you can convert an
  // existing task into a series) — anywhere the parent handed us onSaveRecurring.
  const canRepeat = !!onSaveRecurring || isRecEdit
  const [repeatFreq, setRepeatFreq] = useState(rec ? (rec.freq || 'weekly') : (defaultRepeat ? 'weekly' : 'once'))   // once | daily | weekly | monthly
  const [repeatInterval, setRepeatInterval] = useState(rec?.interval && rec.interval > 1 ? rec.interval : 1)
  const [repeatDays, setRepeatDays] = useState(() => {
    if (rec && Array.isArray(rec.days) && rec.days.length) return rec.days
    const wd = weekdayOf(existing?.date || rec?.startDate || presetDate || '')
    return wd ? [wd] : ['monday']
  })
  const [repeatEnd, setRepeatEnd] = useState(rec?.endDate || '')
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
  // Routine group this recurring task belongs to ('' = none). Files it under a
  // Morning/Night (or custom) group in the Recurring tab + tints its timeline
  // block with that group's film.
  const [routine, setRoutine] = useState(existing?.routine ?? rec?.routine ?? '')

  // Which grouped row is expanded for editing (only one open at a time). On the
  // recurring page the Repeat row opens by default so the days are right there.
  const [expanded, setExpanded] = useState((defaultRepeat || isRecEdit) ? 'repeat' : null)
  const toggleRow = (k) => setExpanded(e => (e === k ? null : k))
  // Header ⋯ overflow menu (edit mode only) — Duplicate / Move to Inbox / Delete.
  const [menuOpen, setMenuOpen] = useState(false)
  const hasMenu = (isEdit || isRecEdit) && (onDuplicate || onMoveToInbox || onDelete)
  const runMenu = (fn) => { setMenuOpen(false); onClose(); fn(existing || rec) }

  // Live "happening now" state — re-tick so the remaining-time and shade update.
  const [, forceTick] = useState(0)
  useEffect(() => {
    if (!isEdit) return
    const t = setInterval(() => forceTick(x => x + 1), 15000)
    return () => clearInterval(t)
  }, [isEdit])
  // Time window drives "Xm remaining" + Focus Now; the icon fill reflects the
  // combined progress (time elapsed and/or live subtask completion).
  const timeProg = isEdit ? nowProgress(existing?.date, existing?.time, existing?.durationMins, existing?.startedAt) : null
  const fill = isEdit ? taskProgress({ date: existing?.date, time: existing?.time, durationMins: existing?.durationMins, subDone: subtasks.filter(s => s.done).length, subCount: subtasks.length, startedAt: existing?.startedAt }) : null
  const [focusOpen, setFocusOpen] = useState(false)

  const spanDur = diffMinutes(time, endTime)               // from start→end, if valid
  const endInvalid = !!(time && endTime && !spanDur)       // end set but ≤ start
  // The effective length: a valid start→end span wins; otherwise a typed/tapped
  // duration (which also works with no start time set).
  const durationMins = endInvalid ? null : (spanDur || manualDur)
  // Date is optional — a task with no date is a valid "unscheduled" commitment
  // (used by the Commitments tab). Today/Calendar preset or lock the date.
  // A weekly repeat needs at least one weekday chosen.
  const repeatInvalid = repeatFreq === 'weekly' && repeatDays.length === 0
  const canSave = !!label.trim() && !endInvalid && !repeatInvalid

  // Quick-set / manual: record the length. When there's a start time we also
  // fill the end from it; with no start we just remember the duration.
  const applyDuration = (mins) => {
    if (!mins) return
    setManualDur(mins)
    setDurText('')
    if (time) setEndTime(addMinutes(time, mins))
  }
  const onDurTextChange = (v) => {
    setDurText(v)
    const mins = parseDuration(v)
    if (mins) { setManualDur(mins); if (time) setEndTime(addMinutes(time, mins)) }
    else if (!v.trim()) setManualDur(spanDur || null)
  }
  const commitDurText = () => {
    if (parseDuration(durText)) setDurText('')   // parsed already applied it
  }
  // If they set/adjust the start after choosing a length, keep it by shifting
  // the end along with it (feels like "move the block").
  const onStartChange = (v) => {
    const keep = durationMins
    setTime(v)
    if (v && keep) setEndTime(addMinutes(v, keep))
  }

  // ── Duration-preset editing (persisted per-device) ───────────
  const addPreset = () => {
    const mins = parseDuration(newPreset)
    if (!mins) return
    setPresets(setDurationPresets([...presets, mins]))
    setNewPreset('')
  }
  const removePreset = (mins) => setPresets(setDurationPresets(presets.filter(p => p !== mins)))
  const resetPresets = () => setPresets(resetDurationPresets())

  // ── Location helpers ─────────────────────────────────────────
  const useCurrentLocation = async () => {
    setLocErr(''); setLocBusy(true)
    try {
      const { lat, lng } = await getCurrentLocation()
      setLocation(prev => ({ name: prev?.name || '', radius: prev?.radius || DEFAULT_RADIUS_M, lat, lng }))
    } catch (e) {
      setLocErr(e && e.code === 1 ? 'Location permission denied. Allow it to tag a place.' : 'Couldn’t get your location. Try again.')
    } finally { setLocBusy(false) }
  }
  const setLocName   = (name) => setLocation(prev => ({ ...(prev || { radius: DEFAULT_RADIUS_M }), name }))
  const setLocRadius = (radius) => setLocation(prev => prev ? { ...prev, radius } : prev)
  const clearLocation = () => { setLocation(null); setLocErr('') }
  const locHasCoords = !!(location && typeof location.lat === 'number' && typeof location.lng === 'number')

  const toggleLead = (mins) => {
    // Choosing a specific lead switches this item off the global defaults.
    if (useDefault) { setUseDefault(false); setReminders([mins]); return }
    setReminders(prev => prev.includes(mins) ? prev.filter(m => m !== mins) : [...prev, mins].sort((a,b)=>b-a))
  }
  const chooseDefault = () => { setUseDefault(true); setReminders([]) }

  const submit = (scope) => {
    if (!canSave) return
    // Editing just THIS occurrence of a series → detach it: the parent hides the
    // series on this date and drops in a one-off commitment with the edits. The
    // other days of the series are untouched.
    if (canEditOccurrence && scope === 'occurrence') {
      const primaryCatId = effectiveCats[0] || null
      const occ = {
        id: 'occ-' + rec.id + '-' + occurrenceDate,
        text: label.trim(),
        date: occurrenceDate,
        time: time || null,
        durationMins: durationMins || null,
        cat: primaryCatId,
        cats: effectiveCats,
        color: color || null,
        icon: effectiveIcon || null,
        description: description.trim() || '',
        subtasks,
        done: false,
        block: block || false,
        location: locHasCoords ? { name: (location.name || '').trim(), lat: location.lat, lng: location.lng, radius: location.radius || DEFAULT_RADIUS_M } : null,
        createdAt: new Date().toISOString(),
      }
      setItemSound(occ.id, sound)
      onSaveOccurrence(occurrenceDate, occ, useDefault ? null : reminders)
      onClose()
      return
    }
    // Repeating → create a recurring template (Recurring tab format) rather than
    // a single commitment. It carries its time in the label prefix ('today'
    // type) so it lands on the timeline; category, note, start/end date and the
    // repeat rule (freq/interval/day-of-month) come along too. Duration and
    // subtasks aren't part of the recurring schema.
    if (repeatOn && onSaveRecurring) {
      const primaryCatId = effectiveCats[0] || null
      const startDate = date || localTodayStr()
      const recurringTask = {
        id: isRecEdit ? rec.id : ('r-' + Date.now()),
        type: 'today',
        freq: repeatFreq,
        interval: Math.max(1, repeatInterval),
        days: repeatFreq === 'weekly' ? WEEKDAY_ORDER.filter(d => repeatDays.includes(d)) : [],
        monthDay: repeatFreq === 'monthly' ? parseInt(startDate.slice(8, 10), 10) : null,
        cat: primaryCatId,
        tag: primaryCatId,
        label: time ? `${fmt12(time)} — ${label.trim()}` : label.trim(),
        note: description.trim() || '',
        durationMins: durationMins || null,
        routine: routine || null,
        icon: effectiveIcon || null,
        color: color || null,
        block: block || false,
        startDate,
        endDate: repeatEnd || null,
      }
      onSaveRecurring(recurringTask)
      // Converting an existing one-off into a series → remove the original
      // single task so it isn't duplicated alongside the new recurring one.
      if (isEdit && !isRecEdit && existing && onDelete) onDelete(existing)
      onClose()
      return
    }
    // A recurring-edit modal only provides onSaveRecurring. If we reach here
    // with no onSave (e.g. the user cleared the repeat rule in a rec-edit),
    // there's nothing to commit — just close.
    if (!onSave) { onClose(); return }
    const base = existing
      ? { ...existing }
      : { id: 'c-' + Date.now(), prepMin: null, person: null, done: false, createdAt: new Date().toISOString() }
    const commitment = {
      ...base,
      text: label.trim(),
      date: date || null,
      time: time || null,
      durationMins: durationMins || null,
      cat: effectiveCats[0] || null,
      cats: effectiveCats,
      color: color || null,
      icon: effectiveIcon || null,
      description: description.trim() || '',
      subtasks,
      // An arrival location, if tagged. Preserve any prior startedAt so editing
      // the task doesn't wipe an in-progress arrival.
      location: locHasCoords ? { name: (location.name || '').trim(), lat: location.lat, lng: location.lng, radius: location.radius || DEFAULT_RADIUS_M } : null,
      startedAt: existing?.startedAt ?? null,
      block,
    }
    setItemSound(commitment.id, sound)
    // null → use global defaults; otherwise this item's own lead-minute list.
    onSave(commitment, useDefault ? null : reminders, isEdit)
    onClose()
  }

  // Primary label drives the header color + icon. With no label (and no
  // prediction), fall back to a neutral slate rather than borrowing a real
  // category's color — an unlabeled task shouldn't look tagged.
  const primaryCat = cats.find(c => c.id === effectiveCats[0]) || null
  const headerColor = color || primaryCat?.color || UNLABELED_COLOR
  // Foreground that stays readable on the header band — dark on light colors,
  // light on dark ones — with matching muted/hairline/button tints.
  const headerFg   = iconColorOn(headerColor)
  const onLight    = headerFg !== '#FFFFFF'
  const headerSub  = onLight ? 'rgba(0,0,0,.6)'  : 'rgba(255,255,255,.9)'
  const headerHair = onLight ? 'rgba(0,0,0,.28)' : 'rgba(255,255,255,.45)'
  const headerBtnBg= onLight ? 'rgba(0,0,0,.10)' : 'rgba(255,255,255,.26)'
  // The task's shown icon: explicit/suggested, else the label's, else a letter.
  const shownIcon = effectiveIcon || primaryCat?.icon || ''
  const isCustomColor = !!color && !TASK_COLORS.includes(color)
  const labelNames = effectiveCats.map(id => (cats.find(c => c.id === id)?.label) || id)
  const card = { background:'white', borderRadius:16, boxShadow:'0 1px 4px rgba(60,72,88,.06)', marginBottom:16, overflow:'hidden' }
  // Spell out the actual lead times so the row tells you when you'll be
  // reminded — "1 day & 1 hour before" — instead of an opaque "Default".
  const baseRemind = useDefault
    ? defaultLeadsLabel()
    : (reminders.length ? reminders.slice().sort((a,b)=>b-a).map(leadLabel).join(', ') + ' before' : 'No alerts')
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
              style={{ width:34, height:34, borderRadius:'50%', border:'none', background:headerBtnBg, color:headerFg, fontSize:16, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>✕</button>
            <span style={{ fontSize:11, letterSpacing:1.5, textTransform:'uppercase', color:headerSub, fontWeight:600 }}>{(isEdit || isRecEdit) ? 'Edit' : title}</span>
            {hasMenu ? (
              <button onClick={() => setMenuOpen(o => !o)} aria-label="More actions"
                style={{ width:34, height:34, borderRadius:'50%', border:'none', background:headerBtnBg, color:headerFg, fontSize:18, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', lineHeight:1, paddingBottom:4 }}>⋯</button>
            ) : <span style={{ width:34 }} />}
            {menuOpen && (
              <>
                <div onClick={() => setMenuOpen(false)} style={{ position:'fixed', inset:0, zIndex:5 }} />
                <div style={{ position:'absolute', top:42, right:0, zIndex:6, background:'white', borderRadius:14, boxShadow:'0 12px 40px rgba(20,30,45,.28)', overflow:'hidden', minWidth:196, paddingTop:4, paddingBottom:4 }}>
                  {onDuplicate && <MenuRow icon={<DupIcon />} label="Duplicate" onClick={() => runMenu(onDuplicate)} />}
                  {onMoveToInbox && <MenuRow icon={<InboxIcon2 />} label="Move to Inbox" onClick={() => runMenu(onMoveToInbox)} />}
                  {(onDelete || canScopedDelete) && <div style={{ height:1, background:'#EEEAF1', margin:'4px 0' }} />}
                  {/* For a recurring event the delete scope is chosen right here in
                      the menu — no intermediate popup. */}
                  {canScopedDelete ? <>
                    {onDeleteOccurrence && <MenuRow icon={<TrashIcon2 />} label="Delete this event" danger onClick={() => { setMenuOpen(false); onClose(); onDeleteOccurrence(occurrenceDate) }} />}
                    {onDeleteFuture && <MenuRow icon={<TrashIcon2 />} label="Delete this & all future" danger onClick={() => { setMenuOpen(false); onClose(); onDeleteFuture(occurrenceDate) }} />}
                    {onDelete && <MenuRow icon={<TrashIcon2 />} label="Delete all events" danger onClick={() => { setMenuOpen(false); onClose(); onDelete(existing || rec) }} />}
                  </> : (onDelete && <MenuRow icon={<TrashIcon2 />} label="Delete" danger onClick={() => runMenu(onDelete)} />)}
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
                  <span style={{ position:'absolute', left:0, right:0, bottom:0, height:`${fill.frac * 100}%`, background: onLight ? 'rgba(0,0,0,.14)' : 'rgba(255,255,255,.4)', transition:'height .5s ease' }} />
                )}
                <span style={{ position:'relative', display:'flex' }}>
                  {shownIcon
                    ? <Icon value={shownIcon} size={26} color={headerFg} />
                    : <span style={{ color:headerFg, fontSize:24, fontWeight:700 }}>{(label.trim()[0] || '?').toUpperCase()}</span>}
                </span>
              </button>
              <span onClick={() => setShowColorIcon(true)}
                style={{ position:'absolute', bottom:-5, left:-5, width:24, height:24, borderRadius:'50%', background:'white', boxShadow:'0 1px 4px rgba(0,0,0,.25)', display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer' }}>
                <span style={{ fontSize:13, lineHeight:1 }}>🎨</span>
              </span>
            </div>
            <div style={{ flex:1, minWidth:0 }}>
              {timeProg
                ? <div style={{ fontSize:12.5, color:headerSub, fontWeight:600, marginBottom:1 }}>{timeProg.remaining}m remaining</div>
                : (time && <div style={{ fontSize:12.5, color:headerSub, fontWeight:600, marginBottom:1 }}>{fmt12(time)}{endTime && durationMins ? ` – ${fmt12(endTime)}` : ''}</div>)}
              <input value={label} onChange={e => setLabel(e.target.value)} placeholder={block ? 'Name this block (e.g. Work)' : "What's happening?"} autoFocus={!isEdit}
                onKeyDown={e => e.key === 'Enter' && canSave && submit()}
                style={{ width:'100%', background:'transparent', border:'none', borderBottom:`1px solid ${headerHair}`, color:headerFg, fontSize:21, fontWeight:700, fontFamily:'DM Sans,sans-serif', outline:'none', padding:'3px 0' }} />
            </div>
          </div>
          {timeProg && (
            <button type="button" onClick={() => setFocusOpen(true)}
              style={{ marginTop:16, width:'100%', padding:'13px', borderRadius:16, border:'none', background:headerBtnBg, color:headerFg, fontWeight:700, fontSize:15, cursor:'pointer', fontFamily:'DM Sans,sans-serif', display:'flex', alignItems:'center', justifyContent:'center', gap:9 }}>
              <TargetIcon /> Focus Now
            </button>
          )}
        </div>

        <div style={{ padding:'16px 14px calc(20px + env(safe-area-inset-bottom))' }}>
          {/* ── Scheduling rows ───────────────────────────────── */}
          <div style={card}>
            {/* Time block toggle — turns this into a labeled background container */}
            {(!!onSave || !!onSaveRecurring) && <>
              <div style={{ display:'flex', alignItems:'center', gap:12, padding:'13px 15px' }}>
                <IconCircle color={ROW_ACCENT}><BlockIcon /></IconCircle>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:15, fontWeight:500, color:'var(--text)' }}>Time block</div>
                  <div style={{ fontSize:11, color:'var(--muted)', marginTop:1, lineHeight:1.35 }}>A labeled band behind the day (e.g. Work). Tasks scheduled inside its time stay normal.</div>
                </div>
                <button type="button" onClick={() => setBlock(b => !b)} aria-pressed={block}
                  style={{ width:46, height:27, borderRadius:14, border:'none', cursor:'pointer', padding:3, flexShrink:0, background: block ? 'var(--forest)' : '#CBD2DA', transition:'background .2s', display:'flex', justifyContent: block ? 'flex-end' : 'flex-start' }}>
                  <span style={{ width:21, height:21, borderRadius:'50%', background:'white', boxShadow:'0 1px 3px rgba(0,0,0,.28)' }} />
                </button>
              </div>
              <RowDivider />
            </>}
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
            <DetailRow icon={<ClockIcon />}
              text={time ? `${fmt12(time)}${endTime && durationMins ? ' – '+fmt12(endTime) : ''}` : (durationMins ? `${prettyDur(durationMins)} · no start time` : 'Add a time')}
              textMuted={!time && !durationMins}
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
              {/* Duration presets + a manual entry. Presets fill the length (and
                  the end time, when a start is set); the field takes anything
                  like "90", "1h30", "45 min". Both work with or without a start. */}
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:6 }}>
                <div style={fieldLabel}>Duration</div>
                <button type="button" onClick={() => setEditingPresets(e => !e)}
                  style={{ fontSize:10.5, fontWeight:700, letterSpacing:.4, border:'none', background:'none', cursor:'pointer', color:'var(--teal)', padding:0 }}>
                  {editingPresets ? 'Done' : 'Edit'}
                </button>
              </div>
              <div style={{ display:'flex', gap:6, flexWrap:'wrap', alignItems:'center' }}>
                {presets.map(mins => {
                  const on = durationMins === mins
                  return (
                    <span key={mins} style={{ position:'relative', display:'inline-flex' }}>
                      <button onClick={() => editingPresets ? removePreset(mins) : applyDuration(mins)}
                        style={{ fontSize:11, padding:'4px 11px', borderRadius:16, cursor:'pointer', fontFamily:'DM Sans,sans-serif', fontWeight:600,
                          border: on && !editingPresets ? 'none' : '1px solid var(--border)',
                          background: editingPresets ? '#FDECEC' : (on ? 'var(--teal)' : 'white'),
                          color: editingPresets ? '#DC2626' : (on ? 'white' : 'var(--muted)') }}>
                        {editingPresets ? '✕ ' : ''}{durationLabel(mins)}
                      </button>
                    </span>
                  )
                })}
                {editingPresets && (
                  <button onClick={resetPresets} style={{ fontSize:10.5, padding:'4px 10px', borderRadius:16, cursor:'pointer', fontFamily:'DM Sans,sans-serif', fontWeight:600, border:'1px dashed var(--border)', background:'white', color:'var(--muted)' }}>
                    Reset
                  </button>
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
                  <input value={durText} onChange={e => onDurTextChange(e.target.value)} onBlur={commitDurText}
                    placeholder="Or type a duration — 90, 1h30, 45 min"
                    style={{ ...inp, flex:1, fontSize:12.5 }} />
                  {durationMins > 0 && (
                    <button onClick={() => { setManualDur(null); setDurText(''); setEndTime('') }}
                      style={{ fontSize:11, padding:'0 12px', borderRadius:10, border:'1px solid var(--border)', background:'white', color:'var(--muted)', cursor:'pointer', fontFamily:'DM Sans,sans-serif', fontWeight:600, whiteSpace:'nowrap' }}>Clear</button>
                  )}
                </div>
              )}
              <div style={{ fontSize:11, color: endInvalid ? '#DC2626' : 'var(--muted)', marginTop:8 }}>
                {endInvalid ? 'End time must be after the start time.'
                  : durationMins ? `${prettyDur(durationMins)} long${!time ? ' · add a start time to place it on the timeline' : ''}`
                  : 'Tap a preset or type a length. Add a start time to also set the end.'}
              </div>
            </DetailRow>
            {canRepeat && <>
              <RowDivider />
              {/* Repeat — turns this into a recurring task shown on every matching day */}
              <DetailRow icon={<RepeatIcon />} text={repeatRowSummary} textMuted={!repeatOn}
                hint={repeatOn ? 'On' : null} open={expanded==='repeat'} onClick={() => toggleRow('repeat')}>
                {/* Once / Daily / Weekly / Monthly */}
                <div style={{ display:'flex', gap:4, padding:4, borderRadius:12, background:'#EAE7EE', marginBottom: repeatOn ? 14 : 0 }}>
                  {((defaultRepeat || isRecEdit) ? [['daily','Daily'],['weekly','Weekly'],['monthly','Monthly']] : [['once','Once'],['daily','Daily'],['weekly','Weekly'],['monthly','Monthly']]).map(([v,l]) => {
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
                  {/* Routine group — files this under a Morning/Night (or custom)
                      routine, groups it in the Recurring tab, and tints its
                      timeline block with the routine's film. */}
                  {routines.length > 0 && <>
                    <div style={{ fontSize:10, color:'var(--muted)', letterSpacing:1, textTransform:'uppercase', margin:'16px 0 8px' }}>Routine</div>
                    <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
                      <button onClick={() => setRoutine('')}
                        style={{ fontSize:12, padding:'7px 13px', borderRadius:16, cursor:'pointer', fontFamily:'DM Sans,sans-serif', fontWeight:600,
                          border: routine ? '1px solid var(--border)' : '1.5px solid var(--forest)',
                          background: routine ? 'white' : 'var(--forest)', color: routine ? 'var(--muted)' : 'var(--green-light)' }}>None</button>
                      {routines.map(r => {
                        const on = routine === r.id
                        return (
                          <button key={r.id} onClick={() => setRoutine(r.id)}
                            style={{ display:'inline-flex', alignItems:'center', gap:6, fontSize:12, padding:'7px 13px', borderRadius:16, cursor:'pointer', fontFamily:'DM Sans,sans-serif', fontWeight:600,
                              border: on ? `1.5px solid ${r.tint}` : '1px solid var(--border)',
                              background: on ? r.tint : 'white', color: on ? '#3A3A3A' : 'var(--muted)' }}>
                            <span style={{ width:10, height:10, borderRadius:'50%', background:r.tint, boxShadow: on ? 'inset 0 0 0 1px rgba(0,0,0,.15)' : 'none', flexShrink:0 }} />
                            {r.name}
                          </button>
                        )
                      })}
                    </div>
                  </>}
                </>}
              </DetailRow>
            </>}
            <RowDivider />
            {/* Labels — no blind default: unlabeled until you pick one or the
                title matches your past tasks well enough to predict one. */}
            <DetailRow icon={<TagIcon />} iconColor={effectiveCats.length ? headerColor : '#B7BEC8'}
              text={labelNames.length ? labelNames.join(', ') : 'No label'} textMuted={!labelNames.length}
              hint={usingPrediction ? 'Predicted' : (effectiveCats.length > 1 ? `${effectiveCats.length}` : null)}
              open={expanded==='labels'} onClick={() => toggleRow('labels')}>
              <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
                {cats.map(c => {
                  const on = effectiveCats.includes(c.id)
                  const primary = effectiveCats[0] === c.id
                  return (
                    <button key={c.id} onClick={() => toggleCat(c.id)}
                      style={{ fontSize:11, padding:'5px 12px', borderRadius:20, border: on ? 'none' : '1px solid var(--border)', background: on ? c.color : 'white', color: on ? 'white' : 'var(--muted)', cursor:'pointer', fontFamily:'DM Sans,sans-serif', fontWeight: on ? 600 : 400, boxShadow: primary ? '0 0 0 2px rgba(0,0,0,.16)' : 'none' }}>
                      {on ? '✓ ' : ''}{c.label}
                    </button>
                  )
                })}
              </div>
              {usingPrediction && (
                <div style={{ fontSize:10.5, color:'var(--muted)', marginTop:7 }}>Predicted from your past tasks — tap to change, or tap it again to leave this task unlabeled.</div>
              )}
              {!effectiveCats.length && !usingPrediction && (
                <div style={{ fontSize:10.5, color:'var(--muted)', marginTop:7 }}>Optional — leave it unlabeled, or pick a label above.</div>
              )}
              {effectiveCats.length > 1 && (
                <div style={{ fontSize:10.5, color:'var(--muted)', marginTop:7 }}>The outlined label is the primary — it sets the color and scheduling.</div>
              )}
            </DetailRow>
            <RowDivider />
            {/* Color */}
            <DetailRow icon={<span style={{ width:15, height:15, borderRadius:'50%', background:headerColor }} />} iconColor={headerColor}
              text="Color" hint={color ? 'Custom' : 'From label'} open={expanded==='color'} onClick={() => toggleRow('color')}>
              <ColorSwatchRow value={color} onChange={setColor} size={28} />
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
                {useDefault ? `Default reminders: ${defaultLeadsLabel()} (change in Settings → Reminders).`
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
            {/* Location — a place that auto-starts this task when you arrive.
                Offered for one-off commitments (not recurring templates). */}
            {!!onSave && !repeatOn && geolocationSupported() && <>
              <RowDivider />
              <DetailRow icon={<PinIcon />}
                text={locHasCoords ? (location.name?.trim() || 'Location set') : 'Add a location'} textMuted={!locHasCoords}
                hint={locHasCoords ? 'On' : null} open={expanded==='location'} onClick={() => toggleRow('location')}>
                <div style={{ fontSize:11.5, color:'var(--muted)', lineHeight:1.5, marginBottom:10 }}>
                  Tag where this happens. When you arrive, Bloom starts the task's progress automatically — no matter the time it's set for.
                </div>
                {/* Type-to-search a place — set a location without being there. */}
                <input value={locQuery} onChange={e => setLocQuery(e.target.value)} placeholder="Search a place or address…"
                  style={{ ...inp, fontSize:13, marginBottom: (locResults.length || locSearching) ? 6 : 10 }} />
                {locSearching && <div style={{ fontSize:11, color:'var(--muted)', padding:'2px 2px 8px' }}>Searching…</div>}
                {locResults.length > 0 && (
                  <div style={{ border:'1px solid var(--border)', borderRadius:10, overflow:'hidden', marginBottom:10 }}>
                    {locResults.map((p, i) => (
                      <button key={i} type="button"
                        onClick={() => { setLocation({ name: p.name, lat: p.lat, lng: p.lng, radius: location?.radius || DEFAULT_RADIUS_M }); setLocQuery(''); setLocResults([]); setLocErr('') }}
                        style={{ display:'flex', alignItems:'center', gap:8, width:'100%', textAlign:'left', padding:'9px 11px', border:'none', borderTop: i ? '1px solid #F1EDF2' : 'none', background:'white', cursor:'pointer', fontFamily:'DM Sans,sans-serif', fontSize:12.5, color:'var(--text)' }}>
                        <PinIcon /><span style={{ flex:1, minWidth:0, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{p.name}</span>
                      </button>
                    ))}
                  </div>
                )}
                <div style={{ fontSize:10, color:'var(--muted)', textAlign:'center', margin:'0 0 8px' }}>or</div>
                <button type="button" onClick={useCurrentLocation} disabled={locBusy}
                  style={{ width:'100%', padding:'10px', borderRadius:10, border: locHasCoords ? '1px solid var(--border)' : 'none', background: locHasCoords ? 'white' : 'var(--forest)', color: locHasCoords ? 'var(--text)' : 'var(--green-light)', fontWeight:600, fontSize:13, cursor: locBusy ? 'default' : 'pointer', fontFamily:'DM Sans,sans-serif', display:'flex', alignItems:'center', justifyContent:'center', gap:8 }}>
                  <PinIcon />{locBusy ? 'Getting location…' : (locHasCoords ? 'Update to my current location' : 'Use my current location')}
                </button>
                {locErr && <div style={{ fontSize:10.5, color:'#DC2626', marginTop:8 }}>{locErr}</div>}
                {locHasCoords && <>
                  <div style={{ fontSize:10, color:'var(--muted)', letterSpacing:1, textTransform:'uppercase', margin:'14px 0 4px' }}>Name</div>
                  <input value={location.name || ''} onChange={e => setLocName(e.target.value)} placeholder="e.g. Gym, Office, Library"
                    style={{ ...inp, fontSize:13 }} />
                  <div style={{ fontSize:10.5, color:'var(--muted)', marginTop:6 }}>
                    Pinned at {location.lat.toFixed(4)}, {location.lng.toFixed(4)}.
                  </div>
                  <div style={{ fontSize:10, color:'var(--muted)', letterSpacing:1, textTransform:'uppercase', margin:'14px 0 6px' }}>Arrival radius</div>
                  <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
                    {[100, 150, 300, 500].map(r => {
                      const on = (location.radius || DEFAULT_RADIUS_M) === r
                      return (
                        <button key={r} onClick={() => setLocRadius(r)}
                          style={{ fontSize:11, padding:'5px 12px', borderRadius:16, cursor:'pointer', fontFamily:'DM Sans,sans-serif', fontWeight:600, border: on ? 'none' : '1px solid var(--border)', background: on ? 'var(--forest)' : 'white', color: on ? 'var(--green-light)' : 'var(--muted)' }}>
                          {on ? '✓ ' : ''}{r} m
                        </button>
                      )
                    })}
                  </div>
                  <button onClick={clearLocation}
                    style={{ marginTop:12, fontSize:11, padding:'5px 12px', borderRadius:16, cursor:'pointer', fontFamily:'DM Sans,sans-serif', fontWeight:600, border:'1px solid var(--border)', background:'white', color:'var(--muted)' }}>
                    Remove location
                  </button>
                </>}
              </DetailRow>
            </>}
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
          {/* For a single occurrence of a series, saving asks whether to apply
              the change to just this event or the whole series. */}
          <button onClick={() => canEditOccurrence ? setScopePrompt(true) : submit()} disabled={!canSave}
            style={{ width:'100%', padding:'14px', borderRadius:14, border:'none', background: canSave ? headerColor : '#E1E1E6', color: canSave ? 'white' : '#9CA3AF', cursor: canSave ? 'pointer' : 'default', fontFamily:'DM Sans,sans-serif', fontWeight:700, fontSize:15, letterSpacing:.3 }}>
            {(isEdit || isRecEdit) ? 'Save changes' : (block ? 'Add time block' : (repeatOn ? 'Add recurring task' : title))}
          </button>
        </div>
      </div>

      {/* Save-time chooser for a single occurrence of a recurring series. */}
      {scopePrompt && (
        <div onClick={() => setScopePrompt(false)}
          style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.5)', zIndex:700, display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}>
          <div onClick={e => e.stopPropagation()}
            style={{ background:'white', borderRadius:18, padding:20, maxWidth:330, width:'100%', boxShadow:'0 24px 64px rgba(0,0,0,.3)' }}>
            <div className="serif" style={{ fontSize:17, fontWeight:600, color:'var(--text)', marginBottom:6 }}>Save changes to…</div>
            <div style={{ fontSize:13, color:'var(--muted)', marginBottom:16, lineHeight:1.5 }}>This is a repeating event. Update only this one, or every occurrence?</div>
            <div style={{ display:'flex', flexDirection:'column', gap:9 }}>
              <button type="button" onClick={() => { setScopePrompt(false); submit('occurrence') }}
                style={{ padding:'12px', borderRadius:12, border:'none', background: headerColor, color:'white', cursor:'pointer', fontFamily:'DM Sans,sans-serif', fontWeight:700, fontSize:14 }}>Just this event</button>
              <button type="button" onClick={() => { setScopePrompt(false); submit('series') }}
                style={{ padding:'12px', borderRadius:12, border:'1px solid var(--border)', background:'white', color:'var(--text)', cursor:'pointer', fontFamily:'DM Sans,sans-serif', fontWeight:700, fontSize:14 }}>Apply to all events</button>
              <button type="button" onClick={() => setScopePrompt(false)}
                style={{ padding:'9px', borderRadius:12, border:'none', background:'none', color:'var(--muted)', cursor:'pointer', fontFamily:'DM Sans,sans-serif', fontSize:13 }}>Cancel</button>
            </div>
          </div>
        </div>
      )}

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
