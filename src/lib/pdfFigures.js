// src/lib/pdfFigures.js
// ─────────────────────────────────────────────────────────────
// Render PDF pages and cut figures out of them, for the Papers "Add paper"
// flow. The model says which page a figure is on and roughly where
// (box = [ymin, xmin, ymax, xmax], 0–1000 of the page); this draws that page
// with pdf.js and crops the region into a JPEG the app uploads.
//
// pdf.js is large, so it is only loaded the first time a PDF is added.
// ─────────────────────────────────────────────────────────────

let lib = null
async function pdfjs() {
  if (lib) return lib
  // The legacy build carries the polyfills older iOS Safari needs.
  const [mod, worker] = await Promise.all([
    import('pdfjs-dist/legacy/build/pdf.mjs'),
    import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url'),
  ])
  mod.GlobalWorkerOptions.workerSrc = worker.default
  lib = mod
  return lib
}

// pdf.js takes ownership of (detaches) the buffer it is given, so pass a copy.
export async function openPdf(arrayBuffer) {
  const { getDocument } = await pdfjs()
  return getDocument({ data: new Uint8Array(arrayBuffer.slice(0)) }).promise
}

// Draw one page (1-based) about `width` pixels wide. Rendered pages are
// cached per document, since several figures often share a page.
const pageCache = new WeakMap()
export async function renderPage(doc, pageNo, width = 1600) {
  let byDoc = pageCache.get(doc)
  if (!byDoc) { byDoc = new Map(); pageCache.set(doc, byDoc) }
  const key = pageNo + ':' + width
  if (byDoc.has(key)) return byDoc.get(key)
  const job = (async () => {
    const page = await doc.getPage(Math.min(Math.max(1, pageNo), doc.numPages))
    const base = page.getViewport({ scale: 1 })
    const viewport = page.getViewport({ scale: width / base.width })
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(viewport.width)
    canvas.height = Math.round(viewport.height)
    const ctx = canvas.getContext('2d')
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    await page.render({ canvasContext: ctx, viewport }).promise
    return canvas
  })()
  byDoc.set(key, job)
  return job
}

// Crop box (0–1000, [ymin, xmin, ymax, xmax]) out of a rendered page, with a
// little padding since the model's boxes tend to run tight.
export function cropCanvas(page, box, pad = 12) {
  const [y0, x0, y1, x1] = box
  const W = page.width, H = page.height
  const left = Math.max(0, (x0 - pad) / 1000 * W)
  const top = Math.max(0, (y0 - pad) / 1000 * H)
  const right = Math.min(W, (x1 + pad) / 1000 * W)
  const bottom = Math.min(H, (y1 + pad) / 1000 * H)
  const w = Math.max(1, Math.round(right - left)), h = Math.max(1, Math.round(bottom - top))
  const c = document.createElement('canvas')
  c.width = w; c.height = h
  c.getContext('2d').drawImage(page, left, top, w, h, 0, 0, w, h)
  return c
}

export function canvasToBlob(canvas, quality = 0.86) {
  return new Promise((resolve, reject) =>
    canvas.toBlob(b => (b ? resolve(b) : reject(new Error('Could not encode the figure.'))), 'image/jpeg', quality))
}

// A picked image file → JPEG blob, long edge at most `maxDim`.
export function imageFileToBlob(file, maxDim = 1800) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      const k = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight))
      const c = document.createElement('canvas')
      c.width = Math.max(1, Math.round(img.naturalWidth * k))
      c.height = Math.max(1, Math.round(img.naturalHeight * k))
      const ctx = c.getContext('2d')
      ctx.fillStyle = '#fff'
      ctx.fillRect(0, 0, c.width, c.height)
      ctx.drawImage(img, 0, 0, c.width, c.height)
      URL.revokeObjectURL(url)
      canvasToBlob(c).then(resolve, reject)
    }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not open that image.')) }
    img.src = url
  })
}
