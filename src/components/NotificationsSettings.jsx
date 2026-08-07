// src/components/NotificationsSettings.jsx
// Settings panel to turn on reminders for upcoming commitments & events,
// and a walkthrough for installing Bloom as an app on your phone.
import { useEffect, useState } from 'react'
import {
  notificationsSupported, permissionState, requestPermission,
  getSettings, saveSettings, registerServiceWorker,
  sendTestNotification, syncReminders, primeBaseline,
  LEAD_OPTIONS, triggersSupported,
} from '../lib/notifications.js'
import {
  geolocationSupported, geolocationPermission, getCurrentLocation,
  getGeoStatus, onGeoStatus,
} from '../lib/geofence.js'
import { Icon } from './IconPicker.jsx'
import { AlertPicker, alertName } from './AlertPicker.jsx'

// Keep numeric leads sorted (soonest last); the 'end' alert always trails.
function normLeads(arr) {
  const nums = arr.filter(x => x !== 'end').sort((a, b) => b - a)
  return arr.includes('end') ? [...nums, 'end'] : nums
}

const card = { background:'white', borderRadius:12, border:'1px solid var(--border)', padding:'16px 18px', marginBottom:14 }
const btn = (active) => ({
  border:'none', borderRadius:10, padding:'10px 16px', fontSize:13, fontWeight:600,
  cursor:'pointer', fontFamily:'DM Sans,sans-serif',
  background: active ? 'var(--forest)' : '#E5E7EB',
  color: active ? 'var(--green-light)' : '#9CA3AF',
})

// Detect running as an installed PWA (standalone) vs a browser tab.
function isStandalone() {
  return window.matchMedia?.('(display-mode: standalone)').matches ||
    window.navigator.standalone === true
}
function isIOS() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
}

