import { useState, useEffect, useCallback } from 'react'
import {
  getClasses, addClass, deleteClass,
  getWeeks, addWeek, deleteWeek,
  getCards, importCards, deleteCard,
  getFiles, uploadFile, deleteStudyFile,
} from '../lib/storage.js'

// ── Helpers ────────────────────────────────────────────────────
function groupBy(arr, key) {
  const m = {}
  arr.forEach(c => { const k = c[key] || 'General'; if (!m[k]) m[k] = []; m[k].push(c) })
  return Object.entries(m)
}
function todayStr() { return new Date().toISOString().split('T')[0] }

// ── Flashcard Modal ────────────────────────────────────────────
function FcModal({ cards, setKey, weekLabel, fcProgress, updateFcProgress, fcStudied, updateFcStudied, onClose }) {
  const [tab, setTab]       = useState('all')
  const [idx, setIdx]       = useState(0)
  const [flipped, setFlipped] = useState(false)
  const learned = fcProgress[setKey] || {}

  const deck = tab === 'learned'   ? cards.filter(c => learned[c.id])
             : tab === 'unlearned' ? cards.filter(c => !learned[c.id])
             : cards
  const card = deck[idx] || null
  const learnedCount = cards.filter(c => learned[c.id]).length
  const pct = cards.length ? (learnedCount / cards.length * 100) : 0

  const next = () => { setIdx(i => (i+1) % Math.max(deck.length,1)); setFlipped(false) }
  const prev = () => { setIdx(i => (i-1+Math.max(deck.length,1)) % Math.max(deck.length,1)); setFlipped(false) }

  const mark = async (isLearned) => {
    if (!card) return
    const updated = { ...fcProgress, [setKey]: { ...learned, [card.id]: isLearned } }
    await updateFcProgress(updated)
    const s = { ...fcStudied, [setKey]: new Date().toISOString() }
    await updateFcStudied(s)
    next()
  }

  const TabBtn = ({ id, label }) => (
    <button className={`fc-tab-btn ${tab === id ? 'active' : ''}`} onClick={() => { setTab(id); setIdx(0); setFlipped(false) }}>
      {label}
    </button>
  )

  useEffect(() => {
    // record studied time on open
    const s = { ...fcStudied, [setKey]: new Date().toISOString() }
    updateFcStudied(s)
  }, [])

  return (
    <div className="fc-overlay">
      <div className="fc-inner">
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:18 }}>
          <div>
            <div className="serif" style={{ fontSize:22, color:'var(--sand)', fontWeight:600 }}>{weekLabel}</div>
            <div style={{ fontSize:11, color:'#8FA882', marginTop:2 }}>{cards.length} cards · {learnedCount} learned</div>
          </div>
          <button className="btn-ghost" onClick={onClose} style={{ color:'#8FA882', borderColor:'rgba(255,255,255,.15)' }}>✕ Close</button>
        </div>

        <div style={{ display:'flex', gap:8, marginBottom:14 }}>
          <TabBtn id="all"       label="All" />
          <TabBtn id="unlearned" label={`Unlearned (${cards.filter(c=>!learned[c.id]).length})`} />
          <TabBtn id="learned"   label={`Learned (${learnedCount})`} />
        </div>

        <div className="progress-track" style={{ marginBottom:6 }}>
          <div className="progress-fill" style={{ width: pct+'%' }} />
        </div>
        <div style={{ fontSize:11, color:'#8FA882', textAlign:'center', marginBottom:16 }}>{learnedCount} / {cards.length} learned</div>

        {!card ? (
          <div style={{ background:'#0D1F3C', borderRadius:18, minHeight:200, display:'flex', alignItems:'center', justifyContent:'center', color:'#4A6B8A', fontSize:13 }}>
            No cards in this view
          </div>
        ) : (
          <div className="fc-card-wrap">
            <div className={`fc-card ${flipped ? 'flipped' : ''}`} style={{ background:'#0D1F3C', border:'1px solid rgba(14,158,142,.3)' }} onClick={() => setFlipped(f=>!f)}>
              <div className="fc-face">
                <div style={{ fontSize:10, letterSpacing:2, textTransform:'uppercase', color:'#0E9E8E', marginBottom:8 }}>{card.topic}</div>
                <div style={{ fontSize:11, color:'#4A6B8A', marginBottom:6 }}>#{idx+1} of {deck.length}</div>
                {card.img_src && <img src={card.img_src} alt={card.term} style={{ width:'100%', maxHeight:160, objectFit:'cover', borderRadius:10, marginBottom:12 }} />}
                <div className="fc-term">{card.term}</div>
                {card.sci && <div style={{ fontSize:12, color:'#8FA882', fontStyle:'italic', marginTop:4 }}>{card.sci}</div>}
                <div style={{ fontSize:11, color:'rgba(255,255,255,.3)', letterSpacing:1.5, textTransform:'uppercase', marginTop:14 }}>Tap to flip →</div>
              </div>
              <div className="fc-back">
                <div style={{ fontSize:10, letterSpacing:2, textTransform:'uppercase', color:'#0E9E8E', marginBottom:8 }}>{card.topic}</div>
                <div className="serif" style={{ fontSize:16, color:'#C9E4B8', fontWeight:600, marginBottom:8 }}>{card.term}</div>
                {card.sci && <div style={{ fontSize:12, color:'#8FA882', fontStyle:'italic', marginBottom:8 }}>{card.sci}</div>}
                <div className="fc-def">{card.definition}</div>
              </div>
            </div>
          </div>
        )}

        <div style={{ display:'flex', gap:8, justifyContent:'center', marginBottom:12, flexWrap:'wrap' }}>
          <button className="fc-ctrl-btn btn-ghost" style={{ color:'#8FA882', border:'1px solid rgba(255,255,255,.15)' }} onClick={prev}>← Prev</button>
          <button className="fc-ctrl-btn btn-ghost" style={{ color:'#8FA882', border:'1px solid rgba(255,255,255,.15)' }} onClick={() => { setIdx(Math.floor(Math.random()*Math.max(deck.length,1))); setFlipped(false) }}>⇌ Shuffle</button>
          <button className="fc-ctrl-btn" style={{ background:'#0E9E8E', color:'#0A1628', border:'none', fontFamily:'DM Sans', fontSize:11, letterSpacing:1, textTransform:'uppercase', borderRadius:24, cursor:'pointer', fontWeight:700 }} onClick={next}>Next →</button>
        </div>
        <div style={{ display:'flex', gap:8, justifyContent:'center', flexWrap:'wrap' }}>
          <button className="fc-ctrl-btn" style={{ background:'rgba(232,93,58,.1)', border:'1px solid rgba(232,93,58,.4)', color:'#E85D3A', fontFamily:'DM Sans', fontSize:11, letterSpacing:1, textTransform:'uppercase', borderRadius:24, cursor:'pointer' }} onClick={() => mark(false)}>✗ Still learning</button>
          <button className="fc-ctrl-btn" style={{ background:'rgba(14,158,142,.1)', border:'1px solid rgba(14,158,142,.4)', color:'#0E9E8E', fontFamily:'DM Sans', fontSize:11, letterSpacing:1, textTransform:'uppercase', borderRadius:24, cursor:'pointer' }} onClick={() => mark(true)}>✓ Got it</button>
        </div>
      </div>
    </div>
  )
}

