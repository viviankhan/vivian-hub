// src/lib/papers.js
// ─────────────────────────────────────────────────────────────
// Data for the Papers tab (see PAPERS.md): the `papers` and `paper_progress`
// tables and the two private storage buckets. Unlike the planner, papers are
// read straight from Supabase rather than through the offline kv mirror — the
// audio has to stream from Storage anyway, so there is nothing useful to do
// with a paper while the server is unreachable beyond what's already on screen.
//
// Listening position is the exception: it is mirrored to localStorage on every
// save, so a dropped connection mid-listen never loses your place, and the
// newer of the two copies wins when a paper is opened.
// ─────────────────────────────────────────────────────────────
import { supabase, isUsingSupabase, supabaseUrl, supabaseAnonKey } from './storage.js'
import { getUserId } from './auth.js'

export const papersAvailable = isUsingSupabase

const LIST_COLUMNS = 'id,title,authors,journal,year,doi,dur,audio_path,needs_narration,narration_error,narration_attempts,section_count,created_at,updated_at'
const AUDIO_BUCKET = 'paper-audio'
const FIGURE_BUCKET = 'paper-figures'
const SIGNED_TTL = 6 * 3600 // seconds

function need() {
  if (!supabase) throw new Error('Papers need cloud sync (Supabase) to be set up.')
}
function check({ data, error }) {
  if (error) throw new Error(error.message || String(error))
  return data
}

// ── Papers ─────────────────────────────────────────────────────
// Columns added for reading PDFs on the server. A database set up before then
// (supabase_papers.sql not re-run) lacks them, and the shelf must still load.
const SERVER_COLUMNS = ',processing,processing_error'
let serverColumns = true
export async function listPapers() {
  need()
  if (serverColumns) {
    const r = await supabase.from('papers').select(LIST_COLUMNS + SERVER_COLUMNS).order('created_at', { ascending: false })
    if (!r.error) return r.data || []
    if (!/processing/.test(r.error.message || '')) check(r)
    serverColumns = false
  }
  return check(await supabase.from('papers').select(LIST_COLUMNS).order('created_at', { ascending: false })) || []
}
export const serverReadingReady = () => serverColumns

export async function getPaper(id) {
  need()
  return check(await supabase.from('papers').select('*').eq('id', id).single())
}

export async function insertPaper(fields) {
  need()
  return check(await supabase.from('papers').insert(fields).select('*').single())
}

// Every edit bumps updated_at. The narrator only saves its result if the row's
// updated_at is unchanged since it started, so an edit made mid-render is never
// overwritten by audio of the old text.
export async function updatePaper(id, fields) {
  need()
  return check(await supabase.from('papers')
    .update({ ...fields, updated_at: new Date().toISOString() })
    .eq('id', id).select('*').single())
}

export async function deletePaper(paper) {
  need()
  const uid = getUserId()
  // Storage first: once the row is gone nothing points at these objects.
  try {
    if (paper.audio_path) await supabase.storage.from(AUDIO_BUCKET).remove([paper.audio_path])
    const dir = `${uid}/${paper.id}`
    const { data } = await supabase.storage.from(FIGURE_BUCKET).list(dir, { limit: 100 })
    if (data && data.length) await supabase.storage.from(FIGURE_BUCKET).remove(data.map(f => `${dir}/${f.name}`))
  } catch { /* an orphaned file is harmless; the row is what matters */ }
  check(await supabase.from('papers').delete().eq('id', paper.id))
  try { localStorage.removeItem(progressKey(paper.id)) } catch {}
}

// Where to start the narrator by hand if it hasn't come round on its own.
export const NARRATOR_URL = 'https://github.com/viviankhan/vivian-hub/actions/workflows/narrate.yml'
const LATE_AFTER_MS = 40 * 60 * 1000

// True when Alba should have arrived by now: the schedule runs every 15
// minutes, so 40 without audio means the narrator isn't running.
export function narrationLate(p, now = Date.now()) {
  if (!p || (p.audio_path && !p.needs_narration)) return false
  const since = Math.max(Date.parse(p.created_at) || 0, Date.parse(p.updated_at) || 0)
  return !!since && now - since > LATE_AFTER_MS
}

// Narration status for display.
export function narrationState(p) {
  if (p.processing === 'reading') return 'reading'       // PDF being read on the server
  if (p.processing === 'failed') return 'readfailed'
  if (p.audio_path && !p.needs_narration) return 'ready'
  if (p.narration_error && (p.narration_attempts || 0) >= 3) return 'failed'
  if (p.audio_path) return 'updating'   // playable, but a newer render is queued
  return 'pending'
}

// ── Progress ───────────────────────────────────────────────────
const progressKey = id => 'bloom_paper_pos_' + id

function localProgress(id) {
  try {
    const v = JSON.parse(localStorage.getItem(progressKey(id)) || 'null')
    return v && typeof v.position_seconds === 'number' ? v : null
  } catch { return null }
}

// Progress for the given papers: { [paperId]: row }, each the newer of the
// server row and anything that only reached this device.
export async function listProgress(ids) {
  need()
  let rows = []
  try { rows = check(await supabase.from('paper_progress').select('paper_id,position_seconds,section_index,updated_at')) || [] } catch {}
  const server = {}
  for (const r of rows) server[r.paper_id] = r
  const out = {}
  for (const id of ids) {
    const p = newer(server[id], localProgress(id))
    if (p) out[id] = p
  }
  return out
}

function newer(a, b) {
  if (!a) return b || null
  if (!b) return a
  return (Date.parse(b.updated_at) || 0) > (Date.parse(a.updated_at) || 0) ? b : a
}

export async function loadProgress(id) {
  need()
  let row = null
  try { row = check(await supabase.from('paper_progress').select('*').eq('paper_id', id).maybeSingle()) } catch {}
  return newer(row, localProgress(id))
}

