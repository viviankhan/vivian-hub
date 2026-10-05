// Documents for the AI assistant (src/lib/docText.js): a syllabus or agenda
// handed over as a Word file is read into text — tables kept a row to a line —
// a PDF goes whole, an old .doc is turned away with a way forward, and
// runAssistant sends them along (src/lib/parseEvent.js).
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { deflateRawSync, crc32 } from 'node:zlib'

const here = dirname(fileURLToPath(import.meta.url))
const D = await import(resolve(here, '../src/lib/docText.js'))

let pass = 0, fail = 0
const eq = (name, got, want) => {
  const g = JSON.stringify(got), w = JSON.stringify(want)
  if (g === w) { pass++; console.log('  ok  ', name) }
  else { fail++; console.log('  FAIL', name, '\n        got ', g, '\n        want', w) }
}

// A minimal zip writer — enough to build .docx fixtures here rather than
// checking binaries into the repo.
function zip(entries, { store = false } = {}) {
  const locals = [], centrals = []
  let offset = 0
  for (const [name, text] of Object.entries(entries)) {
    const raw = Buffer.from(text, 'utf8')
    const body = store ? raw : deflateRawSync(raw)
    const nameBuf = Buffer.from(name)
    const head = Buffer.alloc(30)
    head.writeUInt32LE(0x04034b50, 0); head.writeUInt16LE(20, 4); head.writeUInt16LE(store ? 0 : 8, 8)
    head.writeUInt32LE(crc32(raw), 14); head.writeUInt32LE(body.length, 18); head.writeUInt32LE(raw.length, 22)
    head.writeUInt16LE(nameBuf.length, 26)
    locals.push(head, nameBuf, body)
    const cen = Buffer.alloc(46)
    cen.writeUInt32LE(0x02014b50, 0); cen.writeUInt16LE(20, 4); cen.writeUInt16LE(20, 6); cen.writeUInt16LE(store ? 0 : 8, 10)
    cen.writeUInt32LE(crc32(raw), 16); cen.writeUInt32LE(body.length, 20); cen.writeUInt32LE(raw.length, 24)
    cen.writeUInt16LE(nameBuf.length, 28); cen.writeUInt32LE(offset, 42)
    centrals.push(cen, nameBuf)
    offset += 30 + nameBuf.length + body.length
  }
  const cd = Buffer.concat(centrals)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(Object.keys(entries).length, 8); end.writeUInt16LE(Object.keys(entries).length, 10)
  end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16)
  return Buffer.concat([...locals, cd, end])
}
const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006"'
const p = (...runs) => `<w:p><w:pPr><w:pStyle w:val="Normal"/></w:pPr>${runs.map(r => `<w:r><w:rPr><w:b/></w:rPr><w:t xml:space="preserve">${r}</w:t></w:r>`).join('')}</w:p>`
const tc = (...paras) => `<w:tc><w:tcPr><w:tcW w:w="2000"/></w:tcPr>${paras.map(x => p(x)).join('')}</w:tc>`
const tr = (...cells) => `<w:tr><w:trPr/>${cells.join('')}</w:tr>`
const tbl = (...rows) => `<w:tbl><w:tblPr><w:tblW w:w="0"/></w:tblPr><w:tblGrid/>${rows.join('')}</w:tbl>`
const documentXml = (body) => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document ${W}><w:body>${body}<w:sectPr/></w:body></w:document>`

const syllabus = documentXml([
  p('BIO 210 — Cell Biology, Fall 2026'),
  p('Lectures: Mon &amp; Wed ', '10:00–11:15 AM, Room 204'),
  `<w:p><w:r><w:t>Office hours</w:t></w:r><w:r><w:tab/></w:r><w:r><w:t>Tue 2–3 PM</w:t></w:r><w:r><w:br/></w:r><w:r><w:t>Zoom 123&#160;456</w:t></w:r></w:p>`,
  tbl(
    tr(tc('Week'), tc('Date'), tc('Due')),
    tr(tc('3'), tc('Sep 15'), tc('Quiz 1')),
    tr(tc('8'), tc('Oct 20'), tc('Midterm exam (ch. 1–6)', 'Bring a calculator')),
    tr(tc(''), tc(''), tc('')),
  ),
  // A text box: Word stores it twice, once for old readers in mc:Fallback.
  `<w:p><w:r><mc:AlternateContent><mc:Choice Requires="wps"><w:drawing><w:txbxContent>${p('Late work: −10%/day')}</w:txbxContent></w:drawing></mc:Choice><mc:Fallback><w:pict><w:txbxContent>${p('Late work: −10%/day')}</w:txbxContent></w:pict></mc:Fallback></mc:AlternateContent></w:r></w:p>`,
  p('Final exam: Dec 14, 9 AM'),
].join(''))

const fileOf = (buf, name, type = '') => new File([buf], name, { type })

console.log('\n— a Word syllabus becomes text —')
const docx = zip({ '[Content_Types].xml': '<Types/>', 'word/document.xml': syllabus })
const text = await D.docxText(docx.buffer.slice(docx.byteOffset, docx.byteOffset + docx.length))
eq('every line, in order, tables a row to a line', text.split('\n'), [
  'BIO 210 — Cell Biology, Fall 2026',
  'Lectures: Mon & Wed 10:00–11:15 AM, Room 204',
  'Office hours Tue 2–3 PM Zoom 123 456',
  'Week | Date | Due',
  '3 | Sep 15 | Quiz 1',
  '8 | Oct 20 | Midterm exam (ch. 1–6) / Bring a calculator',
  'Late work: −10%/day',
  'Final exam: Dec 14, 9 AM',
])
const stored = zip({ 'word/document.xml': documentXml(p('Stored, not deflated')) }, { store: true })
eq('an uncompressed entry reads too', await D.docxText(stored.buffer.slice(stored.byteOffset, stored.byteOffset + stored.length)), 'Stored, not deflated')

