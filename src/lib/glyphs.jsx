// src/lib/glyphs.jsx
// A curated set of monochrome line icons for tasks — the Structured look, in
// place of full-color emoji. An icon value of "glyph:<id>" renders one of these
// (see <Icon> in IconPicker.jsx). They inherit a single color, so they read
// cleanly white on a colored timeline pill and dark on a light picker chip.

import { EXTRA_GLYPHS, EXTRA_GROUPS } from './glyphsExtra.jsx'

const P = (d) => <path d={d} />

// id → inner SVG elements. All drawn on a 24×24 grid, stroke-based (the caller
// supplies stroke color); a few solid shapes set `solid` and are filled instead.
const GLYPHS = {
  // ── Daily ──
  sun:     { el: <><circle cx="12" cy="12" r="4.2"/>{P("M12 2.5v2.5M12 19v2.5M4.2 4.2l1.8 1.8M18 18l1.8 1.8M2.5 12H5M19 12h2.5M4.2 19.8 6 18M18 6l1.8-1.8")}</> },
  moon:    { el: P("M20 14.2A8 8 0 0 1 9.8 4 8 8 0 1 0 20 14.2Z") },
  alarm:   { el: <><circle cx="12" cy="13" r="7"/>{P("M12 9.5V13l2.5 1.5M5 4.5 2.6 7M19 4.5 21.4 7")}</> },
  coffee:  { el: <>{P("M4 8h12v5a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4Z")}{P("M16 9h2.2a2.5 2.5 0 0 1 0 5H16")}{P("M7.5 3v2M11 3v2")}</> },
  droplet: { el: P("M12 3.2S6 9.4 6 13.5a6 6 0 0 0 12 0C18 9.4 12 3.2 12 3.2Z") },
  sparkle: { solid: true, el: P("M12 3l1.7 5.1 5.1 1.7-5.1 1.7L12 17l-1.7-5.5L5.2 9.8l5.1-1.7Z") },
  bed:     { el: <>{P("M3 18v-6h13a4 4 0 0 1 4 4v2M3 9v9M20 18v-2")}<circle cx="7" cy="11" r="1.6"/></> },
  // ── Fitness ──
  dumbbell:{ el: P("M6.5 8.5v7M4 10v4M9.5 11h5M15.5 8.5v7M18 10v4") },
  pulse:   { el: P("M3 12h4l2 6 4-14 2 8h6") },
  bike:    { el: <><circle cx="6" cy="17" r="3.2"/><circle cx="18" cy="17" r="3.2"/>{P("M6 17l4.5-7.5H15M9 9.5h4l3 7.5")}</> },
  waves:   { el: P("M3 8c2.3 0 2.3 2 4.5 2S9.8 8 12 8s2.3 2 4.5 2S18.8 8 21 8M3 14c2.3 0 2.3 2 4.5 2s2.3-2 4.5-2 2.3 2 4.5 2 2.3-2 4.5-2") },
  trophy:  { el: <>{P("M8 4h8v4.5a4 4 0 0 1-8 0Z")}{P("M8 5.5H5.5v1a2.8 2.8 0 0 0 2.8 2.8M16 5.5h2.5v1a2.8 2.8 0 0 1-2.8 2.8")}{P("M12 12.5v3.5M9 20h6M10.2 20l.4-4M13.8 20l-.4-4")}</> },
  target:  { el: <><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4.4"/><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none"/></> },
  // ── Work & Study ──
  briefcase:{ el: <><rect x="3" y="8" width="18" height="11" rx="2"/>{P("M8 8V6a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 13h18")}</> },
  laptop:  { el: <><rect x="4.5" y="6" width="15" height="9.5" rx="1.5"/>{P("M2.5 19h19")}</> },
  monitor: { el: <><rect x="3" y="4.5" width="18" height="11.5" rx="2"/>{P("M9 20h6M12 16v4")}</> },
  book:    { el: P("M6.5 4H16a2 2 0 0 1 2 2v14H8.5a2 2 0 0 0-2 2V4ZM6.5 20a2 2 0 0 1 2-2H18") },
  bookOpen:{ el: P("M12 6.5C10 5 7 5 5 6v12c2-1 5-1 7 .5 2-1.5 5-1.5 7-.5V6c-2-1-5-1-7 .5ZM12 6.5v12") },
  pencil:  { el: <>{P("M4 20l1.2-4.2L15.5 5.5l3 3L8.2 18.8Z")}{P("M13.5 7.5l3 3")}</> },
  flask:   { el: P("M9.5 3v6l-4.2 8.2A2 2 0 0 0 7.1 20h9.8a2 2 0 0 0 1.8-2.8L14.5 9V3M8 3h8M7.2 14.5h9.6") },
  gradcap: { el: <>{P("M2.5 9 12 5.2 21.5 9 12 12.8Z")}{P("M6.5 11v4.2c0 1.4 2.5 2.8 5.5 2.8s5.5-1.4 5.5-2.8V11M21.5 9v5")}</> },
  calendar:{ el: <><rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/>{P("M3.5 9.5h17M8 3v4M16 3v4")}</> },
  clipboard:{ el: <><rect x="5" y="4.5" width="14" height="16" rx="2.5"/>{P("M9 4.5h6V7.5H9zM8 11.5h8M8 15.5h5")}</> },
  chart:   { el: P("M4 20h16M6.5 20v-6M11 20V8M15.5 20v-9M20 20V5") },
  // ── Home ──
  house:   { el: P("M4 11l8-6.2 8 6.2M6 9.5V19h12V9.5M10 19v-5h4v5") },
  sprout:  { el: P("M12 21v-8M12 13c0-3.6 2.8-6.4 7.2-6.4C19.2 11 16.4 13.8 12 13.8M12 13.4c0-2.8-2-4.8-5.6-4.8C6.4 12.4 8.4 14.4 12 13.4") },
  wrench:  { el: P("M15.5 6.2a3.8 3.8 0 0 0-4.8 4.8L4 17.7 6.3 20l6.7-6.7a3.8 3.8 0 0 0 4.8-4.8l-2.4 2.4-2.4-.4-.4-2.4Z") },
  cart:    { el: <><circle cx="9" cy="20" r="1.4"/><circle cx="17" cy="20" r="1.4"/>{P("M3 4.5h2l2.4 11.5h11l2-8.5H6")}</> },
  trash:   { el: P("M4.5 7h15M9 7V5.2a1.2 1.2 0 0 1 1.2-1.2h3.6A1.2 1.2 0 0 1 15 5.2V7M6.5 7l1 12.5h9l1-12.5M10 10.5v6M14 10.5v6") },
  paw:     { el: <><circle cx="7" cy="10" r="1.8"/><circle cx="12" cy="8" r="1.9"/><circle cx="17" cy="10" r="1.8"/>{P("M12 12.2c3 0 5.2 2 5.2 4.4S14.4 20 12 20s-5.2-1-5.2-3.4S9 12.2 12 12.2Z")}</> },
  // ── Health ──
  capsule: { el: <g transform="rotate(45 12 12)"><rect x="4" y="9" width="16" height="6" rx="3"/>{P("M12 9v6")}</g> },
  heart:   { solid: true, el: P("M12 20.5S3.5 14.5 3.5 8.8A4.3 4.3 0 0 1 12 7.2a4.3 4.3 0 0 1 8.5 1.6c0 5.7-8.5 11.7-8.5 11.7Z") },
  cross:   { el: <><rect x="4" y="4" width="16" height="16" rx="4.5"/>{P("M12 8.5v7M8.5 12h7")}</> },
  // ── Food ──
  utensils:{ el: P("M6 3v6.5a2 2 0 0 0 4 0V3M8 9.5V21M16.5 3c-2 0-3 2.2-3 5.2s1 4 2.4 4.2V21") },
  mug:     { el: <>{P("M5 7h10v6a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4Z")}{P("M15 8.5h2.5a2.2 2.2 0 0 1 0 4.4H15")}</> },
  wine:    { el: P("M8 3.5h8l-1 5.5a3 3 0 0 1-6 0ZM12 12v6M9 21h6") },
  // ── Fun & Social ──
  controller:{ el: <><rect x="3" y="8" width="18" height="9" rx="4.5"/>{P("M8 11v3M6.5 12.5h3M15.5 12.2h.01M17.5 14h.01")}</> },
  film:    { el: <><rect x="3.5" y="4.5" width="17" height="15" rx="2"/>{P("M8 4.5v15M16 4.5v15M3.5 9.5h4.5M16 9.5h4.5M3.5 14.5h4.5M16 14.5h4.5")}</> },
  music:   { el: <><circle cx="7" cy="18" r="2.4"/><circle cx="17" cy="16" r="2.4"/>{P("M9.4 18V6l10-2v10")}</> },
  camera:  { el: <><rect x="3" y="7.5" width="18" height="11.5" rx="2.5"/><circle cx="12" cy="13.2" r="3.4"/>{P("M8.5 7.5 10 5h4l1.5 2.5")}</> },
  gift:    { el: <><rect x="4.5" y="9" width="15" height="11" rx="1.5"/>{P("M4.5 13h15M12 9v11M9 9a2 2 0 1 1 3-2 2 2 0 1 1 3 2")}</> },
  headphones:{ el: <>{P("M4.5 14v-1.5a7.5 7.5 0 0 1 15 0V14")}<rect x="3" y="14" width="4" height="6" rx="1.8"/><rect x="17" y="14" width="4" height="6" rx="1.8"/></> },
  plane:   { el: P("M21 12 3.5 6.2l4 5.8-4 5.8Z") },
  chat:    { el: P("M4.5 5.5h15v10h-9l-6 4.2V5.5Z") },
  ticket:  { el: P("M4 8.5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2 2 2 0 0 0 0 4 2 2 0 0 1-2 2H6a2 2 0 0 1-2-2 2 2 0 0 0 0-4Z") },
  // ── General ──
  star:    { solid: true, el: P("M12 3.2l2.6 5.6 6.1.8-4.5 4.2 1.1 6.1L12 17.1l-5.4 2.8 1.1-6.1L3.3 9.6l6.1-.8Z") },
  flame:   { solid: true, el: P("M12 3c1 3 4.8 4.3 4.8 8.6A4.8 4.8 0 0 1 7.2 12c0-2 1-3.2 2-4.2.5 2 1.6 2 2 1 .5-1.2-1.2-3.2-1.2-5.8Z") },
  pin:     { el: <>{P("M12 21s6-5.6 6-10.2A6 6 0 0 0 6 10.8C6 15.4 12 21 12 21Z")}<circle cx="12" cy="10.8" r="2.2"/></> },
  bulb:    { el: P("M9.2 18h5.6M10 21h4M8 13a5 5 0 1 1 8 0c-1 1.1-1.5 2-1.5 3h-5C9.5 15 9 14.1 8 13Z") },
  dollar:  { el: <><circle cx="12" cy="12" r="8.5"/>{P("M12 7v10M14.6 9.3c0-1.3-1.2-1.9-2.6-1.9s-2.6.7-2.6 1.9 1.1 1.6 2.6 2 2.6.8 2.6 2-1.2 1.9-2.6 1.9-2.6-.6-2.6-1.9")}</> },
  bag:     { el: P("M6 8h12l1 12H5ZM9 8V6.2a3 3 0 0 1 6 0V8") },
  phone:   { el: P("M6 3.5h3.5l1.5 4.5-2 1.4a11 11 0 0 0 5 5l1.4-2 4.5 1.5V19a1.8 1.8 0 0 1-1.8 1.8A15.5 15.5 0 0 1 4.2 5.3 1.8 1.8 0 0 1 6 3.5Z") },
  mail:    { el: <><rect x="3" y="5.5" width="18" height="13" rx="2.5"/>{P("M3.5 7.5 12 13l8.5-5.5")}</> },
  bell:    { el: P("M6.5 9.5a5.5 5.5 0 0 1 11 0c0 4.6 2 5.8 2 5.8H4.5s2-1.2 2-5.8ZM10 19a2 2 0 0 0 4 0") },
  check:   { el: <><circle cx="12" cy="12" r="8.5"/>{P("M8.2 12.4l2.5 2.5 5-5")}</> },
  clock:   { el: <><circle cx="12" cy="12" r="8.5"/>{P("M12 7v5.2l3.4 2")}</> },
  // Nav-only glyphs (not offered in the task picker).
  list:    { el: <>{P("M9 6h11M9 12h11M9 18h11")}<circle cx="4.5" cy="6" r="1.3"/><circle cx="4.5" cy="12" r="1.3"/><circle cx="4.5" cy="18" r="1.3"/></> },
  repeat:  { el: P("M17 3.5l3 3-3 3M20 6.5H9A5 5 0 0 0 4 11.5M7 20.5l-3-3 3-3M4 17.5h11a5 5 0 0 0 5-5") },
  grid:    { el: <><rect x="4" y="4" width="7" height="7" rx="1.6"/><rect x="13" y="4" width="7" height="7" rx="1.6"/><rect x="4" y="13" width="7" height="7" rx="1.6"/><rect x="13" y="13" width="7" height="7" rx="1.6"/></> },
  // ── Getting around / tech ──
  bus:     { el: <><rect x="4" y="4.5" width="16" height="12" rx="2.5"/>{P("M4 11h16M9 4.5v6.5M15 4.5v6.5M6 16.5v2M18 16.5v2")}<circle cx="8" cy="13.6" r="0.9" fill="currentColor" stroke="none"/><circle cx="16" cy="13.6" r="0.9" fill="currentColor" stroke="none"/></> },
  car:     { el: <>{P("M4 13l1.6-4.5A2.2 2.2 0 0 1 7.7 7h8.6a2.2 2.2 0 0 1 2.1 1.5L20 13")}{P("M3.5 13h17v3.3a1 1 0 0 1-1 1H18.5M5.5 17.3H4.5a1 1 0 0 1-1-1V13")}<circle cx="8" cy="17.2" r="1.6"/><circle cx="16" cy="17.2" r="1.6"/></> },
  wifi:    { el: <>{P("M4 9.5a13 13 0 0 1 16 0M6.7 12.7a9 9 0 0 1 10.6 0M9.3 15.9a5 5 0 0 1 5.4 0")}<circle cx="12" cy="19" r="1.1" fill="currentColor" stroke="none"/></> },
  // The big second batch (see glyphsExtra.jsx) is folded in here, so every
  // consumer that renders "glyph:<id>" can reach these too.
  ...EXTRA_GLYPHS,
}

