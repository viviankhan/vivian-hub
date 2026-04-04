// src/components/Study.jsx
import { useState, useMemo } from 'react'
import { STUDY_SETS } from '../data/flashcards.js'

// ─────────────────────────────────────────────────────────────
// studyExtras shape (stored in Supabase):
// {
//   userClasses:    [{ classId, className, weeks: [...] }],
//   userWeeks:      { 'classId': [{ weekId, weekLabel, files:[], cards:[] }] },
//   userFiles:      { 'classId-weekId': [{ id, name, type, addedDate }] },
//   fileNotes:      { 'classId-weekId-fileIdentifier': string },  ← pasted content
//   hiddenBaseFiles:{ 'classId-weekId': ['filename1', ...] },
// }
// ─────────────────────────────────────────────────────────────

const EMPTY_EXTRAS = { userClasses:[], userWeeks:{}, userFiles:{}, fileNotes:{}, hiddenBaseFiles:{} }

function groupBy(arr, key) {
  const map = {}
  arr.forEach(item => { const k = item[key] || 'General'; if (!map[k]) map[k] = []; map[k].push(item) })
  return Object.entries(map)
}

// ── Flashcard modal ────────────────────────────────────────────
function FcModal({ cards, setKey, weekLabel, fcProgress, updateFcProgress, fcStudied, updateFcStudied, onClose }) {
  const [tab, setTab]         = useState('all')
  const [idx, setIdx]         = useState(0)
  const [flipped, setFlipped] = useState(false)

  const learned      = fcProgress[setKey] || {}
  const deck         = tab === 'learned'   ? cards.filter(c => learned[c.id])
                     : tab === 'unlearned' ? cards.filter(c => !learned[c.id])
                     : cards
  const card         = deck[idx] || null
  const learnedCount = cards.filter(c => learned[c.id]).length
  const pct          = cards.length ? (learnedCount / cards.length * 100) : 0

  const next    = () => { setIdx(i => (i+1) % Math.max(deck.length,1)); setFlipped(false) }
  const prev    = () => { setIdx(i => (i-1+Math.max(deck.length,1)) % Math.max(deck.length,1)); setFlipped(false) }
  const shuffle = () => { setIdx(Math.floor(Math.random() * Math.max(deck.length,1))); setFlipped(false) }

  const mark = async isLearned => {
    if (!card) return
    await updateFcProgress({ ...fcProgress, [setKey]: { ...learned, [card.id]: isLearned } })
    await updateFcStudied({ ...fcStudied, [setKey]: new Date().toISOString() })
    setIdx(i => (i+1) % Math.max(deck.length,1))
    setFlipped(false)
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
            <div className="serif" style={{ fontSize:22, color:'var(--sand)', fontWeight:600 }}>{weekLabel}</div>
            <div style={{ fontSize:11, color:'#8FA882', marginTop:2, letterSpacing:.5 }}>{cards.length} cards · {learnedCount} learned</div>
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
          <div style={{ background:'#0D1F3C', borderRadius:18, minHeight:200, display:'flex', alignItems:'center', justifyContent:'center', color:'#4A6B8A', fontSize:13 }}>No cards in this view</div>
        ) : (
          <div className="fc-card-wrap">
            <div className={`fc-card ${flipped ? 'flipped' : ''}`} style={{ background:'#0D1F3C', border:'1px solid rgba(14,158,142,.3)' }} onClick={() => setFlipped(f=>!f)}>
              <div className="fc-face">
                <div style={{ fontSize:10, letterSpacing:2, textTransform:'uppercase', color:'#0E9E8E', marginBottom:10 }}>{card.topic}</div>
                <div style={{ fontSize:11, color:'#4A6B8A', marginBottom:8 }}>#{idx+1} of {deck.length}</div>
                {card.imgSrc && <img src={card.imgSrc} alt={card.term} style={{ width:'100%', maxHeight:160, objectFit:'cover', borderRadius:10, marginBottom:12 }} />}
                <div className="fc-term">{card.term}</div>
                <div style={{ fontSize:11, color:'rgba(255,255,255,.3)', letterSpacing:1.5, textTransform:'uppercase', marginTop:16 }}>Tap to flip →</div>
              </div>
              <div className="fc-back">
                <div style={{ fontSize:10, letterSpacing:2, textTransform:'uppercase', color:'#0E9E8E', marginBottom:8 }}>{card.topic}</div>
                <div className="serif" style={{ fontSize:16, color:'#C9E4B8', marginBottom:10, fontWeight:600 }}>{card.term}</div>
                <div className="fc-def">{card.def}</div>
              </div>
            </div>
          </div>
        )}

        <div style={{ display:'flex', gap:8, justifyContent:'center', marginBottom:12, flexWrap:'wrap' }}>
          <button className="fc-ctrl-btn btn-ghost" style={{ color:'#8FA882', border:'1px solid rgba(255,255,255,.15)' }} onClick={prev}>← Prev</button>
          <button className="fc-ctrl-btn btn-ghost" style={{ color:'#8FA882', border:'1px solid rgba(255,255,255,.15)' }} onClick={shuffle}>⇌ Shuffle</button>
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

