// src/components/Info.jsx
// Fully editable "About" page — no hardcoded personal content. Every
// section starts empty and is filled in / edited from the UI, persisted
// to the cloud the same way Routines and Recurring Tasks are.
import { useState, useEffect } from 'react'
import { getInfo, setInfo } from '../lib/storage.js'

const EMPTY_INFO = {
  profile:      [], // [{key, value}]
  thesis:       { title:'', advisor:'', status:'' },
  classes:      [], // [{code,name,time,room,instructor,email,office,note}]
  applications: [], // [{text}]
  contacts:     [], // [{name,detail}]
  trips:        [], // [{label,depart,return,note}]
  logistics:    [], // [{text}]
  labProtocols: [], // [{text}]
  schedRules:   [], // [{text}]
}

function reportError(e) {
  console.error(e)
  alert(`⚠️ ${e.message || e}\n\nThis change was NOT saved to the cloud and may revert. Check your connection and try again.`)
}

const inputStyle = { fontSize:12, padding:'7px 10px', marginBottom:0 }
const pillBtn = (bg, color, border) => ({ fontSize:11, padding:'5px 12px', borderRadius:20, border, background:bg, color, cursor:'pointer', fontFamily:'DM Sans,sans-serif', fontWeight:600 })

function Row({ k, v }) {
  return (
    <div className="info-row">
      <div className="info-key">{k}</div>
      <div className="info-val">{v}</div>
    </div>
  )
}

// ── Card chrome shared by every section — Edit / Save / Cancel ───
function Card({ title, editing, saving, onEdit, onSave, onCancel, children }) {
  return (
    <div className="info-section" style={{ marginBottom:14 }}>
      <div className="card-header">
        <span className="card-header-title">{title}</span>
        <div style={{ display:'flex', gap:6 }}>
          {!editing ? (
            <button onClick={onEdit} style={pillBtn('rgba(255,255,255,.1)', 'var(--green-light)', '1px solid rgba(255,255,255,.25)')}>✏️ Edit</button>
          ) : (
            <>
              <button onClick={onSave} disabled={saving} style={{ ...pillBtn('var(--teal)', 'white', 'none'), opacity:saving?.6:1, cursor:saving?'default':'pointer' }}>{saving?'Saving…':'Save'}</button>
              <button onClick={onCancel} disabled={saving} style={pillBtn('rgba(255,255,255,.1)', 'var(--green-light)', '1px solid rgba(255,255,255,.25)')}>Cancel</button>
            </>
          )}
        </div>
      </div>
      <div style={{ padding:'12px 18px' }}>{children}</div>
    </div>
  )
}

// ── Generic list-of-rows editor (used for classes, contacts, trips,
//    and every plain string list — the latter as single-field rows) ──
function ListSection({ title, value, fields, empty, onSave, renderView }) {
  const [editing, setEditing] = useState(false)
  const [local,   setLocal]   = useState(value)
  const [saving,  setSaving]  = useState(false)

  useEffect(() => { if (!editing) setLocal(value) }, [value, editing])

  const startEdit = () => { setLocal(value); setEditing(true) }
  const cancel    = () => { setLocal(value); setEditing(false) }
  const save = async () => {
    setSaving(true)
    try { await onSave(local); setEditing(false) }
    catch (e) { reportError(e) }
    finally { setSaving(false) }
  }
  const updateRow = (i, patch) => setLocal(prev => prev.map((r,j) => j===i ? { ...r, ...patch } : r))
  const deleteRow = (i) => setLocal(prev => prev.filter((_,j) => j!==i))
  const addRow    = () => setLocal(prev => [...prev, Object.fromEntries(fields.map(f => [f.key, '']))])

  return (
    <Card title={title} editing={editing} saving={saving} onEdit={startEdit} onSave={save} onCancel={cancel}>
      {editing ? (
        <>
          {local.map((row, i) => (
            <div key={i} style={{ display:'flex', flexWrap:'wrap', gap:6, alignItems:'center', padding:'8px 0', borderBottom:'1px solid var(--border)', marginBottom:6 }}>
              {fields.map(f => (
                <input key={f.key} value={row[f.key]||''} placeholder={f.label}
                  onChange={e => updateRow(i, { [f.key]: e.target.value })}
                  style={{ ...inputStyle, flex:f.flex||1, minWidth:f.minWidth||90 }} />
              ))}
              <button onClick={() => deleteRow(i)}
                style={{ fontSize:11, padding:'6px 10px', borderRadius:8, border:'1px solid #FECACA', background:'#FFF5F5', color:'#991B1B', cursor:'pointer' }}>✕</button>
            </div>
          ))}
          <button onClick={addRow}
            style={{ fontSize:11, padding:'7px 14px', borderRadius:20, border:'1px solid var(--border)', background:'white', color:'var(--teal)', cursor:'pointer', fontFamily:'DM Sans,sans-serif', marginTop:4 }}>
            + Add
          </button>
        </>
      ) : (
        value.length===0
          ? <div style={{ fontSize:12, color:'var(--muted)' }}>{empty}</div>
          : renderView(value)
      )}
    </Card>
  )
}