export function hasGlyph(id) { return !!GLYPHS[id] }

// Pick a readable icon/text color for a filled background: dark on light
// colors, light on dark ones. Falls back to white for anything it can't parse
// (e.g. a CSS var), which is the safe default on Bloom's medium accents.
export function iconColorOn(bg, dark = '#20242E', light = '#FFFFFF') {
  if (typeof bg !== 'string' || bg[0] !== '#' || (bg.length !== 7 && bg.length !== 4)) return light
  let r, g, b
  if (bg.length === 4) { r = parseInt(bg[1]+bg[1],16); g = parseInt(bg[2]+bg[2],16); b = parseInt(bg[3]+bg[3],16) }
  else { r = parseInt(bg.slice(1,3),16); g = parseInt(bg.slice(3,5),16); b = parseInt(bg.slice(5,7),16) }
  // Perceived brightness (0–1). Above ~0.62 reads as "light".
  const L = (0.299*r + 0.587*g + 0.114*b) / 255
  return L > 0.62 ? dark : light
}

// Render a glyph by id in a single color (defaults to the current text color).
export function Glyph({ id, size = 22, color = 'currentColor', style }) {
  const g = GLYPHS[id]
  if (!g) return null
  return (
    <svg viewBox="0 0 24 24" width={size} height={size}
      fill={g.solid ? color : 'none'} stroke={g.solid ? 'none' : color}
      strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"
      style={{ display:'block', ...style }} aria-hidden="true">
      {g.el}
    </svg>
  )
}

