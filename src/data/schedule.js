// src/data/schedule.js
// ─────────────────────────────────────────────────────────────
// THIS IS THE ONLY FILE CLAUDE EDITS FOR SCHEDULE CHANGES.
// Never touch App.jsx or component files for schedule updates.
// ─────────────────────────────────────────────────────────────

// ── FIXED DAILY BLOCKS (used by smart scheduler) ──────────────
// These are immovable commitments. The scheduler will never
// suggest slots that overlap with these.
export const FIXED_BLOCKS = {
  monday: [
    { start: '08:00', end: '09:45', label: 'Yeast lab' },
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
    { start: '08:00', end: '10:20', label: 'Yeast lab' },
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

const DAY_NAMES = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday']

export function getFixedBlocksForDate(date) {
  const dayName = DAY_NAMES[date.getDay()]
  return FIXED_BLOCKS[dayName] || []
}

// ── THIS WEEK PLAN ─────────────────────────────────────────────
// carry: true = task will appear in next day if not done
// These get updated by Claude when the week changes.
export const WEEK_PLAN = [
  {
    date: '2026-03-30', dayLabel: 'Mon Mar 30',
    tasks: [
      { id:'mon-thesis',  text:'Submit honors thesis statement of intent', cat:'career', carry:false },
      { id:'mon-email',   text:'Send honors conflict email to Ranger & Beth', cat:'career', carry:true },
      { id:'mon-capstone',text:'Attend Capstone II first class — Steitz 202 @ 3:10 PM', cat:'class', carry:false },
      { id:'mon-pcr',     text:'Set up and run PCR', cat:'lab', carry:false },
      { id:'mon-reading', text:'Sheppard Ch. 3.1–3.3 (pp. 68–78) — Tropical Oceanography', cat:'class', carry:true },
    ]
  },
  {
    date: '2026-03-31', dayLabel: 'Tue Mar 31',
    tasks: [
      { id:'tue-gel',     text:'Run gel + image + purification (leave in B3 during class)', cat:'lab', carry:false },
      { id:'tue-class',   text:'Ecological Energetics / Coral Structure & Anatomy — Youngchild 316 @ 10:25 AM', cat:'class', carry:false },
      { id:'tue-reading', text:'Sheppard Ch. 2.0–2.1 (pp. 35–48) — Coral Structure & Anatomy', cat:'class', carry:true },
      { id:'tue-ch4',     text:'Sheppard Ch. 4.1–4.9 (pp. 100–128) — Coral Structure cont.', cat:'class', carry:true },
      { id:'tue-id',      text:'ID study: Sponges + Cnidaria (flashcard app)', cat:'class', carry:true },
      { id:'tue-rose',    text:'Email Rose Theisen — schedule SE advisor meeting (graded, due May 1)', cat:'career', carry:true },
    ]
  },
  {
    date: '2026-04-01', dayLabel: 'Wed Apr 1',
    tasks: [
      { id:'wed-class',   text:'Coral Reef: Corals & Reef Builders — Youngchild 316 @ 9:50 AM', cat:'class', carry:false },
      { id:'wed-reading', text:'Sheppard Ch. 2.2–2.8 (pp. 48–67) — Corals & Reef Builders', cat:'class', carry:true },
      { id:'wed-id',      text:'ID study: Worms + Mollusca', cat:'class', carry:true },
    ]
  },
  {
    date: '2026-04-02', dayLabel: 'Thu Apr 2',
    tasks: [
      { id:'thu-ecol',    text:'Ecological Energetics — Youngchild 316 @ 10:25 AM', cat:'class', carry:false },
      { id:'thu-crl',     text:'Coral Reef Lab — Youngchild 321 @ 1:00 PM', cat:'class', carry:false },
      { id:'thu-reading', text:'Sheppard Ch. 1 (pp. 1–34) — Reef Building Past, Present & Future', cat:'class', carry:true },
      { id:'thu-id',      text:'ID study: Arthropods + Echinoderms', cat:'class', carry:true },
    ]
  },
  {
    date: '2026-04-03', dayLabel: 'Fri Apr 3',
    tasks: [
      { id:'fri-class',   text:'Coral Reef: Reef Zonation & Primary Producers — Youngchild 316 @ 9:50 AM', cat:'class', carry:false },
      { id:'fri-reading', text:'Sheppard Ch. 6.1–6.6 (pp. 167–180) — Reef Zonation & Primary Producers', cat:'class', carry:true },
      { id:'fri-id',      text:'ID study: Corals pt. 1 — fire, gorgonians, branching', cat:'class', carry:true },
    ]
  },
  {
    date: '2026-04-04', dayLabel: 'Sat Apr 4',
    tasks: [
      { id:'sat-lab',     text:'Yeast lab 9 AM – 12 PM', cat:'lab', carry:false },
      { id:'sat-id',      text:'ID study: Corals pt. 2 — brain, boulder, fleshy', cat:'class', carry:true },
      { id:'sat-mcat',    text:'MCAT study session', cat:'career', carry:false },
      { id:'sat-hair',    text:'Book hair appointment', cat:'personal', carry:true },
    ]
  },
  {
    date: '2026-04-05', dayLabel: 'Sun Apr 5',
    tasks: [
      { id:'sun-biofest', text:'BioFest survey due @ 11:59 PM — submit on Canvas', cat:'urgent', carry:false },
      { id:'sun-id',      text:'ID study: Fish families — butterflies, angels, snappers', cat:'class', carry:true },
      { id:'sun-plan',    text:'Plan the week ahead (Quiz 1 is Monday)', cat:'career', carry:false },
    ]
  },
]

// ── DAILY TODO SCHEDULES ───────────────────────────────────────
// Maps YYYY-MM-DD → ordered list of checkable items for the day.
// Claude only edits this object — never the Today component.
export const DAILY_TODOS = {
  '2026-03-31': [
    { id:'breakfast',   label:'Breakfast at Commons', note:'Get there before 9 AM closes', tag:'health' },
    { id:'tue-class',   label:'10:25 AM — Ecological Energetics / Coral Structure & Anatomy', note:'Youngchild 316 · leave by 10:10 AM', tag:'class' },
    { id:'tue-gel',     label:'12:20 PM — Run gel + image', note:'Straight to lab after class', tag:'lab' },
    { id:'purif-start', label:'Start purification — leave in B3', note:'~3 hrs total · leave in B3 while at lunch', tag:'lab' },
    { id:'tue-reading', label:'~12:30 PM — Sheppard Ch. 2.0–2.1 (pp. 35–48)', note:'Coral Structure & Anatomy · during purification wait', tag:'class' },
    { id:'mon-reading', label:'~1:00 PM — Sheppard Ch. 3.1–3.3 (pp. 68–78)', note:'Tropical Oceanography · carried from Monday', tag:'carried' },
    { id:'lunch',       label:'~1:10 PM — Lunch at Commons', note:'Walk over · full hour', tag:'health' },
    { id:'purif-finish',label:'~2:10 PM — Back to bench, finish purification', note:'Walk back from Commons', tag:'lab' },
    { id:'tue-rose',    label:'During lab — Email Rose Theisen re: SE advisor meeting', note:'Graded · due May 1', tag:'career' },
    { id:'lab-pm',      label:'Afternoon yeast lab', note:'Continue until dinner', tag:'lab' },
    { id:'dinner',      label:'4:30 PM — Dinner at Commons', note:'Leave lab 4:20 PM', tag:'health' },
    { id:'walk',        label:'5:15 PM — 20 min walk', note:'Tuesday workout', tag:'fitness' },
    { id:'tue-ch4',     label:'5:40 PM — Sheppard Ch. 4.1–4.9 (pp. 100–128)', note:'Coral Structure cont. · before Aidan call', tag:'class' },
    { id:'aidan',       label:'7:00 PM — Call with Aidan', note:'Real rest. Ends by 9 PM.', tag:'personal' },
    { id:'tue-id',      label:'9:00 PM — ID study: Sponges + Cnidaria', note:'Quiz 1 Apr 6 — 6 days away', tag:'class' },
    { id:'log',         label:'9:20 PM — Research log', note:'3–5 sentences: gel results, purification, what\'s next', tag:'lab' },
    { id:'screens',     label:'9:35 PM — Screens off → wind down → sleep 10:30 PM', note:'Lay out Wednesday outfit + bag. Skincare PM.', tag:'sleep' },
  ],
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
export const MORNING_ROUTINE = [
  { time:'6:00 AM', habit:'Wake up',                  icon:'☀️', cat:'sleep',   detail:'Weekdays only. 7.5 hours from 10:30 PM. Weekends 8:30 AM.' },
  { time:'6:02 AM', habit:'16 oz water',               icon:'💧', cat:'health',  detail:'Before coffee, before phone. Non-negotiable.' },
  { time:'6:04 AM', habit:'Brush teeth + skincare',    icon:'✨', cat:'polish',  detail:'Brush teeth, cleanser, moisturizer with SPF. CeraVe. 10 minutes.' },
  { time:'6:14 AM', habit:'Get dressed intentionally', icon:'👗', cat:'polish',  detail:'Laid out the night before. Well-fitted basics only. 5 minutes.' },
  { time:'6:19 AM', habit:'MCAT review',               icon:'📚', cat:'career',  detail:'30 min. One focused concept block.' },
  { time:'6:49 AM', habit:'Assignment & lab review',   icon:'🗒️', cat:'career',  detail:'15 min. Check what\'s due, what experiments are running, what needs prepping today.' },
  { time:'7:04 AM', habit:'Out the door',              icon:'🚪', cat:'sleep',   detail:'3 min to get ready. 15 min walk to Andrew Commons.' },
  { time:'7:30 AM', habit:'Breakfast at Commons',      icon:'🥚', cat:'health',  detail:'Load up on protein — eggs, yogurt, whatever\'s hot. 20 minutes.' },
  { time:'7:50 AM', habit:'Walk to lab',               icon:'🔬', cat:'career',  detail:'10 min to get there. At bench by 8:00 AM.' },
]

export const NIGHT_ROUTINE = [
  { time:'Midday',   habit:'Abstract read',    icon:'🔬', cat:'career',  detail:'One abstract + figures from Nature Immunology, JEM, or Immunity.' },
  { time:'5:00 PM',  habit:'Workout',          icon:'🏃‍♀️', cat:'fitness', detail:'MWF: 30 min strength. TuThSa: 20 min walk.' },
  { time:'7:00 PM',  habit:'Call with Aidan',  icon:'📞', cat:'health',  detail:'1–2 hours. Real rest — not multitasking. Ends by 9 PM.' },
  { time:'9:00 PM',  habit:'Research log',     icon:'📝', cat:'career',  detail:'3–5 sentences: what you tried, what worked, what\'s next.' },
  { time:'9:15 PM',  habit:'Screens off',      icon:'📵', cat:'sleep',   detail:'Hard stop. Reading, journaling, or music only.' },
  { time:'9:20 PM',  habit:'Lay out tomorrow', icon:'🗂️', cat:'polish',  detail:'Outfit + bag + breakfast plan. Morning-you will be grateful.' },
  { time:'9:30 PM',  habit:'Skincare PM',      icon:'🌙', cat:'polish',  detail:'Cleanser → retinol (3x/week) or moisturizer.' },
  { time:'9:45 PM',  habit:'Wind down',        icon:'🎹', cat:'sleep',   detail:'Piano, light reading, journaling. No career content.' },
  { time:'10:30 PM', habit:'Sleep',            icon:'💤', cat:'sleep',   detail:'7.5 hours to 6:00 AM. Protect this.' },
]
