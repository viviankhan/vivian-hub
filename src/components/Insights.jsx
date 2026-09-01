// src/components/Insights.jsx
// ─────────────────────────────────────────────────────────────
// The Insights tab. A general Overview (money in / out / net + hours across all
// your trackers, a few plain-English highlights, and clean donut charts — no
// generic bar breakdowns) above your custom "trackers": folders you create with
// fields YOU define, so you can log any data and see how it affects your money
// and time. Exports to PDF and editable CSV. Self-contained per-user data.
// ─────────────────────────────────────────────────────────────
import { useEffect, useMemo, useState } from 'react'
import {
  getTrackerFolders, setTrackerFolders, getTrackerPeople, setTrackerPeople,
  getTrackerEntries, setTrackerEntries, getTrackerCats, setTrackerCats,
} from '../lib/storage.js'
import { Glyph } from '../lib/glyphs.jsx'
import TrackerFolder, { Highlights } from './TrackerFolder.jsx'
import { TrendColumns, RankedBars, abbrMoney } from './TrackerCharts.jsx'
import { inputStyle, labelStyle, card, primaryBtn, Field, Stat, RangeBar } from './trackerUi.jsx'
import {
  resolveRange, prevRange, inRange, rangeLabel,
  fmtHours, decimalHours, fmtMoney, summarize, financials, toSlices, fieldsOfType, val, num, monthlySeries,
  personName, ACCENT_COLORS, FOLDER_ICONS, TEMPLATES, DEFAULT_TAX_RATE, DEFAULT_MILEAGE_RATE,
  buildTableHtml, printReport, buildCsv, downloadFile,
} from '../lib/trackers.js'

const uid = (p) => `${p}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`

