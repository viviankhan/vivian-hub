// src/components/LocationPanel.jsx
// ─────────────────────────────────────────────────────────────
// Where you are, and whether it lines up with the day (lib/locationCheck.js):
//
//   (Where you are and today's plans with a place live in PlacesDay.jsx.)
//   • <InboxCard> — tasks that needed a place and didn't happen there: do it
//     today, it's done, or remove it.
//   • <DidYouDoSheet> — a located task Bloom couldn't place you for: did you
//     do it? Yes ticks it; no sends it to the inbox.
// ─────────────────────────────────────────────────────────────
import { useEffect, useState } from 'react'

const clock = (t) => new Date(t).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
const dayWord = (date) => {
  const d = new Date(), k = (x) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`
  if (date === k(d)) return 'Today'
  const y = new Date(d); y.setDate(d.getDate() - 1)
  if (date === k(y)) return 'Yesterday'
  return new Date(date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}
const short = (n) => String(n || '').split(',')[0].trim()

const card = { background: '#fff', border: '1px solid var(--border)', borderRadius: 16, padding: '12px 14px', margin: '0 0 12px', boxShadow: '0 4px 14px rgba(60,72,88,.05)' }
const head = { fontSize: 10.5, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: 'var(--muted)' }
const smallBtn = (primary) => ({
  padding: '6px 11px', borderRadius: 12, fontSize: 12.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'DM Sans,sans-serif',
  border: primary ? 'none' : '1px solid var(--border)', background: primary ? 'var(--forest)' : 'white', color: primary ? 'var(--green-light)' : 'var(--text)',
})

export function InboxCard({ items = [], onToday, onDone, onRemove }) {
  if (!items.length) return null
  return (
    <section style={{ ...card, borderColor: '#F0D2A8', background: '#FFFBF4' }} data-testid="inbox-card">
      <div style={head}>📥 Inbox · {items.length} to do</div>
      <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>Tasks that needed a place and didn’t happen there.</div>
      {items.map(i => (
        <div key={i.id} data-testid="inbox-item" style={{ borderTop: '1px solid #F3E4CF', marginTop: 9, paddingTop: 9 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>{i.title}</div>
          <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 2, lineHeight: 1.4 }}>
            {dayWord(i.date)}{i.time ? ` ${i.time12}` : ''} at {short(i.place?.name) || 'its place'}
            {i.reason === 'elsewhere' ? ` · you were ${i.seen?.name ? `at ${short(i.seen.name)}` : 'somewhere else'}` : ' · you said you didn’t'}
          </div>
          <div style={{ display: 'flex', gap: 6, marginTop: 7, flexWrap: 'wrap' }}>
            <button type="button" data-testid="inbox-today" style={smallBtn(true)} onClick={() => onToday(i)}>Do today</button>
            <button type="button" data-testid="inbox-done" style={smallBtn(false)} onClick={() => onDone(i)}>Done</button>
            <button type="button" data-testid="inbox-remove" style={{ ...smallBtn(false), color: 'var(--muted)' }} onClick={() => onRemove(i)}>Remove</button>
          </div>
        </div>
      ))}
    </section>
  )
}

export function DidYouDoSheet({ pending = [], onYes, onNo, onLater }) {
  const t = pending[0]
  const [busy, setBusy] = useState(false)
  useEffect(() => { setBusy(false) }, [t?.key])
  if (!t) return null
  const btn = (primary) => ({
    width: '100%', padding: '13px', borderRadius: 14, fontFamily: 'DM Sans,sans-serif', fontWeight: 700, fontSize: 15, cursor: 'pointer',
    border: primary ? 'none' : '1px solid var(--border)', background: primary ? 'var(--forest)' : 'white', color: primary ? 'var(--green-light)' : 'var(--text)',
  })
  const act = (fn) => () => { if (busy) return; setBusy(true); fn(t) }
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(20,28,38,.45)', zIndex: 704, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
      <div data-testid="did-you-do-sheet" role="dialog" aria-label={`Did you do ${t.title}?`}
        style={{ background: '#F7F6FA', borderRadius: '22px 22px 0 0', width: '100%', maxWidth: 480, padding: '18px 16px calc(20px + env(safe-area-inset-bottom))', boxShadow: '0 -10px 44px rgba(20,40,60,.28)' }}>
        <div style={{ fontSize: 11, letterSpacing: 1.3, textTransform: 'uppercase', color: 'var(--muted)', fontWeight: 700 }}>
          📍 {dayWord(t.date)} {clock(t.startMs)} · {short(t.place.name)}{pending.length > 1 ? ` · 1 of ${pending.length}` : ''}
        </div>
        <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--text)', margin: '6px 0 4px', fontFamily: 'DM Sans,sans-serif' }}>Did you do {t.title}?</div>
        <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 14 }}>Bloom didn’t get a check-in to tell where you were.</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <button type="button" data-testid="did-yes" style={btn(true)} onClick={act(onYes)}>Yes, I did</button>
          <button type="button" data-testid="did-no" style={btn(false)} onClick={act(onNo)}>No — put it in my inbox</button>
        </div>
        <button type="button" data-testid="did-later" onClick={() => onLater(t)}
          style={{ display: 'block', margin: '12px auto 0', border: 'none', background: 'none', color: 'var(--muted)', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'DM Sans,sans-serif' }}>Ask me later</button>
      </div>
    </div>
  )
}
