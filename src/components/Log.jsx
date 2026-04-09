import { useState } from 'react'

const TAG_COLORS = {
  health:'#E07B2E', class:'#7C3AED', lab:'#059669', career:'#D97706',
  fitness:'#3B82F6', personal:'#A855F7', sleep:'#52B788', urgent:'#EF4444',
  carried:'#F59E0B', rescheduled:'#9CA3AF', deleted:'#EF4444',
}
const DAY_NAMES = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']
const ALL_TAGS = ['lab','class','career','health','fitness','personal','sleep','urgent']

// ── Analytics helpers ──────────────────────────────────────────
function computeStats(log) {
  if (!log.length) return null

  // completions by day of week
  const byDow = Array(7).fill(0)
  const dayTotals = Array(7).fill(0)

  // completions by category
  const byCat = {}

  // completions by date for streak
  const byDate = {}

  log.forEach(e => {
    const date = e.date || e.ts?.split('T')[0]
    if (!date) return
    const d = new Date(date+'T12:00:00')
    const dow = d.getDay()
    byDow[dow]++
    if (!byDate[date]) byDate[date] = 0
    byDate[date]++
    const cat = e.tag || 'other'
    if (!['deleted','rescheduled'].includes(cat)) {
      byCat[cat] = (byCat[cat]||0) + 1
    }
  })

  // streak — consecutive days with completions up to today
  const today = new Date()
  let streak = 0
  for (let i = 0; i < 60; i++) {
    const d = new Date(today); d.setDate(today.getDate() - i)
    const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
    if (byDate[key] > 0) streak++
    else if (i > 0) break // allow today to be empty
  }

  // total days logged
  const uniqueDays = Object.keys(byDate).filter(d => byDate[d] > 0).length

  // best dow
  const maxDow = byDow.indexOf(Math.max(...byDow))

  // category totals, sorted
  const catSorted = Object.entries(byCat).sort((a,b)=>b[1]-a[1])
  const catTotal = catSorted.reduce((s,[,v])=>s+v, 0)

  // completions per day average
  const avgPerDay = uniqueDays > 0 ? (log.filter(e=>!['deleted','rescheduled'].includes(e.tag)).length / uniqueDays).toFixed(1) : 0

  return { byDow, byCat, catSorted, catTotal, byDate, streak, uniqueDays, maxDow, avgPerDay }
}