// ── File content panel ─────────────────────────────────────────
function FileContentPanel({ content, onSave, onClose }) {
  const [text, setText] = useState(content || '')
  const [saved, setSaved] = useState(false)

  const handleSave = () => {
    onSave(text)
    setSaved(true)
    setTimeout(() => setSaved(false), 1600)
  }

  return (
    <div style={{ background:'#FAFAF7', borderRadius:10, border:'1px solid var(--border)', padding:'12px 14px', marginTop:4, marginBottom:4 }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
        <span style={{ fontSize:10, color:'var(--muted)', letterSpacing:1, textTransform:'uppercase' }}>Notes / pasted content</span>
        <div style={{ display:'flex', gap:8 }}>
          <button onClick={handleSave}
            style={{ fontSize:10, padding:'3px 12px', borderRadius:8, border:'none', background: saved ? '#52B788' : 'var(--forest)', color: saved ? 'white' : 'var(--green-light)', cursor:'pointer', fontFamily:'DM Sans, sans-serif', fontWeight:600, transition:'background .2s' }}>
            {saved ? '✓ Saved' : 'Save'}
          </button>
          <button onClick={onClose}
            style={{ fontSize:10, padding:'3px 10px', borderRadius:8, border:'1px solid var(--border)', background:'transparent', color:'var(--muted)', cursor:'pointer', fontFamily:'DM Sans, sans-serif' }}>
            Close
          </button>
        </div>
      </div>
      <textarea
        value={text}
        onChange={e => setText(e.target.value)}
        placeholder={`Paste notes, key terms, or content from this file here.\n\nTo generate flashcards: paste your content, save, then start a Claude session and say "generate flashcards from my [class] [week] notes."`}
        style={{ width:'100%', minHeight:180, fontSize:12, padding:'10px 12px', borderRadius:8, border:'1px solid var(--border)', resize:'vertical', lineHeight:1.7, fontFamily:'DM Sans, sans-serif', background:'white', outline:'none' }}
        autoFocus
      />
      <div style={{ fontSize:10, color:'var(--muted)', marginTop:5 }}>
        Content saves to your cloud storage. Claude can read it during a session.
      </div>
    </div>
  )
}

// ── Single file row ────────────────────────────────────────────
function FileRow({ file, identifier, isUserFile, isBase, content, onContentSave, onDelete, onHideBase }) {
  const [expanded, setExpanded] = useState(false)
  const hasContent = !!(content && content.trim())

  return (
    <div style={{ marginBottom:5 }}>
      <div className="file-row" style={{ alignItems:'center', gap:8 }}>
        <span style={{ fontSize:15 }}>📄</span>
        <span style={{ flex:1, fontSize:12, color:'var(--text)' }}>{file.name}</span>

        {file.type && !['pdf',''].includes(file.type) && (
          <span style={{ fontSize:10, padding:'1px 6px', borderRadius:6, background:'#EDE9FE', color:'#7C3AED' }}>{file.type}</span>
        )}
        {file.addedDate && <span style={{ fontSize:10, color:'var(--muted)', whiteSpace:'nowrap' }}>{file.addedDate}</span>}

        <button
          onClick={() => setExpanded(e => !e)}
          style={{
            fontSize:10, padding:'3px 9px', borderRadius:8, whiteSpace:'nowrap',
            border:`1px solid ${hasContent ? '#86EFAC' : 'var(--border)'}`,
            background: expanded ? '#F0FDF4' : hasContent ? '#F0FDF4' : 'transparent',
            color: hasContent ? '#059669' : 'var(--muted)',
            cursor:'pointer', fontFamily:'DM Sans, sans-serif',
          }}
        >
          {expanded ? '▲ Close' : hasContent ? '📝 Notes' : '+ Notes'}
        </button>

        {isUserFile && <button onClick={onDelete} className="del-btn" title="Delete this file">✕</button>}
        {isBase      && <button onClick={onHideBase} className="del-btn" title="Hide from this week">✕</button>}
      </div>

      {expanded && (
        <FileContentPanel
          content={content}
          onSave={text => { onContentSave(text) }}
          onClose={() => setExpanded(false)}
        />
      )}
    </div>
  )
}

// ── Form helpers ───────────────────────────────────────────────
function InlineForm({ placeholder, onSave, onCancel, buttonLabel = 'Add' }) {
  const [val, setVal] = useState('')
  return (
    <div style={{ display:'flex', gap:8, padding:'10px 16px', background:'#F7F6F3', borderTop:'1px solid var(--border)' }}>
      <input value={val} onChange={e => setVal(e.target.value)} placeholder={placeholder} autoFocus
        onKeyDown={e => { if (e.key === 'Enter' && val.trim()) onSave(val.trim()); if (e.key === 'Escape') onCancel() }}
        style={{ flex:1, fontSize:12, padding:'6px 10px', borderRadius:8, border:'1px solid var(--border)' }} />
      <button className="btn-primary" style={{ padding:'6px 14px', fontSize:10 }}
        onClick={() => val.trim() && onSave(val.trim())} disabled={!val.trim()}>{buttonLabel}</button>
      <button className="btn-ghost" style={{ padding:'6px 10px', fontSize:10 }} onClick={onCancel}>Cancel</button>
    </div>
  )
}

function AddFileForm({ onSave, onCancel }) {
  const [name,  setName]  = useState('')
  const [type,  setType]  = useState('pdf')
  const [notes, setNotes] = useState('')
  return (
    <div style={{ padding:'12px 16px', background:'#F7F6F3', borderTop:'1px solid var(--border)' }}>
      <div style={{ display:'flex', gap:8, marginBottom:8, flexWrap:'wrap' }}>
        <input value={name} onChange={e => setName(e.target.value)} placeholder="filename.pdf" autoFocus
          onKeyDown={e => { if (e.key === 'Escape') onCancel() }}
          style={{ flex:1, minWidth:160, fontSize:12, padding:'6px 10px', borderRadius:8, border:'1px solid var(--border)' }} />
        <select value={type} onChange={e => setType(e.target.value)}
          style={{ fontSize:12, padding:'6px 10px', borderRadius:8, border:'1px solid var(--border)' }}>
          <option value="pdf">PDF</option>
          <option value="pptx">PPTX</option>
          <option value="docx">DOCX</option>
          <option value="notes">Notes</option>
          <option value="other">Other</option>
        </select>
      </div>
      <textarea
        value={notes} onChange={e => setNotes(e.target.value)}
        placeholder={`Paste notes, summaries, or content here — optional.\n\nTo generate flashcards later: save this, then start a Claude session and say "generate flashcards from my [class] [week] notes."`}
        style={{ width:'100%', fontSize:12, padding:'8px 10px', borderRadius:8, border:'1px solid var(--border)', resize:'vertical', minHeight:100, fontFamily:'DM Sans, sans-serif', lineHeight:1.6, marginBottom:8 }}
      />
      <div style={{ display:'flex', gap:8 }}>
        <button className="btn-primary" style={{ padding:'6px 14px', fontSize:10 }}
          onClick={() => name.trim() && onSave(name.trim(), type, notes.trim())} disabled={!name.trim()}>
          Add file
        </button>
        <button className="btn-ghost" style={{ padding:'6px 10px', fontSize:10 }} onClick={onCancel}>Cancel</button>
      </div>
    </div>
  )
}

// ── Week section ───────────────────────────────────────────────
function WeekSection({ cls, wk, setKey, isUserWeek, extras, onExtrasChange, fcProgress, fcStudied, updateFcProgress, updateFcStudied, onDeleteWeek, openModal }) {
  const [addingFile, setAddingFile] = useState(false)
  const [open, setOpen]             = useState(false)

  const fileKey         = `${cls.classId}-${wk.weekId}`
  const userFiles       = extras.userFiles[fileKey] || []
  const hiddenBaseFiles = extras.hiddenBaseFiles[fileKey] || []
  const fileNotes       = extras.fileNotes || {}

  const visibleBaseFiles = wk.files.filter(f => !hiddenBaseFiles.includes(f.name))
  const allFiles         = [...visibleBaseFiles, ...userFiles]

  const learned      = fcProgress[setKey] || {}
  const learnedCount = wk.cards.filter(c => learned[c.id]).length
  const lastStudied  = fcStudied[setKey]
  const lastStr      = lastStudied ? new Date(lastStudied).toLocaleDateString('en-US',{month:'short',day:'numeric'}) : 'Never'

  const getContent    = identifier => fileNotes[`${fileKey}-${identifier}`] || ''
  const handleSaveContent = (identifier, text) => {
    onExtrasChange({ ...extras, fileNotes: { ...fileNotes, [`${fileKey}-${identifier}`]: text } })
  }

  const handleAddFile = (name, type, notes) => {
    const fileId = 'file-'+Date.now()
    const file   = { id:fileId, name, type, addedDate:new Date().toISOString().split('T')[0] }
    const existing = extras.userFiles[fileKey] || []
    const updatedExtras = { ...extras, userFiles: { ...extras.userFiles, [fileKey]: [...existing, file] } }
    // If notes were pasted at creation time, store them immediately
    if (notes) {
      updatedExtras.fileNotes = { ...(extras.fileNotes || {}), [`${fileKey}-${fileId}`]: notes }
    }
    onExtrasChange(updatedExtras)
    setAddingFile(false)
  }

  const handleDeleteUserFile = fileId => {
    const existing = extras.userFiles[fileKey] || []
    const newNotes = { ...fileNotes }
    delete newNotes[`${fileKey}-${fileId}`]
    onExtrasChange({ ...extras, userFiles: { ...extras.userFiles, [fileKey]: existing.filter(f => f.id !== fileId) }, fileNotes: newNotes })
  }

  const handleHideBaseFile = filename => {
    if (!confirm(`Hide "${filename}" from this week?`)) return
    const existing = extras.hiddenBaseFiles[fileKey] || []
    onExtrasChange({ ...extras, hiddenBaseFiles: { ...extras.hiddenBaseFiles, [fileKey]: [...existing, filename] } })
  }

  return (
    <div style={{ borderBottom:'1px solid var(--border)' }}>
      <div className="study-week-row">
        <div style={{ flex:1, cursor:'pointer' }} onClick={() => setOpen(o => !o)}>
          <div style={{ fontSize:12, fontWeight:600, color:'var(--text)', display:'flex', alignItems:'center', gap:6 }}>
            {wk.weekLabel}
            {isUserWeek && <span style={{ fontSize:9, padding:'1px 6px', borderRadius:8, background:'#EDE9FE', color:'#7C3AED' }}>added by you</span>}
          </div>
          <div style={{ fontSize:10, color:'var(--muted)', marginTop:2 }}>
            {wk.cards.length} cards · {learnedCount}/{wk.cards.length} learned · last studied {lastStr} · {allFiles.length} file{allFiles.length !== 1 ? 's' : ''}
          </div>
        </div>
        <div style={{ display:'flex', gap:8, alignItems:'center' }}>
          {wk.cards.length > 0 && (
            <button className="study-btn" onClick={() => openModal({ cards:wk.cards, setKey, weekLabel:wk.weekLabel })}>Study ▶</button>
          )}
          {isUserWeek && (
            <button onClick={() => { if (confirm(`Delete week "${wk.weekLabel}"?`)) onDeleteWeek() }}
              style={{ background:'none', border:'none', cursor:'pointer', color:'rgba(239,68,68,.6)', fontSize:14, padding:'0 2px' }}>🗑</button>
          )}
          <span style={{ color:'var(--muted)', fontSize:11, cursor:'pointer' }} onClick={() => setOpen(o => !o)}>▾</span>
        </div>
      </div>

      {open && (
        <div style={{ padding:'12px 16px', background:'white' }}>
          {/* Files */}
          <div style={{ marginBottom:12 }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:6 }}>
              <div className="section-label" style={{ marginBottom:0 }}>Files</div>
              <button onClick={() => setAddingFile(true)}
                style={{ fontSize:10, letterSpacing:.5, textTransform:'uppercase', padding:'3px 10px', borderRadius:10, border:'1px solid var(--border)', background:'transparent', color:'#6B8060', cursor:'pointer', fontFamily:'DM Sans, sans-serif' }}>
                + Add file
              </button>
            </div>

            {allFiles.length === 0 && !addingFile && (
              <div style={{ fontSize:12, color:'var(--muted)', fontStyle:'italic', padding:'4px 0' }}>No files — add one above</div>
            )}

            {visibleBaseFiles.map((f, fi) => (
              <FileRow key={fi} file={f} identifier={f.name} isBase
                content={getContent(f.name)}
                onContentSave={text => handleSaveContent(f.name, text)}
                onHideBase={() => handleHideBaseFile(f.name)} />
            ))}

            {userFiles.map(f => (
              <FileRow key={f.id} file={f} identifier={f.id} isUserFile
                content={getContent(f.id)}
                onContentSave={text => handleSaveContent(f.id, text)}
                onDelete={() => handleDeleteUserFile(f.id)} />
            ))}

            {addingFile && <AddFileForm onSave={handleAddFile} onCancel={() => setAddingFile(false)} />}
          </div>

          {/* Cards */}
          {wk.cards.length > 0 ? (
            <div>
              <div className="section-label" style={{ marginBottom:8 }}>Cards by topic</div>
              {groupBy(wk.cards, 'topic').map(([topic, cards]) => (
                <div key={topic} style={{ marginBottom:10 }}>
                  <div style={{ fontSize:11, color:'#6B8060', fontWeight:600, marginBottom:4 }}>{topic}</div>
                  {cards.map(c => {
                    const isLearned = !!(fcProgress[setKey]?.[c.id])
                    return (
                      <div key={c.id} style={{ display:'flex', gap:8, alignItems:'center', padding:'4px 0', borderBottom:'1px solid #F5F3EF' }}>
                        <span style={{ fontSize:11, color: isLearned ? '#52B788' : '#D1D5DB' }}>{isLearned ? '✓' : '○'}</span>
                        <span style={{ fontSize:12, color: isLearned ? 'var(--muted)' : 'var(--text)', textDecoration: isLearned ? 'line-through' : 'none', flex:1 }}>{c.term}</span>
                        <span style={{ fontSize:9, color:'#B0A898' }}>{c.dateAdded}</span>
                      </div>
                    )
                  })}
                </div>
              ))}
            </div>
          ) : (
            <div style={{ fontSize:12, color:'var(--muted)', fontStyle:'italic' }}>
              No flashcards yet — paste content into a file slot and send to Claude to generate them.
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Class section ──────────────────────────────────────────────
function ClassSection({ cls, isUserClass, extras, onExtrasChange, fcProgress, fcStudied, updateFcProgress, updateFcStudied, onDeleteClass, openModal }) {
  const [open, setOpen]             = useState(false)
  const [addingWeek, setAddingWeek] = useState(false)

  const userWeeksForClass = isUserClass ? [] : (extras.userWeeks[cls.classId] || [])
  const allWeeks          = isUserClass ? cls.weeks : [...cls.weeks, ...userWeeksForClass]

  const handleAddWeek = label => {
    const weekId  = 'wk-' + Date.now()
    const newWeek = { weekId, weekLabel:label, files:[], cards:[] }
    if (isUserClass) {
      onExtrasChange({ ...extras, userClasses: extras.userClasses.map(c =>
        c.classId === cls.classId ? { ...c, weeks:[...c.weeks, newWeek] } : c
      )})
    } else {
      const existing = extras.userWeeks[cls.classId] || []
      onExtrasChange({ ...extras, userWeeks: { ...extras.userWeeks, [cls.classId]: [...existing, newWeek] } })
    }
    setAddingWeek(false)
  }

  const handleDeleteWeek = (weekId, isUserWk) => {
    if (isUserClass) {
      onExtrasChange({ ...extras, userClasses: extras.userClasses.map(c =>
        c.classId === cls.classId ? { ...c, weeks:c.weeks.filter(w => w.weekId !== weekId) } : c
      )})
    } else if (isUserWk) {
      const existing = extras.userWeeks[cls.classId] || []
      onExtrasChange({ ...extras, userWeeks: { ...extras.userWeeks, [cls.classId]: existing.filter(w => w.weekId !== weekId) } })
    }
  }

  return (
    <div style={{ marginBottom:14 }}>
      <div className="study-class-header" onClick={() => setOpen(o => !o)}>
        <div>
          <span className="serif" style={{ fontSize:18, color:'var(--sand)', fontWeight:600 }}>{cls.className}</span>
          {isUserClass && <span style={{ marginLeft:10, fontSize:10, padding:'2px 8px', borderRadius:8, background:'rgba(124,58,237,.2)', color:'#C4B5FD' }}>added by you</span>}
        </div>
        <div style={{ display:'flex', gap:10, alignItems:'center' }}>
          {isUserClass && (
            <button onClick={e => { e.stopPropagation(); if (confirm(`Delete class "${cls.className}"?`)) onDeleteClass(cls.classId) }}
              style={{ background:'none', border:'none', cursor:'pointer', color:'rgba(239,68,68,.6)', fontSize:14, padding:'0 2px' }}>🗑</button>
          )}
          <span style={{ color:'var(--green-light)', fontSize:13, transition:'transform .2s', transform: open ? 'rotate(180deg)' : '' }}>▾</span>
        </div>
      </div>

      {open && (
        <div style={{ border:'1px solid var(--border)', borderTop:'none', borderRadius:'0 0 12px 12px', overflow:'hidden' }}>
          {allWeeks.map(wk => {
            const isUserWk = isUserClass || userWeeksForClass.some(w => w.weekId === wk.weekId)
            const setKey   = cls.classId + '-' + wk.weekId
            return (
              <WeekSection key={wk.weekId} cls={cls} wk={wk} setKey={setKey}
                isUserWeek={isUserWk} extras={extras} onExtrasChange={onExtrasChange}
                fcProgress={fcProgress} fcStudied={fcStudied}
                updateFcProgress={updateFcProgress} updateFcStudied={updateFcStudied}
                onDeleteWeek={() => handleDeleteWeek(wk.weekId, isUserWk)}
                openModal={openModal} />
            )
          })}
          {addingWeek ? (
            <InlineForm placeholder="Week label (e.g. Week 3 — Reef Ecology)" onSave={handleAddWeek} onCancel={() => setAddingWeek(false)} buttonLabel="Add week" />
          ) : (
            <div style={{ padding:'10px 16px', background:'#F7F6F3', borderTop: allWeeks.length > 0 ? '1px solid var(--border)' : 'none' }}>
              <button onClick={() => setAddingWeek(true)}
                style={{ fontSize:11, padding:'5px 14px', borderRadius:10, border:'1px dashed var(--border)', background:'transparent', color:'#6B8060', cursor:'pointer', fontFamily:'DM Sans, sans-serif' }}>
                + Add week
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Main ───────────────────────────────────────────────────────
export default function Study({ fcProgress, updateFcProgress, fcStudied, updateFcStudied, studyExtras, updateStudyExtras }) {
  const [modal, setModal]             = useState(null)
  const [addingClass, setAddingClass] = useState(false)

  const extras     = studyExtras ?? EMPTY_EXTRAS
  const allClasses = useMemo(() => [...STUDY_SETS, ...(extras.userClasses || [])], [extras.userClasses])

  const handleExtrasChange = async newExtras => { await updateStudyExtras(newExtras) }

  const handleAddClass = name => {
    const classId  = 'cls-' + Date.now()
    handleExtrasChange({ ...extras, userClasses:[...(extras.userClasses||[]), { classId, className:name, weeks:[] }] })
    setAddingClass(false)
  }

  const handleDeleteClass = classId => {
    const cleanWeeks = { ...extras.userWeeks }; delete cleanWeeks[classId]
    handleExtrasChange({ ...extras, userClasses:(extras.userClasses||[]).filter(c => c.classId !== classId), userWeeks:cleanWeeks })
  }

  return (
    <div>
      <div className="page-title">Study Materials</div>
      <div className="page-sub">Tap "+ Notes" on any file to paste content · Flashcard content managed by Claude</div>

      {modal && (
        <FcModal {...modal} fcProgress={fcProgress} updateFcProgress={updateFcProgress}
          fcStudied={fcStudied} updateFcStudied={updateFcStudied} onClose={() => setModal(null)} />
      )}

      {allClasses.map(cls => {
        const isUserClass = (extras.userClasses||[]).some(c => c.classId === cls.classId)
        return (
          <ClassSection key={cls.classId} cls={cls} isUserClass={isUserClass}
            extras={extras} onExtrasChange={handleExtrasChange}
            fcProgress={fcProgress} fcStudied={fcStudied}
            updateFcProgress={updateFcProgress} updateFcStudied={updateFcStudied}
            onDeleteClass={handleDeleteClass} openModal={setModal} />
        )
      })}

      {addingClass ? (
        <div style={{ background:'white', borderRadius:12, border:'2px solid var(--forest)', overflow:'hidden' }}>
          <InlineForm placeholder="Class name (e.g. MCAT Prep)" onSave={handleAddClass}
            onCancel={() => setAddingClass(false)} buttonLabel="Add class" />
        </div>
      ) : (
        <button onClick={() => setAddingClass(true)}
          style={{ width:'100%', background:'var(--forest)', border:'none', borderRadius:12, padding:'13px 18px', cursor:'pointer', display:'flex', alignItems:'center', gap:10 }}>
          <span style={{ fontSize:18 }}>+</span>
          <span style={{ fontFamily:'DM Sans, sans-serif', fontSize:13, color:'var(--green-light)', fontWeight:600 }}>Add a class</span>
        </button>
      )}
    </div>
  )
}
