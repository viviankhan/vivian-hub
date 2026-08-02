// src/lib/appearance.js
// ─────────────────────────────────────────────────────────────
// Look & feel customization — Font and "App Icon" (accent theme).
//
// Both are device-local UI preferences (like the last-open tab), so they live
// in localStorage rather than the synced cloud store. The whole app is themed
// through a handful of CSS custom properties (--teal, --forest, --green-light,
// …), so switching a theme just overrides those on :root and every `var(--…)`
// in the app — inline styles included — recolors at once. Per-category colors
// are their own values, so they stay put.
// ─────────────────────────────────────────────────────────────

import { iconColorOn } from './glyphs.jsx'

// ── Color math (for deriving a whole theme from a single accent) ──
// Bloom's look is one accent + a darker "deep" surface + a very pale "light"
// tint. Given any accent we can mix toward black/white to get the other two,
// so a custom color (or a Bloom variation) auto-populates every surface.
function clamp255(n) { return Math.max(0, Math.min(255, Math.round(n))) }
function hexToRgb(hex) {
  const h = (hex || '').replace('#', '')
  const s = h.length === 3 ? h.split('').map(c => c + c).join('') : h
  const n = parseInt(s || '000000', 16)
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }
}
function rgbToHex({ r, g, b }) {
  return '#' + [r, g, b].map(v => clamp255(v).toString(16).padStart(2, '0')).join('').toUpperCase()
}
// Linear mix of hex toward a target hex by amt (0 = hex, 1 = target).
function mix(hex, target, amt) {
  const a = hexToRgb(hex), b = hexToRgb(target)
  return rgbToHex({ r: a.r + (b.r - a.r) * amt, g: a.g + (b.g - a.g) * amt, b: a.b + (b.b - a.b) * amt })
}
// A full Bloom-style theme derived from one accent color (with a glimmer built
// from a lighter and a darker shade of it).
export function deriveTheme(hex, label = 'Custom', id = 'custom') {
  const accent = (hex && /^#?[0-9a-fA-F]{3,6}$/.test(hex)) ? (hex[0] === '#' ? hex : '#' + hex) : '#4A9EB5'
  const light = mix(accent, '#FFFFFF', 0.86)
  const deep = mix(accent, '#0C0F13', 0.46)
  const glimmer = `linear-gradient(135deg, rgba(255,255,255,.5) 0%, rgba(255,255,255,0) 34%), linear-gradient(135deg, ${mix(accent, '#FFFFFF', 0.28)} 0%, ${mix(accent, '#000000', 0.16)} 100%)`
  return { id, label, accent, deep, light, tile: accent, glimmer }
}

// Bloom's identity is a warm beach-peach. Every theme below is a variation on
// that — sunlit corals, apricots, sands and shells, plus a few cool seaside
// tones — and each carries its own `glimmer`: a soft gradient sheen (a diagonal
// light streak over the accent) so the FAB + theme tiles literally shimmer, a
// different shine per theme. `accent` drives buttons/nav/spines; `deep` is the
// dark surface (drawer header); `light` is the pale on-dark tint; `tile`/glimmer
// paint the swatch. A helper builds the streak so they stay consistent.
const streak = (a, b, deg = 135) =>
  `linear-gradient(${deg}deg, rgba(255,255,255,.5) 0%, rgba(255,255,255,0) 34%), linear-gradient(${deg}deg, ${a} 0%, ${b} 100%)`

export const THEMES = [
  { id:'peach',    label:'Peach',    accent:'#E8956F', deep:'#7E4636', light:'#FCEDE4', tile:'#E8956F', glimmer: streak('#F3B389', '#DE7C5E', 135) },
  { id:'coral',    label:'Coral',    accent:'#E87A6B', deep:'#7E3A32', light:'#FCE9E5', tile:'#E87A6B', glimmer: streak('#F49E86', '#DC6152', 120) },
  { id:'apricot',  label:'Apricot',  accent:'#E7A85C', deep:'#835525', light:'#FBEFDD', tile:'#E7A85C', glimmer: streak('#F6C57F', '#DB9140', 150) },
  { id:'shell',    label:'Shell',    accent:'#E890A6', deep:'#7E3F51', light:'#FCEAF0', tile:'#E890A6', glimmer: streak('#F5AEBF', '#DE7690', 125) },
  { id:'sand',     label:'Sand',     accent:'#CDAF80', deep:'#6D5A39', light:'#F6EFE0', tile:'#CDAF80', glimmer: streak('#E0C99E', '#B9975F', 140) },
  { id:'sunset',   label:'Sunset',   accent:'#E58463', deep:'#7C3E2C', light:'#FCEAE1', tile:'#E58463', glimmer: streak('#F6B27E', '#D96A54', 115) },
  { id:'seafoam',  label:'Seafoam',  accent:'#6FB6A4', deep:'#356257', light:'#E7F4EF', tile:'#6FB6A4', glimmer: streak('#96D0BF', '#4E9A87', 145) },
  { id:'lagoon',   label:'Lagoon',   accent:'#5FA9C0', deep:'#2F5E6E', light:'#E6F3F7', tile:'#5FA9C0', glimmer: streak('#8AC7D8', '#4189A0', 135) },
  { id:'bloom',    label:'Bloom',    accent:'#4A9EB5', deep:'#2A4858', light:'#E8F6FA', tile:'#4A9EB5', glimmer: streak('#78C0D2', '#3A8296', 135) },
  // A few non-beach options kept for choice / identity.
  { id:'night',    label:'Night',    accent:'#4A6C93', deep:'#22344B', light:'#E7EDF5', tile:'#3E5C82', glimmer: streak('#6E8FB5', '#3A5578', 135) },
  { id:'classic',  label:'Classic',  accent:'#4A4A4A', deep:'#1C1C1C', light:'#ECECEC', tile:'#2E2E2E', glimmer: streak('#6E6E6E', '#333333', 135) },
  { id:'pride',    label:'Pride',    accent:'#C64B8C', deep:'#6A2E63', light:'#F6E7F1', tile:'pride' },
  { id:'trans',    label:'Trans',    accent:'#57B7E6', deep:'#2E6E8E', light:'#E7F4FB', tile:'trans' },
]

export const FONTS = [
  { id:'system',   label:'System',       family:"'DM Sans', system-ui, -apple-system, sans-serif" },
  { id:'dyslexic', label:'OpenDyslexic', family:"'OpenDyslexic', 'DM Sans', sans-serif" },
]

// Layout density — how much supporting UI shows on the timeline. Simplified and
// Minimal hide progressively more (routine cards, then free-time gap rows) to
// make the day less busy. Driven by a class on <html> + CSS in index.css.
export const LAYOUTS = [
  { id:'full',       label:'Full' },
  { id:'simplified', label:'Simplified' },
  { id:'minimal',    label:'Minimal' },
]

// The week-strip summary under each day: colored category dots, or a streak
// flame that lights up on days you fully completed.
export const SUMMARY_MODES = [
  { id:'dots',   label:'Dots' },
  { id:'streak', label:'Streak' },
]

export function getTheme(id) {
  if (id === 'custom') return deriveTheme(getCustomColor())
  return THEMES.find(t => t.id === id) || THEMES[0]
}

// The seed color for the "custom" theme — one color that auto-populates the
// whole palette (accent + derived deep + light). Device-local, like the theme.
export function getCustomColor() {
  try { return localStorage.getItem('bloom_custom_color') || '#7BA7B0' } catch { return '#7BA7B0' }
}
export function setCustomColor(v) {
  try { localStorage.setItem('bloom_custom_color', v) } catch {}
}

// Saved color swatches the user can reuse anywhere a color is picked
// (device-local). Deduped, most-recent first, capped so the row stays tidy.
// A change fires a 'bloom-saved-colors' event so every open picker refreshes,
// keeping the palette in sync across the whole app.
function emitSavedColors() { try { window.dispatchEvent(new Event('bloom-saved-colors')) } catch {} }
export function getSavedColors() {
  try { const v = JSON.parse(localStorage.getItem('bloom_saved_colors') || '[]'); return Array.isArray(v) ? v : [] } catch { return [] }
}
export function addSavedColor(hex) {
  const h = (hex || '').toUpperCase()
  if (!/^#[0-9A-F]{6}$/.test(h)) return getSavedColors()
  const next = [h, ...getSavedColors().filter(c => c.toUpperCase() !== h)].slice(0, 16)
  try { localStorage.setItem('bloom_saved_colors', JSON.stringify(next)) } catch {}
  emitSavedColors()
  return next
}
export function removeSavedColor(hex) {
  const h = (hex || '').toUpperCase()
  const next = getSavedColors().filter(c => c.toUpperCase() !== h)
  try { localStorage.setItem('bloom_saved_colors', JSON.stringify(next)) } catch {}
  emitSavedColors()
  return next
}
// The active theme's accent — the "default Bloom color" for the current scheme,
// read live from the CSS variable the theme sets.
export function activeAccent() {
  try { return (getComputedStyle(document.documentElement).getPropertyValue('--teal') || '').trim() || '#4A9EB5' } catch { return '#4A9EB5' }
}

// Multi-stripe backgrounds for the Pride / Trans swatches.
export const TILE_GRADIENTS = {
  pride: 'linear-gradient(135deg, #E8503A 0%, #E8503A 16%, #F0A028 16%, #F0A028 33%, #F5D400 33%, #F5D400 50%, #4CA64C 50%, #4CA64C 66%, #3A6FD8 66%, #3A6FD8 83%, #8E44AD 83%, #8E44AD 100%)',
  trans: 'linear-gradient(135deg, #5BCEFA 0%, #5BCEFA 25%, #F5A9B8 25%, #F5A9B8 40%, #FFFFFF 40%, #FFFFFF 60%, #F5A9B8 60%, #F5A9B8 75%, #5BCEFA 75%, #5BCEFA 100%)',
}
export function tileBackground(theme) {
  // Multi-stripe identity tiles win; otherwise show the theme's glimmer so the
  // shimmer is visible right on the picker swatch, falling back to a flat color.
  if (TILE_GRADIENTS[theme.tile]) return TILE_GRADIENTS[theme.tile]
  return theme.glimmer || theme.tile
}

// ── Apply to the document ────────────────────────────────────
// Set only the accent-family CSS vars from a theme-like object (accent + its
// derived deep/light/glimmer). Shared by the preset/custom accent path and the
// "follow season" path, so both recolor the app identically.
function setAccentVars(t) {
  const r = document.documentElement.style
  const map = {
    '--teal': t.accent, '--sea-deep': t.accent, '--green-mid': t.accent, '--sea': t.accent,
    '--forest': t.deep, '--deep-forest': t.deep, '--reef': t.deep,
    '--green-light': t.light,
    // Readable foreground for anything filled with the accent (e.g. the FAB) —
    // dark on light accents, light on dark ones.
    '--on-accent': iconColorOn(t.accent),
  }
  Object.entries(map).forEach(([k, v]) => r.setProperty(k, v))
  // The shimmer gradient for the FAB / accents. Falls back to the flat accent.
  r.setProperty('--glimmer', t.glimmer || t.accent)
  // Keep the iOS status-bar / browser chrome color in step with the theme.
  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) meta.setAttribute('content', t.deep)
}
export function applyTheme(id) {
  if (typeof document === 'undefined') return
  setAccentVars(getTheme(id))
}

// ── Looks (Bloom + seasons) ──────────────────────────────────
// A "look" is the full skin: it recolors the banner (the header gradient) and
// the ambient backdrop, sets an ambient motion effect, and carries a default
// accent. The accent can still be overridden by a preset or a Custom color
// independently — the look keeps owning the banner + motion either way.
//
// "Bloom" is the signature default (not a calendar season): soft iridescent
// bubbles drifting up over the sea-breeze pastels. The four seasons follow it.
export const BLOOM_LOOK = {
  id:'bloom', label:'Bloom', accent:'#4A9EB5', effect:'bubbles',
  banner:['#B8D8E8','#C8BFDF','#E8C4C8','#F0D4C0'],
  wash:['rgba(184,216,232,.55)','rgba(200,191,223,.50)','rgba(232,196,200,.45)','rgba(240,212,192,.45)'],
}
export const SEASONS = [
  { id:'spring', label:'Spring', accent:'#7FAE6B', effect:'petals',
    banner:['#D8E9C6','#E7DCEF','#F5D6DF','#DDECD1'],
    wash:['rgba(198,224,176,.50)','rgba(224,206,236,.45)','rgba(244,208,216,.42)','rgba(214,232,198,.42)'] },
  // Summer — dappled sunlight through leaves. Sunny meadow-to-sky: green, gold,
  // warm sand, sky-teal — multi-hued so the banner pops like Bloom's.
  { id:'summer', label:'Summer', accent:'#5F9E6B', effect:'dapple',
    banner:['#C2E4A2','#E9E79E','#F3D29A','#A9D9DD'],
    wash:['rgba(190,224,150,.50)','rgba(232,228,150,.45)','rgba(246,214,150,.42)','rgba(168,214,220,.44)'] },
  // Fall — gold, amber, rust, and a berry pop for depth.
  { id:'fall', label:'Fall', accent:'#D2814B', effect:'leaves',
    banner:['#F2D89E','#EBAB6E','#DE8257','#C77A8E'],
    wash:['rgba(240,214,158,.50)','rgba(233,168,110,.45)','rgba(216,120,80,.40)','rgba(196,122,142,.42)'] },
  // Winter — ice blue, periwinkle, frost pink, mint: a multi-hued frost.
  { id:'winter', label:'Winter', accent:'#6E93B8', effect:'snow',
    banner:['#D2E4F0','#DCD9F1','#EFDCEC','#CDEBE6'],
    wash:['rgba(200,222,240,.50)','rgba(214,210,240,.45)','rgba(238,214,232,.42)','rgba(200,232,224,.44)'] },
]
const ALL_LOOKS = [BLOOM_LOOK, ...SEASONS]
// Northern-hemisphere calendar season for a month index (0=Jan).
export function seasonForMonth(m) {
  if (m >= 2 && m <= 4) return 'spring'
  if (m >= 5 && m <= 7) return 'summer'
  if (m >= 8 && m <= 10) return 'fall'
  return 'winter'
}
export function getSeasonPref() {
  try { return localStorage.getItem('bloom_season') || 'bloom' } catch { return 'bloom' }
}
export function setSeasonPref(v) { try { localStorage.setItem('bloom_season', v) } catch {} }
// The active look: 'bloom' (signature) or a season; 'auto' → the calendar season.
export function resolveSeason(pref = getSeasonPref()) {
  if (pref === 'bloom') return BLOOM_LOOK
  const id = (pref && pref !== 'auto') ? pref : seasonForMonth(new Date().getMonth())
  return ALL_LOOKS.find(s => s.id === id) || BLOOM_LOOK
}
// Apply a season's banner + backdrop + motion flag. When `accentFromSeason` is
// set, its accent also drives the accent-family vars (the "follow season" case).
export function applySeason(pref = getSeasonPref(), { accentFromSeason = false } = {}) {
  if (typeof document === 'undefined') return null
  const s = resolveSeason(pref)
  const r = document.documentElement.style
  const [b1, b2, b3, b4] = s.banner
  r.setProperty('--bloom-header-start', b1)
  r.setProperty('--bloom-header-mid', b2)
  r.setProperty('--bloom-header-rose', b3)
  r.setProperty('--bloom-header-peach', b4)
  s.wash.forEach((w, i) => r.setProperty(`--bloom-wash-${i + 1}`, w))
  document.documentElement.dataset.season = s.id
  if (accentFromSeason) setAccentVars(deriveTheme(s.accent, s.label, 'season'))
  return s
}
// One call that puts the whole look on the document: the season's banner +
// motion, then the accent — from the season itself, or the chosen preset/custom.
export function applyLook(seasonPref = getSeasonPref(), themePref = getThemePref()) {
  const followSeason = themePref === 'season'
  const s = applySeason(seasonPref, { accentFromSeason: followSeason })
  if (!followSeason) applyTheme(themePref)
  return s
}

export function applyFont(id) {
  if (typeof document === 'undefined') return
  document.documentElement.classList.toggle('font-dyslexic', id === 'dyslexic')
}

export function applyLayout(id) {
  if (typeof document === 'undefined') return
  const c = document.documentElement.classList
  c.toggle('layout-simplified', id === 'simplified')
  c.toggle('layout-minimal', id === 'minimal')
}

// ── Persistence (device-local) ───────────────────────────────
export function getThemePref() {
  // Default 'season' → the accent follows the active season until you pick a
  // preset or a Custom color. (Existing installs keep whatever they saved.)
  try { return localStorage.getItem('bloom_theme') || 'season' } catch { return 'season' }
}
export function setThemePref(v) {
  try { localStorage.setItem('bloom_theme', v) } catch {}
}
export function getFontPref() {
  try { return localStorage.getItem('bloom_font') || 'system' } catch { return 'system' }
}
export function setFontPref(v) {
  try { localStorage.setItem('bloom_font', v) } catch {}
}
export function getLayoutPref() {
  try { return localStorage.getItem('bloom_layout') || 'full' } catch { return 'full' }
}
export function setLayoutPref(v) {
  try { localStorage.setItem('bloom_layout', v) } catch {}
}
export function getSummaryPref() {
  try { return localStorage.getItem('bloom_summary') || 'dots' } catch { return 'dots' }
}
export function setSummaryPref(v) {
  try { localStorage.setItem('bloom_summary', v) } catch {}
}
// In-app sound effects (reminder chimes / previews). On by default.
export function getSoundEnabled() {
  try { return localStorage.getItem('bloom_sound') !== 'off' } catch { return true }
}
export function setSoundEnabled(on) {
  try { localStorage.setItem('bloom_sound', on ? 'on' : 'off') } catch {}
}

// Apply whatever's saved — call once as early as possible to avoid a flash of
// the default look before React mounts.
export function applySavedAppearance() {
  applyLook(getSeasonPref(), getThemePref())
  applyFont(getFontPref())
  applyLayout(getLayoutPref())
}
