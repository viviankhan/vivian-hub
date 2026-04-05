import { useState, useEffect, useCallback, useRef } from 'react'
import {
  getClasses, addClass, deleteClass,
  getWeeks, addWeek, deleteWeek,
  getCards, importCards, updateCard, deleteCard,
  getFiles, uploadFile, deleteStudyFile,
  getQuickLinks, setQuickLinks,
} from '../lib/storage.js'

// ── Helpers ────────────────────────────────────────────────────
function fileIcon(name) {
  const ext = (name||'').split('.').pop().toLowerCase()
  if (['html','htm'].includes(ext)) return '🃏'
  if (ext === 'pdf')                return '📄'
  if (['pptx','ppt'].includes(ext)) return '📊'
  if (['docx','doc'].includes(ext)) return '📝'
  if (['xlsx','xls','csv'].includes(ext)) return '📈'
  if (['jpg','jpeg','png','gif','webp'].includes(ext)) return '🖼️'
  return '📎'
}
function fileLabel(name) {
  const ext = (name||'').split('.').pop().toLowerCase()
  if (['html','htm'].includes(ext)) return 'Open'
  if (ext === 'pdf')                return 'Open'
  return 'Download'
}
function fileSz(kb) {
  if (!kb) return ''
  return kb < 1024 ? `${kb} KB` : `${(kb/1024).toFixed(1)} MB`
}
function uid() { return 'c-' + Date.now() + '-' + Math.random().toString(36).slice(2,7) }

