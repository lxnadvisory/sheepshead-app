import { useState, useRef, useEffect } from 'react'
import { supabase } from '../supabase.js'

// The PIN is checked by Supabase, not in the browser: it is the password of one
// shared "Shed" account, and the database only lets that account see players'
// phone/email/venmo or change anything. Nothing secret ships in the bundle.
const SHED_EMAIL  = 'shed@lxnadvisory.com'
const toPassword  = pin => `shed-pin-${pin}`   // Supabase needs 6+ chars; PINs are 4–6 digits
const STORAGE_KEY = 'shed_pin_verified'
const EXPIRY_MS   = 24 * 60 * 60 * 1000

function recentlyUnlocked() {
  try {
    const ts = Number(localStorage.getItem(STORAGE_KEY))
    return Boolean(ts && Date.now() - ts < EXPIRY_MS)
  } catch {
    return false
  }
}

export default function PinGate({ children }) {
  // null = still checking for an existing session
  const [unlocked, setUnlocked] = useState(supabase ? null : true)
  const [input, setInput]       = useState('')
  const [error, setError]       = useState('')
  const [shake, setShake]       = useState(false)
  const [busy, setBusy]         = useState(false)
  const inputRef                = useRef(null)

  useEffect(() => {
    if (!supabase) return
    let cancelled = false
    supabase.auth.getSession().then(async ({ data }) => {
      const ok = Boolean(data?.session) && recentlyUnlocked()
      if (!ok && data?.session) await supabase.auth.signOut()   // older than 24h: ask again
      if (!cancelled) setUnlocked(ok)
    })
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    if (unlocked === false) inputRef.current?.focus()
  }, [unlocked])

  if (unlocked === null) return <div style={{ minHeight: '100vh', background: 'var(--bg-base)' }} />
  if (unlocked) return children

  const submit = async () => {
    if (busy || input.length < 4) return
    setBusy(true)
    const { error: authError } = await supabase.auth.signInWithPassword({
      email: SHED_EMAIL,
      password: toPassword(input),
    })
    setBusy(false)
    if (!authError) {
      try { localStorage.setItem(STORAGE_KEY, String(Date.now())) } catch { /* private mode */ }
      setUnlocked(true)
      return
    }
    const tooMany = /rate|too many/i.test(authError.message || '')
    setError(tooMany ? 'Too many tries — wait a minute' : 'Wrong PIN')
    setShake(true)
    setInput('')
    inputRef.current?.focus()
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
            setError('')
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
            {error}
          </div>
        )}

        <button
          className="btn btn-primary"
          onClick={submit}
          disabled={busy}
          style={{ width: '100%', padding: '12px 0', fontSize: 15, fontWeight: 700 }}
        >
          {busy ? 'Checking…' : 'Enter'}
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
