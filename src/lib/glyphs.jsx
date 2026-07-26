// src/lib/glyphs.jsx
// A curated set of monochrome line icons for tasks — the Structured look, in
// place of full-color emoji. An icon value of "glyph:<id>" renders one of these
// (see <Icon> in IconPicker.jsx). They inherit a single color, so they read
// cleanly white on a colored timeline pill and dark on a light picker chip.

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
}

export function hasGlyph(id) { return !!GLYPHS[id] }

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

// Grouped for the picker, each with search keywords.
export const GLYPH_GROUPS = [
  { name:'Daily', items:[
    ['sun','morning day wake rise'],['moon','night sleep evening'],['alarm','clock wake time'],
    ['coffee','drink tea morning cup'],['droplet','water hydrate drink'],['sparkle','clean fresh shine'],['bed','sleep rest nap'],
  ]},
  { name:'Fitness', items:[
    ['dumbbell','gym weights lift strength workout'],['pulse','activity cardio heart run exercise'],['bike','cycle cycling ride'],
    ['waves','swim pool water'],['trophy','win goal achievement'],['target','goal focus aim'],
  ]},
  { name:'Work & Study', items:[
    ['briefcase','work job office career'],['laptop','computer work code'],['monitor','desktop screen work'],
    ['book','read study school'],['bookOpen','read study reading'],['pencil','write edit note homework'],
    ['flask','lab science chemistry'],['gradcap','school class degree graduation'],['calendar','date plan schedule meeting'],
    ['clipboard','tasks list checklist notes'],['chart','data report analytics'],
  ]},
  { name:'Home', items:[
    ['house','home'],['sprout','plant garden water grow'],['wrench','fix repair tool'],
    ['cart','shopping groceries errand store'],['trash','clean chore garbage'],['paw','pet dog cat animal walk'],
  ]},
  { name:'Health', items:[
    ['capsule','pill medicine meds vitamin'],['heart','love date care health'],['cross','doctor appointment health first aid'],
  ]},
  { name:'Food', items:[
    ['utensils','food eat meal dinner lunch'],['mug','drink coffee tea'],['wine','drink dinner date bar'],
  ]},
  { name:'Fun & Social', items:[
    ['controller','game gaming play fun'],['film','movie cinema watch tv show'],['music','song listen play'],
    ['camera','photo picture'],['gift','present birthday'],['headphones','music podcast listen'],
    ['plane','travel trip flight vacation'],['chat','talk message call social'],['ticket','event concert show'],
  ]},
  { name:'General', items:[
    ['star','important favorite'],['flame','streak priority hot'],['pin','important reminder location'],
    ['bulb','idea think plan'],['dollar','money finance budget pay bill'],['bag','shopping buy errand'],
    ['phone','call contact'],['mail','email message inbox'],['bell','reminder alert notify'],
    ['check','done complete task'],['clock','time schedule'],
  ]},
]

export const GLYPH_ALL = GLYPH_GROUPS.flatMap(g => g.items.map(([id, k]) => ({ id, k, group:g.name })))

// Guess the best-matching icon for a task title, e.g. "Gym session" → dumbbell,
// "Dinner with parents" → utensils, "Walk the dog" → paw. Scores each glyph by
// how many meaningful words of the title hit its id / keywords / group (a whole
// keyword-token match counts more than a loose substring). Returns "glyph:<id>"
// or null when nothing meaningfully matches.
export function suggestGlyph(title) {
  const words = (title || '').toLowerCase().match(/[a-z]+/g) || []
  if (!words.length) return null
  let bestId = null, best = 0
  for (const it of GLYPH_ALL) {
    // Match on the icon's own name + keywords only — NOT its group name, or
    // every item in a group would tie on the group word (e.g. "study").
    const hay = `${it.id} ${it.k}`.toLowerCase()
    const tokens = hay.split(/\s+/)
    let score = 0
    for (const w of words) {
      if (w.length < 3) continue                 // skip "to", "hr", "of"…
      if (tokens.includes(w)) score += 3         // exact keyword hit
      else if (w.length >= 4 && hay.includes(w)) score += 1  // loose contains
    }
    if (score > best) { best = score; bestId = it.id }
  }
  return best > 0 ? 'glyph:' + bestId : null
}
