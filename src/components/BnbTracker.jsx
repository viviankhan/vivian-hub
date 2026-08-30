// src/components/BnbTracker.jsx
// ─────────────────────────────────────────────────────────────
// The bed-and-breakfast work & expense tracker. Log hours (by person, on what
// activity, what got done) and money spent (to whom, for what, when), see it
// summarized as donut charts over any time frame, download an itemized PDF for
// tax records, and scan a receipt photo to auto-fill an expense.
//
// Self-contained: it loads and persists its own data (three per-user kv_store
// blobs — see storage.getBnb*), so wiring into App is just rendering this tab.
// ─────────────────────────────────────────────────────────────
import { useEffect, useMemo, useState, useRef } from 'react'
import {
  getBnbWorkers, setBnbWorkers, getBnbSessions, setBnbSessions,
  getBnbExpenses, setBnbExpenses, getBnbCats, setBnbCats,
} from '../lib/storage.js'
import {
  RANGE_PRESETS, resolveRange, inRange, rangeLabel, todayStr,
  fmtHours, decimalHours, fmtMoney, fmtMiles, workerName, WORKER_COLORS,
  hoursByActivity, hoursByWorker, spendByCategory, spendByPayee, toSlices, totals,
  compressImage, dataUrlToBase64, buildReportHtml, printReport, prettyDate,
} from '../lib/bnb.js'
import DonutChart from './DonutChart.jsx'
import { scanReceipt, receiptScanAvailable } from '../lib/parseReceipt.js'

const uid = (p) => `${p}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`

const SUBTABS = [
  ['summary', 'Summary'],
  ['hours', 'Hours'],
  ['expenses', 'Expenses'],
  ['people', 'People'],
]

// ── Shared little UI bits ───────────────────────────────────────
const inputStyle = {
  width: '100%', fontSize: 14, padding: '10px 12px', borderRadius: 10,
  border: '1px solid var(--border)', background: 'white', color: 'var(--text)',
  fontFamily: 'DM Sans,sans-serif', boxSizing: 'border-box', outline: 'none',
}
const labelStyle = { fontSize: 11.5, fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: 5 }
function Field({ label, children }) {
  return <div style={{ marginBottom: 12 }}><label style={labelStyle}>{label}</label>{children}</div>
}
function primaryBtn(enabled = true) {
  return { padding: '11px 18px', borderRadius: 11, border: 'none', cursor: enabled ? 'pointer' : 'default',
    fontFamily: 'DM Sans,sans-serif', fontWeight: 700, fontSize: 14,
    background: enabled ? 'var(--forest)' : '#E5E7EB', color: enabled ? 'var(--green-light)' : '#9CA3AF' }
}
const card = { background: 'white', border: '1px solid var(--border)', borderRadius: 14, padding: '16px 18px', marginBottom: 14 }
// A minute value from an "h" + "m" pair of number inputs.
function HmInput({ mins, onChange }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
      <input type="number" min="0" value={Math.floor(mins / 60) || ''} onChange={e => onChange(Math.max(0, +e.target.value || 0) * 60 + (mins % 60))}
        style={{ ...inputStyle, width: 62, textAlign: 'center', padding: '9px 6px' }} />
      <span style={{ fontSize: 12, color: 'var(--muted)' }}>h</span>
      <input type="number" min="0" max="59" value={mins % 60 || ''} onChange={e => onChange(Math.floor(mins / 60) * 60 + Math.min(59, Math.max(0, +e.target.value || 0)))}
        style={{ ...inputStyle, width: 62, textAlign: 'center', padding: '9px 6px' }} />
      <span style={{ fontSize: 12, color: 'var(--muted)' }}>m</span>
    </span>
  )
}
// A datalist-backed text input for remembered suggestions (activities, payees…).
function Suggest({ value, onChange, placeholder, options = [], listId }) {
  return (
    <>
      <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} list={listId} style={inputStyle} />
      <datalist id={listId}>{[...new Set(options)].filter(Boolean).map(o => <option key={o} value={o} />)}</datalist>
    </>
  )
}