export default function Insights() {
  const [loading, setLoading] = useState(true)
  const [folders, setFolders] = useState([])
  const [people, setPeople] = useState([])
  const [entries, setEntries] = useState([])
  const [cats, setCats] = useState({})   // suggestions: { folderId: { fieldId: [values] } }

  const [openId, setOpenId] = useState(null)
  const [preset, setPreset] = useState('this-month')
  const [custom, setCustom] = useState({ start: '', end: '' })
  const [newOpen, setNewOpen] = useState(false)
  const [exportOpen, setExportOpen] = useState(false)

  useEffect(() => {
    let alive = true
    Promise.all([getTrackerFolders(), getTrackerPeople(), getTrackerEntries(), getTrackerCats()])
      .then(([f, p, e, c]) => { if (!alive) return; setFolders(f); setPeople(p); setEntries(e); setCats(c && typeof c === 'object' ? c : {}); setLoading(false) })
    return () => { alive = false }
  }, [])

  const range = useMemo(() => resolveRange(preset, custom), [preset, custom])
  const prevWindow = useMemo(() => prevRange(preset), [preset])
  const rangeText = rangeLabel(preset, range)

  const persist = (setter, saver) => (next) => { setter(next); saver(next).catch(err => { console.error(err); alert('⚠️ Could not save. Check your connection.') }) }
  const saveFolders = persist(setFolders, setTrackerFolders)
  const savePeople = persist(setPeople, setTrackerPeople)
  const saveEntries = persist(setEntries, setTrackerEntries)

  const suggest = (folderId, fieldId) => cats[folderId]?.[fieldId] || []
  const rememberValues = (folderId, folder, values) => {
    const rememberable = (folder.fields || []).filter(f => f.type === 'category' || f.type === 'text')
    if (!rememberable.length) return
    setCats(prev => {
      const fc = { ...(prev[folderId] || {}) }
      let changed = false
      for (const f of rememberable) {
        const v = (values[f.id] || '').toString().trim(); if (!v) continue
        const list = fc[f.id] || []
        if (!list.includes(v)) { fc[f.id] = [...list, v].slice(-40); changed = true }
      }
      if (!changed) return prev
      const next = { ...prev, [folderId]: fc }; setTrackerCats(next).catch(() => {}); return next
    })
  }

  const addFolder = ({ name, icon, color, fields }) => {
    const f = {
      id: uid('fld'), name, icon, color, fields,
      budgetMoney: null, budgetHours: null,
      taxRate: DEFAULT_TAX_RATE, mileageRate: DEFAULT_MILEAGE_RATE, currency: '$', fixedCosts: [],
      createdAt: new Date().toISOString(),
    }
    saveFolders([...folders, f]); setOpenId(f.id); setNewOpen(false)
  }
  const updateFolder = (id, changes) => saveFolders(folders.map(f => f.id === id ? { ...f, ...changes } : f))
  const deleteFolder = (id) => {
    saveFolders(folders.filter(f => f.id !== id))
    saveEntries(entries.filter(e => e.folderId !== id))
    savePeople(people.filter(p => p.folderId !== id))
    setOpenId(null)
  }

  if (loading) return <div><div className="page-title">Insights</div><div style={{ padding: 20, color: 'var(--muted)' }}>Loading your records…</div></div>

  // ── A folder is open ──────────────────────────────────────────
  if (openId) {
    const folder = folders.find(f => f.id === openId)
    if (!folder) { setOpenId(null); return null }
    const fPeople = people.filter(p => p.folderId === openId)
    const fEntries = entries.filter(e => e.folderId === openId)
    return (
      <div>
        <div className="page-title">Insights</div>
        <TrackerFolder
          folder={folder} people={fPeople} entries={fEntries}
          suggest={fid => suggest(openId, fid)} rememberValue={() => {}}
          preset={preset} setPreset={setPreset} custom={custom} setCustom={setCustom} range={range} rangeText={rangeText} prevWindow={prevWindow}
          addEntry={e => { saveEntries([...entries, { id: uid('e'), folderId: openId, createdAt: new Date().toISOString(), ...e }]); rememberValues(openId, folder, e.values || {}) }}
          addManyEntries={list => saveEntries([...entries, ...list.map(e => ({ id: uid('e'), folderId: openId, createdAt: new Date().toISOString(), ...e }))])}
          deleteEntry={id => saveEntries(entries.filter(e => e.id !== id))}
          addPerson={p => savePeople([...people, { id: uid('p'), folderId: openId, color: ACCENT_COLORS[fPeople.length % ACCENT_COLORS.length], createdAt: new Date().toISOString(), ...p }])}
          updatePerson={(id, ch) => savePeople(people.map(p => p.id === id ? { ...p, ...ch } : p))}
          deletePerson={id => savePeople(people.filter(p => p.id !== id))}
          onRename={name => updateFolder(openId, { name })}
          onUpdateFolder={ch => updateFolder(openId, ch)}
          onDelete={() => deleteFolder(openId)}
          onBack={() => setOpenId(null)}
        />
      </div>
    )
  }

  // ── Overview ──────────────────────────────────────────────────
  const perFolder = folders.map(f => {
    const fe = entries.filter(e => e.folderId === f.id && inRange(e.date, range))
    return { folder: f, s: summarize(fe, f.fields || []), entries: fe }
  })
  const agg = perFolder.reduce((a, pf) => ({ moneyIn: a.moneyIn + pf.s.moneyIn, moneyOut: a.moneyOut + pf.s.moneyOut, mins: a.mins + pf.s.mins, count: a.count + pf.s.count }), { moneyIn: 0, moneyOut: 0, mins: 0, count: 0 })
  agg.net = agg.moneyIn - agg.moneyOut
  // Aggregate the financial cascade across trackers (each carries its own tax %).
  const fins = perFolder.map(pf => financials(pf.s, pf.folder))
  agg.profit = fins.reduce((a, f) => a + f.profit, 0)
  agg.taxSetAside = fins.reduce((a, f) => a + f.taxSetAside, 0)
  agg.takeHome = fins.reduce((a, f) => a + f.takeHome, 0)
  const hasData = agg.count > 0
  const money$ = v => fmtMoney(v)
  const folderColor = k => folders.find(f => f.id === k)?.color
  const spendByFolder = toSlices(perFolder.map(pf => ({ key: pf.folder.id, label: pf.folder.name, value: pf.s.moneyOut })), { colorFor: folderColor })
  const hoursByFolder = toSlices(perFolder.map(pf => ({ key: pf.folder.id, label: pf.folder.name, value: pf.s.mins })), { colorFor: folderColor })
  const overviewHi = overviewHighlights(perFolder, agg)
  // Combined net-by-month across every tracker (full history, not range-limited).
  const overviewMonths = (() => {
    let combined = null
    for (const f of folders) {
      const ms = monthlySeries(entries.filter(e => e.folderId === f.id), f.fields || [], 6)
      if (!combined) combined = ms.map(m => ({ key: m.key, label: m.label, value: m.net }))
      else ms.forEach((m, i) => { combined[i].value += m.net })
    }
    return combined || []
  })()
  const monthsHaveData = overviewMonths.some(m => m.value !== 0)

  return (
    <div>
      <div className="page-title">Insights</div>
      <div className="page-sub">Your own trackers for anything worth recording — money in and out, hours, mileage, whatever you define. See where your time and money go over any period and how much is left, then export a tidy record (PDF or editable CSV).</div>

      <RangeBar preset={preset} setPreset={setPreset} custom={custom} setCustom={setCustom}
        right={folders.length > 0 && <button onClick={() => setExportOpen(true)} style={{ ...primaryBtn(), padding: '7px 14px', fontSize: 12.5 }}>⬇ Export all</button>} />

      {folders.length === 0 ? (
        <div style={{ ...card, textAlign: 'center', padding: '30px 22px' }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>🗂️</div>
          <div className="serif" style={{ fontSize: 20, fontWeight: 700, color: 'var(--forest)', marginBottom: 6 }}>Create your first tracker</div>
          <div style={{ fontSize: 13.5, color: 'var(--muted)', lineHeight: 1.5, maxWidth: 400, margin: '0 auto 16px' }}>
            A tracker is a folder for record-keeping with fields you choose. Log money in and out, hours, mileage — anything — and see how it affects your money and time.
          </div>
          <button onClick={() => setNewOpen(true)} style={{ ...primaryBtn(), padding: '13px 22px' }}>+ New tracker</button>
        </div>
      ) : (
        <>
          {hasData ? (
            <>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
                <Stat label="Revenue" value={money$(agg.moneyIn)} sub="across all trackers" />
                <Stat label="Expenses" value={money$(agg.moneyOut)} sub={`${agg.count} entr${agg.count === 1 ? 'y' : 'ies'}`} />
                <Stat label={agg.profit >= 0 ? 'Profit' : 'Loss'} value={money$(agg.profit)} sub="revenue − expenses" />
                {agg.taxSetAside > 0
                  ? <Stat label="Yours to keep" value={money$(agg.takeHome)} sub={`after ~${money$(agg.taxSetAside)} tax`} />
                  : <Stat label="Hours" value={`${decimalHours(agg.mins)}h`} sub={`for ${rangeText}`} />}
              </div>
              {overviewHi.length > 0 && <Highlights items={overviewHi} />}
              {monthsHaveData && <TrendColumns title="Net by month" caption="all trackers · last 6 months" series={overviewMonths} abbr={abbrMoney} diverging />}
              {agg.moneyOut > 0 && folders.length > 1 && <RankedBars title="Spending by tracker" slices={spendByFolder.slices} total={spendByFolder.total} formatValue={money$} />}
              {agg.mins > 0 && folders.length > 1 && <RankedBars title="Hours by tracker" slices={hoursByFolder.slices} total={hoursByFolder.total} formatValue={fmtHours} />}
            </>
          ) : (
            <div style={{ ...card, color: 'var(--muted)', fontSize: 13.5, lineHeight: 1.5 }}>Nothing logged for <b>{rangeText}</b> yet. Open a tracker below to add entries, or widen the time frame.</div>
          )}

          <div style={{ fontSize: 11, color: 'var(--muted)', letterSpacing: 1, textTransform: 'uppercase', fontWeight: 600, margin: '18px 0 10px' }}>Your trackers</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12 }}>
            {perFolder.map(({ folder: f, s }) => (
              <button key={f.id} onClick={() => setOpenId(f.id)} style={{ textAlign: 'left', background: 'white', border: '1px solid var(--border)', borderRadius: 14, padding: '14px 16px', cursor: 'pointer', fontFamily: 'DM Sans,sans-serif' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                  <span style={{ width: 34, height: 34, borderRadius: 10, background: (f.color || '#4A9EB5') + '22', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: f.color || '#4A9EB5', flexShrink: 0 }}><Glyph id={f.icon || 'briefcase'} size={19} color="currentColor" /></span>
                  <span style={{ fontSize: 14.5, fontWeight: 700, color: 'var(--text)', flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{f.name}</span>
                </div>
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                  {(fieldsOfType(f.fields || [], 'moneyIn').length || fieldsOfType(f.fields || [], 'moneyOut').length) ? <div><div style={{ fontSize: 16, fontWeight: 800, color: s.net >= 0 ? 'var(--forest)' : 'var(--coral)' }}>{money$(s.net)}</div><div style={{ fontSize: 10.5, color: 'var(--muted)' }}>net</div></div> : null}
                  {fieldsOfType(f.fields || [], 'hours').length ? <div><div style={{ fontSize: 16, fontWeight: 800, color: 'var(--forest)' }}>{decimalHours(s.mins)}h</div><div style={{ fontSize: 10.5, color: 'var(--muted)' }}>hours</div></div> : null}
                </div>
                <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 8 }}>{s.count} {s.count === 1 ? 'entry' : 'entries'} · {rangeText}</div>
              </button>
            ))}
            <button onClick={() => setNewOpen(true)} style={{ background: 'transparent', border: '2px dashed var(--border)', borderRadius: 14, padding: '14px 16px', cursor: 'pointer', color: 'var(--muted)', fontFamily: 'DM Sans,sans-serif', fontWeight: 700, fontSize: 14, minHeight: 108 }}>+ New tracker</button>
          </div>
        </>
      )}

      {newOpen && <NewFolderModal onCreate={addFolder} onClose={() => setNewOpen(false)} takenColors={folders.map(f => f.color)} />}
      {exportOpen && <OverviewExport perFolder={perFolder} people={people} agg={agg} rangeText={rangeText} onClose={() => setExportOpen(false)} />}
    </div>
  )
}

// A few overview observations across trackers.
function overviewHighlights(perFolder, agg) {
  const out = []
  if (agg.moneyIn > 0 && agg.moneyOut > 0) out.push({ icon: 'dollar', text: `Across your trackers you took in ${fmtMoney(agg.moneyIn)} and spent ${fmtMoney(agg.moneyOut)} — ${agg.profit >= 0 ? fmtMoney(agg.profit) + ' profit' : fmtMoney(-agg.profit) + ' loss'}.` })
  else if (agg.moneyOut > 0) out.push({ icon: 'dollar', text: `You spent ${fmtMoney(agg.moneyOut)} in total.` })
  if (agg.taxSetAside > 0) out.push({ icon: 'chart', text: `Set aside about ${fmtMoney(agg.taxSetAside)} for taxes — roughly ${fmtMoney(agg.takeHome)} is really yours.` })
  const bySpend = [...perFolder].filter(p => p.s.moneyOut > 0).sort((a, b) => b.s.moneyOut - a.s.moneyOut)[0]
  if (bySpend && perFolder.length > 1) out.push({ icon: 'chart', text: `Most spending was in ${bySpend.folder.name} (${fmtMoney(bySpend.s.moneyOut)}).` })
  const byTime = [...perFolder].filter(p => p.s.mins > 0).sort((a, b) => b.s.mins - a.s.mins)[0]
  if (byTime && perFolder.length > 1) out.push({ icon: 'clock', text: `Most of your time went to ${byTime.folder.name} (${fmtHours(byTime.s.mins)}).` })
  else if (byTime && agg.mins > 0) out.push({ icon: 'clock', text: `You logged ${decimalHours(agg.mins)} ${decimalHours(agg.mins) === 1 ? 'hour' : 'hours'}.` })
  return out
}

// ── New tracker modal (template + icon + color) ─────────────────
function NewFolderModal({ onCreate, onClose, takenColors = [] }) {
  const [name, setName] = useState('')
  const [templateId, setTemplateId] = useState('standard')
  const [icon, setIcon] = useState('briefcase')
  const firstFree = ACCENT_COLORS.find(c => !takenColors.includes(c)) || ACCENT_COLORS[0]
  const [color, setColor] = useState(firstFree)
  const pickTemplate = (t) => { setTemplateId(t.id); setIcon(t.icon) }
  const create = () => {
    if (!name.trim()) return
    const tpl = TEMPLATES.find(t => t.id === templateId) || TEMPLATES[0]
    onCreate({ name: name.trim(), icon, color, fields: tpl.fields() })
  }
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(20,28,38,.5)', zIndex: 640, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: 'white', borderRadius: 20, width: '100%', maxWidth: 440, maxHeight: '92vh', overflowY: 'auto', padding: '22px 22px 24px', boxShadow: '0 20px 60px rgba(20,40,60,.3)' }}>
        <div className="serif" style={{ fontSize: 20, fontWeight: 700, color: 'var(--forest)', marginBottom: 4 }}>New tracker</div>
        <div style={{ fontSize: 12.5, color: 'var(--muted)', marginBottom: 16 }}>Start from a template (you can change every field afterward in Setup).</div>
        <Field label="Name"><input value={name} onChange={e => setName(e.target.value)} autoFocus placeholder="e.g. Bed & Breakfast" style={inputStyle} onKeyDown={e => e.key === 'Enter' && create()} /></Field>
        <label style={labelStyle}>Template</label>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 14 }}>
          {TEMPLATES.map(t => (
            <button key={t.id} onClick={() => pickTemplate(t)} style={{ display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left', padding: '9px 11px', borderRadius: 10, cursor: 'pointer', fontFamily: 'DM Sans,sans-serif',
              border: `1px solid ${templateId === t.id ? color : 'var(--border)'}`, background: templateId === t.id ? color + '14' : 'white' }}>
              <Glyph id={t.icon} size={18} color={templateId === t.id ? color : 'var(--muted)'} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{t.name}</div>
                <div style={{ fontSize: 11, color: 'var(--muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.fields().map(f => f.name).join(', ') || 'no fields — build your own'}</div>
              </div>
              {templateId === t.id && <span style={{ color, fontSize: 15 }}>✓</span>}
            </button>
          ))}
        </div>
        <label style={labelStyle}>Icon</label>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
          {FOLDER_ICONS.map(id => (
            <button key={id} onClick={() => setIcon(id)} aria-label={id} style={{ width: 38, height: 38, borderRadius: 10, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', border: `1px solid ${icon === id ? color : 'var(--border)'}`, background: icon === id ? color + '18' : 'white', color: icon === id ? color : 'var(--muted)' }}><Glyph id={id} size={19} color="currentColor" /></button>
          ))}
        </div>
        <label style={labelStyle}>Color</label>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 20 }}>
          {ACCENT_COLORS.map(c => <button key={c} onClick={() => setColor(c)} aria-label={c} style={{ width: 28, height: 28, borderRadius: '50%', background: c, cursor: 'pointer', border: color === c ? '3px solid var(--forest)' : '2px solid white', boxShadow: '0 0 0 1px var(--border)' }} />)}
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={onClose} style={{ flex: 1, padding: '12px', borderRadius: 11, border: '1px solid var(--border)', background: 'white', color: 'var(--muted)', cursor: 'pointer', fontFamily: 'DM Sans,sans-serif', fontWeight: 600 }}>Cancel</button>
          <button onClick={create} disabled={!name.trim()} style={{ ...primaryBtn(!!name.trim()), flex: 2 }}>Create tracker</button>
        </div>
      </div>
    </div>
  )
}

