// src/components/Info.jsx

const INFO = {
  profile: {
    name: 'Vivian Khan',
    school: 'Lawrence University, Appleton WI',
    year: 'Senior — graduating May 2026',
    major: 'Biology (dropped Neuroscience)',
    housing: 'Fox Commons',
    goal: 'MD-PhD in immunology / autoimmune disease research',
    boyfriend: 'Aidan — daily calls 7–9 PM, protect this block',
  },
  thesis: {
    title: 'Using Yeast to Investigate a Promising Therapeutic Target for Hepatitis B',
    advisor: 'Dr. Kim Dickson',
    status: 'Statement of intent submitted 3/30/26',
  },
  classes: [
    { code:'BIOL 505', name:'Coral Reef Environments', time:'MWF 9:50–11:00 AM + Thu lab 1–4 PM', room:'Youngchild 316 / 321', instructor:'Dr. Margaret Malone', email:'margaret.malone@lawrence.edu', office:'Youngchild 307, Wed 12:30–2:30 PM', note:'' },
    { code:'BIOL 433', name:'Ecological Energetics', time:'Tu/Th 10:25–12:10 PM', room:'Youngchild 316', instructor:'Dr. Margaret Malone', email:'margaret.malone@lawrence.edu', office:'', note:'' },
    { code:'BIOL 651', name:'Biology Senior Capstone II', time:'Mon 3:10–4:20 PM', room:'Steitz 202 (some weeks Briggs 420)', instructor:'Rose Theisen', email:'rose.theisen@lawrence.edu', office:'', note:'SE advisor meeting graded, due May 1 — NOT YET SCHEDULED ⚠️' },
    { code:'YeastScreen', name:'Honors Thesis Research', time:'Daily ~8 AM, ~30 hrs/week', room:'Bench', instructor:'Dr. Kim Dickson', email:'kimberly.dickson@lawrence.edu', office:'Steitz 333', note:'' },
  ],
  contacts: [
    { name:'Dr. Kim Dickson',    detail:'kimberly.dickson@lawrence.edu · 920-832-7039 · Steitz 333' },
    { name:'Dr. Margaret Malone', detail:'margaret.malone@lawrence.edu · Youngchild 307 · Office hrs Wed 12:30–2:30 PM' },
    { name:'Rose Theisen',       detail:'rose.theisen@lawrence.edu (Capstone advisor / SE advisor)' },
    { name:'TA Ellie Carrothers', detail:'ellie.r.carrothers@lawrence.edu' },
    { name:'Carla Molder (Honors)', detail:'carla.molder@lawrence.edu' },
  ],
  applications: ['Yale PREP', 'Fred Hutch', 'Stanford Medicine', 'WashU DCBRM', 'Broad Institute'],
  logistics: [
    'Walk Fox Commons → Andrew Commons: 15 min',
    'Walk Youngchild → Commons: ~10 min',
    'Commons M–F: 7:30 AM–2 PM, 4:30–9 PM',
    'Commons Sat–Sun: 9 AM–2 PM, 4:30–7:30 PM',
    'Sleep: 10:30 PM – 6:00 AM weekdays · 8:30 AM weekends',
  ],
  labProtocols: [
    'PCR: ~30 min if recipe ready · ~2 hrs if setting up from scratch',
    'Gel + purification: ~3 hrs total',
    'Can leave samples in biomass buffer B3 during class',
  ],
  schedRules: [
    'Always ≥10 min buffer between events requiring travel',
    'Never end one event at the exact start of the next unless same room',
    'Never assume tasks done unless Vivian explicitly confirms',
    'Never pre-check anything she hasn\'t said she completed',
    'Todo IDs must never be renamed once used — breaks persistence',
    'Carry-forward only applies to tasks with carry:true — never daily repeats',
    'Don\'t change visual style unless asked',
  ],
  bonaire: {
    depart: 'Sat Apr 18, 2026 @ 1:30 AM',
    return: 'Sun May 3, 2026 @ 1:30 AM',
    note: 'No Lawrence classes during this period. Field work on Bonaire reefs.',
  },
}