export default function BnbTracker() {
  const [loading, setLoading] = useState(true)
  const [workers, setWorkers] = useState([])
  const [sessions, setSessions] = useState([])
  const [expenses, setExpenses] = useState([])
  const [cats, setCats] = useState({ activities: [], expenses: [] })

  const [sub, setSub] = useState('summary')
  const [preset, setPreset] = useState('this-month')
  const [custom, setCustom] = useState({ start: '', end: '' })
  const [reportOpen, setReportOpen] = useState(false)

  useEffect(() => {
    let alive = true
    Promise.all([getBnbWorkers(), getBnbSessions(), getBnbExpenses(), getBnbCats()]).then(([w, s, e, c]) => {
      if (!alive) return
      setWorkers(w); setSessions(s); setExpenses(e)
      setCats({ activities: c.activities || [], expenses: c.expenses || [] })
      setLoading(false)
    })
    return () => { alive = false }
  }, [])

  const range = useMemo(() => resolveRange(preset, custom), [preset, custom])
  const fSessions = useMemo(() => sessions.filter(s => inRange(s.date, range)), [sessions, range])
  const fExpenses = useMemo(() => expenses.filter(e => inRange(e.date, range)), [expenses, range])

  // ── Persistence (optimistic local + cloud write) ──────────────
  const persist = (setter, saver) => (next) => { setter(next); saver(next).catch(err => { console.error(err); alert('⚠️ Could not save. Check your connection.') }) }
  const saveWorkers = persist(setWorkers, setBnbWorkers)
  const saveSessions = persist(setSessions, setBnbSessions)
  const saveExpenses = persist(setExpenses, setBnbExpenses)
  const rememberCat = (kind, label) => {
    const l = (label || '').trim(); if (!l) return
    setCats(prev => {
      if (prev[kind]?.includes(l)) return prev
      const next = { ...prev, [kind]: [...(prev[kind] || []), l].slice(-40) }
      setBnbCats(next).catch(() => {})
      return next
    })
  }

  const addWorker = (w) => saveWorkers([...workers, { id: uid('wk'), color: WORKER_COLORS[workers.length % WORKER_COLORS.length], createdAt: new Date().toISOString(), ...w }])
  const updateWorker = (id, changes) => saveWorkers(workers.map(w => w.id === id ? { ...w, ...changes } : w))
  const deleteWorker = (id) => saveWorkers(workers.filter(w => w.id !== id))
  const addSession = (s) => { saveSessions([...sessions, { id: uid('ses'), createdAt: new Date().toISOString(), ...s }]); rememberCat('activities', s.activity) }
  const deleteSession = (id) => saveSessions(sessions.filter(s => s.id !== id))
  const addExpense = (e) => { saveExpenses([...expenses, { id: uid('exp'), createdAt: new Date().toISOString(), ...e }]); rememberCat('expenses', e.category) }
  const deleteExpense = (id) => saveExpenses(expenses.filter(e => e.id !== id))

  if (loading) return <div style={{ padding: 20, color: 'var(--muted)' }}>Loading your records…</div>

  return (
    <div>
      <div className="page-title">Bed &amp; Breakfast</div>
      <div className="page-sub">Log your hours and expenses, see where your time and money go, and download an itemized record for taxes. Everything here is private to your account.</div>

      {/* Sub-tabs */}
      <div style={{ display: 'flex', gap: 6, margin: '10px 0 16px', flexWrap: 'wrap' }}>
        {SUBTABS.map(([id, label]) => (
          <button key={id} onClick={() => setSub(id)}
            style={{ fontSize: 12.5, padding: '7px 15px', borderRadius: 20, cursor: 'pointer', fontFamily: 'DM Sans,sans-serif', fontWeight: 600,
              border: `1px solid ${sub === id ? 'var(--teal)' : 'var(--border)'}`, background: sub === id ? '#F0FDFB' : 'white', color: sub === id ? 'var(--teal)' : 'var(--muted)' }}>
            {label}
          </button>
        ))}
      </div>

      {(sub === 'summary' || sub === 'hours' || sub === 'expenses') && (
        <RangeBar preset={preset} setPreset={setPreset} custom={custom} setCustom={setCustom} range={range}
          onReport={() => setReportOpen(true)} />
      )}

      {sub === 'summary' && <Summary sessions={fSessions} expenses={fExpenses} workers={workers} rangeText={rangeLabel(preset, range)} />}
      {sub === 'hours' && <HoursView sessions={fSessions} allWorkers={workers} cats={cats} onAdd={addSession} onDelete={deleteSession} />}
      {sub === 'expenses' && <ExpensesView expenses={fExpenses} workers={workers} cats={cats} onAdd={addExpense} onDelete={deleteExpense} />}
      {sub === 'people' && <People workers={workers} sessions={sessions} expenses={expenses} onAdd={addWorker} onUpdate={updateWorker} onDelete={deleteWorker} />}

      {reportOpen && (
        <ReportBuilder sessions={fSessions} expenses={fExpenses} workers={workers} rangeText={rangeLabel(preset, range)} onClose={() => setReportOpen(false)} />
      )}
    </div>
  )
}