// Local copy immediately; server copy best-effort.
export async function saveProgress(id, position, sectionIndex) {
  const row = {
    paper_id: id,
    position_seconds: Math.max(0, Math.round((Number(position) || 0) * 10) / 10),
    section_index: sectionIndex | 0,
    updated_at: new Date().toISOString(),
  }
  try { localStorage.setItem(progressKey(id), JSON.stringify(row)) } catch {}
  if (!supabase) return
  try { await supabase.from('paper_progress').upsert(row, { onConflict: 'paper_id' }) } catch {}
}

// ── Storage ────────────────────────────────────────────────────
export async function signedAudioUrl(path) {
  need()
  const { data, error } = await supabase.storage.from(AUDIO_BUCKET).createSignedUrl(path, SIGNED_TTL)
  if (error) throw new Error(error.message)
  return data.signedUrl
}

const figureUrls = new Map() // path → { url, exp }
export async function signedFigureUrl(path) {
  const hit = figureUrls.get(path)
  if (hit && hit.exp > Date.now() + 60_000) return hit.url
  need()
  const { data, error } = await supabase.storage.from(FIGURE_BUCKET).createSignedUrl(path, SIGNED_TTL)
  if (error) throw new Error(error.message)
  figureUrls.set(path, { url: data.signedUrl, exp: Date.now() + SIGNED_TTL * 1000 })
  return data.signedUrl
}

export async function uploadFigure(paperId, sectionIndex, blob) {
  need()
  const uid = getUserId()
  const path = `${uid}/${paperId}/fig-${sectionIndex}-${Date.now().toString(36)}.jpg`
  const { error } = await supabase.storage.from(FIGURE_BUCKET)
    .upload(path, blob, { contentType: 'image/jpeg', upsert: true, cacheControl: '31536000' })
  if (error) throw new Error(error.message)
  return path
}

export async function removeFigure(path) {
  if (!path || !supabase) return
  try { await supabase.storage.from(FIGURE_BUCKET).remove([path]) } catch {}
  figureUrls.delete(path)
}

// ── Edge functions ─────────────────────────────────────────────
async function callFunction(name, body) {
  if (!supabaseUrl) throw new Error('Supabase is not configured.')
  const { data: { session } = {} } = await supabase.auth.getSession()
  const token = session?.access_token || supabaseAnonKey
  let res
  try {
    res = await fetch(`${supabaseUrl}/functions/v1/${name}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: supabaseAnonKey, Authorization: `Bearer ${token}` },
      body: JSON.stringify(body || {}),
    })
  } catch {
    throw new Error(`Couldn’t reach the ${name} function. Check your connection.`)
  }
  let data = null
  try { data = await res.json() } catch {}
  if (!res.ok) {
    if (res.status === 404) throw new Error(`The ${name} function isn’t deployed yet (see PAPERS.md).`)
    throw new Error((data && data.error) || `${name} failed (${res.status}).`)
  }
  return data
}

// Ask the narrator to run now. Quietly does nothing if the function or its
// token isn't set up — the scheduled sweep will get there.
export function requestNarration() {
  return callFunction('narrate-now', {}).then(() => true, () => false)
}

function toBase64(buf) {
  const bytes = new Uint8Array(buf)
  let s = ''
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000))
  return btoa(s)
}

// ── Reading PDFs on the server ─────────────────────────────────
// Upload the PDF, create the paper as a placeholder, and ask the server to
// read it. Bloom can be closed as soon as this returns: the walkthrough is
// written to the row on the server, and Alba narrates it after.
export async function sendPdfToServer(file) {
  need()
  const uid = getUserId()
  const id = crypto.randomUUID ? crypto.randomUUID() : String(Date.now())
  const path = `${uid}/${id}/source.pdf`
  const up = await supabase.storage.from(FIGURE_BUCKET).upload(path, file, { contentType: 'application/pdf', upsert: true })
  if (up.error) throw new Error(up.error.message)
  const ins = await supabase.from('papers').insert({
    id, title: file.name.replace(/\.pdf$/i, ''), sections: [], source_pdf: path, processing: 'reading',
  }).select('id').single()
  if (ins.error) {
    await supabase.storage.from(FIGURE_BUCKET).remove([path]).catch(() => {})
    const e = new Error(ins.error.message); e.setup = /processing|source_pdf/.test(ins.error.message || ''); throw e
  }
  try {
    await startServerReading(id)
  } catch (e) {
    // An older paper-walkthrough function doesn't know this mode yet.
    if (/No PDF was sent/i.test(e.message || '')) {
      await deletePaper({ id }).catch(() => {})
      const x = new Error(e.message); x.setup = true; throw x
    }
    throw e
  }
  return id
}

// (Re)start reading an uploaded PDF on the server.
export function startServerReading(paperId) {
  return callFunction('paper-walkthrough', { paperId })
}

// A figure image (JPEG blob) → a spoken walkthrough of it, for listeners who
// can't see it. `context` is the section's text, so it names things correctly.
export async function describeFigure(blob, context = '') {
  const data = await callFunction('paper-walkthrough', { image: toBase64(await blob.arrayBuffer()), context })
  if (!data?.description) throw new Error('The AI could not describe that figure.')
  return data.description
}

// PDF bytes → { title, authors, journal, year, doi, sections:[{heading, body,
// figure:{page, box, caption}|null}], terms }.
export async function walkthroughFromPdf(arrayBuffer) {
  if (arrayBuffer.byteLength > 14 * 1024 * 1024) throw new Error('That PDF is over 14 MB, too large to read in one go.')
  return callFunction('paper-walkthrough', { pdf: toBase64(arrayBuffer) })
}
