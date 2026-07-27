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

// Each theme mirrors one of the app-icon looks. `accent` drives buttons, nav,
// links and timeline spines; `deep` is the dark surface (drawer header, FAB);
// `light` is the pale on-dark text/tint. `tile` is how the icon swatch is
// drawn — a solid color, or a special multi-stripe fill for Pride/Trans.
export const THEMES = [
  { id:'bloom',   label:'Bloom',   accent:'#4A9EB5', deep:'#2A4858', light:'#E8F6FA', tile:'#4A9EB5' },
  { id:'day',     label:'Day',     accent:'#E5849A', deep:'#7E3B4C', light:'#FDEEF1', tile:'#E5849A' },
  { id:'night',   label:'Night',   accent:'#4A6C93', deep:'#22344B', light:'#E7EDF5', tile:'#3E5C82' },
  { id:'nature',  label:'Nature',  accent:'#5FA85C', deep:'#35602F', light:'#E9F5E7', tile:'#5FA85C' },
  { id:'classic', label:'Classic', accent:'#4A4A4A', deep:'#1C1C1C', light:'#ECECEC', tile:'#2E2E2E' },
  { id:'pride',   label:'Pride',   accent:'#C64B8C', deep:'#6A2E63', light:'#F6E7F1', tile:'pride' },
  { id:'trans',   label:'Trans',   accent:'#57B7E6', deep:'#2E6E8E', light:'#E7F4FB', tile:'trans' },
  { id:'ocean',   label:'Ocean',   accent:'#3A82C2', deep:'#1E4C78', light:'#E6F0F9', tile:'#3A82C2' },
  { id:'amber',   label:'Amber',   accent:'#D2952F', deep:'#855420', light:'#F7EDD9', tile:'#D2952F' },
]

export const FONTS = [
  { id:'system',   label:'System',       family:"'DM Sans', system-ui, -apple-system, sans-serif" },
  { id:'dyslexic', label:'OpenDyslexic', family:"'OpenDyslexic', 'DM Sans', sans-serif" },
]

export function getTheme(id) {
  return THEMES.find(t => t.id === id) || THEMES[0]
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

// Apply whatever's saved — call once as early as possible to avoid a flash of
// the default theme before React mounts.
export function applySavedAppearance() {
  applyTheme(getThemePref())
  applyFont(getFontPref())
}
