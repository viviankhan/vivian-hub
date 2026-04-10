// src/data/schedule.js
// ─────────────────────────────────────────────────────────────
// THIS IS THE ONLY FILE CLAUDE EDITS FOR SCHEDULE CHANGES.
// Never touch App.jsx or component files for schedule updates.
//
// WEEK_PLAN is now DYNAMIC — always today → today+6.
// Tasks are keyed by day-of-week name so IDs stay stable
// across weeks (no storage breakage).
// One-off tasks (deadlines, appointments) go in Commitments.
// ─────────────────────────────────────────────────────────────

// ── date helpers ───────────────────────────────────────────────
const DAY_NAMES   = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday']
const DAY_SHORT   = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']
const MONTH_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

function toDateStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}
function toDayLabel(d) {
  return `${DAY_SHORT[d.getDay()]} ${MONTH_SHORT[d.getMonth()]} ${d.getDate()}`
}

// ── FIXED DAILY BLOCKS (used by smart scheduler) ──────────────
export const FIXED_BLOCKS = {
  monday: [
    { start: '08:00', end: '10:20', label: 'Yeast lab' },
    { start: '09:50', end: '11:00', label: 'Coral Reef — Youngchild 316' },
    { start: '11:00', end: '11:50', label: 'Yeast lab' },
    { start: '12:00', end: '12:45', label: 'Lunch at Commons' },
    { start: '12:55', end: '15:00', label: 'Yeast lab' },
    { start: '15:10', end: '16:20', label: 'Capstone II — Steitz 202' },
    { start: '16:30', end: '17:15', label: 'Dinner at Commons' },
    { start: '19:00', end: '21:00', label: 'Call with Aidan' },
    { start: '21:00', end: '21:20', label: 'Research log + wind down begins' },
    { start: '22:30', end: '06:00', label: 'Sleep' },
  ],
  tuesday: [
    { start: '08:00', end: '10:20', label: 'Yeast lab' },
    { start: '10:25', end: '12:10', label: 'Ecological Energetics — Youngchild 316' },
    { start: '12:20', end: '13:00', label: 'Lunch at Commons' },
    { start: '13:00', end: '17:00', label: 'Yeast lab' },
    { start: '16:30', end: '17:15', label: 'Dinner at Commons' },
    { start: '19:00', end: '21:00', label: 'Call with Aidan' },
    { start: '21:00', end: '21:20', label: 'Research log + wind down begins' },
    { start: '22:30', end: '06:00', label: 'Sleep' },
  ],
  wednesday: [
    { start: '08:00', end: '09:45', label: 'Yeast lab' },
    { start: '09:50', end: '11:00', label: 'Coral Reef — Youngchild 316' },
    { start: '11:00', end: '11:50', label: 'Yeast lab' },
    { start: '12:00', end: '12:45', label: 'Lunch at Commons' },
    { start: '12:55', end: '16:20', label: 'Yeast lab' },
    { start: '16:30', end: '17:15', label: 'Dinner at Commons' },
    { start: '19:00', end: '21:00', label: 'Call with Aidan' },
    { start: '21:00', end: '21:20', label: 'Research log + wind down begins' },
    { start: '22:30', end: '06:00', label: 'Sleep' },
  ],
  thursday: [
    { start: '08:00', end: '09:45', label: 'Yeast lab' },
    { start: '10:25', end: '12:10', label: 'Ecological Energetics — Youngchild 316' },
    { start: '12:20', end: '12:50', label: 'Lunch at Commons' },
    { start: '13:00', end: '16:00', label: 'Coral Reef Lab — Youngchild 321' },
    { start: '16:30', end: '17:15', label: 'Dinner at Commons' },
    { start: '17:15', end: '18:30', label: 'Yeast lab' },
    { start: '19:00', end: '21:00', label: 'Call with Aidan' },
    { start: '21:00', end: '21:20', label: 'Research log + wind down begins' },
    { start: '22:30', end: '06:00', label: 'Sleep' },
  ],
  friday: [
    { start: '08:00', end: '09:45', label: 'Yeast lab' },
    { start: '09:50', end: '11:00', label: 'Coral Reef — Youngchild 316' },
    { start: '11:00', end: '11:50', label: 'Yeast lab' },
    { start: '12:00', end: '12:45', label: 'Lunch at Commons' },
    { start: '12:55', end: '16:20', label: 'Yeast lab' },
    { start: '16:30', end: '17:15', label: 'Dinner at Commons' },
    { start: '19:00', end: '21:00', label: 'Call with Aidan' },
    { start: '21:00', end: '21:20', label: 'Research log + wind down begins' },
    { start: '22:30', end: '06:00', label: 'Sleep' },
  ],
  saturday: [
    { start: '09:00', end: '12:00', label: 'Yeast lab' },
    { start: '12:00', end: '12:45', label: 'Lunch at Commons' },
    { start: '16:30', end: '17:15', label: 'Dinner at Commons' },
    { start: '19:00', end: '21:00', label: 'Call with Aidan' },
    { start: '22:30', end: '08:30', label: 'Sleep (weekend)' },
  ],
  sunday: [
    { start: '09:00', end: '09:30', label: 'Breakfast at Commons' },
    { start: '10:00', end: '12:00', label: 'Yeast lab (if needed)' },
    { start: '12:00', end: '12:45', label: 'Lunch at Commons' },
    { start: '16:30', end: '17:15', label: 'Dinner at Commons' },
    { start: '19:00', end: '21:00', label: 'Call with Aidan' },
    { start: '22:30', end: '08:30', label: 'Sleep (weekend)' },
  ],
}

