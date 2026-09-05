// src/components/CategoriesManager.jsx
// Add / rename / recolor / delete the shared labels used by tasks, commitments
// and recurring tasks — and, for the ones you keep books on, link a label to a
// record folder and give it its own fields.
//
// Linking a label to a folder means every task you tag with it files itself
// into that folder's records. The fields you add here are what the add-task
// sheet asks for when the label is picked, so a task is written down the way
// your book-keeping needs it, once, at the moment you make it.
//
// Used in two places — Settings → Labels, and the top of the Task Menu — so
// labels can be added and deleted wherever you're already working.
import { useState } from 'react'
import { IconPicker, Icon } from './IconPicker.jsx'
import ColorSwatchRow from './ColorSwatchRow.jsx'
import { Glyph } from '../lib/glyphs.jsx'
import { FIELD_TYPES, fieldType, makeField } from '../lib/labels.js'
import { incomeCategories, expenseCategories } from '../lib/trackers.js'

function slugify(label) {
  return label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 24)
}

const chip = (on, color) => ({
  fontSize: 11.5, padding: '5px 11px', borderRadius: 16, cursor: 'pointer', fontFamily: 'DM Sans,sans-serif',
  fontWeight: on ? 700 : 600, border: on ? 'none' : '1px solid var(--border)',
  background: on ? (color || 'var(--forest)') : 'white', color: on ? 'white' : 'var(--muted)',
})
const smallInput = { fontSize: 12.5, padding: '7px 10px', borderRadius: 8, border: '1px solid var(--border)', fontFamily: 'DM Sans,sans-serif', color: 'var(--text)', background: 'white', boxSizing: 'border-box' }
const sectionLabel = { fontSize: 10, color: 'var(--muted)', letterSpacing: 1, textTransform: 'uppercase', fontWeight: 700, marginBottom: 7 }

