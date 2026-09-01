// src/components/ArtStudio.jsx
// ─────────────────────────────────────────────────────────────
// Owner-only art uploader. Every illustrated element in the game (alien
// specimens, cabin furniture) is drawn from code by default; here the owner can
// upload their own hand-drawn image for any of them. An upload is downscaled to
// a compact PNG (transparency preserved), stashed in the synced art_overrides
// blob, and swapped in live everywhere that asset is drawn — no code change, no
// reload. Reset drops the override and the code art returns.
//
// Gated to admin in App.jsx (see lib/art.js isAdmin). Built so the same
// rendering path can later serve a broader, curated art set.
// ─────────────────────────────────────────────────────────────
import { useRef, useState } from 'react'
import { PLANETS, FURNITURE } from '../lib/space.js'
import { Specimen, FurnArt } from '../lib/spaceart.jsx'
import { setOverride, clearOverride, getOverrides, useOverride, fileToDataUrl } from '../lib/art.js'

// The full catalogue of uploadable assets, grouped for the browser. Each entry:
// { id: asset key, name, preview: <node drawn with that asset id> }.
const CREATURES = PLANETS.flatMap(p =>
  p.specimens.map(s => ({
    id: `creature:${s.id}`,
    name: s.name,
    sub: p.name,
    preview: (size) => <Specimen form={s.form} color={s.color} size={size} alive assetId={`creature:${s.id}`} />,
  })),
)
const PROPS = FURNITURE.map(f => ({
  id: `furniture:${f.id}`,
  name: f.name,
  sub: f.group,
  preview: (size) => <FurnArt item={f} size={size} assetId={`furniture:${f.id}`} />,
}))

function AssetCard({ asset, onUpload, onReset, busy }) {
  const override = useOverride(asset.id)
  const inputRef = useRef(null)
  return (
    <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:6, padding:'10px 8px',
      border:'1px solid var(--border)', borderRadius:14, background:'white', position:'relative' }}>
      {override && (
        <span title="Custom art" style={{ position:'absolute', top:6, right:6, fontSize:9, fontWeight:700,
          color:'var(--teal)', background:'var(--green-light)', borderRadius:999, padding:'2px 7px' }}>custom</span>
      )}
      <div style={{ width:76, height:76, display:'grid', placeItems:'center' }}>
        {asset.preview(72)}
      </div>
      <div style={{ fontSize:12, fontWeight:600, color:'var(--forest)', textAlign:'center', lineHeight:1.15 }}>{asset.name}</div>
      <div style={{ fontSize:10, color:'var(--muted)' }}>{asset.sub}</div>
      <div style={{ display:'flex', gap:6, marginTop:2 }}>
        <button disabled={busy} onClick={() => inputRef.current?.click()}
          style={{ border:'none', cursor: busy ? 'default' : 'pointer', borderRadius:999, padding:'5px 12px',
            fontSize:11, fontWeight:700, background:'var(--forest)', color:'var(--green-light)', opacity: busy ? .6 : 1,
            fontFamily:'DM Sans,sans-serif' }}>
          {override ? 'Replace' : 'Upload'}
        </button>
        {override && (
          <button disabled={busy} onClick={() => onReset(asset.id)}
            style={{ border:'1px solid var(--border)', cursor:'pointer', borderRadius:999, padding:'5px 12px',
              fontSize:11, fontWeight:700, background:'white', color:'var(--muted)', fontFamily:'DM Sans,sans-serif' }}>
            Reset
          </button>
        )}
      </div>
      <input ref={inputRef} type="file" accept="image/*" style={{ display:'none' }}
        onChange={(e) => { const f = e.target.files?.[0]; if (f) onUpload(asset.id, f); e.target.value = '' }} />
    </div>
  )
}

export default function ArtStudio({ persistArt }) {
  const [group, setGroup] = useState('creatures')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const upload = async (id, file) => {
    setError(''); setBusy(true)
    try {
      const dataUrl = await fileToDataUrl(file, 512)
      setOverride(id, dataUrl)
      persistArt(getOverrides())
    } catch (e) {
      setError('Could not read that image — try a PNG or JPG.')
      console.warn('[Bloom] art upload failed:', e)
    } finally { setBusy(false) }
  }
  const reset = (id) => {
    clearOverride(id)
    persistArt(getOverrides())
  }

  const list = group === 'creatures' ? CREATURES : PROPS

  return (
    <div>
      <h3 className="serif" style={{ margin:'0 0 4px', color:'var(--forest)', fontSize:20 }}>Art Studio</h3>
      <p style={{ margin:'0 0 14px', fontSize:13, color:'var(--muted)', lineHeight:1.45 }}>
        Upload your own drawings to replace the built-in art. Transparent PNGs look best.
        Images are downscaled and synced across your devices; Reset brings the default back.
      </p>

      <div style={{ display:'flex', gap:8, marginBottom:14 }}>
        {[['creatures', `Creatures (${CREATURES.length})`], ['props', `Furniture (${PROPS.length})`]].map(([id, label]) => (
          <button key={id} onClick={() => setGroup(id)}
            style={{ border:'none', cursor:'pointer', borderRadius:999, padding:'7px 16px', fontSize:13, fontWeight:700,
              background: group === id ? 'var(--forest)' : 'var(--green-light)',
              color: group === id ? 'var(--green-light)' : 'var(--teal)', fontFamily:'DM Sans,sans-serif' }}>
            {label}
          </button>
        ))}
      </div>

      {error && <div style={{ marginBottom:12, fontSize:12, color:'#B4453A', fontWeight:600 }}>{error}</div>}

      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(118px, 1fr))', gap:10 }}>
        {list.map(a => <AssetCard key={a.id} asset={a} onUpload={upload} onReset={reset} busy={busy} />)}
      </div>
    </div>
  )
}
