// src/components/Papers.jsx
// ─────────────────────────────────────────────────────────────
// The Papers tab: a shelf of scientific papers, each narrated by a pre-rendered
// voice, with the text following along. See PAPERS.md.
//
// App keeps this mounted once it has been opened, and only hides it when you
// switch tabs (`hidden`), so a paper keeps playing while you use the rest of
// Bloom. The open paper's player lives in PaperReader.
// ─────────────────────────────────────────────────────────────
import { useState, useEffect, useCallback } from 'react'
import { papersAvailable, listPapers, listProgress, narrationState } from '../lib/papers.js'
import { formatTime } from '../lib/paperText.js'
import PaperReader from './PaperReader.jsx'
import PaperAdd from './PaperAdd.jsx'

const OPEN_KEY = 'bloom_paper_open'

export default function Papers({ hidden, onShow }) {
  const [papers, setPapers] = useState(null)
  const [progress, setProgress] = useState({})
  const [err, setErr] = useState('')
  const [openId, setOpenId] = useState(() => { try { return localStorage.getItem(OPEN_KEY) || null } catch { return null } })
  const [view, setView] = useState(() => (openId ? 'reader' : 'library'))   // library | reader | add

  const refresh = useCallback(async () => {
    if (!papersAvailable) return
    try {
      const list = await listPapers()
      setPapers(list)
      setProgress(await listProgress(list.map(p => p.id)))
      setErr('')
    } catch (e) { setErr(e.message || 'Could not load your papers.') }
  }, [])

  useEffect(() => { if (!hidden) refresh() }, [hidden, refresh])

  // While something is waiting on the narrator, check back now and then.
  const waiting = (papers || []).some(p => narrationState(p) === 'pending' || narrationState(p) === 'updating')
  useEffect(() => {
    if (hidden || !waiting) return
    const id = setInterval(refresh, 30_000)
    return () => clearInterval(id)
  }, [hidden, waiting, refresh])

  const open = (id) => {
    setOpenId(id); setView('reader')
    try { localStorage.setItem(OPEN_KEY, id) } catch {}
    window.scrollTo({ top: 0 })
  }
  const toLibrary = () => { setView('library'); refresh(); window.scrollTo({ top: 0 }) }

  if (!papersAvailable) return hidden ? null : (
    <div>
      <h2 className="page-title">Papers</h2>
      <div className="papers-note">Papers need cloud sync (Supabase). See PAPERS.md.</div>
    </div>
  )

  return (
    <div style={hidden ? { display: 'none' } : undefined}>
      {view === 'library' && (
        <div className="papers-library">
          <div className="papers-lib-head">
            <div>
              <h2 className="page-title">Papers</h2>
              <div className="page-sub">Listen at the bench. Read by Alba.</div>
            </div>
            <button className="btn-primary" onClick={() => setView('add')}>Add paper</button>
          </div>
          {err && <div className="papers-note papers-note-error">{err}</div>}
          {papers === null && !err && <div className="papers-loading">Loading…</div>}
          {papers && !papers.length && (
            <div className="papers-empty">
              Nothing on the shelf yet. Add a PDF and it comes back as a walkthrough you can listen to.
            </div>
          )}
          <div className="papers-list">
            {(papers || []).map(p => <PaperCard key={p.id} p={p} prog={progress[p.id]} playing={p.id === openId} onOpen={() => open(p.id)} />)}
          </div>
        </div>
      )}

      {view === 'add' && (
        <PaperAdd onCancel={toLibrary} onSaved={(row) => { refresh(); if (row) open(row.id); else toLibrary() }} />
      )}

      {openId && (
        <PaperReader key={openId} paperId={openId}
          showText={view === 'reader'} compact={hidden || view === 'add'}
          onBack={toLibrary}
          onShowText={() => { onShow?.(); setView('reader') }}
          onChanged={(row) => setPapers(list => list && list.map(x => (x.id === row.id ? { ...x, ...row } : x)))}
          onDeleted={() => {
            setOpenId(null)
            try { localStorage.removeItem(OPEN_KEY) } catch {}
            toLibrary()
          }} />
      )}
    </div>
  )
}

function PaperCard({ p, prog, playing, onOpen }) {
  const state = narrationState(p)
  const pos = prog?.position_seconds || 0
  let where = 'Not started'
  if (p.dur && pos >= p.dur - 5) where = 'Finished'
  else if (pos > 0) where = `Stopped at ${formatTime(pos)} · section ${(prog.section_index || 0) + 1}`
  else if (prog?.section_index > 0) where = `Stopped in section ${prog.section_index + 1}`
  const status = {
    ready: p.dur ? formatTime(p.dur) : 'Narrated',
    updating: 'Re-narrating',
    pending: 'Quick voice · Alba on its way',
    failed: 'Narration failed',
  }[state]
  return (
    <button className={`papers-card card ${playing ? 'is-open' : ''}`} onClick={onOpen}>
      <div className="papers-card-title">{p.title}</div>
      <div className="papers-meta">{[p.authors, p.journal, p.year].filter(Boolean).join(' · ')}</div>
      <div className="papers-card-foot">
        <span>{p.section_count} sections</span>
        <span className={`papers-badge is-${state}`}>{status}</span>
        {(state !== 'pending' || where !== 'Not started') && <span>{where}</span>}
      </div>
    </button>
  )
}
