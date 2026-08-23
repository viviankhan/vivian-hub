import { useState } from 'react'
import { Glyph } from '../lib/glyphs.jsx'
import { AlienSky } from '../lib/critters.jsx'
import { Rocket, Planet, Specimen } from '../lib/spaceart.jsx'
import { spendStars } from '../lib/wellness.js'
import {
  PLANETS, SHIP_SKINS, EXPLORE_COST, freshSpace,
  planetById, isUnlocked, planetProgress, collectionCounts, pickReward,
  withSpecimen, withUnlocked, withCurrent, withShip,
} from '../lib/space.js'

// A little star pip.
function Star({ size = 15 }) {
  return <svg viewBox="0 0 24 24" width={size} height={size} fill="#FBE79E" stroke="#C9A94A" strokeWidth="1.2" aria-hidden="true" style={{ display: 'block' }}>
    <path d="M12 3.2l2.6 5.6 6.1.8-4.5 4.2 1.1 6.1L12 17.1l-5.4 2.8 1.1-6.1L3.3 9.6l6.1-.8Z" />
  </svg>
}

export default function Voyage({ game, persistGame, space, persistSpace }) {
  const sp = space && typeof space === 'object' ? space : freshSpace()
  const stars = Math.max(0, Math.round(game?.stars || 0))
  const currentId = isUnlocked(sp, sp.current) ? sp.current : 'verda'
  const planet = planetById(currentId)
  const prog = planetProgress(sp, currentId)
  const counts = collectionCounts(sp)
  const shipSkin = SHIP_SKINS.find(s => s.id === (sp.ship?.skin || 'classic')) || SHIP_SKINS[0]
  const owned = sp.ship?.owned || ['classic']

  const [reveal, setReveal] = useState(null)   // a just-found specimen
  const [msg, setMsg] = useState(null)
  const flash = (m) => { setMsg(m); setTimeout(() => setMsg(null), 2600) }

  const selectPlanet = (p) => {
    if (isUnlocked(sp, p.id)) { persistSpace(withCurrent(sp, p.id)); return }
    // Locked → try to unlock.
    const g = spendStars(game, p.unlock)
    if (!g) { flash(`${p.unlock - stars} more stars to reach ${p.name}.`); return }
    persistGame(g)
    persistSpace(withCurrent(withUnlocked(sp, p.id), p.id))
    flash(`${p.name} unlocked! Set a course.`)
  }

  const explore = () => {
    const reward = pickReward(sp, currentId)
    if (!reward) { flash(`You've cataloged all of ${planet.name}.`); return }
    const g = spendStars(game, EXPLORE_COST)
    if (!g) { flash(`Need ${EXPLORE_COST} stars to launch an expedition.`); return }
    persistGame(g)
    persistSpace(withSpecimen(sp, currentId, reward.id))
    setReveal(reward)
  }

  const chooseSkin = (skin) => {
    if (owned.includes(skin.id)) { persistSpace(withShip(sp, { skin: skin.id })); return }
    const g = spendStars(game, skin.cost)
    if (!g) { flash(`${skin.cost - stars} more stars for the ${skin.name} hull.`); return }
    persistGame(g)
    persistSpace(withShip(sp, { skin: skin.id, owned: [...owned, skin.id] }))
  }

  return (
    <div className="vy-wrap">
      {/* ── Space scene ── */}
      <section className="vy-scene">
        <AlienSky className="vy-scene-bg" />
        <div className="vy-stars-chip"><Star /> {stars}</div>
        <div className="vy-planet-stage">
          <div className="vy-planet-float"><Planet color={planet.color} ring={planet.ring} id={planet.id} size={150} /></div>
          <div className="vy-rocket-float"><Rocket color={shipSkin.color} size={70} /></div>
        </div>
        <div className="vy-scene-caption">
          <div className="serif vy-planet-name">{planet.name}</div>
          <div className="vy-planet-blurb">{planet.blurb}</div>
        </div>
      </section>

      {/* ── Expedition ── */}
      <section className="vy-card">
        <div className="vy-explore-row">
          <div>
            <div className="vy-explore-title serif">Expedition</div>
            <div className="vy-explore-sub">
              {prog.got.length < prog.total
                ? `${prog.got.length} of ${prog.total} specimens found on ${planet.name}.`
                : `Every specimen on ${planet.name} is cataloged. 🎉`}
            </div>
          </div>
          <button className="vy-btn primary" disabled={stars < EXPLORE_COST || prog.got.length >= prog.total} onClick={explore}>
            <Glyph id="rocket" size={16} color="#fff" /> Explore · {EXPLORE_COST}<Star size={13} />
          </button>
        </div>

        {/* Collection for this planet */}
        <div className="vy-collection">
          {planet.specimens.map(s => {
            const got = prog.got.some(g => g.id === s.id)
            return (
              <figure key={s.id} className={`vy-spec ${got ? 'got' : ''}`}>
                <Specimen form={s.form} color={s.color} collected={got} size={60} />
                <figcaption>{got ? s.name : '???'}</figcaption>
              </figure>
            )
          })}
        </div>
      </section>

      {/* ── Planets ── */}
      <section className="vy-card">
        <div className="vy-card-head"><h3 className="serif">Planets</h3><span className="vy-count">{counts.collected}/{counts.total} collected</span></div>
        <div className="vy-planets">
          {PLANETS.map(p => {
            const unlocked = isUnlocked(sp, p.id)
            const done = planetProgress(sp, p.id)
            const active = p.id === currentId
            return (
              <button key={p.id} className={`vy-planet-pick ${active ? 'active' : ''} ${unlocked ? '' : 'locked'}`} onClick={() => selectPlanet(p)}>
                <span className="vy-pick-disc"><Planet color={p.color} ring={p.ring} id={'pk' + p.id} size={54} /></span>
                <span className="vy-pick-name">{p.name}</span>
                {unlocked
                  ? <span className="vy-pick-meta">{done.got.length}/{done.total}</span>
                  : <span className="vy-pick-meta locked"><Glyph id="lock" size={11} /> {p.unlock}<Star size={11} /></span>}
              </button>
            )
          })}
        </div>
      </section>

      {/* ── Ship ── */}
      <section className="vy-card">
        <div className="vy-card-head"><h3 className="serif">Your ship</h3></div>
        <div className="vy-ship-row">
          <div className="vy-ship-preview"><Rocket color={shipSkin.color} size={72} flame={false} /></div>
          <div className="vy-skins">
            {SHIP_SKINS.map(skin => {
              const has = owned.includes(skin.id)
              const on = shipSkin.id === skin.id
              return (
                <button key={skin.id} className={`vy-skin ${on ? 'on' : ''}`} onClick={() => chooseSkin(skin)}>
                  <span className="vy-skin-dot" style={{ background: skin.color }} />
                  <span className="vy-skin-name">{skin.name}</span>
                  {has ? (on ? <span className="vy-skin-tag">Worn</span> : <span className="vy-skin-tag muted">Owned</span>)
                       : <span className="vy-skin-tag muted">{skin.cost}<Star size={10} /></span>}
                </button>
              )
            })}
          </div>
        </div>
      </section>

      <p className="vy-footer">Stars are earned by tending to yourself — every check-in and moment logged in Wellness adds to your ship's reserves.</p>

      {msg && <div className="wl-reward vy-toast">{msg}</div>}

      {/* Specimen reveal */}
      {reveal && (
        <div className="wl-modal-scrim" onClick={() => setReveal(null)}>
          <div className="wl-modal vy-reveal" onClick={(e) => e.stopPropagation()}>
            <div className="vy-reveal-burst"><Specimen form={reveal.form} color={reveal.color} collected size={140} /></div>
            <div className="vy-reveal-tag">New {reveal.kind}!</div>
            <div className="serif vy-reveal-name">{reveal.name}</div>
            <div className="vy-reveal-sub">brought aboard from {planet.name}</div>
            <button className="vy-btn primary block" onClick={() => setReveal(null)}>Add to collection</button>
          </div>
        </div>
      )}
    </div>
  )
}
