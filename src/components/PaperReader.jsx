// src/components/PaperReader.jsx
// ─────────────────────────────────────────────────────────────
// One paper: the text with the spoken sentence highlighted, and the player.
//
// The player is a real <audio controls> element in the DOM (never
// `new Audio()`): iOS treats a native element far more permissively, and it is
// what gives lock-screen and headphone controls. The Media Session handlers
// below fill in the lock screen's title and buttons. There is no speech-
// synthesis anywhere — a paper without audio is shown as text only.
//
// This component stays mounted while you look at the library or another Bloom
// tab (the parent just hides the text), so the audio keeps playing; `compact`
// swaps the full player bar for a small pill.
// ─────────────────────────────────────────────────────────────
import { useState, useEffect, useRef, useCallback, useMemo, Fragment } from 'react'
import { createPortal } from 'react-dom'
import {
  getPaper, loadProgress, saveProgress, signedAudioUrl, signedFigureUrl,
  updatePaper, deletePaper, uploadFigure, removeFigure, requestNarration, narrationState,
} from '../lib/papers.js'
import { findCue, sectionStart, sectionAt, paragraphs, bodyParagraphs, markTerms, formatTime, CUE_HEADING, CUE_FIGURE } from '../lib/paperText.js'
import { imageFileToBlob } from '../lib/pdfFigures.js'

const RATES = [0.8, 0.9, 1, 1.1, 1.2, 1.35, 1.5, 1.75, 2]
const RATE_KEY = 'bloom_paper_rate'
const SAVE_EVERY_MS = 4000
const SEEK_BACK = 15, SEEK_FWD = 30
const ARTWORK = [{ src: (import.meta.env.BASE_URL || '/') + 'icon-512.png', sizes: '512x512', type: 'image/png' }]

function loadRate() {
  try { const r = Number(localStorage.getItem(RATE_KEY)); return RATES.includes(r) ? r : 1 } catch { return 1 }
}

// setPositionState throws if duration is 0/NaN/Infinity or position > duration.
function pushPosition(a) {
  const ms = typeof navigator !== 'undefined' ? navigator.mediaSession : null
  if (!a || !ms || typeof ms.setPositionState !== 'function') return
  const d = a.duration
  if (!Number.isFinite(d) || d <= 0) return
  try {
    ms.setPositionState({ duration: d, playbackRate: a.playbackRate || 1, position: Math.min(Math.max(0, a.currentTime || 0), d) })
  } catch { /* some engines reject edge values; the next event retries */ }
}

