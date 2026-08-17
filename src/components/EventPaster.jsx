// src/components/EventPaster.jsx
// The "paste an event → task" sheet. You drop in any text describing something
// to do; it's sent to the parse-event function (Gemini) and comes back as a
// draft, which the parent opens in the normal Add sheet for review before saving.
import { useState } from 'react'
import { parseEventText } from '../lib/parseEvent.js'

export default function EventPaster({ categories = [], onDraft, onClose }) {
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr]   = useState('')

  const run = async () => {
    const t = text.trim()
    if (!t || busy) return
    setBusy(true); setErr('')
    try {
      const draft = await parseEventText(t, categories)
      onDraft(draft)                 // parent closes this and opens the Add sheet
    } catch (e) {
      setErr((e && e.message) || 'Something went wrong reading that.')
      setBusy(false)
    }
  }

  return (
    <div onClick={busy ? undefined : onClose}
      style={{ position:'fixed', inset:0, background:'rgba(20,28,38,.5)', zIndex:640, display:'flex', alignItems:'flex-end', justifyContent:'center' }}>
      <div onClick={e => e.stopPropagation()}
        style={{ background:'#F3F2F6', borderRadius:'22px 22px 0 0', width:'100%', maxWidth:480, maxHeight:'92vh', overflowY:'auto', boxShadow:'0 -10px 44px rgba(20,40,60,.28)' }}>
        {/* Header band */}
        <div style={{ background:'linear-gradient(135deg,#7BBFD4,#C8BFDF)', padding:'16px 18px 20px' }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
            <span style={{ fontSize:11, letterSpacing:1.5, textTransform:'uppercase', color:'rgba(0,0,0,.55)', fontWeight:700 }}>Paste to schedule</span>
            <button onClick={onClose} aria-label="Close"
              style={{ width:32, height:32, borderRadius:'50%', border:'none', background:'rgba(255,255,255,.4)', color:'#17313f', fontSize:15, cursor:'pointer' }}>✕</button>
          </div>
          <div style={{ fontSize:20, fontWeight:800, color:'#17313f', marginTop:8, fontFamily:'DM Sans,sans-serif' }}>✨ Turn text into a task</div>
          <div style={{ fontSize:12.5, color:'rgba(0,0,0,.62)', marginTop:4, lineHeight:1.5 }}>
            Paste an email, a flyer, a message — anything describing an event. It’ll be read into a task you can review before saving.
          </div>
        </div>

        <div style={{ padding:'16px 14px calc(20px + env(safe-area-inset-bottom))' }}>
          <textarea value={text} onChange={e => setText(e.target.value)} autoFocus
            placeholder={"e.g. Dentist cleaning next Tuesday at 3pm at Dr. Lee’s on 4th St. Bring insurance card, arrive 10 minutes early."}
            style={{ width:'100%', fontSize:14, padding:'12px 14px', borderRadius:12, border:'1px solid var(--border)', fontFamily:'DM Sans,sans-serif', outline:'none', lineHeight:1.55, resize:'vertical', minHeight:150, background:'white', color:'var(--text)', boxSizing:'border-box' }} />

          {err && (
            <div style={{ fontSize:12, color:'#B42318', background:'#FEF3F2', border:'1px solid #FECDCA', borderRadius:10, padding:'9px 12px', marginTop:10, lineHeight:1.45 }}>{err}</div>
          )}

          <button onClick={run} disabled={!text.trim() || busy}
            style={{ width:'100%', marginTop:12, padding:'14px', borderRadius:14, border:'none',
              background: (!text.trim() || busy) ? '#E1E1E6' : 'var(--forest)',
              color: (!text.trim() || busy) ? '#9CA3AF' : 'var(--green-light)',
              cursor: (!text.trim() || busy) ? 'default' : 'pointer', fontFamily:'DM Sans,sans-serif', fontWeight:700, fontSize:15,
              display:'flex', alignItems:'center', justifyContent:'center', gap:8 }}>
            {busy ? 'Reading…' : 'Read it into a task'}
          </button>
          <div style={{ fontSize:10.5, color:'var(--muted)', marginTop:10, textAlign:'center', lineHeight:1.5 }}>
            Uses a free AI model — your text is sent to Google Gemini to structure it. Nothing is saved until you review and tap Save.
          </div>
        </div>
      </div>
    </div>
  )
}
