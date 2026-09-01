// src/lib/trackers.js
// ─────────────────────────────────────────────────────────────
// The engine behind the Insights trackers — now CATEGORY-FIRST. A tracker holds
// a list of categories (each income or expense); every entry picks a category
// (which decides whether its amount is money in or out) and can also carry your
// own time, a contractor's start→finish dates, mileage, a note, and an uploaded
// bill/receipt. Everything rolls into an honest financial cascade (profit →
// taxes → what's really yours), donut-free charts, plain-English highlights, and
// PDF / CSV export. Pure functions — no React.
// ─────────────────────────────────────────────────────────────

// ── Palette ─────────────────────────────────────────────────────
export const OTHER_COLOR = '#9AA7B2'
export const ACCENT_COLORS = ['#4A9EB5', '#E8804A', '#7C9CBF', '#5FA86E', '#C86FA0', '#B08968', '#6C7BC0', '#D08A3A']
export const CATEGORY_COLORS = ['#4A9EB5', '#E8804A', '#5FA86E', '#C86FA0', '#7C9CBF', '#D0A03A', '#6C7BC0', '#B0685E', '#3E9E6C', '#B279C0']
export const FOLDER_ICONS = ['bed', 'house', 'briefcase', 'sprout', 'car', 'camera', 'cart', 'wrench', 'paw', 'heart', 'flask', 'book']
// Semantic single-hue ramps for ranked bars (dark = biggest); on-theme, not a rainbow.
export const RAMPS = { spend: ['#B23A1E', '#F1B49E'], revenue: ['#2E7D5B', '#A9D3B4'], hours: ['#2A4858', '#8FC3D8'], neutral: ['#41607A', '#A9C2D4'] }
export const POS_COLOR = '#3E9E6C'
export const NEG_COLOR = '#E06A45'
export const DEFAULT_MILEAGE_RATE = 0.70
export const DEFAULT_TAX_RATE = 25

function hex2rgb(h) { const n = parseInt(h.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255] }
function rgb2hex(r, g, b) { return '#' + [r, g, b].map(x => Math.max(0, Math.min(255, Math.round(x))).toString(16).padStart(2, '0')).join('') }
export function rampColors(ramp, n) {
  const [d, l] = RAMPS[ramp] || RAMPS.neutral
  const [dr, dg, db] = hex2rgb(d), [lr, lg, lb] = hex2rgb(l)
  if (n <= 1) return [d]
  return Array.from({ length: n }, (_, i) => { const t = i / (n - 1); return rgb2hex(dr + (lr - dr) * t, dg + (lg - dg) * t, db + (lb - db) * t) })
}

// ── Categories & people ─────────────────────────────────────────
let _cid = 0
export function makeCategory(name, kind, color) { return { id: 'c' + Date.now().toString(36) + (_cid++).toString(36), name, kind, color: color || CATEGORY_COLORS[0] } }
export function categoryOf(folder, id) { return (folder?.categories || []).find(c => c.id === id) || null }
export function categoryName(folder, id) { const c = categoryOf(folder, id); return c ? c.name : 'Uncategorized' }
export function categoryKind(folder, id) { return categoryOf(folder, id)?.kind }
export function incomeCategories(folder) { return (folder?.categories || []).filter(c => c.kind === 'income') }
export function expenseCategories(folder) { return (folder?.categories || []).filter(c => c.kind === 'expense') }
export function personName(people, id) { if (!id) return ''; const p = (people || []).find(x => x.id === id); return p ? p.name : 'Unknown' }

// Starter templates — seed a sensible category list. Fields are fixed now.
export const TEMPLATES = [
  { id: 'bnb', name: 'Bed & Breakfast', icon: 'bed', categories: () => seed(
    ['Bookings', 'Deposits'], ['Supplies', 'Cleaning', 'Utilities', 'Repairs', 'Food', 'Payroll']) },
  { id: 'rental', name: 'Rental property', icon: 'house', categories: () => seed(
    ['Rent', 'Late fees'], ['Repairs', 'Utilities', 'Insurance', 'Management', 'Taxes']) },
  { id: 'freelance', name: 'Freelance / clients', icon: 'briefcase', categories: () => seed(
    ['Client work', 'Retainers'], ['Software', 'Travel', 'Supplies', 'Contractors']) },
  { id: 'mileage', name: 'Mileage & vehicle', icon: 'car', categories: () => seed(
    [], ['Fuel', 'Tolls', 'Maintenance', 'Parking']) },
  { id: 'blank', name: 'Blank (add your own)', icon: 'sprout', categories: () => [] },
]
function seed(income, expense) {
  let i = 0
  const out = []
  income.forEach(n => out.push(makeCategory(n, 'income', CATEGORY_COLORS[i++ % CATEGORY_COLORS.length])))
  expense.forEach(n => out.push(makeCategory(n, 'expense', CATEGORY_COLORS[i++ % CATEGORY_COLORS.length])))
  return out
}

