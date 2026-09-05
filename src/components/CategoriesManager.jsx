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
//
// The list is also the label chain in order: drag a row by its grip (or focus
// the grip and press the arrow keys) to move a label up or down. The ones you
// use most then sit first everywhere labels are offered — here, and on the row
// of chips on every task sheet.
import { useState } from 'react'
import { IconPicker, Icon } from './IconPicker.jsx'
import ColorSwatchRow from './ColorSwatchRow.jsx'
import { Glyph } from '../lib/glyphs.jsx'
import { nextSortOrder, reorderLabels, canReorderLabels } from '../lib/labelOrder.js'
import { useDragReorder } from '../lib/reorder.js'

function slugify(label) {
  return label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 24)
}

// The grip you drag a label by. Deliberately quiet — it's only a handle.
function Grip({ label, dragging, ...rest }) {
  return (
    <button type="button" aria-label={`Reorder ${label}`} title="Drag to reorder — or use the arrow keys"
      {...rest}
      style={{ ...rest.style, border: 'none', background: 'none', padding: '0 2px', flexShrink: 0, fontSize: 14, lineHeight: 1, color: dragging ? 'var(--teal)' : '#C3C9D2', touchAction: 'none' }}>
      ⠿
    </button>
  )
}

export default function CategoriesManager({
  categories, addCategory, updateCategory, deleteCategory, reorderCategories = null,
  labelMeta = {}, updateLabelMeta = () => {}, trackerFolders = [],
  compact = false,
}) {
  const [newLabel, setNewLabel] = useState('')
  const [newColor, setNewColor] = useState('#4A9EB5')
  const [newIcon,  setNewIcon]  = useState('')
  const [confirmDelete, setConfirmDelete] = useState(null)
  const [colorOpen, setColorOpen] = useState(null)   // label id whose color row is expanded

  const existingIds = new Set((categories || []).map(c => c.id))

  // ── The chain, in the order you put it in ─────────────────────
  // Reordering is a real save (it renumbers the label rows), so the list is
  // only draggable where that save is available — as a prop here, or through
  // the register App fills in.
  const commitOrder = reorderCategories || (canReorderLabels() ? reorderLabels : null)
  const catIds = (categories || []).map(c => c.id)
  const drag = useDragReorder({
    ids: catIds,
    onReorder: next => commitOrder && commitOrder(next),
    disabled: !commitOrder || catIds.length < 2,
  })
  const byId = new Map((categories || []).map(c => [c.id, c]))
  const rows = drag.order.map(id => byId.get(id)).filter(Boolean)

  const handleAdd = async () => {
    const label = newLabel.trim()
    if (!label) return
    let id = slugify(label) || 'cat'
    if (existingIds.has(id)) id = `${id}-${Date.now().toString().slice(-4)}`
    await addCategory({ id, label, color: newColor, icon: newIcon, sortOrder: nextSortOrder(categories || []) })
    setNewLabel(''); setNewIcon('')
  }
  const removeLabel = (id) => {
    deleteCategory(id)
    updateLabelMeta(id, null)   // drop its folder links + fields too
    setConfirmDelete(null)
  }

  return (
    <div>
      {!compact && <>
        <div className="page-title">Labels</div>
        <div className="page-sub">Your own tags for tasks and commitments. Give each an emoji or uploaded image. To have a label keep books, open that folder on the Records page and pick it there.</div>
      </>}

      {!drag.disabled && (
        <div style={{ fontSize: 11.5, color: 'var(--muted)', lineHeight: 1.5, marginBottom: 10 }}>
          Drag a label by its <span style={{ color: '#C3C9D2' }}>⠿</span> handle to move it up or down — the order here is the order you'll see everywhere labels are offered, so put the ones you use most at the top.
        </div>
      )}

      {/* Existing labels */}
      <div style={{ marginBottom: 18 }}>
        {rows.map(cat => {
          const meta = labelMeta[cat.id] || { folders: [], fields: [] }
          const links = meta.folders || []
          const linkCount = links.length
          const fieldCount = (meta.fields || []).length
          const folderNames = links.map(l => (trackerFolders.find(f => f.id === l.folderId) || {}).name).filter(Boolean)
          const lifted = drag.dragId === cat.id
          return (
            <div key={cat.id} {...drag.measureProps(cat.id)}
              style={{ background: 'white', border: `1px solid ${lifted ? 'var(--teal)' : 'var(--border)'}`, borderRadius: 11, padding: '9px 12px', marginBottom: 7,
                boxShadow: lifted ? '0 6px 18px rgba(26,58,78,.16)' : 'none', opacity: drag.dragging && !lifted ? .75 : 1, transition: 'box-shadow .12s ease, opacity .12s ease' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                {!drag.disabled && <Grip label={cat.label} dragging={lifted} {...drag.handleProps(cat.id)} />}
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
              {/* Where this label keeps books — read-only here on purpose. It's
                  chosen inside the folder itself (Records → the folder →
                  Labels), next to the records it actually keeps. */}
              {linkCount > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, paddingTop: 7, borderTop: '1px solid #F1EDF2' }}>
                  <span style={{ color: 'var(--teal)', display: 'inline-flex', flexShrink: 0 }}><Glyph id="book" size={15} color="currentColor" /></span>
                  <span style={{ flex: 1, minWidth: 0, fontSize: 12, color: 'var(--text)' }}>
                    Records into {folderNames.join(', ')}{fieldCount ? ` · asks for ${fieldCount} thing${fieldCount > 1 ? 's' : ''}` : ''}
                  </span>
                </div>
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
