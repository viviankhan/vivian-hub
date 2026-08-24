import { useState, useMemo } from 'react'
import { Glyph } from '../lib/glyphs.jsx'
import { AlienSky, DayCloud } from '../lib/critters.jsx'
import { Rocket, Planet, Specimen } from '../lib/spaceart.jsx'
import { spendStars, grantStars, daySegments, emotionWeights } from '../lib/wellness.js'
import {
  PART_CATS, PARTS, SEARCH_COST, FIND_CHANCE, PLANETS, freshShip, freshSpace,
  equippedPart, equippedParts, isOwned, withEquip, withOwned, shipCompletion,
  planetById, isUnlocked, planetDiscovery, collectionCounts, pickUndiscovered,
  withUnlocked, withCurrent, withDiscovered, allDiscovered,
  CABIN_CATS, CABIN, freshCabin, cabinPart, cabinEquipped, cabinOwns, withCabinEquip, withCabinOwned, cabinCompletion,
} from '../lib/space.js'

function Star({ size = 15 }) {
  return <svg viewBox="0 0 24 24" width={size} height={size} fill="#FBE79E" stroke="#C9A94A" strokeWidth="1.2" aria-hidden="true" style={{ display: 'block' }}>
    <path d="M12 3.2l2.6 5.6 6.1.8-4.5 4.2 1.1 6.1L12 17.1l-5.4 2.8 1.1-6.1L3.3 9.6l6.1-.8Z" />
  </svg>
}
// Lighten a hex toward white — for tinting the room to the current planet.
function mix(hex, t) {
  const n = (hex || '#ffffff').replace('#', '')
  const r = parseInt(n.slice(0, 2), 16), g = parseInt(n.slice(2, 4), 16), b = parseInt(n.slice(4, 6), 16)
  const m = v => Math.round(v + (255 - v) * t).toString(16).padStart(2, '0')
  return `#${m(r)}${m(g)}${m(b)}`
}
// A small bed for the cabin.
function BedArt({ color = '#E9A9C6' }) {
  const INK = '#33313E'
  return (
    <svg viewBox="0 0 120 70" width="140" aria-hidden="true" style={{ display: 'block' }}>
      <rect x="8" y="16" width="12" height="40" rx="4" fill="#B98A6A" stroke={INK} strokeWidth="2.4" />
      <rect x="10" y="50" width="102" height="9" rx="3" fill="#C79A78" stroke={INK} strokeWidth="2.4" />
      <rect x="16" y="58" width="6" height="10" fill="#A9805E" /><rect x="100" y="58" width="6" height="10" fill="#A9805E" />
      <rect x="18" y="36" width="92" height="18" rx="8" fill="#F7F1E8" stroke={INK} strokeWidth="2.4" />
      <path d="M54,36 h56 a8,8 0 0 1 8,8 v6 a4,4 0 0 1-4,4 H54 Z" fill={color} stroke={INK} strokeWidth="2.4" strokeLinejoin="round" />
      <rect x="24" y="32" width="26" height="16" rx="7" fill="#fff" stroke={INK} strokeWidth="2.4" />
    </svg>
  )
}

const VIEWS = [['build', 'Rocket'], ['explore', 'Explore'], ['greenhouse', 'Greenhouse'], ['cabin', 'Cabin']]

