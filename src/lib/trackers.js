// src/lib/trackers.js
// ─────────────────────────────────────────────────────────────
// The engine behind the Insights trackers. A "tracker" (folder) has fields the
// USER defines — so one entry (say a driving trip) can carry a money-out for gas,
// a time value, and a mileage number all at once. Everything rolls up into a
// summary of money in / out / net and hours, against optional budgets ("what's
// left"). Also: ranked-bar + trend aggregation, plain-English highlights, and
// export to a printable PDF or an editable CSV. Pure functions — no React.
// ─────────────────────────────────────────────────────────────

// ── Palette ─────────────────────────────────────────────────────
export const OTHER_COLOR = '#9AA7B2'
export const ACCENT_COLORS = ['#4A9EB5', '#E8804A', '#7C9CBF', '#5FA86E', '#C86FA0', '#B08968', '#6C7BC0', '#D08A3A']
export const FOLDER_ICONS = ['bed', 'house', 'briefcase', 'sprout', 'car', 'camera', 'cart', 'wrench', 'paw', 'heart', 'flask', 'book']

// Semantic single-hue ramps for ranked bars (dark = biggest). On-theme, not a
// rainbow — the eye reads magnitude by length; color just reinforces the metric.
//   spend = warm coral · revenue = sage green · hours = teal/forest · neutral = slate
export const RAMPS = {
  spend:   ['#B23A1E', '#F1B49E'],
  revenue: ['#2E7D5B', '#A9D3B4'],
  hours:   ['#2A4858', '#8FC3D8'],
  neutral: ['#41607A', '#A9C2D4'],
}
export const POS_COLOR = '#3E9E6C'   // net positive (green)
export const NEG_COLOR = '#E06A45'   // net negative (coral)

function hex2rgb(h) { const n = parseInt(h.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255] }
function rgb2hex(r, g, b) { return '#' + [r, g, b].map(x => Math.max(0, Math.min(255, Math.round(x))).toString(16).padStart(2, '0')).join('') }
// n colors interpolated between a ramp's dark and light anchors (index 0 = dark).
export function rampColors(ramp, n) {
  const [d, l] = RAMPS[ramp] || RAMPS.neutral
  const [dr, dg, db] = hex2rgb(d), [lr, lg, lb] = hex2rgb(l)
  if (n <= 1) return [d]
  return Array.from({ length: n }, (_, i) => { const t = i / (n - 1); return rgb2hex(dr + (lr - dr) * t, dg + (lg - dg) * t, db + (lb - db) * t) })
}

// ── Field types ─────────────────────────────────────────────────
// Each carries: label, kind (how it aggregates), and whether it's a "measure"
// (money/hours/number that sums) or a "dimension" (category/person you group by).
export const FIELD_TYPES = {
  moneyOut: { label: 'Money out', kind: 'money', measure: true },
  moneyIn:  { label: 'Money in',  kind: 'money', measure: true },
  hours:    { label: 'Time',      kind: 'hours', measure: true },
  mileage:  { label: 'Mileage (tax-deductible)', kind: 'mileage', measure: true }, // miles × rate → deduction
  number:   { label: 'Number',    kind: 'number', measure: true },   // nights, qty…
  category: { label: 'Category',  kind: 'text', dimension: true },
  person:   { label: 'Person',    kind: 'person', dimension: true },
  text:     { label: 'Text/note', kind: 'text' },
  receipt:  { label: 'Receipt photo', kind: 'receipt' },
}
export const FIELD_TYPE_ORDER = ['moneyOut', 'moneyIn', 'hours', 'mileage', 'number', 'category', 'person', 'text', 'receipt']
// The IRS standard mileage rate changes yearly; this is the editable default.
export const DEFAULT_MILEAGE_RATE = 0.70
export const DEFAULT_TAX_RATE = 25   // % of taxable profit to set aside

let _fid = 0
export function newFieldId() { return 'f' + Date.now().toString(36) + (_fid++).toString(36) }
export function makeField(type, name) { return { id: newFieldId(), type, name } }

