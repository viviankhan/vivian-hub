// src/components/ExternalCalendars.jsx
// Settings › Calendars — subscribe to a published Apple Family / iCloud calendar
// (or any .ics feed) so the events someone else schedules flow onto your
// Calendar automatically, each feed with its own on/off toggle.
import { useState } from 'react'
import ColorSwatchRow from './ColorSwatchRow.jsx'
import { DEFAULT_CAL_COLOR, hasProxy } from '../lib/calendars.js'

const inp = { width:'100%', fontSize:13, padding:'9px 11px', borderRadius:10, border:'1px solid var(--border)', fontFamily:'DM Sans,sans-serif', boxSizing:'border-box', color:'var(--text)', background:'white' }
const fieldLabel = { fontSize:10, color:'var(--muted)', letterSpacing:1, textTransform:'uppercase', marginBottom:4 }

function timeAgo(ts) {
  if (!ts) return 'never'
  const s = Math.round((Date.now() - ts) / 1000)
  if (s < 60) return 'just now'
  const m = Math.round(s / 60); if (m < 60) return `${m} min ago`
  const h = Math.round(m / 60); if (h < 24) return `${h} hr ago`
  return `${Math.round(h / 24)} d ago`
}

// A small pill toggle switch.
function Toggle({ on, onChange, label }) {
  return (
    <button role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)}
      style={{ width:42, height:24, borderRadius:999, border:'none', cursor:'pointer', flexShrink:0, padding:0,
        background: on ? 'var(--teal, #2A9D8F)' : '#D4D0CC', transition:'background .18s', position:'relative' }}>
      <span style={{ position:'absolute', top:3, left: on ? 21 : 3, width:18, height:18, borderRadius:'50%', background:'white',
        transition:'left .18s', boxShadow:'0 1px 3px rgba(0,0,0,.25)' }} />
    </button>
  )
}

