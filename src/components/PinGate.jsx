import { useState, useRef, useEffect } from 'react'

const PIN           = import.meta.env.VITE_APP_PIN
const STORAGE_KEY   = 'shed_pin_verified'
const EXPIRY_MS     = 24 * 60 * 60 * 1000

function isVerified() {
  if (!PIN) return true
  try {
    const ts = Number(localStorage.getItem(STORAGE_KEY))
    return ts && Date.now() - ts < EXPIRY_MS
  } catch {
    return false
  }
}

export default function PinGate({ children }) {
  const [unlocked, setUnlocked] = useState(isVerified)
  const [input, setInput]       = useState('')
  const [error, setError]       = useState(false)
  const [shake, setShake]       = useState(false)
  const inputRef                = useRef(null)

  useEffect(() => {
    if (!unlocked) inputRef.current?.focus()
  }, [unlocked])

  if (unlocked) return children

  const submit = () => {
    if (input === PIN) {
      localStorage.setItem(STORAGE_KEY, String(Date.now()))
      setUnlocked(true)
    } else {
      setError(true)
      setShake(true)
      setInput('')
      inputRef.current?.focus()
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--bg-base)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 32,
    }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 48, marginBottom: 8 }}>♠</div>
        <div style={{ fontWeight: 900, fontSize: 28, letterSpacing: '0.08em', color: 'var(--text-primary)' }}>
          THE SHED
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', letterSpacing: '0.18em', marginTop: 4 }}>
          SHEEPSHEAD
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, width: 220 }}>
        <input
          ref={inputRef}
          type="password"
          inputMode="numeric"
          maxLength={6}
          value={input}
          onChange={e => {
            setError(false)
            setInput(e.target.value.replace(/\D/g, ''))
          }}
          onKeyDown={e => e.key === 'Enter' && submit()}
          onAnimationEnd={() => setShake(false)}
          placeholder="PIN"
          style={{
            width: '100%',
            padding: '14px 16px',
            fontSize: 22,
            letterSpacing: '0.3em',
            textAlign: 'center',
            background: 'var(--bg-input)',
            border: `1px solid ${error ? 'var(--danger)' : 'var(--border)'}`,
            borderRadius: 'var(--radius)',
            color: 'var(--text-primary)',
            outline: 'none',
            transition: 'border-color 0.2s',
            animation: shake ? 'pinShake 0.4s ease' : 'none',
          }}
        />

        {error && (
          <div style={{ fontSize: 13, color: 'var(--danger)', fontWeight: 600 }}>
            Wrong PIN
          </div>
        )}

        <button
          className="btn btn-primary"
          onClick={submit}
          style={{ width: '100%', padding: '12px 0', fontSize: 15, fontWeight: 700 }}
        >
          Enter
        </button>
      </div>

      <style>{`
        @keyframes pinShake {
          0%,100% { transform: translateX(0); }
          20%      { transform: translateX(-8px); }
          40%      { transform: translateX(8px); }
          60%      { transform: translateX(-6px); }
          80%      { transform: translateX(6px); }
        }
      `}</style>
    </div>
  )
}
