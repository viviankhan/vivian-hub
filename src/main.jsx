import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'
import './styles/index.css'
import { applySavedAppearance } from './lib/appearance.js'

// Apply the saved font + accent theme before the first paint, so the app never
// flashes the default look on load. Guarded so a bad saved value can't stop the
// app from mounting.
try { applySavedAppearance() } catch (e) { console.error('[Bloom] appearance init failed:', e) }

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
)
