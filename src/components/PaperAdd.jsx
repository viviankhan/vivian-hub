// src/components/PaperAdd.jsx
// ─────────────────────────────────────────────────────────────
// Getting papers onto the shelf, two ways:
//
//   • A PDF. It goes to the paper-walkthrough Edge Function, where Gemini
//     reads the whole thing (figures included) and writes the spoken
//     walkthrough, pointing at a figure for the sections that have one. The
//     figures are cropped here with pdf.js, and you review everything, crops
//     and captions included, before it's saved.
//   • A JSON export (e.g. the prototype's papers.json).
//
// Either way the paper is saved as text first and narrated afterwards by the
// narrator (see PAPERS.md), which is pinged right away.
// ─────────────────────────────────────────────────────────────
import { useState, useEffect, useRef } from 'react'
import { insertPaper, requestNarration, describeFigure } from '../lib/papers.js'
import { readPdf, saveWalkthrough, cutFigure } from '../lib/paperImport.js'
import { renderPage, imageFileToBlob } from '../lib/pdfFigures.js'
import { paperFromImport, sectionsFromText, estimateMinutes } from '../lib/paperText.js'

export default function PaperAdd({ onCancel, onSaved, onBatch }) {
  const [step, setStep] = useState('pick')   // pick | reading | review | import | paste | saving
  // Off: PDFs go to the server and Bloom can be closed. On: read here and
  // shown for checking before saving (Bloom stays open about a minute).
  const [reviewFirst, setReviewFirst] = useState(false)
  const [err, setErr] = useState('')
  const [elapsed, setElapsed] = useState(0)
  const [draft, setDraft] = useState(null)   // walkthrough being reviewed
  const [figs, setFigs] = useState([])       // per section: figure | null
  const [doc, setDoc] = useState(null)       // the pdf.js document
  const [crop, setCrop] = useState(null)     // section index in the crop editor
  const [imports, setImports] = useState([]) // [{ paper, keep, note }]
  const [saveMsg, setSaveMsg] = useState('')

  useEffect(() => {
    if (step !== 'reading') return
    const t0 = Date.now()
    const id = setInterval(() => setElapsed(Math.round((Date.now() - t0) / 1000)), 1000)
    return () => clearInterval(id)
  }, [step])

  // Free the preview images when we're done.
  const figsRef = useRef(figs)
  figsRef.current = figs
  useEffect(() => () => figsRef.current.forEach(f => f?.url && URL.revokeObjectURL(f.url)), [])

  const pickPdf = async (e) => {
    const files = [...(e.target.files || [])]
    e.target.value = ''
    if (!files.length) return
    // Several at once: they're read and saved in the background, no review
    // step, while you carry on. Figures and text can be edited afterwards.
    if (onBatch && (files.length > 1 || !reviewFirst)) { onBatch(files); return }
    setErr(''); setStep('reading'); setElapsed(0)
    try {
      const { draft: d, figs: f, doc: pdf } = await readPdf(files[0])
      setDoc(pdf)
      setDraft(d)
      setFigs(f)
      setStep('review')
    } catch (x) {
      setErr(x.message || 'Could not read that PDF.')
      setStep('pick')
    }
  }

  const pickJson = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setErr('')
    try {
      const data = JSON.parse(await file.text())
      const list = (Array.isArray(data) ? data : [data]).map(paperFromImport).filter(Boolean)
      if (!list.length) throw new Error('No papers found in that file.')
      setImports(list.map(p => {
        // The prototype's "How this library works" explainer describes the
        // artifact (browser voices, "send it in chat"), not Bloom.
        const explainer = /^start here$/i.test(p.journal)
        return { paper: p, keep: !explainer, note: explainer ? 'Describes the old prototype, not Bloom' : '' }
      }))
      setStep('import')
    } catch (x) { setErr(x.message || 'That file is not a papers export.') }
  }

  const saveDraft = async () => {
    setStep('saving'); setErr('')
    try { onSaved(await saveWalkthrough(draft, figs, setSaveMsg)) }
    catch (x) { setErr(x.message); setStep('review') }
  }

  const saveImports = async () => {
    setStep('saving'); setErr('')
    try {
      let last = null
      for (const { paper, keep } of imports) {
        if (!keep) continue
        setSaveMsg(`Importing “${paper.title}”…`)
        last = await insertPaper(paper)
      }
      requestNarration()
      onSaved(last)
    } catch (x) { setErr(x.message); setStep('import') }
  }

  const [describing, setDescribing] = useState(-1)
  const describeFor = async (i) => {
    setDescribing(i); setErr('')
    try {
      const d = await describeFigure(figs[i].blob, draft.sections[i]?.body || '')
      setFigs(prev => prev.map((f, j) => (j === i && f ? { ...f, caption: d } : f)))
    } catch (x) { setErr(x.message) } finally { setDescribing(-1) }
  }
  const setFig = (i, f) => setFigs(prev => {
    const next = [...prev]
    if (prev[i]?.url && prev[i].url !== f?.url) URL.revokeObjectURL(prev[i].url)
    next[i] = f
    return next
  })
  const uploadFor = async (i, e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    try {
      const blob = await imageFileToBlob(file)
      setFig(i, { caption: figs[i]?.caption || '', blob, url: URL.createObjectURL(blob) })
    } catch (x) { setErr(x.message) }
  }

  // ── Steps ────────────────────────────────────────────────────
  if (step === 'paste') return <PasteText onBack={() => setStep('pick')} onSaved={onSaved} />

  if (step === 'pick' || step === 'reading') return (
    <div className="papers-add">
      <button className="papers-back" onClick={onCancel} disabled={step === 'reading'}>‹ Library</button>
      <h2 className="page-title">Add a paper</h2>
      {step === 'reading' ? (
        <div className="papers-reading">
          <div className="papers-spinner" aria-hidden="true" />
          <div>Reading the paper, figures included, and writing the walkthrough… {elapsed}s</div>
          <div className="papers-hint">This usually takes 20 to 60 seconds.</div>
        </div>
      ) : (
        <>
          <label className="papers-drop">
            <strong>Choose PDFs</strong>
            <span>Pick one or several. Once they’ve uploaded (a few seconds) you can close Bloom: they’re read on the server, figures included, and appear on your shelf.</span>
            <input type="file" accept="application/pdf,.pdf" multiple onChange={pickPdf} hidden />
          </label>
          <label className="papers-check">
            <input type="checkbox" checked={reviewFirst} onChange={e => setReviewFirst(e.target.checked)} />
            <span>Let me check a single PDF’s walkthrough before it’s saved (keep Bloom open for about a minute)</span>
          </label>
          <button type="button" className="papers-drop" onClick={() => { setErr(''); setStep('paste') }}>
            <strong>Paste text</strong>
            <span>Any text you want read to you, word for word: notes, an article, a protocol. You can also open a .txt file.</span>
          </button>
          <label className="papers-drop papers-drop-quiet">
            <strong>Import a papers file (.json)</strong>
            <span>Walkthroughs exported from the old prototype, or anything in the same shape.</span>
            <input type="file" accept="application/json,.json" onChange={pickJson} hidden />
          </label>
          <div className="papers-hint">The PDF is sent to Google Gemini to write the walkthrough. Walkthroughs are an interpretation, not a transcript: check the PDF before you cite anything.</div>
        </>
      )}
      {err && <div className="papers-note papers-note-error">{err}</div>}
    </div>
  )

  if (step === 'import' || (step === 'saving' && !draft)) return (
    <div className="papers-add">
      <button className="papers-back" onClick={() => setStep('pick')} disabled={step === 'saving'}>‹ Back</button>
      <h2 className="page-title">Import papers</h2>
      <div className="papers-import-list">
        {imports.map((it, i) => (
          <label key={i} className="papers-import-row">
            <input type="checkbox" checked={it.keep} disabled={step === 'saving'}
              onChange={e => setImports(prev => prev.map((x, j) => (j === i ? { ...x, keep: e.target.checked } : x)))} />
            <span>
              <strong>{it.paper.title}</strong>
              <span className="papers-meta">{[it.paper.authors, it.paper.journal, it.paper.year].filter(Boolean).join(' · ')} · {it.paper.sections.length} sections</span>
              {it.note && <span className="papers-hint">{it.note}</span>}
            </span>
          </label>
        ))}
      </div>
      <div className="papers-hint">Imported papers arrive as text; the narrator renders their audio shortly after.</div>
      {err && <div className="papers-note papers-note-error">{err}</div>}
      <div className="papers-modal-btns">
        <span style={{ flex: 1 }} />
        <button className="btn-primary" disabled={step === 'saving' || !imports.some(x => x.keep)} onClick={saveImports}>
          {step === 'saving' ? saveMsg || 'Importing…' : `Import ${imports.filter(x => x.keep).length}`}
        </button>
      </div>
    </div>
  )

  // review / saving a PDF draft
  const busy = step === 'saving'
  const setMeta = (k, v) => setDraft(d => ({ ...d, [k]: v }))
  return (
    <div className="papers-add">
      <button className="papers-back" onClick={() => setStep('pick')} disabled={busy}>‹ Start over</button>
      <h2 className="page-title">Check the walkthrough</h2>
      <div className="papers-hint">Nothing is saved until you tap Save. Figures were cut from the PDF where the paper had one: adjust the crop, swap in your own screenshot, or remove it.</div>

      <div className="papers-meta-grid">
        <label className="papers-field papers-field-wide"><span>Title</span><input value={draft.title} onChange={e => setMeta('title', e.target.value)} /></label>
        <label className="papers-field"><span>Authors</span><input value={draft.authors} onChange={e => setMeta('authors', e.target.value)} /></label>
        <label className="papers-field"><span>Journal</span><input value={draft.journal} onChange={e => setMeta('journal', e.target.value)} /></label>
        <label className="papers-field"><span>Year</span><input value={draft.year} onChange={e => setMeta('year', e.target.value)} /></label>
        <label className="papers-field"><span>DOI</span><input value={draft.doi} onChange={e => setMeta('doi', e.target.value)} /></label>
      </div>

      {draft.sections.map((s, i) => (
        <section key={i} className="papers-section papers-review-sec">
          <div className="papers-sec-head is-static">
            <span className="papers-sec-num">{i + 1}</span>
            <input className="papers-sec-heading-input" value={s.heading}
              onChange={e => setDraft(d => ({ ...d, sections: d.sections.map((x, j) => (j === i ? { ...x, heading: e.target.value } : x)) }))} />
          </div>
          <div className="papers-body">{s.body.split(/\n\s*\n/).map((p, k) => <p key={k}>{p}</p>)}</div>

          {figs[i] ? (
            <figure className="papers-figure">
              <img src={figs[i].url} alt="" />
              <textarea className="papers-caption-input" rows={6} value={figs[i].caption} placeholder="Description, read aloud: walk through the figure for someone who can’t see it"
                onChange={e => setFig(i, { ...figs[i], caption: e.target.value })} />
              <div className="papers-fig-actions">
                <button className="btn-ghost" disabled={describing >= 0} onClick={() => describeFor(i)}>
                  {describing === i ? 'Describing…' : 'Describe with AI'}
                </button>
                {doc && <button className="btn-ghost" onClick={() => setCrop(i)}>Adjust crop</button>}
                <label className="btn-ghost papers-file-btn">Use my image<input type="file" accept="image/*" hidden onChange={e => uploadFor(i, e)} /></label>
                <button className="btn-ghost" onClick={() => setFig(i, null)}>Remove</button>
              </div>
            </figure>
          ) : (
            <div className="papers-fig-actions">
              {doc && <button className="btn-ghost" onClick={() => setCrop(i)}>+ Figure from the PDF</button>}
              <label className="btn-ghost papers-file-btn">+ Upload an image<input type="file" accept="image/*" hidden onChange={e => uploadFor(i, e)} /></label>
            </div>
          )}
        </section>
      ))}

      {draft.terms?.length > 0 && (
        <section className="papers-glossary">
          <h3>Key terms</h3>
          <dl>{draft.terms.map((t, i) => <div key={i}><dt>{t.term}</dt><dd>{t.def}</dd></div>)}</dl>
        </section>
      )}

      {err && <div className="papers-note papers-note-error">{err}</div>}
      <div className="papers-modal-btns papers-save-row">
        <button className="btn-ghost" onClick={onCancel} disabled={busy}>Discard</button>
        <span style={{ flex: 1 }} />
        <button className="btn-primary" onClick={saveDraft} disabled={busy}>{busy ? saveMsg || 'Saving…' : 'Save to shelf'}</button>
      </div>

      {crop != null && doc && (
        <FigureCropper doc={doc} page={figs[crop]?.page || 1} box={figs[crop]?.box || [120, 80, 560, 920]}
          onCancel={() => setCrop(null)}
          onDone={async (page, box) => {
            try {
              const { blob, url } = await cutFigure(doc, page, box, 0)
              setFig(crop, { page, box, caption: figs[crop]?.caption || '', blob, url })
            } catch (x) { setErr(x.message) }
            setCrop(null)
          }} />
      )}
    </div>
  )
}