// ── Numbers & dates ─────────────────────────────────────────────
export function num(v) { const n = Number(v); return Number.isFinite(n) ? n : 0 }
export function todayStr() { return iso(new Date()) }
function iso(d) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
export function daysBetween(a, b) {
  if (!a || !b) return null
  const da = new Date(a + 'T12:00:00'), db = new Date(b + 'T12:00:00')
  if (isNaN(da) || isNaN(db)) return null
  return Math.round((db - da) / 86400000)
}
export function turnaround(entry) {
  const d = daysBetween(entry.workStart, entry.workEnd)
  return d == null || d < 0 ? null : d
}

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
export function fmtDays(d) { return d == null ? '' : `${d} ${d === 1 ? 'day' : 'days'}` }

// ── Summary + financial cascade ─────────────────────────────────
export function summarize(entries, folder) {
  let moneyIn = 0, moneyOut = 0, mins = 0, miles = 0
  for (const e of entries) {
    const amt = num(e.amount)
    const k = categoryKind(folder, e.categoryId)
    if (k === 'income') moneyIn += amt
    else if (k === 'expense') moneyOut += amt
    mins += num(e.yourMins)
    miles += num(e.miles)
  }
  return { moneyIn, moneyOut, net: moneyIn - moneyOut, mins, miles, count: entries.length }
}
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

// ── Ranked-bar aggregation ──────────────────────────────────────
export function toSlices(rows, { max = 7 } = {}) {
  const merged = new Map()
  for (const r of rows) {
    if (!(r.value > 0)) continue
    const cur = merged.get(r.key) || { key: r.key, label: r.label, value: 0, color: r.color }
    cur.value += r.value; merged.set(r.key, cur)
  }
  const sorted = [...merged.values()].sort((a, b) => b.value - a.value)
  const total = sorted.reduce((s, r) => s + r.value, 0) || 1
  const head = sorted.slice(0, max - 1 > 0 ? max - 1 : sorted.length)
  const tail = sorted.slice(head.length)
  const slices = head.map(r => ({ ...r, pct: r.value / total }))
  if (tail.length) {
    const tv = tail.reduce((s, r) => s + r.value, 0)
    slices.push({ key: '__other', label: `Other (${tail.length})`, value: tv, color: OTHER_COLOR, other: true, pct: tv / total })
  }
  return { slices, total }
}
// Amount by category, split by kind. Uses each category's own color.
function moneyByCategory(entries, folder, kind) {
  const rows = entries
    .filter(e => categoryKind(folder, e.categoryId) === kind)
    .map(e => { const c = categoryOf(folder, e.categoryId); return { key: e.categoryId || '__u', label: c ? c.name : 'Uncategorized', value: num(e.amount), color: c?.color } })
  return toSlices(rows)
}
export const spendByCategory = (entries, folder) => moneyByCategory(entries, folder, 'expense')
export const incomeByCategory = (entries, folder) => moneyByCategory(entries, folder, 'income')
export function hoursByCategory(entries, folder) {
  const rows = entries.filter(e => num(e.yourMins) > 0).map(e => { const c = categoryOf(folder, e.categoryId); return { key: e.categoryId || '__u', label: c ? c.name : 'Uncategorized', value: num(e.yourMins), color: c?.color } })
  return toSlices(rows)
}
export function spendByPerson(entries, folder, people) {
  const rows = entries.filter(e => categoryKind(folder, e.categoryId) === 'expense' && e.personId).map(e => { const p = (people || []).find(x => x.id === e.personId); return { key: e.personId, label: p ? p.name : 'Unknown', value: num(e.amount), color: p?.color } })
  return toSlices(rows)
}