// Grouped for the picker, each with search keywords. The base groups first,
// then the large extra set (glyphsExtra.jsx) appended after.
const BASE_GROUPS = [
  { name:'Daily', items:[
    ['sun','morning day wake rise sunrise dawn am'],['moon','night sleep evening bedtime pm dusk'],['alarm','clock wake time alarm snooze'],
    ['coffee','drink tea morning cup coffee brew caffeine espresso latte breakfast'],['droplet','water hydrate drink hydration bottle rain'],
    ['sparkle','clean fresh shine tidy cleaning wash sparkle laundry vacuum'],['bed','sleep rest nap bed bedtime relax'],
  ]},
  { name:'Fitness', items:[
    ['dumbbell','gym weights lift strength workout exercise train training fitness muscle'],
    ['pulse','activity cardio heart run running jog exercise steps hiit'],['bike','cycle cycling ride bike biking spin peloton'],
    ['waves','swim swimming pool water surf ocean laps'],['trophy','win goal achievement award prize compete match game won'],
    ['target','goal focus aim objective habit target milestone'],['run','run running jog jogging walk walking sprint marathon exercise commute'],
  ]},
  { name:'Work & Study', items:[
    ['briefcase','work job office career business interview client meeting boss'],['laptop','computer work code coding laptop dev develop program email zoom'],
    ['monitor','desktop screen work display setup pc'],
    ['book','read reading study school book textbook chapter novel library learn'],['bookOpen','read reading study review revise study notes'],
    ['pencil','write writing edit note homework essay draft assignment journal sign'],
    ['flask','lab science chemistry experiment research biology'],['gradcap','school class degree graduation lecture college university course exam'],
    ['calendar','date plan schedule meeting event appointment calendar booking deadline day'],
    ['clipboard','tasks list checklist notes todo plan agenda form survey'],['chart','data report analytics stats metrics dashboard finance review numbers'],
  ]},
  { name:'Home', items:[
    ['house','home house apartment rent mortgage move room'],['sprout','plant plants garden water grow gardening flower yard tree'],
    ['wrench','fix repair tool maintenance setup install assemble handyman plumber'],
    ['cart','shopping groceries grocery errand store market supermarket buy shop food'],
    ['trash','clean chore garbage trash rubbish bins recycling dishes'],['paw','pet dog cat animal walk vet feed puppy litter'],
    ['wifi','wifi internet router network setup connect broadband online'],
  ]},
  { name:'Health', items:[
    ['capsule','pill pills medicine meds vitamin vitamins supplement prescription dose refill pharmacy medication'],
    ['heart','love date care health relationship wellbeing self'],
    ['cross','doctor appointment health clinic hospital dentist tooth checkup medical nurse therapy therapist'],
  ]},
  { name:'Food', items:[
    ['utensils','food eat meal dinner lunch breakfast cook cooking recipe restaurant kitchen dish prep'],
    ['mug','drink coffee tea cup mug hot cocoa'],['wine','drink dinner date bar drinks party wine beer happy hour cocktail'],
  ]},
  { name:'Fun & Social', items:[
    ['controller','game gaming play fun video xbox playstation nintendo arcade'],['film','movie movies cinema watch tv show series stream netflix film'],
    ['music','song music listen play band practice guitar sing concert playlist'],
    ['camera','photo photos picture pictures shoot camera selfie album'],['gift','present gift birthday anniversary wrap holiday christmas'],
    ['headphones','music podcast listen audio audiobook'],['chat','talk message call social text catch chat meet friend hangout'],
    ['ticket','event concert show festival ticket game match theatre'],
  ]},
  { name:'Travel', items:[
    ['plane','travel trip flight vacation fly airport plane holiday abroad boarding'],
    ['bus','bus commute transit ride stop shuttle coach public'],
    ['car','car drive commute vehicle uber lyft taxi road trip parking gas dmv'],
  ]},
  { name:'General', items:[
    ['star','important favorite star special priority'],['flame','streak priority hot urgent fire momentum'],
    ['pin','important reminder location place map address pin'],
    ['bulb','idea think plan brainstorm inspiration creative concept'],
    ['dollar','money finance budget budgeting pay bill bills invoice bank taxes salary save savings payment venmo'],
    ['bag','shopping buy errand bag purchase order pack packing'],
    ['phone','call phone contact ring dial telephone voicemail'],['mail','email message inbox mail letter send reply newsletter'],
    ['bell','reminder alert notify notification ping ring'],['check','done complete task finish check tick verify'],
    ['clock','time schedule timer deadline duration wait later'],
  ]},
]

