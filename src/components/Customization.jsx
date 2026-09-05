// src/components/Customization.jsx
// Look & feel — Font, Season (the seasonal skin: banner + ambient motion +
// accent), Accent color (follow the season, a preset, or a custom color),
// Layout, Summary display, and in-app sound. All applied live by App and
// persisted per-device.
import { useState, useRef } from 'react'
import { THEMES, FONTS, LAYOUTS, tileBackground, SEASONS, BLOOM_LOOK, resolveSeason,
  BACKGROUNDS, bgCss, fileToBackgroundDataUri } from '../lib/appearance.js'
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

// A background-illustration swatch — previews the scene over a light card.
function BgTile({ label, css, selected, empty, onClick }) {
  return (
    <button onClick={onClick} aria-label={label}
      style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:6, background:'none', border:'none', cursor:'pointer', padding:0, fontFamily:'DM Sans,sans-serif', flexShrink:0, width:76 }}>
      <span style={{ position:'relative', width:76, height:62, borderRadius:14, overflow:'hidden', background:'#E9F1F6',
        boxShadow: selected ? '0 0 0 3px var(--teal)' : '0 1px 5px rgba(20,30,40,.14)', border:'1px solid rgba(0,0,0,.06)',
        display:'flex', alignItems:'center', justifyContent:'center' }}>
        {empty
          ? <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#AEB6C0" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="9"/><line x1="6" y1="18" x2="18" y2="6"/></svg>
          : <span style={{ position:'absolute', inset:0, background: css }} />}
        {selected && <CheckBadge />}
      </span>
      <span style={{ fontSize:12, fontWeight:600, color: selected ? 'var(--text)' : 'var(--muted)' }}>{label}</span>
    </button>
  )
}

