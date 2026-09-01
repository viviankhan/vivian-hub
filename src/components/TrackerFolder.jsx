// src/components/TrackerFolder.jsx
// One tracker folder. Its fields are user-defined, so the entry form is built
// dynamically from them; a single entry can carry money in/out, time, numbers
// (miles…), a category, a person and a receipt at once. The Summary rolls it all
// up into money in / out / net and hours against optional budgets, with donut
// charts and plain-English highlights. Setup edits the fields and budgets.
// Export produces a PDF or an editable CSV of the columns you choose.
import { useMemo, useState, useRef } from 'react'
import { Glyph } from '../lib/glyphs.jsx'
import { inputStyle, labelStyle, card, primaryBtn, Field, HmInput, Suggest, Empty, Stat, RangeBar } from './trackerUi.jsx'
import { TrendColumns, RankedBars, abbrMoney, abbrHours } from './TrackerCharts.jsx'
import { scanReceipt, receiptScanAvailable } from '../lib/parseReceipt.js'
import {
  FIELD_TYPES, FIELD_TYPE_ORDER, makeField,
  inRange, todayStr, fmtHours, decimalHours, fmtMoney, fmtNumber, personName, num, val,
  summarize, groupSlices, autoCharts, computeHighlights, fieldsOfType, firstFieldOfType, monthlySeries,
  compressImage, dataUrlToBase64, prettyDate, fieldColumns,
  buildReportHtml, printReport, buildCsv, downloadFile, safeFileName,
} from '../lib/trackers.js'

const SUBTABS = [['summary', 'Summary'], ['entries', 'Entries'], ['people', 'People'], ['setup', 'Setup']]

export default function TrackerFolder({
  folder, people, entries, suggest, rememberValue,
  preset, setPreset, custom, setCustom, range, rangeText, prevWindow,
  addEntry, deleteEntry, addPerson, updatePerson, deletePerson,
  onRename, onDelete, onUpdateFolder, onBack,
}) {
  const [sub, setSub] = useState('summary')
  const [exportOpen, setExportOpen] = useState(false)
  const fields = folder.fields || []
  const fEntries = useMemo(() => entries.filter(e => inRange(e.date, range)), [entries, range])
  const prevEntries = useMemo(() => prevWindow ? entries.filter(e => inRange(e.date, prevWindow)) : null, [entries, prevWindow])

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
      {sub === 'entries' && <EntriesView folder={folder} entries={fEntries} people={people} suggest={suggest} onAdd={addEntry} onDelete={deleteEntry} />}
      {sub === 'people' && <People people={people} entries={entries} fields={fields} onAdd={addPerson} onUpdate={updatePerson} onDelete={deletePerson} />}
      {sub === 'setup' && <Setup folder={folder} onUpdateFolder={onUpdateFolder} />}

      {exportOpen && <ExportModal folder={folder} entries={fEntries} people={people} rangeText={rangeText} onClose={() => setExportOpen(false)} />}
    </div>
  )
}

