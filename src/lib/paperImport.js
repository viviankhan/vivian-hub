// src/lib/paperImport.js
// ─────────────────────────────────────────────────────────────
// PDF → paper on the shelf, shared by the one-at-a-time review screen
// (PaperAdd) and the several-at-once batch (Papers' upload queue).
//
//   readPdf(file)          → { draft, figs, doc }   the walkthrough, with figure
//                                                    crops cut from the PDF
//   saveWalkthrough(d, f)  → the saved papers row    uploads figures, inserts,
//                                                    and wakes the narrator
// ─────────────────────────────────────────────────────────────
import { walkthroughFromPdf, insertPaper, uploadFigure, requestNarration } from './papers.js'
import { openPdf, renderPage, cropCanvas, canvasToBlob } from './pdfFigures.js'

export function uuid() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  const b = crypto.getRandomValues(new Uint8Array(16))
  b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80
  const h = [...b].map(x => x.toString(16).padStart(2, '0')).join('')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
}

// A figure crop: { page, box, caption, blob, url } (page/box only when cut
// from the PDF). The model's boxes get a little padding; a crop you drew
// yourself gets none.
export async function cutFigure(doc, page, box, pad = 12) {
  const canvas = await renderPage(doc, page)
  const blob = await canvasToBlob(cropCanvas(canvas, box, pad))
  return { blob, url: URL.createObjectURL(blob) }
}

export async function readPdf(file) {
  const buf = await file.arrayBuffer()
  const [w, doc] = await Promise.all([walkthroughFromPdf(buf), openPdf(buf).catch(() => null)])
  const figs = await Promise.all(w.sections.map(async s => {
    if (!s.figure) return null
    const { page, box, caption = '' } = s.figure
    // The description is read aloud, so it stays even when no image can be cut.
    if (!doc || !page || !box) return caption ? { page, box, caption } : null
    try {
      const { blob, url } = await cutFigure(doc, page, box)
      return { page, box, caption, blob, url }
    } catch { return caption ? { page, box, caption } : null }
  }))
  const draft = { ...w, sections: w.sections.map(({ heading, body }) => ({ heading, body })) }
  if (!draft.title) draft.title = file.name.replace(/\.pdf$/i, '')
  return { draft, figs, doc }
}

export async function saveWalkthrough(draft, figs, onProgress = () => {}) {
  const id = uuid()
  const sections = []
  for (let i = 0; i < draft.sections.length; i++) {
    const s = draft.sections[i], f = figs[i]
    let figure = null
    if (f?.blob) {
      onProgress(`Uploading figure for section ${i + 1}…`)
      figure = { path: await uploadFigure(id, i, f.blob), caption: (f.caption || '').trim() }
    } else if (f?.caption?.trim()) figure = { caption: f.caption.trim() }
    sections.push({ heading: (s.heading || '').trim(), body: s.body, figure })
  }
  onProgress('Saving…')
  const { title, authors, journal, year, doi, terms } = draft
  const row = await insertPaper({ id, title: (title || '').trim() || 'Untitled paper', authors, journal, year, doi, sections, terms })
  requestNarration()
  return row
}