function Section({ title, children }) {
  return (
    <div className="info-section" style={{ marginBottom:14 }}>
      <div className="card-header">
        <span className="card-header-title">{title}</span>
      </div>
      <div style={{ padding:'12px 18px' }}>{children}</div>
    </div>
  )
}

function Row({ k, v }) {
  return (
    <div className="info-row">
      <div className="info-key">{k}</div>
      <div className="info-val">{v}</div>
    </div>
  )
}

export default function Info() {
  return (
    <div>
      <div className="page-title">About Vivian</div>
      <div className="page-sub">Accumulated profile — updated each session</div>

      <Section title="Personal Profile">
        {Object.entries(INFO.profile).map(([k, v]) => (
          <Row key={k} k={k.replace(/([A-Z])/g,' $1').toLowerCase()} v={v} />
        ))}
      </Section>

      <Section title="Honors Thesis">
        <div style={{ fontFamily:'Cormorant Garamond, serif', fontSize:15, fontStyle:'italic', color:'var(--text)', marginBottom:8 }}>
          "{INFO.thesis.title}"
        </div>
        <Row k="Advisor" v={INFO.thesis.advisor} />
        <Row k="Status"  v={INFO.thesis.status}  />
      </Section>

      <Section title="Spring 2026 Classes">
        {INFO.classes.map(c => (
          <div key={c.code} style={{ paddingBottom:10, marginBottom:10, borderBottom:'1px solid var(--border)' }}>
            <div style={{ fontSize:11, color:'#6B8060', letterSpacing:1 }}>{c.code}</div>
            <div className="serif" style={{ fontSize:16, fontWeight:600, color:'var(--text)', margin:'2px 0' }}>{c.name}</div>
            <div style={{ fontSize:12, color:'var(--text-light)' }}>{c.time} · {c.room}</div>
            <div style={{ fontSize:12, color:'var(--text-light)' }}>{c.instructor} · <a href={`mailto:${c.email}`} style={{ color:'#6B8060' }}>{c.email}</a></div>
            {c.note && <div style={{ fontSize:11, color:'#EF4444', marginTop:3 }}>⚠️ {c.note}</div>}
          </div>
        ))}
      </Section>

      <Section title="MD-PhD Applications">
        {INFO.applications.map(a => (
          <div key={a} style={{ display:'flex', gap:8, padding:'5px 0', borderBottom:'1px solid var(--border)' }}>
            <span style={{ color:'#D97706' }}>→</span>
            <span style={{ fontSize:13, color:'var(--text)' }}>{a}</span>
          </div>
        ))}
      </Section>

      <Section title="Key Contacts">
        {INFO.contacts.map(c => (
          <div key={c.name} style={{ padding:'6px 0', borderBottom:'1px solid var(--border)' }}>
            <div style={{ fontSize:12, fontWeight:600, color:'var(--text)' }}>{c.name}</div>
            <div style={{ fontSize:12, color:'var(--text-light)' }}>{c.detail}</div>
          </div>
        ))}
      </Section>

      <Section title="Bonaire Trip">
        <Row k="Depart" v={INFO.bonaire.depart} />
        <Row k="Return" v={INFO.bonaire.return} />
        <Row k="Note"   v={INFO.bonaire.note}   />
      </Section>

      <Section title="Logistics">
        {INFO.logistics.concat(INFO.labProtocols).map((item, i) => (
          <div key={i} style={{ display:'flex', gap:8, padding:'5px 0', borderBottom:'1px solid var(--border)', fontSize:12, color:'#4A4035' }}>
            <span style={{ color:'#52B788', flexShrink:0 }}>—</span>{item}
          </div>
        ))}
      </Section>

      <Section title="Scheduling Rules Claude Must Follow">
        {INFO.schedRules.map((r, i) => (
          <div key={i} style={{ display:'flex', gap:8, padding:'5px 0', borderBottom:'1px solid var(--border)', fontSize:12, color:'#4A4035' }}>
            <span style={{ color:'#EF4444', flexShrink:0 }}>✗</span>{r}
          </div>
        ))}
      </Section>
    </div>
  )
}
