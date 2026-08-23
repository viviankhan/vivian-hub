import { useState, useMemo } from 'react'
import { Glyph } from '../lib/glyphs.jsx'
import { AlienSky, DayCloud } from '../lib/critters.jsx'
import { Rocket, Planet, Specimen } from '../lib/spaceart.jsx'
import { spendStars, daySegments, emotionWeights } from '../lib/wellness.js'
import {
  PART_CATS, PARTS, SEARCH_COST, PLANETS, freshShip, freshSpace,
  equippedPart, equippedParts, isOwned, withEquip, withOwned, shipCompletion,
  planetById, isUnlocked, planetDiscovery, collectionCounts, pickUndiscovered,
  withUnlocked, withCurrent, withDiscovered, allDiscovered,
} from '../lib/space.js'

function Star({ size = 15 }) {
  return <svg viewBox="0 0 24 24" width={size} height={size} fill="#FBE79E" stroke="#C9A94A" strokeWidth="1.2" aria-hidden="true" style={{ display: 'block' }}>
    <path d="M12 3.2l2.6 5.6 6.1.8-4.5 4.2 1.1 6.1L12 17.1l-5.4 2.8 1.1-6.1L3.3 9.6l6.1-.8Z" />
  </svg>
}

const VIEWS = [['build', 'Rocket'], ['explore', 'Explore'], ['greenhouse', 'Greenhouse']]

