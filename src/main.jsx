import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import PinGate from './components/PinGate.jsx'
import NightSharePage from './pages/NightSharePage.jsx'
import AnalyticsPage from './pages/AnalyticsPage.jsx'
import './index.css'

// Outside the PIN gate (read-only): /night/<token> for one night and /stats for
// all-time analytics (#stats/p/<id> opens a profile). The game and roster stay behind it.
const share = window.location.pathname.match(/^\/night\/([A-Za-z0-9_-]{20,})\/?$/)
const stats = /^\/stats\/?$/.test(window.location.pathname)

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    {share ? (
      <NightSharePage token={share[1]} />
    ) : stats ? (
      <div style={{ minHeight: '100vh', background: 'var(--bg-base)' }}>
        <AnalyticsPage players={[]} sessions={[]} publicView />
      </div>
    ) : (
      <PinGate>
        <App />
      </PinGate>
    )}
  </React.StrictMode>,
)
