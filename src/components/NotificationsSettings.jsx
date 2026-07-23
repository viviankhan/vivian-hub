// src/components/NotificationsSettings.jsx
// Settings panel to turn on reminders for upcoming commitments & events,
// and a walkthrough for installing Bloom as an app on your phone.
import { useEffect, useState } from 'react'
import {
  notificationsSupported, permissionState, requestPermission,
  getSettings, saveSettings, registerServiceWorker,
  sendTestNotification, syncReminders, primeBaseline,
} from '../lib/notifications.js'

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

export default function NotificationsSettings({ events, commitments }) {
  const supported = notificationsSupported()
  const [perm, setPerm] = useState(supported ? permissionState() : 'unsupported')
  const [enabled, setEnabled] = useState(getSettings().enabled)
  const [busy, setBusy] = useState(false)
  const standalone = isStandalone()
  const ios = isIOS()

  useEffect(() => {
    const onVis = () => setPerm(permissionState())
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [])

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
        primeBaseline(events, commitments) // don't replay past-due items on first enable
        syncReminders(events, commitments)
        sendTestNotification()
      }
    } finally {
      setBusy(false)
    }
  }

  const disable = () => {
    saveSettings({ enabled: false })
    setEnabled(false)
    syncReminders(events, commitments) // clears any pending timers
  }

  const on = enabled && perm === 'granted'

  return (
    <div>
      <div className="page-title">Reminders</div>
      <div className="page-sub">Get a nudge before your commitments and events — a day ahead and an hour before.</div>

      {/* ── Install as an app ─────────────────────────────── */}
      {!standalone && (
        <div style={{ ...card, borderColor:'var(--teal)', background:'#F2FAFC' }}>
          <div style={{ fontSize:13, fontWeight:700, color:'var(--text)', marginBottom:6 }}>📲 Put Bloom on your Home Screen</div>
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

      {/* ── What you'll get ───────────────────────────────── */}
      <div style={{ ...card, marginBottom:0 }}>
        <div style={{ fontSize:11, color:'var(--muted)', letterSpacing:1.2, textTransform:'uppercase', fontWeight:600, marginBottom:8 }}>What you'll get</div>
        <ul style={{ margin:0, paddingLeft:18, fontSize:12.5, color:'var(--text)', lineHeight:1.8 }}>
          <li><b>The day before</b> each commitment or event.</li>
          <li><b>An hour before</b> anything with a set time.</li>
          <li>Untimed items are reminded around <b>9:00 AM</b>.</li>
        </ul>
        <div style={{ fontSize:11, color:'var(--muted)', marginTop:10, lineHeight:1.6 }}>
          Reminders fire while Bloom is open, and catch up the moment you reopen it — so nothing gets missed. For alerts while the app is fully closed, see the note in SETUP.md about adding a push server.
        </div>
      </div>
    </div>
  )
}
