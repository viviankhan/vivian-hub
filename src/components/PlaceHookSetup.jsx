// src/components/PlaceHookSetup.jsx
// The "iPhone check-ins" panel: the one link every Shortcuts automation uses,
// through a "Bloom check-in" shortcut that sends where the phone is. Bloom
// matches each check-in to your places, so it knows where you were all day
// and when located items really started and ended, even with Bloom closed.
// See lib/placeHooks.js.
import { useState, useEffect } from 'react'
import { getPlaceHookKey, checkinUrl } from '../lib/placeHooks.js'

const btn = { width:'100%', padding:'10px', borderRadius:10, border:'1px solid var(--border)', background:'white', color:'var(--text)', fontWeight:600, fontSize:13, cursor:'pointer', fontFamily:'DM Sans,sans-serif' }
const head = { fontSize:10, color:'var(--muted)', letterSpacing:1, textTransform:'uppercase', margin:'14px 0 4px' }
const steps = { fontSize:11.5, color:'var(--muted)', lineHeight:1.55, margin:0, paddingLeft:18 }

export default function PlaceHookSetup({ startOpen = false }) {
  const [open, setOpen] = useState(startOpen)
  const [key, setKey] = useState(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [copied, setCopied] = useState(false)

  const loadKey = async (fresh = false) => {
    setBusy(true); setErr('')
    try { setKey(await getPlaceHookKey({ fresh })) }
    catch (e) { setErr(e.message || String(e)) }
    finally { setBusy(false) }
  }
  useEffect(() => { if (open && !key) loadKey() }, [open])   // eslint-disable-line react-hooks/exhaustive-deps
  const copy = async () => {
    if (!key) return
    const url = checkinUrl(key)
    try { await navigator.clipboard.writeText(url); setCopied(true) }
    catch { window.prompt('Copy this link:', url) }
    setTimeout(() => setCopied(false), 2000)
  }
  const renew = () => {
    if (window.confirm('Make a new link? The Bloom check-in shortcut will stop working until you paste the new one in.')) loadKey(true)
  }

  return (
    <div style={{ marginTop:14, paddingTop:14, borderTop:'1px solid #F1EDF2' }}>
      <button type="button" onClick={() => setOpen(o => !o)}
        style={{ display:'flex', alignItems:'center', width:'100%', gap:8, padding:0, border:'none', background:'none', cursor:'pointer', fontFamily:'DM Sans,sans-serif', textAlign:'left' }}>
        <span style={{ flex:1, minWidth:0 }}>
          <span style={{ display:'block', fontSize:13.5, fontWeight:500, color:'var(--text)' }}>iPhone check-ins</span>
          <span style={{ display:'block', fontSize:11, color:'var(--muted)', marginTop:1, lineHeight:1.35 }}>Know where you were all day, even with Bloom closed. One shortcut, used by every place.</span>
        </span>
        <span style={{ fontSize:9, color:'var(--muted)' }}>{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div style={{ marginTop:10 }}>
          <div style={head}>Once: make the shortcut</div>
          <ol style={steps}>
            <li>In <b>Shortcuts</b>, on the <b>Shortcuts</b> tab, tap <b>+</b> and name it <b>Bloom check-in</b>.</li>
            <li>Add the action <b>Get Current Location</b>.</li>
            <li>Add <b>Get Contents of URL</b> and paste this link:</li>
          </ol>
          <button type="button" disabled={!key} onClick={copy} style={{ ...btn, margin:'8px 0' }}>{copied ? 'Copied ✓' : busy ? 'Getting your link…' : 'Copy check-in link'}</button>
          <ol start={4} style={steps}>
            <li>In the pasted link, select <b>LAT</b>, tap <b>Current Location</b> above the keyboard, then tap the blue bubble and pick <b>Latitude</b>.</li>
            <li>Do the same for <b>LNG</b> with <b>Longitude</b>.</li>
            <li>Tap ▶︎ to test it: it should say <b>Bloom: checked in.</b></li>
          </ol>
          <div style={head}>For each place</div>
          <ol style={steps}>
            <li><b>Automation</b> → <b>+</b> → <b>Arrive</b> or <b>Leave</b>, pick the place, <b>Run Immediately</b>.</li>
            <li><b>New Blank Automation</b> → add <b>Run Shortcut</b> → choose <b>Bloom check-in</b>.</li>
          </ol>
          <div style={{ fontSize:10.5, color:'var(--muted)', marginTop:10, lineHeight:1.45 }}>
            Bloom puts each check-in under the nearest place you've saved; anywhere else shows as “Somewhere else” under Where you were on Today, and you can name it there. A block with a place and Start on arrival runs from when you got there to when you left. Keep the link private: anyone with it can check you in.
          </div>
          {err && <div style={{ fontSize:10.5, color:'#DC2626', marginTop:8 }}>{err}</div>}
          {key && (
            <button type="button" onClick={renew}
              style={{ marginTop:10, fontSize:11, padding:'5px 12px', borderRadius:16, cursor:'pointer', fontFamily:'DM Sans,sans-serif', fontWeight:600, border:'1px solid var(--border)', background:'white', color:'var(--muted)' }}>
              Make a new link
            </button>
          )}
        </div>
      )}
    </div>
  )
}