// ── Mini bar chart ─────────────────────────────────────────────
function DowChart({ byDow }) {
  const max = Math.max(...byDow, 1)
  const today = new Date().getDay()
  return (
    <div style={{ display:'flex', gap:6, alignItems:'flex-end', height:60 }}>
      {byDow.map((v, i) => (
        <div key={i} style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', gap:3 }}>
          <div style={{ fontSize:9, color:'var(--muted)', fontWeight:500 }}>{v||''}</div>
          <div style={{ width:'100%', borderRadius:'3px 3px 0 0', height:`${Math.max((v/max)*44, v>0?4:0)}px`,
            background: i===today ? 'var(--teal)' : '#52B78866', transition:'height .4s' }} />
          <div style={{ fontSize:9, color: i===today?'var(--teal)':'var(--muted)', fontWeight: i===today?700:400, letterSpacing:.5 }}>
            {DAY_NAMES[i]}
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Category bar ───────────────────────────────────────────────
function CatBar({ catSorted, catTotal }) {
  return (
    <div>
      {catSorted.slice(0,6).map(([cat, count]) => {
        const pct = Math.round((count/catTotal)*100)
        const color = TAG_COLORS[cat] || '#9CA3AF'
        return (
          <div key={cat} style={{ marginBottom:7 }}>
            <div style={{ display:'flex', justifyContent:'space-between', marginBottom:3 }}>
              <span style={{ fontSize:11, color:'var(--text)', textTransform:'capitalize', fontWeight:500 }}>{cat}</span>
              <span style={{ fontSize:11, color:'var(--muted)' }}>{count} · {pct}%</span>
            </div>
            <div style={{ height:5, background:'var(--border)', borderRadius:3, overflow:'hidden' }}>
              <div style={{ height:'100%', width:`${pct}%`, background:color, borderRadius:3, transition:'width .6s' }} />
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── Stat card ──────────────────────────────────────────────────
function StatCard({ label, value, sub, color }) {
  return (
    <div style={{ background:'white', borderRadius:12, border:'1px solid var(--border)', padding:'14px 16px', flex:1, minWidth:100 }}>
      <div style={{ fontSize:22, fontFamily:'Cormorant Garamond, serif', fontWeight:700, color: color||'var(--text)', marginBottom:2 }}>{value}</div>
      <div style={{ fontSize:11, fontWeight:600, color:'var(--text)', marginBottom:2 }}>{label}</div>
      {sub && <div style={{ fontSize:10, color:'var(--muted)' }}>{sub}</div>}
    </div>
  )
}

// ── Main ───────────────────────────────────────────────────────
export default function Log({ log, notes, updateNotes }) {
  const [view, setView] = useState('stats') // 'stats' | 'history'
  const [filterTag, setFilterTag] = useState('all')

  const stats = computeStats(log)

  // Group log by date for history view
  const byDate = {}
  log.forEach(e => {
    const k = e.date || e.ts?.split('T')[0] || 'Unknown'
    if (!byDate[k]) byDate[k] = { label:e.dateLabel||k, entries:[] }
    byDate[k].entries.push(e)
  })
  const sortedDates = Object.entries(byDate).sort((a,b)=>b[0].localeCompare(a[0]))
  const filteredDates = filterTag === 'all'
    ? sortedDates
    : sortedDates.map(([d,v]) => [d, { ...v, entries:v.entries.filter(e=>e.tag===filterTag) }]).filter(([,v])=>v.entries.length>0)

  return (
    <div>
      <div className="page-title">Log</div>

      {/* View toggle */}
      <div style={{ display:'flex', gap:0, marginBottom:20, borderRadius:10, overflow:'hidden', border:'1px solid var(--border)', width:'fit-content' }}>
        {[['stats','📊 Stats'],['history','📋 History'],['notes','📝 Notes']].map(([v,l]) => (
          <button key={v} onClick={()=>setView(v)}
            style={{ fontSize:12, padding:'8px 16px', border:'none', cursor:'pointer', fontFamily:'DM Sans,sans-serif', fontWeight:600,
              background:view===v?'var(--forest)':'white', color:view===v?'var(--green-light)':'var(--muted)' }}>
            {l}
          </button>
        ))}
      </div>

      {/* ── Stats ── */}
      {view==='stats' && (
        <div>
          {!stats ? (
            <div style={{ background:'white', borderRadius:12, border:'1px solid var(--border)', padding:24, textAlign:'center', color:'var(--muted)', fontSize:13 }}>
              No data yet — check off tasks in Today to start building your log.
            </div>
          ) : (
            <>
              {/* Stat cards */}
              <div style={{ display:'flex', gap:10, flexWrap:'wrap', marginBottom:16 }}>
                <StatCard label="Day streak" value={stats.streak} sub="consecutive days logged" color="#52B788" />
                <StatCard label="Avg / day" value={stats.avgPerDay} sub="tasks completed" color="var(--teal)" />
                <StatCard label="Days logged" value={stats.uniqueDays} sub="total active days" />
                <StatCard label="Best day" value={DAY_NAMES[stats.maxDow]} sub={`${stats.byDow[stats.maxDow]} completions`} color="#D97706" />
              </div>

              {/* Day of week chart */}
              <div style={{ background:'white', borderRadius:12, border:'1px solid var(--border)', padding:'16px 18px', marginBottom:14 }}>
                <div style={{ fontSize:11, letterSpacing:2, textTransform:'uppercase', color:'var(--muted)', marginBottom:12 }}>Completions by Day of Week</div>
                <DowChart byDow={stats.byDow} />
              </div>

              {/* Category breakdown */}
              {stats.catSorted.length > 0 && (
                <div style={{ background:'white', borderRadius:12, border:'1px solid var(--border)', padding:'16px 18px', marginBottom:14 }}>
                  <div style={{ fontSize:11, letterSpacing:2, textTransform:'uppercase', color:'var(--muted)', marginBottom:14 }}>Category Breakdown</div>
                  <CatBar catSorted={stats.catSorted} catTotal={stats.catTotal} />
                </div>
              )}

              {/* Recent heatmap — last 5 weeks */}
              <div style={{ background:'white', borderRadius:12, border:'1px solid var(--border)', padding:'16px 18px' }}>
                <div style={{ fontSize:11, letterSpacing:2, textTransform:'uppercase', color:'var(--muted)', marginBottom:12 }}>Last 35 Days</div>
                <div style={{ display:'flex', gap:3, flexWrap:'wrap' }}>
                  {Array.from({length:35},(_,i)=>{
                    const d = new Date(); d.setDate(d.getDate()-(34-i))
                    const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
                    const count = stats.byDate[key]||0
                    const isToday = i===34
                    const intensity = count===0?0:count<=2?1:count<=5?2:3
                    const colors = ['#F0EDE8','#DCFCE7','#86EFAC','#22C55E','#15803D']
                    return (
                      <div key={i} title={`${key}: ${count} tasks`}
                        style={{ width:14, height:14, borderRadius:3, background:colors[intensity],
                          border:isToday?'2px solid var(--teal)':'none', boxSizing:'border-box' }} />
                    )
                  })}
                </div>
                <div style={{ display:'flex', gap:4, alignItems:'center', marginTop:8 }}>
                  <span style={{ fontSize:9, color:'var(--muted)' }}>Less</span>
                  {['#F0EDE8','#DCFCE7','#86EFAC','#22C55E'].map(c=>(
                    <div key={c} style={{ width:10, height:10, borderRadius:2, background:c }} />
                  ))}
                  <span style={{ fontSize:9, color:'var(--muted)' }}>More</span>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* ── History ── */}
      {view==='history' && (
        <div>
          {/* Tag filter */}
          <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginBottom:16 }}>
            {['all',...ALL_TAGS].map(t => {
              const color = TAG_COLORS[t]||'#9CA3AF'
              const active = filterTag===t
              return (
                <button key={t} onClick={()=>setFilterTag(t)}
                  style={{ fontSize:10, padding:'4px 11px', borderRadius:20, border:`1.5px solid ${active?color:'var(--border)'}`,
                    background:active?`${color}18`:'white', color:active?color:'var(--muted)',
                    cursor:'pointer', fontFamily:'DM Sans,sans-serif', fontWeight:600, letterSpacing:.5, textTransform:'uppercase' }}>
                  {t}
                </button>
              )
            })}
          </div>

          {filteredDates.length===0 ? (
            <div style={{ background:'white', borderRadius:12, border:'1px solid var(--border)', padding:20, textAlign:'center', color:'var(--muted)', fontSize:13 }}>
              No entries yet.
            </div>
          ) : filteredDates.map(([date,{label,entries}]) => (
            <div key={date} style={{ marginBottom:20 }}>
              <div className="log-day-header">
                <div className="log-day-title">{label}</div>
                <div className="log-day-sub">{date} · {entries.length} entries</div>
              </div>
              <div style={{ height:1, background:'var(--border)', marginBottom:10 }} />
              {entries.map((e,i) => {
                const color = TAG_COLORS[e.tag]||'#9CA3AF'
                return (
                  <div key={i} className="log-item">
                    <div style={{ color:'#52B788', fontSize:13, flexShrink:0, marginTop:1 }}>✓</div>
                    <div className="log-text" style={{ flex:1 }}>
                      {e.label}
                      {e.tag && <span style={{ display:'inline-block', fontSize:9, letterSpacing:1, textTransform:'uppercase', padding:'1px 6px', borderRadius:10, marginLeft:8, background:`${color}22`, color, fontWeight:500 }}>{e.tag}</span>}
                    </div>
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      )}

      {/* ── Notes ── */}
      {view==='notes' && (
        <div>
          <div style={{ fontSize:12, color:'var(--muted)', marginBottom:12 }}>Freeform notes — anything on your mind, ideas, reflections.</div>
          <textarea value={notes||''} onChange={e=>updateNotes(e.target.value)}
            placeholder="Start writing…"
            style={{ width:'100%', minHeight:320, fontSize:13, padding:'14px 16px', borderRadius:12, border:'1px solid var(--border)', fontFamily:'DM Sans,sans-serif', outline:'none', lineHeight:1.7, resize:'vertical', color:'var(--text)' }} />
        </div>
      )}
    </div>
  )
}