// ── Card editor modal ──────────────────────────────────────────
function CardEditor({ card, weekId, allGroups, onSave, onDelete, onClose }) {
  const [term,    setTerm]    = useState(card.term || card.common || '')
  const [sci,     setSci]     = useState(card.sci || '')
  const [defn,    setDefn]    = useState(card.definition || card.def || '')
  const [etym,    setEtym]    = useState(card.etymology || '')
  const [group,   setGroup]   = useState(card.topic || card.group || '')
  const [newGroup,setNewGroup]= useState('')
  const [imgSrc,  setImgSrc]  = useState(card.img_src || card.img || '')
  const [saving,  setSaving]  = useState(false)
  const imgRef = useRef()

  const handleImg = (e) => {
    const file = e.target.files[0]; if (!file) return
    const reader = new FileReader()
    reader.onload = ev => setImgSrc(ev.target.result)
    reader.readAsDataURL(file)
  }

  const save = async () => {
    setSaving(true)
    const updated = {
      ...card,
      week_id:    weekId,
      term:       term.trim(),
      common:     term.trim(),
      sci:        sci.trim(),
      definition: defn.trim(),
      def:        defn.trim(),
      etymology:  etym.trim(),
      topic:      newGroup.trim() || group,
      group:      newGroup.trim() || group,
      img_src:    imgSrc,
      img:        imgSrc,
    }
    await onSave(updated)
    setSaving(false)
    onClose()
  }

  const groups = [...new Set([...allGroups, group].filter(Boolean))]

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.55)', zIndex:700, display:'flex', alignItems:'center', justifyContent:'center', padding:16, overflowY:'auto' }}>
      <div style={{ background:'white', borderRadius:16, padding:24, maxWidth:520, width:'100%', boxShadow:'0 24px 64px rgba(0,0,0,.3)', maxHeight:'90vh', overflowY:'auto' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:18 }}>
          <div className="serif" style={{ fontSize:18, fontWeight:600, color:'var(--text)' }}>{card.id ? 'Edit Card' : 'New Card'}</div>
          <button onClick={onClose} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--muted)', fontSize:20 }}>✕</button>
        </div>

        {/* Image */}
        <div style={{ marginBottom:14 }}>
          <div style={{ fontSize:10, color:'var(--muted)', letterSpacing:1, textTransform:'uppercase', marginBottom:6 }}>Image</div>
          {imgSrc ? (
            <div style={{ position:'relative', marginBottom:8 }}>
              <img src={imgSrc} alt="card" style={{ width:'100%', maxHeight:200, objectFit:'contain', borderRadius:10, background:'#F3F4F6' }} />
              <button onClick={() => setImgSrc('')}
                style={{ position:'absolute', top:6, right:6, background:'rgba(0,0,0,.5)', border:'none', borderRadius:'50%', color:'white', width:24, height:24, cursor:'pointer', fontSize:13, display:'flex', alignItems:'center', justifyContent:'center' }}>✕</button>
            </div>
          ) : (
            <div onClick={() => imgRef.current?.click()}
              style={{ border:'2px dashed var(--border)', borderRadius:10, padding:'20px', textAlign:'center', cursor:'pointer', color:'var(--muted)', fontSize:13, marginBottom:8 }}>
              🖼️ Click to upload image
            </div>
          )}
          <input ref={imgRef} type="file" accept="image/*" style={{ display:'none' }} onChange={handleImg} />
          {!imgSrc && <button onClick={() => imgRef.current?.click()} style={{ fontSize:11, padding:'5px 12px', borderRadius:8, border:'1px solid var(--border)', background:'white', cursor:'pointer', fontFamily:'DM Sans,sans-serif', color:'var(--muted)' }}>Upload image</button>}
        </div>

        {/* Term */}
        <div style={{ marginBottom:12 }}>
          <div style={{ fontSize:10, color:'var(--muted)', letterSpacing:1, textTransform:'uppercase', marginBottom:5 }}>Common Name / Term *</div>
          <input value={term} onChange={e => setTerm(e.target.value)} placeholder="e.g. Christmas Tree Worm"
            style={{ width:'100%', fontSize:14, padding:'9px 11px', borderRadius:9, border:'1px solid var(--border)', fontFamily:'DM Sans,sans-serif', outline:'none' }} />
        </div>

        {/* Scientific name */}
        <div style={{ marginBottom:12 }}>
          <div style={{ fontSize:10, color:'var(--muted)', letterSpacing:1, textTransform:'uppercase', marginBottom:5 }}>Scientific Name</div>
          <input value={sci} onChange={e => setSci(e.target.value)} placeholder="e.g. Spirobranchus giganteus"
            style={{ width:'100%', fontSize:13, padding:'9px 11px', borderRadius:9, border:'1px solid var(--border)', fontFamily:'DM Sans,sans-serif', fontStyle:'italic', outline:'none' }} />
        </div>

        {/* Definition */}
        <div style={{ marginBottom:12 }}>
          <div style={{ fontSize:10, color:'var(--muted)', letterSpacing:1, textTransform:'uppercase', marginBottom:5 }}>Definition / Notes *</div>
          <textarea value={defn} onChange={e => setDefn(e.target.value)} rows={3} placeholder="Field notes, key ID features, behavior…"
            style={{ width:'100%', fontSize:13, padding:'9px 11px', borderRadius:9, border:'1px solid var(--border)', fontFamily:'DM Sans,sans-serif', resize:'vertical', lineHeight:1.5, outline:'none' }} />
        </div>

        {/* Etymology */}
        <div style={{ marginBottom:12 }}>
          <div style={{ fontSize:10, color:'var(--muted)', letterSpacing:1, textTransform:'uppercase', marginBottom:5 }}>Etymology (optional)</div>
          <input value={etym} onChange={e => setEtym(e.target.value)} placeholder="e.g. Spiro = spiral · branchus = gilled"
            style={{ width:'100%', fontSize:12, padding:'9px 11px', borderRadius:9, border:'1px solid var(--border)', fontFamily:'DM Sans,sans-serif', outline:'none' }} />
        </div>

        {/* Group / Category */}
        <div style={{ marginBottom:18 }}>
          <div style={{ fontSize:10, color:'var(--muted)', letterSpacing:1, textTransform:'uppercase', marginBottom:5 }}>Group / Category</div>
          <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginBottom:8 }}>
            {groups.map(g => (
              <button key={g} onClick={() => { setGroup(g); setNewGroup('') }}
                style={{ fontSize:11, padding:'4px 12px', borderRadius:20, border:'none', cursor:'pointer', fontFamily:'DM Sans,sans-serif',
                  background: group===g && !newGroup ? 'var(--forest)' : '#F3F4F6',
                  color: group===g && !newGroup ? 'white' : 'var(--muted)', fontWeight: group===g && !newGroup ? 600 : 400 }}>
                {g}
              </button>
            ))}
          </div>
          <input value={newGroup} onChange={e => setNewGroup(e.target.value)} placeholder="Or type a new group…"
            style={{ width:'100%', fontSize:12, padding:'7px 11px', borderRadius:9, border:'1px solid var(--border)', fontFamily:'DM Sans,sans-serif', outline:'none' }} />
        </div>

        <div style={{ display:'flex', gap:8 }}>
          <button onClick={save} disabled={!term.trim() || saving}
            style={{ flex:1, padding:'11px', borderRadius:10, border:'none', background:'var(--forest)', color:'var(--green-light)', cursor:'pointer', fontFamily:'DM Sans,sans-serif', fontWeight:600, fontSize:13, opacity: (!term.trim()||saving) ? .5 : 1 }}>
            {saving ? 'Saving…' : 'Save Card'}
          </button>
          {card.id && (
            <button onClick={() => { if (confirm('Delete this card?')) { onDelete(card); onClose() } }}
              style={{ padding:'11px 16px', borderRadius:10, border:'1px solid #FECACA', background:'#FFF5F5', color:'#991B1B', cursor:'pointer', fontFamily:'DM Sans,sans-serif', fontSize:12 }}>
              Delete
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Card tile ──────────────────────────────────────────────────
function CardTile({ card, onClick }) {
  const img = card.img_src || card.img
  return (
    <div onClick={onClick}
      style={{ background:'white', borderRadius:12, border:'1px solid var(--border)', overflow:'hidden', cursor:'pointer', transition:'box-shadow .15s' }}
      onMouseEnter={e => e.currentTarget.style.boxShadow='0 4px 16px rgba(0,0,0,.1)'}
      onMouseLeave={e => e.currentTarget.style.boxShadow='none'}>
      {img ? (
        <img src={img} alt={card.term||card.common} style={{ width:'100%', height:100, objectFit:'cover', display:'block', background:'#F3F4F6' }} />
      ) : (
        <div style={{ width:'100%', height:60, background:'#F3F4F6', display:'flex', alignItems:'center', justifyContent:'center', color:'var(--muted)', fontSize:22 }}>🌊</div>
      )}
      <div style={{ padding:'8px 10px' }}>
        <div style={{ fontSize:12, fontWeight:600, color:'var(--text)', lineHeight:1.3, marginBottom:2 }}>{card.term || card.common}</div>
        {(card.sci) && <div style={{ fontSize:10, color:'var(--muted)', fontStyle:'italic' }}>{card.sci}</div>}
        {(card.topic||card.group) && <div style={{ fontSize:9, padding:'1px 6px', borderRadius:10, background:'#F0FDF4', color:'#065F46', display:'inline-block', marginTop:4, fontWeight:600, letterSpacing:.5 }}>{card.topic||card.group}</div>}
      </div>
    </div>
  )
}

// ── Cards panel inside a folder ────────────────────────────────
function CardsPanel({ folderId, weekLabel }) {
  const [cards,   setCards]   = useState([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(null) // null | 'new' | card object
  const [filter,  setFilter]  = useState('All')
  const [importMsg, setImportMsg] = useState('')

  useEffect(() => {
    getCards(folderId).then(c => { setCards(c); setLoading(false) })
  }, [folderId])

  const groups = ['All', ...new Set(cards.map(c => c.topic||c.group).filter(Boolean))]

  const visible = filter === 'All' ? cards : cards.filter(c => (c.topic||c.group) === filter)

  const handleSave = async (updated) => {
    const isNew = !cards.find(c => c.id === updated.id)
    if (isNew) updated.id = uid()
    const saved = await updateCard({ ...updated, week_id: folderId })
    if (isNew) setCards(prev => [...prev, saved||updated])
    else       setCards(prev => prev.map(c => c.id===updated.id ? (saved||updated) : c))
  }

  const handleDelete = async (card) => {
    await deleteCard(card.id, folderId)
    setCards(prev => prev.filter(c => c.id !== card.id))
  }

  const handleImport = async (e) => {
    const file = e.target.files[0]; if (!file) return
    try {
      const json = JSON.parse(await file.text())
      const arr = Array.isArray(json) ? json : json.cards
      if (!arr?.length) { setImportMsg('No cards found in file.'); return }
      const withWeek = arr.map(c => ({ ...c, week_id: folderId }))
      await importCards(withWeek)
      const fresh = await getCards(folderId)
      setCards(fresh)
      setImportMsg(`✓ Imported ${withWeek.length} cards`)
    } catch(err) { setImportMsg('Error: ' + err.message) }
    e.target.value = ''
    setTimeout(() => setImportMsg(''), 4000)
  }

  if (loading) return <div style={{ padding:12, fontSize:12, color:'var(--muted)' }}>Loading cards…</div>

  return (
    <div style={{ padding:'12px 14px' }}>
      {/* Toolbar */}
      <div style={{ display:'flex', gap:8, alignItems:'center', flexWrap:'wrap', marginBottom:12 }}>
        <button onClick={() => setEditing({ term:'', sci:'', definition:'', etymology:'', topic:'', img_src:'' })}
          style={{ fontSize:11, padding:'6px 14px', borderRadius:9, border:'none', background:'var(--forest)', color:'var(--green-light)', cursor:'pointer', fontFamily:'DM Sans,sans-serif', fontWeight:600 }}>
          + New Card
        </button>
        <label style={{ cursor:'pointer' }}>
          <span style={{ fontSize:11, padding:'6px 12px', borderRadius:9, border:'1px solid var(--border)', background:'white', color:'var(--muted)', cursor:'pointer', fontFamily:'DM Sans,sans-serif', display:'inline-block' }}>
            ↓ Import JSON
          </span>
          <input type="file" accept=".json" style={{ display:'none' }} onChange={handleImport} />
        </label>
        {importMsg && <span style={{ fontSize:11, color: importMsg.startsWith('✓') ? '#059669' : '#EF4444' }}>{importMsg}</span>}
        <span style={{ marginLeft:'auto', fontSize:11, color:'var(--muted)' }}>{cards.length} card{cards.length!==1?'s':''}</span>
      </div>

      {/* Group filter tabs */}
      {groups.length > 1 && (
        <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginBottom:12 }}>
          {groups.map(g => (
            <button key={g} onClick={() => setFilter(g)}
              style={{ fontSize:10, padding:'3px 10px', borderRadius:20, border:'none', cursor:'pointer', fontFamily:'DM Sans,sans-serif', fontWeight:600, letterSpacing:.5,
                background: filter===g ? 'var(--forest)' : '#F3F4F6',
                color: filter===g ? 'white' : 'var(--muted)' }}>
              {g} {g==='All' ? `(${cards.length})` : `(${cards.filter(c=>(c.topic||c.group)===g).length})`}
            </button>
          ))}
        </div>
      )}

      {/* Card grid */}
      {visible.length === 0 ? (
        <div style={{ textAlign:'center', padding:'24px 0', color:'var(--muted)', fontSize:13 }}>
          {cards.length === 0 ? 'No cards yet — add one or import a JSON file.' : 'No cards in this group.'}
        </div>
      ) : (
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(150px, 1fr))', gap:10 }}>
          {visible.map(card => (
            <CardTile key={card.id} card={card} onClick={() => setEditing(card)} />
          ))}
        </div>
      )}

      {/* Editor modal */}
      {editing && (
        <CardEditor
          card={editing} weekId={folderId}
          allGroups={groups.filter(g => g!=='All')}
          onSave={handleSave} onDelete={handleDelete}
          onClose={() => setEditing(null)} />
      )}
    </div>
  )
}

// ── File row ───────────────────────────────────────────────────
function FileRow({ f, onDelete }) {
  return (
    <div style={{ display:'flex', gap:10, alignItems:'center', padding:'9px 12px', borderRadius:9, border:'1px solid var(--border)', marginBottom:6, background:'white' }}>
      <span style={{ fontSize:18, flexShrink:0 }}>{fileIcon(f.file_name)}</span>
      <div style={{ flex:1, minWidth:0 }}>
        <div style={{ fontSize:13, fontWeight:500, color:'var(--text)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{f.file_name}</div>
        <div style={{ fontSize:10, color:'var(--muted)', marginTop:1 }}>{fileSz(f.file_size)}{f.added_date ? ` · ${f.added_date}` : ''}</div>
      </div>
      {f.file_url ? (
        <a href={f.file_url} target="_blank" rel="noreferrer" download={['html','htm','pdf'].includes((f.file_name||'').split('.').pop().toLowerCase()) ? undefined : f.file_name}
          style={{ fontSize:11, padding:'5px 12px', borderRadius:8, border:'1px solid var(--forest)', color:'var(--forest)', textDecoration:'none', background:'white', fontFamily:'DM Sans,sans-serif', fontWeight:600, flexShrink:0 }}>
          {fileLabel(f.file_name)}
        </a>
      ) : (
        <span style={{ fontSize:11, color:'var(--muted)' }}>No URL</span>
      )}
      <button onClick={() => onDelete(f)} style={{ background:'none', border:'none', cursor:'pointer', color:'#D1D5DB', fontSize:16, flexShrink:0 }}>✕</button>
    </div>
  )
}

// ── Folder row ─────────────────────────────────────────────────
function FolderRow({ folder, classId, depth=0, onDeleted }) {
  const [open,       setOpen]      = useState(false)
  const [activeTab,  setActiveTab] = useState('files') // 'files' | 'cards'
  const [files,      setFiles]     = useState([])
  const [subfolders, setSubfolders]= useState([])
  const [loading,    setLoading]   = useState(false)
  const [uploading,  setUploading] = useState(false)
  const [addingSub,  setAddingSub] = useState(false)
  const [subLabel,   setSubLabel]  = useState('')
  const [uploadMsg,  setUploadMsg] = useState('')

  const load = useCallback(async () => {
    if (loading) return
    setLoading(true)
    const [f, subs] = await Promise.all([
      getFiles(folder.id),
      depth === 0 ? getWeeks(classId, folder.id) : Promise.resolve([]),
    ])
    setFiles(f); setSubfolders(subs); setLoading(false)
  }, [folder.id, classId, depth])

  const toggle = () => { if (!open) load(); setOpen(o => !o) }

  const handleUpload = async (e) => {
    const file = e.target.files[0]; if (!file) return
    setUploading(true); setUploadMsg('')
    try {
      const saved = await uploadFile(folder.id, file)
      setFiles(prev => [...prev, saved])
      setUploadMsg(`✓ ${file.name}`)
      setTimeout(() => setUploadMsg(''), 3000)
    } catch(err) { setUploadMsg('Failed: ' + err.message) }
    setUploading(false); e.target.value = ''
  }

  const handleDelFile = async (f) => {
    if (!confirm(`Remove "${f.file_name}"?`)) return
    await deleteStudyFile(f.id, folder.id, f.storage_path)
    setFiles(prev => prev.filter(x => x.id !== f.id))
  }

  const handleAddSub = async () => {
    if (!subLabel.trim()) return
    const created = await addWeek({ class_id:classId, parent_id:folder.id, week_number:subfolders.length+1, week_label:subLabel.trim(), sort_order:subfolders.length })
    setSubfolders(prev => [...prev, created])
    setSubLabel(''); setAddingSub(false)
  }

  const handleDel = async () => {
    if (!confirm(`Delete "${folder.week_label}" and all its contents?`)) return
    await deleteWeek(folder.id, classId)
    onDeleted(folder.id)
  }

  const indent = depth * 14

  return (
    <div style={{ borderBottom: depth===0 ? '1px solid var(--border)' : 'none' }}>
      <div style={{ background:depth===0?'#F7F6F3':'#F0EFF8', padding:`9px 14px 9px ${14+indent}px`, display:'flex', justifyContent:'space-between', alignItems:'center', cursor:'pointer' }} onClick={toggle}>
        <div style={{ flex:1 }}>
          {depth > 0 && <span style={{ color:'var(--muted)', marginRight:6, fontSize:11 }}>└</span>}
          <span style={{ fontSize:depth===0?13:12, fontWeight:600, color:'var(--text)' }}>📁 {folder.week_label}</span>
        </div>
        <span style={{ fontSize:11, color:'var(--muted)' }}>{open?'▴':'▾'}</span>
      </div>

      {open && (
        <div style={{ paddingLeft:indent, background:'white', borderTop:'1px solid #F0EFF8' }}>
          {subfolders.map(sub => (
            <FolderRow key={sub.id} folder={sub} classId={classId} depth={depth+1}
              onDeleted={id => setSubfolders(prev => prev.filter(s => s.id!==id))} />
          ))}

          {/* Tab switcher */}
          <div style={{ display:'flex', borderBottom:'1px solid var(--border)', padding:'0 14px' }}>
            {['files','cards'].map(t => (
              <button key={t} onClick={() => setActiveTab(t)}
                style={{ fontFamily:'DM Sans,sans-serif', fontSize:11, fontWeight:600, letterSpacing:1, textTransform:'uppercase', padding:'9px 14px', background:'none', border:'none', borderBottom: activeTab===t ? '2px solid var(--forest)' : '2px solid transparent', color: activeTab===t ? 'var(--forest)' : 'var(--muted)', cursor:'pointer' }}>
                {t === 'files' ? '📎 Files' : '🃏 Flashcards'}
              </button>
            ))}
          </div>

          {/* Files tab */}
          {activeTab === 'files' && (
            <div style={{ padding:'12px 14px' }}>
              {files.length === 0 && <div style={{ fontSize:12, color:'var(--muted)', fontStyle:'italic', marginBottom:10 }}>No files yet.</div>}
              {files.map(f => <FileRow key={f.id} f={f} onDelete={handleDelFile} />)}
              <div style={{ display:'flex', gap:8, alignItems:'center', marginTop:6, flexWrap:'wrap' }}>
                <label style={{ cursor:'pointer' }}>
                  <span className="study-btn" style={{ fontSize:11, padding:'5px 12px', background:'var(--forest)', display:'inline-block' }}>
                    {uploading ? 'Uploading…' : '↑ Upload file'}
                  </span>
                  <input type="file" style={{ display:'none' }} onChange={handleUpload} disabled={uploading} />
                </label>
                {uploadMsg && <span style={{ fontSize:11, color: uploadMsg.startsWith('✓') ? '#059669' : '#EF4444' }}>{uploadMsg}</span>}
              </div>
              <div style={{ borderTop:'1px solid #F5F3EF', paddingTop:10, marginTop:10, display:'flex', gap:8, flexWrap:'wrap' }}>
                {depth===0 && !addingSub && <button className="study-btn" style={{ fontSize:10, padding:'4px 10px' }} onClick={() => setAddingSub(true)}>+ Sub-folder</button>}
                {depth===0 && addingSub && (
                  <>
                    <input value={subLabel} onChange={e => setSubLabel(e.target.value)} placeholder="Sub-folder name…" autoFocus
                      onKeyDown={e => e.key==='Enter' && handleAddSub()}
                      style={{ flex:1, minWidth:130, fontSize:12, padding:'5px 9px', borderRadius:8, border:'1px solid var(--border)', fontFamily:'DM Sans,sans-serif' }} />
                    <button className="btn-primary" style={{ padding:'5px 12px', fontSize:11 }} onClick={handleAddSub}>Add</button>
                    <button className="btn-ghost" style={{ padding:'5px 9px', fontSize:11 }} onClick={() => { setAddingSub(false); setSubLabel('') }}>Cancel</button>
                  </>
                )}
                <button className="btn-danger" style={{ fontSize:10, padding:'4px 10px' }} onClick={handleDel}>Delete folder</button>
              </div>
            </div>
          )}

          {/* Cards tab */}
          {activeTab === 'cards' && (
            <CardsPanel folderId={folder.id} weekLabel={folder.week_label} />
          )}
        </div>
      )}
    </div>
  )
}

// ── Class block ────────────────────────────────────────────────
function ClassBlock({ cls, onDeleted }) {
  const [open, setOpen]       = useState(false)
  const [folders, setFolders] = useState([])
  const [addingFld, setAddingFld] = useState(false)
  const [fldLabel,  setFldLabel]  = useState('')

  const load = useCallback(async () => {
    const w = await getWeeks(cls.id, null); setFolders(w)
  }, [cls.id])

  const toggle = () => { if (!open) load(); setOpen(o => !o) }

  const handleAddFolder = async () => {
    if (!fldLabel.trim()) return
    const created = await addWeek({ class_id:cls.id, parent_id:null, week_number:folders.length+1, week_label:fldLabel.trim(), sort_order:folders.length })
    setFolders(prev => [...prev, created])
    setFldLabel(''); setAddingFld(false)
  }

  return (
    <div style={{ marginBottom:12 }}>
      <div style={{ background:'var(--forest)', borderRadius:open?'12px 12px 0 0':12, padding:'13px 18px', display:'flex', justifyContent:'space-between', alignItems:'center', cursor:'pointer' }} onClick={toggle}>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          {cls.code && <span style={{ fontSize:10, letterSpacing:2, textTransform:'uppercase', color:'var(--green-mid)' }}>{cls.code}</span>}
          <span className="serif" style={{ fontSize:17, color:'var(--sand)', fontWeight:600 }}>{cls.name}</span>
        </div>
        <span style={{ color:'var(--green-light)', fontSize:13, transform:open?'rotate(180deg)':'', transition:'transform .2s' }}>▾</span>
      </div>
      {open && (
        <div style={{ border:'1px solid var(--border)', borderTop:'none', borderRadius:'0 0 12px 12px', overflow:'hidden' }}>
          {folders.map(f => (
            <FolderRow key={f.id} folder={f} classId={cls.id} depth={0}
              onDeleted={id => setFolders(prev => prev.filter(x => x.id!==id))} />
          ))}
          <div style={{ padding:'12px 14px', background:'#FAFAF9', borderTop:folders.length?'1px solid var(--border)':'none' }}>
            {!addingFld ? (
              <div style={{ display:'flex', gap:8 }}>
                <button className="study-btn" style={{ background:'#1C2B1A' }} onClick={() => setAddingFld(true)}>+ Add Folder</button>
                <button className="btn-danger" style={{ fontSize:10, padding:'4px 12px' }} onClick={async () => { if (confirm(`Delete "${cls.name}"?`)) { await deleteClass(cls.id); onDeleted(cls.id) } }}>Delete class</button>
              </div>
            ) : (
              <div style={{ display:'flex', gap:8, flexWrap:'wrap', alignItems:'center' }}>
                <input value={fldLabel} onChange={e => setFldLabel(e.target.value)} placeholder="Folder name" autoFocus
                  onKeyDown={e => e.key==='Enter' && handleAddFolder()}
                  style={{ flex:1, minWidth:200, fontSize:12, padding:'7px 10px', borderRadius:9, border:'1px solid var(--border)', fontFamily:'DM Sans,sans-serif' }} />
                <button className="btn-primary" style={{ padding:'7px 14px', fontSize:11 }} onClick={handleAddFolder} disabled={!fldLabel.trim()}>Add</button>
                <button className="btn-ghost" style={{ padding:'7px 12px', fontSize:11 }} onClick={() => { setAddingFld(false); setFldLabel('') }}>Cancel</button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Quick Links (Google Drive shortcuts) ───────────────────────
function QuickLinks() {
  const [links,   setLinks_]  = useState([])
  const [adding,  setAdding]  = useState(false)
  const [name,    setName]    = useState('')
  const [url,     setUrl]     = useState('')
  const [emoji,   setEmoji]   = useState('📄')
  const EMOJIS = ['📄','📊','📝','📈','🖼️','📁','🔗','📚','🧪','📋','🎯','💡']

  useEffect(() => { getQuickLinks().then(setLinks_) }, [])

  const save = async () => {
    if (!name.trim() || !url.trim()) return
    const next = [...links, { id:uid(), name:name.trim(), url:url.trim(), emoji }]
    setLinks_(next); await setQuickLinks(next)
    setName(''); setUrl(''); setEmoji('📄'); setAdding(false)
  }

  const del = async (id) => {
    const next = links.filter(l => l.id !== id)
    setLinks_(next); await setQuickLinks(next)
  }

  return (
    <div style={{ background:'white', borderRadius:14, border:'1px solid var(--border)', padding:'14px 16px', marginBottom:20 }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10 }}>
        <div>
          <div className="serif" style={{ fontSize:15, fontWeight:600, color:'var(--text)' }}>Quick Links</div>
          <div style={{ fontSize:11, color:'var(--muted)' }}>Google Drive files, Canvas, or any URL</div>
        </div>
        <button onClick={() => setAdding(o=>!o)}
          style={{ fontSize:11, padding:'5px 12px', borderRadius:9, border:'1px solid var(--border)', background:'white', cursor:'pointer', fontFamily:'DM Sans,sans-serif', color:'var(--forest)', fontWeight:600 }}>
          {adding ? 'Cancel' : '+ Add Link'}
        </button>
      </div>

      {adding && (
        <div style={{ background:'#F7F9F5', borderRadius:10, padding:'12px', marginBottom:10 }}>
          <div style={{ display:'flex', gap:6, marginBottom:8, flexWrap:'wrap', alignItems:'center' }}>
            {EMOJIS.map(e => (
              <button key={e} onClick={() => setEmoji(e)}
                style={{ fontSize:16, background:emoji===e?'var(--forest)':'none', border:'none', borderRadius:6, padding:'2px 5px', cursor:'pointer', opacity:emoji===e?1:.5 }}>{e}</button>
            ))}
          </div>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="Label (e.g. BIOL 505 Slides)"
            style={{ width:'100%', fontSize:12, padding:'7px 10px', borderRadius:8, border:'1px solid var(--border)', marginBottom:7, fontFamily:'DM Sans,sans-serif', outline:'none' }} />
          <input value={url} onChange={e => setUrl(e.target.value)} placeholder="Paste Google Drive or Canvas link…"
            onKeyDown={e => e.key==='Enter' && save()}
            style={{ width:'100%', fontSize:12, padding:'7px 10px', borderRadius:8, border:'1px solid var(--border)', marginBottom:8, fontFamily:'DM Sans,sans-serif', outline:'none' }} />
          <button onClick={save} disabled={!name.trim()||!url.trim()}
            style={{ padding:'7px 16px', borderRadius:9, border:'none', background:'var(--forest)', color:'var(--green-light)', cursor:'pointer', fontFamily:'DM Sans,sans-serif', fontWeight:600, fontSize:12 }}>
            Save Link
          </button>
        </div>
      )}

      {links.length === 0 && !adding && (
        <div style={{ fontSize:12, color:'var(--muted)', fontStyle:'italic' }}>No links yet. Add a Google Drive folder, Canvas page, or any useful URL.</div>
      )}

      <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
        {links.map(l => (
          <div key={l.id} style={{ display:'flex', alignItems:'center', gap:0, background:'#F7F9F5', borderRadius:9, border:'1px solid var(--border)', overflow:'hidden' }}>
            <a href={l.url} target="_blank" rel="noreferrer"
              style={{ display:'flex', alignItems:'center', gap:7, padding:'8px 12px', textDecoration:'none', color:'var(--forest)', fontSize:12, fontWeight:600, fontFamily:'DM Sans,sans-serif' }}>
              <span style={{ fontSize:16 }}>{l.emoji}</span> {l.name}
            </a>
            <button onClick={() => del(l.id)} style={{ background:'none', border:'none', borderLeft:'1px solid var(--border)', cursor:'pointer', color:'#D1D5DB', padding:'8px 8px', fontSize:13, height:'100%' }}>✕</button>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Main ───────────────────────────────────────────────────────
export default function Study() {
  const [classes, setClasses]  = useState([])
  const [loading, setLoading]  = useState(true)
  const [addingCls, setAddingCls] = useState(false)
  const [clsName,   setClsName]   = useState('')
  const [clsCode,   setClsCode]   = useState('')

  useEffect(() => { getClasses().then(c => { setClasses(c); setLoading(false) }) }, [])

  const handleAddClass = async () => {
    if (!clsName.trim()) return
    const created = await addClass({ name:clsName.trim(), code:clsCode.trim(), sort_order:classes.length })
    setClasses(prev => [...prev, created])
    setClsName(''); setClsCode(''); setAddingCls(false)
  }

  if (loading) return <div style={{ padding:20, color:'var(--muted)', fontSize:13 }}>Loading…</div>

  return (
    <div>
      <div className="page-title">Study Materials</div>
      <div className="page-sub">Classes → Folders → Files & Flashcards</div>

      <QuickLinks />

      {classes.length===0 && !addingCls && (
        <div style={{ background:'white', borderRadius:12, border:'1px solid var(--border)', padding:24, textAlign:'center', color:'var(--muted)', fontSize:13, marginBottom:14 }}>
          No classes yet. Add one below.
        </div>
      )}

      {classes.map(cls => (
        <ClassBlock key={cls.id} cls={cls} onDeleted={id => setClasses(prev => prev.filter(c => c.id!==id))} />
      ))}

      <div style={{ background:'white', borderRadius:14, border:'2px dashed var(--border)', padding:'14px 16px', marginTop:8 }}>
        {!addingCls ? (
          <button className="btn-primary" onClick={() => setAddingCls(true)}>+ Add Class</button>
        ) : (
          <div>
            <div className="section-label">New Class</div>
            <div style={{ display:'flex', gap:8, flexWrap:'wrap', marginBottom:8 }}>
              <input value={clsCode} onChange={e => setClsCode(e.target.value)} placeholder="Code (e.g. BIOL 505)"
                style={{ width:140, fontSize:12, padding:'7px 10px', borderRadius:9, border:'1px solid var(--border)', fontFamily:'DM Sans,sans-serif' }} />
              <input value={clsName} onChange={e => setClsName(e.target.value)} placeholder="Class name" autoFocus
                onKeyDown={e => e.key==='Enter' && handleAddClass()}
                style={{ flex:1, minWidth:200, fontSize:12, padding:'7px 10px', borderRadius:9, border:'1px solid var(--border)', fontFamily:'DM Sans,sans-serif' }} />
            </div>
            <div style={{ display:'flex', gap:8 }}>
              <button className="btn-primary" style={{ padding:'7px 16px', fontSize:11 }} onClick={handleAddClass} disabled={!clsName.trim()}>Create</button>
              <button className="btn-ghost"   style={{ padding:'7px 12px', fontSize:11 }} onClick={() => { setAddingCls(false); setClsName(''); setClsCode('') }}>Cancel</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
