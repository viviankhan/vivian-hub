// src/components/Customization.jsx
// Look & feel — Font, Season (the seasonal skin: banner + ambient motion +
// accent), Accent color (follow the season, a preset, or a custom color),
// Layout, Summary display, and in-app sound. All applied live by App and
// persisted per-device.
import { THEMES, FONTS, LAYOUTS, tileBackground, SEASONS, BLOOM_LOOK, resolveSeason } from '../lib/appearance.js'
import ColorSwatchRow from './ColorSwatchRow.jsx'
import { Icon } from './IconPicker.jsx'

const sectionLabel = { fontSize:13, fontWeight:700, color:'var(--muted)', letterSpacing:.2, margin:'6px 2px 10px' }
const card = { background:'white', borderRadius:16, border:'1px solid var(--border)', padding:16, marginBottom:12 }
const help = { fontSize:12.5, color:'var(--muted)', lineHeight:1.55, margin:'0 2px 22px' }

// The app's own line icons for each look (no colored emoji).
const SEASON_ICON = { bloom:'glyph:flower', spring:'glyph:sprout', summer:'glyph:sun', fall:'glyph:leaf', winter:'glyph:snow', auto:'glyph:calendar' }
const gradOf = (s) => `linear-gradient(135deg, ${s.banner.join(', ')})`

function CheckBadge() {
  return (
    <span style={{ position:'absolute', top:-6, right:-6, width:22, height:22, borderRadius:'50%', background:'var(--teal)', border:'2px solid white', display:'flex', alignItems:'center', justifyContent:'center' }}>
      <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="#fff" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
    </span>
  )
}

// A look swatch — a banner-gradient tile with the app's line icon on it.
function SeasonTile({ label, gradient, icon, sub, selected, onClick }) {
  return (
    <button onClick={onClick} aria-label={label}
      style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:6, background:'none', border:'none', cursor:'pointer', padding:0, fontFamily:'DM Sans,sans-serif', flexShrink:0, width:70 }}>
      <span style={{ position:'relative', width:66, height:66, borderRadius:17, background:gradient,
        boxShadow: selected ? '0 0 0 3px var(--teal)' : '0 2px 8px rgba(20,30,40,.16)', display:'flex', alignItems:'center', justifyContent:'center' }}>
        <span style={{ display:'flex', filter:'drop-shadow(0 1px 1px rgba(255,255,255,.5))' }}>
          <Icon value={icon} size={30} color="#38424F" />
        </span>
        {selected && <CheckBadge />}
      </span>
      <span style={{ fontSize:13, fontWeight:600, color: selected ? 'var(--text)' : 'var(--muted)' }}>{label}</span>
      {sub && <span style={{ fontSize:10, color:'var(--muted)', marginTop:-3 }}>{sub}</span>}
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

export default function Customization({ font, onFont, theme, onTheme, season, onSeason, customColor, onCustomColor, layout, onLayout, soundOn, onSound, summary, onSummary }) {
  const autoSeason = resolveSeason('auto')
  return (
    <div>
      <div className="page-title" style={{ marginBottom:4 }}>Customization</div>
      <div className="page-sub">Make Bloom yours — a reading font, a season, and an accent.</div>

      {/* ── Font ──────────────────────────────────────────────── */}
      <div style={sectionLabel}>Font</div>
      <div style={{ ...card, display:'flex', gap:12 }}>
        {FONTS.map(f => (
          <FontTile key={f.id} font={f} selected={font === f.id} onClick={() => onFont(f.id)} />
        ))}
      </div>
      <div style={help}>
        OpenDyslexic is designed against some common symptoms of dyslexia — weighted
        letter bottoms help keep characters from flipping. Applied across the whole
        app; some fine details may not switch.
      </div>

      {/* ── Theme (Bloom + seasonal skins) ────────────────────── */}
      <div style={sectionLabel}>Theme</div>
      <div style={card}>
        <div style={{ display:'flex', gap:14, overflowX:'auto', paddingBottom:4, WebkitOverflowScrolling:'touch' }}>
          <SeasonTile label="Bloom" gradient={gradOf(BLOOM_LOOK)} icon={SEASON_ICON.bloom} sub="Signature"
            selected={season === 'bloom'} onClick={() => onSeason('bloom')} />
          <SeasonTile label="Auto" gradient={gradOf(autoSeason)} icon={SEASON_ICON.auto} sub={autoSeason.label}
            selected={season === 'auto'} onClick={() => onSeason('auto')} />
          {SEASONS.map(s => (
            <SeasonTile key={s.id} label={s.label} gradient={gradOf(s)} icon={SEASON_ICON[s.id]}
              selected={season === s.id} onClick={() => onSeason(s.id)} />
          ))}
        </div>
      </div>
      <div style={help}>
        <b>Bloom</b> is the signature look — iridescent bubbles drifting up over
        the sea-breeze pastels. The seasons restyle the banner and swap the
        ambient motion (petals, dappled summer sun, falling leaves, snow), each
        with a matching accent. <b>Auto</b> follows the calendar. Motion is slow
        and subtle, and skipped entirely if your device prefers reduced motion.
      </div>

      {/* ── Accent color ──────────────────────────────────────── */}
      <div style={sectionLabel}>Accent color</div>
      <div style={card}>
        <div style={{ display:'flex', gap:8, flexWrap:'wrap', alignItems:'center', marginBottom:14 }}>
          <button onClick={() => onTheme('season')}
            style={{ fontSize:12, padding:'7px 13px', borderRadius:18, cursor:'pointer', fontFamily:'DM Sans,sans-serif', fontWeight:600,
              border: theme === 'season' ? 'none' : '1px solid var(--border)',
              background: theme === 'season' ? 'var(--teal)' : 'white', color: theme === 'season' ? 'white' : 'var(--muted)' }}>
            {theme === 'season' ? '✓ ' : ''}Follow season
          </button>
          {THEMES.map(t => (
            <button key={t.id} onClick={() => onTheme(t.id)} title={t.label} aria-label={t.label}
              style={{ width:26, height:26, borderRadius:'50%', background:tileBackground(t), cursor:'pointer', padding:0,
                border: theme === t.id ? '3px solid white' : '3px solid transparent',
                boxShadow: theme === t.id ? '0 0 0 2px var(--teal)' : '0 0 0 1px rgba(0,0,0,.12)' }} />
          ))}
        </div>
        {onCustomColor && <>
          <div style={{ fontSize:10, color:'var(--muted)', letterSpacing:1, textTransform:'uppercase', marginBottom:4 }}>Or a custom color</div>
          <ColorSwatchRow value={theme === 'custom' ? customColor : ''} onChange={onCustomColor} />
        </>}
      </div>
      <div style={help}>
        The accent recolors buttons, the nav, and highlights throughout the app —
        it won’t change the color of existing tasks. <b>Follow season</b> lets it
        shift with the season; a preset or custom color pins it.
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
      <div style={help}>
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
      <div style={help}>
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
