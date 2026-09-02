// src/components/TrackerFolder.jsx
// One tracker, CATEGORY-FIRST. You keep a list of categories (income/expense);
// every entry starts by picking one, and its amount counts as money in or out
// automatically. On the same entry you can add your own time, a contractor's
// start→finish dates (turnaround), miles, a note, and an uploaded bill/receipt
// (auto-read by AI). Summary rolls it into the financial cascade + charts;
// Setup manages categories, people, finances, fixed costs and budgets.
import { useMemo, useState, useRef } from 'react'
import { Glyph } from '../lib/glyphs.jsx'
import { inputStyle, labelStyle, card, primaryBtn, Field, HmInput, Empty, Stat, RangeBar } from './trackerUi.jsx'
import { TrendColumns, RankedBars, MoneyCascade, abbrMoney, abbrHours } from './TrackerCharts.jsx'
import { scanReceipt, receiptScanAvailable } from '../lib/parseReceipt.js'
import {
  DEFAULT_MILEAGE_RATE, DEFAULT_TAX_RATE, CATEGORY_COLORS, makeCategory,
  todayStr, fmtHours, decimalHours, fmtMoney, fmtNumber, fmtDays, num, inRange, prettyDate,
  categoryOf, categoryName, categoryKind, incomeCategories, expenseCategories, personName, turnaround, daysBetween,
  summarize, financials, computeHighlights, monthlySeries,
  spendByCategory, incomeByCategory, hoursByCategory, spendByPerson,
  canUseFixedCosts, missingFixedCosts, makeFixedEntry,
  compressImage, dataUrlToBase64, entryColumns, buildReportHtml, printReport, buildCsv, downloadFile, safeFileName,
} from '../lib/trackers.js'

const SUBTABS = [['summary', 'Summary'], ['entries', 'Entries'], ['setup', 'Setup']]

export default function TrackerFolder({
  folder, people, entries,
  preset, setPreset, custom, setCustom, range, rangeText, prevWindow,
  addEntry, addManyEntries, deleteEntry, addPerson, updatePerson, deletePerson,
  onRename, onDelete, onUpdateFolder, onBack,
}) {
  // A brand-new / empty tracker opens on Entries so you can log right away.
  const [sub, setSub] = useState(entries.length === 0 ? 'entries' : 'summary')
  const [exportOpen, setExportOpen] = useState(false)
  const fEntries = useMemo(() => entries.filter(e => inRange(e.date, range)), [entries, range])
  const prevEntries = useMemo(() => prevWindow ? entries.filter(e => inRange(e.date, prevWindow)) : null, [entries, prevWindow])

  const addCategory = (cat) => onUpdateFolder({ categories: [...(folder.categories || []), cat] })
  const updateCategory = (id, ch) => onUpdateFolder({ categories: (folder.categories || []).map(c => c.id === id ? { ...c, ...ch } : c) })
  const deleteCategory = (id) => onUpdateFolder({ categories: (folder.categories || []).filter(c => c.id !== id) })

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
        <button onClick={onBack} aria-label="Back" style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 10, padding: '7px 11px', cursor: 'pointer', color: 'var(--muted)', fontFamily: 'DM Sans,sans-serif', fontSize: 13 }}>← All</button>
        <span style={{ width: 34, height: 34, borderRadius: 10, background: (folder.color || '#4A9EB5') + '22', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: folder.color || '#4A9EB5', flexShrink: 0 }}>
          <Glyph id={folder.icon || 'briefcase'} size={20} color="currentColor" />
        </span>
        <div className="serif" style={{ fontSize: 24, fontWeight: 700, color: 'var(--forest)', flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{folder.name}</div>
        <button onClick={() => { const n = prompt('Rename tracker', folder.name); if (n && n.trim()) onRename(n.trim()) }}
          style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 9, padding: '6px 11px', fontSize: 12.5, color: 'var(--muted)', cursor: 'pointer', fontFamily: 'DM Sans,sans-serif' }}>Rename</button>
        <button onClick={() => { if (confirm(`Delete the "${folder.name}" tracker and all its entries? This can't be undone.`)) onDelete() }}
          style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 9, padding: '6px 11px', fontSize: 12.5, color: 'var(--coral)', cursor: 'pointer', fontFamily: 'DM Sans,sans-serif' }}>Delete</button>
      </div>

      <div style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap' }}>
        {SUBTABS.map(([id, label]) => (
          <button key={id} onClick={() => setSub(id)}
            style={{ fontSize: 12.5, padding: '7px 15px', borderRadius: 20, cursor: 'pointer', fontFamily: 'DM Sans,sans-serif', fontWeight: 600,
              border: `1px solid ${sub === id ? 'var(--teal)' : 'var(--border)'}`, background: sub === id ? '#F0FDFB' : 'white', color: sub === id ? 'var(--teal)' : 'var(--muted)' }}>{label}</button>
        ))}
      </div>

      {(sub === 'summary' || sub === 'entries') && (
        <RangeBar preset={preset} setPreset={setPreset} custom={custom} setCustom={setCustom}
          right={<button onClick={() => setExportOpen(true)} style={{ ...primaryBtn(), padding: '7px 14px', fontSize: 12.5 }}>⬇ Export</button>} />
      )}

      {sub === 'summary' && <FolderSummary folder={folder} entries={fEntries} allEntries={entries} people={people} rangeText={rangeText} prevEntries={prevEntries} />}
      {sub === 'entries' && <EntriesView folder={folder} entries={fEntries} allEntries={entries} people={people}
        onAdd={addEntry} onAddMany={addManyEntries} onDelete={deleteEntry} addCategory={addCategory} addPerson={addPerson} />}
      {sub === 'setup' && <Setup folder={folder} onUpdateFolder={onUpdateFolder} people={people} entries={entries}
        addCategory={addCategory} updateCategory={updateCategory} deleteCategory={deleteCategory}
        addPerson={addPerson} updatePerson={updatePerson} deletePerson={deletePerson} />}

      {exportOpen && <ExportModal folder={folder} entries={fEntries} people={people} rangeText={rangeText} onClose={() => setExportOpen(false)} />}
    </div>
  )
}

