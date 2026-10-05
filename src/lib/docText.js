// src/lib/docText.js
// ─────────────────────────────────────────────────────────────
// Turn a document someone hands the AI assistant — a syllabus, an event
// agenda — into something the parse-event function can send to the model.
//
//  • PDF: sent as the file itself. Gemini reads PDFs natively, including
//    scanned ones and the schedule tables syllabi are built around, which a
//    plain text dump loses. Only a PDF too big to send whole falls back to its
//    text, pulled out here with pdf.js.
//  • Word (.docx): Gemini can't read these, so the text is pulled out here.
//    A .docx is a zip; word/document.xml holds the body. Tables are kept as
//    one " | "-separated line per row, so "Week 3 | Sep 15 | Quiz 1" stays
//    together.
//  • Plain text (.txt, .md): read as-is.
//
// Old binary Word files (.doc) aren't readable in the browser — the error
// says to save the file as .docx or PDF.
// ─────────────────────────────────────────────────────────────

// Sent whole up to this size; beyond it a PDF goes as text. Base64 adds a
// third, and the function caps a request's files at 14 MB of base64.
export const MAX_PDF_BYTES = 9 * 1024 * 1024
// The most text one document contributes. A long syllabus is ~40k characters.
export const MAX_DOC_CHARS = 120_000
export const MAX_ASSISTANT_DOCS = 3

// What the file picker offers alongside photos.
export const DOC_ACCEPT = '.pdf,.docx,.txt,.md,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/markdown'

const ext = (name) => (String(name || '').toLowerCase().match(/\.([a-z0-9]+)$/) || [])[1] || ''

export function docKind(file) {
  const e = ext(file?.name), t = String(file?.type || '')
  if (t === 'application/pdf' || e === 'pdf') return 'pdf'
  if (t === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || e === 'docx') return 'docx'
  if (t === 'application/msword' || e === 'doc') return 'doc'
  if (t === 'text/plain' || t === 'text/markdown' || e === 'txt' || e === 'md') return 'text'
  return null
}

// ── Zip (just enough to read one entry of a .docx) ─────────────
const u16 = (b, o) => b[o] | (b[o + 1] << 8)
const u32 = (b, o) => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0