export function getFixedBlocksForDate(date) {
  const dayName = DAY_NAMES[date.getDay()]
  return FIXED_BLOCKS[dayName] || []
}

// ── RECURRING WEEKLY TASKS (by day name) ──────────────────────
// These appear in This Week every week. IDs are stable (mon-X etc.)
// so toggle state persists correctly across week rollovers.
// Add one-off tasks via the Commitments panel.
export const DEFAULT_RECURRING_TASKS = {
  monday: [
    { id:'mon-coral',    text:'Coral Reef class — Youngchild 316 @ 9:50 AM', cat:'class', carry:false },
    { id:'mon-capstone', text:'Capstone II — Steitz 202 @ 3:10 PM', cat:'class', carry:false },
    { id:'mon-lab',      text:'Yeast lab (full day around classes)', cat:'lab', carry:false },
  ],
  tuesday: [
    { id:'tue-ecol',     text:'Ecological Energetics — Youngchild 316 @ 10:25 AM', cat:'class', carry:false },
    { id:'tue-lab',      text:'Yeast lab (full day around class)', cat:'lab', carry:false },
  ],
  wednesday: [
    { id:'wed-coral',    text:'Coral Reef class — Youngchild 316 @ 9:50 AM', cat:'class', carry:false },
    { id:'wed-lab',      text:'Yeast lab (full day around class)', cat:'lab', carry:false },
  ],
  thursday: [
    { id:'thu-ecol',     text:'Ecological Energetics — Youngchild 316 @ 10:25 AM', cat:'class', carry:false },
    { id:'thu-crl',      text:'Coral Reef Lab — Youngchild 321 @ 1:00 PM', cat:'class', carry:false },
    { id:'thu-lab',      text:'Yeast lab (morning + evening blocks)', cat:'lab', carry:false },
  ],
  friday: [
    { id:'fri-coral',    text:'Coral Reef class — Youngchild 316 @ 9:50 AM', cat:'class', carry:false },
    { id:'fri-lab',      text:'Yeast lab (full day around class)', cat:'lab', carry:false },
    { id:'fri-review',   text:'Weekly research log review', cat:'lab', carry:false },
  ],
  saturday: [
    { id:'sat-lab',      text:'Yeast lab 9 AM – 12 PM', cat:'lab', carry:false },
    { id:'sat-mcat',     text:'MCAT study session', cat:'career', carry:false },
    { id:'sat-errands',  text:'Laundry + errands', cat:'personal', carry:false },
  ],
  sunday: [
    { id:'sun-lab',      text:'Yeast lab (if needed, ~2 hrs)', cat:'lab', carry:false },
    { id:'sun-plan',     text:'Plan the week ahead', cat:'career', carry:false },
    { id:'sun-log',      text:'Weekly research log review', cat:'lab', carry:false },
  ],
}