export const GLYPH_GROUPS = [...BASE_GROUPS, ...EXTRA_GROUPS]

export const GLYPH_ALL = GLYPH_GROUPS.flatMap(g => g.items.map(([id, k]) => ({ id, k, group:g.name })))

// Common filler words that shouldn't drive an icon choice.
const STOPWORDS = new Set(('a an the to of in on at for with and or but my me your our this that these those ' +
  'is be am are do does go get got set make made take give have has had new some any it its ' +
  'up out off via about into from over again more less week day today tomorrow morning night').split(/\s+/))

// Fold a word toward a comparable stem: drop a trailing plural/verb suffix so
// "meetings", "running", "budgeting", "called" all line up with their root.
function stem(w) {
  if (w.length > 5 && w.endsWith('ing')) return w.slice(0, -3)
  if (w.length > 5 && w.endsWith('ed'))  return w.slice(0, -2)
  if (w.length > 4 && w.endsWith('es'))  return w.slice(0, -2)
  if (w.length > 4 && w.endsWith('s') && !w.endsWith('ss')) return w.slice(0, -1)
  return w
}
function related(a, b) {
  if (a === b) return true
  if (a.length < 4 || b.length < 4) return false
  return a.startsWith(b) || b.startsWith(a)
}

// Everyday task words → a canonical keyword the icon set actually uses, so
// abbreviations and common phrasings still resolve (e.g. "appt" → appointment,
// "workout" → gym, "groceries" → grocery). Applied to each title word before
// scoring; both the original and the mapped form are considered.
const SYNONYMS = {
  appt:'appointment', mtg:'meeting', dr:'doctor', doc:'doctor', gym:'workout',
  jog:'run', jogging:'run', workout:'gym', groceries:'grocery', shopping:'shop',
  laundry:'clean', dishes:'clean', clean:'cleaning', vacuum:'clean',
  meds:'medicine', med:'medicine', rx:'prescription', vax:'vaccine',
  standup:'meeting', sync:'meeting', call:'phone', zoom:'meeting', pt:'fitness',
  bday:'birthday', anniversary:'gift', payday:'money', invoice:'bill',
  studying:'study', revision:'study', hw:'homework', essay:'write',
  commute:'car', flight:'plane', vacay:'vacation', holiday:'vacation',
  brekkie:'breakfast', lunch:'restaurant', dinner:'restaurant', supper:'restaurant',
  walk:'run', hike:'hiking', yoga:'yoga', meditate:'meditation',
}

