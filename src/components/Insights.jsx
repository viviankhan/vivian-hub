// src/components/Insights.jsx
// ─────────────────────────────────────────────────────────────
// The Insights tab. A general Overview (revenue / expenses / profit / take-home
// across every tracker, plain-English highlights, a net-by-month trend and
// ranked-by-tracker bars — no pies) above your trackers: category-first folders
// for recording money in and out, your time, contractors, mileage and bills.
// Exports to PDF and editable CSV. Self-contained per-user data.
// ─────────────────────────────────────────────────────────────
import { useMemo, useState } from 'react'
import { Glyph } from '../lib/glyphs.jsx'
import TrackerFolder, { Highlights } from './TrackerFolder.jsx'
import { TrendColumns, RankedBars, abbrMoney } from './TrackerCharts.jsx'
import { inputStyle, labelStyle, card, primaryBtn, Field, Stat, RangeBar } from './trackerUi.jsx'
import {
  resolveRange, prevRange, inRange, rangeLabel,
  fmtHours, decimalHours, fmtMoney, summarize, financials, toSlices, categoryKind, num, monthlySeries,
  personName, ACCENT_COLORS, FOLDER_ICONS, TEMPLATES, DEFAULT_TAX_RATE, DEFAULT_MILEAGE_RATE,
  buildTableHtml, printReport, buildCsv, downloadFile,
} from '../lib/trackers.js'

const uid = (p) => `${p}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`

