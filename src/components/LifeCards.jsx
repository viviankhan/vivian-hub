// src/components/LifeCards.jsx
// ─────────────────────────────────────────────────────────────
// Informatics → Mind & body: the medications and journal cards. They
// cover the same date range as the rest of the page.
// ─────────────────────────────────────────────────────────────
import { useEffect, useState } from 'react'
import { gatherRecallData } from '../lib/recallData.js'
import { medAdherence } from '../lib/recall.js'
import { moodMeta } from '../lib/wellness.js'
import { useLifelogVersion } from './DayNote.jsx'
import { fmtStamp } from './Journal.jsx'

const toMs = (key, endOfDay = false) => { const [y, m, d] = key.split('-').map(Number); return new Date(y, m - 1, d + (endOfDay ? 1 : 0)).getTime() }
const shortDay = (key) => new Date(key + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })

export default function LifeCards({ from, to, phrase }) {
  const v = useLifelogVersion()
  const [data, setData] = useState(null)
  useEffect(() => { let live = true; gatherRecallData().then(d => { if (live) setData(d) }).catch(() => {}); return () => { live = false } }, [v])
  if (!data) return null
  const a = toMs(from), b = toMs(to, true), now = Date.now()
  const meds = medAdherence(data, a, b, now).filter(m => m.due)
  const journal = (data.journal || []).filter(j => { const t = Date.parse(j.at); return t >= a && t < b })

  return (
    <>
      <section className="in-card" data-testid="life-meds">
        <div className="in-card-head">
          <h3 className="serif">Medications</h3>
          <span className="in-card-meta">{phrase}</span>
        </div>
        {!meds.length ? (
          <p style={{ fontSize: 13, color: 'var(--muted)', margin: 0 }}>No medications set up. Open a med’s daily task → More options → turn on “Medication”.</p>
        ) : meds.map(m => (
          <div key={m.id} style={{ padding: '6px 0' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14 }}>
              <b>💊 {m.title}</b>
              <span style={{ color: m.taken < m.due ? '#B45309' : '#2F6B4F', fontWeight: 600 }}>{m.taken}/{m.due} taken</span>
            </div>
            <div style={{ height: 6, borderRadius: 3, background: 'var(--border)', marginTop: 5, display: 'flex', overflow: 'hidden' }}>
              <div style={{ width: `${(m.taken / Math.max(1, m.due)) * 100}%`, background: '#2F6B4F' }} />
              <div style={{ width: `${(m.skipped.length / Math.max(1, m.due)) * 100}%`, background: '#D97706' }} />
            </div>
            {m.skipped.map(s => (
              <div key={s.date} style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: 4, lineHeight: 1.45 }}>
                Skipped {shortDay(s.date)}{s.mood ? ` · mood ${moodMeta(s.mood).label}` : ''}{s.text ? ` — “${s.text}”` : ''}
              </div>
            ))}
            {m.late.map(l => (
              <div key={l.date} style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: 4 }}>
                Taken late {shortDay(l.date)}, at {new Date(l.at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
              </div>
            ))}
            {m.unanswered.length > 0 && (
              <div style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: 4 }}>
                Not answered: {m.unanswered.map(shortDay).join(', ')}
              </div>
            )}
          </div>
        ))}
      </section>

      <section className="in-card" data-testid="life-journal">
        <div className="in-card-head">
          <h3 className="serif">Journal</h3>
          <span className="in-card-meta">{journal.length} thought{journal.length === 1 ? '' : 's'} {phrase}</span>
        </div>
        {!journal.length ? (
          <p style={{ fontSize: 13, color: 'var(--muted)', margin: 0 }}>Nothing written {phrase}. Tap 💭 on Today to jot a thought.</p>
        ) : journal.slice(0, 6).map(j => (
          <div key={j.id} style={{ padding: '6px 0', borderTop: '1px solid var(--border)' }}>
            <div style={{ fontSize: 11.5, color: 'var(--muted)' }}>{fmtStamp(j.at)}{j.place ? ` · ${j.place}` : ''}{j.mood ? ` · ${moodMeta(j.mood).label}` : ''}</div>
            <div style={{ fontSize: 13.5, lineHeight: 1.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{j.text}</div>
          </div>
        ))}
      </section>

    </>
  )
}