// Drag a box over a rendered page. Box is [ymin, xmin, ymax, xmax] in 0–1000.
function FigureCropper({ doc, page: page0, box: box0, onCancel, onDone }) {
  const [page, setPage] = useState(page0)
  const [box, setBox] = useState(box0)
  const [img, setImg] = useState('')
  const wrap = useRef(null)
  const drag = useRef(null)

  useEffect(() => {
    let dead = false
    setImg('')
    renderPage(doc, page).then(c => { if (!dead) setImg(c.toDataURL('image/jpeg', 0.8)) }, () => {})
    return () => { dead = true }
  }, [doc, page])

  const pt = (e) => {
    const r = wrap.current.getBoundingClientRect()
    return [((e.clientY - r.top) / r.height) * 1000, ((e.clientX - r.left) / r.width) * 1000]
  }
  const start = (mode) => (e) => {
    e.preventDefault(); e.stopPropagation()
    drag.current = { mode, from: pt(e), box: [...box] }
    wrap.current.setPointerCapture?.(e.pointerId)
  }
  const move = (e) => {
    const d = drag.current
    if (!d) return
    const [y, x] = pt(e)
    const dy = y - d.from[0], dx = x - d.from[1]
    let [y0, x0, y1, x1] = d.box
    const MIN = 30
    if (d.mode === 'move') {
      const h = y1 - y0, w = x1 - x0
      y0 = Math.min(1000 - h, Math.max(0, y0 + dy)); x0 = Math.min(1000 - w, Math.max(0, x0 + dx))
      y1 = y0 + h; x1 = x0 + w
    } else {
      if (d.mode.includes('n')) y0 = Math.min(y1 - MIN, Math.max(0, y0 + dy))
      if (d.mode.includes('s')) y1 = Math.max(y0 + MIN, Math.min(1000, y1 + dy))
      if (d.mode.includes('w')) x0 = Math.min(x1 - MIN, Math.max(0, x0 + dx))
      if (d.mode.includes('e')) x1 = Math.max(x0 + MIN, Math.min(1000, x1 + dx))
    }
    setBox([y0, x0, y1, x1])
  }
  const end = () => { drag.current = null }
  const [y0, x0, y1, x1] = box
  const pct = v => v / 10 + '%'

  return (
    <div className="papers-sheet-scrim">
      <div className="papers-modal papers-cropper">
        <div className="papers-crop-bar">
          <button className="btn-ghost" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>‹</button>
          <span>Page {page} of {doc.numPages}</span>
          <button className="btn-ghost" disabled={page >= doc.numPages} onClick={() => setPage(p => p + 1)}>›</button>
        </div>
        <div className="papers-crop-wrap" ref={wrap} onPointerMove={move} onPointerUp={end} onPointerCancel={end}>
          {img ? <img src={img} alt={`Page ${page}`} draggable={false} /> : <div className="papers-figure-ph">Rendering page…</div>}
          {img && (
            <div className="papers-crop-box" style={{ top: pct(y0), left: pct(x0), height: pct(y1 - y0), width: pct(x1 - x0) }}
              onPointerDown={start('move')}>
              {['nw', 'ne', 'sw', 'se'].map(h => <span key={h} className={`papers-crop-h h-${h}`} onPointerDown={start(h)} />)}
            </div>
          )}
        </div>
        <div className="papers-modal-btns">
          <button className="btn-ghost" onClick={() => setBox([0, 0, 1000, 1000])}>Whole page</button>
          <span style={{ flex: 1 }} />
          <button className="btn-ghost" onClick={onCancel}>Cancel</button>
          <button className="btn-primary" disabled={!img} onClick={() => onDone(page, box)}>Use this crop</button>
        </div>
      </div>
    </div>
  )
}

