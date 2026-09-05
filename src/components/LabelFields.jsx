// src/components/LabelFields.jsx
// The editor for what a record label asks for on a task.
//
// A record label can carry its own fields — an amount, hours, miles, who, a
// photo of the bill, anything. Whatever is listed here is what the add-task
// sheet grows when that label is picked, and each field knows where its value
// lands on the folder's record, so a tagged task is written up properly the
// moment it's made.
//
// It lives in its own file because it's edited from inside a record folder
// (Records → the folder → Labels), which is where linking a label to a folder
// belongs — right next to the books it keeps.
import { FIELD_TYPES, fieldType, makeField } from '../lib/labels.js'
import { useState } from 'react'

const smallInput = { fontSize: 12.5, padding: '7px 10px', borderRadius: 8, border: '1px solid var(--border)', fontFamily: 'DM Sans,sans-serif', color: 'var(--text)', background: 'white', boxSizing: 'border-box' }

export default function LabelFields({ fields = [], onChange, accent = 'var(--forest)' }) {
  const [newType, setNewType] = useState('money')
  const [newName, setNewName] = useState('')

  const addField = () => {
    const t = fieldType(newType)
    onChange([...fields, makeField(t.id, newName.trim() || t.name)])
    setNewName('')
  }
  const editField = (id, ch) => onChange(fields.map(f => f.id === id ? { ...f, ...ch } : f))
  const removeField = (id) => onChange(fields.filter(f => f.id !== id))
  const moveField = (id, dir) => {
    const i = fields.findIndex(f => f.id === id), j = i + dir
    if (i < 0 || j < 0 || j >= fields.length) return
    const next = [...fields]
    ;[next[i], next[j]] = [next[j], next[i]]
    onChange(next)
  }

  return (
    <>
      {fields.length === 0 && (
        <div style={{ fontSize: 11.5, color: 'var(--muted)', lineHeight: 1.5, marginBottom: 9 }}>
          Nothing extra yet — a tagged task still records its date, its name and how long it was scheduled for. Add fields to capture the rest as you go.
        </div>
      )}
      {fields.map((f, i) => {
        const t = fieldType(f.type)
        return (
          <div key={f.id} style={{ background: '#FAFAFC', border: '1px solid var(--border)', borderRadius: 10, padding: '9px 10px', marginBottom: 7 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
              <input value={f.name} onChange={e => editField(f.id, { name: e.target.value })}
                style={{ ...smallInput, flex: 1, minWidth: 110 }} placeholder={t.name} />
              <select value={f.type} onChange={e => editField(f.id, { type: e.target.value, name: f.name || fieldType(e.target.value).name })}
                style={{ ...smallInput, width: 150, flexShrink: 0 }}>
                {FIELD_TYPES.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
              </select>
              <span style={{ display: 'inline-flex', flexDirection: 'column', flexShrink: 0, lineHeight: 0 }}>
                <button onClick={() => moveField(f.id, -1)} disabled={i === 0} aria-label={`Move ${f.name} up`}
                  style={{ background: 'none', border: 'none', cursor: i === 0 ? 'default' : 'pointer', color: i === 0 ? '#E2E4E9' : '#AEB6C0', fontSize: 10, padding: '0 3px', lineHeight: 1 }}>▲</button>
                <button onClick={() => moveField(f.id, 1)} disabled={i === fields.length - 1} aria-label={`Move ${f.name} down`}
                  style={{ background: 'none', border: 'none', cursor: i === fields.length - 1 ? 'default' : 'pointer', color: i === fields.length - 1 ? '#E2E4E9' : '#AEB6C0', fontSize: 10, padding: '0 3px', lineHeight: 1 }}>▼</button>
              </span>
              <button onClick={() => removeField(f.id)} aria-label={`Remove ${f.name}`}
                style={{ background: 'none', border: 'none', color: '#CBD0D8', fontSize: 15, cursor: 'pointer', padding: '0 2px', flexShrink: 0 }}>✕</button>
            </div>
            {f.type === 'choice' && (
              <input value={(f.options || []).join(', ')} onChange={e => editField(f.id, { options: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })}
                placeholder="Options, comma separated — e.g. Cash, Card, Transfer"
                style={{ ...smallInput, width: '100%', marginTop: 7 }} />
            )}
            <div style={{ fontSize: 10.5, color: 'var(--muted)', marginTop: 6 }}>{t.hint}</div>
          </div>
        )
      })}
      <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', alignItems: 'center', marginTop: 4 }}>
        <select value={newType} onChange={e => setNewType(e.target.value)} style={{ ...smallInput, width: 160 }}>
          {FIELD_TYPES.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
        </select>
        <input value={newName} onChange={e => setNewName(e.target.value)} placeholder={`Name (default “${fieldType(newType).name}”)`}
          onKeyDown={e => { if (e.key === 'Enter') addField() }}
          style={{ ...smallInput, flex: 1, minWidth: 130 }} />
        <button onClick={addField}
          style={{ fontSize: 12, padding: '8px 14px', borderRadius: 9, border: 'none', background: accent, color: 'white', cursor: 'pointer', fontFamily: 'DM Sans,sans-serif', fontWeight: 700 }}>+ Add field</button>
      </div>
    </>
  )
}