// ── Range picker + report button ────────────────────────────────
function RangeBar({ preset, setPreset, custom, setCustom, range, onReport }) {
  return (
    <div style={{ ...card, padding: '12px 14px' }}>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        {RANGE_PRESETS.map(([id, label]) => (
          <button key={id} onClick={() => setPreset(id)}
            style={{ fontSize: 11.5, padding: '5px 11px', borderRadius: 16, cursor: 'pointer', fontFamily: 'DM Sans,sans-serif', fontWeight: 600,
              border: `1px solid ${preset === id ? 'var(--teal)' : 'var(--border)'}`, background: preset === id ? '#F0FDFB' : 'white', color: preset === id ? 'var(--teal)' : 'var(--muted)' }}>
            {label}
          </button>
        ))}
        <button onClick={onReport} style={{ ...primaryBtn(), marginLeft: 'auto', padding: '7px 14px', fontSize: 12.5 }}>⬇ Download report</button>
      </div>
      {preset === 'custom' && (
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 10, flexWrap: 'wrap' }}>
          <label style={{ fontSize: 12, color: 'var(--muted)' }}>From <input type="date" value={custom.start} max={custom.end || undefined} onChange={e => setCustom(c => ({ ...c, start: e.target.value }))} style={{ ...inputStyle, width: 'auto', display: 'inline-block', marginLeft: 4 }} /></label>
          <label style={{ fontSize: 12, color: 'var(--muted)' }}>to <input type="date" value={custom.end} min={custom.start || undefined} onChange={e => setCustom(c => ({ ...c, end: e.target.value }))} style={{ ...inputStyle, width: 'auto', display: 'inline-block', marginLeft: 4 }} /></label>
        </div>
      )}
    </div>
  )
}

