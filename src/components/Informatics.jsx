// src/components/Informatics.jsx
// The "Informatics" page — ask "how many hours did I spend on X?" and see where
// your time actually went. It reads your finished, timed work (see
// src/lib/insights.js), matches a free-typed question against your categories
// and task names, and shows the total plus a breakdown. Below the question box
// is an always-on overview of time by category and by task, which doubles as a
// menu of things you can ask about.
import { useMemo, useState } from 'react'
import { Icon } from './IconPicker.jsx'
import { computeEntries, filterByRange, aggregate, answerQuestion, fmtHours, decimalHours } from '../lib/insights.js'
import { computeSkills } from '../lib/skills.js'
import WellnessInsights from './WellnessInsights.jsx'

const RANGES = [['week', 'Past week'], ['month', 'Past month'], ['all', 'All time']]
const sessions = (n) => `${n} time${n === 1 ? '' : 's'}`

function Bar({ frac, color }) {
  return (
    <div style={{ height:8, borderRadius:6, background:'#EEECF0', overflow:'hidden', marginTop:6 }}>
      <div style={{ width:`${Math.max(2, frac * 100)}%`, height:'100%', background:color, borderRadius:6, transition:'width .4s ease' }} />
    </div>
  )
}

function todayStr() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}
const DUR_CHIPS = [15, 30, 45, 60, 90, 120]

