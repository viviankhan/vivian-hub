import { useState } from 'react'
import { STUDY_SETS } from '../data/flashcards.js'

function groupBy(arr, key) {
  const map = {}
  arr.forEach(item => { const k = item[key] || 'General'; if (!map[k]) map[k] = []; map[k].push(item) })
  return Object.entries(map)
}

function FcModal({ cards, setKey, weekLabel, fcProgress, updateFcProgress, fcStudied, updateFcStudied, onClose }) {
  const [tab, setTab]       = useState('all')
  const [idx, setIdx]       = useState(0)
  const [flipped, setFlipped] = useState(false)

  const learned = fcProgress[setKey] || {}

  const deck = tab === 'learned'   ? cards.filter(c => learned[c.id])
             : tab === 'unlearned' ? cards.filter(c => !learned[c.id])
             : cards

  const card = deck[idx] || null
  const learnedCount = cards.filter(c => learned[c.id]).length
  const pct = cards.length ? (learnedCount / cards.length * 100) : 0

  const next = () => { setIdx(i => (i+1) % Math.max(deck.length,1)); setFlipped(false) }
  const prev = () => { setIdx(i => (i-1+Math.max(deck.length,1)) % Math.max(deck.length,1)); setFlipped(false) }
  const shuffle = () => { setIdx(Math.floor(Math.random() * Math.max(deck.length,1))); setFlipped(false) }

  const mark = async (isLearned) => {
    if (!card) return
    const next = { ...fcProgress, [setKey]: { ...learned, [card.id]: isLearned } }
    await updateFcProgress(next)
    // Record studied time
    const s = { ...fcStudied, [setKey]: new Date().toISOString() }
    await updateFcStudied(s)
    setIdx(i => (i+1) % Math.max(deck.length,1))
    setFlipped(false)
  }

  const TabBtn = ({ id, label }) => (
    <button
      className={`fc-tab-btn ${tab === id ? 'active' : ''}`}
      onClick={() => { setTab(id); setIdx(0); setFlipped(false) }}
    >
      {label}
    </button>
  )

  return (
    <div className="fc-overlay">
      <div className="fc-inner">
        {/* Header */}
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:18 }}>
          <div>
            <div className="serif" style={{ fontSize:22, color:'var(--sand)', fontWeight:600 }}>{weekLabel}</div>
            <div style={{ fontSize:11, color:'#8FA882', marginTop:2, letterSpacing:.5 }}>{cards.length} cards · {learnedCount} learned</div>
          </div>
          <button className="btn-ghost" onClick={onClose} style={{ color:'#8FA882', borderColor:'rgba(255,255,255,.15)' }}>✕ Close</button>
        </div>

        {/* Tabs */}
        <div style={{ display:'flex', gap:8, marginBottom:14 }}>
          <TabBtn id="all"       label="All" />
          <TabBtn id="unlearned" label={`Unlearned (${cards.filter(c=>!learned[c.id]).length})`} />
          <TabBtn id="learned"   label={`Learned (${learnedCount})`} />
        </div>

        {/* Progress */}
        <div className="progress-track" style={{ marginBottom:6 }}>
          <div className="progress-fill" style={{ width: pct+'%' }} />
        </div>
        <div style={{ fontSize:11, color:'#8FA882', textAlign:'center', marginBottom:16 }}>{learnedCount} / {cards.length} learned</div>

        {/* Card */}
        {!card ? (
          <div style={{ background:'#0D1F3C', borderRadius:18, minHeight:200, display:'flex', alignItems:'center', justifyContent:'center', color:'#4A6B8A', fontSize:13 }}>
            No cards in this view
          </div>
        ) : (
          <div className="fc-card-wrap">
            <div className={`fc-card ${flipped ? 'flipped' : ''}`} style={{ background:'#0D1F3C', border:'1px solid rgba(14,158,142,.3)' }} onClick={() => setFlipped(f=>!f)}>
              {/* Front */}
              <div className="fc-face">
                <div style={{ fontSize:10, letterSpacing:2, textTransform:'uppercase', color:'#0E9E8E', marginBottom:10 }}>{card.topic}</div>
                <div style={{ fontSize:11, color:'#4A6B8A', marginBottom:8 }}>#{idx+1} of {deck.length}</div>
                {card.imgSrc && <img src={card.imgSrc} alt={card.term} style={{ width:'100%', maxHeight:160, objectFit:'cover', borderRadius:10, marginBottom:12 }} />}
                <div className="fc-term">{card.term}</div>
                <div style={{ fontSize:11, color:'rgba(255,255,255,.3)', letterSpacing:1.5, textTransform:'uppercase', marginTop:16 }}>Tap to flip →</div>
              </div>
              {/* Back */}
              <div className="fc-back">
                <div style={{ fontSize:10, letterSpacing:2, textTransform:'uppercase', color:'#0E9E8E', marginBottom:8 }}>{card.topic}</div>
                <div className="serif" style={{ fontSize:16, color:'#C9E4B8', marginBottom:10, fontWeight:600 }}>{card.term}</div>
                <div className="fc-def">{card.def}</div>
              </div>
            </div>
          </div>
        )}

        {/* Controls */}
        <div style={{ display:'flex', gap:8, justifyContent:'center', marginBottom:12, flexWrap:'wrap' }}>
          <button className="fc-ctrl-btn btn-ghost" style={{ color:'#8FA882', border:'1px solid rgba(255,255,255,.15)' }} onClick={prev}>← Prev</button>
          <button className="fc-ctrl-btn btn-ghost" style={{ color:'#8FA882', border:'1px solid rgba(255,255,255,.15)' }} onClick={shuffle}>⇌ Shuffle</button>
          <button className="fc-ctrl-btn" style={{ background:'#0E9E8E', color:'#0A1628', border:'none', fontFamily:'DM Sans', fontSize:11, letterSpacing:1, textTransform:'uppercase', borderRadius:24, cursor:'pointer', fontWeight:700 }} onClick={next}>Next →</button>
        </div>
        <div style={{ display:'flex', gap:8, justifyContent:'center', flexWrap:'wrap' }}>
          <button className="fc-ctrl-btn" style={{ background:'rgba(232,93,58,.1)', border:'1px solid rgba(232,93,58,.4)', color:'#E85D3A', fontFamily:'DM Sans', fontSize:11, letterSpacing:1, textTransform:'uppercase', borderRadius:24, cursor:'pointer' }} onClick={() => mark(false)}>✗ Still learning</button>
          <button className="fc-ctrl-btn" style={{ background:'rgba(14,158,142,.1)', border:'1px solid rgba(14,158,142,.4)', color:'#0E9E8E', fontFamily:'DM Sans', fontSize:11, letterSpacing:1, textTransform:'uppercase', borderRadius:24, cursor:'pointer' }} onClick={() => mark(true)}>✓ Got it</button>
        </div>
      </div>
    </div>
  )
}