// ── WEEK PLAN — dynamic today → today+6 ───────────────────────
export function buildWeekPlanFromTasks(recurringTasks) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today)
    d.setDate(today.getDate() + i)
    const dayName = DAY_NAMES[d.getDay()]
    return {
      date:     toDateStr(d),
      dayLabel: toDayLabel(d),
      tasks:    (recurringTasks[dayName] || []),
    }
  })
}

export const WEEK_PLAN = buildWeekPlanFromTasks(DEFAULT_RECURRING_TASKS)

// ── RECURRING DAILY TODOS (by day name) ───────────────────────
// Hour-by-hour schedule shown on the Today tab.
// Today.jsx calls getDailyTodos(dateKey) to get these.
export const DEFAULT_DAILY_TODOS = {
  monday: [
    { id:'mon-lab-am',   label:'8:00 AM — Yeast lab', note:'At bench by 8. Lab runs until class.', tag:'lab' },
    { id:'mon-coral',    label:'9:50 AM — Coral Reef class', note:'Youngchild 316 · leave lab by 9:40 AM', tag:'class' },
    { id:'mon-lab-mid',  label:'11:00 AM — Back to yeast lab', note:'Until lunch walk', tag:'lab' },
    { id:'mon-lunch',    label:'11:50 AM — Walk to Commons, lunch', note:'~10 min walk', tag:'health' },
    { id:'mon-lab-pm',   label:'12:55 PM — Yeast lab (afternoon block)', note:'Until Capstone', tag:'lab' },
    { id:'mon-capstone', label:'3:10 PM — Capstone II', note:'Steitz 202 · leave lab by 3:00 PM', tag:'class' },
    { id:'mon-dinner',   label:'4:30 PM — Dinner at Commons', note:'Leave lab 4:20 PM', tag:'health' },
    { id:'mon-aidan',    label:'7:00 PM — Call with Aidan', note:'Real rest. Ends by 9 PM.', tag:'personal' },
    { id:'mon-log',      label:'9:20 PM — Research log', note:'3–5 sentences: what you ran, what comes next', tag:'lab' },
    { id:'mon-screens',  label:'9:35 PM — Screens off → wind down → sleep 10:30 PM', note:'Lay out Tuesday outfit + bag. Skincare PM.', tag:'sleep' },
  ],
  tuesday: [
    { id:'tue-lab-am',   label:'8:00 AM — Yeast lab', note:'At bench by 8.', tag:'lab' },
    { id:'tue-ecol',     label:'10:25 AM — Ecological Energetics', note:'Youngchild 316 · leave lab by 10:15 AM', tag:'class' },
    { id:'tue-lunch',    label:'12:20 PM — Walk to Commons, lunch', note:'~10 min walk', tag:'health' },
    { id:'tue-lab-pm',   label:'1:00 PM — Yeast lab (afternoon)', note:'Continue until dinner', tag:'lab' },
    { id:'tue-dinner',   label:'4:30 PM — Dinner at Commons', note:'Leave lab 4:20 PM', tag:'health' },
    { id:'tue-walk',     label:'5:15 PM — 20 min walk', note:'Tuesday workout', tag:'fitness' },
    { id:'tue-aidan',    label:'7:00 PM — Call with Aidan', note:'Real rest. Ends by 9 PM.', tag:'personal' },
    { id:'tue-log',      label:'9:20 PM — Research log', note:'3–5 sentences.', tag:'lab' },
    { id:'tue-screens',  label:'9:35 PM — Screens off → wind down → sleep 10:30 PM', note:'Lay out Wednesday outfit + bag. Skincare PM.', tag:'sleep' },
  ],
  wednesday: [
    { id:'wed-lab-am',   label:'8:00 AM — Yeast lab', note:'At bench by 8. Lab runs until class.', tag:'lab' },
    { id:'wed-coral',    label:'9:50 AM — Coral Reef class', note:'Youngchild 316 · leave lab by 9:40 AM', tag:'class' },
    { id:'wed-lab-mid',  label:'11:00 AM — Back to yeast lab', note:'~50 min before lunch walk', tag:'lab' },
    { id:'wed-lunch',    label:'11:50 AM — Walk to Commons, lunch', note:'~10 min walk', tag:'health' },
    { id:'wed-lab-pm',   label:'12:55 PM — Yeast lab (afternoon block)', note:'Until dinner', tag:'lab' },
    { id:'wed-dinner',   label:'4:30 PM — Dinner at Commons', note:'Leave lab 4:20 PM', tag:'health' },
    { id:'wed-aidan',    label:'7:00 PM — Call with Aidan', note:'Real rest. Ends by 9 PM.', tag:'personal' },
    { id:'wed-log',      label:'9:20 PM — Research log', note:'3–5 sentences. What did you run today?', tag:'lab' },
    { id:'wed-screens',  label:'9:35 PM — Screens off → wind down → sleep 10:30 PM', note:'Lay out Thursday outfit + bag. Skincare PM.', tag:'sleep' },
  ],
  thursday: [
    { id:'thu-lab-am',   label:'8:00 AM — Yeast lab', note:'At bench by 8.', tag:'lab' },
    { id:'thu-ecol',     label:'10:25 AM — Ecological Energetics', note:'Youngchild 316 · leave lab by 10:15 AM', tag:'class' },
    { id:'thu-lunch',    label:'12:10 PM — Walk to Commons, lunch', note:'~10 min walk from Youngchild', tag:'health' },
    { id:'thu-crl',      label:'1:00 PM — Coral Reef Lab', note:'Youngchild 321 · 10 min walk from Commons', tag:'class' },
    { id:'thu-dinner',   label:'4:30 PM — Dinner at Commons', note:'Leave after lab', tag:'health' },
    { id:'thu-lab-pm',   label:'5:15 PM — Yeast lab (~1.5 hrs)', note:'Back to bench after dinner', tag:'lab' },
    { id:'thu-aidan',    label:'7:00 PM — Call with Aidan', note:'Real rest. Ends by 9 PM.', tag:'personal' },
    { id:'thu-log',      label:'9:20 PM — Research log', note:'3–5 sentences.', tag:'lab' },
    { id:'thu-screens',  label:'9:35 PM — Screens off → wind down → sleep 10:30 PM', note:'Lay out Friday outfit + bag. Skincare PM.', tag:'sleep' },
  ],
  friday: [
    { id:'fri-lab-am',   label:'8:00 AM — Yeast lab', note:'At bench by 8.', tag:'lab' },
    { id:'fri-coral',    label:'9:50 AM — Coral Reef class', note:'Youngchild 316 · leave lab by 9:40 AM', tag:'class' },
    { id:'fri-lab-mid',  label:'11:00 AM — Back to yeast lab', note:'~50 min block', tag:'lab' },
    { id:'fri-lunch',    label:'11:50 AM — Walk to Commons, lunch', note:'~10 min walk', tag:'health' },
    { id:'fri-lab-pm',   label:'12:55 PM — Yeast lab (afternoon block)', note:'Until dinner', tag:'lab' },
    { id:'fri-dinner',   label:'4:30 PM — Dinner at Commons', note:'Leave lab 4:20 PM', tag:'health' },
    { id:'fri-aidan',    label:'7:00 PM — Call with Aidan', note:'Real rest. Ends by 9 PM.', tag:'personal' },
    { id:'fri-log',      label:"9:20 PM — Weekly research log review", note:"What worked this week? What's next?", tag:'lab' },
    { id:'fri-screens',  label:'9:35 PM — Screens off → wind down → sleep 10:30 PM', note:'Lay out Saturday outfit + bag. Skincare PM.', tag:'sleep' },
  ],
  saturday: [
    { id:'sat-lab',      label:'9:00 AM — Yeast lab (~3 hrs)', note:'Commons opens 9 AM for breakfast first', tag:'lab' },
    { id:'sat-lunch',    label:'12:00 PM — Lunch at Commons', note:'Closes 2 PM on weekends', tag:'health' },
    { id:'sat-errands',  label:'1:00 PM — Laundry + errands', note:'Hair appointment if booked', tag:'health' },
    { id:'sat-mcat',     label:'~3:00 PM — MCAT study session', note:'One focused content block', tag:'career' },
    { id:'sat-dinner',   label:'4:30 PM — Dinner at Commons', note:'Closes 7:30 PM on weekends', tag:'health' },
    { id:'sat-aidan',    label:'7:00 PM — Call with Aidan', note:'Real rest. Ends by 9 PM.', tag:'personal' },
    { id:'sat-log',      label:'9:00 PM — Research log', note:'Weekend summary.', tag:'lab' },
    { id:'sat-screens',  label:'9:35 PM — Screens off → wind down → sleep 10:30 PM', note:'Lay out Sunday outfit. Skincare PM.', tag:'sleep' },
  ],
  sunday: [
    { id:'sun-breakfast',label:'9:00 AM — Breakfast at Commons', note:'Then lab if needed', tag:'health' },
    { id:'sun-lab',      label:'10:00 AM — Yeast lab (if needed, ~2 hrs)', note:'Optional', tag:'lab' },
    { id:'sun-lunch',    label:'12:00 PM — Lunch at Commons', note:'Closes 2 PM', tag:'health' },
    { id:'sun-plan',     label:'~3:00 PM — Plan the week ahead', note:'Review upcoming deadlines + calendar', tag:'career' },
    { id:'sun-dinner',   label:'4:30 PM — Dinner at Commons', note:'Closes 7:30 PM', tag:'health' },
    { id:'sun-aidan',    label:"7:00 PM — Call with Aidan", note:"Keep it shorter tonight — big day tomorrow.", tag:'personal' },
    { id:'sun-log',      label:'9:00 PM — Research log', note:"What did you accomplish this week? What's next?", tag:'lab' },
    { id:'sun-screens',  label:'9:35 PM — Screens off → wind down → sleep 10:30 PM', note:'Lay out Monday outfit + bag. Skincare PM.', tag:'sleep' },
  ],
}