// Starter templates offered when creating a tracker. "Blank" starts empty.
export const TEMPLATES = [
  { id: 'standard', name: 'Standard (hours + expenses)', icon: 'briefcase',
    fields: () => [makeField('category', 'Category'), makeField('text', 'Paid to / activity'), makeField('moneyOut', 'Amount'), makeField('hours', 'Time'), makeField('mileage', 'Miles'), makeField('person', 'Person'), makeField('receipt', 'Receipt')] },
  { id: 'bnb', name: 'Bed & Breakfast', icon: 'bed',
    fields: () => [makeField('text', 'Guest / note'), makeField('category', 'Category'), makeField('moneyIn', 'Revenue'), makeField('moneyOut', 'Expense'), makeField('hours', 'Hours worked'), makeField('mileage', 'Miles'), makeField('person', 'Person'), makeField('receipt', 'Receipt')] },
  { id: 'mileage', name: 'Mileage & expenses', icon: 'car',
    fields: () => [makeField('text', 'Purpose'), makeField('mileage', 'Miles'), makeField('moneyOut', 'Cost'), makeField('hours', 'Time'), makeField('category', 'Category')] },
  { id: 'freelance', name: 'Freelance / clients', icon: 'briefcase',
    fields: () => [makeField('text', 'Client'), makeField('category', 'Task'), makeField('hours', 'Hours'), makeField('moneyIn', 'Invoiced'), makeField('moneyOut', 'Expenses'), makeField('receipt', 'Receipt')] },
  { id: 'blank', name: 'Blank (add your own fields)', icon: 'sprout', fields: () => [] },
]

export function fieldsOfType(fields, type) { return (fields || []).filter(f => f.type === type) }
export function firstFieldOfType(fields, type) { return (fields || []).find(f => f.type === type) }
export function fieldsOfKind(fields, kind) { return (fields || []).filter(f => FIELD_TYPES[f.type]?.kind === kind) }

// ── Dates ───────────────────────────────────────────────────────
export function todayStr() { return iso(new Date()) }
function iso(d) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }

export const RANGE_PRESETS = [
  ['this-month', 'This month'], ['last-month', 'Last month'], ['this-quarter', 'This quarter'],
  ['ytd', 'This year'], ['last-year', 'Last year'], ['last-30', 'Last 30 days'], ['last-90', 'Last 90 days'],
  ['all', 'All time'], ['custom', 'Custom…'],
]
export function resolveRange(preset, custom) {
  const now = new Date(), y = now.getFullYear(), m = now.getMonth()
  const startOf = (yr, mo, day = 1) => iso(new Date(yr, mo, day))
  const endOfMonth = (yr, mo) => iso(new Date(yr, mo + 1, 0))
  switch (preset) {
    case 'this-month':   return { start: startOf(y, m), end: endOfMonth(y, m) }
    case 'last-month':   return { start: startOf(y, m - 1), end: endOfMonth(y, m - 1) }
    case 'this-quarter': { const q = Math.floor(m / 3) * 3; return { start: startOf(y, q), end: endOfMonth(y, q + 2) } }
    case 'ytd':          return { start: startOf(y, 0), end: iso(now) }
    case 'last-year':    return { start: startOf(y - 1, 0), end: endOfMonth(y - 1, 11) }
    case 'last-30':      { const s = new Date(now); s.setDate(s.getDate() - 29); return { start: iso(s), end: iso(now) } }
    case 'last-90':      { const s = new Date(now); s.setDate(s.getDate() - 89); return { start: iso(s), end: iso(now) } }
    case 'custom':       return { start: custom?.start || '', end: custom?.end || '' }
    default:             return { start: '', end: '' }
  }
}
export function prevRange(preset) {
  const now = new Date(), y = now.getFullYear(), m = now.getMonth()
  const startOf = (yr, mo, day = 1) => iso(new Date(yr, mo, day))
  const endOfMonth = (yr, mo) => iso(new Date(yr, mo + 1, 0))
  switch (preset) {
    case 'this-month':   return { start: startOf(y, m - 1), end: endOfMonth(y, m - 1) }
    case 'last-month':   return { start: startOf(y, m - 2), end: endOfMonth(y, m - 2) }
    case 'this-quarter': { const q = Math.floor(m / 3) * 3; return { start: startOf(y, q - 3), end: endOfMonth(y, q - 1) } }
    case 'ytd':          return { start: startOf(y - 1, 0), end: endOfMonth(y - 1, 11) }
    case 'last-year':    return { start: startOf(y - 2, 0), end: endOfMonth(y - 2, 11) }
    case 'last-30':      { const s = new Date(now); s.setDate(s.getDate() - 59); const e = new Date(now); e.setDate(e.getDate() - 30); return { start: iso(s), end: iso(e) } }
    case 'last-90':      { const s = new Date(now); s.setDate(s.getDate() - 179); const e = new Date(now); e.setDate(e.getDate() - 90); return { start: iso(s), end: iso(e) } }
    default:             return null
  }
}
export function inRange(dateStr, range) {
  if (!dateStr) return false
  if (range.start && dateStr < range.start) return false
  if (range.end && dateStr > range.end) return false
  return true
}
export function rangeLabel(preset, range) {
  const p = RANGE_PRESETS.find(r => r[0] === preset)
  if (preset === 'custom' || preset === 'all') {
    if (range.start && range.end) return `${prettyDate(range.start)} – ${prettyDate(range.end)}`
    if (range.start) return `since ${prettyDate(range.start)}`
    if (range.end) return `through ${prettyDate(range.end)}`
    return 'all time'
  }
  return (p ? p[1] : 'All time').toLowerCase()
}
export function prettyDate(d) {
  if (!d) return ''
  const dt = new Date(d + 'T12:00:00')
  return isNaN(dt) ? d : dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

// ── Formatting ──────────────────────────────────────────────────
export function fmtHours(mins) {
  const m = Math.max(0, Math.round(mins || 0)), h = Math.floor(m / 60), r = m % 60
  if (h === 0) return `${r}m`
  if (r === 0) return `${h}h`
  return `${h}h ${r}m`
}
export function decimalHours(mins) { return Math.round((mins || 0) / 6) / 10 }
export function fmtMoney(amount, symbol = '$') {
  const n = Number(amount) || 0
  return `${n < 0 ? '-' : ''}${symbol}${Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}
export function fmtNumber(n) { return (Number(n) || 0).toLocaleString('en-US', { maximumFractionDigits: 2 }) }
export function personName(people, id) {
  if (!id) return 'Unassigned'
  const w = (people || []).find(x => x.id === id)
  return w ? w.name : 'Unknown'
}
export function folderName(folders, id) { const f = (folders || []).find(x => x.id === id); return f ? f.name : 'Untitled' }

// ── Values ──────────────────────────────────────────────────────
export function val(entry, fieldId) { return entry?.values ? entry.values[fieldId] : undefined }
export function num(v) { const n = Number(v); return Number.isFinite(n) ? n : 0 }

// ── Summary (money in / out / net / hours / miles) ──────────────
export function summarize(entries, fields) {
  const moneyInF = fieldsOfType(fields, 'moneyIn').map(f => f.id)
  const moneyOutF = fieldsOfType(fields, 'moneyOut').map(f => f.id)
  const hoursF = fieldsOfType(fields, 'hours').map(f => f.id)
  const milesF = fieldsOfType(fields, 'mileage').map(f => f.id)
  let moneyIn = 0, moneyOut = 0, mins = 0, miles = 0
  for (const e of entries) {
    for (const id of moneyInF) moneyIn += num(val(e, id))
    for (const id of moneyOutF) moneyOut += num(val(e, id))
    for (const id of hoursF) mins += num(val(e, id))
    for (const id of milesF) miles += num(val(e, id))
  }
  return { moneyIn, moneyOut, net: moneyIn - moneyOut, mins, miles, count: entries.length }
}
// Sum a single measure field across entries.
export function sumField(entries, fieldId) { return entries.reduce((s, e) => s + num(val(e, fieldId)), 0) }

// ── The financial cascade (the small-business "framework") ──────
// Turns a raw summary + a tracker's finance settings into the honest chain:
//   Revenue − Expenses = Profit
//   Profit − Mileage deduction (miles × rate) = Taxable profit
//   Taxable × tax% = Set aside for taxes
//   Profit − Set aside = Yours to keep
// Every line degrades gracefully: no mileage field → no deduction line; no tax
// rate → no tax line (take-home just equals profit).
export function financials(s, folder = {}) {
  const profit = (s.moneyIn || 0) - (s.moneyOut || 0)
  const miles = s.miles || 0
  const rate = Number(folder.mileageRate) || 0
  const mileageDeduction = miles * rate
  const taxRate = Number(folder.taxRate) || 0
  const taxableProfit = Math.max(0, profit - mileageDeduction)
  const taxSetAside = taxRate > 0 ? taxableProfit * (taxRate / 100) : 0
  const takeHome = profit - taxSetAside
  return {
    profit, miles, rate, mileageDeduction, taxRate, taxableProfit, taxSetAside, takeHome,
    hasMileage: miles > 0 && rate > 0, hasTax: taxRate > 0,
    hasMoney: (s.moneyIn || 0) > 0 || (s.moneyOut || 0) > 0,
  }
}

// The last `months` calendar months (ending this month), each bucketed with its
// money in/out/net and hours — the trend chart's input. Independent of the range
// picker so the trend always shows recent history for context.
export function monthlySeries(entries, fields, months = 6) {
  const moneyInF = fieldsOfType(fields, 'moneyIn').map(f => f.id)
  const moneyOutF = fieldsOfType(fields, 'moneyOut').map(f => f.id)
  const hoursF = fieldsOfType(fields, 'hours').map(f => f.id)
  const now = new Date()
  const buckets = []
  const index = {}
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    const b = { key, label: d.toLocaleDateString('en-US', { month: 'short' }), moneyIn: 0, moneyOut: 0, net: 0, mins: 0 }
    index[key] = b; buckets.push(b)
  }
  for (const e of entries) {
    const key = (e.date || '').slice(0, 7)
    const b = index[key]; if (!b) continue
    for (const id of moneyInF) b.moneyIn += num(val(e, id))
    for (const id of moneyOutF) b.moneyOut += num(val(e, id))
    for (const id of hoursF) b.mins += num(val(e, id))
  }
  for (const b of buckets) b.net = b.moneyIn - b.moneyOut
  return buckets
}

// ── Donut aggregation ───────────────────────────────────────────
// Group entries by a dimension field (category or person) and sum a measure
// (a money/hours/number field), or count entries when measureId is null.
export function groupSlices(entries, dimField, measure, people, opts = {}) {
  const rows = entries.map(e => {
    let key, label
    if (dimField.type === 'person') {
      const pid = val(e, dimField.id)
      key = pid || '__un'; label = personName(people, pid)
    } else {
      const v = (val(e, dimField.id) || '').toString().trim()
      key = (v || 'Uncategorized').toLowerCase(); label = v || 'Uncategorized'
    }
    const value = measure ? num(val(e, measure.id)) : 1
    return { key, label, value }
  })
  return toSlices(rows, opts)
}
export function toSlices(rows, { max = 7, colorFor } = {}) {
  const merged = new Map()
  for (const r of rows) {
    if (!(r.value > 0)) continue
    const cur = merged.get(r.key) || { key: r.key, label: r.label, value: 0 }
    cur.value += r.value; merged.set(r.key, cur)
  }
  const sorted = [...merged.values()].sort((a, b) => b.value - a.value)
  const total = sorted.reduce((s, r) => s + r.value, 0) || 1
  const head = sorted.slice(0, max - 1 > 0 ? max - 1 : sorted.length)
  const tail = sorted.slice(head.length)
  const slices = head.map((r) => ({ ...r, color: colorFor ? colorFor(r.key) : undefined, pct: r.value / total }))
  if (tail.length) {
    const tv = tail.reduce((s, r) => s + r.value, 0)
    slices.push({ key: '__other', label: `Other (${tail.length})`, value: tv, color: OTHER_COLOR, other: true, pct: tv / total })
  }
  return { slices, total }
}
// Pick a few meaningful charts from the folder's fields: each money/hours measure
// grouped by the best available dimension. Capped at 4.
export function autoCharts(fields) {
  const dims = [...fieldsOfType(fields, 'category'), ...fieldsOfType(fields, 'person')]
  const measures = [...fieldsOfType(fields, 'moneyOut'), ...fieldsOfType(fields, 'moneyIn'), ...fieldsOfType(fields, 'hours')]
  const charts = []
  for (const meas of measures) {
    // Prefer a category dimension for money, a person dimension for hours.
    const dim = meas.type === 'hours'
      ? (firstFieldOfType(fields, 'person') || fieldsOfType(fields, 'category')[0])
      : (fieldsOfType(fields, 'category')[0] || firstFieldOfType(fields, 'person'))
    if (!dim) continue
    charts.push({ id: meas.id + '·' + dim.id, title: `${meas.name} by ${dim.name.toLowerCase()}`, measure: meas, dim })
    if (charts.length >= 4) break
  }
  return charts
}

// ── Recurring fixed costs ───────────────────────────────────────
// A tracker can define fixed monthly costs (rent, insurance…). They're added as
// real entries — one tap per month — so they show in the record and export. An
// entry created this way carries a `fixedKey` (`<costId>@<YYYY-MM>`) so the same
// cost is never added twice in the same month.
export function canUseFixedCosts(folder) { return !!firstFieldOfType(folder.fields || [], 'moneyOut') }
export function missingFixedCosts(folder, entries, mKey) {
  const costs = folder.fixedCosts || []
  if (!costs.length) return []
  const present = new Set(entries.filter(e => (e.date || '').slice(0, 7) === mKey && e.fixedKey).map(e => e.fixedKey))
  return costs.filter(c => !present.has(`${c.id}@${mKey}`))
}
export function makeFixedEntry(folder, cost, dateStr) {
  const moneyF = firstFieldOfType(folder.fields || [], 'moneyOut')
  if (!moneyF) return null
  const catF = firstFieldOfType(folder.fields || [], 'category')
  const textF = firstFieldOfType(folder.fields || [], 'text')
  const values = { [moneyF.id]: Number(cost.amount) || 0 }
  if (catF) values[catF.id] = cost.category || cost.label
  else if (textF) values[textF.id] = cost.label
  return { date: dateStr, values, fixedKey: `${cost.id}@${dateStr.slice(0, 7)}` }
}

// ── Highlights ──────────────────────────────────────────────────
export function computeHighlights({ entries = [], fields = [], people = [], folders = null, folder = {}, budgetMoney = null, budgetHours = null, prevEntries = null } = {}) {
  const out = []
  const s = summarize(entries, fields)
  const sym = folder.currency || '$'
  const $ = v => fmtMoney(v, sym)
  const f = financials(s, folder)
  if (s.moneyIn > 0 && s.moneyOut > 0) out.push({ icon: 'dollar', text: `You took in ${$(s.moneyIn)} and spent ${$(s.moneyOut)} — ${f.profit >= 0 ? 'a profit of ' + $(f.profit) : 'a loss of ' + $(-f.profit)}.` })
  else if (s.moneyOut > 0) out.push({ icon: 'dollar', text: `You spent ${$(s.moneyOut)} across ${s.count} ${s.count === 1 ? 'entry' : 'entries'}.` })
  else if (s.moneyIn > 0) out.push({ icon: 'dollar', text: `You took in ${$(s.moneyIn)}.` })
  // Tax reality: profit is not take-home.
  if (f.hasTax && f.profit > 0) out.push({ icon: 'chart', text: `Set aside about ${$(f.taxSetAside)} for taxes (${f.taxRate}%) — roughly ${$(f.takeHome)} is really yours.` })
  if (f.hasMileage) out.push({ icon: 'car', text: `${fmtNumber(f.miles)} deductible miles = ${$(f.mileageDeduction)} off your taxable profit${f.hasTax ? `, saving ~${$(f.mileageDeduction * f.taxRate / 100)} in taxes` : ''}.` })

  if (s.mins > 0) {
    const dh = decimalHours(s.mins)
    const hoursF = firstFieldOfType(fields, 'hours')
    const cat = fieldsOfType(fields, 'category')[0]
    let txt = `You logged ${dh} ${dh === 1 ? 'hour' : 'hours'}`
    if (hoursF && cat) {
      const top = groupSlices(entries, cat, hoursF, people).slices[0]
      if (top && top.key !== '__other' && top.pct >= 0.25) txt += `, mostly on ${top.label.toLowerCase()} (${Math.round(top.pct * 100)}%)`
    }
    out.push({ icon: 'clock', text: txt + '.' })
  }
  // Budgets remaining.
  if (budgetMoney > 0) {
    const left = budgetMoney - s.moneyOut
    out.push({ icon: 'chart', text: left >= 0 ? `${fmtMoney(left)} left of your ${fmtMoney(budgetMoney)} budget.` : `You're ${fmtMoney(-left)} over your ${fmtMoney(budgetMoney)} budget.` })
  }
  if (budgetHours > 0) {
    const left = budgetHours - s.mins
    out.push({ icon: 'clock', text: left >= 0 ? `${fmtHours(left)} left of your ${fmtHours(budgetHours)} time budget.` : `You're ${fmtHours(-left)} over your ${fmtHours(budgetHours)} time budget.` })
  }
  // A number field worth surfacing (e.g. miles).
  const numF = fieldsOfType(fields, 'number')[0]
  if (numF) { const tot = sumField(entries, numF.id); if (tot > 0) out.push({ icon: 'car', text: `${fmtNumber(tot)} ${numF.name.toLowerCase()} in total.` }) }
  // Trend vs previous period.
  if (prevEntries) {
    const p = summarize(prevEntries, fields)
    if (p.moneyOut > 0 && s.moneyOut > 0) { const d = Math.round(((s.moneyOut - p.moneyOut) / p.moneyOut) * 100); if (Math.abs(d) >= 10) out.push({ icon: 'chart', text: `Spending is ${Math.abs(d)}% ${d > 0 ? 'higher' : 'lower'} than the previous period.` }) }
  }
  return out
}