export default function Customization({ font, onFont, theme, onTheme, season, onSeason, customColor, onCustomColor, background, onBackground, customBackground, onCustomBackground, mobileBackground, onMobileBackground, mobileCustomBackground, onMobileCustomBackground, layout, onLayout, soundOn, onSound, summary, onSummary, effectsOn, onEffects }) {
  const autoSeason = resolveSeason('auto')
  const bgFileRef = useRef(null)
  const [bgErr, setBgErr] = useState('')
  // The Background section edits one target at a time — the desktop layer or the
  // mobile (portrait phone) layer — so each can have its own scene or photo.
  const hasMobileBg = !!onMobileBackground
  const [bgTarget, setBgTarget] = useState('desktop')
  const onMobile = hasMobileBg && bgTarget === 'mobile'
  const activeBg        = onMobile ? mobileBackground : background
  const setActiveBg     = onMobile ? onMobileBackground : onBackground
  const activeCustom    = onMobile ? mobileCustomBackground : customBackground
  const setActiveCustom = onMobile ? onMobileCustomBackground : onCustomBackground
  const builtinBgs = BACKGROUNDS.filter(b => b.id !== 'none' && b.id !== 'custom')
  const onBgFile = async (e) => {
    const f = e.target.files?.[0]; e.target.value = ''
    if (!f) return
    if (!f.type.startsWith('image/')) { setBgErr('Please choose an image file.'); return }
    if (f.size > 12 * 1024 * 1024) { setBgErr('Image too large (max 12 MB).'); return }
    try { const uri = await fileToBackgroundDataUri(f); setActiveCustom && setActiveCustom(uri); setBgErr('') }
    catch { setBgErr('Could not read that image.') }
  }
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
        ambient motion (spring petals, drifting green summer leaves, autumn
        leaves, winter snow), each with a matching accent. <b>Auto</b> follows
        the calendar. Motion is slow
        and subtle, and skipped entirely if your device prefers reduced motion.
      </div>

      {/* ── Ambient motion toggle ─────────────────────────────── */}
      {onEffects && <>
        <div style={sectionLabel}>Ambient Motion</div>
        <div style={{ ...card, display:'flex', alignItems:'center', gap:12, marginBottom:8 }}>
          <span style={{ display:'inline-flex', color:'var(--teal)' }}>
            <Icon value={SEASON_ICON[season] || 'glyph:leaf'} size={22} color="var(--teal)" />
          </span>
          <span style={{ flex:1, fontSize:15, fontWeight:500, color:'var(--text)' }}>Drifting seasonal particles</span>
          <Switch on={effectsOn} onClick={() => onEffects(!effectsOn)} />
        </div>
        <div style={help}>
          The gentle drifting motion for the current look — petals, leaves, snow,
          or bubbles. Turn it off to keep the season’s colors without any moving
          particles. (Motion is always skipped when your device prefers reduced
          motion, whatever this is set to.)
        </div>
      </>}

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

      {/* ── Background illustration ───────────────────────────── */}
      <div style={sectionLabel}>Background</div>
      <div style={card}>
        {/* Desktop / Mobile target switch — each keeps its own scene or photo. */}
        {hasMobileBg && (
          <div style={{ display:'flex', gap:4, padding:4, background:'#EDF3F6', borderRadius:12, marginBottom:14 }}>
            {[['desktop','Desktop'], ['mobile','Mobile']].map(([id, label]) => {
              const on = bgTarget === id
              return (
                <button key={id} onClick={() => setBgTarget(id)}
                  style={{ flex:1, padding:'8px 6px', borderRadius:9, border:'none', cursor:'pointer', fontFamily:'DM Sans,sans-serif', fontSize:13, fontWeight:600,
                    background: on ? 'var(--teal)' : 'transparent', color: on ? 'white' : 'var(--muted)', transition:'background .15s' }}>
                  {label}
                </button>
              )
            })}
          </div>
        )}
        <div style={{ display:'flex', gap:12, overflowX:'auto', paddingBottom:4, WebkitOverflowScrolling:'touch' }}>
          <BgTile label="None" empty selected={activeBg === 'none' || !activeBg} onClick={() => setActiveBg('none')} />
          {builtinBgs.map(b => (
            <BgTile key={b.id} label={b.label} css={bgCss(b.id, undefined, { mobile: onMobile })} selected={activeBg === b.id} onClick={() => setActiveBg(b.id)} />
          ))}
          {activeCustom && (
            <BgTile label="Yours" css={bgCss('custom', activeCustom)} selected={activeBg === 'custom'} onClick={() => setActiveBg('custom')} />
          )}
        </div>
        <div style={{ display:'flex', gap:8, marginTop:12, alignItems:'center' }}>
          <button onClick={() => bgFileRef.current?.click()}
            style={{ fontSize:12, padding:'9px 14px', borderRadius:10, border:'1px solid var(--border)', background:'white', color:'var(--text)', cursor:'pointer', fontFamily:'DM Sans,sans-serif', fontWeight:600, display:'inline-flex', alignItems:'center', gap:7 }}>
            <Icon value="glyph:camera" size={15} color="var(--muted)" />{activeCustom ? 'Replace your image' : 'Upload your own'}
          </button>
          {activeCustom && (
            <button onClick={() => { setActiveCustom && setActiveCustom(''); setActiveBg('none') }}
              style={{ fontSize:12, padding:'9px 12px', borderRadius:10, border:'1px solid var(--border)', background:'white', color:'var(--muted)', cursor:'pointer', fontFamily:'DM Sans,sans-serif', fontWeight:600 }}>Remove</button>
          )}
          <input ref={bgFileRef} type="file" accept="image/*" hidden onChange={onBgFile} />
        </div>
        {bgErr && <div style={{ fontSize:11, color:'#EF4444', marginTop:8 }}>{bgErr}</div>}
      </div>
      <div style={help}>
        A soft scene behind your day, or upload your own photo. {hasMobileBg && <>
        Pick a look for <b>Desktop</b> and <b>Mobile</b> separately — the built-in
        scenes are sized to fill each one, so a phone in portrait gets a scene
        that actually shows instead of a sliver at the bottom. </>}Uploaded images
        get a light veil so text stays readable, and now follow you to your other
        devices — no re-uploading on each new one.
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
        <i>Minimal</i> hides the free-time gaps on the timeline, to make the day
        less distracting.
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