// The last `months` months, each bucketed for the trend chart.
export function monthlySeries(entries, folder, months = 6) {
  const now = new Date()
  const buckets = [], index = {}
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    const b = { key, label: d.toLocaleDateString('en-US', { month: 'short' }), moneyIn: 0, moneyOut: 0, net: 0, mins: 0 }
    index[key] = b; buckets.push(b)
  }
  for (const e of entries) {
    const b = index[(e.date || '').slice(0, 7)]; if (!b) continue
    const k = categoryKind(folder, e.categoryId)
    if (k === 'income') b.moneyIn += num(e.amount)
    else if (k === 'expense') b.moneyOut += num(e.amount)
    b.mins += num(e.yourMins)
  }
  for (const b of buckets) b.net = b.moneyIn - b.moneyOut
  return buckets
}

// ── Highlights ──────────────────────────────────────────────────
export function computeHighlights({ entries = [], folder = {}, people = [], budgetMoney = null, budgetHours = null, prevEntries = null } = {}) {
  const out = []
  const s = summarize(entries, folder)
  const sym = folder.currency || '$'
  const $ = v => fmtMoney(v, sym)
  const f = financials(s, folder)
  if (s.moneyIn > 0 && s.moneyOut > 0) out.push({ icon: 'dollar', text: `You took in ${$(s.moneyIn)} and spent ${$(s.moneyOut)} — ${f.profit >= 0 ? 'a profit of ' + $(f.profit) : 'a loss of ' + $(-f.profit)}.` })
  else if (s.moneyOut > 0) out.push({ icon: 'dollar', text: `You spent ${$(s.moneyOut)} across ${s.count} ${s.count === 1 ? 'entry' : 'entries'}.` })
  else if (s.moneyIn > 0) out.push({ icon: 'dollar', text: `You took in ${$(s.moneyIn)}.` })
  if (f.hasTax && f.profit > 0) out.push({ icon: 'chart', text: `Set aside about ${$(f.taxSetAside)} for taxes (${f.taxRate}%) — roughly ${$(f.takeHome)} is really yours.` })
  if (f.hasMileage) out.push({ icon: 'car', text: `${fmtNumber(f.miles)} deductible miles = ${$(f.mileageDeduction)} off your taxable profit${f.hasTax ? `, saving ~${$(f.mileageDeduction * f.taxRate / 100)} in taxes` : ''}.` })
  if (s.moneyOut > 0) { const top = spendByCategory(entries, folder).slices[0]; if (top && !top.other && top.pct >= 0.25) out.push({ icon: 'chart', text: `Most spending was ${top.label.toLowerCase()} (${Math.round(top.pct * 100)}%).` }) }
  if (s.mins > 0) { const dh = decimalHours(s.mins); out.push({ icon: 'clock', text: `You logged ${dh} ${dh === 1 ? 'hour' : 'hours'} of your own time.` }) }
  if (budgetMoney > 0) { const left = budgetMoney - s.moneyOut; out.push({ icon: 'chart', text: left >= 0 ? `${$(left)} left of your ${$(budgetMoney)} budget.` : `You're ${$(-left)} over your ${$(budgetMoney)} budget.` }) }
  if (prevEntries) { const p = summarize(prevEntries, folder); if (p.moneyOut > 0 && s.moneyOut > 0) { const d = Math.round(((s.moneyOut - p.moneyOut) / p.moneyOut) * 100); if (Math.abs(d) >= 10) out.push({ icon: 'chart', text: `Spending is ${Math.abs(d)}% ${d > 0 ? 'higher' : 'lower'} than the previous period.` }) } }
  return out
}

// ── Recurring fixed costs ───────────────────────────────────────
// A fixed cost is { id, label, amount, categoryId } (an expense category).
export function canUseFixedCosts(folder) { return expenseCategories(folder).length > 0 }
export function missingFixedCosts(folder, entries, mKey) {
  const costs = folder.fixedCosts || []
  if (!costs.length) return []
  const present = new Set(entries.filter(e => (e.date || '').slice(0, 7) === mKey && e.fixedKey).map(e => e.fixedKey))
  return costs.filter(c => !present.has(`${c.id}@${mKey}`))
}
export function makeFixedEntry(folder, cost, dateStr) {
  const catId = cost.categoryId || expenseCategories(folder)[0]?.id
  if (!catId) return null
  return { date: dateStr, categoryId: catId, amount: Number(cost.amount) || 0, note: cost.label, fixedKey: `${cost.id}@${dateStr.slice(0, 7)}` }
}

