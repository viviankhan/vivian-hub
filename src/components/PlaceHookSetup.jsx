// src/components/PlaceHookSetup.jsx
// The "iPhone automation" panel under a location's Start-on-arrival toggle:
// the two links a Shortcuts automation opens when you arrive at or leave the
// place, so the item starts and ends on when you were really there, even with
// Bloom closed. See lib/placeHooks.js.
import { useState } from 'react'
import { getPlaceHookKey, placeHookUrl } from '../lib/placeHooks.js'

const btn = { flex:1, padding:'9px 10px', borderRadius:10, border:'1px solid var(--border)', background:'white', color:'var(--text)', fontWeight:600, fontSize:12.5, cursor:'pointer', fontFamily:'DM Sans,sans-serif' }

export default function PlaceHookSetup({ taskId, placeName }) {
  const [open, setOpen] = useState(false)
  const [key, setKey] = useState(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [copied, setCopied] = useState('')
  const place = (placeName || '').trim() || 'this place'

  const loadKey = async (fresh = false) => {
    setBusy(true); setErr('')
    try { setKey(await getPlaceHookKey({ fresh })) }
    catch (e) { setErr(e.message || String(e)) }
    finally { setBusy(false) }
  }
  const toggle = () => { setOpen(o => !o); if (!key && !busy) loadKey() }
  const copy = async (kind) => {
    if (!key) return
    const url = placeHookUrl(key, taskId, kind)
    try { await navigator.clipboard.writeText(url); setCopied(kind) }
    catch { window.prompt('Copy this link:', url) }
    setTimeout(() => setCopied(c => (c === kind ? '' : c)), 2000)
  }
  const renew = () => {
    if (window.confirm('Make new links? Automations using the old links will stop working until you paste the new ones in.')) loadKey(true)
  }

  return (
    <div style={{ marginTop:14, paddingTop:14, borderTop:'1px solid #F1EDF2' }}>
      <button type="button" onClick={toggle}
        style={{ display:'flex', alignItems:'center', width:'100%', gap:8, padding:0, border:'none', background:'none', cursor:'pointer', fontFamily:'DM Sans,sans-serif', textAlign:'left' }}>
        <span style={{ flex:1, minWidth:0 }}>
          <span style={{ display:'block', fontSize:13.5, fontWeight:500, color:'var(--text)' }}>iPhone automation</span>
          <span style={{ display:'block', fontSize:11, color:'var(--muted)', marginTop:1, lineHeight:1.35 }}>Start and end on when you really arrive and leave, even with Bloom closed.</span>
        </span>
        <span style={{ fontSize:9, color:'var(--muted)' }}>{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div style={{ marginTop:10 }}>
          <div style={{ display:'flex', gap:8 }}>
            <button type="button" disabled={!key} onClick={() => copy('arrive')} style={btn}>{copied === 'arrive' ? 'Copied ✓' : 'Copy arrive link'}</button>
            <button type="button" disabled={!key} onClick={() => copy('leave')} style={btn}>{copied === 'leave' ? 'Copied ✓' : 'Copy leave link'}</button>
          </div>
          {busy && <div style={{ fontSize:11, color:'var(--muted)', marginTop:8 }}>Getting your links…</div>}
          {err && <div style={{ fontSize:10.5, color:'#DC2626', marginTop:8 }}>{err}</div>}
          <ol style={{ fontSize:11.5, color:'var(--muted)', lineHeight:1.5, margin:'12px 0 0', paddingLeft:18 }}>
            <li>Open <b>Shortcuts</b> → <b>Automation</b> → <b>+</b> → <b>Arrive</b>.</li>
            <li>Choose {place}, pick <b>Run Immediately</b>, then <b>Next</b>.</li>
            <li>Add the action <b>Get Contents of URL</b> and paste the arrive link.</li>
            <li>Do the same with <b>Leave</b> and the leave link.</li>
          </ol>
          <div style={{ fontSize:10.5, color:'var(--muted)', marginTop:8, lineHeight:1.45 }}>
            The day runs from your first arrival to your last departure, so stepping out for lunch is fine. Keep the links private: anyone with them can mark you arrived or left here.
          </div>
          {key && (
            <button type="button" onClick={renew}
              style={{ marginTop:10, fontSize:11, padding:'5px 12px', borderRadius:16, cursor:'pointer', fontFamily:'DM Sans,sans-serif', fontWeight:600, border:'1px solid var(--border)', background:'white', color:'var(--muted)' }}>
              Make new links
            </button>
          )}
        </div>
      )}
    </div>
  )
}
