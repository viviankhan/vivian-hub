// src/components/Log.jsx
const TAG_COLORS = {
  health:'#E07B2E', class:'#7C3AED', lab:'#059669', career:'#D97706',
  fitness:'#3B82F6', personal:'#A855F7', sleep:'#52B788', urgent:'#EF4444', carried:'#F59E0B',
}

export default function Log({ log }) {
  if (!log.length) return (
    <div>
      <div className="page-title">Daily Log</div>
      <div className="page-sub">Confirmed completed tasks only</div>
      <div style={{ background:'white', borderRadius:12, border:'1px solid var(--border)', padding:20, textAlign:'center', color:'var(--muted)', fontSize:13 }}>
        Nothing logged yet. Check off tasks in Today to log them here.
      </div>
    </div>
  )

  // Group by date
  const byDate = {}
  log.forEach(e => {
    const k = e.date || e.ts?.split('T')[0] || 'Unknown'
    if (!byDate[k]) byDate[k] = { label: e.dateLabel || k, entries: [] }
    byDate[k].entries.push(e)
  })

  const sorted = Object.entries(byDate).sort((a,b) => b[0].localeCompare(a[0]))

  return (
    <div>
      <div className="page-title">Daily Log</div>
      <div className="page-sub">Confirmed completed tasks only · Spring 2026</div>
      {sorted.map(([date, { label, entries }]) => (
        <div key={date} style={{ marginBottom:22 }}>
          <div className="log-day-header">
            <div className="log-day-title">{label}</div>
            <div className="log-day-sub">{date} · {entries.length} completed</div>
          </div>
          <div style={{ height:1, background:'var(--border)', marginBottom:10 }} />
          {entries.map((e, i) => (
            <div key={i} className="log-item">
              <div className="log-check">✓</div>
              <div className="log-text" style={{ flex:1 }}>
                {e.label}
                {e.tag && (
                  <span style={{ display:'inline-block', fontSize:9, letterSpacing:1, textTransform:'uppercase', padding:'1px 6px', borderRadius:10, marginLeft:8, background:`${TAG_COLORS[e.tag]}22`, color:TAG_COLORS[e.tag], fontWeight:500 }}>
                    {e.tag}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}