// ── Export columns (table view, PDF, CSV) ───────────────────────
export function entryColumns(folder, people) {
  const sym = folder.currency || '$'
  return [
    { id: 'date', header: 'Date', align: '', get: e => prettyDate(e.date), csv: e => e.date },
    { id: 'category', header: 'Category', align: '', get: e => categoryName(folder, e.categoryId), csv: e => categoryName(folder, e.categoryId) },
    { id: 'type', header: 'Type', align: '', get: e => categoryKind(folder, e.categoryId) || '', csv: e => categoryKind(folder, e.categoryId) || '' },
    { id: 'person', header: 'Paid to / who', align: '', get: e => personName(people, e.personId) || '—', csv: e => personName(people, e.personId) },
    { id: 'amount', header: 'Amount', align: 'num', get: e => (categoryKind(folder, e.categoryId) === 'expense' ? '−' : '') + fmtMoney(e.amount, sym), csv: e => (categoryKind(folder, e.categoryId) === 'expense' ? -num(e.amount) : num(e.amount)).toFixed(2) },
    { id: 'yourtime', header: 'Your time', align: 'num', get: e => num(e.yourMins) ? fmtHours(e.yourMins) : '—', csv: e => num(e.yourMins) ? decimalHours(e.yourMins) : '' },
    { id: 'started', header: 'Work started', align: '', get: e => e.workStart ? prettyDate(e.workStart) : '—', csv: e => e.workStart || '' },
    { id: 'finished', header: 'Work finished', align: '', get: e => e.workEnd ? prettyDate(e.workEnd) : '—', csv: e => e.workEnd || '' },
    { id: 'days', header: 'Days to complete', align: 'num', get: e => { const d = turnaround(e); return d == null ? '—' : String(d) }, csv: e => { const d = turnaround(e); return d == null ? '' : d } },
    { id: 'miles', header: 'Miles', align: 'num', get: e => num(e.miles) ? fmtNumber(e.miles) : '—', csv: e => num(e.miles) || '' },
    { id: 'note', header: 'Note', align: 'wide', get: e => e.note || '—', csv: e => e.note || '' },
  ]
}

// ── CSV export ──────────────────────────────────────────────────
function csvCell(v) { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s }
export function buildCsv(columns, entries, extra = []) {
  const cols = [...extra, ...columns]
  const header = cols.map(c => csvCell(c.header)).join(',')
  const body = entries.map(e => cols.map(c => csvCell(c.csv ? c.csv(e) : c.get(e))).join(',')).join('\n')
  return header + '\n' + body + '\n'
}
export function downloadFile(filename, text, mime = 'text/csv;charset=utf-8') {
  const blob = new Blob([text], { type: mime }), url = URL.createObjectURL(blob)
  const a = document.createElement('a'); a.href = url; a.download = filename
  document.body.appendChild(a); a.click()
  setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url) }, 500)
}
export function safeFileName(s) { return (s || 'export').replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'export' }

// ── Receipt/bill image downscaling ──────────────────────────────
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