// The folders, people and entries live in App now — a task saved anywhere in
// Bloom has to be able to write itself into the folder its label points at, so
// the records can't be owned by this tab alone.
export default function Insights({
  folders = [], people = [], entries = [],
  addFolder: onAddFolder, updateFolder, deleteFolder: onDeleteFolder, mergeFolders: onMergeFolders,
  addEntry, addEntries, deleteEntry,
  addPerson, updatePerson, deletePerson,
  commitments = [], categories = [], labelMeta = {},
}) {
  const [openId, setOpenId] = useState(null)
  const [preset, setPreset] = useState('this-month')
  const [custom, setCustom] = useState({ start: '', end: '' })
  const [newOpen, setNewOpen] = useState(false)
  const [exportOpen, setExportOpen] = useState(false)
  const [mergeOpen, setMergeOpen] = useState(false)
  const [mergeNote, setMergeNote] = useState('')

  const range = useMemo(() => resolveRange(preset, custom), [preset, custom])
  const prevWindow = useMemo(() => prevRange(preset), [preset])
  const rangeText = rangeLabel(preset, range)

  const addFolder = ({ name, icon, color, categories: cats }) => {
    const f = {
      id: uid('fld'), name, icon, color, categories: cats,
      budgetMoney: null, budgetHours: null,
      taxRate: DEFAULT_TAX_RATE, mileageRate: DEFAULT_MILEAGE_RATE, currency: '$', fixedCosts: [],
      createdAt: new Date().toISOString(),
    }
    onAddFolder(f); setOpenId(f.id); setNewOpen(false)
  }
  const deleteFolder = (id) => { onDeleteFolder(id); setOpenId(null) }
  const runMerge = (sourceId, targetId) => {
    const res = onMergeFolders(sourceId, targetId)
    setMergeOpen(false)
    if (res) setMergeNote(`Merged “${res.from}” into “${res.name}”${res.collapsed ? ` — ${res.collapsed} task${res.collapsed > 1 ? 's were' : ' was'} recorded in both, now kept once.` : '.'}`)
    if (openId === sourceId) setOpenId(targetId)
  }

  // ── A folder is open ──────────────────────────────────────────
  if (openId) {
    const folder = folders.find(f => f.id === openId)
    if (!folder) { setOpenId(null); return null }
    const fPeople = people.filter(p => p.folderId === openId)
    const fEntries = entries.filter(e => e.folderId === openId)
    return (
      <div>
        <div className="page-title">Records</div>
        <TrackerFolder
          folder={folder} people={fPeople} entries={fEntries}
          preset={preset} setPreset={setPreset} custom={custom} setCustom={setCustom} range={range} rangeText={rangeText} prevWindow={prevWindow}
          addEntry={e => addEntry({ id: e.id || uid('e'), folderId: openId, createdAt: new Date().toISOString(), ...e })}
          addManyEntries={list => addEntries(list.map(e => ({ id: e.id || uid('e'), folderId: openId, createdAt: new Date().toISOString(), ...e })))}
          deleteEntry={deleteEntry}
          addPerson={p => addPerson({ folderId: openId, ...p })}
          updatePerson={updatePerson}
          deletePerson={deletePerson}
          onRename={name => updateFolder(openId, { name })}
          onUpdateFolder={ch => updateFolder(openId, ch)}
          onDelete={() => deleteFolder(openId)}
          onBack={() => setOpenId(null)}
          commitments={commitments} categories={categories} labelMeta={labelMeta}
          otherFolders={folders.filter(f => f.id !== openId)}
          onMergeInto={targetId => runMerge(openId, targetId)}
        />
      </div>
    )
  }

  // ── Overview ──────────────────────────────────────────────────
  const perFolder = folders.map(f => {
    const fe = entries.filter(e => e.folderId === f.id && inRange(e.date, range))
    return { folder: f, s: summarize(fe, f), entries: fe }
  })
  const agg = perFolder.reduce((a, pf) => ({ moneyIn: a.moneyIn + pf.s.moneyIn, moneyOut: a.moneyOut + pf.s.moneyOut, mins: a.mins + pf.s.mins, count: a.count + pf.s.count }), { moneyIn: 0, moneyOut: 0, mins: 0, count: 0 })
  agg.net = agg.moneyIn - agg.moneyOut
  const fins = perFolder.map(pf => financials(pf.s, pf.folder))
  agg.profit = fins.reduce((a, f) => a + f.profit, 0)
  agg.taxSetAside = fins.reduce((a, f) => a + f.taxSetAside, 0)
  agg.takeHome = fins.reduce((a, f) => a + f.takeHome, 0)
  const hasData = agg.count > 0
  // How much of a folder's record came in from tagged tasks rather than being
  // typed here — the visible half of "tag a task, it lands in the folder".
  const taggedCount = (folderId) => entries.filter(e => e.folderId === folderId && e.taskId && inRange(e.date, range)).length
  const money$ = v => fmtMoney(v)
  const folderColor = k => folders.find(f => f.id === k)?.color
  const spendByFolder = toSlices(perFolder.map(pf => ({ key: pf.folder.id, label: pf.folder.name, value: pf.s.moneyOut, color: folderColor(pf.folder.id) })))
  const hoursByFolder = toSlices(perFolder.map(pf => ({ key: pf.folder.id, label: pf.folder.name, value: pf.s.mins, color: folderColor(pf.folder.id) })))
  const overviewHi = overviewHighlights(perFolder, agg)
  const overviewMonths = (() => {
    let combined = null
    for (const f of folders) {
      const ms = monthlySeries(entries.filter(e => e.folderId === f.id), f, 6)
      if (!combined) combined = ms.map(m => ({ key: m.key, label: m.label, value: m.net }))
      else ms.forEach((m, i) => { combined[i].value += m.net })
    }
    return combined || []
  })()
  const monthsHaveData = overviewMonths.some(m => m.value !== 0)

  return (
    <div>
      <div className="page-title">Records</div>
      <div className="page-sub">Trackers for anything worth recording — a B&amp;B, a rental, freelance. Each keeps categories of income and expenses, your time, contractors and bills, and shows profit, taxes and what’s really yours over any period. Export a tidy record (PDF or editable CSV) anytime.</div>

      <RangeBar preset={preset} setPreset={setPreset} custom={custom} setCustom={setCustom}
        right={folders.length > 0 && <button onClick={() => setExportOpen(true)} style={{ ...primaryBtn(), padding: '7px 14px', fontSize: 12.5 }}>⬇ Export all</button>} />

      {folders.length === 0 ? (
        <div style={{ ...card, textAlign: 'center', padding: '30px 22px' }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>🗂️</div>
          <div className="serif" style={{ fontSize: 20, fontWeight: 700, color: 'var(--forest)', marginBottom: 6 }}>Create your first tracker</div>
          <div style={{ fontSize: 13.5, color: 'var(--muted)', lineHeight: 1.5, maxWidth: 400, margin: '0 auto 16px' }}>
            A tracker is a folder for record-keeping. Pick a template, and it comes with sensible income and expense categories you can log against right away.
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
                  : <Stat label="Your hours" value={`${decimalHours(agg.mins)}h`} sub={`for ${rangeText}`} />}
              </div>
              {overviewHi.length > 0 && <Highlights items={overviewHi} />}
              {monthsHaveData && <TrendColumns title="Net by month" caption="all trackers · last 6 months" series={overviewMonths} abbr={abbrMoney} diverging />}
              {agg.moneyOut > 0 && folders.length > 1 && <RankedBars title="Spending by tracker" slices={spendByFolder.slices} total={spendByFolder.total} formatValue={money$} />}
              {agg.mins > 0 && folders.length > 1 && <RankedBars title="Your hours by tracker" slices={hoursByFolder.slices} total={hoursByFolder.total} formatValue={fmtHours} />}
            </>
          ) : (
            <div style={{ ...card, color: 'var(--muted)', fontSize: 13.5, lineHeight: 1.5 }}>Nothing logged for <b>{rangeText}</b> yet. Open a tracker below to add entries, or widen the time frame.</div>
          )}

          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, margin: '18px 0 10px' }}>
            <div style={{ fontSize: 11, color: 'var(--muted)', letterSpacing: 1, textTransform: 'uppercase', fontWeight: 600 }}>Your trackers</div>
            {folders.length > 1 && (
              <button onClick={() => { setMergeNote(''); setMergeOpen(true) }}
                style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'var(--teal)', cursor: 'pointer', fontFamily: 'DM Sans,sans-serif', fontWeight: 700, fontSize: 12 }}>
                ⇄ Merge two folders
              </button>
            )}
          </div>
          {mergeNote && (
            <div style={{ ...card, background: '#F0FDFB', border: '1px solid #cdeae6', display: 'flex', alignItems: 'center', gap: 10, padding: '11px 14px' }}>
              <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, color: 'var(--teal)', lineHeight: 1.5 }}>{mergeNote}</span>
              <button onClick={() => setMergeNote('')} style={{ background: 'none', border: 'none', color: 'var(--muted)', fontSize: 15, cursor: 'pointer', flexShrink: 0 }}>✕</button>
            </div>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12 }}>
            {perFolder.map(({ folder: f, s }) => (
              <button key={f.id} onClick={() => setOpenId(f.id)} style={{ textAlign: 'left', background: 'white', border: '1px solid var(--border)', borderRadius: 14, padding: '14px 16px', cursor: 'pointer', fontFamily: 'DM Sans,sans-serif' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                  <span style={{ width: 34, height: 34, borderRadius: 10, background: (f.color || '#4A9EB5') + '22', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: f.color || '#4A9EB5', flexShrink: 0 }}><Glyph id={f.icon || 'briefcase'} size={19} color="currentColor" /></span>
                  <span style={{ fontSize: 14.5, fontWeight: 700, color: 'var(--text)', flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{f.name}</span>
                </div>
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                  {(s.moneyIn || s.moneyOut) ? <div><div style={{ fontSize: 16, fontWeight: 800, color: s.net >= 0 ? 'var(--forest)' : 'var(--coral)' }}>{money$(s.net)}</div><div style={{ fontSize: 10.5, color: 'var(--muted)' }}>net</div></div> : null}
                  {s.mins > 0 ? <div><div style={{ fontSize: 16, fontWeight: 800, color: 'var(--forest)' }}>{decimalHours(s.mins)}h</div><div style={{ fontSize: 10.5, color: 'var(--muted)' }}>hours</div></div> : null}
                </div>
                <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 8 }}>{s.count} {s.count === 1 ? 'entry' : 'entries'} · {rangeText}</div>
                {taggedCount(f.id) > 0 && (
                  <div style={{ fontSize: 10.5, color: 'var(--teal)', marginTop: 3, fontWeight: 600 }}>{taggedCount(f.id)} from tagged tasks</div>
                )}
              </button>
            ))}
            <button onClick={() => setNewOpen(true)} style={{ background: 'transparent', border: '2px dashed var(--border)', borderRadius: 14, padding: '14px 16px', cursor: 'pointer', color: 'var(--muted)', fontFamily: 'DM Sans,sans-serif', fontWeight: 700, fontSize: 14, minHeight: 108 }}>+ New tracker</button>
          </div>
        </>
      )}

      {newOpen && <NewFolderModal onCreate={addFolder} onClose={() => setNewOpen(false)} takenColors={folders.map(f => f.color)} />}
      {mergeOpen && <MergeFolderModal folders={folders} entries={entries} onMerge={runMerge} onClose={() => setMergeOpen(false)} />}
      {exportOpen && <OverviewExport perFolder={perFolder} people={people} agg={agg} rangeText={rangeText} onClose={() => setExportOpen(false)} />}
    </div>
  )
}