export default function PaperReader({ paperId, showText, compact, onBack, onShowText, onChanged, onDeleted }) {
  const [paper, setPaper] = useState(null)
  const [err, setErr] = useState('')
  const [src, setSrc] = useState('')
  const [cueIdx, setCueIdx] = useState(-1)
  const [playing, setPlaying] = useState(false)
  const [rate, setRate] = useState(loadRate)
  const [term, setTerm] = useState(null)
  const [figEdit, setFigEdit] = useState(null)   // section index being edited
  const [navOffset, setNavOffset] = useState(0)
  const [barH, setBarH] = useState(0)

  const audioRef = useRef(null)
  const barRef = useRef(null)
  const paperRef = useRef(null)
  const lastSave = useRef(0)
  const lastSection = useRef(-1)
  const pendingSeek = useRef(null)
  const userScrollAt = useRef(0)
  const resigned = useRef(false)
  paperRef.current = paper

  const cues = paper?.cues || null

  // ── Load ─────────────────────────────────────────────────────
  useEffect(() => {
    let dead = false
    setPaper(null); setSrc(''); setErr(''); setCueIdx(-1); resigned.current = false
    ;(async () => {
      try {
        const [p, prog] = await Promise.all([getPaper(paperId), loadProgress(paperId)])
        if (dead) return
        setPaper(p)
        const pos = prog?.position_seconds || 0
        if (pos > 0 && !(p.dur && pos >= p.dur - 2)) pendingSeek.current = pos
        lastSection.current = prog?.section_index ?? -1
        // Put the text where you stopped. (iOS won't load the audio's metadata
        // until you press play, so the highlight can't do this on open.)
        if (prog?.section_index > 0) {
          setTimeout(() => document.getElementById(`paper-sec-${prog.section_index}`)?.scrollIntoView({ block: 'start' }), 60)
        }
        if (p.audio_path) {
          const url = await signedAudioUrl(p.audio_path)
          if (!dead) setSrc(url)
        }
      } catch (e) { if (!dead) setErr(e.message || 'Could not open this paper.') }
    })()
    return () => { dead = true }
  }, [paperId])

  // ── Saving the position ──────────────────────────────────────
  const save = useCallback((force) => {
    const a = audioRef.current, p = paperRef.current
    if (!a || !p || !p.audio_path) return
    const now = Date.now()
    if (!force && now - lastSave.current < SAVE_EVERY_MS) return
    lastSave.current = now
    saveProgress(p.id, a.currentTime, sectionAt(p.cues, a.currentTime))
  }, [])

  useEffect(() => {
    const onHide = () => { if (document.visibilityState === 'hidden') save(true) }
    const onPageHide = () => save(true)
    document.addEventListener('visibilitychange', onHide)
    window.addEventListener('pagehide', onPageHide)
    return () => {
      document.removeEventListener('visibilitychange', onHide)
      window.removeEventListener('pagehide', onPageHide)
      save(true)
    }
  }, [save])

  // ── Audio events ─────────────────────────────────────────────
  const syncCue = useCallback(() => {
    const a = audioRef.current, p = paperRef.current
    if (!a || !p) return
    const k = findCue(p.cues, a.currentTime)
    setCueIdx(prev => (prev === k ? prev : k))
    const s = k < 0 ? 0 : p.cues[k].s
    if (s !== lastSection.current) {
      const first = lastSection.current === -1
      lastSection.current = s
      if (!first) save(true)
    }
  }, [save])

  const onLoadedMetadata = () => {
    const a = audioRef.current
    a.defaultPlaybackRate = rate
    a.playbackRate = rate
    if (pendingSeek.current != null) {
      a.currentTime = Math.min(pendingSeek.current, Math.max(0, (a.duration || 0) - 1))
      pendingSeek.current = null
    }
    syncCue()
    pushPosition(a)
  }
  const onTimeUpdate = () => { syncCue(); if (!audioRef.current.paused) save(false) }
  const onPlay = () => {
    setPlaying(true)
    const ms = navigator.mediaSession
    if (ms) { try { ms.playbackState = 'playing' } catch {} }
    // Safari 17+: declare this as media playback, so the ring/silent switch
    // doesn't mute it and it isn't treated as incidental page sound.
    try { if (navigator.audioSession) navigator.audioSession.type = 'playback' } catch {}
    setMetadata()
    pushPosition(audioRef.current)
  }
  const onPause = () => {
    setPlaying(false)
    const ms = navigator.mediaSession
    if (ms) { try { ms.playbackState = 'paused' } catch {} }
    save(true)
    pushPosition(audioRef.current)
  }
  const onSeeked = () => { syncCue(); pushPosition(audioRef.current) }
  const onRateChange = () => pushPosition(audioRef.current)
  const onEnded = () => save(true)
  // A signed URL can expire during a long pause. Re-sign once and carry on
  // from the same spot.
  const onError = async () => {
    const a = audioRef.current, p = paperRef.current
    if (!a || !p?.audio_path || resigned.current) return
    resigned.current = true
    pendingSeek.current = a.currentTime || pendingSeek.current
    try { setSrc(await signedAudioUrl(p.audio_path)) } catch {}
  }

  // ── Section navigation ───────────────────────────────────────
  const seekTo = useCallback((t, play) => {
    const a = audioRef.current
    if (!a || t == null) return
    a.currentTime = Math.max(0, t)
    if (play && a.paused) a.play().catch(() => {})
  }, [])

  const goSection = useCallback((dir) => {
    const a = audioRef.current, p = paperRef.current
    if (!a || !p?.cues) return
    const s = sectionAt(p.cues, a.currentTime)
    const here = sectionStart(p.cues, s) ?? 0
    let target
    if (dir < 0) target = a.currentTime - here > 3 ? s : s - 1
    else target = s + 1
    if (target < 0) target = 0
    const t = sectionStart(p.cues, target)
    if (t != null) seekTo(t)
  }, [seekTo])

  const skip = useCallback((d) => {
    const a = audioRef.current
    if (!a) return
    const max = Number.isFinite(a.duration) ? a.duration : Infinity
    a.currentTime = Math.min(max, Math.max(0, a.currentTime + d))
  }, [])

  // ── Media Session (lock screen, AirPods) ─────────────────────
  const setMetadata = useCallback(() => {
    const p = paperRef.current
    const ms = navigator.mediaSession
    if (!p || !ms || typeof window.MediaMetadata !== 'function') return
    try { ms.metadata = new window.MediaMetadata({ title: p.title, artist: p.authors, album: 'Read by Alba', artwork: ARTWORK }) } catch {}
  }, [])

  useEffect(() => {
    const ms = navigator.mediaSession
    if (!ms || !paper?.audio_path) return
    setMetadata()
    const a = () => audioRef.current
    const handlers = {
      play: () => a()?.play().catch(() => {}),
      pause: () => a()?.pause(),
      seekbackward: d => skip(-(d?.seekOffset || SEEK_BACK)),
      seekforward: d => skip(d?.seekOffset || SEEK_FWD),
      previoustrack: () => goSection(-1),
      nexttrack: () => goSection(1),
      seekto: d => {
        const el = a()
        if (!el || d?.seekTime == null) return
        if (d.fastSeek && typeof el.fastSeek === 'function') el.fastSeek(d.seekTime)
        else el.currentTime = d.seekTime
        pushPosition(el)
      },
    }
    for (const [k, fn] of Object.entries(handlers)) { try { ms.setActionHandler(k, fn) } catch {} }
    return () => { for (const k of Object.keys(handlers)) { try { ms.setActionHandler(k, null) } catch {} } }
  }, [paper?.audio_path, paper?.id, setMetadata, skip, goSection])

  // ── Speed ────────────────────────────────────────────────────
  const changeRate = (r) => {
    setRate(r)
    try { localStorage.setItem(RATE_KEY, String(r)) } catch {}
    const a = audioRef.current
    if (a) { a.defaultPlaybackRate = r; a.playbackRate = r }
  }

  // ── Keep the spoken sentence in view — only when it has drifted off ──
  useEffect(() => {
    const note = () => { userScrollAt.current = Date.now() }
    window.addEventListener('wheel', note, { passive: true })
    window.addEventListener('touchmove', note, { passive: true })
    return () => { window.removeEventListener('wheel', note); window.removeEventListener('touchmove', note) }
  }, [])

  useEffect(() => {
    if (!showText || compact || !cues || cueIdx < 0 || !playing) return
    if (Date.now() - userScrollAt.current < 5000) return   // you're reading elsewhere
    const c = cues[cueIdx]
    const el = document.querySelector(`[data-cue="${c.s}:${c.i}"]`)
    if (!el) return
    const r = el.getBoundingClientRect()
    const top = 72, bottom = window.innerHeight - barH - navOffset - 16
    if (r.top < top || r.bottom > bottom) el.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [cueIdx, cues, showText, compact, playing, barH, navOffset])

  // ── Layout: sit above the mobile bottom bar; pad the text under us ──
  useEffect(() => {
    const measure = () => {
      const nav = document.querySelector('.bottom-nav:not(.bar-drag-preview)')
      setNavOffset(nav && getComputedStyle(nav).display !== 'none' ? nav.offsetHeight : 0)
      if (barRef.current) setBarH(barRef.current.offsetHeight)
    }
    measure()
    window.addEventListener('resize', measure)
    const ro = typeof ResizeObserver === 'function' && barRef.current ? new ResizeObserver(measure) : null
    if (ro) ro.observe(barRef.current)
    return () => { window.removeEventListener('resize', measure); ro?.disconnect() }
  }, [src, compact])

  // ── Edits ────────────────────────────────────────────────────
  const patch = async (fields) => {
    const next = await updatePaper(paper.id, fields)
    setPaper(next)
    onChanged?.(next)
    return next
  }

  const retryNarration = async () => {
    try { await patch({ narration_attempts: 0, narration_error: null }); requestNarration() }
    catch (e) { alert(e.message) }
  }

  const remove = async () => {
    if (!confirm(`Delete “${paper.title}”? Its audio and figures go too.`)) return
    try {
      audioRef.current?.pause()
      await deletePaper(paper)
      onDeleted?.(paper.id)
    } catch (e) { alert(e.message) }
  }

  // Captions are read aloud, so a figure change queues a fresh narration. The
  // old audio keeps playing until the new one is ready.
  const saveFigure = async (si, figure) => {
    const sections = paper.sections.map((s, i) => (i === si ? { ...s, figure } : s))
    const old = paper.sections[si]?.figure
    const captionChanged = (old?.caption || '') !== (figure?.caption || '')
    await patch({ sections, ...(captionChanged && paper.audio_path ? { needs_narration: true } : {}) })
    if (old?.path && old.path !== figure?.path) removeFigure(old.path)
    if (captionChanged) requestNarration()
  }

  const state = paper ? narrationState(paper) : null
  const current = cues && cueIdx >= 0 ? cues[cueIdx] : null
  const curSection = current ? current.s : 0
  const canPlay = !!src

  if (err) return showText ? (
    <div className="papers-reader">
      <button className="papers-back" onClick={onBack}>‹ Library</button>
      <div className="papers-note papers-note-error">{err}</div>
    </div>
  ) : null
  if (!paper) return showText ? <div className="papers-loading">Opening…</div> : null

  return (
    <>
      {showText && (
        <article className="papers-reader">
          <button className="papers-back" onClick={onBack}>‹ Library</button>
          <header className="papers-reader-head">
            <h2 className="papers-title">{paper.title}</h2>
            <div className="papers-meta">{[paper.authors, paper.journal, paper.year].filter(Boolean).join(' · ')}</div>
            {paper.doi && <a className="papers-doi" href={`https://doi.org/${paper.doi}`} target="_blank" rel="noreferrer">doi:{paper.doi}</a>}
          </header>

          {state === 'pending' && (
            <div className="papers-note">Narration pending. The text is all here; the audio usually arrives within about 15 minutes of adding a paper.</div>
          )}
          {state === 'updating' && (
            <div className="papers-note">A figure caption changed, so a new narration is on its way. This one plays until it lands.</div>
          )}
          {state === 'failed' && (
            <div className="papers-note papers-note-error">
              Narration failed: {paper.narration_error}
              <button className="btn-ghost" style={{ marginLeft: 10 }} onClick={retryNarration}>Try again</button>
            </div>
          )}

          {paper.sections.map((sec, si) => (
            <section key={si} id={`paper-sec-${si}`} className={`papers-section ${canPlay && curSection === si ? 'is-playing' : ''}`}>
              <button type="button" className={`papers-sec-head ${current && current.s === si && current.i === CUE_HEADING ? 'is-current' : ''}`}
                data-cue={`${si}:${CUE_HEADING}`}
                disabled={!canPlay}
                onClick={() => seekTo(sectionStart(cues, si), true)}
                title={canPlay ? 'Play from this section' : undefined}>
                <span className="papers-sec-num">{si + 1}</span>
                <span className="papers-sec-heading">{sec.heading || `Section ${si + 1}`}</span>
                {canPlay && <span className="papers-sec-play" aria-hidden="true">▶</span>}
              </button>

              <div className="papers-body">
                {Array.isArray(sec.lines) && sec.lines.length
                  ? paragraphs(sec).map((para, pi) => (
                    <p key={pi}>
                      {para.map(({ i, text }) => (
                        <Fragment key={i}>
                          <span data-cue={`${si}:${i}`} className={`papers-line ${current && current.s === si && current.i === i ? 'is-current' : ''}`}>
                            <Marked text={text} terms={paper.terms} onTerm={setTerm} />
                          </span>{' '}
                        </Fragment>
                      ))}
                    </p>
                  ))
                  : bodyParagraphs(sec).map((t, pi) => <p key={pi}><Marked text={t} terms={paper.terms} onTerm={setTerm} /></p>)}
              </div>

              {sec.figure?.path ? (
                <Figure fig={sec.figure} current={current && current.s === si && current.i === CUE_FIGURE}
                  cueKey={`${si}:${CUE_FIGURE}`} onEdit={() => setFigEdit(si)} />
              ) : (
                <button className="papers-add-fig" onClick={() => setFigEdit(si)}>+ Attach a figure</button>
              )}
            </section>
          ))}

          {paper.terms?.length > 0 && (
            <section className="papers-glossary">
              <h3>Key terms</h3>
              <dl>
                {paper.terms.map((t, i) => <Fragment key={i}><dt>{t.term}</dt><dd>{t.def}</dd></Fragment>)}
              </dl>
            </section>
          )}

          <div className="papers-reader-foot">
            <button className="btn-danger" onClick={remove}>Delete paper</button>
          </div>
          <div style={{ height: (canPlay ? barH : 0) + 24 }} />
        </article>
      )}

      {/* The one audio element. Always in the DOM while a paper is open, even
          when its bar is hidden, so playback survives tab and view changes. */}
      {canPlay && (
        <div ref={barRef} className={`papers-player ${compact ? 'is-hidden' : ''}`} style={{ bottom: navOffset, paddingBottom: navOffset ? 8 : undefined }}>
          <div className="papers-player-top">
            <button className="papers-player-title" onClick={onShowText} title="Show the text">
              <span className="papers-player-paper">{paper.title}</span>
              <span className="papers-player-sec">§{curSection + 1} {paper.sections[curSection]?.heading || ''}</span>
            </button>
            <select className="papers-rate" value={rate} onChange={e => changeRate(Number(e.target.value))} aria-label="Playback speed">
              {RATES.map(r => <option key={r} value={r}>{r}×</option>)}
            </select>
          </div>
          <audio ref={audioRef} controls preload="metadata" playsInline src={src}
            onLoadedMetadata={onLoadedMetadata} onTimeUpdate={onTimeUpdate}
            onPlay={onPlay} onPause={onPause} onSeeked={onSeeked} onRateChange={onRateChange}
            onEnded={onEnded} onError={onError} />
          <div className="papers-player-btns">
            <button onClick={() => skip(-SEEK_BACK)} aria-label="Back 15 seconds">↺ 15</button>
            <button onClick={() => goSection(-1)} aria-label="Previous section">⏮ §</button>
            <button onClick={() => goSection(1)} aria-label="Next section">§ ⏭</button>
            <button onClick={() => skip(SEEK_FWD)} aria-label="Forward 30 seconds">30 ↻</button>
          </div>
        </div>
      )}

      {canPlay && compact && playing && createPortal(
        <div className="papers-pill" style={{ bottom: navOffset + 12 }}>
          <button className="papers-pill-toggle" onClick={() => audioRef.current?.pause()} aria-label="Pause">❚❚</button>
          <button className="papers-pill-title" onClick={onShowText}>
            {paper.title}
            <span>{formatTime(audioRef.current?.currentTime)} · §{curSection + 1}</span>
          </button>
        </div>,
        document.body)}

      {term && (
        <div className="papers-sheet-scrim" onClick={() => setTerm(null)}>
          <div className="papers-sheet" style={{ bottom: navOffset + (canPlay && !compact ? barH : 0) }} onClick={e => e.stopPropagation()}>
            <div className="papers-sheet-term">{term.term}</div>
            <div className="papers-sheet-def">{term.def}</div>
            <button className="btn-ghost" onClick={() => setTerm(null)}>Close</button>
          </div>
        </div>
      )}

      {figEdit != null && (
        <FigureEditor paperId={paper.id} si={figEdit} fig={paper.sections[figEdit]?.figure}
          onClose={() => setFigEdit(null)}
          onSave={async (f) => { await saveFigure(figEdit, f); setFigEdit(null) }} />
      )}
    </>
  )
}

function Marked({ text, terms, onTerm }) {
  const segs = useMemo(() => markTerms(text, terms), [text, terms])
  return segs.map((s, k) => s.term
    ? <button key={k} type="button" className="papers-term" onClick={e => { e.stopPropagation(); onTerm(s.term) }}>{s.text}</button>
    : <Fragment key={k}>{s.text}</Fragment>)
}

function useSignedFigure(path) {
  const [url, setUrl] = useState('')
  useEffect(() => {
    let dead = false
    setUrl('')
    if (path) signedFigureUrl(path).then(u => { if (!dead) setUrl(u) }, () => {})
    return () => { dead = true }
  }, [path])
  return url
}

function Figure({ fig, current, cueKey, onEdit }) {
  const url = useSignedFigure(fig.path)
  const [zoom, setZoom] = useState(false)
  return (
    <figure className="papers-figure">
      {url ? <img src={url} alt={fig.caption || 'Figure'} onClick={() => setZoom(true)} /> : <div className="papers-figure-ph">Loading figure…</div>}
      {fig.caption && <figcaption data-cue={cueKey} className={current ? 'is-current' : ''}>{fig.caption}</figcaption>}
      <button className="papers-fig-edit" onClick={onEdit}>Edit figure</button>
      {zoom && url && createPortal(
        <div className="papers-zoom" onClick={() => setZoom(false)}><img src={url} alt="" /></div>, document.body)}
    </figure>
  )
}

function FigureEditor({ paperId, si, fig, onClose, onSave }) {
  const [caption, setCaption] = useState(fig?.caption || '')
  const [blob, setBlob] = useState(null)
  const [preview, setPreview] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const existing = useSignedFigure(blob ? null : fig?.path)
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview) }, [preview])

  const pick = async (e) => {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    try {
      const b = await imageFileToBlob(f)
      setBlob(b); setPreview(URL.createObjectURL(b))
    } catch (x) { setMsg(x.message) }
  }
  const save = async () => {
    setBusy(true); setMsg('')
    try {
      const path = blob ? await uploadFigure(paperId, si, blob) : fig?.path
      if (!path) { setMsg('Choose an image first.'); setBusy(false); return }
      await onSave({ path, caption: caption.trim() })
    } catch (x) { setMsg(x.message); setBusy(false) }
  }
  const clear = async () => {
    if (!confirm('Remove this figure?')) return
    setBusy(true)
    try { await onSave(null) } catch (x) { setMsg(x.message); setBusy(false) }
  }

  return (
    <div className="papers-sheet-scrim" onClick={busy ? undefined : onClose}>
      <div className="papers-modal" onClick={e => e.stopPropagation()}>
        <h3>Figure for section {si + 1}</h3>
        {(preview || existing) && <img className="papers-modal-img" src={preview || existing} alt="" />}
        <label className="btn-ghost papers-file-btn">
          {fig?.path || blob ? 'Replace image' : 'Choose an image'}
          <input type="file" accept="image/*" onChange={pick} hidden />
        </label>
        <div className="papers-hint">A screenshot cropped from the PDF works best.</div>
        <label className="papers-field">
          <span>Caption, in your own words (read aloud after the section)</span>
          <textarea rows={3} value={caption} onChange={e => setCaption(e.target.value)} />
        </label>
        {msg && <div className="papers-note papers-note-error">{msg}</div>}
        <div className="papers-modal-btns">
          {fig?.path && <button className="btn-danger" disabled={busy} onClick={clear}>Remove</button>}
          <span style={{ flex: 1 }} />
          <button className="btn-ghost" disabled={busy} onClick={onClose}>Cancel</button>
          <button className="btn-primary" disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save'}</button>
        </div>
      </div>
    </div>
  )
}