// ── Summary ─────────────────────────────────────────────────────
function FolderSummary({ folder, entries, allEntries, people, rangeText, prevEntries }) {
  const s = summarize(entries, folder)
  const sym = folder.currency || '$'
  const $ = v => fmtMoney(v, sym)
  const months = useMemo(() => monthlySeries(allEntries, folder, 6), [allEntries, folder])
  const highlights = useMemo(() => computeHighlights({ entries, folder, people, budgetMoney: folder.budgetMoney, budgetHours: folder.budgetHours, prevEntries }), [entries, folder, people, prevEntries])
  const spend = useMemo(() => spendByCategory(entries, folder), [entries, folder])
  const income = useMemo(() => incomeByCategory(entries, folder), [entries, folder])
  const hoursCat = useMemo(() => hoursByCategory(entries, folder), [entries, folder])
  const paid = useMemo(() => spendByPerson(entries, folder, people), [entries, folder, people])
  const monthsHaveData = months.some(m => m.moneyIn || m.moneyOut || m.mins)

  if ((folder.categories || []).length === 0) return <Empty text="This tracker has no categories yet. Open Setup to add a few (like Bookings, Supplies, Utilities), then log entries." />
  if (s.count === 0) return <Empty text={`Nothing logged for ${rangeText} yet. Add entries in the Entries tab.`} />

  const moneyLeft = folder.budgetMoney > 0 ? folder.budgetMoney - s.moneyOut : null
  const timeLeft = folder.budgetHours > 0 ? folder.budgetHours - s.mins : null

  return (
    <>
      <MoneyCascade summary={s} folder={folder} />
      {(s.mins > 0 || s.miles > 0) && (
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
          {s.mins > 0 ? <Stat label="Your hours" value={`${decimalHours(s.mins)}h`} sub={fmtHours(s.mins)} /> : null}
          {s.miles > 0 ? <Stat label="Miles" value={fmtNumber(s.miles)} sub={folder.mileageRate > 0 ? `${$(s.miles * folder.mileageRate)} deduction` : 'tracked'} /> : null}
        </div>
      )}
      {(moneyLeft != null || timeLeft != null) && (
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
          {moneyLeft != null && <BudgetBar label="Budget" used={s.moneyOut} total={folder.budgetMoney} left={moneyLeft} fmt={$} />}
          {timeLeft != null && <BudgetBar label="Time budget" used={s.mins} total={folder.budgetHours} left={timeLeft} fmt={fmtHours} />}
        </div>
      )}
      {highlights.length > 0 && <Highlights items={highlights} />}
      {monthsHaveData && <TrendColumns title="Net by month" caption="income − expenses · last 6 months" series={months.map(m => ({ key: m.key, label: m.label, value: m.net }))} abbr={v => abbrMoney(v, sym)} diverging />}
      {spend.total > 0 && <RankedBars title="Spending by category" slices={spend.slices} total={spend.total} formatValue={$} />}
      {income.total > 0 && <RankedBars title="Income by category" slices={income.slices} total={income.total} formatValue={$} />}
      {hoursCat.total > 0 && <RankedBars title="Your hours by category" slices={hoursCat.slices} total={hoursCat.total} formatValue={fmtHours} />}
      {paid.total > 0 && <RankedBars title="Paid to whom" slices={paid.slices} total={paid.total} formatValue={$} />}
    </>
  )
}
function BudgetBar({ label, used, total, left, fmt }) {
  const pct = Math.max(0, Math.min(1, used / (total || 1))), over = left < 0
  return (
    <div style={{ flex: 1, minWidth: 200, background: 'white', border: '1px solid var(--border)', borderRadius: 14, padding: '14px 16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
        <span style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: .5 }}>{label}</span>
        <span style={{ fontSize: 13, fontWeight: 700, color: over ? 'var(--coral)' : 'var(--forest)' }}>{over ? `${fmt(-left)} over` : `${fmt(left)} left`}</span>
      </div>
      <div style={{ height: 9, borderRadius: 6, background: '#EEECF0', overflow: 'hidden' }}><div style={{ width: `${pct * 100}%`, height: '100%', background: over ? 'var(--coral)' : 'var(--teal)', borderRadius: 6, transition: 'width .4s' }} /></div>
      <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 6 }}>{fmt(used)} of {fmt(total)}</div>
    </div>
  )
}
export function Highlights({ items }) {
  return (
    <div style={{ ...card, padding: '14px 18px' }}>
      <div style={{ fontSize: 11, color: 'var(--muted)', letterSpacing: 1, textTransform: 'uppercase', fontWeight: 600, marginBottom: 10 }}>At a glance</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
        {items.map((h, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
            <span style={{ color: 'var(--teal)', flexShrink: 0, marginTop: 1 }}><Glyph id={h.icon} size={16} color="currentColor" /></span>
            <span style={{ fontSize: 13.5, color: 'var(--text)', lineHeight: 1.45 }}>{h.text}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Entries (category-first form + list) ────────────────────────
const blankEntry = () => ({ categoryId: '', amount: '', date: todayStr(), personId: '', yourMins: 0, workStart: '', workEnd: '', miles: '', note: '', bill: '' })
function EntriesView({ folder, entries, allEntries, people, onAdd, onAddMany, onDelete, addCategory, addPerson }) {
  const cats = folder.categories || []
  const [open, setOpen] = useState(entries.length === 0)
  const [more, setMore] = useState(false)     // show contractor/time/miles/bill section
  const [f, setF] = useState(blankEntry)
  const [addingCat, setAddingCat] = useState(false)
  const [scanMsg, setScanMsg] = useState('')
  const [scanning, setScanning] = useState(false)
  const set = (k, v) => setF(prev => ({ ...prev, [k]: v }))
  const sym = folder.currency || '$'

  // This month's fixed costs not yet added.
  const curMonth = todayStr().slice(0, 7)
  const missing = canUseFixedCosts(folder) ? missingFixedCosts(folder, allEntries || [], curMonth) : []
  const addFixed = () => {
    const first = `${curMonth}-01`
    const rows = missing.map(c => makeFixedEntry(folder, c, first)).filter(Boolean)
    if (rows.length && onAddMany) onAddMany(rows)
  }

  const save = () => {
    if (!f.categoryId || !(Number(f.amount) >= 0 && f.amount !== '')) return
    onAdd({ ...f, amount: Number(f.amount) || 0, miles: Number(f.miles) || 0 })
    setF(blankEntry()); setMore(false); setScanMsg('')
  }

  const chooseCategory = (v) => { if (v === '__new') { setAddingCat(true) } else set('categoryId', v) }
  const commitNewCat = (name, kind) => {
    const c = makeCategory(name.trim(), kind, CATEGORY_COLORS[cats.length % CATEGORY_COLORS.length])
    addCategory(c); set('categoryId', c.id); setAddingCat(false)
  }
  const choosePerson = (v) => {
    if (v === '__newp') { const n = prompt('New person / contractor name'); if (n && n.trim() && addPerson) { const p = addPerson({ name: n.trim() }); if (p?.id) set('personId', p.id) } }
    else set('personId', v)
  }

  const onBill = async (file) => {
    if (!file) return
    setScanMsg('')
    try {
      const thumb = await compressImage(file, { maxDim: 900, quality: 0.6 })
      set('bill', thumb)
      if (!receiptScanAvailable) { setScanMsg('Bill attached.'); setMore(true); return }
      setScanning(true); setScanMsg('Reading the bill…')
      const big = await compressImage(file, { maxDim: 1400, quality: 0.82 })
      const draft = await scanReceipt(dataUrlToBase64(big), { categories: expenseCategories(folder).map(c => c.name) })
      setF(prev => {
        const next = { ...prev, bill: thumb }
        if (draft.total > 0 && !num(next.amount)) next.amount = String(draft.total)
        if (draft.date) next.date = draft.date
        if (!next.note && (draft.paidTo || draft.vendor)) next.note = draft.paidTo || draft.vendor
        // match a category by name (case-insensitive)
        if (!next.categoryId && draft.category) {
          const m = expenseCategories(folder).find(c => c.name.toLowerCase() === draft.category.toLowerCase())
          if (m) next.categoryId = m.id
        }
        return next
      })
      setScanMsg(draft.total > 0 || draft.vendor ? '✓ Filled from the bill — check it over.' : 'Couldn’t read much — please fill it in.')
    } catch (err) { setScanMsg((err && err.message) || 'Could not scan that photo.') }
    finally { setScanning(false) }
  }

  const rows = [...entries].sort((a, b) => (b.date || '').localeCompare(a.date || ''))
  const monthName = new Date(curMonth + '-01T12:00:00').toLocaleDateString('en-US', { month: 'long' })
  const days = daysBetween(f.workStart, f.workEnd)

  return (
    <>
      {missing.length > 0 && (
        <div style={{ ...card, background: '#F0FDFB', border: '1px solid #cdeae6', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--teal)' }}>Add {monthName}’s fixed costs?</div>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>{missing.map(c => `${c.label} ${fmtMoney(c.amount, sym)}`).join(' · ')}</div>
          </div>
          <button onClick={addFixed} style={{ ...primaryBtn(), padding: '9px 16px', fontSize: 13 }}>Add {missing.length}</button>
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '2px 0 10px' }}>
        <div style={{ fontSize: 12, color: 'var(--muted)', letterSpacing: 1, textTransform: 'uppercase', fontWeight: 600 }}>{rows.length} entr{rows.length === 1 ? 'y' : 'ies'}</div>
        <button onClick={() => setOpen(o => !o)} style={{ ...primaryBtn(), padding: '7px 14px', fontSize: 12.5 }}>{open ? 'Close' : '+ Add entry'}</button>
      </div>

      {open && (
        <div style={card}>
          {/* Scan a bill/receipt */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14, flexWrap: 'wrap' }}>
            <input type="file" accept="image/*" onChange={e => { onBill(e.target.files?.[0]); e.target.value = '' }} style={{ display: 'none' }} id="trk-bill" />
            <label htmlFor="trk-bill" style={{ ...primaryBtn(!scanning), display: 'inline-block', background: '#7BBFD4', color: '#0d2a35', opacity: scanning ? .6 : 1, pointerEvents: scanning ? 'none' : 'auto' }}>📷 {receiptScanAvailable ? 'Scan a bill / receipt' : 'Attach a bill / receipt'}</label>
            {f.bill && <img src={f.bill} alt="Bill" style={{ height: 46, borderRadius: 8, border: '1px solid var(--border)' }} />}
            {scanMsg && <span style={{ fontSize: 12, color: scanMsg.startsWith('✓') ? '#155724' : 'var(--muted)' }}>{scanMsg}</span>}
          </div>

          {/* Main fields */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 12 }}>
            <div>
              <label style={labelStyle}>Category</label>
              <select value={f.categoryId} onChange={e => chooseCategory(e.target.value)} style={inputStyle}>
                <option value="">— Choose —</option>
                {incomeCategories(folder).length > 0 && <optgroup label="Income">{incomeCategories(folder).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</optgroup>}
                {expenseCategories(folder).length > 0 && <optgroup label="Expense">{expenseCategories(folder).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</optgroup>}
                <option value="__new">＋ New category…</option>
              </select>
            </div>
            <Field label={`Amount${f.categoryId ? ` (${categoryKind(folder, f.categoryId) === 'income' ? 'money in' : 'money out'})` : ''}`}>
              <input type="number" min="0" step="0.01" value={f.amount} onChange={e => set('amount', e.target.value)} placeholder="0.00" style={inputStyle} />
            </Field>
            <Field label="Date"><input type="date" value={f.date} max={todayStr()} onChange={e => set('date', e.target.value)} style={inputStyle} /></Field>
            <div>
              <label style={labelStyle}>Paid to / who</label>
              <select value={f.personId} onChange={e => choosePerson(e.target.value)} style={inputStyle}>
                <option value="">— None —</option>
                {people.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                <option value="__newp">＋ New person / contractor…</option>
              </select>
            </div>
          </div>

          {addingCat && <InlineCategoryAdd onAdd={commitNewCat} onCancel={() => setAddingCat(false)} />}

          <Field label="Note — what was it for"><input value={f.note} onChange={e => set('note', e.target.value)} placeholder="e.g. Roof leak over room 2" style={inputStyle} /></Field>

          {/* Optional: your time, contractor dates, miles */}
          <button onClick={() => setMore(m => !m)} style={{ background: 'none', border: 'none', color: 'var(--teal)', cursor: 'pointer', fontFamily: 'DM Sans,sans-serif', fontWeight: 600, fontSize: 12.5, padding: '2px 0', marginBottom: more ? 10 : 0 }}>
            {more ? '– Hide' : '+ Add'} time, contractor dates, miles
          </button>
          {more && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 12, marginBottom: 4 }}>
              <div><label style={labelStyle}>Your time (talking / managing)</label><HmInput mins={num(f.yourMins)} onChange={v => set('yourMins', v)} /></div>
              <Field label="Work started"><input type="date" value={f.workStart} onChange={e => set('workStart', e.target.value)} style={inputStyle} /></Field>
              <Field label="Work finished"><input type="date" value={f.workEnd} min={f.workStart || undefined} onChange={e => set('workEnd', e.target.value)} style={inputStyle} /></Field>
              <Field label="Miles driven"><input type="number" min="0" step="0.1" value={f.miles} onChange={e => set('miles', e.target.value)} placeholder="0" style={inputStyle} /></Field>
              {days != null && days >= 0 && <div style={{ alignSelf: 'end', fontSize: 12.5, color: 'var(--muted)', paddingBottom: 10 }}>⏱ Contractor took <b style={{ color: 'var(--text)' }}>{fmtDays(days)}</b></div>}
            </div>
          )}

          <div style={{ display: 'flex', marginTop: 8 }}>
            <button onClick={save} disabled={!f.categoryId || f.amount === ''} style={{ ...primaryBtn(!!f.categoryId && f.amount !== ''), marginLeft: 'auto' }}>Save entry</button>
          </div>
        </div>
      )}

      {rows.length === 0 ? (cats.length > 0 && <Empty text="No entries in this period." />)
        : cats.length === 0 ? <Empty text="Add a category in Setup first, then you can log entries." />
        : <div style={{ ...card, padding: '4px 16px' }}>
          {rows.map((e, i) => <EntryRow key={e.id} entry={e} folder={folder} people={people} onDelete={() => onDelete(e.id)} last={i === rows.length - 1} />)}
        </div>}
    </>
  )
}

function InlineCategoryAdd({ onAdd, onCancel }) {
  const [name, setName] = useState('')
  const [kind, setKind] = useState('expense')
  return (
    <div style={{ background: '#F7FBFB', border: '1px dashed #cdeae6', borderRadius: 12, padding: '12px 14px', margin: '2px 0 12px' }}>
      <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--teal)', marginBottom: 8 }}>New category</div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <input value={name} autoFocus onChange={e => setName(e.target.value)} placeholder="e.g. Repairs" style={{ ...inputStyle, flex: 1, minWidth: 150 }} onKeyDown={e => { if (e.key === 'Enter' && name.trim()) onAdd(name, kind) }} />
        <div style={{ display: 'inline-flex', border: '1px solid var(--border)', borderRadius: 9, overflow: 'hidden' }}>
          {['income', 'expense'].map(k => (
            <button key={k} onClick={() => setKind(k)} style={{ padding: '9px 13px', border: 'none', cursor: 'pointer', fontFamily: 'DM Sans,sans-serif', fontWeight: 600, fontSize: 12.5, background: kind === k ? (k === 'income' ? '#E7F6EC' : '#FBEDE7') : 'white', color: kind === k ? (k === 'income' ? '#0a7d3c' : 'var(--coral)') : 'var(--muted)' }}>{k === 'income' ? 'Income' : 'Expense'}</button>
          ))}
        </div>
        <button onClick={() => name.trim() && onAdd(name, kind)} disabled={!name.trim()} style={primaryBtn(!!name.trim())}>Add</button>
        <button onClick={onCancel} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontFamily: 'DM Sans,sans-serif', fontSize: 12.5 }}>Cancel</button>
      </div>
    </div>
  )
}

function EntryRow({ entry, folder, people, onDelete, last }) {
  const sym = folder.currency || '$'
  const cat = categoryOf(folder, entry.categoryId)
  const kind = cat?.kind
  const income = kind === 'income'
  const days = turnaround(entry)
  const title = (entry.note || '').trim() || (cat ? cat.name : 'Entry')
  const meta = [prettyDate(entry.date), cat ? cat.name : 'Uncategorized']
  if (entry.personId) meta.push(personName(people, entry.personId))
  if (num(entry.yourMins)) meta.push(fmtHours(entry.yourMins))
  if (days != null) meta.push(`took ${fmtDays(days)}`)
  if (num(entry.miles)) meta.push(`${fmtNumber(entry.miles)} mi`)
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '11px 0', borderBottom: last ? 'none' : '1px solid #F1EEF3' }}>
      {entry.bill ? <img src={entry.bill} alt="" style={{ width: 34, height: 34, borderRadius: 7, objectFit: 'cover', border: '1px solid var(--border)', flexShrink: 0 }} />
        : <span style={{ width: 10, height: 10, borderRadius: 3, background: cat?.color || 'var(--muted)', flexShrink: 0 }} />}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13.5, color: 'var(--text)', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{title}</div>
        <div style={{ fontSize: 11.5, color: 'var(--muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{meta.join(' · ')}</div>
      </div>
      <span style={{ fontSize: 13, fontWeight: 700, color: income ? '#0a7d3c' : 'var(--coral)', flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>{income ? '+' : '−'}{fmtMoney(entry.amount, sym)}</span>
      <button onClick={onDelete} aria-label="Delete" style={{ background: 'none', border: 'none', color: '#B9B3AC', fontSize: 15, cursor: 'pointer', padding: '0 2px', flexShrink: 0 }}>✕</button>
    </div>
  )
}

// ── Setup ───────────────────────────────────────────────────────
function Setup({ folder, onUpdateFolder, people, entries, addCategory, updateCategory, deleteCategory, addPerson, updatePerson, deletePerson }) {
  const cats = folder.categories || []
  const sym = folder.currency || '$'
  // category add
  const [cName, setCName] = useState(''); const [cKind, setCKind] = useState('expense')
  const addCat = () => { if (!cName.trim()) return; addCategory(makeCategory(cName.trim(), cKind, CATEGORY_COLORS[cats.length % CATEGORY_COLORS.length])); setCName('') }
  // person add
  const [pName, setPName] = useState(''); const [pRole, setPRole] = useState('')
  const addP = () => { if (!pName.trim()) return; addPerson({ name: pName.trim(), role: pRole.trim() }); setPName(''); setPRole('') }
  // finances
  const [taxRate, setTaxRate] = useState(folder.taxRate ?? '')
  const [mileageRate, setMileageRate] = useState(folder.mileageRate ?? '')
  const [currency, setCurrency] = useState(folder.currency || '$')
  const saveFin = () => onUpdateFolder({ taxRate: taxRate === '' ? null : Math.max(0, Math.min(100, Number(taxRate))), mileageRate: mileageRate === '' ? null : Math.max(0, Number(mileageRate)), currency: (currency || '$').trim().slice(0, 3) || '$' })
  // fixed costs
  const [fcLabel, setFcLabel] = useState(''); const [fcAmount, setFcAmount] = useState(''); const [fcCat, setFcCat] = useState('')
  const fixedCosts = folder.fixedCosts || []
  const addFixedCost = () => { if (!fcLabel.trim() || !(Number(fcAmount) > 0)) return; onUpdateFolder({ fixedCosts: [...fixedCosts, { id: 'fc' + Date.now().toString(36), label: fcLabel.trim(), amount: Number(fcAmount), categoryId: fcCat || expenseCategories(folder)[0]?.id }] }); setFcLabel(''); setFcAmount('') }
  const removeFixedCost = (id) => onUpdateFolder({ fixedCosts: fixedCosts.filter(c => c.id !== id) })
  // budget
  const [bMoney, setBMoney] = useState(folder.budgetMoney || ''); const [bHours, setBHours] = useState(folder.budgetHours || 0)
  const saveBudget = () => onUpdateFolder({ budgetMoney: bMoney === '' ? null : Number(bMoney), budgetHours: Number(bHours) || null })

  const kindChip = (kind) => ({ fontSize: 10.5, fontWeight: 700, borderRadius: 6, padding: '2px 7px', flexShrink: 0, color: kind === 'income' ? '#0a7d3c' : 'var(--coral)', background: kind === 'income' ? '#E7F6EC' : '#FBEDE7', border: `1px solid ${kind === 'income' ? '#bfe3c6' : '#f3d3c8'}` })
  const catRow = (c) => (
    <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0', borderBottom: '1px solid #F1EEF3' }}>
      <span style={{ width: 12, height: 12, borderRadius: 4, background: c.color, flexShrink: 0 }} />
      <span style={{ flex: 1, minWidth: 0, fontSize: 13.5, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.name}</span>
      <button onClick={() => updateCategory(c.id, { kind: c.kind === 'income' ? 'expense' : 'income' })} title="Toggle income/expense" style={{ ...kindChip(c.kind), cursor: 'pointer' }}>{c.kind === 'income' ? 'Income' : 'Expense'}</button>
      <button onClick={() => { const n = prompt('Rename category', c.name); if (n && n.trim()) updateCategory(c.id, { name: n.trim() }) }} style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 8, padding: '4px 9px', fontSize: 11.5, color: 'var(--muted)', cursor: 'pointer', fontFamily: 'DM Sans,sans-serif' }}>Rename</button>
      <button onClick={() => { if (confirm(`Delete "${c.name}"? Entries in it keep their amount but show as Uncategorized.`)) deleteCategory(c.id) }} style={{ background: 'none', border: 'none', color: '#B9B3AC', fontSize: 15, cursor: 'pointer', padding: '0 2px' }}>✕</button>
    </div>
  )

  return (
    <>
      {/* Categories */}
      <div style={card}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>Categories</div>
        <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 12 }}>Every entry is filed under a category. Income categories add to revenue; expense categories to spending.</div>
        {incomeCategories(folder).length > 0 && <>{incomeCategories(folder).map(catRow)}</>}
        {expenseCategories(folder).length > 0 && <>{expenseCategories(folder).map(catRow)}</>}
        {cats.length === 0 && <div style={{ fontSize: 12.5, color: 'var(--muted)', marginBottom: 8 }}>No categories yet — add your first below.</div>}
        <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap', alignItems: 'center' }}>
          <input value={cName} onChange={e => setCName(e.target.value)} placeholder="e.g. Bookings, Supplies, Repairs" style={{ ...inputStyle, flex: 1, minWidth: 150 }} onKeyDown={e => e.key === 'Enter' && addCat()} />
          <div style={{ display: 'inline-flex', border: '1px solid var(--border)', borderRadius: 9, overflow: 'hidden' }}>
            {['income', 'expense'].map(k => <button key={k} onClick={() => setCKind(k)} style={{ padding: '9px 13px', border: 'none', cursor: 'pointer', fontFamily: 'DM Sans,sans-serif', fontWeight: 600, fontSize: 12.5, background: cKind === k ? (k === 'income' ? '#E7F6EC' : '#FBEDE7') : 'white', color: cKind === k ? (k === 'income' ? '#0a7d3c' : 'var(--coral)') : 'var(--muted)' }}>{k === 'income' ? 'Income' : 'Expense'}</button>)}
          </div>
          <button onClick={addCat} disabled={!cName.trim()} style={primaryBtn(!!cName.trim())}>+ Add</button>
        </div>
      </div>

      {/* People */}
      <div style={card}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>People</div>
        <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 12 }}>Anyone you pay or who does work — yourself, staff, contractors, vendors. Attach them to entries with “Paid to / who”.</div>
        {people.length > 0 && people.map((w, i) => {
          const mins = entries.filter(e => e.personId === w.id).reduce((a, e) => a + num(e.yourMins), 0)
          const paid = entries.filter(e => e.personId === w.id && categoryKind(folder, e.categoryId) === 'expense').reduce((a, e) => a + num(e.amount), 0)
          return (
            <div key={w.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: i < people.length - 1 ? '1px solid #F1EEF3' : 'none' }}>
              <span style={{ width: 12, height: 12, borderRadius: 4, background: w.color, flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, color: 'var(--text)', fontWeight: 600 }}>{w.name}</div>
                <div style={{ fontSize: 11.5, color: 'var(--muted)' }}>{w.role ? w.role + ' · ' : ''}{paid ? fmtMoney(paid, sym) + ' paid' : ''}{paid && mins ? ' · ' : ''}{mins ? fmtHours(mins) + ' your time' : ''}</div>
              </div>
              <button onClick={() => { const n = prompt('Rename person', w.name); if (n && n.trim()) updatePerson(w.id, { name: n.trim() }) }} style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 8, padding: '4px 9px', fontSize: 11.5, color: 'var(--muted)', cursor: 'pointer', fontFamily: 'DM Sans,sans-serif' }}>Rename</button>
              <button onClick={() => { if (confirm(`Remove ${w.name}? Their entries stay but show no one.`)) deletePerson(w.id) }} style={{ background: 'none', border: 'none', color: '#B9B3AC', fontSize: 15, cursor: 'pointer', padding: '0 2px' }}>✕</button>
            </div>
          )
        })}
        <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div style={{ flex: 2, minWidth: 150 }}><label style={labelStyle}>Name</label><input value={pName} onChange={e => setPName(e.target.value)} placeholder="e.g. Joe (contractor)" style={inputStyle} onKeyDown={e => e.key === 'Enter' && addP()} /></div>
          <div style={{ flex: 2, minWidth: 130 }}><label style={labelStyle}>Role (optional)</label><input value={pRole} onChange={e => setPRole(e.target.value)} placeholder="e.g. Plumber" style={inputStyle} onKeyDown={e => e.key === 'Enter' && addP()} /></div>
          <button onClick={addP} disabled={!pName.trim()} style={primaryBtn(!!pName.trim())}>+ Add</button>
        </div>
      </div>

      {/* Finances */}
      <div style={card}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>Finances</div>
        <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 12 }}>What to set aside for taxes, and mileage as a deduction. Leave a field blank to hide that line.</div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div style={{ width: 90 }}><label style={labelStyle}>Currency</label><input value={currency} onChange={e => setCurrency(e.target.value)} placeholder="$" style={{ ...inputStyle, textAlign: 'center' }} /></div>
          <div style={{ width: 150 }}><label style={labelStyle}>Set aside for taxes</label>
            <div style={{ position: 'relative' }}><input type="number" min="0" max="100" value={taxRate} onChange={e => setTaxRate(e.target.value)} placeholder={String(DEFAULT_TAX_RATE)} style={{ ...inputStyle, paddingRight: 26 }} /><span style={{ position: 'absolute', right: 11, top: 10, color: 'var(--muted)', fontSize: 13 }}>%</span></div>
          </div>
          <div style={{ width: 170 }}><label style={labelStyle}>Mileage rate (per mile)</label><input type="number" min="0" step="0.01" value={mileageRate} onChange={e => setMileageRate(e.target.value)} placeholder={String(DEFAULT_MILEAGE_RATE)} style={inputStyle} /></div>
          <button onClick={saveFin} style={primaryBtn()}>Save</button>
        </div>
        <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 10, lineHeight: 1.5 }}>The tax % is a rough set-aside so profit isn’t mistaken for take-home — your accountant confirms the real number. Mileage rate defaults to the IRS standard rate.</div>
      </div>

      {/* Fixed monthly costs */}
      {canUseFixedCosts(folder) && (
        <div style={card}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>Fixed monthly costs</div>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 12 }}>Recurring expenses like rent or insurance. Each month, the Entries tab offers to add them in one tap.</div>
          {fixedCosts.length > 0 && <div style={{ marginBottom: 12 }}>{fixedCosts.map((c, i) => (
            <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: i < fixedCosts.length - 1 ? '1px solid #F1EEF3' : 'none' }}>
              <span style={{ flex: 1, minWidth: 0, fontSize: 13.5, color: 'var(--text)' }}>{c.label} <span style={{ color: 'var(--muted)', fontSize: 12 }}>· {categoryName(folder, c.categoryId)}</span></span>
              <span style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text)' }}>{fmtMoney(c.amount, sym)}</span>
              <button onClick={() => removeFixedCost(c.id)} style={{ background: 'none', border: 'none', color: '#B9B3AC', fontSize: 15, cursor: 'pointer', padding: '0 2px' }}>✕</button>
            </div>
          ))}</div>}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div style={{ flex: 1, minWidth: 130 }}><label style={labelStyle}>Cost name</label><input value={fcLabel} onChange={e => setFcLabel(e.target.value)} placeholder="e.g. Mortgage" style={inputStyle} onKeyDown={e => e.key === 'Enter' && addFixedCost()} /></div>
            <div style={{ width: 120 }}><label style={labelStyle}>Amount</label><input type="number" min="0" step="0.01" value={fcAmount} onChange={e => setFcAmount(e.target.value)} placeholder="0.00" style={inputStyle} /></div>
            <div style={{ width: 150 }}><label style={labelStyle}>Category</label>
              <select value={fcCat} onChange={e => setFcCat(e.target.value)} style={inputStyle}>{expenseCategories(folder).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
            </div>
            <button onClick={addFixedCost} disabled={!fcLabel.trim() || !(Number(fcAmount) > 0)} style={primaryBtn(!!fcLabel.trim() && Number(fcAmount) > 0)}>+ Add</button>
          </div>
        </div>
      )}

      {/* Budget */}
      <div style={card}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>Budget for the period</div>
        <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 12 }}>Optional. When set, the summary shows how much money and time you have left for the selected time frame.</div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div style={{ minWidth: 150 }}><label style={labelStyle}>Money budget</label><input type="number" min="0" step="0.01" value={bMoney} onChange={e => setBMoney(e.target.value)} placeholder="none" style={inputStyle} /></div>
          <div><label style={labelStyle}>Time budget</label><HmInput mins={Number(bHours) || 0} onChange={setBHours} /></div>
          <button onClick={saveBudget} style={primaryBtn()}>Save budget</button>
        </div>
      </div>
    </>
  )
}

