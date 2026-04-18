import { useState, useEffect, useMemo, useRef } from 'react'
import Avatar from './Avatar'
import { computeStreaks, streakStyle } from './InGameStats'

function useWide(bp = 820) {
  const [wide, setWide] = useState(() => window.innerWidth >= bp)
  useEffect(() => {
    const fn = () => setWide(window.innerWidth >= bp)
    window.addEventListener('resize', fn)
    return () => window.removeEventListener('resize', fn)
  }, [bp])
  return wide
}

// Mirror of getM from Scoreboard — computes the hand multiplier for display
function getHandMultiplier(hand) {
  if (!hand) return 1
  let m = 1
  const dc = hand.doublerCount ?? (hand.doubler ? 1 : 0)
  if (dc > 0) m *= Math.pow(2, Math.min(dc, 4))
  if ((hand.crackers?.length ?? 0) > 0 || hand.crack)      m *= 2
  if ((hand.recrackers?.length ?? 0) > 0 || hand.reCrack)  m *= 2
  const bv = hand.blitzes ? Object.values(hand.blitzes) : []
  if (bv.some(b => b.black) || hand.blackBlitz || hand.blitz) m *= 2
  if (bv.some(b => b.red)   || hand.redBlitz   || hand.blitz) m *= 2
  if (hand.lastRound) m *= 2
  return Math.min(m, 16)
}

function lastHandChips(hand) {
  if (!hand) return []
  const chips = []
  if (hand.shedClean)      chips.push({ text: 'Shed Clean',   color: 'var(--success)' })
  if (hand.pickerNoTricks) chips.push({ text: 'No Tricks ✂️', color: 'var(--danger)'  })
  if (hand.isLoner)        chips.push({ text: 'Loner 🐺',     color: 'var(--warning)' })
  if (hand.lastRound)      chips.push({ text: 'Last Round',   color: 'var(--primary)' })
  const m = getHandMultiplier(hand)
  if (m > 1) chips.push({ text: `×${m}`, color: 'var(--warning)' })
  return chips
}

