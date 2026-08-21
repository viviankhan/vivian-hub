// src/components/History.jsx
// The "History" tab in Settings: a running list of the edits you've made to your
// tasks and events — adds, edits, and deletes — newest first. Each row can be
// undone ("delete this edit"), which reverses just that change; leaving it alone
// keeps it. Check-offs are intentionally not listed (they're not edits).
//
// The data + the reversal live in App (changeHistory / undoChange); this file is
// purely the presentation.

const KIND = {
  add:    { label: 'Added',   color: '#2F855A', bg: '#E7F5EC', border: '#B7E0C4' },
  edit:   { label: 'Edited',  color: '#2B6CB0', bg: '#E8F0FA', border: '#Bcd6F0' },
  delete: { label: 'Deleted', color: '#B4341F', bg: '#FBEBE7', border: '#F3C6BC' },
}

// "Today 2:45 PM" / "Yesterday 9:10 AM" / "Aug 18, 2:45 PM"
function when(ts) {
  const d = new Date(ts)
  if (isNaN(d)) return ''
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  const now = new Date()
  const sameDay = (a, b) => a.toDateString() === b.toDateString()
  const yst = new Date(now); yst.setDate(now.getDate() - 1)
  if (sameDay(d, now)) return `Today ${time}`
  if (sameDay(d, yst)) return `Yesterday ${time}`
  return `${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}, ${time}`
}

export default function History({ history = [], onUndo, onClear }) {
  const active = history.filter(h => !h.undone).length

  return (
    <div>
      <div className="page-title">History</div>
      <div className="page-sub">
        Recent changes to your tasks and events. Undo one to reverse just that change — anything you leave alone stays.
      </div>

      {history.length === 0 ? (
        <div style={{ padding: '28px 18px', textAlign: 'center', color: 'var(--muted)', fontSize: 13.5, lineHeight: 1.5 }}>
          No changes yet. As you add, edit, or delete tasks and events, they’ll show up here so you can roll any of them back.
        </div>
      ) : (
        <>
          {active > 0 && onClear && (
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
              <button type="button" onClick={onClear}
                style={{ fontSize: 12, color: 'var(--muted)', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', padding: '4px 2px' }}>
                Clear list
              </button>
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {history.map(h => {
              const k = KIND[h.kind] || KIND.edit
              return (
                <div key={h.id}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    background: 'white', border: '1px solid var(--border)', borderRadius: 12,
                    padding: '10px 12px', opacity: h.undone ? 0.55 : 1,
                  }}>
                  <span style={{
                    flexShrink: 0, fontSize: 10.5, fontWeight: 700, letterSpacing: 0.3,
                    color: k.color, background: k.bg, border: `1px solid ${k.border}`,
                    borderRadius: 7, padding: '3px 7px', textTransform: 'uppercase',
                  }}>{k.label}</span>

                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{
                      fontSize: 13.5, color: 'var(--text)', fontWeight: 500, lineHeight: 1.35,
                      overflowWrap: 'anywhere', textDecoration: h.undone ? 'line-through' : 'none',
                    }}>{h.label}</div>
                    <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
                      {h.entity === 'event' ? 'Event · ' : ''}{when(h.ts)}
                    </div>
                  </div>

                  {h.undone ? (
                    <span style={{ flexShrink: 0, fontSize: 11.5, color: 'var(--muted)', fontWeight: 600 }}>Undone</span>
                  ) : (
                    <button type="button" onClick={() => onUndo && onUndo(h.id)}
                      style={{
                        flexShrink: 0, fontSize: 12.5, fontWeight: 600, color: 'var(--forest)',
                        background: 'var(--green-light)', border: '1px solid var(--border)',
                        borderRadius: 9, padding: '7px 13px', cursor: 'pointer', fontFamily: 'DM Sans,sans-serif',
                      }}>Undo</button>
                  )}
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
