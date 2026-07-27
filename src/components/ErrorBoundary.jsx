// src/components/ErrorBoundary.jsx
// A last-resort catch so a render error never leaves Bloom as a blank screen.
// Shows a themed fallback with the error text and a "Clean reload" that also
// clears the service-worker caches (handy given how sticky PWA caching is).
import React from 'react'

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }
  static getDerivedStateFromError(error) {
    return { error }
  }
  componentDidCatch(error, info) {
    // eslint-disable-next-line no-console
    console.error('[Bloom] render crash:', error, info)
  }
  hardReload = async () => {
    try {
      if ('serviceWorker' in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations()
        await Promise.all(regs.map(r => r.unregister()))
      }
      if (typeof caches !== 'undefined') {
        const keys = await caches.keys()
        await Promise.all(keys.map(k => caches.delete(k)))
      }
    } catch { /* ignore */ }
    window.location.reload()
  }
  render() {
    const { error } = this.state
    if (!error) return this.props.children
    const detail = String(error && (error.stack || error.message || error))
    return (
      <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', padding:24, fontFamily:'DM Sans, sans-serif', color:'#2A3848' }}>
        <div style={{ maxWidth:440, width:'100%', textAlign:'center' }}>
          <div style={{ fontFamily:'Cormorant Garamond, serif', fontSize:30, fontWeight:600, marginBottom:8 }}>Something went wrong</div>
          <div style={{ fontSize:13.5, color:'#8899AA', marginBottom:18, lineHeight:1.55 }}>
            Bloom hit an error while loading. Your data is safe in the cloud — a clean reload usually fixes it.
          </div>
          <button onClick={this.hardReload}
            style={{ padding:'12px 24px', borderRadius:12, border:'none', background:'#2A4858', color:'#E8F6FA', fontWeight:700, fontSize:15, cursor:'pointer', fontFamily:'DM Sans, sans-serif' }}>
            Clean reload
          </button>
          <pre style={{ marginTop:18, textAlign:'left', fontSize:11, lineHeight:1.5, color:'#B44A6A', background:'#FBF0F4', border:'1px solid #F0C4CC', borderRadius:10, padding:'12px 14px', overflowX:'auto', whiteSpace:'pre-wrap', wordBreak:'break-word' }}>{detail}</pre>
        </div>
      </div>
    )
  }
}
