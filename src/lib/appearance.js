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
// A full Bloom-style theme derived from one accent color.
export function deriveTheme(hex, label = 'Custom', id = 'custom') {
  const accent = (hex && /^#?[0-9a-fA-F]{3,6}$/.test(hex)) ? (hex[0] === '#' ? hex : '#' + hex) : '#4A9EB5'
  return { id, label, accent, deep: mix(accent, '#0C0F13', 0.46), light: mix(accent, '#FFFFFF', 0.86), tile: accent }
}

// Each theme is a variation on Bloom — same soft, calm structure, shifted hue.
// `accent` drives buttons, nav, links and timeline spines; `deep` is the dark
// surface (drawer header, FAB); `light` is the pale on-dark text/tint. `tile`
// is how the icon swatch is drawn — a solid color, or a multi-stripe fill.
// The first group are Bloom family variations; the originals stay below.
export const THEMES = [
  { id:'bloom',    label:'Bloom',    accent:'#4A9EB5', deep:'#2A4858', light:'#E8F6FA', tile:'#4A9EB5' },
  { id:'blush',    label:'Blush',    accent:'#E08AA0', deep:'#7C3F50', light:'#FBEDF1', tile:'#E08AA0' },
  { id:'lilac',    label:'Lilac',    accent:'#9B8BD0', deep:'#4C4183', light:'#EFEBF9', tile:'#9B8BD0' },
  { id:'meadow',   label:'Meadow',   accent:'#5FB891', deep:'#2F6B54', light:'#E6F5EE', tile:'#5FB891' },
  { id:'sky',      label:'Sky',      accent:'#6AA8DE', deep:'#345E86', light:'#E8F1FA', tile:'#6AA8DE' },
  { id:'apricot',  label:'Apricot',  accent:'#E0975B', deep:'#8A5427', light:'#FBEEE0', tile:'#E0975B' },
  { id:'day',      label:'Day',      accent:'#E5849A', deep:'#7E3B4C', light:'#FDEEF1', tile:'#E5849A' },
  { id:'night',    label:'Night',    accent:'#4A6C93', deep:'#22344B', light:'#E7EDF5', tile:'#3E5C82' },
  { id:'nature',   label:'Nature',   accent:'#5FA85C', deep:'#35602F', light:'#E9F5E7', tile:'#5FA85C' },
  { id:'classic',  label:'Classic',  accent:'#4A4A4A', deep:'#1C1C1C', light:'#ECECEC', tile:'#2E2E2E' },
  { id:'pride',    label:'Pride',    accent:'#C64B8C', deep:'#6A2E63', light:'#F6E7F1', tile:'pride' },
  { id:'trans',    label:'Trans',    accent:'#57B7E6', deep:'#2E6E8E', light:'#E7F4FB', tile:'trans' },
  { id:'ocean',    label:'Ocean',    accent:'#3A82C2', deep:'#1E4C78', light:'#E6F0F9', tile:'#3A82C2' },
  { id:'amber',    label:'Amber',    accent:'#D2952F', deep:'#855420', light:'#F7EDD9', tile:'#D2952F' },
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

// Multi-stripe backgrounds for the Pride / Trans swatches.
export const TILE_GRADIENTS = {
  pride: 'linear-gradient(135deg, #E8503A 0%, #E8503A 16%, #F0A028 16%, #F0A028 33%, #F5D400 33%, #F5D400 50%, #4CA64C 50%, #4CA64C 66%, #3A6FD8 66%, #3A6FD8 83%, #8E44AD 83%, #8E44AD 100%)',
  trans: 'linear-gradient(135deg, #5BCEFA 0%, #5BCEFA 25%, #F5A9B8 25%, #F5A9B8 40%, #FFFFFF 40%, #FFFFFF 60%, #F5A9B8 60%, #F5A9B8 75%, #5BCEFA 75%, #5BCEFA 100%)',
}
export function tileBackground(theme) {
  return TILE_GRADIENTS[theme.tile] || theme.tile
}

// ── Apply to the document ────────────────────────────────────
export function applyTheme(id) {
  if (typeof document === 'undefined') return
  const t = getTheme(id)
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
  // Keep the iOS status-bar / browser chrome color in step with the theme.
  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) meta.setAttribute('content', t.deep)
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
  try { return localStorage.getItem('bloom_theme') || 'bloom' } catch { return 'bloom' }
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
  applyTheme(getThemePref())
  applyFont(getFontPref())
  applyLayout(getLayoutPref())
}
