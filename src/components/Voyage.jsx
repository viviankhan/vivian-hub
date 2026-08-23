import { useState } from 'react'
import { Glyph } from '../lib/glyphs.jsx'
import { AlienSky } from '../lib/critters.jsx'
import { Rocket, Planet } from '../lib/spaceart.jsx'
import { spendStars } from '../lib/wellness.js'
import {
  PART_CATS, PARTS, freshShip, freshSpace,
  partById, equippedPart, equippedParts, isOwned, withEquip, withOwned, shipCompletion,
} from '../lib/space.js'

// A little star pip.
function Star({ size = 15 }) {
  return <svg viewBox="0 0 24 24" width={size} height={size} fill="#FBE79E" stroke="#C9A94A" strokeWidth="1.2" aria-hidden="true" style={{ display: 'block' }}>
    <path d="M12 3.2l2.6 5.6 6.1.8-4.5 4.2 1.1 6.1L12 17.1l-5.4 2.8 1.1-6.1L3.3 9.6l6.1-.8Z" />
  </svg>
}

export default function Voyage({ game, persistGame, space, persistSpace }) {
  const sp = space && typeof space === 'object' && space.ship ? space : freshSpace()
  const ship = sp.ship || freshShip()
  const stars = Math.max(0, Math.round(game?.stars || 0))
  const equipped = equippedParts(ship)
  const done = shipCompletion(ship)

  const [cat, setCat] = useState('nose')
  const [msg, setMsg] = useState(null)
  const [launching, setLaunching] = useState(false)
  const flash = (m) => { setMsg(m); setTimeout(() => setMsg(null), 2400) }

  // Buy (if needed) then equip the part.
  const pick = (part) => {
    if (isOwned(ship, part.id)) { persistSpace(withEquip(sp, cat, part.id)); return }
    const g = spendStars(game, part.cost)
    if (!g) { flash(`${part.cost - stars} more stars for ${part.name}.`); return }
    persistGame(g)
    persistSpace(withEquip(withOwned(sp, part.id), cat, part.id))
    flash(`${part.name} added to your rocket!`)
  }

  const launch = () => { setLaunching(true); setTimeout(() => setLaunching(false), 1600) }

  return (
    <div className="vy-wrap">
      {/* ── Launchpad scene ── */}
      <section className="vy-pad">
        <AlienSky className="vy-pad-bg" />
        <div className="vy-stars-chip"><Star /> {stars}</div>
        <div className="vy-pad-planet"><Planet color="#9E86C8" ring id="pad" size={92} /></div>
        <div className={`vy-pad-rocket ${launching ? 'vy-launching' : ''}`}>
          <Rocket equipped={equipped} size={168} />
        </div>
        <div className="vy-pad-base" aria-hidden="true"><span /><span /><span /></div>
        <button className="vy-launch-btn" onClick={launch}><Glyph id="rocket" size={15} color="#3A2E1A" /> Launch!</button>
      </section>

      {/* ── Parts shop ── */}
      <section className="vy-card">
        <div className="vy-card-head">
          <h3 className="serif">Rocket shop</h3>
          <span className="vy-count">{done.owned}/{done.total} parts</span>
        </div>

        {/* category pills */}
        <div className="vy-cats">
          {PART_CATS.map(c => (
            <button key={c.key} className={`vy-cat ${cat === c.key ? 'on' : ''}`} onClick={() => setCat(c.key)}>{c.name}</button>
          ))}
        </div>

        {/* the options in this category, previewed on your rocket */}
        <div className="vy-parts">
          {PARTS[cat].map(part => {
            const owned = isOwned(ship, part.id)
            const on = equippedPart(ship, cat).id === part.id
            const afford = stars >= part.cost
            const preview = { ...equipped, [cat]: part }
            return (
              <button key={part.id} className={`vy-part ${on ? 'on' : ''} ${(!owned && !afford) ? 'cant' : ''}`} onClick={() => pick(part)}>
                <span className="vy-part-preview"><Rocket equipped={preview} size={72} flame={false} /></span>
                <span className="vy-part-name">{part.name}</span>
                {owned
                  ? <span className={`vy-part-tag ${on ? 'worn' : ''}`}>{on ? 'Equipped' : 'Owned'}</span>
                  : <span className="vy-part-tag buy"><Star size={11} /> {part.cost}</span>}
              </button>
            )
          })}
        </div>
      </section>

      <p className="vy-footer">Stars are earned by tending to yourself — every check-in and moment you log in Wellness fuels the shop.</p>

      {msg && <div className="wl-reward vy-toast">{msg}</div>}
    </div>
  )
}