// ── getDailyTodos — call this from Today.jsx ───────────────────
// Pass dailyTodosOverride (from DB) to use live data; omit for static defaults.
export function getDailyTodos(dateStr, dailyTodosOverride) {
  const [year, month, day] = dateStr.split('-').map(Number)
  const d = new Date(year, month - 1, day)
  const dayName = DAY_NAMES[d.getDay()]
  const source = dailyTodosOverride || DEFAULT_DAILY_TODOS
  return source[dayName] || []
}

// ── CALENDAR EVENTS ────────────────────────────────────────────
export const CALENDAR_EVENTS = [
  { date:'2026-03-30', label:'First Day of Class', type:'class' },
  { date:'2026-04-05', label:'Capstone: BioFest Survey due @ 11:59 PM', type:'deadline' },
  { date:'2026-04-06', label:'Quiz 1 — 9:50 AM in class', type:'quiz' },
  { date:'2026-04-06', label:'Capstone: Biology Dept Assessment — bring laptop', type:'capstone' },
  { date:'2026-04-13', label:'Quiz 2 — 9:50 AM in class', type:'quiz' },
  { date:'2026-04-13', label:'Capstone: Poster Design Workshop — Briggs 420 @ 3:10 PM', type:'capstone' },
  { date:'2026-04-16', label:'Coral Reef LAB: Packing boxes for transport', type:'lab' },
  { date:'2026-04-16', label:'Group Project Proposal — due 9 PM', type:'deadline' },
  { date:'2026-04-17', label:'ID Practical Quiz — 9:50 AM', type:'quiz' },
  { date:'2026-04-18', label:'🌊 DEPART BONAIRE — 1:30 AM', type:'travel' },
  { date:'2026-04-20', label:'Capstone: No class — work on poster', type:'noclass' },
  { date:'2026-04-27', label:'Capstone: Peer Review Workshop — Briggs 420 @ 3:10 PM', type:'capstone' },
  { date:'2026-04-27', label:'Honors Thesis Info Session', type:'event' },
  { date:'2026-05-03', label:'✈️ RETURN from Bonaire — 1:30 AM', type:'travel' },
  { date:'2026-05-03', label:'Capstone: Final poster → Printing Services + Canvas @ 11:59 PM', type:'deadline' },
  { date:'2026-05-04', label:'No Class (post-Bonaire)', type:'noclass' },
  { date:'2026-05-06', label:'Coral Reef: Overview of Diversity Data Analysis', type:'class' },
  { date:'2026-05-07', label:'Coral Reef LAB: Dive Buddy Transect Data', type:'lab' },
  { date:'2026-05-08', label:'Coral Reef: Dive Buddy Transect Data collection', type:'class' },
  { date:'2026-05-11', label:'Coral Reef: Dive Buddy Transect Data collection', type:'class' },
  { date:'2026-05-11', label:'Capstone: No class', type:'noclass' },
  { date:'2026-05-13', label:'Coral Reef: Dive Buddy Transect Data + Group Research Projects', type:'class' },
  { date:'2026-05-14', label:'Coral Reef LAB: No Lab — Reading Period', type:'noclass' },
  { date:'2026-05-15', label:'No Class — Reading Period', type:'noclass' },
  { date:'2026-05-15', label:'BioFest Marine Outreach — 3:30 PM (Somerset Room, Warch)', type:'event' },
  { date:'2026-05-15', label:'Capstone: Senior class photo @ 3:15 PM', type:'capstone' },
  { date:'2026-05-18', label:'Transect Data (Excel) → Canvas — due 9 AM', type:'deadline' },
  { date:'2026-05-18', label:'Coral Reef: Data Analysis Workshop', type:'class' },
  { date:'2026-05-20', label:'Coral Reef: Data Analysis Workshop', type:'class' },
  { date:'2026-05-21', label:'Coral Reef LAB: Data Analysis cont. + Group Work', type:'lab' },
  { date:'2026-05-21', label:'Guest Speaker: Sarah Severino (Coral Reef Alliance)', type:'event' },
  { date:'2026-05-22', label:'Coral Reef: Restoration — Policy & Outcomes', type:'class' },
  { date:'2026-05-22', label:'Optional Draft Diversity Paper due', type:'optional' },
  { date:'2026-05-25', label:'No Class — Memorial Day', type:'noclass' },
  { date:'2026-05-27', label:'Coral Reef: Discussion 1 — Life on the Rocks (Berwald)', type:'class' },
  { date:'2026-05-28', label:'Coral Reef LAB: Group Research Project Work', type:'lab' },
  { date:'2026-05-29', label:'Coral Reef: Discussion 2 — Life on the Rocks (Berwald)', type:'class' },
  { date:'2026-05-31', label:'Capstone: Senior Experience Reflection due', type:'deadline' },
  { date:'2026-06-01', label:'Diversity Analysis Paper — due 9 AM', type:'deadline' },
  { date:'2026-06-01', label:'Coral Reef: Group Research Project Work', type:'class' },
  { date:'2026-06-03', label:'Coral Reef: Group Research Project Work', type:'class' },
  { date:'2026-06-04', label:'Coral Reef LAB: Group Project Presentations', type:'deadline' },
  { date:'2026-06-05', label:'Group Research Paper due', type:'deadline' },
]

