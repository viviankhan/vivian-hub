// src/components/Papers.jsx
// ─────────────────────────────────────────────────────────────
// The Papers tab: a shelf of scientific papers, each narrated by a pre-rendered
// voice, with the text following along. See PAPERS.md.
//
// App keeps this mounted once it has been opened, and only hides it when you
// switch tabs (`hidden`), so a paper keeps playing while you use the rest of
// Bloom. The open paper's player lives in PaperReader.
// ─────────────────────────────────────────────────────────────
import { useState, useEffect, useCallback, useRef } from 'react'
import { papersAvailable, listPapers, listProgress, narrationState, sendPdfToServer } from '../lib/papers.js'
import { formatTime } from '../lib/paperText.js'
import PaperReader from './PaperReader.jsx'
import PaperAdd from './PaperAdd.jsx'
import { readPdf, saveWalkthrough } from '../lib/paperImport.js'

const OPEN_KEY = 'bloom_paper_open'
// PDFs read side by side. Two keeps the free Gemini tier from refusing.
const PARALLEL = 2
const BUSY_RETRIES = 3

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
  const waiting = (papers || []).some(p => ['pending', 'updating', 'reading'].includes(narrationState(p)))
  useEffect(() => {
    if (hidden || !waiting) return
    const id = setInterval(refresh, 30_000)
    return () => clearInterval(id)
  }, [hidden, waiting, refresh])

  // ── Sending PDFs ─────────────────────────────────────────────
  // Each PDF is uploaded and handed to the server, which reads it with nobody
  // waiting: Bloom can be closed as soon as they're all sent. If the server
  // side isn't set up yet (see PAPERS.md), Bloom reads them itself instead,
  // which needs it kept open.
  const [uploads, setUploads] = useState([])   // { key, file, name, status, msg, error, paperId, tries, startedAt }
  const running = useRef(new Set())
  const serverOk = useRef(true)
  const wake = useRef(null)
  const addBatch = (files) => {
    const now = Date.now()
    setUploads(u => [...u, ...files.map((f, i) => ({ key: `${now}-${i}-${f.name}`, file: f, name: f.name.replace(/\.pdf$/i, ''), status: 'waiting', tries: 0 }))])
    setView('library')
  }
  const patchUpload = (key, fields) => setUploads(u => u.map(x => (x.key === key ? { ...x, ...fields } : x)))

  useEffect(() => {
    const busy = uploads.filter(x => ['uploading', 'reading', 'saving'].includes(x.status)).length
    const next = uploads.filter(x => x.status === 'waiting' && !running.current.has(x.key) && !(x.notBefore > Date.now()))
    next.slice(0, Math.max(0, PARALLEL - busy)).forEach(async (item) => {
      running.current.add(item.key)
      try {
        if (serverOk.current) {
          patchUpload(item.key, { status: 'uploading', startedAt: Date.now(), error: '' })
          try {
            const id = await sendPdfToServer(item.file)
            patchUpload(item.key, { status: 'sent', paperId: id, file: null })
            refresh()
            return
          } catch (e) {
            if (!e.setup) throw e
            serverOk.current = false          // not set up: read in the app from now on
          }
        }
        patchUpload(item.key, { status: 'reading', startedAt: Date.now(), error: '' })
        const { draft, figs } = await readPdf(item.file)
        patchUpload(item.key, { status: 'saving', name: draft.title || item.name })
        const row = await saveWalkthrough(draft, figs, msg => patchUpload(item.key, { msg }))
        figs.forEach(f => f?.url && URL.revokeObjectURL(f.url))
        patchUpload(item.key, { status: 'done', paperId: row.id, file: null })
        refresh()
      } catch (e) {
        const msg = e?.message || 'Could not read that PDF.'
        // The free AI tier sometimes says it's busy: wait and try again.
        if (/busy|429|rate/i.test(msg) && item.tries < BUSY_RETRIES) {
          patchUpload(item.key, { status: 'waiting', tries: item.tries + 1, msg: 'The AI is busy; trying again shortly…', notBefore: Date.now() + 30_000 })
          setTimeout(() => setUploads(u => [...u]), 30_500)
        } else patchUpload(item.key, { status: 'failed', error: msg })
      } finally { running.current.delete(item.key) }
    })
  }, [uploads, refresh])

  // Keep the screen awake while PDFs are being read: a locked phone pauses Bloom.
  const reading = uploads.some(x => ['waiting', 'uploading', 'reading', 'saving'].includes(x.status))
  useEffect(() => {
    if (!reading) { try { wake.current?.release() } catch {} wake.current = null; return }
    const grab = async () => { try { if (navigator.wakeLock && !wake.current) wake.current = await navigator.wakeLock.request('screen') } catch {} }
    const onVis = () => { if (document.visibilityState === 'visible') { wake.current = null; grab() } }
    grab()
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [reading])

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
          {uploads.length > 0 && (
            <UploadQueue uploads={uploads} reading={reading} onOpen={open}
              onRetry={key => patchUpload(key, { status: 'waiting', tries: 0, error: '', notBefore: 0 })}
              onDismiss={key => setUploads(u => u.filter(x => x.key !== key))}
              onClear={() => setUploads(u => u.filter(x => x.status !== 'done'))} />
          )}
          {papers === null && !err && <div className="papers-loading">Loading…</div>}
          {papers && !papers.length && !uploads.length && (
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
        <PaperAdd onCancel={toLibrary} onBatch={addBatch} onSaved={(row) => { refresh(); if (row) open(row.id); else toLibrary() }} />
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
    reading: 'Reading the PDF…',
    readfailed: 'Couldn’t read the PDF',
    ready: p.dur ? formatTime(p.dur) : 'Narrated',
    updating: 'Re-narrating',
    pending: 'Quick voice · Alba on its way',
    failed: 'Alba retrying',
  }[state]
  return (
    <button className={`papers-card card ${playing ? 'is-open' : ''}`} onClick={onOpen}>
      <div className="papers-card-title">{p.title}</div>
      <div className="papers-meta">{[p.authors, p.journal, p.year].filter(Boolean).join(' · ')}</div>
      <div className="papers-card-foot">
        {p.section_count > 0 && <span>{p.section_count} sections</span>}
        <span className={`papers-badge is-${state}`}>{status}</span>
        {!['reading', 'readfailed'].includes(state) && (state !== 'pending' || where !== 'Not started') && <span>{where}</span>}
      </div>
    </button>
  )
}

function UploadQueue({ uploads, reading, onOpen, onRetry, onDismiss, onClear }) {
  const [, tick] = useState(0)
  useEffect(() => {
    if (!reading) return
    const id = setInterval(() => tick(n => n + 1), 1000)
    return () => clearInterval(id)
  }, [reading])
  const left = uploads.filter(x => !['done', 'sent', 'failed'].includes(x.status)).length
  const done = uploads.filter(x => x.status === 'done' || x.status === 'sent').length
  const sent = uploads.some(x => x.status === 'sent')
  const local = uploads.some(x => ['reading', 'saving'].includes(x.status))
  return (
    <div className="papers-queue card">
      <div className="papers-queue-head">
        <strong>{left ? `Sending ${left} paper${left === 1 ? '' : 's'}` : sent ? 'All sent: you can close Bloom' : 'All read'}</strong>
        {done > 0 && !left && <button className="btn-ghost" onClick={onClear}>Clear</button>}
      </div>
      {left > 0 && !local && <div className="papers-hint">Keep Bloom open for a few seconds while they upload. After that it can be closed: they’re read on the server and appear on your shelf, then Alba narrates them.</div>}
      {local && <div className="papers-hint">Reading them here, because the server side isn’t set up yet (see PAPERS.md). Keep Bloom open until they’re done.</div>}
      {!left && sent && <div className="papers-hint">Each is read on the server in a minute or two and appears on your shelf; Alba narrates it after that.</div>}
      {uploads.map(x => (
        <div key={x.key} className={`papers-queue-row is-${x.status}`}>
          <span className="papers-queue-name">{x.name}</span>
          <span className="papers-queue-status">
            {x.status === 'waiting' && (x.msg || 'Waiting')}
            {x.status === 'uploading' && 'Uploading…'}
            {x.status === 'sent' && <button className="papers-queue-link" onClick={() => onOpen(x.paperId)}>Sent · reading on the server</button>}
            {x.status === 'reading' && `Reading… ${formatTime((Date.now() - x.startedAt) / 1000)}`}
            {x.status === 'saving' && (x.msg || 'Saving…')}
            {x.status === 'done' && <button className="papers-queue-link" onClick={() => onOpen(x.paperId)}>On your shelf · Open</button>}
            {x.status === 'failed' && <>
              <span className="papers-queue-error">{x.error}</span>
              <button className="papers-queue-link" onClick={() => onRetry(x.key)}>Retry</button>
              <button className="papers-queue-link" onClick={() => onDismiss(x.key)} aria-label="Dismiss">✕</button>
            </>}
          </span>
        </div>
      ))}
    </div>
  )
}