// ── Summary ─────────────────────────────────────────────────────
const RAMP_FOR = { moneyOut: 'spend', moneyIn: 'revenue', hours: 'hours' }
function FolderSummary({ folder, entries, allEntries, people, rangeText, prevEntries }) {
  const fields = folder.fields || []
  const s = summarize(entries, fields)
  const charts = useMemo(() => autoCharts(fields), [fields])
  const months = useMemo(() => monthlySeries(allEntries, fields, 6), [allEntries, fields])
  const highlights = useMemo(() => computeHighlights({ entries, fields, people, budgetMoney: folder.budgetMoney, budgetHours: folder.budgetHours, prevEntries }), [entries, fields, people, folder.budgetMoney, folder.budgetHours, prevEntries])
  const hasMoney = fieldsOfType(fields, 'moneyIn').length || fieldsOfType(fields, 'moneyOut').length
  const hasHours = fieldsOfType(fields, 'hours').length

  if (fields.length === 0) return <Empty text="This tracker has no fields yet. Open Setup to add fields (money, time, category…), then log entries." />
  if (s.count === 0) return <Empty text={`Nothing logged for ${rangeText} yet. Add entries in the Entries tab.`} />

  const moneyLeft = folder.budgetMoney > 0 ? folder.budgetMoney - s.moneyOut : null
  const timeLeft = folder.budgetHours > 0 ? folder.budgetHours - s.mins : null
  const monthsHaveData = months.some(m => m.moneyIn || m.moneyOut || m.mins)

  return (
    <>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
        {hasMoney ? <>
          <Stat label="Money in" value={fmtMoney(s.moneyIn)} sub="income / revenue" />
          <Stat label="Money out" value={fmtMoney(s.moneyOut)} sub={`${s.count} entr${s.count === 1 ? 'y' : 'ies'}`} />
          <Stat label={s.net >= 0 ? 'Left over' : 'Shortfall'} value={fmtMoney(s.net)} sub="money in − out" />
        </> : null}
        {hasHours ? <Stat label="Hours" value={`${decimalHours(s.mins)}h`} sub={fmtHours(s.mins)} /> : null}
      </div>

      {(moneyLeft != null || timeLeft != null) && (
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
          {moneyLeft != null && <BudgetBar label="Budget" used={s.moneyOut} total={folder.budgetMoney} left={moneyLeft} fmt={fmtMoney} />}
          {timeLeft != null && <BudgetBar label="Time budget" used={s.mins} total={folder.budgetHours} left={timeLeft} fmt={fmtHours} />}
        </div>
      )}

      {highlights.length > 0 && <Highlights items={highlights} />}

      {/* Trend over time — the thing a pie can't show. */}
      {monthsHaveData && (hasMoney
        ? <TrendColumns title="Net by month" caption="money in − out · last 6 months" series={months.map(m => ({ key: m.key, label: m.label, value: m.net }))} abbr={abbrMoney} diverging />
        : hasHours
          ? <TrendColumns title="Hours by month" caption="last 6 months" series={months.map(m => ({ key: m.key, label: m.label, value: m.mins }))} abbr={abbrHours} diverging={false} hue="#4A9EB5" />
          : null)}

      {/* Breakdowns — ranked bars, one baseline, biggest first. */}
      {charts.map(c => {
        const g = groupSlices(entries, c.dim, c.measure, people, { colorFor: c.dim.type === 'person' ? (k => people.find(p => p.id === k)?.color || '#8899AA') : undefined })
        if (g.total <= 0) return null
        const fmt = c.measure.type === 'hours' ? fmtHours : (v => fmtMoney(v))
        return <RankedBars key={c.id} title={c.title[0].toUpperCase() + c.title.slice(1)} slices={g.slices} total={g.total} ramp={RAMP_FOR[c.measure.type] || 'neutral'} formatValue={fmt} />
      })}
    </>
  )
}
function BudgetBar({ label, used, total, left, fmt }) {
  const pct = Math.max(0, Math.min(1, used / (total || 1)))
  const over = left < 0
  return (
    <div style={{ flex: 1, minWidth: 200, background: 'white', border: '1px solid var(--border)', borderRadius: 14, padding: '14px 16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
        <span style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: .5 }}>{label}</span>
        <span style={{ fontSize: 13, fontWeight: 700, color: over ? 'var(--coral)' : 'var(--forest)' }}>{over ? `${fmt(-left)} over` : `${fmt(left)} left`}</span>
      </div>
      <div style={{ height: 9, borderRadius: 6, background: '#EEECF0', overflow: 'hidden' }}>
        <div style={{ width: `${pct * 100}%`, height: '100%', background: over ? 'var(--coral)' : 'var(--teal)', borderRadius: 6, transition: 'width .4s' }} />
      </div>
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

// ── Entries (dynamic form + list) ───────────────────────────────
function EntriesView({ folder, entries, people, suggest, onAdd, onDelete }) {
  const fields = folder.fields || []
  const [open, setOpen] = useState(entries.length === 0)
  const [date, setDate] = useState(todayStr())
  const [values, setValues] = useState({})
  const [scanMsg, setScanMsg] = useState('')
  const [scanning, setScanning] = useState(false)
  const setV = (id, v) => setValues(prev => ({ ...prev, [id]: v }))

  const hasMeasure = fields.some(f => FIELD_TYPES[f.type]?.measure || f.type === 'text' || f.type === 'category')
  const save = () => {
    // Require at least one non-empty value so blank entries aren't saved.
    const any = fields.some(f => { const v = values[f.id]; return v != null && v !== '' && v !== 0 })
    if (!any) return
    onAdd({ date: date || todayStr(), values: { ...values } })
    setValues({}); setDate(date)
  }

  const onReceipt = async (fieldId, file) => {
    if (!file) return
    setScanMsg('')
    try {
      const thumb = await compressImage(file, { maxDim: 900, quality: 0.6 })
      setV(fieldId, thumb)
      if (!receiptScanAvailable) { setScanMsg('Photo attached.'); return }
      setScanning(true); setScanMsg('Reading the receipt…')
      const big = await compressImage(file, { maxDim: 1400, quality: 0.82 })
      const cats = fieldsOfType(fields, 'category').flatMap(f => suggest(f.id))
      const draft = await scanReceipt(dataUrlToBase64(big), { categories: cats })
      // Map the receipt into the folder's fields where they exist.
      const moneyOut = firstFieldOfType(fields, 'moneyOut')
      const cat = firstFieldOfType(fields, 'category')
      const txt = firstFieldOfType(fields, 'text')
      setValues(prev => {
        const next = { ...prev }
        if (moneyOut && draft.total > 0 && !num(next[moneyOut.id])) next[moneyOut.id] = draft.total
        if (cat && draft.category && !next[cat.id]) next[cat.id] = draft.category
        if (txt && (draft.paidTo || draft.vendor) && !next[txt.id]) next[txt.id] = draft.paidTo || draft.vendor
        return next
      })
      if (draft.date) setDate(draft.date)
      setScanMsg(draft.total > 0 || draft.vendor ? '✓ Filled from the receipt — check it over.' : 'Couldn’t read much — please fill it in.')
    } catch (err) { setScanMsg((err && err.message) || 'Could not scan that photo.') }
    finally { setScanning(false) }
  }

  const rows = [...entries].sort((a, b) => (b.date || '').localeCompare(a.date || ''))
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '2px 0 10px' }}>
        <div style={{ fontSize: 12, color: 'var(--muted)', letterSpacing: 1, textTransform: 'uppercase', fontWeight: 600 }}>{rows.length} entr{rows.length === 1 ? 'y' : 'ies'}</div>
        {fields.length > 0 && <button onClick={() => setOpen(o => !o)} style={{ ...primaryBtn(), padding: '7px 14px', fontSize: 12.5 }}>{open ? 'Close' : '+ Add entry'}</button>}
      </div>

      {fields.length === 0 ? <Empty text="No fields yet — open the Setup tab to add fields (money, time, category, miles…), then you can log entries." />
        : open && (
          <div style={card}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 12 }}>
              <Field label="Date"><input type="date" value={date} max={todayStr()} onChange={e => setDate(e.target.value)} style={inputStyle} /></Field>
              {fields.map(f => (
                <FieldInput key={f.id} field={f} value={values[f.id]} onChange={v => setV(f.id, v)} people={people}
                  options={suggest(f.id)} onReceipt={onReceipt} scanning={scanning} scanMsg={scanMsg} />
              ))}
            </div>
            <div style={{ display: 'flex', marginTop: 6 }}>
              <button onClick={save} style={{ ...primaryBtn(), marginLeft: 'auto' }}>Save entry</button>
            </div>
          </div>
        )}

      {rows.length === 0 ? (fields.length > 0 && <Empty text="No entries in this period." />)
        : <div style={{ ...card, padding: '4px 16px' }}>
          {rows.map((e, i) => <EntryRow key={e.id} entry={e} fields={fields} people={people} onDelete={() => onDelete(e.id)} last={i === rows.length - 1} />)}
        </div>}
    </>
  )
}

