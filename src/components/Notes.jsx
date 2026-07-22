// src/components/Notes.jsx
// Freeform notes — moved out of the old Log tab (which also had Stats and
// History sub-views) into Settings, since Log itself has been removed.
export default function Notes({ notes, updateNotes }) {
  return (
    <div>
      <div className="page-title">Notes</div>
      <div className="page-sub">Freeform notes — anything on your mind, ideas, reflections.</div>
      <textarea value={notes || ''} onChange={e => updateNotes(e.target.value)}
        placeholder="Start writing…"
        style={{ width:'100%', minHeight:320, fontSize:13, padding:'14px 16px', borderRadius:12, border:'1px solid var(--border)', fontFamily:'DM Sans,sans-serif', outline:'none', lineHeight:1.7, resize:'vertical', color:'var(--text)', background:'white', boxSizing:'border-box' }} />
    </div>
  )
}
