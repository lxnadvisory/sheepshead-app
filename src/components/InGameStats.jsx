import { useMemo } from 'react'
import Avatar from './Avatar'

// ── Streak helpers ────────────────────────────────────────────────────────────
export function computeStreaks(hands, players) {
  const streaks = {}
  players.forEach(pid => { streaks[pid] = 0 })
  hands.forEach(hand => {
    players.forEach(pid => {
      const delta = hand.scores?.[pid] ?? 0
      if (delta > 0)      streaks[pid] = streaks[pid] > 0 ? streaks[pid] + 1 : 1
      else if (delta < 0) streaks[pid] = streaks[pid] < 0 ? streaks[pid] - 1 : -1
      else                streaks[pid] = 0
    })
  })
  return streaks
}

export function streakStyle(n) {
  const abs = Math.abs(n)
  if (n === 0) return null
  if (n > 0) {
    if (abs >= 5) return { icon: '🔥🔥🔥', color: '#ff2200', bg: 'rgba(255,34,0,0.18)' }
    if (abs >= 4) return { icon: '🔥🔥',   color: '#ff4400', bg: 'rgba(255,68,0,0.15)' }
    if (abs >= 3) return { icon: '🔥',     color: '#ff7700', bg: 'rgba(255,119,0,0.13)' }
    if (abs >= 2) return { icon: '🔥',     color: '#ff9f00', bg: 'rgba(255,159,0,0.10)' }
  } else {
    if (abs >= 5) return { icon: '🧊🧊🧊', color: '#6644ee', bg: 'rgba(100,68,238,0.18)' }
    if (abs >= 4) return { icon: '🧊🧊',   color: '#4466ff', bg: 'rgba(68,102,255,0.15)' }
    if (abs >= 3) return { icon: '🧊',     color: '#5599ff', bg: 'rgba(85,153,255,0.13)' }
    if (abs >= 2) return { icon: '❄️',     color: '#77aaff', bg: 'rgba(119,170,255,0.10)' }
  }
  return null
}

