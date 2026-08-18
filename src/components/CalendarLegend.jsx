// src/components/CalendarLegend.jsx
// A compact, tappable legend of your subscribed calendars, shown on the Day
// (Today), Week and Month (Calendar) views. Each chip carries the calendar's
// color and name; tapping it flips that calendar's visibility everywhere at
// once (it writes the same enabled flag Settings › Calendars uses), so you can
// hide "Mom's family calendar" from your schedule without leaving the view.
import { DEFAULT_CAL_COLOR } from '../lib/calendars.js'

export default function CalendarLegend({ calendars = [], onToggle, style }) {
  if (!calendars.length) return null
  return (
    <div style={{ display:'flex', alignItems:'center', gap:7, flexWrap:'wrap', margin:'0 0 12px', ...style }}>
      <span style={{ fontSize:9.5, fontWeight:800, letterSpacing:1, textTransform:'uppercase', color:'var(--muted)', marginRight:1 }}>Calendars</span>
      {calendars.map(cal => {
        const on = cal.enabled !== false
        const color = cal.color || DEFAULT_CAL_COLOR
        return (
          <button key={cal.id} role="switch" aria-checked={on}
            onClick={() => onToggle && onToggle(cal.id)}
            title={on ? `Hide ${cal.name}` : `Show ${cal.name}`}
            style={{ display:'inline-flex', alignItems:'center', gap:6, padding:'4px 10px', borderRadius:20,
              border:`1px solid ${on ? color : 'var(--border)'}`,
              background: on ? `${color}18` : 'transparent',
              color: on ? 'var(--text)' : 'var(--muted)', cursor:'pointer', fontFamily:'DM Sans,sans-serif',
              fontSize:11.5, fontWeight:600, lineHeight:1.2, opacity: on ? 1 : .6, transition:'all .15s' }}>
            <span style={{ width:9, height:9, borderRadius:'50%', background:color, flexShrink:0,
              boxShadow: on ? 'none' : 'inset 0 0 0 10px var(--cream, #fff)', opacity: on ? 1 : .5 }} />
            <span style={{ whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', maxWidth:130,
              textDecoration: on ? 'none' : 'line-through' }}>{cal.name}</span>
          </button>
        )
      })}
    </div>
  )
}