// ── Export across all trackers (normalized: money in/out/hours + a Tracker col) ──
function OverviewExport({ perFolder, people, agg, rangeText, onClose }) {
  // Flatten every in-range entry into a normalized row.
  const rows = []
  for (const pf of perFolder) {
    const fields = pf.folder.fields || []
    const moneyInF = fieldsOfType(fields, 'moneyIn'), moneyOutF = fieldsOfType(fields, 'moneyOut'), hoursF = fieldsOfType(fields, 'hours')
    const textF = [...fieldsOfType(fields, 'text'), ...fieldsOfType(fields, 'category')]
    const personF = fieldsOfType(fields, 'person')[0]
    for (const e of pf.entries) {
      const moneyIn = moneyInF.reduce((s, f) => s + num(val(e, f.id)), 0)
      const moneyOut = moneyOutF.reduce((s, f) => s + num(val(e, f.id)), 0)
      const mins = hoursF.reduce((s, f) => s + num(val(e, f.id)), 0)
      const details = textF.map(f => (val(e, f.id) || '').toString().trim()).filter(Boolean).join('; ')
      rows.push({ tracker: pf.folder.name, date: e.date, moneyIn, moneyOut, net: moneyIn - moneyOut, mins, person: personF ? personName(people, val(e, personF.id)) : '', details })
    }
  }
  rows.sort((a, b) => (a.date || '').localeCompare(b.date || '') || a.tracker.localeCompare(b.tracker))

  const columns = [
    { header: 'Tracker', get: r => r.tracker, csv: r => r.tracker, align: '' },
    { header: 'Date', get: r => r.date, csv: r => r.date, align: '' },
    { header: 'Details', get: r => r.details || '—', csv: r => r.details, align: 'wide' },
    { header: 'Person', get: r => r.person || '—', csv: r => r.person, align: '' },
    { header: 'Money in', get: r => r.moneyIn ? fmtMoney(r.moneyIn) : '—', csv: r => r.moneyIn || '', align: 'num', total: fmtMoney(agg.moneyIn) },
    { header: 'Money out', get: r => r.moneyOut ? fmtMoney(r.moneyOut) : '—', csv: r => r.moneyOut || '', align: 'num', total: fmtMoney(agg.moneyOut) },
    { header: 'Hours', get: r => r.mins ? decimalHours(r.mins) : '—', csv: r => r.mins ? decimalHours(r.mins) : '', align: 'num', total: decimalHours(agg.mins) },
  ]
  const cards = [
    { label: 'Money in', value: fmtMoney(agg.moneyIn) }, { label: 'Money out', value: fmtMoney(agg.moneyOut) },
    { label: 'Net', value: fmtMoney(agg.net) }, { label: 'Hours', value: decimalHours(agg.mins) },
  ]
  const downloadPdf = () => printReport(buildTableHtml({ title: 'All trackers — Record', rangeText, cards, columns, rows }))
  const downloadCsv = () => downloadFile('all-trackers.csv', buildCsv(columns, rows))

  const btn = { padding: '13px 14px', borderRadius: 11, border: '1px solid var(--border)', background: 'white', color: 'var(--teal)', cursor: 'pointer', fontFamily: 'DM Sans,sans-serif', fontWeight: 700, fontSize: 13.5, flex: 1 }
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(20,28,38,.5)', zIndex: 640, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: 'white', borderRadius: 20, width: '100%', maxWidth: 420, padding: '22px', boxShadow: '0 20px 60px rgba(20,40,60,.3)' }}>
        <div className="serif" style={{ fontSize: 20, fontWeight: 700, color: 'var(--forest)', marginBottom: 4 }}>Export all trackers</div>
        <div style={{ fontSize: 12.5, color: 'var(--muted)', marginBottom: 18 }}>Everything for <b>{rangeText}</b>, across every tracker, with money in/out and hours. The CSV opens in Excel or Sheets and is fully editable.</div>
        <button onClick={downloadPdf} style={{ ...primaryBtn(), width: '100%', padding: '14px', marginBottom: 10 }}>⬇ Combined PDF</button>
        <button onClick={downloadCsv} style={{ ...btn, width: '100%', marginBottom: 16 }}>⬇ Combined CSV</button>
        <button onClick={onClose} style={{ width: '100%', padding: '11px', borderRadius: 11, border: 'none', background: 'transparent', color: 'var(--muted)', cursor: 'pointer', fontFamily: 'DM Sans,sans-serif', fontWeight: 600 }}>Close</button>
      </div>
    </div>
  )
}