console.log('\n— a table inside a table cell —')
eq('the inner rows stay inside their cell', D.wordXmlToText(documentXml(tbl(
  tr(tc('Day 1'), `<w:tc>${tbl(tr(tc('9:00'), tc('Keynote')), tr(tc('10:30'), tc('Panel')))}</w:tc>`),
))), 'Day 1 | 9:00 | Keynote / 10:30 | Panel')

console.log('\n— what each file is —')
eq('pdf by type', D.docKind({ name: 'x', type: 'application/pdf' }), 'pdf')
eq('pdf by name', D.docKind({ name: 'Syllabus.PDF', type: '' }), 'pdf')
eq('docx', D.docKind({ name: 'agenda.docx', type: '' }), 'docx')
eq('old .doc', D.docKind({ name: 'agenda.doc', type: 'application/msword' }), 'doc')
eq('text', D.docKind({ name: 'notes.txt', type: 'text/plain' }), 'text')
eq('anything else', D.docKind({ name: 'sheet.xlsx', type: '' }), null)

console.log('\n— reading a picked file —')
const fromDocx = await D.readDocument(fileOf(docx, 'BIO 210 syllabus.docx'))
eq('a .docx goes as text', [fromDocx.kind, fromDocx.name, 'data' in fromDocx, fromDocx.text.includes('3 | Sep 15 | Quiz 1')], ['docx', 'BIO 210 syllabus.docx', false, true])
const pdfBytes = Buffer.from('%PDF-1.4\n%fake\n')
const fromPdf = await D.readDocument(fileOf(pdfBytes, 'agenda.pdf', 'application/pdf'))
eq('a PDF goes whole, as base64', [fromPdf.kind, fromPdf.mimeType, fromPdf.data], ['pdf', 'application/pdf', pdfBytes.toString('base64')])
const fromTxt = await D.readDocument(fileOf(Buffer.from('  Day 1: 9am keynote  \n'), 'agenda.txt', 'text/plain'))
eq('a text file goes as its text', fromTxt.text, 'Day 1: 9am keynote')
const long = await D.readDocument(fileOf(Buffer.from('x'.repeat(D.MAX_DOC_CHARS + 50)), 'long.txt', 'text/plain'))
eq('a very long one is cut, and says so', [long.text.length, long.truncated], [D.MAX_DOC_CHARS, true])
const err = async (f) => { try { await D.readDocument(f); return null } catch (e) { return e.message } }
eq('an old .doc is turned away with what to do', await err(fileOf(Buffer.from('x'), 'syllabus.doc')),
  '“syllabus.doc” is an older Word file (.doc). Open it and save it as .docx or PDF, then add it again.')
eq('a broken .docx says so', await err(fileOf(Buffer.from('not a zip at all'), 'broken.docx')),
  'That Word file couldn’t be opened. Try saving it again as .docx or PDF.')
eq('a spreadsheet is not read', await err(fileOf(Buffer.from('x'), 'grades.xlsx')),
  '“grades.xlsx” isn’t a file the assistant can read — use a PDF, a Word .docx, or a photo.')
eq('an empty one says so', await err(fileOf(Buffer.from('   '), 'blank.txt', 'text/plain')), '“blank.txt” looks empty.')

console.log('\n— the assistant sends them —')
const shim = resolve(here, '.parseEvent.docs.shim.mjs')
writeFileSync(shim, readFileSync(resolve(here, '../src/lib/parseEvent.js'), 'utf8')
  .replace(/import\.meta\.env\.VITE_SUPABASE_URL/g, '"https://example.test"')
  .replace(/import\.meta\.env\.VITE_SUPABASE_ANON_KEY/g, '""'))
const P = await import(shim)
let sent = null
const d = new Date()
const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
globalThis.fetch = async (url, opts) => {
  sent = { url, body: JSON.parse(opts.body) }
  return new Response(JSON.stringify({ summary: 'Two items', actions: [
    { kind: 'create', title: 'BIO 210 — Quiz 1', date: '2026-09-15', dateFrom: 'Sep 15', time: '', durationMins: 0, categoryIds: [], description: '', subtasks: [], reminders: [] },
    { kind: 'create', title: 'BIO 210 — Lab report', date: today, dateFrom: 'Week 3', time: '', durationMins: 0, categoryIds: [], description: '', subtasks: [], reminders: [] },
  ] }), { status: 200, headers: { 'Content-Type': 'application/json' } })
}
const res = await P.runAssistant('', { documents: [
  { name: 'agenda.pdf', kind: 'pdf', mimeType: 'application/pdf', data: 'JVBERi0=' },
  { name: 'syllabus.docx', kind: 'docx', text: 'Week | Date | Due' },
] })
eq('with no instruction, a document alone is enough', sent && sent.url, 'https://example.test/functions/v1/parse-event')
eq('a PDF as the file, a Word file as its text', sent.body.documents, [
  { name: 'agenda.pdf', mimeType: 'application/pdf', data: 'JVBERi0=' },
  { name: 'syllabus.docx', text: 'Week | Date | Due' },
])
eq('a date of today the document never gave is flagged', res.actions.map(a => !!a.needsDate), [false, true])
let noInput = null
try { await P.runAssistant('', {}) } catch (e) { noInput = e.message }
eq('nothing at all is still refused', noInput, 'Type an instruction or add a photo or document first.')

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