// ── Week row ───────────────────────────────────────────────────
function WeekRow({ week, classId, fcProgress, fcStudied, updateFcProgress, updateFcStudied, onDeleted }) {
  const [open,    setOpen]    = useState(false)
  const [cards,   setCards]   = useState([])
  const [files,   setFiles]   = useState([])
  const [modal,   setModal]   = useState(false)
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [importMsg, setImportMsg] = useState('')

  const setKey = `${classId}-${week.id}`
  const learned = fcProgress[setKey] || {}
  const learnedCount = cards.filter(c => learned[c.id]).length
  const lastStudied = fcStudied[setKey]
  const lastStr = lastStudied ? new Date(lastStudied).toLocaleDateString('en-US',{month:'short',day:'numeric'}) : 'Never'

  const load = useCallback(async () => {
    if (loading) return
    setLoading(true)
    const [c, f] = await Promise.all([getCards(week.id), getFiles(week.id)])
    setCards(c); setFiles(f)
    setLoading(false)
  }, [week.id])

  const toggle = () => { if (!open) load(); setOpen(o => !o) }

  const handleUpload = async (e) => {
    const file = e.target.files[0]; if (!file) return
    setUploading(true)
    try {
      const saved = await uploadFile(week.id, file)
      setFiles(prev => [...prev, saved])
    } catch(err) {
      alert('Upload failed: ' + err.message)
    }
    setUploading(false)
    e.target.value = ''
  }

  const handleDelFile = async (f) => {
    if (!confirm('Remove this file?')) return
    await deleteStudyFile(f.id, week.id, f.storage_path)
    setFiles(prev => prev.filter(x => x.id !== f.id))
  }

  const handleImportJSON = async (e) => {
    const file = e.target.files[0]; if (!file) return
    const text = await file.text()
    try {
      const json = JSON.parse(text)
      const cards = Array.isArray(json) ? json : json.cards
      if (!cards?.length) { setImportMsg('No cards found in file.'); return }
      const withWeek = cards.map(c => ({ ...c, week_id: week.id }))
      await importCards(withWeek)
      await load()
      setImportMsg(`✓ Imported ${withWeek.length} cards`)
    } catch(err) {
      setImportMsg('Error: ' + err.message)
    }
    e.target.value = ''
    setTimeout(() => setImportMsg(''), 4000)
  }

  const handleDelWeek = async () => {
    if (!confirm(`Delete "${week.week_label}" and all its cards and files?`)) return
    await deleteWeek(week.id, classId)
    onDeleted(week.id)
  }

  return (
    <div style={{ borderBottom:'1px solid var(--border)' }}>
      {/* Header row */}
      <div style={{ background:'#F7F6F3', padding:'10px 16px', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
        <div style={{ flex:1, cursor:'pointer' }} onClick={toggle}>
          <div style={{ fontSize:12, fontWeight:600, color:'var(--text)' }}>{week.week_label}</div>
          <div style={{ fontSize:10, color:'var(--muted)', marginTop:2 }}>
            {loading ? 'Loading…' : `${cards.length} cards · ${learnedCount}/${cards.length} learned · last studied ${lastStr}`}
          </div>
        </div>
        <div style={{ display:'flex', gap:6, alignItems:'center' }}>
          {cards.length > 0 && (
            <button className="study-btn" onClick={() => { load(); setModal(true) }}>Study ▶</button>
          )}
          <button style={{ fontSize:11, color:'var(--muted)', background:'none', border:'none', cursor:'pointer' }} onClick={toggle}>{open ? '▴' : '▾'}</button>
        </div>
      </div>

      {/* Expanded content */}
      {open && (
        <div style={{ padding:'14px 16px', background:'white' }}>

          {/* Files section */}
          <div style={{ marginBottom:16 }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
              <div className="section-label" style={{ marginBottom:0 }}>Files</div>
              <label style={{ cursor:'pointer' }}>
                <span className="study-btn" style={{ fontSize:10, padding:'3px 10px' }}>
                  {uploading ? 'Uploading…' : '+ Upload'}
                </span>
                <input type="file" style={{ display:'none' }} onChange={handleUpload} disabled={uploading} />
              </label>
            </div>
            {files.length === 0 ? (
              <div style={{ fontSize:12, color:'var(--muted)', fontStyle:'italic' }}>No files yet — upload a PDF, PPTX, or DOCX.</div>
            ) : files.map(f => (
              <div key={f.id} className="file-row">
                <span>📄</span>
                <span style={{ flex:1, fontSize:12 }}>{f.file_name}</span>
                <span style={{ fontSize:11, color:'var(--muted)' }}>{f.file_size}KB · {f.added_date}</span>
                {f.file_url && (
                  <a href={f.file_url} download={f.file_name} target="_blank" rel="noreferrer"
                    style={{ fontSize:10, padding:'2px 8px', borderRadius:10, border:'1px solid #D1E8D0', color:'#065F46', textDecoration:'none', background:'#ECFDF5' }}>
                    ↓
                  </a>
                )}
                <button className="del-btn" onClick={() => handleDelFile(f)}>✕</button>
              </div>
            ))}
          </div>

          {/* Cards section */}
          <div style={{ marginBottom:12 }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
              <div className="section-label" style={{ marginBottom:0 }}>Flashcards</div>
              <label style={{ cursor:'pointer' }}>
                <span className="study-btn" style={{ fontSize:10, padding:'3px 10px', background:'#0E9E8E' }}>↓ Import JSON</span>
                <input type="file" accept=".json" style={{ display:'none' }} onChange={handleImportJSON} />
              </label>
            </div>
            {importMsg && <div style={{ fontSize:12, color:'#0E9E8E', marginBottom:8 }}>{importMsg}</div>}
            {cards.length === 0 ? (
              <div style={{ fontSize:12, color:'var(--muted)', fontStyle:'italic' }}>
                No flashcards yet. Upload a file above and send to Claude → Claude returns a JSON file → import it here.
              </div>
            ) : (
              groupBy(cards, 'topic').map(([topic, topicCards]) => (
                <div key={topic} style={{ marginBottom:12 }}>
                  <div style={{ fontSize:11, color:'#6B8060', fontWeight:600, marginBottom:4 }}>{topic}</div>
                  {topicCards.map(c => {
                    const isLearned = !!(fcProgress[setKey]?.[c.id])
                    return (
                      <div key={c.id} style={{ display:'flex', gap:8, alignItems:'center', padding:'4px 0', borderBottom:'1px solid #F5F3EF' }}>
                        <span style={{ fontSize:11, color: isLearned ? '#52B788' : '#D1D5DB' }}>{isLearned ? '✓' : '○'}</span>
                        <span style={{ fontSize:12, color: isLearned ? 'var(--muted)' : 'var(--text)', textDecoration: isLearned ? 'line-through' : 'none', flex:1 }}>{c.term}</span>
                        {c.sci && <span style={{ fontSize:10, color:'var(--muted)', fontStyle:'italic' }}>{c.sci}</span>}
                        <span style={{ fontSize:9, color:'#B0A898' }}>{c.date_added}</span>
                      </div>
                    )
                  })}
                </div>
              ))
            )}
          </div>

          {/* Danger zone */}
          <div style={{ borderTop:'1px solid #F5F3EF', paddingTop:10, display:'flex', justifyContent:'flex-end' }}>
            <button className="btn-danger" style={{ fontSize:10, padding:'4px 12px' }} onClick={handleDelWeek}>Delete week</button>
          </div>
        </div>
      )}

      {modal && cards.length > 0 && (
        <FcModal
          cards={cards} setKey={setKey} weekLabel={week.week_label}
          fcProgress={fcProgress} updateFcProgress={updateFcProgress}
          fcStudied={fcStudied} updateFcStudied={updateFcStudied}
          onClose={() => setModal(false)}
        />
      )}
    </div>
  )
}

// ── Class accordion ────────────────────────────────────────────
function ClassBlock({ cls, fcProgress, fcStudied, updateFcProgress, updateFcStudied, onDeleted }) {
  const [open,      setOpen]    = useState(false)
  const [weeks,     setWeeks]   = useState([])
  const [addingWk,  setAddingWk]= useState(false)
  const [wkLabel,   setWkLabel] = useState('')
  const [wkNum,     setWkNum]   = useState(1)

  const load = useCallback(async () => {
    const w = await getWeeks(cls.id)
    setWeeks(w)
    if (w.length) setWkNum(w.length + 1)
  }, [cls.id])

  const toggle = () => { if (!open) load(); setOpen(o => !o) }

  const handleAddWeek = async () => {
    if (!wkLabel.trim()) return
    const created = await addWeek({ class_id: cls.id, week_number: wkNum, week_label: wkLabel.trim(), sort_order: wkNum })
    setWeeks(prev => [...prev, created])
    setWkLabel('')
    setWkNum(n => n + 1)
    setAddingWk(false)
  }

  const handleDelClass = async () => {
    if (!confirm(`Delete "${cls.name}" and everything in it?`)) return
    await deleteClass(cls.id)
    onDeleted(cls.id)
  }

  return (
    <div style={{ marginBottom:14 }}>
      {/* Class header */}
      <div style={{ background:'var(--forest)', borderRadius: open ? '12px 12px 0 0' : 12, padding:'12px 18px', display:'flex', justifyContent:'space-between', alignItems:'center', cursor:'pointer' }} onClick={toggle}>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          {cls.code && <span style={{ fontSize:10, letterSpacing:2, textTransform:'uppercase', color:'var(--green-mid)' }}>{cls.code}</span>}
          <span className="serif" style={{ fontSize:18, color:'var(--sand)', fontWeight:600 }}>{cls.name}</span>
        </div>
        <span style={{ color:'var(--green-light)', fontSize:13, transition:'transform .2s', transform: open ? 'rotate(180deg)' : '' }}>▾</span>
      </div>

      {open && (
        <div style={{ border:'1px solid var(--border)', borderTop:'none', borderRadius:'0 0 12px 12px', overflow:'hidden' }}>
          {weeks.map(wk => (
            <WeekRow
              key={wk.id} week={wk} classId={cls.id}
              fcProgress={fcProgress} fcStudied={fcStudied}
              updateFcProgress={updateFcProgress} updateFcStudied={updateFcStudied}
              onDeleted={id => setWeeks(prev => prev.filter(w => w.id !== id))}
            />
          ))}

          {/* Add week */}
          <div style={{ padding:'12px 16px', background:'#FAFAF9', borderTop: weeks.length ? '1px solid var(--border)' : 'none' }}>
            {!addingWk ? (
              <div style={{ display:'flex', gap:8 }}>
                <button className="study-btn" style={{ background:'#1C2B1A' }} onClick={() => setAddingWk(true)}>+ Add Week</button>
                <button className="btn-danger" style={{ fontSize:10, padding:'4px 12px' }} onClick={handleDelClass}>Delete class</button>
              </div>
            ) : (
              <div style={{ display:'flex', gap:8, flexWrap:'wrap', alignItems:'center' }}>
                <input
                  value={`Week ${wkNum}`} readOnly
                  style={{ width:70, fontSize:12, padding:'6px 10px' }}
                />
                <input
                  value={wkLabel}
                  onChange={e => setWkLabel(e.target.value)}
                  placeholder="Week label (e.g. Reef Communities)"
                  style={{ flex:1, minWidth:180, fontSize:12, padding:'6px 10px' }}
                  onKeyDown={e => e.key === 'Enter' && handleAddWeek()}
                  autoFocus
                />
                <button className="btn-primary" style={{ padding:'7px 16px', fontSize:11 }} onClick={handleAddWeek}>Add</button>
                <button className="btn-ghost" style={{ padding:'7px 14px', fontSize:11 }} onClick={() => { setAddingWk(false); setWkLabel('') }}>Cancel</button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Main Study component ───────────────────────────────────────
export default function Study({ fcProgress, updateFcProgress, fcStudied, updateFcStudied }) {
  const [classes,    setClasses]    = useState([])
  const [loading,    setLoading]    = useState(true)
  const [addingCls,  setAddingCls]  = useState(false)
  const [clsName,    setClsName]    = useState('')
  const [clsCode,    setClsCode]    = useState('')

  useEffect(() => {
    getClasses().then(c => { setClasses(c); setLoading(false) })
  }, [])

  const handleAddClass = async () => {
    if (!clsName.trim()) return
    const created = await addClass({ name: clsName.trim(), code: clsCode.trim(), sort_order: classes.length })
    setClasses(prev => [...prev, created])
    setClsName(''); setClsCode(''); setAddingCls(false)
  }

  if (loading) return <div style={{ padding:20, color:'var(--muted)', fontSize:13 }}>Loading study materials…</div>

  return (
    <div>
      <div className="page-title">Study Materials</div>
      <div className="page-sub">
        Classes → Weeks → Flashcards & Files · Upload files to a week, send to Claude, import the returned JSON
      </div>

      {/* How it works banner */}
      <div style={{ background:'#F0F9F8', border:'1px solid #B2DFDB', borderRadius:12, padding:'12px 16px', marginBottom:20, fontSize:12, color:'#004D40' }}>
        <strong>How flashcards work:</strong> Upload a PDF or PPTX to a week → export your progress and send to Claude → Claude returns a <code>cards.json</code> file → click <strong>↓ Import JSON</strong> in that week to load the cards. Data lives in Supabase and never disappears.
      </div>

      {classes.length === 0 && !addingCls && (
        <div style={{ background:'white', borderRadius:12, border:'1px solid var(--border)', padding:24, textAlign:'center', color:'var(--muted)', fontSize:13, marginBottom:16 }}>
          No classes yet. Add your first class below.
        </div>
      )}

      {classes.map(cls => (
        <ClassBlock
          key={cls.id} cls={cls}
          fcProgress={fcProgress} fcStudied={fcStudied}
          updateFcProgress={updateFcProgress} updateFcStudied={updateFcStudied}
          onDeleted={id => setClasses(prev => prev.filter(c => c.id !== id))}
        />
      ))}

      {/* Add class */}
      <div style={{ background:'white', borderRadius:14, border:'2px dashed var(--border)', padding:'16px 18px' }}>
        {!addingCls ? (
          <button className="btn-primary" onClick={() => setAddingCls(true)}>+ Add Class</button>
        ) : (
          <div>
            <div style={{ fontSize:11, color:'var(--muted)', letterSpacing:1, textTransform:'uppercase', marginBottom:8 }}>New Class</div>
            <div style={{ display:'flex', gap:8, flexWrap:'wrap', marginBottom:8 }}>
              <input value={clsCode} onChange={e => setClsCode(e.target.value)} placeholder="Code (e.g. BIOL 505)" style={{ width:140, fontSize:12, padding:'7px 10px' }} />
              <input value={clsName} onChange={e => setClsName(e.target.value)} placeholder="Class name (e.g. Coral Reef Environments)" style={{ flex:1, minWidth:200, fontSize:12, padding:'7px 10px' }} onKeyDown={e => e.key === 'Enter' && handleAddClass()} autoFocus />
            </div>
            <div style={{ display:'flex', gap:8 }}>
              <button className="btn-primary" style={{ padding:'7px 18px', fontSize:11 }} onClick={handleAddClass} disabled={!clsName.trim()}>Create Class</button>
              <button className="btn-ghost" style={{ padding:'7px 14px', fontSize:11 }} onClick={() => { setAddingCls(false); setClsName(''); setClsCode('') }}>Cancel</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
