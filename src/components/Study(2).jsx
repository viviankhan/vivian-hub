import { useState, useEffect, useCallback } from 'react'
import {
  getClasses, addClass, deleteClass,
  getWeeks, addWeek, deleteWeek,
  getCards, importCards,
  getFiles, uploadFile, deleteStudyFile,
} from '../lib/storage.js'

// ── Flashcard Modal ────────────────────────────────────────────
function FcModal({ cards, setKey, weekLabel, fcProgress, updateFcProgress, fcStudied, updateFcStudied, onClose }) {
  const [tab, setTab]         = useState('all')
  const [idx, setIdx]         = useState(0)
  const [flipped, setFlipped] = useState(false)
  const learned = fcProgress[setKey] || {}

  const deck = tab === 'learned'   ? cards.filter(c => learned[c.id])
             : tab === 'unlearned' ? cards.filter(c => !learned[c.id])
             : cards
  const card = deck[idx] || null
  const learnedCount = cards.filter(c => learned[c.id]).length
  const pct = cards.length ? (learnedCount / cards.length * 100) : 0

  useEffect(() => {
    const s = { ...fcStudied, [setKey]: new Date().toISOString() }
    updateFcStudied(s)
  }, [])

  const next = () => { setIdx(i => (i+1) % Math.max(deck.length,1)); setFlipped(false) }
  const prev = () => { setIdx(i => (i-1+Math.max(deck.length,1)) % Math.max(deck.length,1)); setFlipped(false) }
  const mark = async (isLearned) => {
    if (!card) return
    await updateFcProgress({ ...fcProgress, [setKey]: { ...learned, [card.id]: isLearned } })
    await updateFcStudied({ ...fcStudied, [setKey]: new Date().toISOString() })
    next()
  }

  const TabBtn = ({ id, label }) => (
    <button className={`fc-tab-btn ${tab === id ? 'active' : ''}`}
      onClick={() => { setTab(id); setIdx(0); setFlipped(false) }}>{label}</button>
  )

  return (
    <div className="fc-overlay">
      <div className="fc-inner">
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:18 }}>
          <div>
            <div className="serif" style={{ fontSize:20, color:'var(--sand)', fontWeight:600, lineHeight:1.3 }}>{weekLabel}</div>
            <div style={{ fontSize:11, color:'#8FA882', marginTop:4 }}>{cards.length} cards · {learnedCount} learned</div>
          </div>
          <button className="btn-ghost" onClick={onClose} style={{ color:'#8FA882', borderColor:'rgba(255,255,255,.15)', flexShrink:0 }}>✕ Close</button>
        </div>

        <div style={{ display:'flex', gap:8, marginBottom:14 }}>
          <TabBtn id="all"       label="All" />
          <TabBtn id="unlearned" label={`Unlearned (${cards.filter(c=>!learned[c.id]).length})`} />
          <TabBtn id="learned"   label={`Learned (${learnedCount})`} />
        </div>

        <div className="progress-track" style={{ marginBottom:6 }}>
          <div className="progress-fill" style={{ width: pct+'%' }} />
        </div>
        <div style={{ fontSize:11, color:'#8FA882', textAlign:'center', marginBottom:16 }}>
          {learnedCount} / {cards.length} learned
        </div>

        {!card ? (
          <div style={{ background:'#0D1F3C', borderRadius:18, minHeight:160, display:'flex', alignItems:'center', justifyContent:'center', color:'#4A6B8A', fontSize:13 }}>
            No cards in this view
          </div>
        ) : (
          <div className="fc-card-wrap">
            <div className={`fc-card ${flipped ? 'flipped' : ''}`}
              style={{ background:'#0D1F3C', border:'1px solid rgba(14,158,142,.3)' }}
              onClick={() => setFlipped(f=>!f)}>
              {/* Front */}
              <div className="fc-face">
                <div style={{ fontSize:10, letterSpacing:2, textTransform:'uppercase', color:'#0E9E8E', marginBottom:8 }}>{card.topic}</div>
                <div style={{ fontSize:11, color:'#4A6B8A', marginBottom:10 }}>#{idx+1} of {deck.length}</div>
                {card.img_src && (
                  <img src={card.img_src} alt={card.term}
                    style={{ width:'100%', maxHeight:300, objectFit:'contain', borderRadius:10, marginBottom:14, background:'#0A1628' }} />
                )}
                <div className="fc-term">{card.term}</div>
                {card.sci && <div style={{ fontSize:13, color:'#8FA882', fontStyle:'italic', marginTop:6 }}>{card.sci}</div>}
                <div style={{ fontSize:11, color:'rgba(255,255,255,.25)', letterSpacing:1.5, textTransform:'uppercase', marginTop:16 }}>Tap to flip →</div>
              </div>
              {/* Back */}
              <div className="fc-back">
                <div style={{ fontSize:10, letterSpacing:2, textTransform:'uppercase', color:'#0E9E8E', marginBottom:8 }}>{card.topic}</div>
                <div className="serif" style={{ fontSize:17, color:'#C9E4B8', fontWeight:600, marginBottom:6 }}>{card.term}</div>
                {card.sci && <div style={{ fontSize:13, color:'#8FA882', fontStyle:'italic', marginBottom:10 }}>{card.sci}</div>}
                <div className="fc-def">{card.definition}</div>
              </div>
            </div>
          </div>
        )}

        <div style={{ display:'flex', gap:8, justifyContent:'center', marginBottom:12, flexWrap:'wrap' }}>
          <button className="fc-ctrl-btn btn-ghost" style={{ color:'#8FA882', border:'1px solid rgba(255,255,255,.15)' }} onClick={prev}>← Prev</button>
          <button className="fc-ctrl-btn btn-ghost" style={{ color:'#8FA882', border:'1px solid rgba(255,255,255,.15)' }}
            onClick={() => { setIdx(Math.floor(Math.random()*Math.max(deck.length,1))); setFlipped(false) }}>⇌ Shuffle</button>
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

