import { useState, useEffect, useCallback } from 'react'
import {
  getClasses, addClass, deleteClass,
  getWeeks, addWeek, deleteWeek,
  getFiles, uploadFile, deleteStudyFile,
} from '../lib/storage.js'

// ── File type helpers ──────────────────────────────────────────
function fileIcon(name) {
  const ext = name.split('.').pop().toLowerCase()
  if (['html','htm'].includes(ext))         return '🃏'
  if (['pdf'].includes(ext))                return '📄'
  if (['pptx','ppt'].includes(ext))         return '📊'
  if (['docx','doc'].includes(ext))         return '📝'
  if (['xlsx','xls','csv'].includes(ext))   return '📈'
  if (['jpg','jpeg','png','gif'].includes(ext)) return '🖼️'
  if (['json'].includes(ext))               return '🗂️'
  return '📎'
}

function fileAction(name) {
  const ext = name.split('.').pop().toLowerCase()
  // HTML opens in new tab and runs natively (flashcard app, etc)
  if (['html','htm'].includes(ext)) return { label:'Open', newTab:true }
  // PDF opens inline in browser
  if (['pdf'].includes(ext))        return { label:'Open',     newTab:true }
  // Everything else downloads
  return { label:'Download', newTab:false }
}

function fileSizeLabel(kb) {
  if (!kb) return ''
  if (kb < 1024) return `${kb} KB`
  return `${(kb/1024).toFixed(1)} MB`
}