// One input, chosen by field type.
function FieldInput({ field, value, onChange, people, options, onReceipt, scanning, scanMsg }) {
  const t = field.type
  if (t === 'hours') return <div><label style={labelStyle}>{field.name}</label><HmInput mins={num(value)} onChange={onChange} /></div>
  if (t === 'moneyIn' || t === 'moneyOut') return <Field label={field.name}><input type="number" min="0" step="0.01" value={value ?? ''} onChange={e => onChange(e.target.value === '' ? '' : Number(e.target.value))} placeholder="0.00" style={inputStyle} /></Field>
  if (t === 'number') return <Field label={field.name}><input type="number" step="any" value={value ?? ''} onChange={e => onChange(e.target.value === '' ? '' : Number(e.target.value))} placeholder="0" style={inputStyle} /></Field>
  if (t === 'person') return <Field label={field.name}><select value={value || ''} onChange={e => onChange(e.target.value)} style={inputStyle}><option value="">— Select —</option>{people.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
  if (t === 'category') return <Field label={field.name}><Suggest value={value || ''} onChange={onChange} placeholder={field.name} options={options} listId={'sg-' + field.id} /></Field>
  if (t === 'receipt') return (
    <div>
      <label style={labelStyle}>{field.name}</label>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <input type="file" accept="image/*" onChange={e => { onReceipt(field.id, e.target.files?.[0]); e.target.value = '' }} style={{ display: 'none' }} id={'rc-' + field.id} />
        <label htmlFor={'rc-' + field.id} style={{ ...primaryBtn(!scanning), display: 'inline-block', background: '#7BBFD4', color: '#0d2a35', fontSize: 13, padding: '9px 14px', opacity: scanning ? .6 : 1, pointerEvents: scanning ? 'none' : 'auto' }}>📷 {receiptScanAvailable ? 'Scan' : 'Attach'}</label>
        {value && <img src={value} alt="" style={{ height: 40, borderRadius: 7, border: '1px solid var(--border)' }} />}
      </div>
      {scanMsg && <div style={{ fontSize: 11.5, color: scanMsg.startsWith('✓') ? '#155724' : 'var(--muted)', marginTop: 4 }}>{scanMsg}</div>}
    </div>
  )
  return <Field label={field.name}><input value={value || ''} onChange={e => onChange(e.target.value)} placeholder={field.name} style={inputStyle} /></Field>
}

// A compact list row summarizing an entry from its fields.
function EntryRow({ entry, fields, people, onDelete, last }) {
  const textF = fieldsOfType(fields, 'text')[0] || fieldsOfType(fields, 'category')[0]
  const catF = fieldsOfType(fields, 'category')[0]
  const personF = fieldsOfType(fields, 'person')[0]
  const numF = fieldsOfType(fields, 'number')[0]
  const receiptF = fieldsOfType(fields, 'receipt').find(f => val(entry, f.id))
  const moneyOut = fieldsOfType(fields, 'moneyOut').reduce((s, f) => s + num(val(entry, f.id)), 0)
  const moneyIn = fieldsOfType(fields, 'moneyIn').reduce((s, f) => s + num(val(entry, f.id)), 0)
  const mins = fieldsOfType(fields, 'hours').reduce((s, f) => s + num(val(entry, f.id)), 0)

  const title = (textF && (val(entry, textF.id) || '').toString().trim()) || (catF && val(entry, catF.id)) || 'Entry'
  const metaBits = [prettyDate(entry.date)]
  if (personF && val(entry, personF.id)) metaBits.push(personName(people, val(entry, personF.id)))
  if (catF && catF !== textF && val(entry, catF.id)) metaBits.push(val(entry, catF.id))
  if (numF && num(val(entry, numF.id))) metaBits.push(`${fmtNumber(val(entry, numF.id))} ${numF.name.toLowerCase()}`)
  if (mins) metaBits.push(fmtHours(mins))

  const right = moneyOut > 0 ? { txt: '−' + fmtMoney(moneyOut), color: 'var(--coral)' }
    : moneyIn > 0 ? { txt: '+' + fmtMoney(moneyIn), color: '#0a7d3c' }
    : mins > 0 ? { txt: fmtHours(mins), color: 'var(--text)' } : { txt: '', color: 'var(--text)' }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '11px 0', borderBottom: last ? 'none' : '1px solid #F1EEF3' }}>
      {receiptF ? <img src={val(entry, receiptF.id)} alt="" style={{ width: 34, height: 34, borderRadius: 7, objectFit: 'cover', border: '1px solid var(--border)', flexShrink: 0 }} />
        : <span style={{ width: 10, height: 10, borderRadius: 3, background: moneyOut > 0 ? '#E8804A' : moneyIn > 0 ? '#5FA86E' : 'var(--teal)', flexShrink: 0 }} />}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13.5, color: 'var(--text)', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{title}</div>
        <div style={{ fontSize: 11.5, color: 'var(--muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{metaBits.join(' · ')}</div>
      </div>
      {right.txt && <span style={{ fontSize: 13, fontWeight: 700, color: right.color, flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>{right.txt}</span>}
      <button onClick={onDelete} aria-label="Delete" style={{ background: 'none', border: 'none', color: '#B9B3AC', fontSize: 15, cursor: 'pointer', padding: '0 2px', flexShrink: 0 }}>✕</button>
    </div>
  )
}

// ── People ──────────────────────────────────────────────────────
function People({ people, entries, fields, onAdd, onUpdate, onDelete }) {
  const [name, setName] = useState(''); const [role, setRole] = useState('')
  const add = () => { if (!name.trim()) return; onAdd({ name: name.trim(), role: role.trim() }); setName(''); setRole('') }
  const personFields = fieldsOfType(fields, 'person').map(f => f.id)
  const statsFor = id => {
    let mins = 0, paid = 0
    for (const e of entries) {
      if (!personFields.some(pf => val(e, pf) === id)) continue
      for (const f of fieldsOfType(fields, 'hours')) mins += num(val(e, f.id))
      for (const f of fieldsOfType(fields, 'moneyOut')) paid += num(val(e, f.id))
    }
    return { mins, paid }
  }
  return (
    <>
      <div style={card}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 10 }}>Add a person</div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div style={{ flex: 2, minWidth: 160 }}><label style={labelStyle}>Name</label><input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Ana, or your own name" style={inputStyle} onKeyDown={e => e.key === 'Enter' && add()} /></div>
          <div style={{ flex: 2, minWidth: 140 }}><label style={labelStyle}>Role (optional)</label><input value={role} onChange={e => setRole(e.target.value)} placeholder="e.g. Housekeeping" style={inputStyle} onKeyDown={e => e.key === 'Enter' && add()} /></div>
          <button onClick={add} disabled={!name.trim()} style={primaryBtn(!!name.trim())}>Add</button>
        </div>
        <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 10 }}>People can be attached to entries through a “Person” field (add one in Setup).</div>
      </div>
      {people.length === 0 ? <Empty text="No people yet." />
        : <div style={{ ...card, padding: '4px 16px' }}>
          {people.map((w, i) => {
            const st = statsFor(w.id)
            return (
              <div key={w.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 0', borderBottom: i < people.length - 1 ? '1px solid #F1EEF3' : 'none' }}>
                <span style={{ width: 12, height: 12, borderRadius: 4, background: w.color, flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, color: 'var(--text)', fontWeight: 600 }}>{w.name}</div>
                  <div style={{ fontSize: 11.5, color: 'var(--muted)' }}>{w.role ? w.role + ' · ' : ''}{fmtHours(st.mins)} logged{st.paid ? ' · ' + fmtMoney(st.paid) + ' paid' : ''}</div>
                </div>
                <button onClick={() => { const n = prompt('Rename person', w.name); if (n && n.trim()) onUpdate(w.id, { name: n.trim() }) }} style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 8, padding: '5px 10px', fontSize: 12, color: 'var(--muted)', cursor: 'pointer', fontFamily: 'DM Sans,sans-serif' }}>Rename</button>
                <button onClick={() => { if (confirm(`Remove ${w.name}? Their past entries stay but show as "Unknown".`)) onDelete(w.id) }} style={{ background: 'none', border: 'none', color: '#B9B3AC', fontSize: 16, cursor: 'pointer', padding: '0 2px' }}>✕</button>
              </div>
            )
          })}
        </div>}
    </>
  )
}