// ── PDF report ──────────────────────────────────────────────────
function escHtml(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])) }
export function buildReportHtml({ title = 'Record', owner = '', rangeText = 'all time', folder = {}, people = [], entries = [], columns = null, includeSummary = true, includeBills = false }) {
  const cols = columns || entryColumns(folder, people)
  const s = summarize(entries, folder)
  const sym = folder.currency || '$'
  const f = financials(s, folder)
  const generated = new Date().toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })
  const cards = []
  if (f.hasMoney) {
    cards.push(['Revenue', fmtMoney(s.moneyIn, sym)], ['Expenses', fmtMoney(s.moneyOut, sym)], ['Profit', fmtMoney(f.profit, sym)])
    if (f.hasMileage) cards.push(['Mileage deduction', '−' + fmtMoney(f.mileageDeduction, sym)])
    if (f.hasTax && f.profit > 0) cards.push([`Tax set-aside (${f.taxRate}%)`, '−' + fmtMoney(f.taxSetAside, sym)], ['Yours to keep', fmtMoney(f.takeHome, sym)])
  }
  if (s.mins > 0) cards.push(['Your hours', String(decimalHours(s.mins))])
  const summaryHtml = includeSummary && cards.length
    ? `<section><div class="cards">${cards.map(c => `<div class="card"><div class="cval">${escHtml(c[1])}</div><div class="clab">${escHtml(c[0])}</div></div>`).join('')}</div></section>` : ''
  const allCols = includeBills ? [...cols, { id: 'bill', header: 'Bill', align: 'rcptcol', get: e => e.bill ? `<img class="rcpt" src="${e.bill}" />` : '—' }] : cols
  const rows = [...entries].sort((a, b) => (a.date || '').localeCompare(b.date || ''))
  const body = rows.length ? rows.map(e => `<tr>${allCols.map(c => `<td class="${c.align || ''}">${c.id === 'bill' ? c.get(e) : escHtml(c.get(e))}</td>`).join('')}</tr>`).join('')
    : `<tr><td colspan="${allCols.length}" class="empty">No entries in this period.</td></tr>`
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
  .empty { color: #99a; font-style: italic; padding: 14px 9px; }
  .rcpt { max-height: 54px; max-width: 90px; border-radius: 4px; border: 1px solid #dfe4ea; }
  tr { break-inside: avoid; }
  footer { margin-top: 26px; font-size: 10px; color: #99a; border-top: 1px solid #eceff2; padding-top: 8px; }
</style></head><body>
  <header><h1>${escHtml(title)}</h1>${owner ? `<div class="meta">${escHtml(owner)}</div>` : ''}<div class="meta">Period: ${escHtml(rangeText)} &nbsp;·&nbsp; Generated ${escHtml(generated)}</div></header>
  ${summaryHtml}
  <table><thead><tr>${allCols.map(c => `<th class="${c.align || ''}">${escHtml(c.header)}</th>`).join('')}</tr></thead><tbody>${body}</tbody></table>
  <footer>Prepared with Bloom for record-keeping. Amounts and hours are as entered by the owner.</footer>
</body></html>`
}
// A generic table → HTML, for the cross-tracker overview export.
export function buildTableHtml({ title = 'Record', owner = '', rangeText = 'all time', cards = [], columns = [], rows = [] }) {
  const generated = new Date().toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })
  const cardsHtml = cards.length ? `<section><div class="cards">${cards.map(c => `<div class="card"><div class="cval">${escHtml(c.value)}</div><div class="clab">${escHtml(c.label)}</div></div>`).join('')}</div></section>` : ''
  const body = rows.length ? rows.map(r => `<tr>${columns.map(c => `<td class="${c.align || ''}">${escHtml(c.get(r))}</td>`).join('')}</tr>`).join('')
    : `<tr><td colspan="${columns.length}" class="empty">No entries in this period.</td></tr>`
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escHtml(title)}</title>
<style>@page{margin:18mm 14mm}*{box-sizing:border-box}body{font-family:-apple-system,"Segoe UI","DM Sans",Roboto,sans-serif;color:#1c2733;margin:0;padding:24px;font-size:12px}header{border-bottom:2px solid #2A4858;padding-bottom:12px;margin-bottom:18px}h1{font-size:19px;margin:0 0 3px;color:#2A4858}.meta{font-size:11px;color:#667}.cards{display:flex;gap:10px;flex-wrap:wrap;margin:6px 0 18px}.card{flex:1;min-width:110px;border:1px solid #dfe4ea;border-radius:10px;padding:12px 14px}.cval{font-size:19px;font-weight:800;color:#2A4858}.clab{font-size:10.5px;color:#778;margin-top:2px;text-transform:uppercase;letter-spacing:.5px}table{width:100%;border-collapse:collapse;margin-top:4px}th,td{text-align:left;padding:7px 9px;border-bottom:1px solid #eceff2;vertical-align:top}th{font-size:10px;text-transform:uppercase;letter-spacing:.5px;color:#778;border-bottom:1.5px solid #cdd5dd}td.num,th.num{text-align:right;white-space:nowrap}.empty{color:#99a;font-style:italic;padding:14px 9px}tr{break-inside:avoid}footer{margin-top:26px;font-size:10px;color:#99a;border-top:1px solid #eceff2;padding-top:8px}</style></head><body>
  <header><h1>${escHtml(title)}</h1>${owner ? `<div class="meta">${escHtml(owner)}</div>` : ''}<div class="meta">Period: ${escHtml(rangeText)} &nbsp;·&nbsp; Generated ${escHtml(generated)}</div></header>
  ${cardsHtml}
  <table><thead><tr>${columns.map(c => `<th class="${c.align || ''}">${escHtml(c.header)}</th>`).join('')}</tr></thead><tbody>${body}</tbody></table>
  <footer>Prepared with Bloom for record-keeping.</footer></body></html>`
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