// ── Single fixed-shape object editor (used for Thesis) ────────────
function ObjectSection({ title, value, fields, onSave, renderView, isEmpty }) {
  const [editing, setEditing] = useState(false)
  const [local,   setLocal]   = useState(value)
  const [saving,  setSaving]  = useState(false)

  useEffect(() => { if (!editing) setLocal(value) }, [value, editing])

  const startEdit = () => { setLocal(value); setEditing(true) }
  const cancel    = () => { setLocal(value); setEditing(false) }
  const save = async () => {
    setSaving(true)
    try { await onSave(local); setEditing(false) }
    catch (e) { reportError(e) }
    finally { setSaving(false) }
  }

  return (
    <Card title={title} editing={editing} saving={saving} onEdit={startEdit} onSave={save} onCancel={cancel}>
      {editing ? fields.map(f => (
        <div key={f.key} style={{ marginBottom:10 }}>
          <div style={{ fontSize:10, color:'var(--muted)', letterSpacing:1, textTransform:'uppercase', marginBottom:4 }}>{f.label}</div>
          {f.textarea
            ? <textarea value={local[f.key]||''} onChange={e => setLocal(p => ({ ...p, [f.key]:e.target.value }))} style={{ ...inputStyle, minHeight:60, width:'100%', boxSizing:'border-box' }} />
            : <input value={local[f.key]||''} onChange={e => setLocal(p => ({ ...p, [f.key]:e.target.value }))} style={{ ...inputStyle, width:'100%', boxSizing:'border-box' }} />}
        </div>
      )) : (
        isEmpty(value) ? <div style={{ fontSize:12, color:'var(--muted)' }}>Nothing here yet — tap Edit to add it.</div> : renderView(value)
      )}
    </Card>
  )
}

