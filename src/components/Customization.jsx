// src/components/Customization.jsx
// Look & feel — Font (System / OpenDyslexic) and "App Icon" (accent theme),
// modeled on Structured's Customization screen. Font and theme are applied live
// by the parent (App) and persisted per-device.
import { THEMES, FONTS, tileBackground } from '../lib/appearance.js'

const sectionLabel = { fontSize:13, fontWeight:700, color:'var(--muted)', letterSpacing:.2, margin:'6px 2px 10px' }
const card = { background:'white', borderRadius:16, border:'1px solid var(--border)', padding:16, marginBottom:12 }

// The check-mark that stands in for the app icon, tinted per theme.
function IconTile({ theme, selected, onClick }) {
  const bg = tileBackground(theme)
  return (
    <button onClick={onClick} aria-label={theme.label}
      style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:8, background:'none', border:'none', cursor:'pointer', padding:0, fontFamily:'DM Sans,sans-serif' }}>
      <span style={{ position:'relative', width:66, height:66, borderRadius:17, background:bg,
        boxShadow: selected ? '0 0 0 3px var(--teal)' : '0 2px 8px rgba(20,30,40,.16)',
        display:'flex', alignItems:'center', justifyContent:'center' }}>
        <svg viewBox="0 0 24 24" width="34" height="34" fill="none" stroke="#fff" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round"
          style={{ filter:'drop-shadow(0 1px 1px rgba(0,0,0,.25))' }}>
          <polyline points="20 6 9 17 4 12" />
        </svg>
        {selected && (
          <span style={{ position:'absolute', top:-6, right:-6, width:22, height:22, borderRadius:'50%', background:'var(--teal)', border:'2px solid white', display:'flex', alignItems:'center', justifyContent:'center' }}>
            <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="#fff" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
          </span>
        )}
      </span>
      <span style={{ fontSize:13, fontWeight:600, color: selected ? 'var(--text)' : 'var(--muted)' }}>{theme.label}</span>
    </button>
  )
}

function FontTile({ font, selected, onClick }) {
  return (
    <button onClick={onClick}
      style={{ flex:1, minWidth:0, background:'white', cursor:'pointer', padding:'22px 12px 14px', borderRadius:14,
        border: selected ? '2px solid var(--teal)' : '1px solid var(--border)', display:'flex', flexDirection:'column', alignItems:'center', gap:14 }}>
      <span style={{ fontFamily:font.family, fontSize:30, fontWeight:700, color:'var(--text)', lineHeight:1 }}>Aa 123</span>
      <span style={{ fontSize:13, fontWeight:600, fontFamily:font.family,
        color: selected ? 'var(--teal)' : 'var(--muted)',
        border: selected ? '1px solid var(--teal)' : '1px solid transparent',
        borderRadius:16, padding:'4px 14px' }}>{font.label}</span>
    </button>
  )
}

export default function Customization({ font, onFont, theme, onTheme }) {
  return (
    <div>
      <div className="page-title" style={{ marginBottom:4 }}>Customization</div>
      <div className="page-sub">Make Bloom yours — pick a reading font and an accent theme.</div>

      {/* ── Font ──────────────────────────────────────────────── */}
      <div style={sectionLabel}>Font</div>
      <div style={{ ...card, display:'flex', gap:12 }}>
        {FONTS.map(f => (
          <FontTile key={f.id} font={f} selected={font === f.id} onClick={() => onFont(f.id)} />
        ))}
      </div>
      <div style={{ fontSize:12.5, color:'var(--muted)', lineHeight:1.55, margin:'0 2px 22px' }}>
        OpenDyslexic is designed against some common symptoms of dyslexia — weighted
        letter bottoms help keep characters from flipping. Applied across the whole
        app; some fine details may not switch.
      </div>

      {/* ── App Icon / accent theme ───────────────────────────── */}
      <div style={sectionLabel}>App Icon</div>
      <div style={card}>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(3, 1fr)', gap:'18px 8px', justifyItems:'center' }}>
          {THEMES.map(t => (
            <IconTile key={t.id} theme={t} selected={theme === t.id} onClick={() => onTheme(t.id)} />
          ))}
        </div>
      </div>
      <div style={{ fontSize:12.5, color:'var(--muted)', lineHeight:1.55, margin:'0 2px 8px' }}>
        Recolors Bloom’s accent throughout the app. On the web the installed
        home-screen icon can’t be swapped, so this changes the in-app theme.
      </div>
    </div>
  )
}
