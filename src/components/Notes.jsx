// src/components/Notes.jsx
import { useCallback } from 'react'

export default function Notes({ notes, updateNotes }) {
  const onChange = useCallback((e) => updateNotes(e.target.value), [updateNotes])
  return (
    <div>
      <div className="page-title">Notes</div>
      <div className="page-sub">Tasks, critiques, setbacks — saved automatically · included in every Claude session</div>
      <div style={{ background:'#FEF9E7', border:'1px solid #F59E0B', borderRadius:12, padding:'10px 14px', marginBottom:14, fontSize:12, color:'#92400E' }}>
        Anything you write here is read by Claude at the start of each session. Use it to flag issues, requests, or schedule changes.
      </div>
      <textarea value={notes} onChange={onChange} placeholder="Write anything — schedule critiques, tasks that came up, things that didn't work..." />
      <div style={{ fontSize:11, color:'var(--muted)', marginTop:6 }}>Saved automatically as you type.</div>
    </div>
  )
}
