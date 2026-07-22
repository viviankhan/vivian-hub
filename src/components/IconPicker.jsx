// src/components/IconPicker.jsx
// Shared icon system used across the whole app. An "icon" value is either a
// unicode emoji ("💧") or an image data URI / URL. Set an emoji or upload an
// image (transparent PNGs stay transparent, Discord-style) once on a category
// or routine item, and it renders anywhere that item appears via <Icon />.
import { useState, useRef, useEffect } from 'react'

const QUICK_EMOJIS = ['☀️','🌙','💧','☕','🏃‍♀️','🧘','📚','📝','💊','🪥','🛁','🍽️','📵','🎹','💤','✨','🔬','💼','🎯','❤️','⭐','🔥','📌','🎨']

export function isImageIcon(v) {
  return typeof v === 'string' && (v.startsWith('data:image') || v.startsWith('http'))
}

// Render an icon value: an <img> for uploaded images, else the emoji text.
export function Icon({ value, size = 18, style }) {
  if (!value) return null
  if (isImageIcon(value)) {
    return <img src={value} alt="" style={{ width:size, height:size, objectFit:'contain', verticalAlign:'middle', display:'inline-block', ...style }} />
  }
  return <span style={{ fontSize:size, lineHeight:1, ...style }}>{value}</span>
}

// Resize/compress an uploaded image to a small PNG data URI (keeps alpha).
export function fileToIconDataUri(file, maxSize = 96) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('read failed'))
    reader.onload = () => {
      const img = new Image()
      img.onerror = () => reject(new Error('decode failed'))
      img.onload = () => {
        const scale = Math.min(maxSize / img.width, maxSize / img.height, 1)
        const w = Math.max(1, Math.round(img.width * scale))
        const h = Math.max(1, Math.round(img.height * scale))
        const canvas = document.createElement('canvas')
        canvas.width = w; canvas.height = h
        canvas.getContext('2d').drawImage(img, 0, 0, w, h)
        resolve(canvas.toDataURL('image/png'))
      }
      img.src = reader.result
    }
    reader.readAsDataURL(file)
  })
}

export function useOutsideClose(open, setOpen) {
  const ref = useRef(null)
  useEffect(() => {
    if (!open) return
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open, setOpen])
  return ref
}

// A button that opens a popover to pick an emoji, type one, or upload an image.
export function IconPicker({ value, onChange, allowClear = false, size = 36 }) {
  const [open, setOpen] = useState(false)
  const [err, setErr] = useState('')
  const ref = useOutsideClose(open, setOpen)
  const fileRef = useRef(null)

  const onFile = async (e) => {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    if (!f.type.startsWith('image/')) { setErr('Please pick an image file.'); return }
    if (f.size > 2 * 1024 * 1024) { setErr('Image too large (max 2 MB).'); return }
    try { const uri = await fileToIconDataUri(f); onChange(uri); setErr(''); setOpen(false) }
    catch { setErr('Could not read that image.') }
  }

  return (
    <div ref={ref} style={{ position:'relative', flexShrink:0 }}>
      <button onClick={() => setOpen(o => !o)} title="Icon"
        style={{ width:size, height:size, borderRadius:8, border:'1px solid var(--border)', background:'white', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', padding:0 }}>
        {value ? <Icon value={value} size={Math.round(size*0.6)} /> : <span style={{ fontSize:16, color:'var(--muted)' }}>＋</span>}
      </button>
      {open && (
        <div style={{ position:'absolute', top:'112%', left:0, background:'white', border:'1px solid var(--border)', borderRadius:10, padding:10, boxShadow:'0 8px 24px rgba(0,0,0,.14)', zIndex:70, width:224 }}>
          <div style={{ fontSize:10, color:'var(--muted)', marginBottom:6 }}>Pick an emoji, type one, or upload an image.</div>
          <div style={{ display:'flex', flexWrap:'wrap', gap:4, marginBottom:8 }}>
            {QUICK_EMOJIS.map(e => (
              <button key={e} onClick={() => { onChange(e); setOpen(false) }}
                style={{ fontSize:18, background:'none', border:'none', cursor:'pointer', padding:3, borderRadius:4 }}>{e}</button>
            ))}
          </div>
          <input value={isImageIcon(value) ? '' : (value || '')} onChange={e => onChange(e.target.value)}
            maxLength={8} placeholder={isImageIcon(value) ? 'Image uploaded' : 'Type / paste emoji'}
            style={{ width:'100%', fontSize:14, padding:'6px 8px', borderRadius:8, border:'1px solid var(--border)', boxSizing:'border-box', marginBottom:8, fontFamily:'DM Sans,sans-serif', color:'var(--text)' }} />
          <button onClick={() => fileRef.current?.click()}
            style={{ width:'100%', fontSize:12, padding:'8px', borderRadius:8, border:'1px solid var(--border)', background:'var(--cream)', color:'var(--text)', cursor:'pointer', fontFamily:'DM Sans,sans-serif', fontWeight:600 }}>
            ⬆ Upload image
          </button>
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={onFile} />
          {err && <div style={{ fontSize:11, color:'#EF4444', marginTop:6 }}>{err}</div>}
          {allowClear && value && (
            <button onClick={() => { onChange(''); setOpen(false) }}
              style={{ width:'100%', marginTop:6, fontSize:11, background:'none', border:'none', color:'var(--muted)', cursor:'pointer', textDecoration:'underline' }}>
              Remove icon
            </button>
          )}
        </div>
      )}
    </div>
  )
}