export default function ExternalCalendars({ calendars = [], statuses = {}, onAdd, onToggle, onRemove, onRefresh }) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [url, setUrl] = useState('')
  const [color, setColor] = useState(DEFAULT_CAL_COLOR)
  const [confirmId, setConfirmId] = useState(null)

  const canSave = url.trim().length > 6
  const reset = () => { setName(''); setUrl(''); setColor(DEFAULT_CAL_COLOR); setOpen(false) }
  const submit = () => {
    if (!canSave) return
    onAdd && onAdd({ name: name.trim() || 'Family calendar', url: url.trim(), color })
    reset()
  }

  return (
    <div>
      <div className="page-title">Calendars</div>
      <div className="page-sub">Subscribe to a shared calendar — like your Apple Family calendar — and its events show up on your Calendar automatically. Flip a calendar off any time to hide it without unsubscribing.</div>

      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', margin:'8px 0 10px' }}>
        <div style={{ fontSize:11, color:'var(--muted)', letterSpacing:1.5, textTransform:'uppercase', fontWeight:600 }}>Subscribed calendars</div>
        <button onClick={() => setOpen(o => !o)}
          style={{ fontSize:11, padding:'5px 12px', borderRadius:20, border:'1px solid var(--border)', background: open ? 'var(--forest)' : 'white', color: open ? 'var(--green-light)' : 'var(--muted)', cursor:'pointer', fontFamily:'DM Sans,sans-serif', fontWeight:600 }}>
          {open ? 'Cancel' : '+ Add calendar'}
        </button>
      </div>

      {calendars.length === 0 && !open && (
        <div style={{ fontSize:12.5, color:'var(--muted)', padding:'4px 0 10px' }}>No calendars subscribed yet.</div>
      )}

      {calendars.map(cal => {
        const st = statuses[cal.id] || {}
        return (
          <div key={cal.id} style={{ display:'flex', alignItems:'center', gap:11, padding:'11px 14px', background:'white', borderRadius:12, border:'1px solid var(--border)', marginBottom:8 }}>
            <span style={{ width:12, height:12, borderRadius:'50%', background:cal.color || DEFAULT_CAL_COLOR, flexShrink:0, opacity: cal.enabled ? 1 : .35 }} />
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ fontSize:13.5, fontWeight:600, color:'var(--text)', opacity: cal.enabled ? 1 : .6, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{cal.name}</div>
              <div style={{ fontSize:11, color: st.state === 'error' ? '#DC2626' : 'var(--muted)', marginTop:2, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
                {st.state === 'syncing' ? 'Syncing…'
                  : st.state === 'error' ? (st.error || 'Couldn’t sync')
                  : `${st.count ?? 0} event${(st.count ?? 0) === 1 ? '' : 's'} · updated ${timeAgo(st.fetchedAt)}`}
              </div>
            </div>
            <button onClick={() => onRefresh && onRefresh(cal.id)} title="Sync now" disabled={st.state === 'syncing'}
              style={{ background:'none', border:'none', cursor: st.state === 'syncing' ? 'default' : 'pointer', color:'var(--muted)', fontSize:15, padding:'2px 4px', flexShrink:0, opacity: st.state === 'syncing' ? .5 : 1 }}>⟳</button>
            <Toggle on={!!cal.enabled} onChange={() => onToggle && onToggle(cal.id)} label={`Show ${cal.name}`} />
            {confirmId === cal.id ? (
              <span style={{ display:'inline-flex', alignItems:'center', gap:5, flexShrink:0 }}>
                <button onClick={() => { onRemove && onRemove(cal.id); setConfirmId(null) }}
                  style={{ fontSize:11, padding:'4px 9px', borderRadius:14, border:'none', background:'#EF4444', color:'white', cursor:'pointer', fontFamily:'DM Sans,sans-serif', fontWeight:600 }}>Remove</button>
                <button onClick={() => setConfirmId(null)}
                  style={{ fontSize:11, padding:'4px 9px', borderRadius:14, border:'1px solid var(--border)', background:'white', color:'var(--muted)', cursor:'pointer', fontFamily:'DM Sans,sans-serif' }}>No</button>
              </span>
            ) : (
              <button onClick={() => setConfirmId(cal.id)} title="Unsubscribe"
                style={{ background:'none', border:'none', cursor:'pointer', color:'#B9B3AC', fontSize:16, padding:'0 2px', flexShrink:0 }}>✕</button>
            )}
          </div>
        )
      })}

      {open && (
        <div style={{ background:'var(--cream)', borderRadius:12, border:'1px solid var(--border)', padding:'14px 16px', marginTop:4, marginBottom:8 }}>
          <div style={{ marginBottom:10 }}>
            <div style={fieldLabel}>Calendar link (webcal:// or https://…ics)</div>
            <input value={url} onChange={e => setUrl(e.target.value)} placeholder="webcal://p123-caldav.icloud.com/published/…"
              autoCapitalize="none" autoCorrect="off" spellCheck={false} style={{ ...inp }} />
          </div>
          <div style={{ marginBottom:10 }}>
            <div style={fieldLabel}>Name</div>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Family calendar" style={{ ...inp }} />
          </div>
          <div style={fieldLabel}>Color</div>
          <div style={{ marginBottom:10 }}>
            <ColorSwatchRow value={color} onChange={setColor} size={26} />
          </div>
          <button onClick={submit} disabled={!canSave}
            style={{ width:'100%', background: canSave ? 'var(--forest)' : '#E5E7EB', color: canSave ? 'var(--green-light)' : '#9CA3AF', border:'none', borderRadius:10, padding:'10px', fontSize:13, fontWeight:600, cursor: canSave ? 'pointer' : 'default', fontFamily:'DM Sans,sans-serif' }}>
            Subscribe
          </button>
        </div>
      )}

      {/* How-to for the Apple Family calendar. */}
      <div style={{ background:'#F6F2EA', border:'1px solid #E6DCC8', borderRadius:12, padding:'13px 15px', marginTop:6 }}>
        <div style={{ fontSize:12, fontWeight:700, color:'var(--text)', marginBottom:6 }}>Getting the family calendar link</div>
        <ol style={{ margin:0, paddingLeft:18, fontSize:11.5, color:'var(--muted)', lineHeight:1.7 }}>
          <li>On a Mac, open <b>Calendar</b> and find the shared <b>Family</b> calendar in the sidebar.</li>
          <li>Hover it and click the <b>ⓘ</b> (or right-click → <b>Sharing settings</b>).</li>
          <li>Turn on <b>Public Calendar</b>, then <b>Copy Link</b>.</li>
          <li>Paste that link above. (On iPhone: Calendars → ⓘ next to Family → Public Calendar → Share Link.)</li>
        </ol>
        <div style={{ fontSize:11, color:'var(--muted)', marginTop:8, lineHeight:1.6 }}>
          It syncs one way and read-only — Mom’s events appear here, and nothing you do in Bloom changes her calendar.
        </div>
        {!hasProxy && (
          <div style={{ fontSize:11, color:'#9A6a00', marginTop:8, lineHeight:1.6 }}>
            Note: fetching an iCloud link from the browser usually needs the calendar proxy set up (see CALENDAR_SYNC.md). Without it, only feeds that allow cross-origin access will load.
          </div>
        )}
      </div>
    </div>
  )
}