// ── Exit button ───────────────────────────────────────────────────────────────
function ExitBtn({ onExit }) {
  const [hover, setHover] = useState(false)
  return (
    <button
      onClick={onExit}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      className="btn btn-ghost btn-sm"
      title="Exit display (Esc)"
      style={{
        position: 'fixed', top: 14, right: 16, zIndex: 502,
        opacity: hover ? 1 : 0.35,
        transition: 'opacity 0.2s',
        fontSize: 12,
      }}
    >
      ✕ Exit Display
    </button>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function DisplayMode({ session, getPlayer, getDisplayName, onExit }) {
  const wide = useWide()
  const prevHandCount = useRef(session?.hands.length ?? 0)
  const [flashPids,   setFlashPids]   = useState(new Set())

  // Escape key exits
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onExit() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onExit])

  // Flash cards whose scores changed when a new hand is posted
  useEffect(() => {
    const count = session?.hands.length ?? 0
    if (count > prevHandCount.current && session) {
      const lastHand = session.hands[count - 1]
      if (lastHand) {
        const pids = new Set(
          Object.entries(lastHand.scores ?? {})
            .filter(([, d]) => d !== 0)
            .map(([pid]) => pid)
        )
        setFlashPids(pids)
        const t = setTimeout(() => setFlashPids(new Set()), 900)
        prevHandCount.current = count
        return () => clearTimeout(t)
      }
    }
    prevHandCount.current = count
  }, [session?.hands.length, session])

  // ── No active session ──
  if (!session) {
    return (
      <div style={{ position: 'fixed', inset: 0, zIndex: 500, background: 'var(--bg-base)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 20 }}>
        <ExitBtn onExit={onExit} />
        <div style={{ fontSize: 72, lineHeight: 1 }}>♠</div>
        <div style={{ fontWeight: 800, fontSize: 32, letterSpacing: '-0.01em' }}>The Shed</div>
        <div style={{ color: 'var(--text-muted)', fontSize: 20 }}>Waiting for a game to start…</div>
      </div>
    )
  }

  const sessionPlayers  = session.players
  const hands           = session.hands
  const numPlayers      = sessionPlayers.length
  const is6Player       = numPlayers === 6
  const currentDealer   = sessionPlayers[session.dealerIndex ?? 0]
  const sittingOutPid   = is6Player ? currentDealer : null
  const lrRemaining     = session.lastRoundRemaining ?? 0
  const lastHand        = hands.length > 0 ? hands[hands.length - 1] : null
  const chips           = lastHandChips(lastHand)
  const dateStr         = new Date(session.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })

  // Computed values
  const totals = useMemo(() => {
    const t = {}
    sessionPlayers.forEach(pid => { t[pid] = 0 })
    hands.forEach(h => {
      Object.entries(h.scores ?? {}).forEach(([pid, d]) => { t[pid] = (t[pid] ?? 0) + d })
    })
    return t
  }, [hands, sessionPlayers])

  const streaks = useMemo(() => computeStreaks(hands, sessionPlayers), [hands, sessionPlayers])

  const sorted = useMemo(
    () => [...sessionPlayers].sort((a, b) => (totals[b] ?? 0) - (totals[a] ?? 0)),
    [sessionPlayers, totals]
  )

  const topTotal    = totals[sorted[0]] ?? 0
  const isTied      = sorted.length > 1 && topTotal === (totals[sorted[1]] ?? 0)
  const leaderId    = (!isTied && topTotal > 0) ? sorted[0] : null

  // Card sizing — scales with player count and viewport width
  const avatarSz = wide ? (numPlayers >= 6 ? 80 : 100) : 56
  const scoreSz  = wide ? (numPlayers >= 6 ? 54 : 66)  : 38
  const nameSz   = wide ? (numPlayers >= 6 ? 15 : 17)  : 13

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 500, background: 'var(--bg-base)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <ExitBtn onExit={onExit} />

      {/* ── Top bar ──────────────────────────────────────────────────────── */}
      <div style={{ flexShrink: 0, padding: wide ? '18px 28px 10px' : '12px 14px 6px', display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', borderBottom: '1px solid var(--border)' }}>
        <span style={{ fontSize: wide ? 26 : 20 }}>♠</span>
        <div>
          <div style={{ fontWeight: 800, fontSize: wide ? 20 : 15, letterSpacing: '-0.01em' }}>The Shed</div>
          <div style={{ fontSize: wide ? 12 : 10, color: 'var(--text-muted)', marginTop: 1 }}>
            {dateStr} · {hands.length} hand{hands.length !== 1 ? 's' : ''}
          </div>
        </div>
        <span className="badge badge-success" style={{ marginLeft: 4 }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'currentColor', display: 'inline-block', animation: 'livePulse 2s infinite' }} />
          Live
        </span>
        {lrRemaining > 0 && (
          <span style={{ fontSize: wide ? 13 : 11, fontWeight: 700, color: 'var(--warning)', background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: 6, padding: wide ? '4px 12px' : '3px 8px' }}>
            🏁 Last Round · {lrRemaining} hand{lrRemaining !== 1 ? 's' : ''} left
          </span>
        )}
      </div>

      {/* ── Player cards ─────────────────────────────────────────────────── */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'stretch', padding: wide ? '16px 24px 12px' : '10px 10px 8px', gap: wide ? 14 : 8, minHeight: 0 }}>
        {sorted.map(pid => {
          const p       = getPlayer(pid)
          const total   = totals[pid] ?? 0
          const ss      = streakStyle(streaks[pid])
          const isLead  = pid === leaderId
          const isSit   = pid === sittingOutPid
          const isFlash = flashPids.has(pid)

          // Role in last hand
          let role = null
          if (lastHand) {
            if      (pid === lastHand.picker)                            role = 'Pick'
            else if (!lastHand.isLoner && pid === lastHand.partner)      role = 'Ptnr'
            else if (pid === lastHand.dealerPid)                         role = 'Out'
          }

          const borderColor = isLead
            ? 'rgba(245,158,11,0.65)'
            : total > 0 ? 'rgba(34,197,94,0.35)' : total < 0 ? 'rgba(239,68,68,0.3)' : 'var(--border)'

          const cardBg = ss?.bg
            ?? (isLead ? 'rgba(245,158,11,0.07)' : 'var(--bg-elevated)')

          const shadow = isLead
            ? '0 0 28px rgba(245,158,11,0.2)'
            : isFlash ? '0 0 22px rgba(99,102,241,0.3)' : 'none'

          return (
            <div key={pid} style={{
              flex: 1,
              display: 'flex', flexDirection: 'column', alignItems: 'center',
              gap: wide ? 8 : 5,
              background: cardBg,
              border: `2px solid ${borderColor}`,
              borderRadius: 'var(--radius)',
              padding: wide ? '16px 10px 18px' : '10px 6px 12px',
              position: 'relative',
              opacity: isSit ? 0.35 : 1,
              transition: 'background 0.5s, border-color 0.4s, box-shadow 0.4s',
              boxShadow: shadow,
              minWidth: 0,
            }}>

              {/* Crown */}
              {isLead && (
                <span style={{ position: 'absolute', top: wide ? -18 : -14, fontSize: wide ? 26 : 20, filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.5))' }}>
                  👑
                </span>
              )}

              {/* Role badge */}
              {role && role !== 'Out' && (
                <span style={{
                  position: 'absolute', top: 6, right: 6,
                  fontSize: 9, fontWeight: 800, letterSpacing: '0.04em', textTransform: 'uppercase',
                  padding: '2px 5px', borderRadius: 4,
                  background: role === 'Pick' ? 'rgba(99,102,241,0.25)' : 'rgba(34,197,94,0.2)',
                  color: role === 'Pick' ? 'var(--primary)' : 'var(--success)',
                }}>
                  {role}
                </span>
              )}

              {/* Avatar */}
              <div style={{ marginTop: isLead ? (wide ? 14 : 10) : 0, flexShrink: 0 }}>
                <Avatar player={p} size={avatarSz} style={{ boxShadow: isLead ? '0 0 16px rgba(245,158,11,0.25)' : undefined }} />
              </div>

              {/* Name */}
              <div style={{ fontSize: nameSz, fontWeight: 700, color: 'var(--text-secondary)', textAlign: 'center', lineHeight: 1.2, maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', paddingInline: 4 }}>
                {getDisplayName(pid)}
              </div>

              {/* Streak */}
              {ss ? (
                <div style={{ fontSize: wide ? 18 : 13, lineHeight: 1 }}>{ss.icon}</div>
              ) : (
                <div style={{ height: wide ? 18 : 13 }} />
              )}

              {/* Score — key on total triggers animate-fade when value changes */}
              <div
                key={`${pid}-${total}`}
                className="animate-fade"
                style={{
                  fontSize: scoreSz, fontWeight: 900, lineHeight: 1,
                  color: total > 0 ? 'var(--success)' : total < 0 ? 'var(--danger)' : 'var(--text-muted)',
                  letterSpacing: '-0.03em',
                  marginTop: 'auto',
                }}
              >
                {total > 0 ? `+${total}` : total === 0 ? '0' : total}
              </div>
            </div>
          )
        })}
      </div>

      {/* ── Last hand summary ────────────────────────────────────────────── */}
      <div style={{
        flexShrink: 0,
        borderTop: '1px solid var(--border)',
        padding: wide ? '12px 28px 18px' : '8px 14px 12px',
        display: 'flex', alignItems: 'center', gap: wide ? 28 : 14, flexWrap: 'wrap',
      }}>
        {hands.length === 0 ? (
          <div style={{ flex: 1, textAlign: 'center', color: 'var(--text-muted)', fontSize: wide ? 17 : 14 }}>
            Waiting for the first hand…
          </div>
        ) : (
          <>
            {/* Hand # */}
            <InfoBlock label="Last Hand" value={`#${lastHand.handNumber}`} wide={wide} />

            {/* Picker */}
            <InfoBlock label="Picker" value={getDisplayName(lastHand.picker)} wide={wide} color="var(--primary)" />

            {/* Partner */}
            {!lastHand.isLoner && lastHand.partner && (
              <InfoBlock label="Partner" value={getDisplayName(lastHand.partner)} wide={wide} color="var(--success)" />
            )}

            {/* Card points */}
            {lastHand.pickerPoints != null && (
              <InfoBlock label="Points" value={`${lastHand.pickerPoints} pts`} wide={wide} />
            )}

            {/* Result chips */}
            {chips.length > 0 && (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                {chips.map((c, i) => (
                  <span key={i} style={{ fontSize: wide ? 13 : 11, fontWeight: 800, color: c.color, background: c.color + '22', borderRadius: 6, padding: wide ? '4px 12px' : '3px 8px', letterSpacing: '0.02em' }}>
                    {c.text}
                  </span>
                ))}
              </div>
            )}

            {/* Sitting out (next hand) */}
            {sittingOutPid && (
              <div style={{ marginLeft: 'auto', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3 }}>
                <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)' }}>Next: Sitting Out</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Avatar player={getPlayer(sittingOutPid)} size={20} />
                  <span style={{ fontSize: wide ? 16 : 13, fontWeight: 700, color: 'var(--text-muted)' }}>
                    {getDisplayName(sittingOutPid)}
                  </span>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

function InfoBlock({ label, value, wide, color }) {
  return (
    <div style={{ flexShrink: 0 }}>
      <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)', marginBottom: 3 }}>
        {label}
      </div>
      <div style={{ fontSize: wide ? 18 : 14, fontWeight: 800, color: color ?? 'var(--text-primary)' }}>
        {value}
      </div>
    </div>
  )
}