function overviewHighlights(perFolder, agg) {
  const out = []
  if (agg.moneyIn > 0 && agg.moneyOut > 0) out.push({ icon: 'dollar', text: `Across your trackers you took in ${fmtMoney(agg.moneyIn)} and spent ${fmtMoney(agg.moneyOut)} — ${agg.profit >= 0 ? fmtMoney(agg.profit) + ' profit' : fmtMoney(-agg.profit) + ' loss'}.` })
  else if (agg.moneyOut > 0) out.push({ icon: 'dollar', text: `You spent ${fmtMoney(agg.moneyOut)} in total.` })
  if (agg.taxSetAside > 0) out.push({ icon: 'chart', text: `Set aside about ${fmtMoney(agg.taxSetAside)} for taxes — roughly ${fmtMoney(agg.takeHome)} is really yours.` })
  const bySpend = [...perFolder].filter(p => p.s.moneyOut > 0).sort((a, b) => b.s.moneyOut - a.s.moneyOut)[0]
  if (bySpend && perFolder.length > 1) out.push({ icon: 'chart', text: `Most spending was in ${bySpend.folder.name} (${fmtMoney(bySpend.s.moneyOut)}).` })
  const byTime = [...perFolder].filter(p => p.s.mins > 0).sort((a, b) => b.s.mins - a.s.mins)[0]
  if (byTime && perFolder.length > 1) out.push({ icon: 'clock', text: `Most of your time went to ${byTime.folder.name} (${fmtHours(byTime.s.mins)}).` })
  return out
}