export default function Voyage({ game, persistGame, space, persistSpace, checkins = [] }) {
  const sp = space && typeof space === 'object' && space.ship ? space : freshSpace()
  const ship = sp.ship || freshShip()
  const stars = Math.max(0, Math.round(game?.stars || 0))
  const equipped = equippedParts(ship)
  const shipDone = shipCompletion(ship)

  const [view, setView] = useState('build')
  const [cat, setCat] = useState('nose')
  const [launching, setLaunching] = useState(false)
  const [reveal, setReveal] = useState(null)
  const [msg, setMsg] = useState(null)
  const flash = (m) => { setMsg(m); setTimeout(() => setMsg(null), 2400) }

  const currentId = isUnlocked(sp, sp.current) ? sp.current : 'verda'
  const planet = planetById(currentId)
  const disc = planetDiscovery(sp, currentId)
  const counts = collectionCounts(sp)
  const garden = useMemo(() => allDiscovered(sp), [sp])

  // Greenhouse mood cloud (today).
  const daySeg = useMemo(() => daySegments(checkins), [checkins])
  const weights = useMemo(() => emotionWeights(checkins), [checkins])

  // ── Rocket builder ──
  const pick = (part) => {
    if (isOwned(ship, part.id)) { persistSpace(withEquip(sp, cat, part.id)); return }
    const g = spendStars(game, part.cost)
    if (!g) { flash(`${part.cost - stars} more stars for ${part.name}.`); return }
    persistGame(g)
    persistSpace(withEquip(withOwned(sp, part.id), cat, part.id))
    flash(`${part.name} added to your rocket!`)
  }
  const launch = () => { setLaunching(true); setTimeout(() => setLaunching(false), 1600); if (!isUnlocked(sp, sp.current)) setView('explore') }

  // ── Travel + search ──
  const travelTo = (p) => {
    if (isUnlocked(sp, p.id)) { persistSpace(withCurrent(sp, p.id)); return }
    const g = spendStars(game, p.unlock)
    if (!g) { flash(`${p.unlock - stars} more stars to reach ${p.name}.`); return }
    persistGame(g)
    persistSpace(withCurrent(withUnlocked(sp, p.id), p.id))
    flash(`Course set for ${p.name}!`)
  }
  const search = () => {
    const found = pickUndiscovered(sp, currentId)
    if (!found) { flash(`You've discovered everything on ${planet.name}.`); return }
    const g = spendStars(game, SEARCH_COST)
    if (!g) { flash(`Need ${SEARCH_COST} stars to search.`); return }
    persistGame(g)
    persistSpace(withDiscovered(sp, currentId, found.id))
    setReveal(found)
  }

  return (
    <div className="vy-wrap">
      <div className="vy-seg">
        {VIEWS.map(([id, label]) => (
          <button key={id} className={`vy-seg-btn ${view === id ? 'on' : ''}`} onClick={() => setView(id)}>{label}</button>
        ))}
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
          <div className="vy-cats">
            {PART_CATS.map(c => <button key={c.key} className={`vy-cat ${cat === c.key ? 'on' : ''}`} onClick={() => setCat(c.key)}>{c.name}</button>)}
          </div>
          <div className="vy-parts">
            {PARTS[cat].map(part => {
              const owned = isOwned(ship, part.id)
              const on = equippedPart(ship, cat).id === part.id
              const preview = { ...equipped, [cat]: part }
              return (
                <button key={part.id} className={`vy-part ${on ? 'on' : ''} ${(!owned && stars < part.cost) ? 'cant' : ''}`} onClick={() => pick(part)}>
                  <span className="vy-part-preview"><Rocket equipped={preview} size={72} flame={false} /></span>
                  <span className="vy-part-name">{part.name}</span>
                  {owned ? <span className={`vy-part-tag ${on ? 'worn' : ''}`}>{on ? 'Equipped' : 'Owned'}</span>
                         : <span className="vy-part-tag buy"><Star size={11} /> {part.cost}</span>}
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
          <div className="vy-pad-caption">
            <div className="serif vy-planet-name">{planet.name}</div>
            <div className="vy-planet-blurb">{planet.blurb}</div>
          </div>
        </section>

        <section className="vy-card">
          <div className="vy-explore-row">
            <div>
              <div className="vy-explore-title serif">Search {planet.name}</div>
              <div className="vy-explore-sub">
                {disc.remaining > 0
                  ? `${disc.found.length}/${disc.total} discovered · ${disc.remaining} still hidden here`
                  : `Every specimen on ${planet.name} is discovered. 🎉`}
              </div>
            </div>
            <button className="vy-btn primary" disabled={stars < SEARCH_COST || disc.remaining === 0} onClick={search}>
              <Glyph id="search" size={15} color="#fff" /> Search · {SEARCH_COST}<Star size={13} />
            </button>
          </div>
          {/* Discovered specimens + hidden slots (you can't see them until found) */}
          <div className="vy-collection">
            {disc.found.map(s => (
              <figure key={s.id} className="vy-spec got">
                <Specimen form={s.form} color={s.color} size={58} />
                <figcaption>{s.name}</figcaption>
              </figure>
            ))}
            {Array.from({ length: disc.remaining }).map((_, i) => (
              <figure key={'h' + i} className="vy-spec hidden">
                <span className="vy-spec-q">?</span>
                <figcaption>undiscovered</figcaption>
              </figure>
            ))}
          </div>
        </section>

        <section className="vy-card">
          <div className="vy-card-head"><h3 className="serif">Star map</h3><span className="vy-count">{counts.collected}/{counts.total} discovered</span></div>
          <div className="vy-planets">
            {PLANETS.map(p => {
              const unlocked = isUnlocked(sp, p.id)
              const d = planetDiscovery(sp, p.id)
              const active = p.id === currentId
              return (
                <button key={p.id} className={`vy-planet-pick ${active ? 'active' : ''} ${unlocked ? '' : 'locked'}`} onClick={() => travelTo(p)}>
                  <span className="vy-pick-disc"><Planet color={p.color} ring={p.ring} id={'pk' + p.id} size={54} /></span>
                  <span className="vy-pick-name">{p.name}</span>
                  {unlocked ? <span className="vy-pick-meta">{d.found.length}/{d.total}</span>
                            : <span className="vy-pick-meta locked"><Glyph id="lock" size={11} /> {p.unlock}<Star size={11} /></span>}
                </button>
              )
            })}
          </div>
          <p className="vy-hint">Spend stars to travel to a planet — you can only discover a world's plants and animals once you've landed there.</p>
        </section>
      </>}

      {/* ══ GREENHOUSE ══ */}
      {view === 'greenhouse' && <>
        <section className="gh">
          <div className="gh-roof" aria-hidden="true" />
          <div className="gh-panes" aria-hidden="true" />
          <div className="gh-cloud wl-bob"><DayCloud segments={daySeg.segments} emotions={daySeg.emotions} weights={weights} dominant={daySeg.dominant} faceMood={daySeg.overall} size={96} /></div>
          {garden.length === 0
            ? <div className="gh-empty">Your greenhouse is waiting.<br />Discover specimens on your voyages to fill it.</div>
            : <div className="gh-ground">
                {garden.map((s, i) => (
                  <span key={s.planetId + s.id} className="gh-spec" style={{ animationDelay: `${(i % 6) * 0.4}s` }} title={`${s.name} · from ${s.planetName}`}>
                    <Specimen form={s.form} color={s.color} size={62} />
                  </span>
                ))}
              </div>}
        </section>
        <section className="vy-card">
          <div className="vy-card-head"><h3 className="serif">Greenhouse</h3><span className="vy-count">{counts.collected}/{counts.total} specimens</span></div>
          <p className="vy-hint">Your mood cloud drifts overhead while everything you've discovered grows below. Keep checking in — your stars fund the next expedition.</p>
        </section>
      </>}

      {msg && <div className="wl-reward vy-toast">{msg}</div>}

      {reveal && (
        <div className="wl-modal-scrim" onClick={() => setReveal(null)}>
          <div className="wl-modal vy-reveal" onClick={(e) => e.stopPropagation()}>
            <div className="vy-reveal-burst"><Specimen form={reveal.form} color={reveal.color} size={140} /></div>
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