// ── Summary (donut charts + totals) ─────────────────────────────
function Summary({ sessions, expenses, workers, rangeText }) {
  const t = totals(sessions, expenses)
  const actS = useMemo(() => toSlices(hoursByActivity(sessions)), [sessions])
  const workS = useMemo(() => toSlices(hoursByWorker(sessions, workers), { colorFor: k => (workers.find(w => w.id === k)?.color || '#8899AA') }), [sessions, workers])
  const catS = useMemo(() => toSlices(spendByCategory(expenses)), [expenses])
  const payS = useMemo(() => toSlices(spendByPayee(expenses, workers)), [expenses, workers])
  const money = v => fmtMoney(v)

  if (t.sessionCount === 0 && t.expenseCount === 0) {
    return <div style={{ ...card, color: 'var(--muted)', fontSize: 13.5, lineHeight: 1.5 }}>
      Nothing logged for <b>{rangeText}</b> yet. Add hours and expenses in the tabs above, then come back to see them summarized here.
    </div>
  }

  return (
    <>
      {/* Totals */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
        <Stat label="Hours worked" value={`${decimalHours(t.mins)}h`} sub={fmtHours(t.mins)} />
        <Stat label="Total spent" value={money(t.spent)} sub={`${t.expenseCount} expense${t.expenseCount === 1 ? '' : 's'}`} />
        <Stat label="Miles driven" value={t.miles.toLocaleString('en-US', { maximumFractionDigits: 1 })} sub="in this period" />
        <Stat label="Work sessions" value={String(t.sessionCount)} sub={`for ${rangeText}`} />
      </div>

      <ChartCard title="Hours by activity"><DonutChart slices={actS.slices} total={actS.total} formatValue={fmtHours} centerLabel={`${decimalHours(actS.total)}h`} centerSub="total" /></ChartCard>
      <ChartCard title="Hours by person"><DonutChart slices={workS.slices} total={workS.total} formatValue={fmtHours} centerLabel={`${decimalHours(workS.total)}h`} centerSub="total" /></ChartCard>
      <ChartCard title="Spending by category"><DonutChart slices={catS.slices} total={catS.total} formatValue={money} centerLabel={money(catS.total)} centerSub="total" /></ChartCard>
      <ChartCard title="Spending by payee"><DonutChart slices={payS.slices} total={payS.total} formatValue={money} centerLabel={money(payS.total)} centerSub="total" /></ChartCard>
    </>
  )
}
function Stat({ label, value, sub }) {
  return (
    <div style={{ flex: 1, minWidth: 140, background: 'linear-gradient(150deg, var(--forest), #2c3a34)', color: 'var(--green-light)', borderRadius: 14, padding: '14px 16px' }}>
      <div style={{ fontSize: 11, opacity: .8, textTransform: 'uppercase', letterSpacing: .5 }}>{label}</div>
      <div className="serif" style={{ fontSize: 28, fontWeight: 700, lineHeight: 1.1, margin: '3px 0 1px' }}>{value}</div>
      <div style={{ fontSize: 11.5, opacity: .75 }}>{sub}</div>
    </div>
  )
}
function ChartCard({ title, children }) {
  return <div style={card}><div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 12 }}>{title}</div>{children}</div>
}