// ── Setup (fields + budgets) ────────────────────────────────────
function Setup({ folder, onUpdateFolder }) {
  const fields = folder.fields || []
  const [newType, setNewType] = useState('moneyOut')
  const [newName, setNewName] = useState('')
  const [bMoney, setBMoney] = useState(folder.budgetMoney || '')
  const [bHours, setBHours] = useState(folder.budgetHours || 0)

  const addField = () => {
    if (!newName.trim()) return
    onUpdateFolder({ fields: [...fields, makeField(newType, newName.trim())] })
    setNewName('')
  }
  const removeField = (id) => { if (confirm('Remove this field? Existing entries keep their other values.')) onUpdateFolder({ fields: fields.filter(f => f.id !== id) }) }
  const renameField = (id) => { const f = fields.find(x => x.id === id); const n = prompt('Rename field', f.name); if (n && n.trim()) onUpdateFolder({ fields: fields.map(x => x.id === id ? { ...x, name: n.trim() } : x) }) }
  const move = (id, dir) => {
    const i = fields.findIndex(f => f.id === id); const j = i + dir
    if (i < 0 || j < 0 || j >= fields.length) return
    const next = [...fields];[next[i], next[j]] = [next[j], next[i]]; onUpdateFolder({ fields: next })
  }
  const saveBudgets = () => onUpdateFolder({ budgetMoney: bMoney === '' ? null : Number(bMoney), budgetHours: Number(bHours) || null })

  return (
    <>
      <div style={card}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>Fields</div>
        <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 12 }}>These are the things each entry records. Money and time fields feed the summary.</div>
        {fields.length === 0 ? <div style={{ fontSize: 12.5, color: 'var(--muted)', marginBottom: 12 }}>No fields yet — add one below.</div>
          : fields.map((f, i) => (
            <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0', borderBottom: i < fields.length - 1 ? '1px solid #F1EEF3' : 'none' }}>
              <span style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--teal)', background: '#F0FDFB', border: '1px solid #cdeae6', borderRadius: 6, padding: '2px 7px', flexShrink: 0 }}>{FIELD_TYPES[f.type]?.label || f.type}</span>
              <span style={{ flex: 1, minWidth: 0, fontSize: 13.5, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{f.name}</span>
              <button onClick={() => move(f.id, -1)} disabled={i === 0} style={arrowBtn(i === 0)}>↑</button>
              <button onClick={() => move(f.id, 1)} disabled={i === fields.length - 1} style={arrowBtn(i === fields.length - 1)}>↓</button>
              <button onClick={() => renameField(f.id)} style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 8, padding: '4px 9px', fontSize: 11.5, color: 'var(--muted)', cursor: 'pointer', fontFamily: 'DM Sans,sans-serif' }}>Rename</button>
              <button onClick={() => removeField(f.id)} style={{ background: 'none', border: 'none', color: '#B9B3AC', fontSize: 15, cursor: 'pointer', padding: '0 2px' }}>✕</button>
            </div>
          ))}
        <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div style={{ minWidth: 150 }}><label style={labelStyle}>Type</label>
            <select value={newType} onChange={e => setNewType(e.target.value)} style={inputStyle}>
              {FIELD_TYPE_ORDER.map(t => <option key={t} value={t}>{FIELD_TYPES[t].label}</option>)}
            </select>
          </div>
          <div style={{ flex: 1, minWidth: 150 }}><label style={labelStyle}>Name</label><input value={newName} onChange={e => setNewName(e.target.value)} placeholder="e.g. Gas, Miles, Revenue" style={inputStyle} onKeyDown={e => e.key === 'Enter' && addField()} /></div>
          <button onClick={addField} disabled={!newName.trim()} style={primaryBtn(!!newName.trim())}>+ Add field</button>
        </div>
      </div>

      <div style={card}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>Budget for the period</div>
        <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 12 }}>Optional. When set, the summary shows how much money and time you have left for the selected time frame.</div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div style={{ minWidth: 150 }}><label style={labelStyle}>Money budget</label><input type="number" min="0" step="0.01" value={bMoney} onChange={e => setBMoney(e.target.value)} placeholder="none" style={inputStyle} /></div>
          <div><label style={labelStyle}>Time budget</label><HmInput mins={Number(bHours) || 0} onChange={setBHours} /></div>
          <button onClick={saveBudgets} style={primaryBtn()}>Save budget</button>
        </div>
      </div>
    </>
  )
}
const arrowBtn = (dim) => ({ background: 'none', border: '1px solid var(--border)', borderRadius: 7, padding: '3px 8px', fontSize: 12, color: dim ? '#CBD2D9' : 'var(--muted)', cursor: dim ? 'default' : 'pointer' })