export default function Voyage({ game, persistGame, space, persistSpace, checkins = [] }) {
  const sp = space && typeof space === 'object' && space.ship ? space : freshSpace()
  const ship = sp.ship || freshShip()
  const cabin = sp.cabin || freshCabin()
  const stars = Math.max(0, Math.round(game?.stars || 0))
  const equipped = equippedParts(ship)
  const shipDone = shipCompletion(ship)

  const [view, setView] = useState('build')
  const [cat, setCat] = useState('nose')
  const [cabCat, setCabCat] = useState('wall')
  const [launching, setLaunching] = useState(false)
  const [reveal, setReveal] = useState(null)
  const [msg, setMsg] = useState(null)
  const flash = (m) => { setMsg(m); setTimeout(() => setMsg(null), 2600) }

  const currentId = isUnlocked(sp, sp.current) ? sp.current : 'verda'
  const planet = planetById(currentId)
  const disc = planetDiscovery(sp, currentId)
  const counts = collectionCounts(sp)
  const garden = useMemo(() => allDiscovered(sp), [sp])
  const fauna = garden.filter(s => s.kind === 'fauna')

  const daySeg = useMemo(() => daySegments(checkins), [checkins])
  const weights = useMemo(() => emotionWeights(checkins), [checkins])

  // ── Rocket builder ──
  const pick = (part) => {
    if (isOwned(ship, part.id)) { persistSpace(withEquip(sp, cat, part.id)); return }
    const g = spendStars(game, part.cost)
    if (!g) { flash(`${part.cost - stars} more stars for ${part.name}.`); return }
    persistGame(g); persistSpace(withEquip(withOwned(sp, part.id), cat, part.id))
    flash(`${part.name} added to your rocket!`)
  }
  const launch = () => { setLaunching(true); setTimeout(() => setLaunching(false), 1600); if (!isUnlocked(sp, sp.current)) setView('explore') }

  // ── Travel + expedition (chance-based) ──
  const travelTo = (p) => {
    if (isUnlocked(sp, p.id)) { persistSpace(withCurrent(sp, p.id)); return }
    const g = spendStars(game, p.unlock)
    if (!g) { flash(`${p.unlock - stars} more stars to reach ${p.name}.`); return }
    persistGame(g); persistSpace(withCurrent(withUnlocked(sp, p.id), p.id))
    flash(`Course set for ${p.name}!`)
  }
  const search = () => {
    if (disc.remaining === 0) { flash(`You've discovered everything on ${planet.name}.`); return }
    const g = spendStars(game, SEARCH_COST)
    if (!g) { flash(`Need ${SEARCH_COST} stars to launch an expedition.`); return }
    // Not every expedition finds something.
    if (Math.random() < FIND_CHANCE) {
      const found = pickUndiscovered(sp, currentId)
      persistGame(g); persistSpace(withDiscovered(sp, currentId, found.id))
      setReveal(found)
    } else {
      persistGame(grantStars(g, 5))   // small scouting consolation
      flash('The trail went cold — but you scouted good ground. (+5★ back)')
    }
  }

  // ── Cabin ──
  const buyCabin = (part) => {
    if (cabinOwns(cabin, part.id)) { persistSpace(withCabinEquip(sp, cabCat, part.id)); return }
    const g = spendStars(game, part.cost)
    if (!g) { flash(`${part.cost - stars} more stars for ${part.name}.`); return }
    persistGame(g); persistSpace(withCabinEquip(withCabinOwned(sp, part.id), cabCat, part.id))
    flash(`${part.name} added to your cabin!`)
  }
  const setPet = (key) => persistSpace(withCabinEquip(sp, 'pet', key))
  const wall = cabinEquipped(cabin, 'wall'), floor = cabinEquipped(cabin, 'floor')
  const rug = cabinEquipped(cabin, 'rug'), bed = cabinEquipped(cabin, 'bed'), decor = cabinEquipped(cabin, 'decor')
  const petKey = cabin.equipped?.pet
  const pet = petKey ? garden.find(s => `${s.planetId}:${s.id}` === petKey) : null

  return (
    <div className="vy-wrap">
      <div className="vy-seg">
        {VIEWS.map(([id, label]) => <button key={id} className={`vy-seg-btn ${view === id ? 'on' : ''}`} onClick={() => setView(id)}>{label}</button>)}
      </div>

      {/* ══ BUILD ══ */}
      {view === 'build' && <>
        <section className="vy-pad">
          <AlienSky className="vy-pad-bg" />
          <div className="vy-stars-chip"><Star /> {stars}</div>
          <div className="vy-pad-planet"><Planet color={planet.color} ring={planet.ring} id="pad" size={84} /></div>
          <div className={`vy-pad-rocket ${launching ? 'vy-launching' : ''}`}><Rocket equipped={equipped} size={168} /></div>
          <div className="vy-pad-base" aria-hidden="true"><span /><span /><span /></div>
          <button className="vy-launch-btn" onClick={launch}><Glyph id="rocket" size={15} color="#3A2E1A" /> Launch!</button>
        </section>
        <section className="vy-card">
          <div className="vy-card-head"><h3 className="serif">Rocket shop</h3><span className="vy-count">{shipDone.owned}/{shipDone.total} parts</span></div>
          <div className="vy-cats">{PART_CATS.map(c => <button key={c.key} className={`vy-cat ${cat === c.key ? 'on' : ''}`} onClick={() => setCat(c.key)}>{c.name}</button>)}</div>
          <div className="vy-parts">
            {PARTS[cat].map(part => {
              const owned = isOwned(ship, part.id), on = equippedPart(ship, cat).id === part.id
              return (
                <button key={part.id} className={`vy-part ${on ? 'on' : ''} ${(!owned && stars < part.cost) ? 'cant' : ''}`} onClick={() => pick(part)}>
                  <span className="vy-part-preview"><Rocket equipped={{ ...equipped, [cat]: part }} size={72} flame={false} /></span>
                  <span className="vy-part-name">{part.name}</span>
                  {owned ? <span className={`vy-part-tag ${on ? 'worn' : ''}`}>{on ? 'Equipped' : 'Owned'}</span> : <span className="vy-part-tag buy"><Star size={11} /> {part.cost}</span>}
                </button>
              )
            })}
          </div>
        </section>
      </>}

      {/* ══ EXPLORE ══ */}
      {view === 'explore' && <>
        <section className="vy-pad vy-pad-explore">
          <AlienSky className="vy-pad-bg" />
          <div className="vy-stars-chip"><Star /> {stars}</div>
          <div className="vy-explore-planet"><Planet color={planet.color} ring={planet.ring} id={'ex' + planet.id} size={150} /></div>
          <div className="vy-explore-rocket"><Rocket equipped={equipped} size={58} /></div>
          <div className="vy-pad-caption"><div className="serif vy-planet-name">{planet.name}</div><div className="vy-planet-blurb">{planet.blurb}</div></div>
        </section>
        <section className="vy-card">
          <div className="vy-explore-row">
            <div>
              <div className="vy-explore-title serif">Expedition</div>
              <div className="vy-explore-sub">{disc.remaining > 0 ? `${disc.found.length}/${disc.total} discovered · ${disc.remaining} still hidden here` : `Every specimen on ${planet.name} is discovered. 🎉`}</div>
            </div>
            <button className="vy-btn primary" disabled={stars < SEARCH_COST || disc.remaining === 0} onClick={search}>
              <Glyph id="search" size={15} color="#fff" /> Explore · {SEARCH_COST}<Star size={13} />
            </button>
          </div>
          <div className="vy-collection">
            {disc.found.map(s => <figure key={s.id} className="vy-spec got"><Specimen form={s.form} color={s.color} size={58} alive /><figcaption>{s.name}</figcaption></figure>)}
            {Array.from({ length: disc.remaining }).map((_, i) => <figure key={'h' + i} className="vy-spec hidden"><span className="vy-spec-q">?</span><figcaption>undiscovered</figcaption></figure>)}
          </div>
        </section>
        <section className="vy-card">
          <div className="vy-card-head"><h3 className="serif">Star map</h3><span className="vy-count">{counts.collected}/{counts.total} discovered</span></div>
          <div className="vy-planets">
            {PLANETS.map(p => {
              const unlocked = isUnlocked(sp, p.id), d = planetDiscovery(sp, p.id), active = p.id === currentId
              return (
                <button key={p.id} className={`vy-planet-pick ${active ? 'active' : ''} ${unlocked ? '' : 'locked'}`} onClick={() => travelTo(p)}>
                  <span className="vy-pick-disc"><Planet color={p.color} ring={p.ring} id={'pk' + p.id} size={54} /></span>
                  <span className="vy-pick-name">{p.name}</span>
                  {unlocked ? <span className="vy-pick-meta">{d.found.length}/{d.total}</span> : <span className="vy-pick-meta locked"><Glyph id="lock" size={11} /> {p.unlock}<Star size={11} /></span>}
                </button>
              )
            })}
          </div>
          <p className="vy-hint">Spend stars to travel to a planet, then explore — every expedition is a <b>chance</b> to discover a hidden species. You can only find a world's plants and animals once you've landed there.</p>
        </section>
      </>}

      {/* ══ GREENHOUSE ══ */}
      {view === 'greenhouse' && <>
        <section className="gh" style={{ '--gh-wall': mix(planet.color, 0.72), '--gh-wall2': mix(planet.color, 0.58), '--gh-floor': mix(planet.color, 0.34) }}>
          <div className="gh-panes" aria-hidden="true" />
          <div className="gh-vines" aria-hidden="true"><span /><span /><span /></div>
          <div className="gh-window"><AlienSky className="gh-window-sky" /></div>
          <div className="gh-shelf" aria-hidden="true"><span className="gh-trophy" /><span className="gh-shelf-pot" style={{ background: '#C9A27A' }} /></div>
          <div className="gh-telescope" aria-hidden="true"><span className="gh-tele-tube" /><span className="gh-tele-leg" /><span className="gh-tele-leg2" /></div>
          <div className="gh-cloud wl-bob"><DayCloud segments={daySeg.segments} emotions={daySeg.emotions} weights={weights} dominant={daySeg.dominant} faceMood={daySeg.overall} size={92} /></div>
          <div className="gh-floor" aria-hidden="true" />
          <div className="gh-rug" aria-hidden="true" />
          {garden.length === 0
            ? <div className="gh-empty">Your greenhouse is waiting.<br />Discover specimens on your voyages to fill it.</div>
            : <div className="gh-ground">
                {garden.map((s, i) => (
                  <span key={s.planetId + s.id} className={`gh-spec ${s.kind === 'fauna' ? 'hop' : 'sway'}`} style={{ animationDelay: `${(i % 6) * 0.4}s` }} title={`${s.name} · from ${s.planetName}`}>
                    <Specimen form={s.form} color={s.color} size={66} alive />
                  </span>
                ))}
              </div>}
        </section>
        <section className="vy-card">
          <div className="vy-card-head"><h3 className="serif">Greenhouse</h3><span className="vy-count">{counts.collected}/{counts.total} specimens</span></div>
          <p className="vy-hint">A glass wing of your ship, extended onto {planet.name}'s surface — its light tints to the world you're visiting. Your mood cloud drifts overhead while everything you've discovered grows below.</p>
        </section>
      </>}

      {/* ══ CABIN ══ */}
      {view === 'cabin' && <>
        <section className="cab" style={{ '--cab-wall': wall.color, '--cab-floor': floor.color }}>
          {wall.motif === 'stars' && <div className="cab-wall-stars" aria-hidden="true" />}
          <div className={`cab-art ${decor.motif}`} aria-hidden="true">
            {decor.motif === 'window' && <AlienSky className="cab-art-sky" />}
            {decor.motif === 'map' && <span className="cab-art-map">✦ ✧ ✦</span>}
            {decor.motif === 'plant' && <span className="cab-art-plant" />}
          </div>
          <div className="cab-shelf" aria-hidden="true"><span /><span /></div>
          <div className="cab-floorband" aria-hidden="true" />
          {rug.color && <div className="cab-rug" style={{ background: rug.color }}>{rug.motif === 'star' && <span className="cab-rug-motif">★</span>}{rug.motif === 'moon' && <span className="cab-rug-motif">☾</span>}</div>}
          <div className="cab-bed"><BedArt color={bed.color} /></div>
          <div className="cab-pet">
            {pet ? <span className="gh-spec hop"><Specimen form={pet.form} color={pet.color} size={72} alive /></span>
                 : <span className="cab-pet-empty">No pet yet</span>}
          </div>
        </section>

        <section className="vy-card">
          <div className="vy-card-head"><h3 className="serif">Decorate</h3><span className="vy-count">{cabinCompletion(cabin).owned}/{cabinCompletion(cabin).total} items</span></div>
          <div className="vy-cats">
            {CABIN_CATS.map(c => <button key={c.key} className={`vy-cat ${cabCat === c.key ? 'on' : ''}`} onClick={() => setCabCat(c.key)}>{c.name}</button>)}
            <button className={`vy-cat ${cabCat === 'pet' ? 'on' : ''}`} onClick={() => setCabCat('pet')}>Pet</button>
          </div>

          {cabCat !== 'pet' ? (
            <div className="vy-opts">
              {CABIN[cabCat].map(part => {
                const owned = cabinOwns(cabin, part.id), on = cabinEquipped(cabin, cabCat).id === part.id
                return (
                  <button key={part.id} className={`vy-opt ${on ? 'on' : ''} ${(!owned && stars < part.cost) ? 'cant' : ''}`} onClick={() => buyCabin(part)}>
                    <span className="vy-opt-swatch" style={{ background: part.color || 'repeating-linear-gradient(45deg,#Eee,#EEE 5px,#DDD 5px,#DDD 10px)' }}>
                      {part.motif === 'star' && '★'}{part.motif === 'moon' && '☾'}{part.motif === 'map' && '✦'}{part.motif === 'window' && '◍'}{part.motif === 'plant' && '🌿'}
                    </span>
                    <span className="vy-part-name">{part.name}</span>
                    {owned ? <span className={`vy-part-tag ${on ? 'worn' : ''}`}>{on ? 'In use' : 'Owned'}</span> : <span className="vy-part-tag buy"><Star size={11} /> {part.cost}</span>}
                  </button>
                )
              })}
            </div>
          ) : (
            <>
              <p className="vy-hint" style={{ marginTop: 0, marginBottom: 12 }}>Adopt any creature you've discovered as your cabin companion.</p>
              <div className="vy-opts">
                <button className={`vy-opt ${!petKey ? 'on' : ''}`} onClick={() => setPet(null)}>
                  <span className="vy-opt-swatch">–</span><span className="vy-part-name">None</span>
                  <span className={`vy-part-tag ${!petKey ? 'worn' : ''}`}>{!petKey ? 'In use' : ''}</span>
                </button>
                {fauna.map(s => {
                  const key = `${s.planetId}:${s.id}`, on = petKey === key
                  return (
                    <button key={key} className={`vy-opt ${on ? 'on' : ''}`} onClick={() => setPet(key)}>
                      <span className="vy-opt-pet"><Specimen form={s.form} color={s.color} size={48} /></span>
                      <span className="vy-part-name">{s.name}</span>
                      <span className={`vy-part-tag ${on ? 'worn' : ''}`}>{on ? 'Adopted' : 'Adopt'}</span>
                    </button>
                  )
                })}
                {fauna.length === 0 && <p className="vy-hint">Discover a creature on an expedition to adopt it.</p>}
              </div>
            </>
          )}
        </section>
      </>}

      {msg && <div className="wl-reward vy-toast">{msg}</div>}

      {reveal && (
        <div className="wl-modal-scrim" onClick={() => setReveal(null)}>
          <div className="wl-modal vy-reveal" onClick={(e) => e.stopPropagation()}>
            <div className="vy-reveal-burst"><Specimen form={reveal.form} color={reveal.color} size={140} alive /></div>
            <div className="vy-reveal-tag">New {reveal.kind} discovered!</div>
            <div className="serif vy-reveal-name">{reveal.name}</div>
            <div className="vy-reveal-sub">now growing in your greenhouse</div>
            <button className="vy-btn primary block" onClick={() => setReveal(null)}>Wonderful!</button>
          </div>
        </div>
      )}
    </div>
  )
}