export default function Informatics({ commitments = [], recurringTasks = [], completions = {}, log = [], categories = [], timeLogs = [], addTimeLog, deleteTimeLog, wlCheckins = [], wlEffects, wlEpisodes = [] }) {
  const [range, setRange] = useState('all')
  const [query, setQuery] = useState('')
  const [asked, setAsked] = useState('')   // the submitted question

  // "Log time" form — record hours for something that had no timed task.
  const [logOpen, setLogOpen] = useState(false)
  const [lTitle, setLTitle] = useState('')
  const [lCat, setLCat] = useState('')
  const [lMins, setLMins] = useState(0)
  const [lDate, setLDate] = useState(todayStr())

  const allEntries = useMemo(
    () => computeEntries({ log, commitments, recurringTasks, completions, timeLogs }),
    [log, commitments, recurringTasks, completions, timeLogs],
  )
  const entries = useMemo(() => filterByRange(allEntries, range), [allEntries, range])
  const agg = useMemo(() => aggregate(entries, categories), [entries, categories])
  const skills = useMemo(() => computeSkills(entries, categories), [entries, categories])
  const answer = useMemo(() => asked ? answerQuestion(entries, asked, categories) : null, [asked, entries, categories])
  const [openSkill, setOpenSkill] = useState(null)   // expanded skill row (shows its tasks)

  const hasHours = agg.totalMins > 0
  const totalSessions = entries.length
  const maxCatMins = agg.byCategory[0]?.mins || 1
  const maxCatCount = Math.max(1, ...agg.byCategory.map(c => c.count))
  const maxSkillMins = skills[0]?.mins || 1
  const maxSkillCount = Math.max(1, ...skills.map(s => s.count))

  // Suggestions of what to ask: a couple of self-questions, then the top skills,
  // categories, and a few frequent task names — the things there's data for.
  const suggestions = [
    ...(skills.length ? ['What skills am I using?'] : []),
    ...(totalSessions ? ['Where does my time go?'] : []),
    ...skills.slice(0, 3).map(s => s.label),
    ...agg.byCategory.slice(0, 3).map(c => c.label),
    ...agg.byTask.slice(0, 3).map(t => t.title),
  ].filter((v, i, a) => v && a.indexOf(v) === i).slice(0, 8)

  const ask = (text) => { const v = (text ?? query).trim(); setAsked(v); setQuery(v) }

  const saveLog = () => {
    if (!(lMins > 0) || !addTimeLog) return
    const title = lTitle.trim() || (categories.find(c => c.id === lCat)?.label || 'Logged time')
    addTimeLog({ date: lDate || todayStr(), mins: lMins, cat: lCat, title })
    setLTitle(''); setLCat(''); setLMins(0); setLDate(todayStr()); setLogOpen(false)
  }

  // Manual logs within the current range, most recent first (for the list + delete).
  const rangeLogs = filterByRange((timeLogs || []).map(t => ({ ...t })), range)
    .slice().sort((a, b) => (b.date || '').localeCompare(a.date || ''))

  const rangeLabel = RANGES.find(r => r[0] === range)?.[1].toLowerCase()

  return (
    <div>
      <div className="page-title">Informatics</div>
      <div className="page-sub">Ask about yourself — “how many hours on MCAT studying?”, “what skills am I using?”, “where does my time go?” It reads the titles, descriptions and subtasks of everything you finished, infers the skills behind them, and breaks your time down by area, task and skill. Hours show wherever a task had a duration; everything you checked off still counts as a session.</div>

      {/* Mind & body — mood trend, time carried by each condition, correlations */}
      <WellnessInsights checkins={wlCheckins} effects={wlEffects} episodes={wlEpisodes} log={log} />

      {/* Range + log-time */}
      <div style={{ display:'flex', gap:6, margin:'4px 0 14px', flexWrap:'wrap', alignItems:'center' }}>
        {RANGES.map(([id, label]) => (
          <button key={id} onClick={() => setRange(id)}
            style={{ fontSize:11.5, padding:'6px 13px', borderRadius:20, cursor:'pointer', fontFamily:'DM Sans,sans-serif', fontWeight:600,
              border:`1px solid ${range===id ? 'var(--teal)' : 'var(--border)'}`, background: range===id ? '#F0FDFB' : 'white', color: range===id ? 'var(--teal)' : 'var(--muted)' }}>
            {label}
          </button>
        ))}
        <button onClick={() => setLogOpen(o => !o)}
          style={{ marginLeft:'auto', fontSize:11.5, padding:'6px 13px', borderRadius:20, cursor:'pointer', fontFamily:'DM Sans,sans-serif', fontWeight:700,
            border:'none', background: logOpen ? 'var(--forest)' : 'var(--forest)', color:'var(--green-light)' }}>
          {logOpen ? 'Close' : '+ Log time'}
        </button>
      </div>

      {/* Log time — record hours for something that wasn't a timed task. */}
      {logOpen && (
        <div style={{ background:'white', border:'1px solid var(--border)', borderRadius:14, padding:'14px 16px', marginBottom:14 }}>
          <div style={{ fontSize:12.5, color:'var(--text)', fontWeight:700, marginBottom:8 }}>Log time on something</div>
          <input value={lTitle} onChange={e => setLTitle(e.target.value)} placeholder="What did you work on? (e.g. MCAT biochem)"
            style={{ width:'100%', fontSize:13, padding:'9px 11px', borderRadius:10, border:'1px solid var(--border)', background:'var(--cream)', fontFamily:'DM Sans,sans-serif', color:'var(--text)', boxSizing:'border-box', marginBottom:10 }} />
          {categories.length > 0 && (
            <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginBottom:10 }}>
              <button onClick={() => setLCat('')} style={{ fontSize:11, padding:'4px 10px', borderRadius:16, cursor:'pointer', fontFamily:'DM Sans,sans-serif', fontWeight:600, border:`1px solid ${lCat==='' ? 'var(--teal)' : 'var(--border)'}`, background: lCat==='' ? '#F0FDFB' : 'white', color: lCat==='' ? 'var(--teal)' : 'var(--muted)' }}>No category</button>
              {categories.map(c => (
                <button key={c.id} onClick={() => setLCat(c.id)}
                  style={{ display:'inline-flex', alignItems:'center', gap:5, fontSize:11, padding:'4px 10px', borderRadius:16, cursor:'pointer', fontFamily:'DM Sans,sans-serif', fontWeight:600,
                    border:`1px solid ${lCat===c.id ? c.color : 'var(--border)'}`, background: lCat===c.id ? `${c.color}18` : 'white', color: lCat===c.id ? c.color : 'var(--muted)' }}>
                  {c.icon && <Icon value={c.icon} size={12} color={lCat===c.id ? c.color : 'var(--muted)'} />}{c.label}
                </button>
              ))}
            </div>
          )}
          <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginBottom:10, alignItems:'center' }}>
            {DUR_CHIPS.map(m => (
              <button key={m} onClick={() => setLMins(m)}
                style={{ fontSize:11.5, padding:'6px 11px', borderRadius:16, cursor:'pointer', fontFamily:'DM Sans,sans-serif', fontWeight:600, border:`1px solid ${lMins===m ? 'var(--teal)' : 'var(--border)'}`, background: lMins===m ? '#F0FDFB' : 'white', color: lMins===m ? 'var(--teal)' : 'var(--muted)' }}>
                {fmtHours(m)}
              </button>
            ))}
            <span style={{ display:'inline-flex', alignItems:'center', gap:4, marginLeft:4 }}>
              <input type="number" min="0" value={Math.floor(lMins/60) || ''} onChange={e => setLMins((Math.max(0, +e.target.value||0))*60 + (lMins%60))}
                style={{ width:44, fontSize:13, padding:'7px 6px', borderRadius:8, border:'1px solid var(--border)', textAlign:'center', fontFamily:'DM Sans,sans-serif', color:'var(--text)', background:'white' }} />
              <span style={{ fontSize:11, color:'var(--muted)' }}>h</span>
              <input type="number" min="0" max="59" value={lMins%60 || ''} onChange={e => setLMins(Math.floor(lMins/60)*60 + Math.min(59, Math.max(0, +e.target.value||0)))}
                style={{ width:44, fontSize:13, padding:'7px 6px', borderRadius:8, border:'1px solid var(--border)', textAlign:'center', fontFamily:'DM Sans,sans-serif', color:'var(--text)', background:'white' }} />
              <span style={{ fontSize:11, color:'var(--muted)' }}>m</span>
            </span>
          </div>
          <div style={{ display:'flex', gap:8, alignItems:'center' }}>
            <input type="date" value={lDate} onChange={e => setLDate(e.target.value)} max={todayStr()}
              style={{ fontSize:12.5, padding:'8px 10px', borderRadius:10, border:'1px solid var(--border)', fontFamily:'DM Sans,sans-serif', color:'var(--text)', background:'white' }} />
            <button onClick={saveLog} disabled={!(lMins > 0)}
              style={{ marginLeft:'auto', fontSize:13, padding:'9px 18px', borderRadius:10, border:'none', cursor: lMins>0 ? 'pointer' : 'default', fontFamily:'DM Sans,sans-serif', fontWeight:700,
                background: lMins>0 ? 'var(--forest)' : '#E5E7EB', color: lMins>0 ? 'var(--green-light)' : '#9CA3AF' }}>
              Log {lMins>0 ? fmtHours(lMins) : 'time'}
            </button>
          </div>
        </div>
      )}

      {/* Question box */}
      <div style={{ background:'white', border:'1px solid var(--border)', borderRadius:14, padding:'14px 16px', marginBottom:14 }}>
        <div style={{ display:'flex', gap:8, alignItems:'center' }}>
          <input value={query} onChange={e => setQuery(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') ask() }}
            placeholder="How many hours did I spend on…"
            style={{ flex:1, minWidth:0, fontSize:14, padding:'11px 13px', borderRadius:10, border:'1px solid var(--border)', background:'var(--cream)', fontFamily:'DM Sans,sans-serif', color:'var(--text)', boxSizing:'border-box' }} />
          <button onClick={() => ask()} disabled={!query.trim()}
            style={{ fontSize:13, padding:'11px 18px', borderRadius:10, border:'none', cursor: query.trim() ? 'pointer' : 'default', fontFamily:'DM Sans,sans-serif', fontWeight:700,
              background: query.trim() ? 'var(--forest)' : '#E5E7EB', color: query.trim() ? 'var(--green-light)' : '#9CA3AF' }}>Ask</button>
        </div>
        {suggestions.length > 0 && (
          <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginTop:10 }}>
            <span style={{ fontSize:11, color:'var(--muted)', alignSelf:'center' }}>Try:</span>
            {suggestions.map(s => (
              <button key={s} onClick={() => ask(s)}
                style={{ fontSize:11, padding:'4px 10px', borderRadius:16, border:'1px solid var(--border)', background:'white', color:'var(--text)', cursor:'pointer', fontFamily:'DM Sans,sans-serif' }}>{s}</button>
            ))}
          </div>
        )}
      </div>

      {/* Answer */}
      {answer && ((answer.type === 'skills' ? answer.skills.length > 0 : answer.sessions > 0) ? (
        <div style={{ background:'linear-gradient(150deg, var(--forest), #2c3a34)', color:'var(--green-light)', borderRadius:16, padding:'18px 20px', marginBottom:16 }}>
          {answer.type === 'skills' ? (
            <>
              <div style={{ fontSize:12.5, opacity:.8 }}>Skills you’ve been using · {rangeLabel}</div>
              <div className="serif" style={{ fontSize:40, fontWeight:700, lineHeight:1.1, margin:'2px 0 2px' }}>{answer.skills.length} skill{answer.skills.length===1?'':'s'}</div>
              <div style={{ fontSize:12.5, opacity:.8 }}>inferred from {sessions(answer.sessions)}{answer.totalMins > 0 ? ` · ${fmtHours(answer.totalMins)} tracked` : ''}</div>
              {answer.skills.length > 0 && (
                <div style={{ marginTop:12, borderTop:'1px solid rgba(255,255,255,.16)', paddingTop:10 }}>
                  {answer.skills.map(s => (
                    <div key={s.id} style={{ display:'flex', alignItems:'center', gap:8, fontSize:12.5, padding:'4px 0', opacity:.94 }}>
                      <Icon value={s.icon} size={14} color="currentColor" />
                      <span style={{ flex:1, minWidth:0, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{s.label}</span>
                      <span style={{ fontWeight:600, flexShrink:0 }}>{s.mins > 0 ? fmtHours(s.mins) : sessions(s.count)}</span>
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : answer.type === 'overview' ? (
            <>
              <div style={{ fontSize:12.5, opacity:.8 }}>Where your time went · {rangeLabel}</div>
              <div className="serif" style={{ fontSize:40, fontWeight:700, lineHeight:1.1, margin:'2px 0 2px' }}>{answer.totalMins > 0 ? fmtHours(answer.totalMins) : sessions(answer.sessions)}</div>
              <div style={{ fontSize:12.5, opacity:.8 }}>{answer.totalMins > 0 ? <>{decimalHours(answer.totalMins)} hours · </> : null}{sessions(answer.sessions)} across {answer.days} day{answer.days===1?'':'s'}</div>
              {answer.byCategory.length > 0 && (
                <div style={{ marginTop:12, borderTop:'1px solid rgba(255,255,255,.16)', paddingTop:10 }}>
                  {answer.byCategory.map(c => (
                    <div key={c.id} style={{ display:'flex', alignItems:'center', gap:8, fontSize:12.5, padding:'3px 0', opacity:.92 }}>
                      {c.icon && <Icon value={c.icon} size={12} color="currentColor" />}
                      <span style={{ flex:1, minWidth:0, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{c.label}</span>
                      <span style={{ fontWeight:600, flexShrink:0 }}>{c.mins > 0 ? fmtHours(c.mins) : sessions(c.count)}</span>
                    </div>
                  ))}
                </div>
              )}
              {answer.skills.length > 0 && (
                <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginTop:12 }}>
                  {answer.skills.map(s => (
                    <span key={s.id} style={{ display:'inline-flex', alignItems:'center', gap:4, fontSize:11.5, fontWeight:600, padding:'4px 10px', borderRadius:16, background:'rgba(255,255,255,.14)' }}>
                      <Icon value={s.icon} size={12} color="currentColor" />{s.label}
                    </span>
                  ))}
                </div>
              )}
            </>
          ) : (
            <>
              <div style={{ fontSize:12.5, opacity:.8 }}>{answer.totalMins > 0 ? 'Time on' : 'Worked on'} “{answer.topic}” · {rangeLabel}</div>
              <div className="serif" style={{ fontSize:40, fontWeight:700, lineHeight:1.1, margin:'2px 0 2px' }}>{answer.totalMins > 0 ? fmtHours(answer.totalMins) : sessions(answer.sessions)}</div>
              <div style={{ fontSize:12.5, opacity:.8 }}>
                {answer.totalMins > 0
                  ? <>{decimalHours(answer.totalMins)} hours · {sessions(answer.sessions)} across {answer.days} day{answer.days===1?'':'s'}</>
                  : <>{sessions(answer.sessions)} across {answer.days} day{answer.days===1?'':'s'} · no time estimate on these</>}
              </div>
              {answer.byCategory.length > 0 && (
                <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginTop:12 }}>
                  {answer.byCategory.map(c => (
                    <span key={c.id} style={{ display:'inline-flex', alignItems:'center', gap:5, fontSize:11.5, fontWeight:600, padding:'4px 10px', borderRadius:16, background:'rgba(255,255,255,.14)' }}>
                      {c.icon && <Icon value={c.icon} size={12} color="currentColor" />}{c.label} · {c.mins > 0 ? fmtHours(c.mins) : sessions(c.count)}
                    </span>
                  ))}
                </div>
              )}
              {answer.skills && answer.skills.length > 0 && (
                <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginTop:10 }}>
                  <span style={{ fontSize:11, opacity:.7, alignSelf:'center' }}>Skills:</span>
                  {answer.skills.map(s => (
                    <span key={s.id} style={{ display:'inline-flex', alignItems:'center', gap:4, fontSize:11, fontWeight:600, padding:'3px 9px', borderRadius:16, background:'rgba(255,255,255,.1)' }}>
                      <Icon value={s.icon} size={12} color="currentColor" />{s.label}
                    </span>
                  ))}
                </div>
              )}
              {answer.byTask.length > 0 && (
                <div style={{ marginTop:12, borderTop:'1px solid rgba(255,255,255,.16)', paddingTop:10 }}>
                  {answer.byTask.map(t => (
                    <div key={t.title} style={{ display:'flex', justifyContent:'space-between', gap:10, fontSize:12.5, padding:'3px 0', opacity:.92 }}>
                      <span style={{ whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{t.title}{t.count>1?` ×${t.count}`:''}</span>
                      <span style={{ fontWeight:600, flexShrink:0 }}>{t.mins > 0 ? fmtHours(t.mins) : sessions(t.count)}</span>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      ) : (
        <div style={{ background:'#FBF3E7', border:'1px solid #E6DCC8', borderRadius:14, padding:'14px 16px', marginBottom:16, fontSize:13, color:'var(--text)' }}>
          {answer.type === 'skills'
            ? <>No skills inferred {rangeLabel === 'all time' ? 'yet' : `in the ${rangeLabel}`}. Add descriptions or subtasks to your tasks — the more detail, the more the page can pick up.</>
            : <>No tracked time matches “{answer.topic}” {rangeLabel === 'all time' ? 'yet' : `in the ${rangeLabel}`}. Try a category, task or skill name, or widen the range.</>}
        </div>
      ))}

      {/* Overview */}
      <div style={{ display:'flex', alignItems:'baseline', justifyContent:'space-between', marginBottom:8 }}>
        <div style={{ fontSize:11, color:'var(--muted)', letterSpacing:1.5, textTransform:'uppercase', fontWeight:600 }}>By area</div>
        <div style={{ fontSize:12.5, color:'var(--text)', fontWeight:700 }}>{hasHours ? `${fmtHours(agg.totalMins)} · ` : ''}{sessions(totalSessions)}</div>
      </div>

      {totalSessions === 0 ? (
        <div style={{ fontSize:13, color:'var(--muted)', background:'white', border:'1px solid var(--border)', borderRadius:12, padding:'16px' }}>
          Nothing logged {range==='all' ? 'yet' : `in the ${rangeLabel}`}. Check tasks off as you finish them and they’ll show up here — with hours wherever you gave the task a duration.
        </div>
      ) : (
        <>
          <div style={{ background:'white', border:'1px solid var(--border)', borderRadius:14, padding:'14px 16px', marginBottom:12 }}>
            {agg.byCategory.slice(0, 12).map(c => (
              <div key={c.id} style={{ marginBottom:12 }}>
                <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                  <span style={{ width:10, height:10, borderRadius:3, background:c.color, flexShrink:0 }} />
                  {c.icon && <Icon value={c.icon} size={14} color={c.color} />}
                  <span style={{ fontSize:13, fontWeight:600, color:'var(--text)', flex:1, minWidth:0, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{c.label}</span>
                  <span style={{ fontSize:12.5, color:'var(--muted)', fontWeight:600, flexShrink:0 }}>{c.mins > 0 ? fmtHours(c.mins) : sessions(c.count)}</span>
                </div>
                <Bar frac={hasHours ? c.mins / maxCatMins : c.count / maxCatCount} color={c.color} />
              </div>
            ))}
          </div>

          {/* Topics & projects — the specific things you worked on. */}
          <div style={{ fontSize:11, color:'var(--muted)', letterSpacing:1.5, textTransform:'uppercase', fontWeight:600, margin:'6px 0 8px' }}>Topics &amp; projects</div>
          <div style={{ background:'white', border:'1px solid var(--border)', borderRadius:14, padding:'6px 16px' }}>
            {agg.byTask.slice(0, 12).map((t, i, arr) => (
              <div key={t.title} style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 0', borderBottom: i < arr.length-1 ? '1px solid #F1EEF3' : 'none' }}>
                <span style={{ fontSize:11, color:'var(--muted)', width:18, flexShrink:0 }}>{i+1}</span>
                <span style={{ flex:1, minWidth:0, fontSize:13, color:'var(--text)', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{t.title}</span>
                <span style={{ fontSize:11, color:'var(--muted)', flexShrink:0 }}>{sessions(t.count)}</span>
                {t.mins > 0 && <span style={{ fontSize:12.5, fontWeight:700, color:'var(--text)', flexShrink:0, minWidth:52, textAlign:'right' }}>{fmtHours(t.mins)}</span>}
              </div>
            ))}
          </div>

          {/* Skills you've practiced — inferred from titles, descriptions and
              subtasks. Tap a skill to see which tasks it came from. */}
          {skills.length > 0 && (
            <>
              <div style={{ display:'flex', alignItems:'baseline', justifyContent:'space-between', margin:'16px 0 8px' }}>
                <div style={{ fontSize:11, color:'var(--muted)', letterSpacing:1.5, textTransform:'uppercase', fontWeight:600 }}>Skills you’ve practiced</div>
                <div style={{ fontSize:11, color:'var(--muted)' }}>{skills.length} skill{skills.length===1?'':'s'}</div>
              </div>
              <div style={{ background:'white', border:'1px solid var(--border)', borderRadius:14, padding:'14px 16px' }}>
                {skills.slice(0, 14).map((s, i, arr) => {
                  const open = openSkill === s.id
                  return (
                    <div key={s.id} style={{ marginBottom: i < arr.length-1 ? 12 : 0 }}>
                      <div onClick={() => setOpenSkill(open ? null : s.id)} role="button" tabIndex={0}
                        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpenSkill(open ? null : s.id) } }}
                        style={{ display:'flex', alignItems:'center', gap:8, cursor:'pointer' }}>
                        <span style={{ width:18, display:'inline-flex', justifyContent:'center', flexShrink:0 }}><Icon value={s.icon} size={15} color={s.color} /></span>
                        <span style={{ fontSize:13, fontWeight:600, color:'var(--text)', flex:1, minWidth:0, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{s.label}</span>
                        <span style={{ fontSize:11, color:'var(--muted)', flexShrink:0 }}>{sessions(s.count)}</span>
                        {s.mins > 0 && <span style={{ fontSize:12.5, color:'var(--muted)', fontWeight:600, flexShrink:0, minWidth:52, textAlign:'right' }}>{fmtHours(s.mins)}</span>}
                        <span style={{ fontSize:10, color:'var(--muted)', flexShrink:0, transform: open ? 'rotate(90deg)' : 'none', transition:'transform .15s' }}>▶</span>
                      </div>
                      <Bar frac={hasHours ? s.mins / maxSkillMins : s.count / maxSkillCount} color={s.color} />
                      {open && s.tasks.length > 0 && (
                        <div style={{ marginTop:8, paddingLeft:26 }}>
                          {s.tasks.slice(0, 8).map(t => (
                            <div key={t.title} style={{ display:'flex', justifyContent:'space-between', gap:10, fontSize:12, color:'var(--muted)', padding:'2px 0' }}>
                              <span style={{ whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{t.title}{t.count>1?` ×${t.count}`:''}</span>
                              {t.mins > 0 && <span style={{ flexShrink:0 }}>{fmtHours(t.mins)}</span>}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </>
          )}
        </>
      )}

      {/* Time you logged by hand — removable. */}
      {rangeLogs.length > 0 && (
        <>
          <div style={{ fontSize:11, color:'var(--muted)', letterSpacing:1.5, textTransform:'uppercase', fontWeight:600, margin:'16px 0 8px' }}>Time you logged</div>
          <div style={{ background:'white', border:'1px solid var(--border)', borderRadius:14, padding:'6px 16px' }}>
            {rangeLogs.map((t, i, arr) => {
              const c = categories.find(x => x.id === t.cat)
              return (
                <div key={t.id} style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 0', borderBottom: i < arr.length-1 ? '1px solid #F1EEF3' : 'none' }}>
                  <span style={{ width:9, height:9, borderRadius:3, background: c?.color || '#C6A15B', flexShrink:0 }} />
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontSize:13, color:'var(--text)', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{t.title}</div>
                    <div style={{ fontSize:11, color:'var(--muted)' }}>{new Date((t.date||'')+'T12:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric'})}{c?` · ${c.label}`:''}</div>
                  </div>
                  <span style={{ fontSize:12.5, fontWeight:700, color:'var(--text)', flexShrink:0 }}>{fmtHours(t.mins)}</span>
                  <button onClick={() => deleteTimeLog && deleteTimeLog(t.id)} title="Remove" aria-label="Remove logged time"
                    style={{ background:'none', border:'none', cursor:'pointer', color:'#B9B3AC', fontSize:15, padding:'0 2px', flexShrink:0 }}>✕</button>
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
