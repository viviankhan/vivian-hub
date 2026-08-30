// src/lib/bnb.js
// ─────────────────────────────────────────────────────────────
// The number-crunching + helpers behind the B&B work/expense tracker
// (components/BnbTracker.jsx). Date ranges, aggregation for the donut charts,
// totals, itemized-report rows, money/hours formatting, and receipt-image
// downscaling. No React here — pure functions, easy to reason about.
// ─────────────────────────────────────────────────────────────

// ── Categorical palette ─────────────────────────────────────────
// The validated data-viz categorical order (see the dataviz skill). Assigned in
// fixed order, never cycled; a 7th+ slice folds into "Other" (grey). Charts ship
// direct labels + a legend, so identity is never carried by color alone (the
// contrast relief rule — these hues sit below 3:1 on white).
export const SLICE_COLORS = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#4a3aa7', '#e34948']
export const OTHER_COLOR = '#8899AA'
// A stable, friendly palette to auto-assign to workers.
export const WORKER_COLORS = ['#4A9EB5', '#E8804A', '#7C9CBF', '#5FA86E', '#C86FA0', '#B08968', '#6C7BC0', '#D08A3A']

// ── Dates ───────────────────────────────────────────────────────
export function todayStr() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function iso(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// The preset ranges the tracker offers. Each resolves to { start, end } ISO
// dates (inclusive) against "today", or null bounds for "all time".
export const RANGE_PRESETS = [
  ['this-month', 'This month'],
  ['last-month', 'Last month'],
  ['this-quarter', 'This quarter'],
  ['ytd', 'This year'],
  ['last-year', 'Last year'],
  ['last-30', 'Last 30 days'],
  ['last-90', 'Last 90 days'],
  ['all', 'All time'],
  ['custom', 'Custom…'],
]
export function resolveRange(preset, custom) {
  const now = new Date()
  const y = now.getFullYear(), m = now.getMonth()
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
    case 'all':
    default:             return { start: '', end: '' }
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
  if (isNaN(dt)) return d
  return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

// ── Formatting ──────────────────────────────────────────────────
export function fmtHours(mins) {
  const m = Math.max(0, Math.round(mins || 0))
  const h = Math.floor(m / 60), r = m % 60
  if (h === 0) return `${r}m`
  if (r === 0) return `${h}h`
  return `${h}h ${r}m`
}
export function decimalHours(mins) { return Math.round((mins || 0) / 6) / 10 }
export function fmtMoney(amount, symbol = '$') {
  const n = Number(amount) || 0
  return `${n < 0 ? '-' : ''}${symbol}${Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}
export function fmtMiles(mi) {
  const n = Number(mi) || 0
  return `${n.toLocaleString('en-US', { maximumFractionDigits: 1 })} mi`
}

// ── Lookups ─────────────────────────────────────────────────────
export function workerName(workers, id) {
  if (!id) return 'Unassigned'
  const w = (workers || []).find(x => x.id === id)
  return w ? w.name : 'Unknown'
}
export function workerColor(workers, id) {
  const w = (workers || []).find(x => x.id === id)
  return w?.color || OTHER_COLOR
}

// ── Aggregation for the donut charts ────────────────────────────
// Roll a list of { key, label, value } rows into slices: top `max-1` by value,
// the rest folded into a single grey "Other". Colors assigned in fixed order.
// A per-key color map (for workers) can override the categorical assignment.
export function toSlices(rows, { max = 7, colorFor } = {}) {
  const merged = new Map()
  for (const r of rows) {
    if (!(r.value > 0)) continue
    const cur = merged.get(r.key) || { key: r.key, label: r.label, value: 0 }
    cur.value += r.value
    merged.set(r.key, cur)
  }
  const sorted = [...merged.values()].sort((a, b) => b.value - a.value)
  const total = sorted.reduce((s, r) => s + r.value, 0) || 1
  const head = sorted.slice(0, max - 1 > 0 ? max - 1 : sorted.length)
  const tail = sorted.slice(head.length)
  const slices = head.map((r, i) => ({
    ...r,
    color: colorFor ? colorFor(r.key) : SLICE_COLORS[i % SLICE_COLORS.length],
    pct: r.value / total,
  }))
  if (tail.length) {
    const tv = tail.reduce((s, r) => s + r.value, 0)
    slices.push({ key: '__other', label: `Other (${tail.length})`, value: tv, color: OTHER_COLOR, pct: tv / total })
  }
  return { slices, total }
}

// Group sessions' minutes by activity label, and by worker.
export function hoursByActivity(sessions) {
  return (sessions || []).map(s => ({ key: (s.activity || 'Other').trim() || 'Other', label: (s.activity || 'Other').trim() || 'Other', value: s.mins || 0 }))
}
export function hoursByWorker(sessions, workers) {
  return (sessions || []).map(s => ({ key: s.workerId || '__un', label: workerName(workers, s.workerId), value: s.mins || 0 }))
}
export function spendByCategory(expenses) {
  return (expenses || []).map(e => ({ key: (e.category || 'Other').trim() || 'Other', label: (e.category || 'Other').trim() || 'Other', value: Number(e.amount) || 0 }))
}
export function spendByPayee(expenses, workers) {
  return (expenses || []).map(e => {
    const label = (e.paidTo || '').trim() || (e.workerId ? workerName(workers, e.workerId) : 'Unspecified')
    return { key: label.toLowerCase(), label, value: Number(e.amount) || 0 }
  })
}

// Headline totals for a filtered set.
export function totals(sessions, expenses) {
  const mins = (sessions || []).reduce((s, r) => s + (r.mins || 0), 0)
  const sessMiles = (sessions || []).reduce((s, r) => s + (Number(r.miles) || 0), 0)
  const spent = (expenses || []).reduce((s, r) => s + (Number(r.amount) || 0), 0)
  const expMiles = (expenses || []).reduce((s, r) => s + (Number(r.miles) || 0), 0)
  return {
    mins, hours: decimalHours(mins),
    spent,
    miles: sessMiles + expMiles,
    sessionCount: (sessions || []).length,
    expenseCount: (expenses || []).length,
  }
}

// ── Receipt image downscaling ───────────────────────────────────
// Read an uploaded image file, downscale it to fit `maxDim`, and return a JPEG
// data URL. Used both for the copy we keep on the expense (small) and the copy
// we send to the AI parser (larger). Keeps a multi-MB phone photo from bloating
// the kv_store blob or the AI request.
export function compressImage(file, { maxDim = 900, quality = 0.6 } = {}) {
  return new Promise((resolve, reject) => {
    if (!file) return reject(new Error('No file'))
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      try {
        const scale = Math.min(1, maxDim / Math.max(img.width, img.height))
        const w = Math.max(1, Math.round(img.width * scale))
        const h = Math.max(1, Math.round(img.height * scale))
        const canvas = document.createElement('canvas')
        canvas.width = w; canvas.height = h
        const ctx = canvas.getContext('2d')
        ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, w, h)
        ctx.drawImage(img, 0, 0, w, h)
        URL.revokeObjectURL(url)
        resolve(canvas.toDataURL('image/jpeg', quality))
      } catch (e) { URL.revokeObjectURL(url); reject(e) }
    }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not read that image.')) }
    img.src = url
  })
}
// Strip the "data:image/jpeg;base64," prefix → the raw base64 the AI wants.
export function dataUrlToBase64(dataUrl) {
  const i = (dataUrl || '').indexOf(',')
  return i >= 0 ? dataUrl.slice(i + 1) : ''
}

// ── Itemized report → printable HTML (Save as PDF) ──────────────
// Builds a self-contained, print-optimized HTML document from the filtered
// sessions/expenses and the user's chosen columns/sections. The tracker opens it
// in a new window and calls print(); the browser's "Save as PDF" does the rest —
// no PDF library, works offline. All user text is escaped.
function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
}
export function buildReportHtml(opts) {
  const {
    title = 'Bed & Breakfast — Work & Expense Record',
    owner = '',
    symbol = '$',
    rangeText = 'all time',
    sessions = [], expenses = [], workers = [],
    sections = { summary: true, hours: true, expenses: true, byWorker: true },
    hoursCols = { date: true, worker: true, activity: true, description: true, hours: true, miles: false },
    expenseCols = { date: true, paidTo: true, category: true, description: true, amount: true, miles: false },
    includeReceipts = false,
  } = opts || {}

  const t = totals(sessions, expenses)
  const money = v => fmtMoney(v, symbol)
  const generated = new Date().toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })

  // Summary cards
  const summaryHtml = sections.summary ? `
    <section>
      <div class="cards">
        <div class="card"><div class="cval">${decimalHours(t.mins)}</div><div class="clab">Hours worked</div></div>
        <div class="card"><div class="cval">${esc(money(t.spent))}</div><div class="clab">Total spent</div></div>
        <div class="card"><div class="cval">${t.miles.toLocaleString('en-US', { maximumFractionDigits: 1 })}</div><div class="clab">Miles driven</div></div>
        <div class="card"><div class="cval">${t.sessionCount + t.expenseCount}</div><div class="clab">Entries</div></div>
      </div>
    </section>` : ''

  // Hours table
  let hoursHtml = ''
  if (sections.hours) {
    const cols = []
    if (hoursCols.date) cols.push(['Date', s => esc(prettyDate(s.date)), ''])
    if (hoursCols.worker) cols.push(['Worker', s => esc(workerName(workers, s.workerId)), ''])
    if (hoursCols.activity) cols.push(['Activity', s => esc((s.activity || '').trim() || '—'), ''])
    if (hoursCols.description) cols.push(['What was done', s => esc((s.title || s.notes || '').trim() || '—'), 'wide'])
    if (hoursCols.miles) cols.push(['Miles', s => (Number(s.miles) || 0) ? esc(fmtMiles(s.miles)) : '—', 'num'])
    if (hoursCols.hours) cols.push(['Hours', s => esc(fmtHours(s.mins)), 'num'])
    const rows = [...sessions].sort((a, b) => (a.date || '').localeCompare(b.date || ''))
    const body = rows.length ? rows.map(s => `<tr>${cols.map(c => `<td class="${c[2]}">${c[1](s)}</td>`).join('')}</tr>`).join('')
      : `<tr><td colspan="${cols.length}" class="empty">No hours logged in this period.</td></tr>`
    const totalCells = cols.map((c, i) => {
      if (c[0] === 'Hours') return `<td class="num"><b>${esc(fmtHours(t.mins))}</b></td>`
      if (c[0] === 'Miles') return `<td class="num"><b>${(sessions.reduce((s, r) => s + (Number(r.miles) || 0), 0)).toLocaleString('en-US', { maximumFractionDigits: 1 })} mi</b></td>`
      return i === 0 ? '<td><b>Total</b></td>' : '<td></td>'
    }).join('')
    hoursHtml = `
      <section>
        <h2>Hours worked</h2>
        <table>
          <thead><tr>${cols.map(c => `<th class="${c[2]}">${c[0]}</th>`).join('')}</tr></thead>
          <tbody>${body}</tbody>
          ${rows.length ? `<tfoot><tr>${totalCells}</tr></tfoot>` : ''}
        </table>
      </section>`
  }

  // Expenses table
  let expHtml = ''
  if (sections.expenses) {
    const cols = []
    if (expenseCols.date) cols.push(['Date', e => esc(prettyDate(e.date)), ''])
    if (expenseCols.paidTo) cols.push(['Paid to', e => esc((e.paidTo || '').trim() || (e.workerId ? workerName(workers, e.workerId) : '—')), ''])
    if (expenseCols.category) cols.push(['Category', e => esc((e.category || '').trim() || '—'), ''])
    if (expenseCols.description) cols.push(['What for', e => esc((e.description || '').trim() || '—'), 'wide'])
    if (expenseCols.miles) cols.push(['Miles', e => (Number(e.miles) || 0) ? esc(fmtMiles(e.miles)) : '—', 'num'])
    if (includeReceipts) cols.push(['Receipt', e => e.receipt ? `<img class="rcpt" src="${e.receipt}" />` : '—', 'rcptcol'])
    if (expenseCols.amount) cols.push(['Amount', e => esc(money(e.amount)), 'num'])
    const rows = [...expenses].sort((a, b) => (a.date || '').localeCompare(b.date || ''))
    const body = rows.length ? rows.map(e => `<tr>${cols.map(c => `<td class="${c[2]}">${c[1](e)}</td>`).join('')}</tr>`).join('')
      : `<tr><td colspan="${cols.length}" class="empty">No expenses logged in this period.</td></tr>`
    const totalCells = cols.map((c, i) => {
      if (c[0] === 'Amount') return `<td class="num"><b>${esc(money(t.spent))}</b></td>`
      if (c[0] === 'Miles') return `<td class="num"><b>${(expenses.reduce((s, r) => s + (Number(r.miles) || 0), 0)).toLocaleString('en-US', { maximumFractionDigits: 1 })} mi</b></td>`
      return i === 0 ? '<td><b>Total</b></td>' : '<td></td>'
    }).join('')
    expHtml = `
      <section>
        <h2>Expenses</h2>
        <table>
          <thead><tr>${cols.map(c => `<th class="${c[2]}">${c[0]}</th>`).join('')}</tr></thead>
          <tbody>${body}</tbody>
          ${rows.length ? `<tfoot><tr>${totalCells}</tr></tfoot>` : ''}
        </table>
      </section>`
  }

  // Per-worker breakdown
  let byWorkerHtml = ''
  if (sections.byWorker) {
    const rows = (workers || []).map(w => {
      const ws = sessions.filter(s => s.workerId === w.id)
      const wm = ws.reduce((s, r) => s + (r.mins || 0), 0)
      const wp = expenses.filter(e => e.workerId === w.id).reduce((s, r) => s + (Number(r.amount) || 0), 0)
      return { name: w.name, mins: wm, paid: wp, count: ws.length }
    }).filter(r => r.mins > 0 || r.paid > 0)
    const unassigned = sessions.filter(s => !s.workerId)
    const um = unassigned.reduce((s, r) => s + (r.mins || 0), 0)
    if (um > 0) rows.push({ name: 'Unassigned', mins: um, paid: 0, count: unassigned.length })
    if (rows.length) {
      byWorkerHtml = `
        <section>
          <h2>By person</h2>
          <table>
            <thead><tr><th>Person</th><th class="num">Hours</th><th class="num">Paid to them</th></tr></thead>
            <tbody>${rows.map(r => `<tr><td>${esc(r.name)}</td><td class="num">${esc(fmtHours(r.mins))}</td><td class="num">${esc(money(r.paid))}</td></tr>`).join('')}</tbody>
          </table>
        </section>`
    }
  }

  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title>
<style>
  @page { margin: 18mm 14mm; }
  * { box-sizing: border-box; }
  body { font-family: -apple-system, "Segoe UI", "DM Sans", Roboto, sans-serif; color: #1c2733; margin: 0; padding: 24px; font-size: 12px; }
  header { border-bottom: 2px solid #2A4858; padding-bottom: 12px; margin-bottom: 18px; }
  h1 { font-size: 19px; margin: 0 0 3px; color: #2A4858; }
  .meta { font-size: 11px; color: #667; }
  h2 { font-size: 14px; color: #2A4858; margin: 22px 0 8px; }
  section { break-inside: avoid; }
  .cards { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 6px; }
  .card { flex: 1; min-width: 120px; border: 1px solid #dfe4ea; border-radius: 10px; padding: 12px 14px; }
  .cval { font-size: 20px; font-weight: 800; color: #2A4858; }
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
    <h1>${esc(title)}</h1>
    ${owner ? `<div class="meta">${esc(owner)}</div>` : ''}
    <div class="meta">Period: ${esc(rangeText)} &nbsp;·&nbsp; Generated ${esc(generated)}</div>
  </header>
  ${summaryHtml}
  ${hoursHtml}
  ${expHtml}
  ${byWorkerHtml}
  <footer>Prepared with Bloom for record-keeping. Amounts and hours are as entered by the owner.</footer>
</body></html>`
}

// Open a report document and trigger the print / Save-as-PDF dialog. Falls back
// to a hidden iframe if the popup is blocked.
export function printReport(html) {
  const w = window.open('', '_blank')
  if (w && w.document) {
    w.document.open(); w.document.write(html); w.document.close()
    // Give images (receipt thumbnails) a beat to lay out before printing.
    const go = () => { try { w.focus(); w.print() } catch {} }
    w.onload = () => setTimeout(go, 250)
    setTimeout(go, 700)   // fallback if onload already passed
    return true
  }
  // Popup blocked — render into a hidden iframe and print that.
  const iframe = document.createElement('iframe')
  iframe.style.position = 'fixed'; iframe.style.right = '0'; iframe.style.bottom = '0'
  iframe.style.width = '0'; iframe.style.height = '0'; iframe.style.border = '0'
  document.body.appendChild(iframe)
  const doc = iframe.contentWindow.document
  doc.open(); doc.write(html); doc.close()
  setTimeout(() => {
    try { iframe.contentWindow.focus(); iframe.contentWindow.print() } catch {}
    setTimeout(() => document.body.removeChild(iframe), 1000)
  }, 400)
  return true
}