// ── MORNING / NIGHT ROUTINES ───────────────────────────────────
// Morning routine — times are computed from startMins + cumulative durationMins.
// Edit durationMins to change how long each step takes.
// The 'time' field is auto-computed at render — do not edit it directly.
export const MORNING_ROUTINE = [
  { habit:'Wake up',                  icon:'☀️', cat:'sleep',   durationMins:2,  detail:'Weekdays only. 7.5 hours from 10:30 PM. Weekends 8:30 AM.' },
  { habit:'16 oz water',               icon:'💧', cat:'health',  durationMins:2,  detail:'Before coffee, before phone. Non-negotiable.' },
  { habit:'Brush teeth + skincare',    icon:'✨', cat:'polish',  durationMins:10, detail:'Brush teeth, cleanser, moisturizer with SPF. CeraVe. 10 minutes.' },
  { habit:'Get dressed intentionally', icon:'👗', cat:'polish',  durationMins:5,  detail:'Laid out the night before. Well-fitted basics only. 5 minutes.' },
  { habit:'MCAT review',               icon:'📚', cat:'career',  durationMins:30, detail:'30 min. One focused concept block.' },
  { habit:'Assignment & lab review',   icon:'🗒️', cat:'career',  durationMins:15, detail:'15 min. Check what is due, what experiments are running, what needs prepping today.' },
  { habit:'Out the door',              icon:'🚪', cat:'sleep',   durationMins:26, detail:'3 min to get ready. 15 min walk to Andrew Commons.' },
  { habit:'Breakfast at Commons',      icon:'🥚', cat:'health',  durationMins:20, detail:'Load up on protein — eggs, yogurt, whatever is hot. 20 minutes.' },
  { habit:'Walk to lab',               icon:'🔬', cat:'career',  durationMins:10, detail:'10 min to get there. At bench by 8:00 AM.' },
]