// ── Receipt image downscaling ───────────────────────────────────
export function compressImage(file, { maxDim = 900, quality = 0.6 } = {}) {
  return new Promise((resolve, reject) => {
    if (!file) return reject(new Error('No file'))
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      try {
        const scale = Math.min(1, maxDim / Math.max(img.width, img.height))
        const w = Math.max(1, Math.round(img.width * scale)), h = Math.max(1, Math.round(img.height * scale))
        const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h
        const ctx = canvas.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h); ctx.drawImage(img, 0, 0, w, h)
        URL.revokeObjectURL(url); resolve(canvas.toDataURL('image/jpeg', quality))
      } catch (e) { URL.revokeObjectURL(url); reject(e) }
    }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not read that image.')) }
    img.src = url
  })
}
export function dataUrlToBase64(dataUrl) { const i = (dataUrl || '').indexOf(','); return i >= 0 ? dataUrl.slice(i + 1) : '' }

// ── Columns (shared by table view, PDF and CSV) ─────────────────
// A column spec per field. `pdf`/`csv` render the value; `total` sums measures.
export function fieldColumns(fields, people) {
  const cols = [{ id: '__date', header: 'Date', kind: 'date', align: '', pdf: e => escHtml(prettyDate(e.date)), csv: e => e.date }]
  for (const f of fields) {
    const t = f.type, kind = FIELD_TYPES[t]?.kind
    if (t === 'moneyOut' || t === 'moneyIn') cols.push({ id: f.id, header: f.name, kind: 'money', align: 'num', measure: true, pdf: e => escHtml(num(val(e, f.id)) ? fmtMoney(val(e, f.id)) : '—'), csv: e => num(val(e, f.id)) ? num(val(e, f.id)).toFixed(2) : '' })
    else if (t === 'hours') cols.push({ id: f.id, header: f.name, kind: 'hours', align: 'num', measure: true, pdf: e => escHtml(num(val(e, f.id)) ? fmtHours(val(e, f.id)) : '—'), csv: e => num(val(e, f.id)) ? decimalHours(val(e, f.id)) : '' })
    else if (t === 'number' || t === 'mileage') cols.push({ id: f.id, header: f.name, kind: 'number', align: 'num', measure: true, pdf: e => escHtml(num(val(e, f.id)) ? fmtNumber(val(e, f.id)) : '—'), csv: e => num(val(e, f.id)) || '' })
    else if (t === 'person') cols.push({ id: f.id, header: f.name, kind: 'person', align: '', pdf: e => escHtml(personName(people, val(e, f.id))), csv: e => personName(people, val(e, f.id)) })
    else if (t === 'receipt') cols.push({ id: f.id, header: f.name, kind: 'receipt', align: 'rcptcol', pdf: e => val(e, f.id) ? `<img class="rcpt" src="${val(e, f.id)}" />` : '—', csv: null })
    else cols.push({ id: f.id, header: f.name, kind: 'text', align: t === 'text' ? 'wide' : '', pdf: e => escHtml((val(e, f.id) || '').toString().trim() || '—'), csv: e => (val(e, f.id) || '').toString() })
  }
  return cols
}
export function totalCell(col, entries) {
  if (!col.measure) return null
  const sum = sumField(entries, col.id)
  if (col.kind === 'hours') return fmtHours(sum)
  if (col.kind === 'money') return fmtMoney(sum)
  return fmtNumber(sum)
}