// Paste (or open) plain text and have it read word for word. No AI: the text
// is only split into sections (see sectionsFromText) and saved for the narrator.
const MAX_CHARS = 150_000
function PasteText({ onBack, onSaved }) {
  const [text, setText] = useState('')
  const [title, setTitle] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const sections = sectionsFromText(text)
  const words = (text.match(/\S+/g) || []).length
  // A short first line makes a good default title.
  const firstLine = text.trim().split('\n')[0].trim()
  const autoTitle = firstLine && firstLine.length <= 90 ? firstLine : ''

  const openFile = async (e) => {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    try {
      setText(await f.text())
      if (!title) setTitle(f.name.replace(/\.(txt|md|text)$/i, ''))
    } catch { setErr('Could not open that file.') }
  }

  const save = async () => {
    setBusy(true); setErr('')
    try {
      const row = await insertPaper({
        title: title.trim() || autoTitle || `Pasted text, ${new Date().toLocaleDateString()}`,
        authors: '', journal: 'Pasted text', year: String(new Date().getFullYear()), doi: '',
        sections: sections.map(s => ({ ...s, figure: null })), terms: [],
      })
      requestNarration()
      onSaved(row)
    } catch (x) { setErr(x.message); setBusy(false) }
  }

  return (
    <div className="papers-add">
      <button className="papers-back" onClick={onBack} disabled={busy}>‹ Back</button>
      <h2 className="page-title">Paste text</h2>
      <div className="papers-hint">Read aloud exactly as written. Blank lines separate paragraphs; short lines on their own (like “Methods”) become sections.</div>
      <label className="papers-field">
        <span>Title (optional)</span>
        <input id="paste-title" value={title} placeholder={autoTitle || 'Untitled'} onChange={e => setTitle(e.target.value)} />
      </label>
      <label className="papers-field">
        <span>Text</span>
        <textarea id="paste-text" className="papers-paste" rows={12} value={text} placeholder="Paste here"
          onChange={e => setText(e.target.value.slice(0, MAX_CHARS))} />
      </label>
      <div className="papers-fig-actions">
        <label className="btn-ghost papers-file-btn">Open a text file<input type="file" accept=".txt,.md,.text,text/plain,text/markdown" hidden onChange={openFile} /></label>
      </div>
      {sections.length > 0 && (
        <div className="papers-hint">
          {words.toLocaleString()} words · {sections.length} section{sections.length === 1 ? '' : 's'} · about {estimateMinutes(sections)} min of listening
          {sections.length > 1 && <> · {sections.map(s => s.heading).slice(0, 6).join(', ')}{sections.length > 6 ? '…' : ''}</>}
        </div>
      )}
      {text.length >= MAX_CHARS && <div className="papers-note">That’s the limit for one document (about 25,000 words). Split the rest into another.</div>}
      {err && <div className="papers-note papers-note-error">{err}</div>}
      <div className="papers-modal-btns papers-save-row">
        <span style={{ flex: 1 }} />
        <button className="btn-primary" onClick={save} disabled={busy || !sections.length}>{busy ? 'Saving…' : 'Save and narrate'}</button>
      </div>
    </div>
  )
}