// ── Export (PDF + editable CSV) ─────────────────────────────────
function ExportModal({ folder, entries, people, rangeText, onClose }) {
  const fields = folder.fields || []
  const allCols = useMemo(() => fieldColumns(fields, people), [fields, people])
  const [owner, setOwner] = useState('')
  const [on, setOn] = useState(() => Object.fromEntries(allCols.map(c => [c.id, true])))
  const [includeSummary, setIncludeSummary] = useState(true)
  const chosen = allCols.filter(c => on[c.id])
  const base = safeFileName(folder.name)
  const toggle = id => setOn(p => ({ ...p, [id]: !p[id] }))
  const setAll = v => setOn(Object.fromEntries(allCols.map(c => [c.id, v])))

  const rows = [...entries].sort((a, b) => (a.date || '').localeCompare(b.date || ''))
  const downloadPdf = () => printReport(buildReportHtml({ title: `${folder.name} — Record`, owner: owner.trim(), rangeText, fields, entries: rows, people, columns: chosen, includeSummary }))
  const downloadCsv = () => downloadFile(`${base}.csv`, buildCsv(chosen, rows))

  const secondaryBtn = { padding: '13px 14px', borderRadius: 11, border: '1px solid var(--border)', background: 'white', color: 'var(--teal)', cursor: 'pointer', fontFamily: 'DM Sans,sans-serif', fontWeight: 700, fontSize: 13.5, flex: 1 }
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(20,28,38,.5)', zIndex: 640, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
      <div onClick={e => e.stopPropagation()} style={{ background: '#F3F2F6', borderRadius: '22px 22px 0 0', width: '100%', maxWidth: 560, maxHeight: '92vh', overflowY: 'auto', boxShadow: '0 -10px 44px rgba(20,40,60,.28)' }}>
        <div style={{ background: 'var(--forest)', padding: '16px 20px 18px', position: 'sticky', top: 0, zIndex: 1 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div className="serif" style={{ fontSize: 19, fontWeight: 700, color: 'var(--green-light)' }}>Export “{folder.name}”</div>
            <button onClick={onClose} aria-label="Close" style={{ width: 32, height: 32, borderRadius: '50%', border: 'none', background: 'rgba(255,255,255,.16)', color: 'var(--green-light)', fontSize: 15, cursor: 'pointer' }}>✕</button>
          </div>
          <div style={{ fontSize: 12.5, color: 'var(--green-light)', opacity: .8, marginTop: 4 }}>Period: {rangeText} · pick the columns to include.</div>
        </div>
        <div style={{ padding: '16px 20px calc(20px + env(safe-area-inset-bottom))' }}>
          <Field label="Business or owner name (optional, shown on the PDF)"><input value={owner} onChange={e => setOwner(e.target.value)} placeholder="e.g. Rose Cottage B&B — Jane Smith" style={inputStyle} /></Field>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '4px 0 8px' }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)' }}>Columns</span>
            <span style={{ fontSize: 12 }}>
              <button onClick={() => setAll(true)} style={{ background: 'none', border: 'none', color: 'var(--teal)', cursor: 'pointer', fontWeight: 600, fontFamily: 'DM Sans,sans-serif' }}>All</button>
              <span style={{ color: 'var(--border)' }}> · </span>
              <button onClick={() => setAll(false)} style={{ background: 'none', border: 'none', color: 'var(--teal)', cursor: 'pointer', fontWeight: 600, fontFamily: 'DM Sans,sans-serif' }}>None</button>
            </span>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
            {allCols.map(c => (
              <button key={c.id} onClick={() => toggle(c.id)} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 12.5, padding: '6px 12px', borderRadius: 18, cursor: 'pointer', fontFamily: 'DM Sans,sans-serif', fontWeight: 600, border: `1px solid ${on[c.id] ? 'var(--teal)' : 'var(--border)'}`, background: on[c.id] ? '#F0FDFB' : 'white', color: on[c.id] ? 'var(--teal)' : 'var(--muted)' }}>
                <span>{on[c.id] ? '☑' : '☐'}</span>{c.header}
              </button>
            ))}
          </div>
          <div style={{ marginBottom: 18 }}>
            <button onClick={() => setIncludeSummary(v => !v)} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 12.5, padding: '6px 12px', borderRadius: 18, cursor: 'pointer', fontFamily: 'DM Sans,sans-serif', fontWeight: 600, border: `1px solid ${includeSummary ? 'var(--teal)' : 'var(--border)'}`, background: includeSummary ? '#F0FDFB' : 'white', color: includeSummary ? 'var(--teal)' : 'var(--muted)' }}>
              <span>{includeSummary ? '☑' : '☐'}</span>Money in/out/net summary (PDF)
            </button>
          </div>
          <button onClick={downloadPdf} style={{ ...primaryBtn(), width: '100%', padding: '14px', marginBottom: 10 }}>⬇ Download PDF</button>
          <button onClick={downloadCsv} style={{ ...secondaryBtn, width: '100%' }}>⬇ Download editable CSV</button>
          <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 12, textAlign: 'center', lineHeight: 1.5 }}>The PDF opens a print view (choose “Save as PDF”). The CSV downloads and opens in Excel or Google Sheets — fully editable.</div>
        </div>
      </div>
    </div>
  )
}