async function inflateRaw(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

// The bytes of `path` inside a zip, or null when it isn't there.
export async function zipEntry(buf, path) {
  const b = new Uint8Array(buf)
  // End-of-central-directory record: within the last 64 KB + 22 bytes.
  let eocd = -1
  for (let i = b.length - 22; i >= Math.max(0, b.length - 65557); i--) {
    if (u32(b, i) === 0x06054b50) { eocd = i; break }
  }
  if (eocd < 0) throw new Error('not a zip')
  const count = u16(b, eocd + 10)
  let p = u32(b, eocd + 16)
  const dec = new TextDecoder()
  for (let n = 0; n < count && p + 46 <= b.length; n++) {
    if (u32(b, p) !== 0x02014b50) break
    const method = u16(b, p + 10)
    const size = u32(b, p + 20)
    const nameLen = u16(b, p + 28), extraLen = u16(b, p + 30), commentLen = u16(b, p + 32)
    const local = u32(b, p + 42)
    const name = dec.decode(b.subarray(p + 46, p + 46 + nameLen))
    if (name === path) {
      const start = local + 30 + u16(b, local + 26) + u16(b, local + 28)
      const data = b.subarray(start, start + size)
      if (method === 0) return data
      if (method === 8) return inflateRaw(data)
      throw new Error('unsupported zip compression')
    }
    p += 46 + nameLen + extraLen + commentLen
  }
  return null
}

// ── Word XML → text ────────────────────────────────────────────
const unescapeXml = (s) => s
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
  .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
  .replace(/&amp;/g, '&')

// Walk word/document.xml's tags in order. Paragraphs become lines (empty
// ones, which are only spacing, are dropped); inside a
// table, each cell's paragraphs join with " / " and a row's cells with " | ".
// Word keeps a second copy of a text box in <mc:Fallback> for old readers;
// that copy is skipped so nothing reads twice.
export function wordXmlToText(xml) {
  const lines = []
  const rows = []        // open table rows, innermost last: { cells, cell }
  let para = ''
  let inText = false
  let fallback = 0
  const re = /<(\/?)([A-Za-z]+:[A-Za-z]+)\b[^>]*?(\/?)>|([^<]+)/g
  let m
  while ((m = re.exec(xml))) {
    if (m[4] != null) { if (inText && !fallback) para += unescapeXml(m[4]); continue }
    const closing = !!m[1], tag = m[2], selfClosing = !!m[3]
    if (tag === 'mc:Fallback') { if (!selfClosing) fallback += closing ? -1 : 1; continue }
    if (fallback) continue
    if (tag === 'w:t') { inText = !closing && !selfClosing; continue }
    const row = rows[rows.length - 1]
    if (closing) {
      if (tag === 'w:p') {
        const t = para.replace(/[ \t]+/g, ' ').trim()
        para = ''
        if (t) (row && row.cell ? row.cell : lines).push(t)
      } else if (tag === 'w:tc' && row) {
        row.cells.push((row.cell || []).join(' / '))
        row.cell = null
      } else if (tag === 'w:tr' && row) {
        rows.pop()
        if (row.cells.some(c => c)) {
          const text = row.cells.join(' | ')
          const outer = rows[rows.length - 1]
          if (outer && outer.cell) outer.cell.push(text)
          else lines.push(text)
        }
      }
      continue
    }
    if (tag === 'w:tab') para += '\t'
    else if (tag === 'w:br' || tag === 'w:cr') para += ' '
    else if (tag === 'w:tr' && !selfClosing) rows.push({ cells: [], cell: null })
    else if (tag === 'w:tc' && !selfClosing && row) row.cell = []
  }
  return lines.join('\n').trim()
}

export async function docxText(buf) {
  let xml
  try {
    const bytes = await zipEntry(buf, 'word/document.xml')
    if (!bytes) throw new Error('missing body')
    xml = new TextDecoder().decode(bytes)
  } catch {
    throw new Error('That Word file couldn’t be opened. Try saving it again as .docx or PDF.')
  }
  return wordXmlToText(xml)
}

// ── PDF → text (only for a PDF too big to send whole) ──────────
// Items on a page are grouped into lines by their baseline, left to right, so
// a table row reads across.
export async function pdfText(buf) {
  const { openPdf } = await import('./pdfFigures.js')
  const doc = await openPdf(buf)
  const pages = []
  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n)
    const { items } = await page.getTextContent()
    const rows = new Map()
    for (const it of items) {
      if (!it.str || !it.str.trim()) continue
      const y = Math.round(it.transform[5] / 3)
      if (!rows.has(y)) rows.set(y, [])
      rows.get(y).push({ x: it.transform[4], s: it.str })
    }
    const lines = [...rows.entries()].sort((a, b) => b[0] - a[0])
      .map(([, r]) => r.sort((a, b) => a.x - b.x).map(i => i.s.trim()).join('  '))
    pages.push(lines.join('\n'))
  }
  return pages.join('\n\n')
}

function toBase64(buf) {
  const b = new Uint8Array(buf)
  let s = ''
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000))
  return btoa(s)
}

// Read one picked file. Returns { name, kind, mimeType, data } for a PDF sent
// whole, or { name, kind, text } for anything sent as text. Throws an Error
// with a message fit to show.
export async function readDocument(file) {
  const kind = docKind(file)
  const name = String(file?.name || 'document')
  if (kind === 'doc') throw new Error(`“${name}” is an older Word file (.doc). Open it and save it as .docx or PDF, then add it again.`)
  if (!kind) throw new Error(`“${name}” isn’t a file the assistant can read — use a PDF, a Word .docx, or a photo.`)
  const buf = await file.arrayBuffer()
  if (kind === 'pdf' && buf.byteLength <= MAX_PDF_BYTES) {
    return { name, kind, mimeType: 'application/pdf', data: toBase64(buf) }
  }
  let text
  if (kind === 'pdf') {
    try { text = await pdfText(buf) } catch { throw new Error(`“${name}” couldn’t be opened as a PDF.`) }
  } else if (kind === 'docx') {
    text = await docxText(buf)
  } else {
    text = new TextDecoder().decode(buf)
  }
  text = String(text || '').trim()
  if (!text) {
    throw new Error(kind === 'pdf'
      ? `“${name}” is too large to send and has no text to read (it may be a scan). Try a smaller copy, or photos of the pages.`
      : `“${name}” looks empty.`)
  }
  const cut = text.length > MAX_DOC_CHARS
  return { name, kind, text: cut ? text.slice(0, MAX_DOC_CHARS) : text, truncated: cut }
}