export const NIGHT_ROUTINE = [
  { time:'Midday',   habit:'Abstract read',    icon:'🔬', cat:'career',  detail:'One abstract + figures from Nature Immunology, JEM, or Immunity.' },
  { time:'5:00 PM',  habit:'Workout',          icon:'🏃‍♀️', cat:'fitness', detail:'MWF: 30 min strength. TuThSa: 20 min walk.' },
  { time:'7:00 PM',  habit:'Call with Aidan',  icon:'📞', cat:'health',  detail:'1–2 hours. Real rest — not multitasking. Ends by 9 PM.' },
  { time:'9:00 PM',  habit:'Research log',     icon:'📝', cat:'career',  detail:'3–5 sentences: what you tried, what worked, what comes next.' },
  { time:'9:15 PM',  habit:'Screens off',      icon:'📵', cat:'sleep',   detail:'Hard stop. Reading, journaling, or music only.' },
  { time:'9:20 PM',  habit:'Lay out tomorrow', icon:'🗂️', cat:'polish',  detail:'Outfit + bag + breakfast plan. Morning-you will be grateful.' },
  { time:'9:30 PM',  habit:'Skincare PM',      icon:'🌙', cat:'polish',  detail:'Cleanser → retinol (3x/week) or moisturizer.' },
  { time:'9:45 PM',  habit:'Wind down',        icon:'🎹', cat:'sleep',   detail:'Piano, light reading, journaling. No career content.' },
  { time:'10:30 PM', habit:'Sleep',            icon:'💤', cat:'sleep',   detail:'7.5 hours to 6:00 AM. Protect this.' },
]
