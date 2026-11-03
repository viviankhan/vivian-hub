// src/components/Journal.jsx
// ─────────────────────────────────────────────────────────────
// The thought journal: a quick place to put down whatever's on your mind. Each
// entry is stamped with the time you wrote it and where you were, and can
// carry a mood and photos. Entries feed Informatics and the ✨ assistant
// ("what was I thinking about at work this week?").
// ─────────────────────────────────────────────────────────────
import { useEffect, useState } from 'react'
import { getJournal, addJournalEntry, deleteJournalEntry, placeNow } from '../lib/lifelog.js'
import { MOODS, moodMeta } from '../lib/wellness.js'
import { savePhotos } from '../lib/photos.js'
import { PhotoPicker, PhotoStrip } from './PhotoAttach.jsx'
import { useLifelogVersion } from './DayNote.jsx'

export function fmtStamp(iso) {
  const d = new Date(iso)
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const day = new Date(d); day.setHours(0, 0, 0, 0)
  const diff = Math.round((today - day) / 86400000)
  const t = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  if (diff === 0) return `Today ${t}`
  if (diff === 1) return `Yesterday ${t}`
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) + ' ' + t
}

export default function Journal({ onClose }) {
  const v = useLifelogVersion()
  const [entries, setEntries] = useState([])
  const [text, setText] = useState('')
  const [mood, setMood] = useState(null)
  const [photos, setPhotos] = useState([])   // data URLs until saved
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [confirmDel, setConfirmDel] = useState(null)
  const where = placeNow()

  useEffect(() => { getJournal().then(j => setEntries(j || [])).catch(() => {}) }, [v])

  const canSave = !!text.trim() || photos.length > 0
  const save = async () => {
    if (!canSave || busy) return
    setBusy(true); setErr('')
    try {
      const ids = photos.length ? savePhotos(photos) : []
      await addJournalEntry({ text, photos: ids, mood })
      setText(''); setMood(null); setPhotos([])
    } catch (e) {
      setErr('Couldn’t save that — check your connection and try again.')
    } finally { setBusy(false) }
  }

  return (
    <div onClick={onClose} style={{ position:'fixed', inset:0, background:'rgba(20,28,38,.5)', zIndex:640, display:'flex', alignItems:'flex-end', justifyContent:'center' }}>
      <div onClick={e => e.stopPropagation()} data-testid="journal-sheet"
        style={{ background:'#F6F4EE', borderRadius:'22px 22px 0 0', width:'100%', maxWidth:480, maxHeight:'92vh', overflowY:'auto', boxShadow:'0 -10px 44px rgba(20,40,60,.28)' }}>
        <div style={{ background:'linear-gradient(135deg,#F3D9A4,#E9C7D6)', padding:'16px 18px 18px' }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
            <span style={{ fontSize:11, letterSpacing:1.5, textTransform:'uppercase', color:'rgba(0,0,0,.55)', fontWeight:700 }}>Thought journal</span>
            <button onClick={onClose} aria-label="Close"
              style={{ width:32, height:32, borderRadius:'50%', border:'none', background:'rgba(255,255,255,.45)', color:'#3b2a17', fontSize:15, cursor:'pointer' }}>✕</button>
          </div>
          <div style={{ fontSize:20, fontWeight:800, color:'#3b2a17', marginTop:8, fontFamily:'DM Sans,sans-serif' }}>💭 What’s on your mind?</div>
          <div style={{ fontSize:12, color:'rgba(0,0,0,.6)', marginTop:4 }}>
            Stamped {new Date().toLocaleTimeString('en-US', { hour:'numeric', minute:'2-digit' })}{where ? ` · at ${where}` : ''}
          </div>
        </div>

        <div style={{ padding:'14px 14px calc(20px + env(safe-area-inset-bottom))' }}>
          <textarea value={text} onChange={e => setText(e.target.value)} autoFocus rows={4}
            placeholder="Anything at all. Nobody else sees this."
            style={{ width:'100%', fontSize:15, padding:'12px 14px', borderRadius:12, border:'1px solid var(--border)', fontFamily:'DM Sans,sans-serif', outline:'none', lineHeight:1.55, resize:'vertical', background:'white', color:'var(--text)', boxSizing:'border-box' }} />
          <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginTop:10 }} role="group" aria-label="Mood (optional)">
            {MOODS.map(m => (
              <button key={m.v} type="button" onClick={() => setMood(mood === m.v ? null : m.v)} aria-pressed={mood === m.v}
                style={{ padding:'6px 12px', borderRadius:14, fontSize:12.5, fontWeight:600, cursor:'pointer', fontFamily:'DM Sans,sans-serif',
                  border: mood === m.v ? '1px solid transparent' : '1px solid var(--border)', background: mood === m.v ? m.color : 'white', color:'var(--text)' }}>{m.label}</button>
            ))}
          </div>
          <div style={{ marginTop:10 }}><PhotoPicker photos={photos} onChange={setPhotos} /></div>
          {err && <div style={{ fontSize:12, color:'#B42318', marginTop:8 }}>{err}</div>}
          <button onClick={save} disabled={!canSave || busy} data-testid="journal-save"
            style={{ width:'100%', marginTop:12, padding:'13px', borderRadius:14, border:'none',
              background: canSave ? 'var(--forest)' : '#E1E1E6', color: canSave ? 'var(--green-light)' : '#9CA3AF',
              cursor: canSave ? 'pointer' : 'default', fontFamily:'DM Sans,sans-serif', fontWeight:700, fontSize:15 }}>
            {busy ? 'Saving…' : 'Save thought'}
          </button>

          {entries.length > 0 && (
            <div style={{ marginTop:20 }}>
              <div style={{ fontSize:11, letterSpacing:1.2, textTransform:'uppercase', color:'var(--muted)', fontWeight:700, marginBottom:8 }}>Recent</div>
              {entries.slice(0, 30).map(j => (
                <div key={j.id} data-testid="journal-entry" style={{ background:'white', border:'1px solid var(--border)', borderRadius:12, padding:'10px 12px', marginBottom:8 }}>
                  <div style={{ display:'flex', justifyContent:'space-between', gap:8, fontSize:11, color:'var(--muted)' }}>
                    <span>{fmtStamp(j.at)}{j.place ? ` · ${j.place}` : ''}{j.mood ? ` · ${moodMeta(j.mood).label}` : ''}</span>
                    {confirmDel === j.id ? (
                      <span style={{ display:'inline-flex', gap:8 }}>
                        <button onClick={() => setConfirmDel(null)} style={{ border:'none', background:'none', color:'var(--muted)', fontSize:11, cursor:'pointer', padding:0 }}>Keep</button>
                        <button onClick={() => { deleteJournalEntry(j.id); setConfirmDel(null) }} style={{ border:'none', background:'none', color:'#B42318', fontSize:11, fontWeight:700, cursor:'pointer', padding:0 }}>Delete</button>
                      </span>
                    ) : (
                      <button onClick={() => setConfirmDel(j.id)} aria-label="Delete thought" style={{ border:'none', background:'none', color:'#B8BEC6', fontSize:12, cursor:'pointer', padding:0 }}>✕</button>
                    )}
                  </div>
                  {j.text && <div style={{ fontSize:14, color:'var(--text)', lineHeight:1.5, marginTop:4, whiteSpace:'pre-wrap', wordBreak:'break-word' }}>{j.text}</div>}
                  {j.photos?.length > 0 && <div style={{ marginTop:6 }}><PhotoStrip ids={j.photos} /></div>}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
