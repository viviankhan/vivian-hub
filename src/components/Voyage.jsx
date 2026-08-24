import { useState, useMemo } from 'react'
import { Glyph } from '../lib/glyphs.jsx'
import { AlienSky, DayCloud } from '../lib/critters.jsx'
import { Rocket, Planet, Specimen, FurnArt } from '../lib/spaceart.jsx'
import { spendStars, grantStars, daySegments, emotionWeights } from '../lib/wellness.js'
import {
  PART_CATS, PARTS, SEARCH_COST, FIND_CHANCE, PLANETS, freshShip, freshSpace,
  equippedPart, equippedParts, isOwned, withEquip, withOwned, shipCompletion,
  planetById, isUnlocked, planetDiscovery, collectionCounts, pickUndiscovered,
  withUnlocked, withCurrent, withDiscovered, allDiscovered,
  CABIN_COLORS, FURNITURE, FURN_GROUPS, furnitureById, freshCabin, cabinColor,
  cabOwns, cabPlaced, placedFurniture, withCabColor, withCabPlace, withCabRemove, withCabPet, cabinCompletion,
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
const VIEWS = [['build', 'Rocket'], ['explore', 'Explore'], ['greenhouse', 'Greenhouse'], ['cabin', 'Cabin']]
// Per-art render sizes in the room vs. the shop tile.
const ROOM_SIZES = { bed: 150, rug: 172, window: 96, door: 80, hanglamp: 52, sidelamp: 74, nightstand: 98, vase: 66, fan: 66, clock: 58, art: 60 }
const TILE_SIZES = { bed: 66, rug: 62, window: 46, door: 40, hanglamp: 34, sidelamp: 46, nightstand: 62, vase: 42, fan: 46, clock: 42, art: 42 }

export default function Voyage({ game, persistGame, space, persistSpace, checkins = [] }) {
  const sp = space && typeof space === 'object' && space.ship ? space : freshSpace()
  const ship = sp.ship || freshShip()
  const cabin = sp.cabin || freshCabin()
  const stars = Math.max(0, Math.round(game?.stars || 0))
  const equipped = equippedParts(ship)
  const shipDone = shipCompletion(ship)

  const [view, setView] = useState('build')
  const [cat, setCat] = useState('nose')
  const [cabTab, setCabTab] = useState('furniture')
  const [furnGroup, setFurnGroup] = useState('All')
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

  // ── Cabin ── buy (if needed) then toggle a piece in/out of the room
  const clickFurn = (item) => {
    if (cabPlaced(cabin, item.id)) { persistSpace(withCabRemove(sp, item.id)); return }
    if (cabOwns(cabin, item.id)) { persistSpace(withCabPlace(sp, item)); return }
    const g = spendStars(game, item.cost)
    if (!g) { flash(`${item.cost - stars} more stars for ${item.name}.`); return }
    persistGame(g); persistSpace(withCabPlace(sp, item)); flash(`${item.name} added to your cabin!`)
  }
  const clickColor = (kind, c) => {
    if (cabOwns(cabin, c.id)) { persistSpace(withCabColor(sp, kind, c.id)); return }
    const g = spendStars(game, c.cost)
    if (!g) { flash(`${c.cost - stars} more stars for ${c.name}.`); return }
    persistGame(g); persistSpace(withCabColor(sp, kind, c.id))
  }
  const setPet = (key) => persistSpace(withCabPet(sp, key))
  const wallColor = cabinColor('wall', cabin.colors?.wall).color
  const floorColor = cabinColor('floor', cabin.colors?.floor).color
  const petKey = cabin.pet
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
            {disc.found.map(s => <figure key={s.id} className="vy-spec got"><Specimen form={s.form} color={s.color} size={58} alive assetId={`creature:${s.id}`} /><figcaption>{s.name}</figcaption></figure>)}
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
        <section className="gh" style={{ '--gh-tint': planet.color, '--gh-soil': mix(planet.color, 0.2) }}>
          {/* the planet's own environment, seen through the glass walls */}
          <div className="gh-env" aria-hidden="true"><AlienSky className="gh-env-sky" tint={planet.color} /></div>
          {/* translucent glazing over the environment (peaked glass-house shape) */}
          <div className="gh-glass" aria-hidden="true" />
          {/* mood cloud drifting up under the glass ceiling */}
          <div className="gh-cloud wl-bob"><DayCloud segments={daySeg.segments} emotions={daySeg.emotions} weights={weights} dominant={daySeg.dominant} faceMood={daySeg.overall} size={80} /></div>
          {/* vines trailing from the eaves */}
          <div className="gh-vines" aria-hidden="true"><span /><span /><span /></div>
          {/* painted greenhouse frame — gable roof, glazing bars, sill */}
          <svg className="gh-frame" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
            <path className="gh-bar" d="M27,28 L50,3 M50,28 L50,3 M73,28 L50,3 M6,28 L94,28 M6,57 L94,57 M27,28 L27,86 M50,28 L50,86 M73,28 L73,86" vectorEffect="non-scaling-stroke" />
            <path className="gh-edge" d="M6,86 L6,28 L50,3 L94,28 L94,86" vectorEffect="non-scaling-stroke" />
            <path className="gh-sill" d="M3,86 L97,86" vectorEffect="non-scaling-stroke" />
          </svg>
          {/* soil bed the specimens are planted in */}
          <div className="gh-bench" aria-hidden="true" />
          {/* planting beds — each discovered specimen gets its own microenvironment */}
          {garden.length === 0
            ? <div className="gh-empty">Your greenhouse is waiting.<br />Discover specimens on your voyages, and each one brings a patch of its home world here.</div>
            : <div className="gh-bed">
                {garden.map((s, i) => (
                  <div key={s.planetId + s.id} className={`gh-micro ${s.kind}`}
                    style={{ '--mc': s.color, '--mc2': mix(s.color, 0.45) }}
                    title={`${s.name} · a microhabitat from ${s.planetName}`}>
                    <span className={`gh-spec ${s.kind === 'fauna' ? 'hop' : 'sway'}`} style={{ animationDelay: `${(i % 6) * 0.4}s` }}>
                      <Specimen form={s.form} color={s.color} size={58} alive assetId={`creature:${s.id}`} />
                    </span>
                    <span className="gh-micro-ground" aria-hidden="true" />
                  </div>
                ))}
              </div>}
        </section>
        <section className="vy-card">
          <div className="vy-card-head"><h3 className="serif">Greenhouse</h3><span className="vy-count">{counts.collected}/{counts.total} specimens</span></div>
          <p className="vy-hint">A glass wing of your ship, planted on {planet.name}'s surface — the world glows through its walls and your mood cloud drifts under the roof. Every species you discover brings a patch of its own habitat to grow here.</p>
        </section>
      </>}

      {/* ══ CABIN ══ */}
      {view === 'cabin' && <>
        <section className="cab" style={{ '--cab-wall': wallColor, '--cab-floor': floorColor }}>
          <div className="cab-floorband" aria-hidden="true" />
          {placedFurniture(cabin).map(it => (
            <div key={it.id} className="cab-item" style={{ left: it.style.left, bottom: it.style.bottom, top: it.style.top, zIndex: it.style.z }}>
              <FurnArt item={it} size={ROOM_SIZES[it.art] || 90} assetId={`furniture:${it.id}`} />
            </div>
          ))}
          {pet && <div className="cab-pet"><span className="gh-spec hop"><Specimen form={pet.form} color={pet.color} size={70} alive assetId={`creature:${pet.id}`} /></span></div>}
        </section>

        <section className="vy-card">
          <div className="vy-card-head"><h3 className="serif">Explorer's cabin</h3><span className="vy-count">{cabinCompletion(cabin).owned}/{cabinCompletion(cabin).total} unlocked</span></div>
          <div className="vy-seg vy-seg-sub">
            {[['furniture', 'Furniture'], ['colors', 'Colors'], ['pet', 'Pet']].map(([id, l]) => (
              <button key={id} className={`vy-seg-btn ${cabTab === id ? 'on' : ''}`} onClick={() => setCabTab(id)}>{l}</button>
            ))}
          </div>

          {cabTab === 'furniture' && <>
            <div className="vy-cats">
              {FURN_GROUPS.map(g => <button key={g} className={`vy-cat ${furnGroup === g ? 'on' : ''}`} onClick={() => setFurnGroup(g)}>{g}</button>)}
            </div>
            <div className="vy-grid">
              {FURNITURE.filter(f => furnGroup === 'All' || f.group === furnGroup).map(item => {
                const placed = cabPlaced(cabin, item.id), owned = cabOwns(cabin, item.id)
                return (
                  <button key={item.id} className={`vy-tile ${placed ? 'placed' : ''} ${(!owned && stars < item.cost) ? 'cant' : ''}`} onClick={() => clickFurn(item)}>
                    {placed && <span className="vy-check">✓</span>}
                    <span className="vy-tile-art"><FurnArt item={item} size={TILE_SIZES[item.art] || 54} assetId={`furniture:${item.id}`} /></span>
                    <span className="vy-tile-name">{item.name}</span>
                    {owned ? <span className="vy-tile-tag">{placed ? 'Placed' : 'Place'}</span> : <span className="vy-tile-tag buy"><Star size={11} /> {item.cost}</span>}
                  </button>
                )
              })}
            </div>
            <p className="vy-hint">Tap to buy & place a piece; tap a placed piece to tuck it away. Beds, rugs, windows and doors swap one-for-one.</p>
          </>}

          {cabTab === 'colors' && ['wall', 'floor'].map(kind => (
            <div key={kind} className="vy-color-block">
              <div className="vy-color-label">{kind === 'wall' ? 'Walls' : 'Floor'}</div>
              <div className="vy-colors">
                {CABIN_COLORS[kind].map(c => {
                  const on = cabin.colors?.[kind] === c.id, owned = cabOwns(cabin, c.id)
                  return (
                    <button key={c.id} className={`vy-color ${on ? 'on' : ''}`} onClick={() => clickColor(kind, c)} title={c.name}>
                      <span className="vy-color-dot" style={{ background: c.color }}>{on && <span className="vy-color-check">✓</span>}</span>
                      {!owned && <span className="vy-color-cost"><Star size={10} /> {c.cost}</span>}
                    </button>
                  )
                })}
              </div>
            </div>
          ))}

          {cabTab === 'pet' && <>
            <p className="vy-hint" style={{ marginTop: 0, marginBottom: 12 }}>Adopt any creature you've discovered as your cabin companion.</p>
            <div className="vy-grid">
              <button className={`vy-tile ${!petKey ? 'placed' : ''}`} onClick={() => setPet(null)}>
                {!petKey && <span className="vy-check">✓</span>}
                <span className="vy-tile-art" style={{ color: 'var(--muted)', fontSize: 24 }}>–</span>
                <span className="vy-tile-name">None</span>
              </button>
              {fauna.map(s => {
                const key = `${s.planetId}:${s.id}`, on = petKey === key
                return (
                  <button key={key} className={`vy-tile ${on ? 'placed' : ''}`} onClick={() => setPet(key)}>
                    {on && <span className="vy-check">✓</span>}
                    <span className="vy-tile-art"><Specimen form={s.form} color={s.color} size={50} assetId={`creature:${s.id}`} /></span>
                    <span className="vy-tile-name">{s.name}</span>
                  </button>
                )
              })}
            </div>
            {fauna.length === 0 && <p className="vy-hint">Discover a creature on an expedition to adopt it.</p>}
          </>}
        </section>
      </>}

      {msg && <div className="wl-reward vy-toast">{msg}</div>}

      {reveal && (
        <div className="wl-modal-scrim" onClick={() => setReveal(null)}>
          <div className="wl-modal vy-reveal" onClick={(e) => e.stopPropagation()}>
            <div className="vy-reveal-burst"><Specimen form={reveal.form} color={reveal.color} size={140} alive assetId={`creature:${reveal.id}`} /></div>
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
