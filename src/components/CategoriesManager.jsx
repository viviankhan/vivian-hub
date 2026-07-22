// src/components/CategoriesManager.jsx
// Add / rename / recolor / delete the shared task categories used by both
// Commitments and Recurring tasks. Lives in Settings → Categories.
import { useState } from 'react'

const PRESET_COLORS = [
  '#059669','#7C3AED','#4A9EB5','#C4728E','#D97706','#7A8EC4',
  '#E07B2E','#3B82F6','#A855F7','#9A7CC4','#EF4444','#52B788','#8899AA',
]

function slugify(label) {
  return label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 24)
}

export default function CategoriesManager({ categories, addCategory, updateCategory, deleteCategory }) {
  const [newLabel, setNewLabel] = useState('')
  const [newColor, setNewColor] = useState(PRESET_COLORS[0])
  const [confirmDelete, setConfirmDelete] = useState(null)

  const existingIds = new Set((categories || []).map(c => c.id))

  const handleAdd = async () => {
    const label = newLabel.trim()
    if (!label) return
    let id = slugify(label) || 'cat'
    if (existingIds.has(id)) id = `${id}-${Date.now().toString().slice(-4)}`
    const sortOrder = (categories || []).reduce((m, c) => Math.max(m, c.sortOrder ?? 0), 0) + 1
    await addCategory({ id, label, color: newColor, sortOrder })
    setNewLabel('')
  }

  return (
    <div>
      <div className="page-title">Categories</div>
      <div className="page-sub">Your own labels for tasks and commitments — used everywhere you pick a category.</div>

      {/* Existing categories */}
      <div style={{ marginBottom:18 }}>
        {(categories || []).map(cat => (
          <div key={cat.id} style={{ display:'flex', alignItems:'center', gap:10, background:'white', border:'1px solid var(--border)', borderRadius:11, padding:'9px 12px', marginBottom:7 }}>
            <input type="color" value={cat.color}
              onChange={e => updateCategory(cat.id, { color: e.target.value })}
              title="Change color"
              style={{ width:28, height:28, border:'none', borderRadius:6, cursor:'pointer', padding:0, background:'none', flexShrink:0 }} />
            <input value={cat.label}
              onChange={e => updateCategory(cat.id, { label: e.target.value })}
              style={{ flex:1, fontSize:13, padding:'6px 10px', borderRadius:8, border:'1px solid var(--border)', fontFamily:'DM Sans,sans-serif', color:'var(--text)', background:'white' }} />
            <span style={{ fontSize:9, letterSpacing:1, textTransform:'uppercase', padding:'3px 8px', borderRadius:10, background:`${cat.color}20`, color:cat.color, fontWeight:700, flexShrink:0 }}>{cat.label}</span>
            {confirmDelete === cat.id ? (
              <div style={{ display:'flex', gap:4, flexShrink:0 }}>
                <button onClick={() => { deleteCategory(cat.id); setConfirmDelete(null) }}
                  style={{ fontSize:11, padding:'6px 10px', borderRadius:8, border:'none', background:'#EF4444', color:'white', cursor:'pointer', fontFamily:'DM Sans,sans-serif', fontWeight:600 }}>Delete</button>
                <button onClick={() => setConfirmDelete(null)}
                  style={{ fontSize:11, padding:'6px 10px', borderRadius:8, border:'1px solid var(--border)', background:'white', color:'var(--muted)', cursor:'pointer', fontFamily:'DM Sans,sans-serif' }}>Cancel</button>
              </div>
            ) : (
              <button onClick={() => setConfirmDelete(cat.id)}
                style={{ background:'none', border:'none', cursor:'pointer', color:'#D1D5DB', fontSize:16, padding:'0 2px', flexShrink:0 }}
                title="Delete category">✕</button>
            )}
          </div>
        ))}
        {(categories || []).length === 0 && (
          <div style={{ fontSize:12, color:'var(--muted)', padding:'8px 0' }}>No categories yet — add one below.</div>
        )}
      </div>

      {/* Add new */}
      <div style={{ background:'white', border:'1px solid var(--border)', borderRadius:12, padding:'14px 16px' }}>
        <div style={{ fontSize:10, color:'var(--muted)', letterSpacing:1.5, textTransform:'uppercase', marginBottom:10, fontWeight:600 }}>New category</div>
        <div style={{ display:'flex', gap:8, alignItems:'center', marginBottom:10 }}>
          <input type="color" value={newColor} onChange={e => setNewColor(e.target.value)}
            style={{ width:32, height:32, border:'none', borderRadius:6, cursor:'pointer', padding:0, background:'none', flexShrink:0 }} />
          <input value={newLabel} onChange={e => setNewLabel(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleAdd() }}
            placeholder="e.g. Work, Study, Errand…"
            style={{ flex:1, fontSize:13, padding:'8px 12px', borderRadius:8, border:'1px solid var(--border)', fontFamily:'DM Sans,sans-serif', color:'var(--text)', background:'white' }} />
        </div>
        <div style={{ display:'flex', gap:5, flexWrap:'wrap', marginBottom:12 }}>
          {PRESET_COLORS.map(c => (
            <button key={c} onClick={() => setNewColor(c)}
              style={{ width:22, height:22, borderRadius:6, background:c, cursor:'pointer',
                border: newColor===c ? '2px solid var(--text)' : '2px solid transparent' }}
              title={c} />
          ))}
        </div>
        <button onClick={handleAdd} disabled={!newLabel.trim()}
          style={{ fontSize:13, padding:'9px 18px', borderRadius:10, border:'none', background:'var(--forest)', color:'var(--green-light)', cursor: newLabel.trim() ? 'pointer' : 'default', fontFamily:'DM Sans,sans-serif', fontWeight:600, opacity: newLabel.trim() ? 1 : .5 }}>
          + Add category
        </button>
      </div>
    </div>
  )
}