// ── New tracker modal (template + icon + color) ─────────────────
function NewFolderModal({ onCreate, onClose, takenColors = [] }) {
  const [name, setName] = useState('')
  const [templateId, setTemplateId] = useState('bnb')
  const [icon, setIcon] = useState('bed')
  const firstFree = ACCENT_COLORS.find(c => !takenColors.includes(c)) || ACCENT_COLORS[0]
  const [color, setColor] = useState(firstFree)
  const pickTemplate = (t) => { setTemplateId(t.id); setIcon(t.icon) }
  const create = () => {
    if (!name.trim()) return
    const tpl = TEMPLATES.find(t => t.id === templateId) || TEMPLATES[0]
    onCreate({ name: name.trim(), icon, color, categories: tpl.categories() })
  }
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(20,28,38,.5)', zIndex: 640, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: 'white', borderRadius: 20, width: '100%', maxWidth: 440, maxHeight: '92vh', overflowY: 'auto', padding: '22px 22px 24px', boxShadow: '0 20px 60px rgba(20,40,60,.3)' }}>
        <div className="serif" style={{ fontSize: 20, fontWeight: 700, color: 'var(--forest)', marginBottom: 4 }}>New tracker</div>
        <div style={{ fontSize: 12.5, color: 'var(--muted)', marginBottom: 16 }}>Pick a template — it comes with categories you can change anytime in Setup.</div>
        <Field label="Name"><input value={name} onChange={e => setName(e.target.value)} autoFocus placeholder="e.g. Bed & Breakfast" style={inputStyle} onKeyDown={e => e.key === 'Enter' && create()} /></Field>
        <label style={labelStyle}>Template</label>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 14 }}>
          {TEMPLATES.map(t => {
            const cs = t.categories()
            return (
              <button key={t.id} onClick={() => pickTemplate(t)} style={{ display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left', padding: '9px 11px', borderRadius: 10, cursor: 'pointer', fontFamily: 'DM Sans,sans-serif',
                border: `1px solid ${templateId === t.id ? color : 'var(--border)'}`, background: templateId === t.id ? color + '14' : 'white' }}>
                <Glyph id={t.icon} size={18} color={templateId === t.id ? color : 'var(--muted)'} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{t.name}</div>
                  <div style={{ fontSize: 11, color: 'var(--muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{cs.length ? cs.map(c => c.name).join(', ') : 'no categories — add your own'}</div>
                </div>
                {templateId === t.id && <span style={{ color, fontSize: 15 }}>✓</span>}
              </button>
            )
          })}
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

// ── Merge two record folders into one ───────────────────────────
// Book-keeping changes shape: two folders you kept apart turn out to be one
// thing. Merging carries categories, people and entries across — and a task
// that was filing into both is kept once, so it reads as a single record again
// instead of being counted twice.
function MergeFolderModal({ folders, entries, onMerge, onClose }) {
  const [sourceId, setSourceId] = useState(folders[1]?.id || '')
  const [targetId, setTargetId] = useState(folders[0]?.id || '')
  const src = folders.find(f => f.id === sourceId)
  const dst = folders.find(f => f.id === targetId)
  const valid = !!src && !!dst && sourceId !== targetId
  // Tasks already recorded in both — these are the ones that become singular.
  const shared = (() => {
    if (!valid) return 0
    const a = new Set(entries.filter(e => e.folderId === sourceId && e.taskId).map(e => e.taskId))
    return entries.filter(e => e.folderId === targetId && e.taskId && a.has(e.taskId)).length
  })()
  const count = (id) => entries.filter(e => e.folderId === id).length
  const pick = (value, onChange, label) => (
    <div style={{ flex: 1, minWidth: 150 }}>
      <label style={labelStyle}>{label}</label>
      <select value={value} onChange={e => onChange(e.target.value)} style={inputStyle}>
        {folders.map(f => <option key={f.id} value={f.id}>{f.name} ({count(f.id)})</option>)}
      </select>
    </div>
  )
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(20,28,38,.5)', zIndex: 640, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: 'white', borderRadius: 20, width: '100%', maxWidth: 440, maxHeight: '92vh', overflowY: 'auto', padding: '22px', boxShadow: '0 20px 60px rgba(20,40,60,.3)' }}>
        <div className="serif" style={{ fontSize: 20, fontWeight: 700, color: 'var(--forest)', marginBottom: 4 }}>Merge two folders</div>
        <div style={{ fontSize: 12.5, color: 'var(--muted)', marginBottom: 16, lineHeight: 1.5 }}>
          Everything in the first folder moves into the second — categories, people, entries and the labels that file into it. The first folder is then gone.
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 8 }}>
          {pick(sourceId, setSourceId, 'Merge this one…')}
          {pick(targetId, setTargetId, '…into this one')}
        </div>
        {!valid && <div style={{ fontSize: 12, color: 'var(--coral)', marginBottom: 12 }}>Pick two different folders.</div>}
        {valid && (
          <div style={{ ...card, background: '#F7FBFB', border: '1px dashed #cdeae6', padding: '12px 14px', marginBottom: 16 }}>
            <div style={{ fontSize: 12.5, color: 'var(--text)', lineHeight: 1.6 }}>
              <b>{src.name}</b> ({count(sourceId)} {count(sourceId) === 1 ? 'entry' : 'entries'}) folds into <b>{dst.name}</b> ({count(targetId)}).
              {shared > 0
                ? <> {shared} task{shared > 1 ? 's are' : ' is'} recorded in both — {shared > 1 ? 'they' : 'it'} will be kept once, so the task is singular again.</>
                : <> Same-named categories and people are matched up rather than duplicated.</>}
            </div>
          </div>
        )}
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={onClose} style={{ flex: 1, padding: '12px', borderRadius: 11, border: '1px solid var(--border)', background: 'white', color: 'var(--muted)', cursor: 'pointer', fontFamily: 'DM Sans,sans-serif', fontWeight: 600 }}>Cancel</button>
          <button onClick={() => valid && onMerge(sourceId, targetId)} disabled={!valid} style={{ ...primaryBtn(valid), flex: 2 }}>Merge folders</button>
        </div>
      </div>
    </div>
  )
}

