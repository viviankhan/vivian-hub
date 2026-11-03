// src/components/MedCare.jsx
// ─────────────────────────────────────────────────────────────
// The two places medications get extra care:
//
//   • <MedSkipSheet> — un-tick a med and this asks, gently, how you're doing
//     and whether there's anything to note ("ran out", "felt sick"). It's
//     filed as that day's note on the med, marked skipped, with your mood.
//   • <MedAlerts> — anything you wrote that reads like a med problem ("ran out
//     of Lexapro", "need a refill") stays pinned at the top of Today until you
//     say it's handled.
// ─────────────────────────────────────────────────────────────
import { useEffect, useState } from 'react'
import { MOODS } from '../lib/wellness.js'
import { loadLifelog, snapshot, medAlerts, clearMedAlert, setDayNote, getDayNote } from '../lib/lifelog.js'
import { useLifelogVersion } from './DayNote.jsx'

export const MED_SKIPPED_EVENT = 'bloom-med-skipped'
export function announceMedSkip(detail) {
  try { window.dispatchEvent(new CustomEvent(MED_SKIPPED_EVENT, { detail })) } catch {}
}

export function MedSkipSheet() {
  const [skip, setSkip] = useState(null)   // { taskId, date, title }
  const [mood, setMood] = useState(null)
  const [text, setText] = useState('')
  useEffect(() => {
    const h = (e) => {
      const d = e.detail || {}
      if (!d.taskId || !d.date) return
      setSkip(d); setMood(null); setText('')
      getDayNote(d.date, d.taskId).then(n => { if (n) { setMood(n.mood || null); setText(n.text || '') } }).catch(() => {})
    }
    window.addEventListener(MED_SKIPPED_EVENT, h)
    return () => window.removeEventListener(MED_SKIPPED_EVENT, h)
  }, [])
  if (!skip) return null
  const close = () => setSkip(null)
  const save = () => {
    setDayNote(skip.date, skip.taskId, { skipped: true, mood, text: text.trim() }, { title: skip.title }).catch(() => {})
    close()
  }
  const justMark = () => { setDayNote(skip.date, skip.taskId, { skipped: true }, { title: skip.title }).catch(() => {}); close() }
  return (
    <div onClick={justMark} style={{ position:'fixed', inset:0, background:'rgba(20,28,38,.45)', zIndex:700, display:'flex', alignItems:'flex-end', justifyContent:'center' }}>
      <div onClick={e => e.stopPropagation()} data-testid="med-skip-sheet"
        style={{ background:'#F7F6FA', borderRadius:'22px 22px 0 0', width:'100%', maxWidth:480, padding:'18px 16px calc(20px + env(safe-area-inset-bottom))', boxShadow:'0 -10px 44px rgba(20,40,60,.28)' }}>
        <div style={{ fontSize:11, letterSpacing:1.3, textTransform:'uppercase', color:'var(--muted)', fontWeight:700 }}>💊 Skipped {skip.title || 'your med'}</div>
        <div style={{ fontSize:18, fontWeight:800, color:'var(--text)', marginTop:6, fontFamily:'DM Sans,sans-serif' }}>How are you doing?</div>
        <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginTop:12 }}>
          {MOODS.map(m => (
            <button key={m.v} type="button" onClick={() => setMood(mood === m.v ? null : m.v)} aria-pressed={mood === m.v}
              style={{ padding:'8px 13px', borderRadius:16, fontSize:13, fontWeight:600, cursor:'pointer', fontFamily:'DM Sans,sans-serif',
                border: mood === m.v ? '1px solid transparent' : '1px solid var(--border)', background: mood === m.v ? m.color : 'white', color:'var(--text)' }}>{m.label}</button>
          ))}
        </div>
        <textarea value={text} onChange={e => setText(e.target.value)} rows={3}
          placeholder="Anything to note? e.g. ran out, forgot, felt sick, skipped on purpose…"
          style={{ width:'100%', marginTop:12, fontSize:14, padding:'10px 12px', borderRadius:12, border:'1px solid var(--border)', fontFamily:'DM Sans,sans-serif', outline:'none', lineHeight:1.5, background:'white', color:'var(--text)', boxSizing:'border-box', resize:'vertical' }} />
        <div style={{ display:'flex', gap:8, marginTop:12 }}>
          <button type="button" onClick={justMark}
            style={{ flex:1, padding:'12px', borderRadius:14, border:'1px solid var(--border)', background:'white', color:'var(--muted)', fontFamily:'DM Sans,sans-serif', fontWeight:700, fontSize:14, cursor:'pointer' }}>Not now</button>
          <button type="button" onClick={save}
            style={{ flex:2, padding:'12px', borderRadius:14, border:'none', background:'var(--forest)', color:'var(--green-light)', fontFamily:'DM Sans,sans-serif', fontWeight:700, fontSize:14, cursor:'pointer' }}>Save</button>
        </div>
      </div>
    </div>
  )
}

export function MedAlerts() {
  useLifelogVersion()
  const [ready, setReady] = useState(false)
  useEffect(() => { loadLifelog().then(() => setReady(true)).catch(() => {}) }, [])
  if (!ready) return null
  const alerts = medAlerts(snapshot())
  if (!alerts.length) return null
  return (
    <div data-testid="med-alerts" style={{ margin:'0 0 12px', display:'flex', flexDirection:'column', gap:8 }}>
      {alerts.slice(0, 3).map(a => (
        <div key={a.id} style={{ display:'flex', gap:10, alignItems:'flex-start', background:'#FFF4E5', border:'1px solid #F5C98B', borderRadius:14, padding:'10px 12px' }}>
          <span aria-hidden="true" style={{ fontSize:16, lineHeight:1.3 }}>💊</span>
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ fontSize:13.5, color:'#5B3A0E', fontWeight:600, lineHeight:1.4, wordBreak:'break-word' }}>{a.text}</div>
            <div style={{ fontSize:11, color:'#8A6A3A', marginTop:2 }}>
              {a.title} · {new Date(a.at).toLocaleDateString('en-US', { weekday:'short', month:'short', day:'numeric' })}
            </div>
          </div>
          <button type="button" onClick={() => clearMedAlert(a.id)}
            style={{ border:'1px solid #E8B36B', background:'white', color:'#8A5A12', borderRadius:10, padding:'5px 10px', fontSize:12, fontWeight:700, cursor:'pointer', fontFamily:'DM Sans,sans-serif', flexShrink:0 }}>Handled</button>
        </div>
      ))}
      {alerts.length > 3 && <div style={{ fontSize:11, color:'#8A6A3A' }}>+{alerts.length - 3} more — ask ✨ “what med problems have I noted?”</div>}
    </div>
  )
}
