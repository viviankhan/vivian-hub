// src/components/Auth.jsx
// The account gate. Shown by App whenever Supabase is configured but nobody is
// signed in. Sign in, create an account, or reset a password. On success the
// auth listener in App swaps this out for the app itself.
import { useEffect, useState } from 'react'
import { signIn, signUp, sendPasswordReset } from '../lib/auth.js'
import { subscribe, isOnline } from '../lib/offline.js'

const MODES = { in: 'Sign in', up: 'Create account', reset: 'Reset password' }

export default function Auth() {
  const [mode, setMode] = useState('in')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [note, setNote] = useState('')   // success / info message
  // Signing in is the one thing that genuinely needs the network, so say so up
  // front rather than letting the user type a password into a form that can't
  // submit. (Once signed in, this screen isn't seen again — the session is
  // remembered and the app opens offline; see src/lib/auth.js.)
  const [online, setOnline] = useState(isOnline)
  useEffect(() => subscribe(s => setOnline(s.online)), [])

  const submit = async (e) => {
    e.preventDefault()
    if (busy) return
    setErr(''); setNote('')
    if (!online) { setErr('You’re offline. Connect to the internet to sign in.'); return }
    const em = email.trim()
    if (!em) { setErr('Enter your email.'); return }
    if (mode !== 'reset' && password.length < 6) { setErr('Password must be at least 6 characters.'); return }
    setBusy(true)
    try {
      if (mode === 'in') {
        await signIn(em, password)
        // The auth listener in App takes over from here.
      } else if (mode === 'up') {
        const data = await signUp(em, password)
        if (!data?.session) {
          setNote('Account created — check your email to confirm, then sign in.')
          setMode('in')
        }
        // If confirmation is off, a session already exists and App swaps this out.
      } else {
        await sendPasswordReset(em)
        setNote('If that email has an account, a reset link is on its way.')
        setMode('in')
      }
    } catch (e2) {
      setErr(e2?.message || 'Something went wrong. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  const input = {
    width: '100%', fontSize: 15, padding: '13px 14px', borderRadius: 12,
    border: '1px solid var(--border)', background: 'white', color: 'var(--text)',
    fontFamily: 'DM Sans,sans-serif', boxSizing: 'border-box', outline: 'none',
  }
  const linkBtn = {
    background: 'none', border: 'none', color: 'var(--teal)', cursor: 'pointer',
    fontFamily: 'DM Sans,sans-serif', fontSize: 13, fontWeight: 600, padding: 0,
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ width: '100%', maxWidth: 400 }}>
        {/* Brand */}
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div className="serif" style={{ fontSize: 40, fontWeight: 700, color: 'var(--forest)', lineHeight: 1 }}>Bloom</div>
          <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 8 }}>Your planner, your records — private to you.</div>
        </div>

        <div style={{ background: 'white', border: '1px solid var(--border)', borderRadius: 20, padding: '24px 22px', boxShadow: '0 12px 40px rgba(42,72,88,.10)' }}>
          <div className="serif" style={{ fontSize: 22, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>{MODES[mode]}</div>
          <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 18 }}>
            {mode === 'in' && 'Welcome back.'}
            {mode === 'up' && 'Start your own private space.'}
            {mode === 'reset' && 'We’ll email you a reset link.'}
          </div>

          <form onSubmit={submit}>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: 6 }}>Email</label>
            <input type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)}
              placeholder="you@example.com" style={{ ...input, marginBottom: 14 }} />

            {mode !== 'reset' && (
              <>
                <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: 6 }}>Password</label>
                <input type="password" autoComplete={mode === 'up' ? 'new-password' : 'current-password'}
                  value={password} onChange={e => setPassword(e.target.value)}
                  placeholder={mode === 'up' ? 'At least 6 characters' : 'Your password'} style={{ ...input, marginBottom: 14 }} />
              </>
            )}

            {!online && (
              <div style={{ fontSize: 12.5, color: '#8A5A00', background: '#FFF4E5', border: '1px solid #F5D9AE', borderRadius: 10, padding: '9px 12px', marginBottom: 12, lineHeight: 1.45 }}>
                You’re offline. Signing in needs a connection — after that, Bloom stays signed in and works offline.
              </div>
            )}
            {err && <div style={{ fontSize: 12.5, color: '#B42318', background: '#FEF3F2', border: '1px solid #FECDCA', borderRadius: 10, padding: '9px 12px', marginBottom: 12, lineHeight: 1.45 }}>{err}</div>}
            {note && <div style={{ fontSize: 12.5, color: '#155724', background: '#EAF6EC', border: '1px solid #BFE3C6', borderRadius: 10, padding: '9px 12px', marginBottom: 12, lineHeight: 1.45 }}>{note}</div>}

            <button type="submit" disabled={busy || !online}
              style={{ width: '100%', padding: '14px', borderRadius: 14, border: 'none', marginTop: 2,
                background: (busy || !online) ? '#E1E1E6' : 'var(--forest)', color: (busy || !online) ? '#9CA3AF' : 'var(--green-light)',
                cursor: (busy || !online) ? 'default' : 'pointer', fontFamily: 'DM Sans,sans-serif', fontWeight: 700, fontSize: 15 }}>
              {busy ? 'One moment…' : !online ? 'Waiting for a connection…' : MODES[mode]}
            </button>
          </form>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 16, flexWrap: 'wrap', gap: 8 }}>
            {mode === 'in' ? (
              <>
                <button style={linkBtn} onClick={() => { setMode('up'); setErr(''); setNote('') }}>Create an account</button>
                <button style={linkBtn} onClick={() => { setMode('reset'); setErr(''); setNote('') }}>Forgot password?</button>
              </>
            ) : (
              <button style={linkBtn} onClick={() => { setMode('in'); setErr(''); setNote('') }}>← Back to sign in</button>
            )}
          </div>
        </div>

        <div style={{ textAlign: 'center', fontSize: 11, color: 'var(--muted)', marginTop: 18, lineHeight: 1.5 }}>
          Each account has its own private planner, hours and expense records.
        </div>
      </div>
    </div>
  )
}
