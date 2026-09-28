// src/components/VersionHistory.jsx
// Settings → Versions: Bloom's "See version history", like a Google Doc's.
// Every save is journaled on this device (src/lib/versions.js) and grouped into
// versions — bursts of editing. Restoring one puts the whole app back the way
// it was at the end of that version: tasks, events, labels, notes, thoughts,
// trackers, wellness, check-offs. The restore is itself a version, so it can be
// undone by restoring the one just before it.
//
// Different from Settings → History, which undoes one task/event change at a
// time and leaves everything else alone.
import { useEffect, useState, useCallback } from 'react'
import { listVersions, restoreTo, restoreToTime, changesSince, changesSinceTime, KEEP_MS } from '../lib/versions.js'

const QUICK = [
  { label: '15 min ago', ms: 15 * 60 * 1000 },
  { label: '1 hour ago', ms: 60 * 60 * 1000 },
  { label: '3 hours ago', ms: 3 * 60 * 60 * 1000 },
  { label: 'Yesterday', ms: 24 * 60 * 60 * 1000 },
]

const time = ts => new Date(ts).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
function dayLabel(ts) {
  const d = new Date(ts), now = new Date()
  const yst = new Date(now); yst.setDate(now.getDate() - 1)
  if (d.toDateString() === now.toDateString()) return 'Today'
  if (d.toDateString() === yst.toDateString()) return 'Yesterday'
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })
}
const when = ts => {
  const day = dayLabel(ts)
  return `${day === 'Today' ? '' : day + ', '}${time(ts)}`
}
function ago(ts) {
  const m = Math.round((Date.now() - ts) / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m} min ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h} hr ago`
  return null
}

const btn = {
  flexShrink: 0, fontSize: 12.5, fontWeight: 600, color: 'var(--forest)',
  background: 'var(--green-light)', border: '1px solid var(--border)',
  borderRadius: 9, padding: '7px 12px', cursor: 'pointer', fontFamily: 'DM Sans,sans-serif',
}

export default function VersionHistory() {
  const [versions, setVersions] = useState(null)
  const [open, setOpen] = useState({})
  const [busy, setBusy] = useState(null)   // message while a restore runs
  const [quickCounts, setQuickCounts] = useState({})

  const load = useCallback(async () => {
    try {
      setVersions(await listVersions())
      const counts = {}
      for (const q of QUICK) counts[q.label] = await changesSinceTime(Date.now() - q.ms)
      setQuickCounts(counts)
    } catch (e) {
      console.warn('[versions] could not load history:', e)
      setVersions([])
    }
  }, [])
  useEffect(() => { load() }, [load])

  const finish = (res) => {
    if (res.failed && res.failed.length) {
      alert(`Restored ${res.restored} change${res.restored === 1 ? '' : 's'}, but ${res.failed.length} couldn’t be put back:\n\n${res.failed.slice(0, 5).join('\n')}`)
    }
    setBusy('Restored — reloading Bloom…')
    // Everything has been written (or queued for the cloud); reloading reads
    // it all back fresh so every screen shows the restored state.
    setTimeout(() => window.location.reload(), 400)
  }

  const restoreVersion = async (v, isStart) => {
    const seq = isStart ? v.firstSeq - 1 : v.seq
    const count = await changesSince(seq)
    const whenTxt = isStart ? `before ${when(v.start)}` : `at ${when(v.end)}`
    if (!window.confirm(`Restore Bloom to how it was ${whenTxt}?\n\nThis puts back ${count} change${count === 1 ? '' : 's'} made since. You can undo it — the restore shows up here as its own version.`)) return
    setBusy('Restoring…')
    try { finish(await restoreTo(seq, { targetTs: isStart ? v.start : v.end })) }
    catch (e) { setBusy(null); alert(`Couldn’t restore: ${(e && e.message) || e}`) }
  }

  const restoreQuick = async (q) => {
    const ts = Date.now() - q.ms
    const count = quickCounts[q.label] || 0
    if (!window.confirm(`Restore Bloom to how it was ${q.label === 'Yesterday' ? 'this time yesterday' : q.label} (${when(ts)})?\n\nThis puts back ${count} change${count === 1 ? '' : 's'} made since. You can undo it — the restore shows up here as its own version.`)) return
    setBusy('Restoring…')
    try { finish(await restoreToTime(ts)) }
    catch (e) { setBusy(null); alert(`Couldn’t restore: ${(e && e.message) || e}`) }
  }

  if (busy) {
    return (
      <div>
        <div className="page-title">Version history</div>
        <div style={{ padding: '40px 18px', textAlign: 'center', color: 'var(--muted)', fontSize: 14 }}>{busy}</div>
      </div>
    )
  }

  const days = []
  for (const v of versions || []) {
    const d = dayLabel(v.end)
    if (!days.length || days[days.length - 1].day !== d) days.push({ day: d, versions: [] })
    days[days.length - 1].versions.push(v)
  }
  const oldest = versions && versions.length ? versions[versions.length - 1] : null

  return (
    <div>
      <div className="page-title">Version history</div>
      <div className="page-sub">
        Every change you make on this device is saved here for {Math.round(KEEP_MS / 86400000)} days. Restore any version to put all of Bloom back the way it was then — tasks, events, labels, notes, thoughts, trackers, wellness and check-offs. Your look &amp; theme settings aren’t affected.
      </div>

      {versions === null ? (
        <div style={{ padding: 20, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>Loading…</div>
      ) : versions.length === 0 ? (
        <div style={{ padding: '28px 18px', textAlign: 'center', color: 'var(--muted)', fontSize: 13.5, lineHeight: 1.5 }}>
          No versions yet. As you make changes, they’ll collect here so you can roll the whole app back to any earlier point.
        </div>
      ) : (
        <>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.4, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 8 }}>Go back to</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 22 }}>
            {QUICK.map(q => {
              const n = quickCounts[q.label] || 0
              return (
                <button key={q.label} type="button" disabled={!n} onClick={() => restoreQuick(q)}
                  title={n ? `Undo ${n} change${n === 1 ? '' : 's'}` : 'Nothing changed since then'}
                  style={{ ...btn, opacity: n ? 1 : 0.45, cursor: n ? 'pointer' : 'default' }}>
                  {q.label}{n ? ` · ${n}` : ''}
                </button>
              )
            })}
          </div>

          {days.map(({ day, versions: vs }) => (
            <div key={day} style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.4, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 8 }}>{day}</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {vs.map(v => {
                  const current = v === versions[0]
                  const items = v.items
                  const shown = open[v.seq] ? items : items.slice(0, 3)
                  const rel = ago(v.end)
                  return (
                    <div key={v.seq} style={{
                      background: 'white', border: `1px solid ${current ? 'var(--forest)' : 'var(--border)'}`,
                      borderRadius: 12, padding: '10px 12px',
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>
                            {time(v.end)}
                            {rel && <span style={{ fontWeight: 400, color: 'var(--muted)', fontSize: 12 }}> · {rel}</span>}
                          </div>
                          {current && <div style={{ fontSize: 11, color: 'var(--forest)', fontWeight: 700, marginTop: 1 }}>Current version</div>}
                          {v.restore && (
                            <div style={{ fontSize: 11.5, color: '#2B6CB0', fontWeight: 600, marginTop: 1 }}>
                              Restored {v.restoredTo ? `the version from ${when(v.restoredTo)}` : 'an earlier version'}
                            </div>
                          )}
                        </div>
                        {!current && (
                          <button type="button" style={btn} onClick={() => restoreVersion(v, false)}>Restore</button>
                        )}
                      </div>
                      {!v.restore && items.length > 0 && (
                        <ul style={{ margin: '6px 0 0', padding: '0 0 0 16px', fontSize: 12.5, color: 'var(--muted)', lineHeight: 1.5 }}>
                          {shown.map((t, i) => <li key={i} style={{ overflowWrap: 'anywhere' }}>{t}</li>)}
                        </ul>
                      )}
                      {!v.restore && items.length > 3 && (
                        <button type="button" onClick={() => setOpen(o => ({ ...o, [v.seq]: !o[v.seq] }))}
                          style={{ fontSize: 12, color: 'var(--forest)', background: 'none', border: 'none', padding: '4px 0 0 16px', cursor: 'pointer', fontWeight: 600 }}>
                          {open[v.seq] ? 'Show less' : `+ ${items.length - 3} more`}
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          ))}

          {oldest && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 10, border: '1px dashed var(--border)',
              borderRadius: 12, padding: '10px 12px', marginTop: 4,
            }}>
              <div style={{ flex: 1, fontSize: 13, color: 'var(--muted)' }}>
                Before {when(oldest.start)} — the oldest point saved on this device
              </div>
              <button type="button" style={btn} onClick={() => restoreVersion(oldest, true)}>Restore</button>
            </div>
          )}
        </>
      )}
    </div>
  )
}