// ── Stat computation ──────────────────────────────────────────────────────────
function computeStats(session, getPlayer) {
  const { hands, players } = session
  if (!hands.length) return null

  const streaks = computeStreaks(hands, players)
  const pStats  = {}
  players.forEach(pid => {
    pStats[pid] = { handsPlayed: 0, asPicker: 0, asPartner: 0, totalPts: 0, pickerPts: 0, pickerPointsTotal: 0, pickerWins: 0, pickerLosses: 0 }
  })

  let blackBlitzCount = 0, redBlitzCount = 0, doublerCount = 0, crackCount = 0, crackPickerLost = 0
  const combos = {}
  let biggestHand = null

  hands.forEach(hand => {
    const { picker, partner, isLoner, pickerPoints, scores, dealerPid } = hand

    // Modifiers (new + legacy)
    const bv = hand.blitzes ? Object.values(hand.blitzes) : []
    if (bv.some(b => b.black) || hand.blackBlitz || hand.blitz) blackBlitzCount++
    if (bv.some(b => b.red)   || hand.redBlitz   || hand.blitz) redBlitzCount++
    const dc = hand.doublerCount ?? (hand.doubler ? 1 : 0)
    if (dc > 0) doublerCount++
    if ((hand.crackers?.length ?? 0) > 0 || hand.crack) {
      crackCount++
      if ((scores?.[picker] ?? 0) < 0) crackPickerLost++
    }

    if (!isLoner && partner && picker) {
      const key = [picker, partner].sort().join('|')
      combos[key] = (combos[key] ?? 0) + 1
    }

    players.forEach(pid => {
      const delta = scores?.[pid] ?? 0
      const s = pStats[pid]
      s.handsPlayed++
      s.totalPts += delta

      if (pid === picker) {
        s.asPicker++; s.pickerPts += delta
        s.pickerPointsTotal += (pickerPoints ?? 60)
        if (delta > 0) s.pickerWins++
        else if (delta < 0) s.pickerLosses++
      }
      if (!isLoner && pid === partner) s.asPartner++

      const abs = Math.abs(delta)
      if (!biggestHand || abs > Math.abs(biggestHand.delta)) {
        biggestHand = { pid, delta, handNumber: hand.handNumber }
      }
    })
  })

  const comboList = Object.entries(combos)
    .map(([key, count]) => ({ pids: key.split('|'), count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 3)

  return { streaks, pStats, players, biggestHand, comboList, blackBlitzCount, redBlitzCount, doublerCount, crackCount, crackPickerLost, totalHands: hands.length }
}

// ── Sub-components ────────────────────────────────────────────────────────────
function Section({ title, children }) {
  return (
    <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
      <div style={{ padding: '6px 12px', background: 'var(--bg-elevated)', borderBottom: '1px solid var(--border)', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)' }}>
        {title}
      </div>
      <div style={{ padding: '10px 12px' }}>{children}</div>
    </div>
  )
}

function MiniStat({ label, value, color }) {
  return (
    <div>
      <div style={{ fontSize: 9, color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</div>
      <div style={{ fontSize: 13, fontWeight: 800, color: color ?? 'var(--text-primary)', lineHeight: 1.2 }}>{value}</div>
    </div>
  )
}

function Fact({ label, value, color }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
      <span style={{ fontSize: 11, color: 'var(--text-muted)', flexShrink: 0 }}>{label}</span>
      <span style={{ fontSize: 12, fontWeight: 700, color: color ?? 'var(--text-primary)', textAlign: 'right' }}>{value}</span>
    </div>
  )
}

// ── Main export ───────────────────────────────────────────────────────────────
export default function InGameStats({ session, getPlayer, getDisplayName }) {
  const dn    = getDisplayName ?? ((pid) => getPlayer(pid)?.firstName ?? pid)
  const stats = useMemo(() => computeStats(session, getPlayer), [session, getPlayer])

  if (!stats) {
    return <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>Stats appear after the first hand.</div>
  }

  const { streaks, pStats, players, biggestHand, comboList, crackCount, crackPickerLost, blackBlitzCount, redBlitzCount, doublerCount, totalHands } = stats

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: 14 }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--success)', animation: 'livePulse 2s infinite' }} />
        <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)' }}>
          Live Stats · {totalHands} hand{totalHands !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Streaks */}
      <Section title="Streaks">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {players.map(pid => {
            const p = getPlayer(pid)
            const n = streaks[pid]
            const abs = Math.abs(n)
            const ss = streakStyle(n)
            return (
              <div key={pid} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '5px 8px', borderRadius: 6, background: ss?.bg ?? 'transparent', transition: 'background 0.4s' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Avatar player={p} size={20} />
                  <span style={{ fontWeight: 600, fontSize: 13 }}>{dn(pid)}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  {abs >= 2 && <span style={{ fontSize: 11, fontWeight: 700, color: ss?.color }}>{abs}×</span>}
                  <span style={{ fontSize: abs >= 3 ? 15 : 12 }}>
                    {ss ? ss.icon : <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>—</span>}
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      </Section>

      {/* Picker stats */}
      <Section title="Picker Stats">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {players.map(pid => {
            const p = getPlayer(pid)
            const s = pStats[pid]
            if (s.asPicker === 0) return null
            const pickRate = totalHands > 0 ? Math.round((s.asPicker / totalHands) * 100) : 0
            const bumpRate = s.asPicker > 0 ? Math.round((s.pickerLosses / s.asPicker) * 100) : 0
            const avgPts   = s.asPicker > 0 ? Math.round(s.pickerPointsTotal / s.asPicker) : null
            return (
              <div key={pid} style={{ background: 'var(--bg-elevated)', borderRadius: 6, padding: '7px 10px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 5 }}>
                  <Avatar player={p} size={18} />
                  <span style={{ fontWeight: 700, fontSize: 12, color: 'var(--text-secondary)' }}>{dn(pid)}</span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
                  <MiniStat label="Picks"   value={s.asPicker} />
                  <MiniStat label="Pick%"   value={`${pickRate}%`} />
                  <MiniStat label="Bump%"   value={`${bumpRate}%`} color={bumpRate > 55 ? 'var(--danger)' : bumpRate > 35 ? 'var(--warning)' : 'var(--success)'} />
                  <MiniStat label="Avg pts" value={avgPts ?? '—'} />
                </div>
              </div>
            )
          })}
          {players.every(pid => pStats[pid].asPicker === 0) && <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>No picks yet.</span>}
        </div>
      </Section>

      {/* Partner calls */}
      <Section title="Partner Calls">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          {players.map(pid => {
            const p = getPlayer(pid)
            const s = pStats[pid]
            const rate = totalHands > 0 ? Math.round((s.asPartner / totalHands) * 100) : 0
            return (
              <div key={pid} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, width: 70, flexShrink: 0 }}>
                  <Avatar player={p} size={16} />
                  <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{dn(pid)}</span>
                </div>
                <div style={{ flex: 1, height: 5, background: 'var(--bg-elevated)', borderRadius: 3, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${rate}%`, background: 'var(--primary)', borderRadius: 3, transition: 'width 0.4s' }} />
                </div>
                <span style={{ fontSize: 11, color: 'var(--text-muted)', width: 28, textAlign: 'right', flexShrink: 0 }}>{rate}%</span>
              </div>
            )
          })}
        </div>
      </Section>

      {/* Net per hand */}
      <Section title="Net / Hand">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {players.map(pid => {
            const p = getPlayer(pid)
            const s = pStats[pid]
            const net = s.handsPlayed > 0 ? (s.totalPts / s.handsPlayed) : 0
            const isPos = net > 0, isNeg = net < 0
            return (
              <div key={pid} style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <Avatar player={p} size={16} />
                  <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{dn(pid)}</span>
                </div>
                <span style={{ fontSize: 13, fontWeight: 700, color: isPos ? 'var(--success)' : isNeg ? 'var(--danger)' : 'var(--text-muted)' }}>
                  {(net >= 0 ? '+' : '')}{net.toFixed(2)}
                </span>
              </div>
            )
          })}
        </div>
      </Section>

      {/* Session facts */}
      <Section title="Session">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
          {biggestHand && (
            <Fact label="Biggest swing" value={`${biggestHand.delta > 0 ? '+' : ''}${biggestHand.delta} · ${dn(biggestHand.pid)} H${biggestHand.handNumber}`} color={biggestHand.delta > 0 ? 'var(--success)' : 'var(--danger)'} />
          )}
          {crackCount > 0 && <Fact label="Cracks" value={`${crackCount} total · ${crackPickerLost} worked`} />}
          {(blackBlitzCount > 0 || redBlitzCount > 0) && <Fact label="Blitzes" value={`♠♣ ×${blackBlitzCount}  ♥♦ ×${redBlitzCount}`} />}
          {doublerCount > 0 && <Fact label="Doubled hands" value={`×${doublerCount}`} />}
          {crackCount === 0 && blackBlitzCount === 0 && redBlitzCount === 0 && doublerCount === 0 && (
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>No modifiers yet.</span>
          )}
        </div>
      </Section>

      {/* Partner combos */}
      {comboList.length > 0 && (
        <Section title="Top Combos">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            {comboList.map(({ pids, count }, i) => {
              const names = pids.map(pid => dn(pid)).join(' + ')
              return (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    {pids.map(pid => <Avatar key={pid} player={getPlayer(pid)} size={16} />)}
                    <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{names}</span>
                  </div>
                  <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--primary)' }}>×{count}</span>
                </div>
              )
            })}
          </div>
        </Section>
      )}
    </div>
  )
}