export default function Study({ fcProgress, updateFcProgress, fcStudied, updateFcStudied }) {
  const [openClasses, setOpenClasses] = useState({})
  const [openWeeks,   setOpenWeeks]   = useState({})
  const [modal, setModal] = useState(null) // { cards, setKey, weekLabel }

  const toggleClass = (id) => setOpenClasses(s => ({ ...s, [id]: !s[id] }))
  const toggleWeek  = (id) => setOpenWeeks(s =>   ({ ...s, [id]: !s[id]  }))

  return (
    <div>
      <div className="page-title">Study Materials</div>
      <div className="page-sub">Flashcard sets by class and week</div>

      {modal && (
        <FcModal
          {...modal}
          fcProgress={fcProgress}
          updateFcProgress={updateFcProgress}
          fcStudied={fcStudied}
          updateFcStudied={updateFcStudied}
          onClose={() => setModal(null)}
        />
      )}

      {STUDY_SETS.map(cls => {
        const clsOpen = openClasses[cls.classId]
        return (
          <div key={cls.classId} style={{ marginBottom:14 }}>
            <div className="study-class-header" onClick={() => toggleClass(cls.classId)}>
              <span className="serif" style={{ fontSize:18, color:'var(--sand)', fontWeight:600 }}>{cls.className}</span>
              <span style={{ color:'var(--green-light)', fontSize:13, transition:'transform .2s', transform: clsOpen ? 'rotate(180deg)' : '' }}>▾</span>
            </div>

            {clsOpen && (
              <div style={{ border:'1px solid var(--border)', borderTop:'none', borderRadius:'0 0 12px 12px', overflow:'hidden' }}>
                {cls.weeks.map(wk => {
                  const wkKey = cls.classId + '-' + wk.weekId
                  const wkOpen = openWeeks[wkKey]
                  const learned = fcProgress[wkKey] || {}
                  const learnedCount = wk.cards.filter(c => learned[c.id]).length
                  const lastStudied = fcStudied[wkKey]
                  const lastStr = lastStudied
                    ? new Date(lastStudied).toLocaleDateString('en-US',{month:'short',day:'numeric'})
                    : 'Never'

                  return (
                    <div key={wk.weekId} style={{ borderBottom:'1px solid var(--border)' }}>
                      <div className="study-week-row">
                        <div style={{ flex:1, cursor:'pointer' }} onClick={() => toggleWeek(wkKey)}>
                          <div style={{ fontSize:12, fontWeight:600, color:'var(--text)' }}>{wk.weekLabel}</div>
                          <div style={{ fontSize:10, color:'var(--muted)', marginTop:2 }}>
                            {wk.cards.length} cards · {learnedCount}/{wk.cards.length} learned · last studied {lastStr}
                          </div>
                        </div>
                        <div style={{ display:'flex', gap:8, alignItems:'center' }}>
                          {wk.cards.length > 0 && (
                            <button className="study-btn" onClick={() => setModal({ cards: wk.cards, setKey: wkKey, weekLabel: wk.weekLabel })}>
                              Study ▶
                            </button>
                          )}
                          <span style={{ color:'var(--muted)', fontSize:11, cursor:'pointer' }} onClick={() => toggleWeek(wkKey)}>▾</span>
                        </div>
                      </div>

                      {wkOpen && (
                        <div style={{ padding:'12px 16px', background:'white' }}>
                          {/* Files */}
                          {wk.files.length > 0 && (
                            <div style={{ marginBottom:12 }}>
                              <div className="section-label" style={{ marginBottom:6 }}>Files</div>
                              {wk.files.map((f, fi) => (
                                <div key={fi} className="file-row">
                                  <span>📄</span>
                                  <span style={{ flex:1 }}>{f.name}</span>
                                  <span style={{ color:'var(--muted)', fontSize:11 }}>{f.addedDate}</span>
                                </div>
                              ))}
                            </div>
                          )}

                          {/* Cards list */}
                          {wk.cards.length > 0 ? (
                            <div>
                              <div className="section-label" style={{ marginBottom:8 }}>Cards by topic</div>
                              {groupBy(wk.cards, 'topic').map(([topic, cards]) => (
                                <div key={topic} style={{ marginBottom:10 }}>
                                  <div style={{ fontSize:11, color:'#6B8060', fontWeight:600, marginBottom:4 }}>{topic}</div>
                                  {cards.map(c => {
                                    const isLearned = !!(fcProgress[wkKey]?.[c.id])
                                    return (
                                      <div key={c.id} style={{ display:'flex', gap:8, alignItems:'center', padding:'4px 0', borderBottom:'1px solid #F5F3EF' }}>
                                        <span style={{ fontSize:11, color: isLearned ? '#52B788' : '#D1D5DB' }}>{isLearned ? '✓' : '○'}</span>
                                        <span style={{ fontSize:12, color: isLearned ? 'var(--muted)' : 'var(--text)', textDecoration: isLearned ? 'line-through' : 'none', flex:1 }}>{c.term}</span>
                                        <span style={{ fontSize:9, color:'#B0A898' }}>{c.dateAdded}</span>
                                      </div>
                                    )
                                  })}
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div style={{ fontSize:12, color:'var(--muted)', fontStyle:'italic' }}>
                              No flashcards yet — upload a file and send to Claude to generate them.
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