// ── Hours ───────────────────────────────────────────────────────
function HoursView({ sessions, allWorkers, cats, onAdd, onDelete }) {
  const [open, setOpen] = useState(sessions.length === 0)
  const [date, setDate] = useState(todayStr())
  const [workerId, setWorkerId] = useState('')
  const [activity, setActivity] = useState('')
  const [title, setTitle] = useState('')
  const [mins, setMins] = useState(60)
  const [miles, setMiles] = useState('')

  const save = () => {
    if (!(mins > 0)) return
    onAdd({ date: date || todayStr(), workerId: workerId || '', activity: activity.trim(), title: title.trim(), mins, miles: Number(miles) || 0, notes: '' })
    setActivity(''); setTitle(''); setMins(60); setMiles('')
  }
  const rows = [...sessions].sort((a, b) => (b.date || '').localeCompare(a.date || ''))

  return (
    <>
      <SectionHead title={`Hours — ${rows.length} session${rows.length === 1 ? '' : 's'}`} open={open} setOpen={setOpen} addLabel="Log hours" />
      {open && (
        <div style={card}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
            <Field label="Date"><input type="date" value={date} max={todayStr()} onChange={e => setDate(e.target.value)} style={inputStyle} /></Field>
            <Field label="Who worked">
              <select value={workerId} onChange={e => setWorkerId(e.target.value)} style={inputStyle}>
                <option value="">— Select person —</option>
                {allWorkers.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select>
            </Field>
            <Field label="Activity"><Suggest value={activity} onChange={setActivity} placeholder="e.g. Cleaning, Gardening" options={cats.activities} listId="bnb-activities" /></Field>
            <Field label="Miles driven (optional)"><input type="number" min="0" step="0.1" value={miles} onChange={e => setMiles(e.target.value)} placeholder="0" style={inputStyle} /></Field>
          </div>
          <Field label="What got done"><input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Turned over 3 rooms, restocked linens" style={inputStyle} /></Field>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <div><label style={labelStyle}>Time worked</label><HmInput mins={mins} onChange={setMins} /></div>
            <button onClick={save} disabled={!(mins > 0)} style={{ ...primaryBtn(mins > 0), marginLeft: 'auto' }}>Log {mins > 0 ? fmtHours(mins) : 'time'}</button>
          </div>
        </div>
      )}
      {rows.length === 0 ? <Empty text="No hours logged in this period." />
        : <div style={{ ...card, padding: '4px 16px' }}>
          {rows.map((s, i) => (
            <Row key={s.id} onDelete={() => onDelete(s.id)} last={i === rows.length - 1}
              color={allWorkers.find(w => w.id === s.workerId)?.color || 'var(--muted)'}
              title={s.title || s.activity || 'Work'}
              meta={`${prettyDate(s.date)} · ${workerName(allWorkers, s.workerId)}${s.activity ? ' · ' + s.activity : ''}${Number(s.miles) ? ' · ' + fmtMiles(s.miles) : ''}`}
              amount={fmtHours(s.mins)} />
          ))}
        </div>}
    </>
  )
}

// ── Expenses (with receipt scan) ────────────────────────────────
function ExpensesView({ expenses, workers, cats, onAdd, onDelete }) {
  const [open, setOpen] = useState(expenses.length === 0)
  const [date, setDate] = useState(todayStr())
  const [paidTo, setPaidTo] = useState('')
  const [workerId, setWorkerId] = useState('')
  const [amount, setAmount] = useState('')
  const [category, setCategory] = useState('')
  const [description, setDescription] = useState('')
  const [miles, setMiles] = useState('')
  const [receipt, setReceipt] = useState('')      // stored thumbnail data URL
  const [scanning, setScanning] = useState(false)
  const [scanMsg, setScanMsg] = useState('')
  const fileRef = useRef(null)

  const reset = () => { setDate(todayStr()); setPaidTo(''); setWorkerId(''); setAmount(''); setCategory(''); setDescription(''); setMiles(''); setReceipt(''); setScanMsg('') }
  const save = () => {
    if (!(Number(amount) > 0)) return
    onAdd({ date: date || todayStr(), paidTo: paidTo.trim(), workerId: workerId || '', amount: Number(amount) || 0, category: category.trim(), description: description.trim(), miles: Number(miles) || 0, receipt })
    reset()
  }

  const onFile = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setScanMsg('')
    try {
      // Keep a small copy on the record; scan a larger copy for accuracy.
      const thumb = await compressImage(file, { maxDim: 900, quality: 0.6 })
      setReceipt(thumb)
      if (!receiptScanAvailable) { setScanMsg('Photo attached. Fill in the details below.'); return }
      setScanning(true); setScanMsg('Reading the receipt…')
      const big = await compressImage(file, { maxDim: 1400, quality: 0.82 })
      const draft = await scanReceipt(dataUrlToBase64(big), { categories: cats.expenses })
      // Prefill only fields the user hasn't typed, so a scan never wipes edits.
      setPaidTo(v => v || draft.paidTo || draft.vendor)
      setAmount(v => v || (draft.total > 0 ? String(draft.total) : ''))
      setDate(v => draft.date || v)
      setCategory(v => v || draft.category)
      setDescription(v => v || draft.description)
      setScanMsg(draft.total > 0 || draft.vendor ? '✓ Filled from the receipt — check it over.' : 'Couldn’t read much from that — please fill it in.')
    } catch (err) {
      setScanMsg((err && err.message) || 'Could not scan that photo. Fill it in manually.')
    } finally {
      setScanning(false)
      if (e.target) e.target.value = ''
    }
  }

  const rows = [...expenses].sort((a, b) => (b.date || '').localeCompare(a.date || ''))
  const payeeOptions = [...workers.map(w => w.name), ...rows.map(r => r.paidTo)].filter(Boolean)

  return (
    <>
      <SectionHead title={`Expenses — ${rows.length} entr${rows.length === 1 ? 'y' : 'ies'}`} open={open} setOpen={setOpen} addLabel="Add expense" />
      {open && (
        <div style={card}>
          {/* Receipt scan */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14, flexWrap: 'wrap' }}>
            <input ref={fileRef} type="file" accept="image/*" onChange={onFile} style={{ display: 'none' }} id="bnb-receipt-file" />
            <label htmlFor="bnb-receipt-file" style={{ ...primaryBtn(!scanning), display: 'inline-block', background: '#7BBFD4', color: '#0d2a35', opacity: scanning ? .6 : 1, pointerEvents: scanning ? 'none' : 'auto' }}>
              📷 {receiptScanAvailable ? 'Scan a receipt' : 'Attach a receipt'}
            </label>
            {receipt && <img src={receipt} alt="Receipt" style={{ height: 46, borderRadius: 8, border: '1px solid var(--border)' }} />}
            {scanMsg && <span style={{ fontSize: 12, color: scanMsg.startsWith('✓') ? '#155724' : 'var(--muted)' }}>{scanMsg}</span>}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
            <Field label="Date"><input type="date" value={date} max={todayStr()} onChange={e => setDate(e.target.value)} style={inputStyle} /></Field>
            <Field label="Amount"><input type="number" min="0" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00" style={inputStyle} /></Field>
            <Field label="Paid to"><Suggest value={paidTo} onChange={setPaidTo} placeholder="Vendor or person" options={payeeOptions} listId="bnb-payees" /></Field>
            <Field label="Category"><Suggest value={category} onChange={setCategory} placeholder="e.g. Supplies, Utilities" options={cats.expenses} listId="bnb-expense-cats" /></Field>
            <Field label="Link to a person (optional)">
              <select value={workerId} onChange={e => setWorkerId(e.target.value)} style={inputStyle}>
                <option value="">— None —</option>
                {workers.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select>
            </Field>
            <Field label="Miles driven (optional)"><input type="number" min="0" step="0.1" value={miles} onChange={e => setMiles(e.target.value)} placeholder="0" style={inputStyle} /></Field>
          </div>
          <Field label="What was it for"><input value={description} onChange={e => setDescription(e.target.value)} placeholder="e.g. Cleaning supplies and paper goods" style={inputStyle} /></Field>
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={save} disabled={!(Number(amount) > 0)} style={{ ...primaryBtn(Number(amount) > 0), marginLeft: 'auto' }}>Save expense</button>
          </div>
        </div>
      )}
      {rows.length === 0 ? <Empty text="No expenses logged in this period." />
        : <div style={{ ...card, padding: '4px 16px' }}>
          {rows.map((e, i) => (
            <Row key={e.id} onDelete={() => onDelete(e.id)} last={i === rows.length - 1}
              thumb={e.receipt} color="#E8804A"
              title={e.paidTo || e.category || 'Expense'}
              meta={`${prettyDate(e.date)}${e.category ? ' · ' + e.category : ''}${e.description ? ' · ' + e.description : ''}${Number(e.miles) ? ' · ' + fmtMiles(e.miles) : ''}`}
              amount={fmtMoney(e.amount)} />
          ))}
        </div>}
    </>
  )
}

