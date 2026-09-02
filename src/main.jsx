import React, { useState, useEffect } from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import Auth from './components/Auth.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'
import './styles/index.css'
import { applySavedAppearance } from './lib/appearance.js'
import { authEnabled, initAuth, onAuth } from './lib/auth.js'

// Apply the saved font + accent theme before the first paint, so the app never
// flashes the default look on load. Guarded so a bad saved value can't stop the
// app from mounting.
try { applySavedAppearance() } catch (e) { console.error('[Bloom] appearance init failed:', e) }

// Ask the browser to keep our storage durable. Supabase keeps the signed-in
// session in localStorage; when the OS evicts a web app's storage (iOS/WebKit
// does this under storage pressure or its script-writable-storage timer), that
// session goes with it and the next open lands on the login screen. Requesting
// persistent storage is the one web-platform lever against that eviction — it's
// honored on Android/desktop installed PWAs, a harmless no-op where it isn't.
// Best-effort: never let it block startup.
try {
  if (navigator.storage?.persist) {
    navigator.storage.persisted?.().then(already => {
      if (!already) navigator.storage.persist().catch(() => {})
    }).catch(() => {})
  }
} catch (e) { /* storage API unavailable — ignore */ }

// ── Account gate ────────────────────────────────────────────────
// Without Supabase (local dev / localStorage mode) there are no accounts — the
// app just opens. With Supabase configured, the app is gated behind a real
// login; App only mounts once someone is signed in, so its data load runs for
// the right account. Keying <App> on the user id remounts it cleanly when the
// account changes (sign out → sign in as someone else).
function Root() {
  // `ready` flips once the initial session has loaded, so a signed-in user never
  // flashes the login screen while that resolves. `uid` is the current account.
  const [ready, setReady] = useState(!authEnabled)
  const [uid, setUid] = useState(null)

  useEffect(() => {
    if (!authEnabled) return
    let alive = true
    initAuth().then(() => { if (alive) setReady(true) })
    // onAuth fires immediately with the current user, then on every change.
    const off = onAuth(user => { if (alive) setUid(user?.id || null) })
    return () => { alive = false; off() }
  }, [])

  if (!ready) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className="serif" style={{ fontSize: 34, fontWeight: 700, color: 'var(--forest)', opacity: .5 }}>Bloom</div>
      </div>
    )
  }
  if (authEnabled && !uid) return <Auth />
  return <App key={uid || 'local'} />
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <Root />
    </ErrorBoundary>
  </React.StrictMode>
)