// ── Folder (week) row — supports sub-folders ────────────────────
function FolderRow({ folder, classId, depth=0, fcProgress, fcStudied, updateFcProgress, updateFcStudied, onDeleted }) {
  const [open,       setOpen]       = useState(false)
  const [cards,      setCards]      = useState([])
  const [files,      setFiles]      = useState([])
  const [subfolders, setSubfolders] = useState([])
  const [modal,      setModal]      = useState(false)
  const [loading,    setLoading]    = useState(false)
  const [uploading,  setUploading]  = useState(false)
  const [importMsg,  setImportMsg]  = useState('')
  const [addingSub,  setAddingSub]  = useState(false)
  const [subLabel,   setSubLabel]   = useState('')

  const setKey = `${classId}-${folder.id}`
  const learned = fcProgress[setKey] || {}
  const learnedCount = cards.filter(c => learned[c.id]).length
  const lastStudied = fcStudied[setKey]
  const lastStr = lastStudied
    ? new Date(lastStudied).toLocaleDateString('en-US',{month:'short',day:'numeric'})
    : 'Never'

  const load = useCallback(async () => {
    if (loading) return
    setLoading(true)
    const [c, f, subs] = await Promise.all([
      getCards(folder.id),
      getFiles(folder.id),
      getWeeks(classId, folder.id),  // sub-folders
    ])
    setCards(c); setFiles(f); setSubfolders(subs)
    setLoading(false)
  }, [folder.id, classId])

  const toggle = () => { if (!open) load(); setOpen(o => !o) }

  const handleUpload = async (e) => {
    const file = e.target.files[0]; if (!file) return
    setUploading(true)
    try {
      const saved = await uploadFile(folder.id, file)
      setFiles(prev => [...prev, saved])
    } catch(err) {
      alert('Upload failed: ' + err.message)
    }
    setUploading(false)
    e.target.value = ''
  }

  const handleDelFile = async (f) => {
    if (!confirm('Remove this file?')) return
    await deleteStudyFile(f.id, folder.id, f.storage_path)
    setFiles(prev => prev.filter(x => x.id !== f.id))
  }

  const handleImportJSON = async (e) => {
    const file = e.target.files[0]; if (!file) return
    const text = await file.text()
    try {
      const json = JSON.parse(text)
      const cardArr = Array.isArray(json) ? json : json.cards
      if (!cardArr?.length) { setImportMsg('No cards found.'); return }
      const withWeek = cardArr.map(c => ({ ...c, week_id: folder.id }))
      await importCards(withWeek)
      const fresh = await getCards(folder.id)
      setCards(fresh)
      setImportMsg(`✓ Imported ${withWeek.length} cards`)
    } catch(err) {
      setImportMsg('Error: ' + err.message)
    }
    e.target.value = ''
    setTimeout(() => setImportMsg(''), 4000)
  }

  const handleAddSub = async () => {
    if (!subLabel.trim()) return
    const created = await addWeek({
      class_id: classId,
      parent_id: folder.id,
      week_number: subfolders.length + 1,
      week_label: subLabel.trim(),
      sort_order: subfolders.length,
    })
    setSubfolders(prev => [...prev, created])
    setSubLabel(''); setAddingSub(false)
  }

  const handleDel = async () => {
    if (!confirm(`Delete "${folder.week_label}" and everything in it?`)) return
    await deleteWeek(folder.id, classId)
    onDeleted(folder.id)
  }

  const indent = depth * 16

  return (
    <div style={{ borderBottom: depth === 0 ? '1px solid var(--border)' : 'none' }}>
      {/* Header */}
      <div style={{ background: depth === 0 ? '#F7F6F3' : '#F0EFF8', padding:`9px 16px 9px ${16+indent}px`, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
        <div style={{ flex:1, cursor:'pointer' }} onClick={toggle}>
          {depth > 0 && <span style={{ color:'var(--muted)', marginRight:6, fontSize:11 }}>{'└'}</span>}
          <span style={{ fontSize: depth === 0 ? 12 : 11, fontWeight:600, color:'var(--text)' }}>{folder.week_label}</span>
          <div style={{ fontSize:10, color:'var(--muted)', marginTop:2, paddingLeft: depth > 0 ? 14 : 0 }}>
            {loading ? 'Loading…' : `${cards.length} cards · ${learnedCount}/${cards.length} learned · last studied ${lastStr}`}
          </div>
        </div>
        <div style={{ display:'flex', gap:6, alignItems:'center' }}>
          {cards.length > 0 && (
            <button className="study-btn" onClick={() => { load(); setModal(true) }}>Study ▶</button>
          )}
          <span style={{ fontSize:11, color:'var(--muted)', background:'none', border:'none', cursor:'pointer', padding:'0 4px' }} onClick={toggle}>
            {open ? '▴' : '▾'}
          </span>
        </div>
      </div>

      {/* Expanded body */}
      {open && (
        <div style={{ paddingLeft: indent, background:'white', borderTop:'1px solid #F0EFF8' }}>
          {/* Sub-folders first */}
          {subfolders.map(sub => (
            <FolderRow
              key={sub.id} folder={sub} classId={classId} depth={depth+1}
              fcProgress={fcProgress} fcStudied={fcStudied}
              updateFcProgress={updateFcProgress} updateFcStudied={updateFcStudied}
              onDeleted={id => setSubfolders(prev => prev.filter(s => s.id !== id))}
            />
          ))}

          <div style={{ padding:'12px 16px' }}>
            {/* Files */}
            <div style={{ marginBottom:14 }}>
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
                <div style={{ fontSize:12, color:'var(--muted)', fontStyle:'italic' }}>No files yet.</div>
              ) : files.map(f => (
                <div key={f.id} className="file-row">
                  <span>📄</span>
                  <span style={{ flex:1, fontSize:12 }}>{f.file_name}</span>
                  <span style={{ fontSize:11, color:'var(--muted)', flexShrink:0 }}>{f.file_size ? `${f.file_size}KB · ` : ''}{f.added_date}</span>
                  {f.file_url && (
                    <a href={f.file_url} download={f.file_name} target="_blank" rel="noreferrer"
                      style={{ fontSize:10, padding:'2px 8px', borderRadius:10, border:'1px solid #D1E8D0', color:'#065F46', textDecoration:'none', background:'#ECFDF5', flexShrink:0 }}>↓</a>
                  )}
                  <button className="del-btn" onClick={() => handleDelFile(f)}>✕</button>
                </div>
              ))}
            </div>

            {/* Import cards */}
            <div style={{ marginBottom:12 }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:6 }}>
                <div style={{ fontSize:11, color:'var(--muted)', letterSpacing:1, textTransform:'uppercase' }}>
                  Flashcards {cards.length > 0 ? `(${cards.length})` : ''}
                </div>
                <label style={{ cursor:'pointer' }}>
                  <span className="study-btn" style={{ fontSize:10, padding:'3px 10px', background:'#0E9E8E' }}>↓ Import JSON</span>
                  <input type="file" accept=".json" style={{ display:'none' }} onChange={handleImportJSON} />
                </label>
              </div>
              {importMsg && <div style={{ fontSize:12, color:'#0E9E8E' }}>{importMsg}</div>}
              {cards.length === 0 && (
                <div style={{ fontSize:12, color:'var(--muted)', fontStyle:'italic' }}>
                  No cards yet. Upload a file → send to Claude → import the returned JSON.
                </div>
              )}
            </div>

            {/* Actions: add sub-folder + delete */}
            <div style={{ borderTop:'1px solid #F5F3EF', paddingTop:10, display:'flex', gap:8, flexWrap:'wrap', alignItems:'center' }}>
              {!addingSub ? (
                <>
                  <button className="study-btn" style={{ fontSize:10, padding:'4px 12px' }} onClick={() => setAddingSub(true)}>
                    + Sub-folder
                  </button>
                  <button className="btn-danger" style={{ fontSize:10, padding:'4px 12px' }} onClick={handleDel}>Delete folder</button>
                </>
              ) : (
                <>
                  <input value={subLabel} onChange={e => setSubLabel(e.target.value)}
                    placeholder="Sub-folder name…" autoFocus
                    onKeyDown={e => e.key === 'Enter' && handleAddSub()}
                    style={{ flex:1, minWidth:160, fontSize:12, padding:'5px 10px' }} />
                  <button className="btn-primary" style={{ padding:'5px 14px', fontSize:11 }} onClick={handleAddSub}>Add</button>
                  <button className="btn-ghost" style={{ padding:'5px 10px', fontSize:11 }} onClick={() => { setAddingSub(false); setSubLabel('') }}>Cancel</button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {modal && cards.length > 0 && (
        <FcModal
          cards={cards} setKey={setKey} weekLabel={folder.week_label}
          fcProgress={fcProgress} updateFcProgress={updateFcProgress}
          fcStudied={fcStudied} updateFcStudied={updateFcStudied}
          onClose={() => setModal(false)}
        />
      )}
    </div>
  )
}

// ── Class block ────────────────────────────────────────────────
function ClassBlock({ cls, fcProgress, fcStudied, updateFcProgress, updateFcStudied, onDeleted }) {
  const [open,       setOpen]      = useState(false)
  const [folders,    setFolders]   = useState([])
  const [addingFld,  setAddingFld] = useState(false)
  const [fldLabel,   setFldLabel]  = useState('')

  const load = useCallback(async () => {
    const w = await getWeeks(cls.id, null)  // top-level only
    setFolders(w)
  }, [cls.id])

  const toggle = () => { if (!open) load(); setOpen(o => !o) }

  const handleAddFolder = async () => {
    if (!fldLabel.trim()) return
    const created = await addWeek({
      class_id: cls.id,
      parent_id: null,
      week_number: folders.length + 1,
      week_label: fldLabel.trim(),
      sort_order: folders.length,
    })
    setFolders(prev => [...prev, created])
    setFldLabel(''); setAddingFld(false)
  }

  const handleDelClass = async () => {
    if (!confirm(`Delete "${cls.name}" and everything in it?`)) return
    await deleteClass(cls.id)
    onDeleted(cls.id)
  }

  return (
    <div style={{ marginBottom:14 }}>
      <div style={{ background:'var(--forest)', borderRadius: open ? '12px 12px 0 0' : 12, padding:'12px 18px', display:'flex', justifyContent:'space-between', alignItems:'center', cursor:'pointer' }} onClick={toggle}>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          {cls.code && <span style={{ fontSize:10, letterSpacing:2, textTransform:'uppercase', color:'var(--green-mid)' }}>{cls.code}</span>}
          <span className="serif" style={{ fontSize:18, color:'var(--sand)', fontWeight:600 }}>{cls.name}</span>
        </div>
        <span style={{ color:'var(--green-light)', fontSize:13, transition:'transform .2s', transform: open ? 'rotate(180deg)' : '' }}>▾</span>
      </div>

      {open && (
        <div style={{ border:'1px solid var(--border)', borderTop:'none', borderRadius:'0 0 12px 12px', overflow:'hidden' }}>
          {folders.map(f => (
            <FolderRow
              key={f.id} folder={f} classId={cls.id} depth={0}
              fcProgress={fcProgress} fcStudied={fcStudied}
              updateFcProgress={updateFcProgress} updateFcStudied={updateFcStudied}
              onDeleted={id => setFolders(prev => prev.filter(x => x.id !== id))}
            />
          ))}

          {/* Add folder */}
          <div style={{ padding:'12px 16px', background:'#FAFAF9', borderTop: folders.length ? '1px solid var(--border)' : 'none' }}>
            {!addingFld ? (
              <div style={{ display:'flex', gap:8 }}>
                <button className="study-btn" style={{ background:'#1C2B1A' }} onClick={() => setAddingFld(true)}>+ Add Folder</button>
                <button className="btn-danger" style={{ fontSize:10, padding:'4px 12px' }} onClick={handleDelClass}>Delete class</button>
              </div>
            ) : (
              <div style={{ display:'flex', gap:8, flexWrap:'wrap', alignItems:'center' }}>
                <input value={fldLabel} onChange={e => setFldLabel(e.target.value)}
                  placeholder="Folder name (e.g. Week 1 — Reef ID)" autoFocus
                  onKeyDown={e => e.key === 'Enter' && handleAddFolder()}
                  style={{ flex:1, minWidth:200, fontSize:12, padding:'6px 10px' }} />
                <button className="btn-primary" style={{ padding:'7px 16px', fontSize:11 }} onClick={handleAddFolder} disabled={!fldLabel.trim()}>Add</button>
                <button className="btn-ghost" style={{ padding:'7px 14px', fontSize:11 }} onClick={() => { setAddingFld(false); setFldLabel('') }}>Cancel</button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Main ───────────────────────────────────────────────────────
export default function Study({ fcProgress, updateFcProgress, fcStudied, updateFcStudied }) {
  const [classes,   setClasses]   = useState([])
  const [loading,   setLoading]   = useState(true)
  const [addingCls, setAddingCls] = useState(false)
  const [clsName,   setClsName]   = useState('')
  const [clsCode,   setClsCode]   = useState('')

  useEffect(() => {
    getClasses().then(c => { setClasses(c); setLoading(false) })
  }, [])

  const handleAddClass = async () => {
    if (!clsName.trim()) return
    const created = await addClass({ name: clsName.trim(), code: clsCode.trim(), sort_order: classes.length })
    setClasses(prev => [...prev, created])
    setClsName(''); setClsCode(''); setAddingCls(false)
  }

  if (loading) return <div style={{ padding:20, color:'var(--muted)', fontSize:13 }}>Loading…</div>

  return (
    <div>
      <div className="page-title">Study Materials</div>
      <div className="page-sub">Classes → Folders → Sub-folders → Flashcards & Files</div>

      <div style={{ background:'#F0F9F8', border:'1px solid #B2DFDB', borderRadius:12, padding:'11px 16px', marginBottom:20, fontSize:12, color:'#004D40', lineHeight:1.6 }}>
        <strong>Adding flashcards:</strong> Upload a file to a folder → export your state and send to Claude → Claude returns a <code>cards.json</code> → click <strong>↓ Import JSON</strong> in that folder.
      </div>

      {classes.length === 0 && !addingCls && (
        <div style={{ background:'white', borderRadius:12, border:'1px solid var(--border)', padding:24, textAlign:'center', color:'var(--muted)', fontSize:13, marginBottom:16 }}>
          No classes yet.
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
      <div style={{ background:'white', borderRadius:14, border:'2px dashed var(--border)', padding:'16px 18px', marginTop:8 }}>
        {!addingCls ? (
          <button className="btn-primary" onClick={() => setAddingCls(true)}>+ Add Class</button>
        ) : (
          <div>
            <div className="section-label">New Class</div>
            <div style={{ display:'flex', gap:8, flexWrap:'wrap', marginBottom:8 }}>
              <input value={clsCode} onChange={e => setClsCode(e.target.value)} placeholder="Code (e.g. BIOL 505)"
                style={{ width:140, fontSize:12, padding:'7px 10px' }} />
              <input value={clsName} onChange={e => setClsName(e.target.value)} placeholder="Class name"
                style={{ flex:1, minWidth:200, fontSize:12, padding:'7px 10px' }}
                onKeyDown={e => e.key === 'Enter' && handleAddClass()} autoFocus />
            </div>
            <div style={{ display:'flex', gap:8 }}>
              <button className="btn-primary" style={{ padding:'7px 18px', fontSize:11 }} onClick={handleAddClass} disabled={!clsName.trim()}>Create</button>
              <button className="btn-ghost" style={{ padding:'7px 14px', fontSize:11 }} onClick={() => { setAddingCls(false); setClsName(''); setClsCode('') }}>Cancel</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