export default function NotificationsSettings({ events, commitments, recurring = [], locatedCount = 0 }) {
  const supported = notificationsSupported()
  const [perm, setPerm] = useState(supported ? permissionState() : 'unsupported')
  const [enabled, setEnabled] = useState(getSettings().enabled)
  const [leads, setLeads] = useState(() => getSettings().leads || [])
  const [busy, setBusy] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)

  // Persist a new default-alert set and re-arm the reminder timers so the
  // change takes effect immediately. Recurring items are passed through so a
  // leads-only change here doesn't momentarily drop their scheduled reminders.
  const commitLeads = (next) => {
    const n = normLeads(next)
    setLeads(n)
    saveSettings({ leads: n })
    syncReminders(events, commitments, recurring)
  }
  // Toggle a default alert on/off (chips), add one (picker), or remove one (✕).
  const toggleLead = (val) => commitLeads(leads.includes(val) ? leads.filter(m => m !== val) : [...leads, val])
  const addLead    = (val) => { if (!leads.includes(val)) commitLeads([...leads, val]) }
  const removeLead = (val) => commitLeads(leads.filter(m => m !== val))
  const standalone = isStandalone()
  const ios = isIOS()
  const background = supported && triggersSupported()

  useEffect(() => {
    const onVis = () => setPerm(permissionState())
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [])

  // ── Location arrivals ────────────────────────────────────────
  const geoOk = geolocationSupported()
  const [geoPerm, setGeoPerm] = useState('unknown')  // granted | denied | prompt | unknown
  const [geoStatus, setGeoStatus] = useState(() => getGeoStatus())
  const [geoBusy, setGeoBusy] = useState(false)
  useEffect(() => {
    if (!geoOk) return
    let live = true
    geolocationPermission().then(p => { if (live) setGeoPerm(p) })
    const off = onGeoStatus(setGeoStatus)   // live 'watching' / 'live' / 'error'
    return () => { live = false; off() }
  }, [geoOk])
  // Ask for location once, and confirm we can actually get a fix — this is the
  // "make geotracking work" button: it triggers the OS permission prompt and
  // reports success/failure instead of failing silently in the background.
  const testLocation = async () => {
    setGeoBusy(true)
    try {
      await getCurrentLocation()
      setGeoPerm('granted')
    } catch (e) {
      setGeoPerm(e && e.code === 1 ? 'denied' : 'prompt')
    } finally {
      setGeoBusy(false)
      geolocationPermission().then(setGeoPerm).catch(() => {})
    }
  }

  const enable = async () => {
    setBusy(true)
    try {
      await registerServiceWorker()
      let p = permissionState()
      if (p === 'default') p = await requestPermission()
      setPerm(p)
      if (p === 'granted') {
        saveSettings({ enabled: true })
        setEnabled(true)
        primeBaseline(events, commitments, recurring) // don't replay past-due items on first enable
        syncReminders(events, commitments, recurring)
        sendTestNotification()
      }
    } finally {
      setBusy(false)
    }
  }

  const disable = () => {
    saveSettings({ enabled: false })
    setEnabled(false)
    syncReminders(events, commitments, recurring) // clears any pending timers
  }

  const on = enabled && perm === 'granted'

  return (
    <div>
      <div className="page-title">Reminders</div>
      <div className="page-sub">Get a nudge before your commitments and events — at the lead times you choose below.</div>

      {/* ── Install as an app ─────────────────────────────── */}
      {!standalone && (
        <div style={{ ...card, borderColor:'var(--teal)', background:'#F2FAFC' }}>
          <div style={{ display:'inline-flex', alignItems:'center', gap:7, fontSize:13, fontWeight:700, color:'var(--text)', marginBottom:6 }}><Icon value="glyph:phone" size={16} color="var(--teal)" />Put Bloom on your Home Screen</div>
          {ios ? (
            <ol style={{ margin:0, paddingLeft:18, fontSize:12.5, color:'var(--text)', lineHeight:1.9 }}>
              <li>Open Bloom in <b>Safari</b> (not this in-app browser).</li>
              <li>Tap the <b>Share</b> button (the square with an up-arrow).</li>
              <li>Choose <b>Add to Home Screen</b>, then <b>Add</b>.</li>
              <li>Open Bloom from its new icon, then turn on reminders below.</li>
            </ol>
          ) : (
            <ol style={{ margin:0, paddingLeft:18, fontSize:12.5, color:'var(--text)', lineHeight:1.9 }}>
              <li>Open Bloom in <b>Chrome</b>.</li>
              <li>Tap the <b>⋮</b> menu, then <b>Add to Home screen</b> / <b>Install app</b>.</li>
              <li>Open Bloom from its new icon, then turn on reminders below.</li>
            </ol>
          )}
          <div style={{ fontSize:11, color:'var(--muted)', marginTop:8 }}>
            On iPhone, notifications only work once Bloom is added to the Home Screen (iOS 16.4+).
          </div>
        </div>
      )}
      {standalone && (
        <div style={{ ...card, borderColor:'#52B788', background:'#F1FBF5' }}>
          <div style={{ fontSize:12.5, color:'#2F6B4F', fontWeight:600 }}>✓ Running as an installed app. Reminders can show on your phone.</div>
        </div>
      )}

      {/* ── The toggle ────────────────────────────────────── */}
      <div style={card}>
        {!supported && (
          <div style={{ fontSize:12.5, color:'var(--muted)' }}>
            This browser doesn't support notifications. Try Chrome (Android/desktop) or add Bloom to your iPhone Home Screen with Safari.
          </div>
        )}

        {supported && (
          <>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:12 }}>
              <div>
                <div style={{ fontSize:13.5, fontWeight:600, color:'var(--text)' }}>
                  {on ? 'Reminders are on' : 'Reminders are off'}
                </div>
                <div style={{ fontSize:11.5, color:'var(--muted)', marginTop:2 }}>
                  {on ? 'You\'ll be nudged before what\'s coming up.' : 'Turn on to get notified about upcoming items.'}
                </div>
              </div>
              {on
                ? <button onClick={disable} style={btn(false)}>Turn off</button>
                : <button onClick={enable} disabled={busy} style={btn(true)}>{busy ? 'Enabling…' : 'Turn on'}</button>}
            </div>

            {perm === 'denied' && (
              <div style={{ fontSize:11.5, color:'#B45309', background:'#FEF3C7', borderRadius:8, padding:'8px 10px', marginTop:10 }}>
                Notifications are blocked in your browser/device settings. Allow notifications for Bloom, then come back and turn them on.
              </div>
            )}

            {on && (
              <button onClick={sendTestNotification}
                style={{ ...btn(false), marginTop:12, background:'white', color:'var(--teal)', border:'1px solid var(--teal)' }}>
                Send a test notification
              </button>
            )}
          </>
        )}
      </div>

      {/* ── Default alerts ────────────────────────────────── */}
      <div style={card}>
        <div style={{ fontSize:13.5, fontWeight:600, color:'var(--text)', marginBottom:3 }}>Default alerts</div>
        <div style={{ fontSize:11.5, color:'var(--muted)', marginBottom:12 }}>
          These apply to every commitment and event. Add when it starts, when it ends, or any lead before — and remove the ones you don't want. A single item can still override these in its own alerts.
        </div>

        {/* The current default alerts — each removable. */}
        {leads.length > 0 && (
          <div style={{ marginBottom:12 }}>
            {normLeads(leads).map(val => (
              <div key={String(val)} style={{ display:'flex', alignItems:'center', gap:11, padding:'9px 2px', borderBottom:'1px solid #F1EDF2' }}>
                <span style={{ display:'inline-flex', color: val==='end' ? '#C77A4A' : 'var(--teal)' }}>
                  <Icon value={val==='end' ? 'glyph:flag' : 'glyph:clock'} size={16} />
                </span>
                <span style={{ flex:1, minWidth:0, fontSize:14, color:'var(--text)' }}>{alertName(val)}</span>
                <button onClick={() => removeLead(val)} aria-label={`Remove ${alertName(val)}`}
                  style={{ border:'none', background:'none', cursor:'pointer', color:'#B4BEC8', fontSize:17, lineHeight:1, padding:'0 4px' }}>✕</button>
              </div>
            ))}
          </div>
        )}

        {/* Add an alert — presets, start, end, or a custom lead. */}
        <div style={{ fontSize:10, color:'var(--muted)', letterSpacing:1, textTransform:'uppercase', marginBottom:6 }}>Add an alert</div>
        <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
          {LEAD_OPTIONS.map(opt => {
            const on = leads.includes(opt.mins)
            return (
              <button key={opt.mins} onClick={() => toggleLead(opt.mins)}
                style={{ fontSize:12, padding:'7px 14px', borderRadius:20, cursor:'pointer', fontFamily:'DM Sans,sans-serif', fontWeight:600,
                  border: on ? 'none' : '1px solid var(--border)',
                  background: on ? 'var(--forest)' : 'white',
                  color: on ? 'var(--green-light)' : 'var(--muted)',
                  display:'inline-flex', alignItems:'center', gap:6 }}>
                {on && <span style={{ fontSize:11 }}>✓</span>}{opt.label}
              </button>
            )
          })}
          {(() => {
            const on = leads.includes('end')
            return (
              <button onClick={() => toggleLead('end')}
                style={{ fontSize:12, padding:'7px 14px', borderRadius:20, cursor:'pointer', fontFamily:'DM Sans,sans-serif', fontWeight:600,
                  border: on ? 'none' : '1px solid var(--border)', background: on ? 'var(--forest)' : 'white', color: on ? 'var(--green-light)' : 'var(--muted)',
                  display:'inline-flex', alignItems:'center', gap:6 }}>
                {on && <span style={{ fontSize:11 }}>✓</span>}When it ends
              </button>
            )
          })()}
          <button onClick={() => setPickerOpen(true)}
            style={{ fontSize:12, padding:'7px 14px', borderRadius:20, cursor:'pointer', fontFamily:'DM Sans,sans-serif', fontWeight:600, border:'1px dashed var(--teal)', background:'white', color:'var(--teal)' }}>
            ＋ Custom…
          </button>
        </div>
        {leads.length === 0 && (
          <div style={{ fontSize:11.5, color:'#B45309', background:'#FEF3C7', borderRadius:8, padding:'8px 10px', marginTop:12 }}>
            No alerts selected — you won't get any reminders. Add at least one.
          </div>
        )}
      </div>
      {pickerOpen && <AlertPicker onClose={() => setPickerOpen(false)} onAdd={(mins) => addLead(mins)} />}

      {/* ── Location arrivals ─────────────────────────────── */}
      <div style={card}>
        <div style={{ display:'inline-flex', alignItems:'center', gap:7, fontSize:13.5, fontWeight:600, color:'var(--text)', marginBottom:3 }}>
          <Icon value="glyph:pin" size={16} color="var(--teal)" />Location arrivals
        </div>
        <div style={{ fontSize:11.5, color:'var(--muted)', marginBottom:12 }}>
          Give a task a place (in its Add sheet) and Bloom starts it automatically when you arrive — while the app is open. Turn location on here so it can.
        </div>

        {!geoOk && (
          <div style={{ fontSize:11.5, color:'var(--muted)' }}>
            This device doesn't support location.
          </div>
        )}

        {geoOk && (
          <>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:12 }}>
              <div style={{ fontSize:12.5, color:'var(--text)' }}>
                {geoPerm === 'granted' ? 'Location is on for Bloom.'
                  : geoPerm === 'denied' ? 'Location is blocked in your device/browser settings.'
                  : 'Location isn\'t on yet.'}
              </div>
              <button onClick={testLocation} disabled={geoBusy}
                style={{ ...btn(geoPerm !== 'granted'), background: geoPerm === 'granted' ? 'white' : 'var(--forest)', color: geoPerm === 'granted' ? 'var(--teal)' : 'var(--green-light)', border: geoPerm === 'granted' ? '1px solid var(--teal)' : 'none' }}>
                {geoBusy ? 'Checking…' : geoPerm === 'granted' ? 'Test location' : 'Turn on'}
              </button>
            </div>

            {geoPerm === 'denied' && (
              <div style={{ fontSize:11.5, color:'#B45309', background:'#FEF3C7', borderRadius:8, padding:'8px 10px', marginTop:10 }}>
                Allow location for Bloom in your browser/device settings, then tap “Turn on” again. On iPhone this must be the installed Home-Screen app, with Settings → Bloom → Location set to “While Using”.
              </div>
            )}

            {/* Live tracking status once a watch is running. */}
            {geoPerm !== 'denied' && geoStatus.state === 'live' && (
              <div style={{ fontSize:11.5, color:'#2F6B4F', background:'#F1FBF5', border:'1px solid #CDE9D8', borderRadius:8, padding:'8px 10px', marginTop:10 }}>
                ✓ Tracking your arrival{geoStatus.accuracy ? ` (accurate to ~${Math.round(geoStatus.accuracy)} m)` : ''}.
              </div>
            )}
            {geoPerm !== 'denied' && geoStatus.state === 'error' && geoStatus.message && (
              <div style={{ fontSize:11.5, color:'#B45309', background:'#FEF3C7', borderRadius:8, padding:'8px 10px', marginTop:10 }}>
                {geoStatus.message}
              </div>
            )}

            <div style={{ fontSize:11, color:'var(--muted)', marginTop:10 }}>
              {locatedCount > 0
                ? `${locatedCount} task${locatedCount > 1 ? 's have' : ' has'} a place set — Bloom is watching for ${locatedCount > 1 ? 'them' : 'it'} while it's open.`
                : 'No tasks have a place yet. Add one from a task’s “Location” option to use this.'}
            </div>
            <div style={{ fontSize:11, color:'var(--muted)', marginTop:6, lineHeight:1.6 }}>
              Arrivals are detected only while Bloom is open (a web app can’t track location in the background), so it starts a located task the moment you open Bloom after getting there.
            </div>
          </>
        )}
      </div>

      {/* ── What you'll get ───────────────────────────────── */}
      <div style={{ ...card, marginBottom:0 }}>
        <div style={{ fontSize:11, color:'var(--muted)', letterSpacing:1.2, textTransform:'uppercase', fontWeight:600, marginBottom:8 }}>How it works</div>
        <ul style={{ margin:0, paddingLeft:18, fontSize:12.5, color:'var(--text)', lineHeight:1.8 }}>
          <li>A nudge at <b>each lead time above</b> before a commitment or event.</li>
          <li>Timed items remind relative to their <b>start time</b>.</li>
          <li>Untimed items are anchored to <b>9:00 AM</b> on their day.</li>
        </ul>
        {background ? (
          <div style={{ fontSize:11.5, color:'#2F6B4F', background:'#F1FBF5', border:'1px solid #CDE9D8', borderRadius:8, padding:'9px 11px', marginTop:12, lineHeight:1.6 }}>
            ✓ This device can deliver reminders <b>in the background</b> — they'll arrive at the right time even if you haven't opened Bloom recently.
          </div>
        ) : (
          <div style={{ fontSize:11, color:'var(--muted)', marginTop:10, lineHeight:1.6 }}>
            On this device, reminders fire while Bloom is open and catch up the moment you reopen it — so nothing gets missed. Longer lead times (a day / a week out) are delivered when you next open Bloom within that window. Add Bloom to your Home Screen (and, on Android/Chrome, keep it installed) for reminders that arrive even when the app is closed.
          </div>
        )}
      </div>
    </div>
  )
}
