// src/components/DayNote.jsx
// ─────────────────────────────────────────────────────────────
// "How did it go?" — the note for one task on one day: what it was like, how
// you felt, and photos. It lives in the task's edit sheet, under the task's
// own notes, and saves as you type (it isn't part of the task, so it never
// waits for "Save changes" and a daily task gets a fresh one every day).
// What's written here is what the ✨ assistant reads back when you ask
// "how did jogging feel?".
// ─────────────────────────────────────────────────────────────
import { useEffect, useRef, useState } from 'react'
import { getDayNote, setDayNote, LIFELOG_EVENT } from '../lib/lifelog.js'
import { MOODS } from '../lib/wellness.js'
import { PhotoAttacher } from './PhotoAttach.jsx'

function prettyDay(date) {
  const d = new Date(date + 'T12:00:00')
  const t = new Date(); t.setHours(12, 0, 0, 0)
  const diff = Math.round((t - d) / 86400000)
  if (diff === 0) return 'Today'
  if (diff === 1) return 'Yesterday'
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

export default function DayNote({ date, taskId, title = '', time = '', durationMins = null, isMed = false }) {
  const [text, setText] = useState('')
  const [photos, setPhotos] = useState([])
  const [mood, setMood] = useState(null)
  const [loaded, setLoaded] = useState(false)
  const [saved, setSaved] = useState('')
  const timer = useRef(null)
  const pending = useRef(null)
  const meta = { title, time, durationMins }

  useEffect(() => {
    let live = true
    getDayNote(date, taskId).then(n => {
      if (!live) return
      setText(n?.text || ''); setPhotos(n?.photos || []); setMood(n?.mood || null); setLoaded(true)
    })
    return () => { live = false }
  }, [date, taskId])

  const write = (patch) => {
    setDayNote(date, taskId, patch, meta).then(() => setSaved('Saved')).catch(() => setSaved('Couldn’t save — check your connection'))
  }
  const flush = () => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null }
    if (pending.current != null) { write({ text: pending.current }); pending.current = null }
  }
  useEffect(() => () => flush(), [])   // closing the sheet keeps the last words

  const onText = (v) => {
    setText(v); setSaved('')
    pending.current = v
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(flush, 700)
  }
  const onMood = (v) => { const next = mood === v ? null : v; setMood(next); write({ mood: next }) }
  const onPhotos = (ids) => { setPhotos(ids); write({ photos: ids }) }

  if (!date || !taskId) return null
  return (
    <div data-testid="day-note" style={{ marginTop:10, paddingTop:10, borderTop:'1px solid #F1EDF2' }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'baseline', gap:8 }}>
        <div style={{ fontSize:12, fontWeight:700, letterSpacing:.3, color:'var(--muted)', textTransform:'uppercase' }}>
          {prettyDay(date)} · {isMed ? 'How are you doing?' : 'How did it go?'}
        </div>
        <div style={{ fontSize:10.5, color:'var(--muted)' }}>{saved}</div>
      </div>
      <textarea value={text} onChange={e => onText(e.target.value)} onBlur={flush} disabled={!loaded}
        placeholder={isMed ? 'Side effects, ran out, skipped it on purpose… anything worth knowing.' : 'What it was like, how you felt, anything you’ll want to remember.'}
        rows={3}
        style={{ width:'100%', fontSize:14, padding:'8px 0 2px', border:'none', background:'transparent', resize:'vertical', lineHeight:1.5, fontFamily:'DM Sans,sans-serif', outline:'none', color:'var(--text)' }} />
      <div style={{ display:'flex', gap:6, flexWrap:'wrap', margin:'6px 0 8px' }} role="group" aria-label="Mood">
        {MOODS.map(m => (
          <button key={m.v} type="button" onClick={() => onMood(m.v)} aria-pressed={mood === m.v}
            style={{ padding:'5px 11px', borderRadius:14, fontSize:12, fontWeight:600, cursor:'pointer', fontFamily:'DM Sans,sans-serif',
              border: mood === m.v ? '1px solid transparent' : '1px solid var(--border)',
              background: mood === m.v ? m.color : 'white', color:'var(--text)' }}>
            {m.label}
          </button>
        ))}
      </div>
      <PhotoAttacher ids={photos} onChange={onPhotos} label="Add a photo" />
    </div>
  )
}

// Re-render hook for anything that shows lifelog data.
export function useLifelogVersion() {
  const [v, setV] = useState(0)
  useEffect(() => {
    const h = () => setV(x => x + 1)
    window.addEventListener(LIFELOG_EVENT, h)
    return () => window.removeEventListener(LIFELOG_EVENT, h)
  }, [])
  return v
}
