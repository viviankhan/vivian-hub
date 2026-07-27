import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './styles/index.css'
import { applySavedAppearance } from './lib/appearance.js'

// Apply the saved font + accent theme before the first paint, so the app never
// flashes the default look on load.
applySavedAppearance()

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
