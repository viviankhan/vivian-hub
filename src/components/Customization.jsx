// src/components/Customization.jsx
// Look & feel — Font (System / OpenDyslexic) and "App Icon" (accent theme),
// modeled on Structured's Customization screen. Font and theme are applied live
// by the parent (App) and persisted per-device.
import { THEMES, FONTS, LAYOUTS, tileBackground, deriveTheme } from '../lib/appearance.js'

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

// A pill toggle switch (In-App Sound).
function Switch({ on, onClick }) {
  return (
    <button onClick={onClick} aria-pressed={on}
      style={{ width:52, height:31, borderRadius:16, border:'none', cursor:'pointer', padding:3, flexShrink:0,
        background: on ? 'var(--teal)' : '#CBD2DA', transition:'background .2s', display:'flex', justifyContent: on ? 'flex-end' : 'flex-start' }}>
      <span style={{ width:25, height:25, borderRadius:'50%', background:'white', boxShadow:'0 1px 3px rgba(0,0,0,.28)' }} />
    </button>
  )
}

const FlameGlyph = () => (<svg viewBox="0 0 24 24" width="19" height="19" fill="currentColor"><path d="M12 3c1 3 4.8 4.3 4.8 8.6A4.8 4.8 0 0 1 7.2 12c0-2 1-3.2 2-4.2.5 2 1.6 2 2 1 .5-1.2-1.2-3.2-1.2-5.8Z"/></svg>)

// A single-color picker that derives the whole theme from one accent. The
// swatch previews the derived deep/light so you see what one color populates.
function CustomColorCard({ active, value, onChange }) {
  const t = deriveTheme(value)
  return (
    <div style={{ ...card, display:'flex', alignItems:'center', gap:14 }}>
      <label style={{ position:'relative', width:66, height:66, borderRadius:17, background:t.accent, cursor:'pointer', flexShrink:0,
        boxShadow: active ? '0 0 0 3px var(--teal)' : '0 2px 8px rgba(20,30,40,.16)', display:'flex', alignItems:'center', justifyContent:'center' }}>
        <input type="color" value={/^#[0-9a-fA-F]{6}$/.test(value) ? value : '#7BA7B0'} onChange={e => onChange(e.target.value)}
          style={{ position:'absolute', inset:0, opacity:0, cursor:'pointer' }} />
        <svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="#fff" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" style={{ filter:'drop-shadow(0 1px 1px rgba(0,0,0,.25))' }}>
          <polyline points="20 6 9 17 4 12" />
        </svg>
      </label>
      <div style={{ flex:1, minWidth:0 }}>
        <div style={{ fontSize:14, fontWeight:700, color:'var(--text)', marginBottom:3 }}>Custom color</div>
        <div style={{ fontSize:12, color:'var(--muted)', lineHeight:1.5, marginBottom:8 }}>Pick one color — Bloom derives every surface from it.</div>
        {/* Preview of the three derived surfaces */}
        <div style={{ display:'flex', gap:6, alignItems:'center' }}>
          {[t.deep, t.accent, t.light].map((c,i) => <span key={i} style={{ width:24, height:16, borderRadius:5, background:c, border:'1px solid rgba(0,0,0,.08)' }} />)}
          <span style={{ fontSize:11, color: active ? 'var(--teal)' : 'var(--muted)', fontWeight:600, marginLeft:4 }}>{active ? 'Active' : value?.toUpperCase()}</span>
        </div>
      </div>
    </div>
  )
}

export default function Customization({ font, onFont, theme, onTheme, customColor, onCustomColor, layout, onLayout, soundOn, onSound, summary, onSummary }) {
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
      <div style={sectionLabel}>Theme</div>
      <div style={card}>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(3, 1fr)', gap:'18px 8px', justifyItems:'center' }}>
          {THEMES.map(t => (
            <IconTile key={t.id} theme={t} selected={theme === t.id} onClick={() => onTheme(t.id)} />
          ))}
        </div>
      </div>
      {/* One color that auto-populates the whole palette */}
      {onCustomColor && <CustomColorCard active={theme === 'custom'} value={customColor} onChange={onCustomColor} />}
      <div style={{ fontSize:12.5, color:'var(--muted)', lineHeight:1.55, margin:'0 2px 22px' }}>
        Recolors Bloom’s accent throughout the app; it won’t change the color of
        existing tasks. On the web the installed home-screen icon can’t be
        swapped, so this changes the in-app theme.
      </div>

      {/* ── Layout ────────────────────────────────────────────── */}
      <div style={sectionLabel}>Layout</div>
      <div style={{ ...card, padding:6, display:'flex', gap:4, background:'white' }}>
        {LAYOUTS.map(l => {
          const on = layout === l.id
          return (
            <button key={l.id} onClick={() => onLayout(l.id)}
              style={{ flex:1, padding:'11px 6px', borderRadius:12, border:'none', cursor:'pointer', fontFamily:'DM Sans,sans-serif', fontSize:14, fontWeight:600,
                background: on ? 'var(--teal)' : 'transparent', color: on ? 'white' : 'var(--muted)', transition:'background .15s' }}>
              {l.label}
            </button>
          )
        })}
      </div>
      <div style={{ fontSize:12.5, color:'var(--muted)', lineHeight:1.55, margin:'0 2px 22px' }}>
        <i>Simplified</i> and <i>Minimal</i> hide certain elements — routine cards,
        then the free-time gaps on the timeline — to make the day less distracting.
      </div>

      {/* ── Summary Display ───────────────────────────────────── */}
      <div style={sectionLabel}>Summary Display</div>
      <div style={{ ...card, padding:6, display:'flex', gap:4, background:'white' }}>
        {[['dots', <span key="d" style={{ display:'flex', gap:4 }}>{['#5FA85C','#E0A33E','#7C9CBF'].map(c => <span key={c} style={{ width:9, height:9, borderRadius:'50%', background:c }} />)}</span>],
          ['streak', <span key="s" style={{ display:'inline-flex' }}><FlameGlyph /></span>]].map(([id, node]) => {
          const on = summary === id
          return (
            <button key={id} onClick={() => onSummary(id)}
              style={{ flex:1, height:44, borderRadius:12, border:'none', cursor:'pointer',
                background: on ? 'var(--teal)' : 'transparent', color: on ? 'white' : 'var(--muted)',
                display:'flex', alignItems:'center', justifyContent:'center' }}>
              {node}
            </button>
          )
        })}
      </div>
      <div style={{ fontSize:12.5, color:'var(--muted)', lineHeight:1.55, margin:'0 2px 22px' }}>
        The week strip on Today shows either colored category <i>dots</i> per day, or
        a <i>streak</i> flame on the days you fully completed.
      </div>

      {/* ── Sound Effects ─────────────────────────────────────── */}
      <div style={sectionLabel}>Sound Effects</div>
      <div style={{ ...card, display:'flex', alignItems:'center', gap:12, marginBottom:8 }}>
        <span style={{ display:'inline-flex', color:'var(--teal)' }}>
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 5 6 9H2v6h4l5 4V5Z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M19 5a9 9 0 0 1 0 14"/></svg>
        </span>
        <span style={{ flex:1, fontSize:15, fontWeight:500, color:'var(--text)' }}>In-App Sound</span>
        <Switch on={soundOn} onClick={() => onSound(!soundOn)} />
      </div>
      <div style={{ fontSize:12.5, color:'var(--muted)', lineHeight:1.55, margin:'0 2px 8px' }}>
        Plays a chime in-app when a reminder fires while Bloom is open, and when
        you preview alert sounds. Your phone still controls system notifications.
      </div>
    </div>
  )
}