// ── Export ──────────────────────────────────────────────────────
function ExportModal({ folder, entries, people, rangeText, onClose }) {
  const allCols = useMemo(() => entryColumns(folder, people), [folder, people])
  const [owner, setOwner] = useState('')
  const [on, setOn] = useState(() => Object.fromEntries(allCols.map(c => [c.id, !['type', 'started', 'finished'].includes(c.id)])))
  const [includeSummary, setIncludeSummary] = useState(true)
  const [includeBills, setIncludeBills] = useState(false)
  const chosen = allCols.filter(c => on[c.id])
  const base = safeFileName(folder.name)
  const rows = [...entries].sort((a, b) => (a.date || '').localeCompare(b.date || ''))
  const toggle = id => setOn(p => ({ ...p, [id]: !p[id] }))
  const setAll = v => setOn(Object.fromEntries(allCols.map(c => [c.id, v])))
  const downloadPdf = () => printReport(buildReportHtml({ title: `${folder.name} — Record`, owner: owner.trim(), rangeText, folder, people, entries: rows, columns: chosen, includeSummary, includeBills }))
  const downloadCsv = () => downloadFile(`${base}.csv`, buildCsv(chosen, rows))
  const Check = ({ v, oc, children }) => <button onClick={oc} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 12.5, padding: '6px 12px', borderRadius: 18, cursor: 'pointer', fontFamily: 'DM Sans,sans-serif', fontWeight: 600, border: `1px solid ${v ? 'var(--teal)' : 'var(--border)'}`, background: v ? '#F0FDFB' : 'white', color: v ? 'var(--teal)' : 'var(--muted)' }}><span>{v ? '☑' : '☐'}</span>{children}</button>
  const secondaryBtn = { padding: '13px 14px', borderRadius: 11, border: '1px solid var(--border)', background: 'white', color: 'var(--teal)', cursor: 'pointer', fontFamily: 'DM Sans,sans-serif', fontWeight: 700, fontSize: 13.5, width: '100%' }
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(20,28,38,.5)', zIndex: 640, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
      <div onClick={e => e.stopPropagation()} style={{ background: '#F3F2F6', borderRadius: '22px 22px 0 0', width: '100%', maxWidth: 560, maxHeight: '92vh', overflowY: 'auto', boxShadow: '0 -10px 44px rgba(20,40,60,.28)' }}>
        <div style={{ background: 'var(--forest)', padding: '16px 20px 18px', position: 'sticky', top: 0, zIndex: 1 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div className="serif" style={{ fontSize: 19, fontWeight: 700, color: 'var(--green-light)' }}>Export “{folder.name}”</div>
            <button onClick={onClose} aria-label="Close" style={{ width: 32, height: 32, borderRadius: '50%', border: 'none', background: 'rgba(255,255,255,.16)', color: 'var(--green-light)', fontSize: 15, cursor: 'pointer' }}>✕</button>
          </div>
          <div style={{ fontSize: 12.5, color: 'var(--green-light)', opacity: .8, marginTop: 4 }}>Period: {rangeText} · pick the columns.</div>
        </div>
        <div style={{ padding: '16px 20px calc(20px + env(safe-area-inset-bottom))' }}>
          <Field label="Business or owner name (optional, on the PDF)"><input value={owner} onChange={e => setOwner(e.target.value)} placeholder="e.g. Rose Cottage B&B — Jane Smith" style={inputStyle} /></Field>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '4px 0 8px' }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)' }}>Columns</span>
            <span style={{ fontSize: 12 }}><button onClick={() => setAll(true)} style={{ background: 'none', border: 'none', color: 'var(--teal)', cursor: 'pointer', fontWeight: 600, fontFamily: 'DM Sans,sans-serif' }}>All</button><span style={{ color: 'var(--border)' }}> · </span><button onClick={() => setAll(false)} style={{ background: 'none', border: 'none', color: 'var(--teal)', cursor: 'pointer', fontWeight: 600, fontFamily: 'DM Sans,sans-serif' }}>None</button></span>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>{allCols.map(c => <Check key={c.id} v={on[c.id]} oc={() => toggle(c.id)}>{c.header}</Check>)}</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 18 }}>
            <Check v={includeSummary} oc={() => setIncludeSummary(v => !v)}>Money summary (PDF)</Check>
            <Check v={includeBills} oc={() => setIncludeBills(v => !v)}>Bill photos (PDF)</Check>
          </div>
          <button onClick={downloadPdf} style={{ ...primaryBtn(), width: '100%', padding: '14px', marginBottom: 10 }}>⬇ Download PDF</button>
          <button onClick={downloadCsv} style={secondaryBtn}>⬇ Download editable CSV</button>
          <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 12, textAlign: 'center', lineHeight: 1.5 }}>The PDF opens a print view (choose “Save as PDF”). The CSV opens in Excel or Google Sheets — fully editable.</div>
        </div>
      </div>
    </div>
  )
}
