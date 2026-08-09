// src/components/Informatics.jsx
// The "Informatics" page — ask "how many hours did I spend on X?" and see where
// your time actually went. It reads your finished, timed work (see
// src/lib/insights.js), matches a free-typed question against your categories
// and task names, and shows the total plus a breakdown. Below the question box
// is an always-on overview of time by category and by task, which doubles as a
// menu of things you can ask about.
import { useMemo, useState } from 'react'
import { Icon } from './IconPicker.jsx'
import { computeTimeEntries, filterByRange, aggregate, answerQuery, fmtHours, decimalHours } from '../lib/insights.js'

const RANGES = [['week', 'Past week'], ['month', 'Past month'], ['all', 'All time']]

function Bar({ frac, color }) {
  return (
    <div style={{ height:8, borderRadius:6, background:'#EEECF0', overflow:'hidden', marginTop:6 }}>
      <div style={{ width:`${Math.max(2, frac * 100)}%`, height:'100%', background:color, borderRadius:6, transition:'width .4s ease' }} />
    </div>
  )
}

export default function Informatics({ commitments = [], recurringTasks = [], completions = {}, categories = [] }) {
  const [range, setRange] = useState('all')
  const [query, setQuery] = useState('')
  const [asked, setAsked] = useState('')   // the submitted question

  const allEntries = useMemo(
    () => computeTimeEntries({ commitments, recurringTasks, completions }),
    [commitments, recurringTasks, completions],
  )
  const entries = useMemo(() => filterByRange(allEntries, range), [allEntries, range])
  const agg = useMemo(() => aggregate(entries, categories), [entries, categories])
  const answer = useMemo(() => asked ? answerQuery(entries, asked, categories) : null, [asked, entries, categories])

  const maxCat = agg.byCategory[0]?.mins || 1
  const maxTask = agg.byTask[0]?.mins || 1

  // Suggestions of what to ask: the top categories, then a few frequent task
  // names — the things there's actually data for.
  const suggestions = [
    ...agg.byCategory.slice(0, 5).map(c => c.label),
    ...agg.byTask.slice(0, 4).map(t => t.title),
  ].filter((v, i, a) => v && a.indexOf(v) === i).slice(0, 7)

  const ask = (text) => { const v = (text ?? query).trim(); setAsked(v); setQuery(v) }

  const rangeLabel = RANGES.find(r => r[0] === range)?.[1].toLowerCase()

  return (
    <div>
      <div className="page-title">Informatics</div>
      <div className="page-sub">Ask where your time went — “how many hours did I spend on MCAT studying?” — and see it broken down by category and task. Counts finished work that had a time estimate.</div>

      {/* Range */}
      <div style={{ display:'flex', gap:6, margin:'4px 0 14px', flexWrap:'wrap' }}>
        {RANGES.map(([id, label]) => (
          <button key={id} onClick={() => setRange(id)}
            style={{ fontSize:11.5, padding:'6px 13px', borderRadius:20, cursor:'pointer', fontFamily:'DM Sans,sans-serif', fontWeight:600,
              border:`1px solid ${range===id ? 'var(--teal)' : 'var(--border)'}`, background: range===id ? '#F0FDFB' : 'white', color: range===id ? 'var(--teal)' : 'var(--muted)' }}>
            {label}
          </button>
        ))}
      </div>

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
      {answer && (
        answer.sessions > 0 ? (
          <div style={{ background:'linear-gradient(150deg, var(--forest), #2c3a34)', color:'var(--green-light)', borderRadius:16, padding:'18px 20px', marginBottom:16 }}>
            <div style={{ fontSize:12.5, opacity:.8 }}>Time on “{answer.topic}” · {rangeLabel}</div>
            <div className="serif" style={{ fontSize:40, fontWeight:700, lineHeight:1.1, margin:'2px 0 2px' }}>{fmtHours(answer.totalMins)}</div>
            <div style={{ fontSize:12.5, opacity:.8 }}>{decimalHours(answer.totalMins)} hours · {answer.sessions} session{answer.sessions===1?'':'s'} across {answer.days} day{answer.days===1?'':'s'}</div>
            {answer.byCategory.length > 0 && (
              <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginTop:12 }}>
                {answer.byCategory.map(c => (
                  <span key={c.id} style={{ display:'inline-flex', alignItems:'center', gap:5, fontSize:11.5, fontWeight:600, padding:'4px 10px', borderRadius:16, background:'rgba(255,255,255,.14)' }}>
                    {c.icon && <Icon value={c.icon} size={12} color="currentColor" />}{c.label} · {fmtHours(c.mins)}
                  </span>
                ))}
              </div>
            )}
            {answer.byTask.length > 0 && (
              <div style={{ marginTop:12, borderTop:'1px solid rgba(255,255,255,.16)', paddingTop:10 }}>
                {answer.byTask.map(t => (
                  <div key={t.title} style={{ display:'flex', justifyContent:'space-between', gap:10, fontSize:12.5, padding:'3px 0', opacity:.92 }}>
                    <span style={{ whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{t.title}{t.count>1?` ×${t.count}`:''}</span>
                    <span style={{ fontWeight:600, flexShrink:0 }}>{fmtHours(t.mins)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div style={{ background:'#FBF3E7', border:'1px solid #E6DCC8', borderRadius:14, padding:'14px 16px', marginBottom:16, fontSize:13, color:'var(--text)' }}>
            No tracked time matches “{answer.topic}” {rangeLabel === 'all time' ? 'yet' : `in the ${rangeLabel}`}. Try a category or task name, or widen the range. Only finished tasks that had a time estimate are counted.
          </div>
        )
      )}

      {/* Overview */}
      <div style={{ display:'flex', alignItems:'baseline', justifyContent:'space-between', marginBottom:8 }}>
        <div style={{ fontSize:11, color:'var(--muted)', letterSpacing:1.5, textTransform:'uppercase', fontWeight:600 }}>Where your time went</div>
        <div style={{ fontSize:12.5, color:'var(--text)', fontWeight:700 }}>{fmtHours(agg.totalMins)} total</div>
      </div>

      {agg.totalMins === 0 ? (
        <div style={{ fontSize:13, color:'var(--muted)', background:'white', border:'1px solid var(--border)', borderRadius:12, padding:'16px' }}>
          No tracked time {range==='all' ? 'yet' : `in the ${rangeLabel}`}. Give your tasks a duration and check them off, and the hours will add up here.
        </div>
      ) : (
        <>
          <div style={{ background:'white', border:'1px solid var(--border)', borderRadius:14, padding:'14px 16px', marginBottom:12 }}>
            {agg.byCategory.map(c => (
              <div key={c.id} style={{ marginBottom:12 }}>
                <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                  <span style={{ width:10, height:10, borderRadius:3, background:c.color, flexShrink:0 }} />
                  {c.icon && <Icon value={c.icon} size={14} color={c.color} />}
                  <span style={{ fontSize:13, fontWeight:600, color:'var(--text)', flex:1, minWidth:0, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{c.label}</span>
                  <span style={{ fontSize:12.5, color:'var(--muted)', fontWeight:600, flexShrink:0 }}>{fmtHours(c.mins)}</span>
                </div>
                <Bar frac={c.mins / maxCat} color={c.color} />
              </div>
            )).slice(0, 12)}
          </div>

          {/* Top tasks */}
          <div style={{ fontSize:11, color:'var(--muted)', letterSpacing:1.5, textTransform:'uppercase', fontWeight:600, margin:'6px 0 8px' }}>Top tasks</div>
          <div style={{ background:'white', border:'1px solid var(--border)', borderRadius:14, padding:'6px 16px' }}>
            {agg.byTask.slice(0, 10).map((t, i, arr) => (
              <div key={t.title} style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 0', borderBottom: i < Math.min(arr.length, 10)-1 ? '1px solid #F1EEF3' : 'none' }}>
                <span style={{ fontSize:11, color:'var(--muted)', width:18, flexShrink:0 }}>{i+1}</span>
                <span style={{ flex:1, minWidth:0, fontSize:13, color:'var(--text)', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{t.title}{t.count>1?` · ×${t.count}`:''}</span>
                <span style={{ fontSize:12.5, fontWeight:700, color:'var(--text)', flexShrink:0 }}>{fmtHours(t.mins)}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