// ── File row ───────────────────────────────────────────────────
function FileRow({ f, onDelete }) {
  const action = fileAction(f.file_name)
  return (
    <div style={{ display:'flex', gap:10, alignItems:'center', padding:'9px 12px', borderRadius:9, border:'1px solid var(--border)', marginBottom:6, background:'white' }}>
      <span style={{ fontSize:18, flexShrink:0 }}>{fileIcon(f.file_name)}</span>
      <div style={{ flex:1, minWidth:0 }}>
        <div style={{ fontSize:13, fontWeight:500, color:'var(--text)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{f.file_name}</div>
        <div style={{ fontSize:10, color:'var(--muted)', marginTop:1 }}>{fileSizeLabel(f.file_size)}{f.added_date ? ` · ${f.added_date}` : ''}</div>
      </div>
      {f.file_url ? (
        <a href={f.file_url} target={action.newTab ? '_blank' : '_self'} download={action.newTab ? undefined : f.file_name} rel="noreferrer"
          style={{ fontSize:11, padding:'5px 12px', borderRadius:8, border:'1px solid var(--forest)', color:'var(--forest)', textDecoration:'none', background:'var(--bg)', fontFamily:'DM Sans,sans-serif', fontWeight:600, flexShrink:0 }}>
          {action.label}
        </a>
      ) : (
        <span style={{ fontSize:11, color:'var(--muted)', flexShrink:0 }}>No URL</span>
      )}
      <button onClick={() => onDelete(f)} style={{ background:'none', border:'none', cursor:'pointer', color:'#D1D5DB', fontSize:16, padding:'0 2px', flexShrink:0 }}>✕</button>
    </div>
  )
}

// ── Folder row ─────────────────────────────────────────────────
function FolderRow({ folder, classId, depth=0, onDeleted }) {
  const [open,      setOpen]      = useState(false)
  const [files,     setFiles]     = useState([])
  const [subfolders,setSubfolders]= useState([])
  const [loading,   setLoading]   = useState(false)
  const [uploading, setUploading] = useState(false)
  const [addingSub, setAddingSub] = useState(false)
  const [subLabel,  setSubLabel]  = useState('')
  const [uploadMsg, setUploadMsg] = useState('')

  const load = useCallback(async () => {
    if (loading) return
    setLoading(true)
    const [f, subs] = await Promise.all([
      getFiles(folder.id),
      depth === 0 ? getWeeks(classId, folder.id) : Promise.resolve([]),
    ])
    setFiles(f); setSubfolders(subs); setLoading(false)
  }, [folder.id, classId, depth])

  const toggle = () => { if (!open) load(); setOpen(o=>!o) }

  const handleUpload = async (e) => {
    const file = e.target.files[0]; if (!file) return
    setUploading(true); setUploadMsg('')
    try {
      const saved = await uploadFile(folder.id, file)
      setFiles(prev => [...prev, saved])
      setUploadMsg(`✓ Uploaded ${file.name}`)
      setTimeout(() => setUploadMsg(''), 3000)
    } catch(err) {
      setUploadMsg('Upload failed: ' + err.message)
    }
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
    if (!confirm(`Delete "${folder.week_label}" and all its files?`)) return
    await deleteWeek(folder.id, classId)
    onDeleted(folder.id)
  }

  const indent = depth * 14

  return (
    <div style={{ borderBottom: depth===0 ? '1px solid var(--border)' : 'none' }}>
      {/* Header */}
      <div style={{ background:depth===0?'#F7F6F3':'#F0EFF8', padding:`9px 14px 9px ${14+indent}px`, display:'flex', justifyContent:'space-between', alignItems:'center', cursor:'pointer' }}
        onClick={toggle}>
        <div style={{ flex:1 }}>
          {depth > 0 && <span style={{ color:'var(--muted)', marginRight:6, fontSize:11 }}>└</span>}
          <span style={{ fontSize:depth===0?13:12, fontWeight:600, color:'var(--text)' }}>📁 {folder.week_label}</span>
          <div style={{ fontSize:10, color:'var(--muted)', marginTop:1, paddingLeft:depth>0?14:0 }}>
            {loading ? 'Loading…' : `${files.length} file${files.length!==1?'s':''}`}
          </div>
        </div>
        <span style={{ fontSize:11, color:'var(--muted)' }}>{open?'▴':'▾'}</span>
      </div>

      {open && (
        <div style={{ paddingLeft:indent, background:'white', borderTop:'1px solid #F0EFF8' }}>
          {/* Sub-folders */}
          {subfolders.map(sub => (
            <FolderRow key={sub.id} folder={sub} classId={classId} depth={depth+1}
              onDeleted={id => setSubfolders(prev => prev.filter(s => s.id!==id))} />
          ))}

          <div style={{ padding:'12px 14px' }}>
            {/* Files */}
            {files.length===0 && !uploading && (
              <div style={{ fontSize:12, color:'var(--muted)', fontStyle:'italic', marginBottom:10 }}>No files yet — upload below.</div>
            )}
            {files.map(f => <FileRow key={f.id} f={f} onDelete={handleDelFile} />)}

            {/* Upload */}
            <div style={{ display:'flex', gap:8, alignItems:'center', flexWrap:'wrap', marginTop:6 }}>
              <label style={{ cursor:'pointer' }}>
                <span className="study-btn" style={{ fontSize:11, padding:'5px 12px', background:'var(--forest)', display:'inline-block' }}>
                  {uploading ? 'Uploading…' : '↑ Upload file'}
                </span>
                <input type="file" style={{ display:'none' }} onChange={handleUpload} disabled={uploading}
                  accept=".html,.htm,.pdf,.pptx,.ppt,.docx,.doc,.xlsx,.xls,.csv,.json,.png,.jpg,.jpeg,.gif" />
              </label>
              {uploadMsg && <span style={{ fontSize:11, color: uploadMsg.startsWith('✓') ? '#059669' : '#EF4444' }}>{uploadMsg}</span>}
            </div>

            {/* Sub-folder + delete */}
            <div style={{ borderTop:'1px solid #F5F3EF', paddingTop:10, marginTop:10, display:'flex', gap:8, flexWrap:'wrap', alignItems:'center' }}>
              {depth===0 && !addingSub && (
                <button className="study-btn" style={{ fontSize:10, padding:'4px 10px' }} onClick={() => setAddingSub(true)}>+ Sub-folder</button>
              )}
              {depth===0 && addingSub && (
                <>
                  <input value={subLabel} onChange={e => setSubLabel(e.target.value)} placeholder="Sub-folder name…" autoFocus
                    onKeyDown={e => e.key==='Enter' && handleAddSub()}
                    style={{ flex:1, minWidth:140, fontSize:12, padding:'5px 9px', borderRadius:8, border:'1px solid var(--border)', fontFamily:'DM Sans,sans-serif' }} />
                  <button className="btn-primary" style={{ padding:'5px 12px', fontSize:11 }} onClick={handleAddSub}>Add</button>
                  <button className="btn-ghost"   style={{ padding:'5px 9px',  fontSize:11 }} onClick={() => { setAddingSub(false); setSubLabel('') }}>Cancel</button>
                </>
              )}
              <button className="btn-danger" style={{ fontSize:10, padding:'4px 10px' }} onClick={handleDel}>Delete folder</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Class block ────────────────────────────────────────────────
function ClassBlock({ cls, onDeleted }) {
  const [open,      setOpen]     = useState(false)
  const [folders,   setFolders]  = useState([])
  const [addingFld, setAddingFld]= useState(false)
  const [fldLabel,  setFldLabel] = useState('')

  const load = useCallback(async () => {
    const w = await getWeeks(cls.id, null)
    setFolders(w)
  }, [cls.id])

  const toggle = () => { if (!open) load(); setOpen(o=>!o) }

  const handleAddFolder = async () => {
    if (!fldLabel.trim()) return
    const created = await addWeek({ class_id:cls.id, parent_id:null, week_number:folders.length+1, week_label:fldLabel.trim(), sort_order:folders.length })
    setFolders(prev => [...prev, created])
    setFldLabel(''); setAddingFld(false)
  }

  const handleDelClass = async () => {
    if (!confirm(`Delete "${cls.name}" and everything in it?`)) return
    await deleteClass(cls.id)
    onDeleted(cls.id)
  }

  return (
    <div style={{ marginBottom:12 }}>
      <div style={{ background:'var(--forest)', borderRadius:open?'12px 12px 0 0':12, padding:'13px 18px', display:'flex', justifyContent:'space-between', alignItems:'center', cursor:'pointer' }} onClick={toggle}>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          {cls.code && <span style={{ fontSize:10, letterSpacing:2, textTransform:'uppercase', color:'var(--green-mid)' }}>{cls.code}</span>}
          <span className="serif" style={{ fontSize:17, color:'var(--sand)', fontWeight:600 }}>{cls.name}</span>
        </div>
        <span style={{ color:'var(--green-light)', fontSize:13, transition:'transform .2s', transform:open?'rotate(180deg)':'' }}>▾</span>
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
                <button className="btn-danger" style={{ fontSize:10, padding:'4px 12px' }} onClick={handleDelClass}>Delete class</button>
              </div>
            ) : (
              <div style={{ display:'flex', gap:8, flexWrap:'wrap', alignItems:'center' }}>
                <input value={fldLabel} onChange={e => setFldLabel(e.target.value)} placeholder="Folder name (e.g. Week 1 — Reef ID)" autoFocus
                  onKeyDown={e => e.key==='Enter' && handleAddFolder()}
                  style={{ flex:1, minWidth:200, fontSize:12, padding:'7px 10px', borderRadius:9, border:'1px solid var(--border)', fontFamily:'DM Sans,sans-serif' }} />
                <button className="btn-primary" style={{ padding:'7px 14px', fontSize:11 }} onClick={handleAddFolder} disabled={!fldLabel.trim()}>Add</button>
                <button className="btn-ghost"   style={{ padding:'7px 12px', fontSize:11 }} onClick={() => { setAddingFld(false); setFldLabel('') }}>Cancel</button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Main ───────────────────────────────────────────────────────
export default function Study() {
  const [classes,   setClasses]  = useState([])
  const [loading,   setLoading]  = useState(true)
  const [addingCls, setAddingCls]= useState(false)
  const [clsName,   setClsName]  = useState('')
  const [clsCode,   setClsCode]  = useState('')

  useEffect(() => {
    getClasses().then(c => { setClasses(c); setLoading(false) })
  }, [])

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
      <div className="page-sub">Classes → Folders → Files · Upload anything and open it here</div>

      <div style={{ background:'#F0F9F8', border:'1px solid #B2DFDB', borderRadius:12, padding:'11px 16px', marginBottom:20, fontSize:12, color:'#004D40', lineHeight:1.6 }}>
        Upload <strong>HTML flashcard files</strong> to open them directly in the browser. Upload <strong>PDFs</strong> to view inline. Upload <strong>PPT / Word</strong> files to download and open in their app.
      </div>

      {classes.length===0 && !addingCls && (
        <div style={{ background:'white', borderRadius:12, border:'1px solid var(--border)', padding:24, textAlign:'center', color:'var(--muted)', fontSize:13, marginBottom:14 }}>
          No classes yet. Add one below to get started.
        </div>
      )}

      {classes.map(cls => (
        <ClassBlock key={cls.id} cls={cls}
          onDeleted={id => setClasses(prev => prev.filter(c => c.id!==id))} />
      ))}

      {/* Add class */}
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