export default function Info() {
  const [info, setInfoState] = useState(EMPTY_INFO)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getInfo().then(v => {
      setInfoState(v ? { ...EMPTY_INFO, ...v } : EMPTY_INFO)
      setLoading(false)
    })
  }, [])

  const saveSection = async (key, value) => {
    const next = { ...info, [key]: value }
    await setInfo(next)
    setInfoState(next)
  }

  if (loading) return <div style={{ padding:20, color:'var(--muted)', fontSize:13 }}>Loading…</div>

  return (
    <div>
      <div className="page-title">About You</div>
      <div className="page-sub">Tap ✏️ Edit on any section to fill it in — everything saves to the cloud</div>

      <ListSection title="Personal Profile" value={info.profile}
        fields={[{ key:'key', label:'Field (e.g. school)', flex:.8, minWidth:120 }, { key:'value', label:'Value', flex:1.6, minWidth:140 }]}
        empty="No profile fields yet — tap Edit to add name, school, year, goal, etc."
        onSave={v => saveSection('profile', v)}
        renderView={rows => rows.map((r,i) => <Row key={i} k={r.key} v={r.value} />)}
      />

      <ObjectSection title="Thesis / Research" value={info.thesis}
        fields={[{ key:'title', label:'Title', textarea:true }, { key:'advisor', label:'Advisor' }, { key:'status', label:'Status' }]}
        isEmpty={t => !t.title && !t.advisor && !t.status}
        onSave={v => saveSection('thesis', v)}
        renderView={t => (
          <>
            {t.title && <div style={{ fontFamily:'Cormorant Garamond, serif', fontSize:15, fontStyle:'italic', color:'var(--text)', marginBottom:8 }}>"{t.title}"</div>}
            {t.advisor && <Row k="Advisor" v={t.advisor} />}
            {t.status && <Row k="Status" v={t.status} />}
          </>
        )}
      />

      <ListSection title="Classes" value={info.classes}
        fields={[
          { key:'code', label:'Code', flex:.5, minWidth:80 },
          { key:'name', label:'Class name', flex:1.6, minWidth:140 },
          { key:'time', label:'Time', flex:1, minWidth:130 },
          { key:'room', label:'Room', flex:.8, minWidth:100 },
          { key:'instructor', label:'Instructor', flex:1, minWidth:120 },
          { key:'email', label:'Email', flex:1.2, minWidth:150 },
          { key:'office', label:'Office hours', flex:1.2, minWidth:130 },
          { key:'note', label:'Note', flex:2, minWidth:160 },
        ]}
        empty="No classes added yet."
        onSave={v => saveSection('classes', v)}
        renderView={rows => rows.map((c,i) => (
          <div key={i} style={{ paddingBottom:10, marginBottom:10, borderBottom:i<rows.length-1?'1px solid var(--border)':'none' }}>
            {c.code && <div style={{ fontSize:11, color:'#6B8060', letterSpacing:1 }}>{c.code}</div>}
            {c.name && <div className="serif" style={{ fontSize:16, fontWeight:600, color:'var(--text)', margin:'2px 0' }}>{c.name}</div>}
            {(c.time || c.room) && <div style={{ fontSize:12, color:'var(--text-light)' }}>{c.time}{c.time && c.room ? ' · ' : ''}{c.room}</div>}
            {(c.instructor || c.email) && (
              <div style={{ fontSize:12, color:'var(--text-light)' }}>
                {c.instructor}{c.instructor && c.email ? ' · ' : ''}
                {c.email && <a href={`mailto:${c.email}`} style={{ color:'#6B8060' }}>{c.email}</a>}
              </div>
            )}
            {c.office && <div style={{ fontSize:11, color:'var(--muted)' }}>{c.office}</div>}
            {c.note && <div style={{ fontSize:11, color:'#EF4444', marginTop:3 }}>⚠️ {c.note}</div>}
          </div>
        ))}
      />

      <ListSection title="Applications" value={info.applications}
        fields={[{ key:'text', label:'Application / program name', flex:1 }]}
        empty="No applications added yet."
        onSave={v => saveSection('applications', v)}
        renderView={rows => rows.map((r,i) => (
          <div key={i} style={{ display:'flex', gap:8, padding:'5px 0', borderBottom:i<rows.length-1?'1px solid var(--border)':'none' }}>
            <span style={{ color:'#D97706' }}>→</span><span style={{ fontSize:13, color:'var(--text)' }}>{r.text}</span>
          </div>
        ))}
      />

      <ListSection title="Key Contacts" value={info.contacts}
        fields={[{ key:'name', label:'Name', flex:1, minWidth:120 }, { key:'detail', label:'Email / phone / office / notes', flex:2, minWidth:200 }]}
        empty="No contacts added yet."
        onSave={v => saveSection('contacts', v)}
        renderView={rows => rows.map((c,i) => (
          <div key={i} style={{ padding:'6px 0', borderBottom:i<rows.length-1?'1px solid var(--border)':'none' }}>
            <div style={{ fontSize:12, fontWeight:600, color:'var(--text)' }}>{c.name}</div>
            <div style={{ fontSize:12, color:'var(--text-light)' }}>{c.detail}</div>
          </div>
        ))}
      />

      <ListSection title="Trips" value={info.trips}
        fields={[
          { key:'label', label:'Trip name', flex:1, minWidth:120 },
          { key:'depart', label:'Depart', flex:1, minWidth:150 },
          { key:'return', label:'Return', flex:1, minWidth:150 },
          { key:'note', label:'Note', flex:1.4, minWidth:160 },
        ]}
        empty="No trips added yet."
        onSave={v => saveSection('trips', v)}
        renderView={rows => rows.map((t,i) => (
          <div key={i} style={{ paddingBottom:8, marginBottom:8, borderBottom:i<rows.length-1?'1px solid var(--border)':'none' }}>
            {t.label && <div style={{ fontSize:13, fontWeight:600, color:'var(--text)', marginBottom:4 }}>{t.label}</div>}
            {t.depart && <Row k="Depart" v={t.depart} />}
            {t.return && <Row k="Return" v={t.return} />}
            {t.note && <Row k="Note" v={t.note} />}
          </div>
        ))}
      />

      <ListSection title="Logistics" value={info.logistics}
        fields={[{ key:'text', label:'Logistics note', flex:1 }]}
        empty="No logistics notes yet."
        onSave={v => saveSection('logistics', v)}
        renderView={rows => rows.map((r,i) => (
          <div key={i} style={{ display:'flex', gap:8, padding:'5px 0', borderBottom:i<rows.length-1?'1px solid var(--border)':'none', fontSize:12, color:'#4A4035' }}>
            <span style={{ color:'#52B788', flexShrink:0 }}>—</span>{r.text}
          </div>
        ))}
      />

      <ListSection title="Lab Protocols" value={info.labProtocols}
        fields={[{ key:'text', label:'Protocol note', flex:1 }]}
        empty="No lab protocol notes yet."
        onSave={v => saveSection('labProtocols', v)}
        renderView={rows => rows.map((r,i) => (
          <div key={i} style={{ display:'flex', gap:8, padding:'5px 0', borderBottom:i<rows.length-1?'1px solid var(--border)':'none', fontSize:12, color:'#4A4035' }}>
            <span style={{ color:'#52B788', flexShrink:0 }}>—</span>{r.text}
          </div>
        ))}
      />

      <ListSection title="Scheduling Rules Claude Must Follow" value={info.schedRules}
        fields={[{ key:'text', label:'Rule', flex:1 }]}
        empty="No rules added yet."
        onSave={v => saveSection('schedRules', v)}
        renderView={rows => rows.map((r,i) => (
          <div key={i} style={{ display:'flex', gap:8, padding:'5px 0', borderBottom:i<rows.length-1?'1px solid var(--border)':'none', fontSize:12, color:'#4A4035' }}>
            <span style={{ color:'#EF4444', flexShrink:0 }}>✗</span>{r.text}
          </div>
        ))}
      />
    </div>
  )
}