// ── Export across all trackers (normalized rows + a Tracker column) ──
function OverviewExport({ perFolder, people, agg, rangeText, onClose }) {
  const rows = []
  for (const pf of perFolder) {
    for (const e of pf.entries) {
      const k = categoryKind(pf.folder, e.categoryId)
      const amt = num(e.amount)
      rows.push({
        tracker: pf.folder.name, date: e.date,
        category: (pf.folder.categories || []).find(c => c.id === e.categoryId)?.name || 'Uncategorized',
        moneyIn: k === 'income' ? amt : 0, moneyOut: k === 'expense' ? amt : 0,
        mins: num(e.yourMins), person: e.personId ? personName(people, e.personId) : '', note: e.note || '',
      })
    }
  }
  rows.sort((a, b) => (a.date || '').localeCompare(b.date || '') || a.tracker.localeCompare(b.tracker))
  const columns = [
    { header: 'Tracker', get: r => r.tracker, align: '' },
    { header: 'Date', get: r => r.date, align: '' },
    { header: 'Category', get: r => r.category, align: '' },
    { header: 'Note', get: r => r.note || '—', align: 'wide' },
    { header: 'Paid to / who', get: r => r.person || '—', align: '' },
    { header: 'Money in', get: r => r.moneyIn ? fmtMoney(r.moneyIn) : '—', align: 'num' },
    { header: 'Money out', get: r => r.moneyOut ? fmtMoney(r.moneyOut) : '—', align: 'num' },
    { header: 'Your hours', get: r => r.mins ? decimalHours(r.mins) : '—', align: 'num' },
  ]
  const csvCols = [
    { header: 'Tracker', csv: r => r.tracker }, { header: 'Date', csv: r => r.date }, { header: 'Category', csv: r => r.category },
    { header: 'Note', csv: r => r.note }, { header: 'Paid to / who', csv: r => r.person },
    { header: 'Money in', csv: r => r.moneyIn || '' }, { header: 'Money out', csv: r => r.moneyOut || '' },
    { header: 'Your hours', csv: r => r.mins ? decimalHours(r.mins) : '' },
  ]
  const cards = [
    { label: 'Revenue', value: fmtMoney(agg.moneyIn) }, { label: 'Expenses', value: fmtMoney(agg.moneyOut) },
    { label: 'Profit', value: fmtMoney(agg.profit) }, { label: 'Your hours', value: String(decimalHours(agg.mins)) },
  ]
  const downloadPdf = () => printReport(buildTableHtml({ title: 'All trackers — Record', rangeText, cards, columns, rows }))
  const downloadCsv = () => downloadFile('all-trackers.csv', buildCsv(csvCols, rows))
  const btn = { padding: '13px 14px', borderRadius: 11, border: '1px solid var(--border)', background: 'white', color: 'var(--teal)', cursor: 'pointer', fontFamily: 'DM Sans,sans-serif', fontWeight: 700, fontSize: 13.5, flex: 1 }
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(20,28,38,.5)', zIndex: 640, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: 'white', borderRadius: 20, width: '100%', maxWidth: 420, padding: '22px', boxShadow: '0 20px 60px rgba(20,40,60,.3)' }}>
        <div className="serif" style={{ fontSize: 20, fontWeight: 700, color: 'var(--forest)', marginBottom: 4 }}>Export all trackers</div>
        <div style={{ fontSize: 12.5, color: 'var(--muted)', marginBottom: 18 }}>Everything for <b>{rangeText}</b>, across every tracker, with a Tracker column. The CSV opens in Excel or Sheets and is fully editable.</div>
        <button onClick={downloadPdf} style={{ ...primaryBtn(), width: '100%', padding: '14px', marginBottom: 10 }}>⬇ Combined PDF</button>
        <button onClick={downloadCsv} style={{ ...btn, width: '100%', marginBottom: 16 }}>⬇ Combined CSV</button>
        <button onClick={onClose} style={{ width: '100%', padding: '11px', borderRadius: 11, border: 'none', background: 'transparent', color: 'var(--muted)', cursor: 'pointer', fontFamily: 'DM Sans,sans-serif', fontWeight: 600 }}>Close</button>
      </div>
    </div>
  )
}