// ── The record panel for one label ──────────────────────────────
function RecordPanel({ cat, meta, folders, onMeta }) {
  const links = meta.folders || []
  const fields = meta.fields || []
  const [newType, setNewType] = useState('money')
  const [newName, setNewName] = useState('')

  const linkedTo = (id) => links.find(l => l.folderId === id)
  const toggleFolder = (folder) => {
    const on = linkedTo(folder.id)
    onMeta({ folders: on ? links.filter(l => l.folderId !== folder.id) : [...links, { folderId: folder.id, categoryId: '' }] })
  }
  const setLinkCategory = (folderId, categoryId) =>
    onMeta({ folders: links.map(l => l.folderId === folderId ? { ...l, categoryId } : l) })

  const addField = () => {
    const t = fieldType(newType)
    onMeta({ fields: [...fields, makeField(t.id, newName.trim() || t.name)] })
    setNewName('')
  }
  const editField = (id, ch) => onMeta({ fields: fields.map(f => f.id === id ? { ...f, ...ch } : f) })
  const removeField = (id) => onMeta({ fields: fields.filter(f => f.id !== id) })
  const moveField = (id, dir) => {
    const i = fields.findIndex(f => f.id === id), j = i + dir
    if (i < 0 || j < 0 || j >= fields.length) return
    const next = [...fields]
    ;[next[i], next[j]] = [next[j], next[i]]
    onMeta({ fields: next })
  }

  return (
    <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid #F1EDF2' }}>
      <div style={sectionLabel}>Files into these record folders</div>
      {folders.length === 0 ? (
        <div style={{ fontSize: 11.5, color: 'var(--muted)', lineHeight: 1.5 }}>
          No record folders yet. Create one on the Records page, then come back and link this label to it.
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {folders.map(f => {
            const on = !!linkedTo(f.id)
            return (
              <button key={f.id} onClick={() => toggleFolder(f)} style={{ ...chip(on, f.color), display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <Glyph id={f.icon || 'briefcase'} size={13} color="currentColor" />{on ? '✓ ' : ''}{f.name}
              </button>
            )
          })}
        </div>
      )}

      {/* Which of the folder's own income/expense categories these entries land in */}
      {links.map(l => {
        const folder = folders.find(f => f.id === l.folderId)
        if (!folder) return null
        const inc = incomeCategories(folder), exp = expenseCategories(folder)
        return (
          <div key={l.folderId} style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 9, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 11.5, color: 'var(--muted)', flexShrink: 0 }}>In <b style={{ color: 'var(--text)' }}>{folder.name}</b>, file as</span>
            <select value={l.categoryId || ''} onChange={e => setLinkCategory(l.folderId, e.target.value)} style={{ ...smallInput, minWidth: 150 }}>
              <option value="">— Uncategorized —</option>
              {inc.length > 0 && <optgroup label="Income">{inc.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</optgroup>}
              {exp.length > 0 && <optgroup label="Expense">{exp.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</optgroup>}
            </select>
          </div>
        )
      })}
      {links.length > 0 && (
        <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 8, lineHeight: 1.5 }}>
          Whether an amount counts as money in or out is decided by the category you pick here.
        </div>
      )}

      {/* Custom fields — what the add-task sheet asks for when this label is on */}
      <div style={{ ...sectionLabel, marginTop: 16 }}>What to ask for on the task</div>
      {fields.length === 0 && (
        <div style={{ fontSize: 11.5, color: 'var(--muted)', lineHeight: 1.5, marginBottom: 9 }}>
          None yet — a tagged task still records its date, title and scheduled length. Add fields to capture the rest as you go.
        </div>
      )}
      {fields.map((f, i) => {
        const t = fieldType(f.type)
        return (
          <div key={f.id} style={{ background: '#FAFAFC', border: '1px solid var(--border)', borderRadius: 10, padding: '9px 10px', marginBottom: 7 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <input value={f.name} onChange={e => editField(f.id, { name: e.target.value })}
                style={{ ...smallInput, flex: 1, minWidth: 90 }} placeholder={t.name} />
              <select value={f.type} onChange={e => editField(f.id, { type: e.target.value, name: f.name || fieldType(e.target.value).name })}
                style={{ ...smallInput, width: 145, flexShrink: 0 }}>
                {FIELD_TYPES.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
              </select>
              <span style={{ display: 'inline-flex', flexDirection: 'column', flexShrink: 0, lineHeight: 0 }}>
                <button onClick={() => moveField(f.id, -1)} disabled={i === 0} aria-label="Move field up"
                  style={{ background: 'none', border: 'none', cursor: i === 0 ? 'default' : 'pointer', color: i === 0 ? '#E2E4E9' : '#AEB6C0', fontSize: 10, padding: '0 3px', lineHeight: 1 }}>▲</button>
                <button onClick={() => moveField(f.id, 1)} disabled={i === fields.length - 1} aria-label="Move field down"
                  style={{ background: 'none', border: 'none', cursor: i === fields.length - 1 ? 'default' : 'pointer', color: i === fields.length - 1 ? '#E2E4E9' : '#AEB6C0', fontSize: 10, padding: '0 3px', lineHeight: 1 }}>▼</button>
              </span>
              <button onClick={() => removeField(f.id)} aria-label="Remove field"
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
          style={{ fontSize: 12, padding: '8px 14px', borderRadius: 9, border: 'none', background: 'var(--forest)', color: 'var(--green-light)', cursor: 'pointer', fontFamily: 'DM Sans,sans-serif', fontWeight: 700 }}>+ Add field</button>
      </div>
    </div>
  )
}

export default function CategoriesManager({
  categories, addCategory, updateCategory, deleteCategory,
  labelMeta = {}, updateLabelMeta = () => {}, trackerFolders = [],
  compact = false,
}) {
  const [newLabel, setNewLabel] = useState('')
  const [newColor, setNewColor] = useState('#4A9EB5')
  const [newIcon,  setNewIcon]  = useState('')
  const [confirmDelete, setConfirmDelete] = useState(null)
  const [colorOpen, setColorOpen] = useState(null)   // label id whose color row is expanded
  const [recordOpen, setRecordOpen] = useState(null) // label id whose record panel is expanded

  const existingIds = new Set((categories || []).map(c => c.id))

  const handleAdd = async () => {
    const label = newLabel.trim()
    if (!label) return
    let id = slugify(label) || 'cat'
    if (existingIds.has(id)) id = `${id}-${Date.now().toString().slice(-4)}`
    const sortOrder = (categories || []).reduce((m, c) => Math.max(m, c.sortOrder ?? 0), 0) + 1
    await addCategory({ id, label, color: newColor, icon: newIcon, sortOrder })
    setNewLabel(''); setNewIcon('')
  }
  const removeLabel = (id) => {
    deleteCategory(id)
    updateLabelMeta(id, null)   // drop its folder links + fields too
    setConfirmDelete(null)
    if (recordOpen === id) setRecordOpen(null)
  }

  return (
    <div>
      {!compact && <>
        <div className="page-title">Labels</div>
        <div className="page-sub">Your own tags for tasks and commitments. Give each an emoji or uploaded image — and link the ones you keep books on to a record folder, so a tagged task writes itself into your records.</div>
      </>}

      {/* Existing labels */}
      <div style={{ marginBottom: 18 }}>
        {(categories || []).map(cat => {
          const meta = labelMeta[cat.id] || { folders: [], fields: [] }
          const linkCount = (meta.folders || []).length
          const fieldCount = (meta.fields || []).length
          const open = recordOpen === cat.id
          return (
            <div key={cat.id} style={{ background: 'white', border: '1px solid var(--border)', borderRadius: 11, padding: '9px 12px', marginBottom: 7 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <IconPicker value={cat.icon} onChange={v => updateCategory(cat.id, { icon: v })} allowClear size={32} />
                <button onClick={() => setColorOpen(o => o === cat.id ? null : cat.id)} title="Change color"
                  style={{ width: 28, height: 28, borderRadius: 8, border: colorOpen === cat.id ? '2px solid var(--text)' : '1px solid rgba(0,0,0,.12)', background: cat.color, cursor: 'pointer', padding: 0, flexShrink: 0 }} />
                <input value={cat.label}
                  onChange={e => updateCategory(cat.id, { label: e.target.value })}
                  style={{ flex: 1, minWidth: 80, fontSize: 13, padding: '6px 10px', borderRadius: 8, border: '1px solid var(--border)', fontFamily: 'DM Sans,sans-serif', color: 'var(--text)', background: 'white' }} />
                {confirmDelete === cat.id ? (
                  <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                    <button onClick={() => removeLabel(cat.id)}
                      style={{ fontSize: 11, padding: '6px 10px', borderRadius: 8, border: 'none', background: '#EF4444', color: 'white', cursor: 'pointer', fontFamily: 'DM Sans,sans-serif', fontWeight: 600 }}>Delete</button>
                    <button onClick={() => setConfirmDelete(null)}
                      style={{ fontSize: 11, padding: '6px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'white', color: 'var(--muted)', cursor: 'pointer', fontFamily: 'DM Sans,sans-serif' }}>Cancel</button>
                  </div>
                ) : (
                  <button onClick={() => setConfirmDelete(cat.id)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#D1D5DB', fontSize: 16, padding: '0 2px', flexShrink: 0 }}
                    title="Delete label">✕</button>
                )}
              </div>
              {colorOpen === cat.id && (
                <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid #F1EDF2' }}>
                  <ColorSwatchRow value={cat.color} onChange={v => updateCategory(cat.id, { color: v })} />
                </div>
              )}
              {/* Record-keeping row — folders this label files into + its fields */}
              <button onClick={() => setRecordOpen(o => o === cat.id ? null : cat.id)}
                style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', marginTop: 8, padding: '7px 0 0', border: 'none', borderTop: '1px solid #F1EDF2', background: 'none', cursor: 'pointer', fontFamily: 'DM Sans,sans-serif', textAlign: 'left' }}>
                <span style={{ color: linkCount ? 'var(--teal)' : '#B7BEC8', display: 'inline-flex', flexShrink: 0 }}><Glyph id="book" size={15} color="currentColor" /></span>
                <span style={{ flex: 1, minWidth: 0, fontSize: 12, color: linkCount ? 'var(--text)' : 'var(--muted)' }}>
                  {linkCount
                    ? `Records into ${linkCount} folder${linkCount > 1 ? 's' : ''}${fieldCount ? ` · ${fieldCount} field${fieldCount > 1 ? 's' : ''}` : ''}`
                    : 'Record keeping — not linked to a folder'}
                </span>
                <span style={{ fontSize: 11, color: 'var(--teal)', fontWeight: 700, flexShrink: 0 }}>{open ? 'Done' : 'Set up'}</span>
              </button>
              {open && (
                <RecordPanel cat={cat} meta={meta} folders={trackerFolders}
                  onMeta={ch => updateLabelMeta(cat.id, { ...meta, ...ch })} />
              )}
            </div>
          )
        })}
        {(categories || []).length === 0 && (
          <div style={{ fontSize: 12, color: 'var(--muted)', padding: '8px 0' }}>No labels yet — add one below.</div>
        )}
      </div>

      {/* Add new */}
      <div style={{ background: 'white', border: '1px solid var(--border)', borderRadius: 12, padding: '14px 16px' }}>
        <div style={{ fontSize: 10, color: 'var(--muted)', letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 10, fontWeight: 600 }}>New label</div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10 }}>
          <IconPicker value={newIcon} onChange={setNewIcon} allowClear size={32} />
          <span style={{ width: 28, height: 28, borderRadius: 8, background: newColor, flexShrink: 0, boxShadow: '0 0 0 1px rgba(0,0,0,.12)' }} />
          <input value={newLabel} onChange={e => setNewLabel(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleAdd() }}
            placeholder="e.g. Work, Study, Rental…"
            style={{ flex: 1, minWidth: 80, fontSize: 13, padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', fontFamily: 'DM Sans,sans-serif', color: 'var(--text)', background: 'white' }} />
        </div>
        <div style={{ marginBottom: 12 }}>
          <ColorSwatchRow value={newColor} onChange={setNewColor} />
        </div>
        <button onClick={handleAdd} disabled={!newLabel.trim()}
          style={{ fontSize: 13, padding: '9px 18px', borderRadius: 10, border: 'none', background: 'var(--forest)', color: 'var(--green-light)', cursor: newLabel.trim() ? 'pointer' : 'default', fontFamily: 'DM Sans,sans-serif', fontWeight: 600, opacity: newLabel.trim() ? 1 : .5 }}>
          + Add label
        </button>
      </div>
    </div>
  )
}