// ── People (worker manager) ─────────────────────────────────────
function People({ workers, sessions, expenses, onAdd, onUpdate, onDelete }) {
  const [name, setName] = useState('')
  const [role, setRole] = useState('')
  const add = () => { if (!name.trim()) return; onAdd({ name: name.trim(), role: role.trim(), payRate: 0 }); setName(''); setRole('') }
  return (
    <>
      <div style={card}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 10 }}>Add a person</div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div style={{ flex: 2, minWidth: 160 }}><label style={labelStyle}>Name</label><input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Ana, or your own name" style={inputStyle} onKeyDown={e => e.key === 'Enter' && add()} /></div>
          <div style={{ flex: 2, minWidth: 140 }}><label style={labelStyle}>Role (optional)</label><input value={role} onChange={e => setRole(e.target.value)} placeholder="e.g. Housekeeping" style={inputStyle} onKeyDown={e => e.key === 'Enter' && add()} /></div>
          <button onClick={add} disabled={!name.trim()} style={primaryBtn(!!name.trim())}>Add</button>
        </div>
        <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 10 }}>Add yourself and anyone you pay, so hours and payments can be attributed to each person.</div>
      </div>
      {workers.length === 0 ? <Empty text="No people yet. Add yourself to get started." />
        : <div style={{ ...card, padding: '4px 16px' }}>
          {workers.map((w, i) => {
            const mins = sessions.filter(s => s.workerId === w.id).reduce((a, r) => a + (r.mins || 0), 0)
            const paid = expenses.filter(e => e.workerId === w.id).reduce((a, r) => a + (Number(r.amount) || 0), 0)
            return (
              <div key={w.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 0', borderBottom: i < workers.length - 1 ? '1px solid #F1EEF3' : 'none' }}>
                <span style={{ width: 12, height: 12, borderRadius: 4, background: w.color, flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, color: 'var(--text)', fontWeight: 600 }}>{w.name}</div>
                  <div style={{ fontSize: 11.5, color: 'var(--muted)' }}>{w.role ? w.role + ' · ' : ''}{fmtHours(mins)} logged{paid ? ' · ' + fmtMoney(paid) + ' paid' : ''}</div>
                </div>
                <button onClick={() => { const n = prompt('Rename person', w.name); if (n && n.trim()) onUpdate(w.id, { name: n.trim() }) }}
                  style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 8, padding: '5px 10px', fontSize: 12, color: 'var(--muted)', cursor: 'pointer', fontFamily: 'DM Sans,sans-serif' }}>Rename</button>
                <button onClick={() => { if (confirm(`Remove ${w.name}? Their past entries stay in your records but will show as "Unknown".`)) onDelete(w.id) }}
                  style={{ background: 'none', border: 'none', color: '#B9B3AC', fontSize: 16, cursor: 'pointer', padding: '0 2px' }}>✕</button>
              </div>
            )
          })}
        </div>}
    </>
  )
}

