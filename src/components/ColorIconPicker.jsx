// src/components/ColorIconPicker.jsx
// A Structured-style "Color & Icon" bottom sheet. Pick a per-task color from a
// swatch row (or the native wheel), then pick an icon from a searchable,
// grouped grid — or upload your own image. The chosen icon is stored on the
// task itself (not just inherited from its category), so it shows on the
// timeline pill, the detail header, and everywhere the task appears.
import { useState, useRef } from 'react'
import { Icon, isImageIcon, fileToIconDataUri } from './IconPicker.jsx'

// Same palette the detail sheet uses, so a color picked here matches.
export const TASK_COLORS = ['#E0A33E','#C4728E','#EC6F9C','#7C9CBF','#4A9EB5','#52B788','#2A9D8F','#7C3AED','#E07B2E','#EF6B6B','#6B7A8D','#111827']

// Grouped icon library. `k` is search keywords for the search box.
const GROUPS = [
  { name:'Daily', items:[
    { e:'☀️', k:'sun morning rise day wake shine' }, { e:'🌙', k:'moon night sleep evening' },
    { e:'⏰', k:'alarm clock wake time' }, { e:'🛏️', k:'bed sleep rest nap' },
    { e:'☕', k:'coffee drink morning tea' }, { e:'🚿', k:'shower bath wash bathroom' },
    { e:'🪥', k:'toothbrush teeth brush bathroom hygiene' }, { e:'💧', k:'water hydrate drink' },
    { e:'🧴', k:'lotion skincare bathroom' }, { e:'✨', k:'sparkle clean fresh' },
  ]},
  { name:'Fitness', items:[
    { e:'🏃‍♀️', k:'run running jog exercise cardio' }, { e:'🏃', k:'run running jog exercise' },
    { e:'🧘', k:'yoga meditate stretch calm' }, { e:'🚴', k:'bike cycle cycling ride' },
    { e:'🏋️', k:'gym weights lift workout strength' }, { e:'🏊', k:'swim pool water' },
    { e:'⚽', k:'soccer football sport ball' }, { e:'🏀', k:'basketball sport ball' },
    { e:'🎾', k:'tennis sport ball racket' }, { e:'🥊', k:'boxing fight sport gym' },
  ]},
  { name:'Work & Study', items:[
    { e:'💼', k:'work job briefcase office career' }, { e:'💻', k:'laptop computer work code' },
    { e:'🖥️', k:'desktop computer monitor screen work' }, { e:'📚', k:'books study read school lab' },
    { e:'📖', k:'book read study reading' }, { e:'📝', k:'note write memo homework assignment' },
    { e:'✏️', k:'pencil write edit draft' }, { e:'📊', k:'chart data report analytics work' },
    { e:'🔬', k:'microscope science lab research' }, { e:'🧪', k:'test tube lab chemistry science' },
    { e:'🎓', k:'graduation school class degree study' }, { e:'📅', k:'calendar plan schedule meeting' },
  ]},
  { name:'Home', items:[
    { e:'🏠', k:'home house' }, { e:'🧹', k:'clean sweep chore tidy' },
    { e:'🧺', k:'laundry wash basket clothes chore' }, { e:'🧼', k:'soap clean wash dishes' },
    { e:'🍳', k:'cook cooking breakfast kitchen food' }, { e:'🛒', k:'shopping groceries store cart errand' },
    { e:'🌱', k:'plant garden water grow' }, { e:'🔧', k:'fix repair tool maintenance' },
    { e:'🐕', k:'dog pet walk animal prince' }, { e:'🐈', k:'cat pet animal' },
  ]},
  { name:'Health', items:[
    { e:'💊', k:'pill medicine meds vitamin health' }, { e:'🩺', k:'doctor appointment health checkup' },
    { e:'❤️', k:'heart love health care date' }, { e:'🧠', k:'brain mind focus mental' },
    { e:'🦷', k:'tooth dentist dental' }, { e:'👓', k:'glasses eye optometry' },
    { e:'🩹', k:'bandage first aid injury' }, { e:'🧘‍♀️', k:'meditate calm mindfulness relax' },
  ]},
  { name:'Food', items:[
    { e:'🍽️', k:'food eat meal dinner lunch plate' }, { e:'🍎', k:'apple fruit snack healthy' },
    { e:'🥗', k:'salad healthy food lunch veggie' }, { e:'🍕', k:'pizza food dinner' },
    { e:'🍔', k:'burger food lunch fast' }, { e:'🍜', k:'noodles ramen food soup' },
    { e:'🍰', k:'cake dessert sweet birthday' }, { e:'🍷', k:'wine drink dinner date' },
    { e:'🍺', k:'beer drink social' }, { e:'🥤', k:'drink soda beverage' },
  ]},
  { name:'Fun & Social', items:[
    { e:'🎮', k:'game gaming play video fun' }, { e:'🎬', k:'movie film cinema watch' },
    { e:'🎵', k:'music song listen' }, { e:'🎹', k:'piano music play instrument practice' },
    { e:'🎨', k:'art paint draw creative hobby' }, { e:'📷', k:'camera photo picture' },
    { e:'🎉', k:'party celebrate fun event' }, { e:'🍿', k:'popcorn movie snack' },
    { e:'🎧', k:'headphones music podcast listen' }, { e:'✈️', k:'plane travel trip flight vacation' },
    { e:'🏖️', k:'beach vacation travel relax' }, { e:'🎁', k:'gift present birthday' },
    { e:'💬', k:'chat talk message call social' }, { e:'💕', k:'love date heart romance' },
  ]},
  { name:'General', items:[
    { e:'⭐', k:'star important favorite' }, { e:'🔥', k:'fire streak hot priority' },
    { e:'📌', k:'pin important reminder' }, { e:'🎯', k:'target goal focus aim' },
    { e:'💡', k:'idea think lightbulb plan' }, { e:'💰', k:'money finance budget pay bill' },
    { e:'🛍️', k:'shopping errand buy store' }, { e:'📞', k:'phone call contact' },
    { e:'📧', k:'email mail message inbox' }, { e:'🔔', k:'bell reminder alert notify' },
    { e:'🗓️', k:'calendar date schedule plan' }, { e:'✅', k:'check done task complete' },
  ]},
]