// ── CSV export ──────────────────────────────────────────────────
function csvCell(v) { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s }
export function buildCsv(columns, entries, extra = []) {
  const cols = [...extra, ...columns.filter(c => c.csv)]   // receipt columns (csv:null) skipped
  const header = cols.map(c => csvCell(c.header)).join(',')
  const body = entries.map(e => cols.map(c => csvCell(c.csv(e))).join(',')).join('\n')
  return header + '\n' + body + '\n'
}
export function downloadFile(filename, text, mime = 'text/csv;charset=utf-8') {
  const blob = new Blob([text], { type: mime }), url = URL.createObjectURL(blob)
  const a = document.createElement('a'); a.href = url; a.download = filename
  document.body.appendChild(a); a.click()
  setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url) }, 500)
}
export function safeFileName(s) { return (s || 'export').replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'export' }

// ── PDF report ──────────────────────────────────────────────────
function escHtml(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])) }
export function buildReportHtml({ title = 'Record', owner = '', rangeText = 'all time', fields = [], entries = [], people = [], columns = null, includeSummary = true, extraCols = [], folder = {} }) {
  const cols = [...extraCols, ...(columns || fieldColumns(fields, people))]
  const s = summarize(entries, fields)
  const sym = folder.currency || '$'
  const f = financials(s, folder)
  const generated = new Date().toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })
  // Financial cascade cards — only the lines that apply.
  const cards = []
  if (f.hasMoney) {
    cards.push(['Revenue', fmtMoney(s.moneyIn, sym)], ['Expenses', fmtMoney(s.moneyOut, sym)], ['Profit', fmtMoney(f.profit, sym)])
    if (f.hasMileage) cards.push(['Mileage deduction', '−' + fmtMoney(f.mileageDeduction, sym)])
    if (f.hasTax && f.profit > 0) cards.push([`Tax set-aside (${f.taxRate}%)`, '−' + fmtMoney(f.taxSetAside, sym)], ['Yours to keep', fmtMoney(f.takeHome, sym)])
  }
  if (s.mins > 0) cards.push(['Hours', String(decimalHours(s.mins))])
  const summaryHtml = includeSummary && cards.length
    ? `<section><div class="cards">${cards.map(c => `<div class="card"><div class="cval">${escHtml(c[1])}</div><div class="clab">${escHtml(c[0])}</div></div>`).join('')}</div></section>`
    : ''
  const rows = [...entries].sort((a, b) => (a.date || '').localeCompare(b.date || ''))
  const body = rows.length ? rows.map(e => `<tr>${cols.map(c => `<td class="${c.align || ''}">${c.pdf(e)}</td>`).join('')}</tr>`).join('')
    : `<tr><td colspan="${cols.length}" class="empty">No entries in this period.</td></tr>`
  const anyMeasure = cols.some(c => c.measure)
  const totalRow = anyMeasure && rows.length ? `<tfoot><tr>${cols.map((c, i) => {
    const tc = totalCell(c, entries)
    if (tc != null) return `<td class="num"><b>${escHtml(tc)}</b></td>`
    return i === 0 ? '<td><b>Total</b></td>' : '<td></td>'
  }).join('')}</tr></tfoot>` : ''

  return `<!doctype html><html><head><meta charset="utf-8"><title>${escHtml(title)}</title>
<style>
  @page { margin: 18mm 14mm; }
  * { box-sizing: border-box; }
  body { font-family: -apple-system, "Segoe UI", "DM Sans", Roboto, sans-serif; color: #1c2733; margin: 0; padding: 24px; font-size: 12px; }
  header { border-bottom: 2px solid #2A4858; padding-bottom: 12px; margin-bottom: 18px; }
  h1 { font-size: 19px; margin: 0 0 3px; color: #2A4858; }
  .meta { font-size: 11px; color: #667; }
  section { break-inside: avoid; }
  .cards { display: flex; gap: 10px; flex-wrap: wrap; margin: 6px 0 18px; }
  .card { flex: 1; min-width: 110px; border: 1px solid #dfe4ea; border-radius: 10px; padding: 12px 14px; }
  .cval { font-size: 19px; font-weight: 800; color: #2A4858; }
  .clab { font-size: 10.5px; color: #778; margin-top: 2px; text-transform: uppercase; letter-spacing: .5px; }
  table { width: 100%; border-collapse: collapse; margin-top: 4px; }
  th, td { text-align: left; padding: 7px 9px; border-bottom: 1px solid #eceff2; vertical-align: top; }
  th { font-size: 10px; text-transform: uppercase; letter-spacing: .5px; color: #778; border-bottom: 1.5px solid #cdd5dd; }
  td.num, th.num { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
  td.wide { color: #445; }
  tfoot td { border-top: 1.5px solid #cdd5dd; border-bottom: none; padding-top: 8px; }
  .empty { color: #99a; font-style: italic; padding: 14px 9px; }
  .rcpt { max-height: 54px; max-width: 90px; border-radius: 4px; border: 1px solid #dfe4ea; }
  tr { break-inside: avoid; }
  footer { margin-top: 26px; font-size: 10px; color: #99a; border-top: 1px solid #eceff2; padding-top: 8px; }
</style></head><body>
  <header>
    <h1>${escHtml(title)}</h1>
    ${owner ? `<div class="meta">${escHtml(owner)}</div>` : ''}
    <div class="meta">Period: ${escHtml(rangeText)} &nbsp;·&nbsp; Generated ${escHtml(generated)}</div>
  </header>
  ${summaryHtml}
  <table><thead><tr>${cols.map(c => `<th class="${c.align || ''}">${escHtml(c.header)}</th>`).join('')}</tr></thead><tbody>${body}</tbody>${totalRow}</table>
  <footer>Prepared with Bloom for record-keeping. Amounts and hours are as entered by the owner.</footer>
</body></html>`
}
// A generic table → printable HTML, for exports that span folders (different
// fields) where a normalized column set is passed in directly.
//   columns: [{ header, get(row), align?, total? }]   rows: plain objects
export function buildTableHtml({ title = 'Record', owner = '', rangeText = 'all time', cards = [], columns = [], rows = [] }) {
  const generated = new Date().toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })
  const cardsHtml = cards.length ? `<section><div class="cards">${cards.map(c => `<div class="card"><div class="cval">${escHtml(c.value)}</div><div class="clab">${escHtml(c.label)}</div></div>`).join('')}</div></section>` : ''
  const anyTotal = columns.some(c => c.total != null)
  const body = rows.length ? rows.map(r => `<tr>${columns.map(c => `<td class="${c.align || ''}">${escHtml(c.get(r))}</td>`).join('')}</tr>`).join('')
    : `<tr><td colspan="${columns.length}" class="empty">No entries in this period.</td></tr>`
  const totals = anyTotal && rows.length ? `<tfoot><tr>${columns.map((c, i) => c.total != null ? `<td class="${c.align || ''}"><b>${escHtml(c.total)}</b></td>` : (i === 0 ? '<td><b>Total</b></td>' : '<td></td>')).join('')}</tr></tfoot>` : ''
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escHtml(title)}</title>
<style>@page{margin:18mm 14mm}*{box-sizing:border-box}body{font-family:-apple-system,"Segoe UI","DM Sans",Roboto,sans-serif;color:#1c2733;margin:0;padding:24px;font-size:12px}header{border-bottom:2px solid #2A4858;padding-bottom:12px;margin-bottom:18px}h1{font-size:19px;margin:0 0 3px;color:#2A4858}.meta{font-size:11px;color:#667}.cards{display:flex;gap:10px;flex-wrap:wrap;margin:6px 0 18px}.card{flex:1;min-width:110px;border:1px solid #dfe4ea;border-radius:10px;padding:12px 14px}.cval{font-size:19px;font-weight:800;color:#2A4858}.clab{font-size:10.5px;color:#778;margin-top:2px;text-transform:uppercase;letter-spacing:.5px}table{width:100%;border-collapse:collapse;margin-top:4px}th,td{text-align:left;padding:7px 9px;border-bottom:1px solid #eceff2;vertical-align:top}th{font-size:10px;text-transform:uppercase;letter-spacing:.5px;color:#778;border-bottom:1.5px solid #cdd5dd}td.num,th.num{text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums}tfoot td{border-top:1.5px solid #cdd5dd;border-bottom:none;padding-top:8px}.empty{color:#99a;font-style:italic;padding:14px 9px}tr{break-inside:avoid}footer{margin-top:26px;font-size:10px;color:#99a;border-top:1px solid #eceff2;padding-top:8px}</style></head><body>
  <header><h1>${escHtml(title)}</h1>${owner ? `<div class="meta">${escHtml(owner)}</div>` : ''}<div class="meta">Period: ${escHtml(rangeText)} &nbsp;·&nbsp; Generated ${escHtml(generated)}</div></header>
  ${cardsHtml}
  <table><thead><tr>${columns.map(c => `<th class="${c.align || ''}">${escHtml(c.header)}</th>`).join('')}</tr></thead><tbody>${body}</tbody>${totals}</table>
  <footer>Prepared with Bloom for record-keeping. Amounts and hours are as entered by the owner.</footer></body></html>`
}
export function printReport(html) {
  const w = window.open('', '_blank')
  if (w && w.document) {
    w.document.open(); w.document.write(html); w.document.close()
    const go = () => { try { w.focus(); w.print() } catch {} }
    w.onload = () => setTimeout(go, 250); setTimeout(go, 700)
    return true
  }
  const iframe = document.createElement('iframe')
  iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0'
  document.body.appendChild(iframe)
  const doc = iframe.contentWindow.document
  doc.open(); doc.write(html); doc.close()
  setTimeout(() => { try { iframe.contentWindow.focus(); iframe.contentWindow.print() } catch {}; setTimeout(() => document.body.removeChild(iframe), 1000) }, 400)
  return true
}