// ── Report builder (choose sections/columns → PDF) ──────────────
function ReportBuilder({ sessions, expenses, workers, rangeText, onClose }) {
  const [owner, setOwner] = useState('')
  const [sections, setSections] = useState({ summary: true, hours: true, expenses: true, byWorker: true })
  const [hoursCols, setHoursCols] = useState({ date: true, worker: true, activity: true, description: true, hours: true, miles: false })
  const [expenseCols, setExpenseCols] = useState({ date: true, paidTo: true, category: true, description: true, amount: true, miles: false })
  const [includeReceipts, setIncludeReceipts] = useState(false)

  const toggle = (setter) => (key) => setter(prev => ({ ...prev, [key]: !prev[key] }))
  const download = () => {
    const html = buildReportHtml({ owner: owner.trim(), rangeText, sessions, expenses, workers, sections, hoursCols, expenseCols, includeReceipts })
    printReport(html)
  }

  const Check = ({ on, onClick, children }) => (
    <button onClick={onClick} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 12.5, padding: '6px 12px', borderRadius: 18, cursor: 'pointer',
      fontFamily: 'DM Sans,sans-serif', fontWeight: 600, border: `1px solid ${on ? 'var(--teal)' : 'var(--border)'}`, background: on ? '#F0FDFB' : 'white', color: on ? 'var(--teal)' : 'var(--muted)' }}>
      <span>{on ? '☑' : '☐'}</span>{children}
    </button>
  )

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(20,28,38,.5)', zIndex: 640, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
      <div onClick={e => e.stopPropagation()} style={{ background: '#F3F2F6', borderRadius: '22px 22px 0 0', width: '100%', maxWidth: 560, maxHeight: '92vh', overflowY: 'auto', boxShadow: '0 -10px 44px rgba(20,40,60,.28)' }}>
        <div style={{ background: 'var(--forest)', padding: '16px 20px 18px', position: 'sticky', top: 0, zIndex: 1 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div className="serif" style={{ fontSize: 19, fontWeight: 700, color: 'var(--green-light)' }}>Download itemized record</div>
            <button onClick={onClose} aria-label="Close" style={{ width: 32, height: 32, borderRadius: '50%', border: 'none', background: 'rgba(255,255,255,.16)', color: 'var(--green-light)', fontSize: 15, cursor: 'pointer' }}>✕</button>
          </div>
          <div style={{ fontSize: 12.5, color: 'var(--green-light)', opacity: .8, marginTop: 4 }}>Period: {rangeText} · choose what to include, then save as PDF.</div>
        </div>

        <div style={{ padding: '16px 20px calc(20px + env(safe-area-inset-bottom))' }}>
          <Field label="Business or owner name (optional, shown at the top)">
            <input value={owner} onChange={e => setOwner(e.target.value)} placeholder="e.g. Rose Cottage B&B — Jane Smith" style={inputStyle} />
          </Field>

          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)', margin: '6px 0 8px' }}>Sections</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
            <Check on={sections.summary} onClick={() => toggle(setSections)('summary')}>Summary totals</Check>
            <Check on={sections.hours} onClick={() => toggle(setSections)('hours')}>Hours table</Check>
            <Check on={sections.expenses} onClick={() => toggle(setSections)('expenses')}>Expenses table</Check>
            <Check on={sections.byWorker} onClick={() => toggle(setSections)('byWorker')}>Per-person breakdown</Check>
          </div>

          {sections.hours && (<>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)', margin: '6px 0 8px' }}>Hours columns</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
              {[['date', 'Date'], ['worker', 'Worker'], ['activity', 'Activity'], ['description', 'What was done'], ['hours', 'Hours'], ['miles', 'Miles']].map(([k, l]) =>
                <Check key={k} on={hoursCols[k]} onClick={() => toggle(setHoursCols)(k)}>{l}</Check>)}
            </div>
          </>)}

          {sections.expenses && (<>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)', margin: '6px 0 8px' }}>Expense columns</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
              {[['date', 'Date'], ['paidTo', 'Paid to'], ['category', 'Category'], ['description', 'What for'], ['amount', 'Amount'], ['miles', 'Miles']].map(([k, l]) =>
                <Check key={k} on={expenseCols[k]} onClick={() => toggle(setExpenseCols)(k)}>{l}</Check>)}
            </div>
            <div style={{ marginBottom: 16 }}><Check on={includeReceipts} onClick={() => setIncludeReceipts(v => !v)}>Include receipt photos</Check></div>
          </>)}

          <button onClick={download} style={{ ...primaryBtn(), width: '100%', padding: '14px' }}>⬇ Download PDF</button>
          <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 10, textAlign: 'center', lineHeight: 1.5 }}>
            Opens a print view — choose “Save as PDF” as the destination to save the file.
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Small shared building blocks ────────────────────────────────
function SectionHead({ title, open, setOpen, addLabel }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '2px 0 10px' }}>
      <div style={{ fontSize: 12, color: 'var(--muted)', letterSpacing: 1, textTransform: 'uppercase', fontWeight: 600 }}>{title}</div>
      <button onClick={() => setOpen(o => !o)} style={{ ...primaryBtn(), padding: '7px 14px', fontSize: 12.5 }}>{open ? 'Close' : '+ ' + addLabel}</button>
    </div>
  )
}
function Empty({ text }) {
  return <div style={{ ...card, color: 'var(--muted)', fontSize: 13 }}>{text}</div>
}
function Row({ title, meta, amount, color, thumb, onDelete, last }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '11px 0', borderBottom: last ? 'none' : '1px solid #F1EEF3' }}>
      {thumb ? <img src={thumb} alt="" style={{ width: 34, height: 34, borderRadius: 7, objectFit: 'cover', border: '1px solid var(--border)', flexShrink: 0 }} />
        : <span style={{ width: 10, height: 10, borderRadius: 3, background: color, flexShrink: 0 }} />}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13.5, color: 'var(--text)', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{title}</div>
        <div style={{ fontSize: 11.5, color: 'var(--muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{meta}</div>
      </div>
      <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>{amount}</span>
      <button onClick={onDelete} aria-label="Delete" style={{ background: 'none', border: 'none', color: '#B9B3AC', fontSize: 15, cursor: 'pointer', padding: '0 2px', flexShrink: 0 }}>✕</button>
    </div>
  )
}