const ALL = GROUPS.flatMap(g => g.items.map(it => ({ ...it, group:g.name })))

export default function ColorIconPicker({ color, icon, onColor, onIcon, onClose }) {
  const [q, setQ] = useState('')
  const [err, setErr] = useState('')
  const fileRef = useRef(null)
  const isCustomColor = !!color && !TASK_COLORS.includes(color)

  const term = q.trim().toLowerCase()
  const results = term ? ALL.filter(it => it.e.includes(term) || it.k.includes(term)) : null

  const onFile = async (e) => {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    if (!f.type.startsWith('image/')) { setErr('Please pick an image file.'); return }
    if (f.size > 2 * 1024 * 1024) { setErr('Image too large (max 2 MB).'); return }
    try { const uri = await fileToIconDataUri(f); onIcon(uri); setErr('') }
    catch { setErr('Could not read that image.') }
  }

  const IconBtn = ({ it }) => {
    const on = icon === it.e
    return (
      <button onClick={() => onIcon(it.e)} title={it.k.split(' ')[0]}
        style={{ width:52, height:52, borderRadius:'50%', border:'none', cursor:'pointer', flexShrink:0,
          display:'flex', alignItems:'center', justifyContent:'center',
          background: on ? (color || 'var(--teal)') : '#F1EFF3', transition:'background .15s' }}>
        <span style={{ fontSize:24, lineHeight:1, filter: on ? 'brightness(1.1)' : 'none' }}>{it.e}</span>
      </button>
    )
  }

  return (
    <div onClick={e => { e.stopPropagation(); onClose() }}
      style={{ position:'fixed', inset:0, background:'rgba(20,28,38,.5)', zIndex:700, display:'flex', alignItems:'flex-end', justifyContent:'center' }}>
      <div onClick={e => e.stopPropagation()}
        style={{ background:'white', borderRadius:'22px 22px 0 0', width:'100%', maxWidth:480, maxHeight:'88vh', display:'flex', flexDirection:'column', boxShadow:'0 -10px 44px rgba(20,40,60,.28)' }}>

        {/* Header */}
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'16px 18px 10px' }}>
          <span className="serif" style={{ fontSize:20, fontWeight:700, color:'var(--text)' }}>Color &amp; Icon</span>
          <button onClick={onClose} aria-label="Done"
            style={{ width:34, height:34, borderRadius:'50%', border:'none', background:'#F1EFF3', color:'var(--text)', fontSize:16, cursor:'pointer' }}>✕</button>
        </div>

        {/* Color swatches */}
        <div style={{ display:'flex', gap:10, alignItems:'center', overflowX:'auto', padding:'4px 18px 14px' }}>
          {TASK_COLORS.map(cx => (
            <button key={cx} onClick={() => onColor(cx)} aria-label={`Color ${cx}`}
              style={{ width:34, height:34, borderRadius:'50%', background:cx, cursor:'pointer', padding:0, flexShrink:0,
                border: color===cx ? '3px solid white' : '3px solid transparent',
                boxShadow: color===cx ? `0 0 0 2px ${cx}` : '0 0 0 1px rgba(0,0,0,.10)' }} />
          ))}
          <label title="Custom color" style={{ width:34, height:34, borderRadius:'50%', cursor:'pointer', position:'relative', overflow:'hidden', display:'inline-block', flexShrink:0,
            background: isCustomColor ? color : 'conic-gradient(from 90deg, #EF6B6B, #E0A33E, #52B788, #4A9EB5, #7C3AED, #EC6F9C, #EF6B6B)',
            border: isCustomColor ? '3px solid white' : '3px solid transparent',
            boxShadow: isCustomColor ? `0 0 0 2px ${color}` : '0 0 0 1px rgba(0,0,0,.10)' }}>
            <input type="color" value={color || '#4A9EB5'} onChange={e => onColor(e.target.value)}
              style={{ position:'absolute', top:'-40%', left:'-40%', width:'180%', height:'180%', opacity:0, cursor:'pointer', border:'none', padding:0 }} />
          </label>
        </div>

        {/* Search */}
        <div style={{ padding:'0 18px 10px' }}>
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search icons"
            style={{ width:'100%', fontSize:14, padding:'10px 14px', borderRadius:20, border:'none', background:'#F1EFF3', fontFamily:'DM Sans,sans-serif', outline:'none', boxSizing:'border-box', color:'var(--text)' }} />
        </div>

        {/* Grid */}
        <div style={{ flex:1, overflowY:'auto', padding:'2px 18px calc(16px + env(safe-area-inset-bottom))' }}>
          {results ? (
            results.length ? (
              <div style={{ display:'flex', flexWrap:'wrap', gap:10, paddingTop:6 }}>
                {results.map((it, i) => <IconBtn key={it.e + i} it={it} />)}
              </div>
            ) : (
              <div style={{ fontSize:13, color:'var(--muted)', padding:'20px 0', textAlign:'center' }}>No icons match “{q}”.</div>
            )
          ) : (
            GROUPS.map(g => (
              <div key={g.name} style={{ marginBottom:16 }}>
                <div style={{ fontSize:11, color:'var(--muted)', fontWeight:700, letterSpacing:.6, textTransform:'uppercase', margin:'10px 0 8px' }}>{g.name}</div>
                <div style={{ display:'flex', flexWrap:'wrap', gap:10 }}>
                  {g.items.map((it, i) => <IconBtn key={it.e + i} it={it} />)}
                </div>
              </div>
            ))
          )}

          {/* Upload / clear */}
          <div style={{ display:'flex', gap:8, marginTop:8, paddingTop:12, borderTop:'1px solid #F1EDF2' }}>
            <button onClick={() => fileRef.current?.click()}
              style={{ flex:1, fontSize:12, padding:'10px', borderRadius:10, border:'1px solid var(--border)', background:'white', color:'var(--text)', cursor:'pointer', fontFamily:'DM Sans,sans-serif', fontWeight:600 }}>
              ⬆ Upload image
            </button>
            {icon && (
              <button onClick={() => onIcon('')}
                style={{ fontSize:12, padding:'10px 16px', borderRadius:10, border:'1px solid var(--border)', background:'white', color:'var(--muted)', cursor:'pointer', fontFamily:'DM Sans,sans-serif', fontWeight:600 }}>
                Remove icon
              </button>
            )}
            <input ref={fileRef} type="file" accept="image/*" hidden onChange={onFile} />
          </div>
          {isImageIcon(icon) && <div style={{ fontSize:11, color:'var(--muted)', marginTop:8 }}>Custom image in use.</div>}
          {err && <div style={{ fontSize:11, color:'#EF4444', marginTop:8 }}>{err}</div>}
        </div>
      </div>
    </div>
  )
}
