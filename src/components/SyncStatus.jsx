// src/components/SyncStatus.jsx
// A small, quiet status pill for the one thing the user genuinely needs to know
// about offline mode: that their edits are safe.
//
// It stays out of the way — nothing is shown at all when online with an empty
// queue, which is almost always. It appears when the network drops, when
// changes are waiting to upload, or briefly to confirm that they went up.
import { useEffect, useState } from 'react'
import { subscribe, getStatus, flush } from '../lib/offline.js'

// How long the "all synced" confirmation stays up after the queue drains.
const CONFIRM_MS = 4000

export default function SyncStatus() {
  const [status, setStatus] = useState(getStatus)
  const [justSynced, setJustSynced] = useState(false)

  useEffect(() => subscribe(next => {
    setStatus(prev => {
      // The moment the last queued change goes up, show a short confirmation —
      // otherwise the pill would simply vanish and the user would be left
      // wondering whether their offline edits actually made it.
      if (prev.pending > 0 && next.pending === 0 && next.online) {
        setJustSynced(true)
        setTimeout(() => setJustSynced(false), CONFIRM_MS)
      }
      return next
    })
  }), [])

  const { online, pending, syncing } = status
  if (online && pending === 0 && !justSynced) return null

  const tone = !online
    ? { bg: '#FFF4E5', border: '#F5D9AE', fg: '#8A5A00' }   // offline — amber, not alarming
    : pending > 0
      ? { bg: '#EAF2FB', border: '#C6DCF3', fg: '#1F4E79' } // uploading — calm blue
      : { bg: '#EAF6EC', border: '#BFE3C6', fg: '#155724' } // done — green

  const label = !online
    ? (pending > 0
        ? `Offline · ${pending} change${pending === 1 ? '' : 's'} saved here`
        : 'Offline · your planner still works')
    : syncing || pending > 0
      ? `Syncing ${pending} change${pending === 1 ? '' : 's'}…`
      : 'All changes synced'

  // Tapping while offline-with-a-queue is a "try now" — useful on the flaky
  // connections where the browser insists it's online and nothing goes through.
  const retryable = pending > 0
  return (
    <div
      role="status"
      aria-live="polite"
      onClick={retryable ? () => flush() : undefined}
      title={retryable ? 'Tap to try uploading now' : undefined}
      style={{
        position: 'fixed', left: '50%', transform: 'translateX(-50%)',
        bottom: 'calc(env(safe-area-inset-bottom, 0px) + 78px)',
        zIndex: 900, maxWidth: 'calc(100vw - 32px)',
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '8px 14px', borderRadius: 999,
        background: tone.bg, border: `1px solid ${tone.border}`, color: tone.fg,
        fontFamily: 'DM Sans, sans-serif', fontSize: 12.5, fontWeight: 600,
        boxShadow: '0 6px 20px rgba(42,72,88,.14)',
        cursor: retryable ? 'pointer' : 'default',
        pointerEvents: retryable ? 'auto' : 'none',
        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
      }}
    >
      <span aria-hidden="true" style={{
        width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
        background: tone.fg, opacity: syncing ? 1 : .65,
        animation: syncing ? 'bloom-sync-pulse 1.1s ease-in-out infinite' : 'none',
      }} />
      {label}
      <style>{'@keyframes bloom-sync-pulse{0%,100%{opacity:.3}50%{opacity:1}}'}</style>
    </div>
  )
}