// Precompute each icon's searchable stems once (id name + keywords). Fast to
// scan across the whole set on every keystroke of a title.
const GLYPH_INDEX = GLYPH_ALL.map(it => ({
  id: it.id,
  name: stem(it.id.toLowerCase()),
  tokens: new Set(`${it.id} ${it.k}`.toLowerCase().split(/\s+/).map(stem)),
}))

// Guess the best-matching icon for a task title, e.g. "Gym session" → dumbbell,
// "Dinner with parents" → restaurant, "Budgeting plan" → dollar, "Take the bus"
// → bus. Meaningful title words (stemmed, synonym-expanded) are scored against
// each glyph's name + keywords: an exact stem hit counts most, a shared prefix
// (running↔run) counts less, and a hit on the icon's own name gets a small
// bonus so the most on-the-nose icon wins ties. Returns "glyph:<id>" or null.
export function suggestGlyph(title) {
  const raw = (title || '').toLowerCase().match(/[a-z]+/g) || []
  const base = raw.filter(w => w.length >= 3 && !STOPWORDS.has(w))
  // Expand synonyms, then stem, then dedupe.
  const expanded = []
  for (const w of base) { expanded.push(w); if (SYNONYMS[w]) expanded.push(SYNONYMS[w]) }
  const words = [...new Set(expanded.map(stem))]
  if (!words.length) return null
  let bestId = null, best = 0
  for (const it of GLYPH_INDEX) {
    let score = 0
    for (const w of words) {
      let s = 0
      for (const t of it.tokens) {
        if (t === w) { s = 3; break }
        if (related(w, t)) s = Math.max(s, 2)
      }
      // A hit on the icon's own name is the strongest signal.
      if (w === it.name) s = 4
      score += s
    }
    if (score > best) { best = score; bestId = it.id }
  }
  // Only suggest when we're actually confident — require at least one exact
  // word→token hit (score 3), not a merely "related" guess (score 2). Below
  // that we return null so an item isn't auto-labeled with a wrong icon.
  return best >= 3 ? 'glyph:' + bestId : null
}
