import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import PinGate from './components/PinGate.jsx'
import NightSharePage from './pages/NightSharePage.jsx'
import './index.css'

// /night/<token> is the only route outside the PIN gate (read-only night stats)
const share = window.location.pathname.match(/^\/night\/([A-Za-z0-9_-]{20,})\/?$/)

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    {share ? (
      <NightSharePage token={share[1]} />
    ) : (
      <PinGate>
        <App />
      </PinGate>
    )}
  </React.StrictMode>,
)
