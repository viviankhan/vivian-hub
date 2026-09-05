// src/components/TaskMenuSettings.jsx
// Settings → Task menu. Arrange the add-a-task sheet: which rows you meet
// first, in what order, and which tuck away under "More options".
//
// The automatic default is Bloom's own task menu — the one you already know —
// with Labels at the top, because picking a record label reshapes the rest of
// the sheet around what that label needs written down.
import { useEffect, useState } from 'react'
import {
  TASK_MENU_ROWS, TASK_MENU_EVENT, taskMenuRow,
  getTaskMenu, setTaskMenu, resetTaskMenu, isDefaultTaskMenu, moveRow, setRowList,
} from '../lib/taskMenuPrefs.js'

const rowCard = { background: 'white', border: '1px solid var(--border)', borderRadius: 11, padding: '10px 12px', marginBottom: 7, display: 'flex', alignItems: 'center', gap: 10 }

function Arrangement({ title, note, ids, menu, onChange }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ fontSize: 10, color: 'var(--muted)', letterSpacing: 1.2, textTransform: 'uppercase', fontWeight: 700, marginBottom: 4 }}>{title}</div>
      <div style={{ fontSize: 11.5, color: 'var(--muted)', lineHeight: 1.5, marginBottom: 9 }}>{note}</div>
      {ids.length === 0 && <div style={{ fontSize: 12, color: 'var(--muted)', padding: '4px 0 8px' }}>Nothing here yet.</div>}
      {ids.map((id, i) => {
        const row = taskMenuRow(id)
        if (!row) return null
        const inPrimary = menu.primary.includes(id)
        return (
          <div key={id} style={rowCard}>
            <span style={{ display: 'inline-flex', flexDirection: 'column', flexShrink: 0, lineHeight: 0 }}>
              <button onClick={() => onChange(moveRow(menu, id, -1))} disabled={i === 0} aria-label={`Move ${row.label} up`}
                style={{ background: 'none', border: 'none', cursor: i === 0 ? 'default' : 'pointer', color: i === 0 ? '#E2E4E9' : '#AEB6C0', fontSize: 11, padding: '0 3px', lineHeight: 1.1 }}>▲</button>
              <button onClick={() => onChange(moveRow(menu, id, 1))} disabled={i === ids.length - 1} aria-label={`Move ${row.label} down`}
                style={{ background: 'none', border: 'none', cursor: i === ids.length - 1 ? 'default' : 'pointer', color: i === ids.length - 1 ? '#E2E4E9' : '#AEB6C0', fontSize: 11, padding: '0 3px', lineHeight: 1.1 }}>▼</button>
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text)' }}>{row.label}</div>
              <div style={{ fontSize: 11, color: 'var(--muted)', lineHeight: 1.4, marginTop: 1 }}>{row.hint}</div>
            </div>
            <button onClick={() => onChange(setRowList(menu, id, inPrimary ? 'more' : 'primary'))}
              style={{ flexShrink: 0, fontSize: 11, padding: '6px 11px', borderRadius: 16, cursor: 'pointer', fontFamily: 'DM Sans,sans-serif', fontWeight: 700,
                border: '1px solid var(--border)', background: 'white', color: 'var(--teal)', whiteSpace: 'nowrap' }}>
              {inPrimary ? 'Tuck away' : 'Show first'}
            </button>
          </div>
        )
      })}
    </div>
  )
}

export default function TaskMenuSettings() {
  const [menu, setMenu] = useState(getTaskMenu)
  // Another device can change this too (it rides the synced prefs blob), so
  // re-read whenever the app broadcasts a task-menu change.
  useEffect(() => {
    const h = () => setMenu(getTaskMenu())
    window.addEventListener(TASK_MENU_EVENT, h)
    return () => window.removeEventListener(TASK_MENU_EVENT, h)
  }, [])
  const apply = (next) => setMenu(setTaskMenu(next))
  const isDefault = isDefaultTaskMenu(menu)

  return (
    <div>
      <div className="page-title">Task menu</div>
      <div className="page-sub">Your default add-a-task sheet. Put the rows you use most at the top and tuck the rest under “More options”. This is what every new task opens with, everywhere in Bloom.</div>

      <Arrangement title="Shown first" menu={menu} ids={menu.primary} onChange={apply}
        note="These appear straight away when you add a task, in this order." />
      <Arrangement title="Under “More options”" menu={menu} ids={menu.more} onChange={apply}
        note="Still one tap away — just not in the way." />

      <div style={{ background: 'white', border: '1px solid var(--border)', borderRadius: 12, padding: '14px 16px' }}>
        <div style={{ fontSize: 12.5, color: 'var(--muted)', lineHeight: 1.55, marginBottom: isDefault ? 0 : 12 }}>
          {isDefault
            ? 'You’re on the automatic default — Bloom’s standard task menu, with Labels first so a record label can reshape the sheet around it.'
            : 'This is your own arrangement. Reset any time to go back to Bloom’s standard task menu.'}
        </div>
        {!isDefault && (
          <button onClick={() => setMenu(resetTaskMenu())}
            style={{ fontSize: 13, padding: '9px 18px', borderRadius: 10, border: '1px solid var(--border)', background: 'white', color: 'var(--teal)', cursor: 'pointer', fontFamily: 'DM Sans,sans-serif', fontWeight: 700 }}>
            Reset to the default menu
          </button>
        )}
      </div>
    </div>
  )
}
