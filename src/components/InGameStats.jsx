import { useMemo } from 'react'
import Avatar from './Avatar'
import { sitOutsOf, isPickHand, isPass, isLeaster } from '../utils/hands'
import { pairMatrix, pairExtremes, moneyByRole, crackScorecard, allPassCounts, LONER } from '../utils/nightStats'
import { blitzItems, blitzRecords } from '../lib/analytics'

const usd  = n => { const r = Math.round(n * 100) / 100; return r > 0 ? `+$${r}` : r < 0 ? `-$${Math.abs(r)}` : '$0' }
const tone = n => (n > 0 ? 'var(--success)' : n < 0 ? 'var(--danger)' : 'var(--text-muted)')

// ── Streak helpers ────────────────────────────────────────────────────────────
// First icon appears only after this many consecutive wins/losses.
// Increase to 2 to lower the threshold; set to 1 to show after every single win/loss.
export const STREAK_MIN = 3

export function computeStreaks(hands, players) {
  const streaks = {}
  players.forEach(pid => { streaks[pid] = 0 })
  hands.forEach(hand => {
    if (hand.handType === 'fup') return          // F-Ups don't affect streaks
    players.forEach(pid => {
      if (sitOutsOf(hand).includes(pid)) return   // sit-out doesn't affect streak
      const delta = hand.scores?.[pid] ?? 0
      if (delta > 0)      streaks[pid] = streaks[pid] > 0 ? streaks[pid] + 1 : 1
      else if (delta < 0) streaks[pid] = streaks[pid] < 0 ? streaks[pid] - 1 : -1
      // delta === 0: no change — neither breaks nor extends the streak
    })
  })
  return streaks
}

// Icon ladders — index 0 = STREAK_MIN, each additional hand advances one step.
const HOT_ICONS   = ['🔥', '🔥🔥', '🌶️', '🫠', '☀️', '👑']
const HOT_COLORS  = ['#ffbb00', '#ff9f00', '#ff4400', '#ff7700', '#ff6600', '#f59e0b']
const HOT_BG      = ['rgba(255,187,0,0.08)', 'rgba(255,159,0,0.10)', 'rgba(255,68,0,0.12)', 'rgba(255,119,0,0.13)', 'rgba(255,102,0,0.15)', 'rgba(245,158,11,0.18)']
const COLD_ICONS  = ['❄️', '🐧', '🧊', '⛄', '🥶', '☠️']
const COLD_COLORS = ['#99bbff', '#77aaff', '#5599ff', '#4466ff', '#6644ee', '#7c3aed']
const COLD_BG     = ['rgba(153,187,255,0.07)', 'rgba(119,170,255,0.10)', 'rgba(85,153,255,0.12)', 'rgba(68,102,255,0.13)', 'rgba(100,68,238,0.15)', 'rgba(124,58,237,0.18)']

export function streakStyle(n) {
  const abs = Math.abs(n)
  if (abs < STREAK_MIN) return null
  const idx = Math.min(abs - STREAK_MIN, 5)
  if (n > 0) return { icon: HOT_ICONS[idx],  color: HOT_COLORS[idx],  bg: HOT_BG[idx]  }
  return             { icon: COLD_ICONS[idx], color: COLD_COLORS[idx], bg: COLD_BG[idx] }
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

  let pickHands = 0
  hands.forEach(hand => {
    if (isPass(hand)) return   // thrown in: nobody played or paid
    const pickHand = isPickHand(hand)   // leasters / F-Ups: money only, no picker stats
    if (!isLeaster(hand)) pickHands++   // pick % over the same hands as before, minus leasters / passes
    const { picker, partner, isLoner, pickerPoints, scores } = hand

    // Modifiers (new + legacy)
    const bv = hand.blitzes ? Object.values(hand.blitzes) : []
    if (bv.some(b => b.black) || hand.blackBlitz || hand.blitz) blackBlitzCount++
    if (bv.some(b => b.red)   || hand.redBlitz   || hand.blitz) redBlitzCount++
    const dc = hand.doublerCount ?? (hand.doubler ? 1 : 0)
    if (dc > 0 && pickHand) doublerCount++
    if (pickHand && ((hand.crackers?.length ?? 0) > 0 || hand.crack)) {
      crackCount++
      if ((scores?.[picker] ?? 0) < 0) crackPickerLost++
    }

    if (pickHand && !isLoner && partner && picker) {
      const key = [picker, partner].sort().join('|')
      combos[key] = (combos[key] ?? 0) + 1
    }

    players.forEach(pid => {
      if (sitOutsOf(hand).includes(pid)) return   // sat out: not a hand they played
      const delta = scores?.[pid] ?? 0
      const s = pStats[pid]
      s.handsPlayed++
      s.totalPts += delta

      if (pickHand && pid === picker) {
        s.asPicker++; s.pickerPts += delta
        s.pickerPointsTotal += (pickerPoints ?? 60)
        if (delta > 0) s.pickerWins++
        else if (delta < 0) s.pickerLosses++
      }
      if (pickHand && !isLoner && pid === partner) s.asPartner++

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

  const matrix = pairMatrix(hands)
  return {
    streaks, pStats, players, biggestHand, comboList, blackBlitzCount, redBlitzCount, doublerCount, crackCount, crackPickerLost, totalHands: hands.length, pickHands, allPass: allPassCounts(hands),
    matrix, extremes: pairExtremes(matrix), roles: moneyByRole(hands, players), cracks: crackScorecard(hands),
    blitz: blitzRecords(blitzItems(hands)).players,
  }
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
// heading/live let the public night page reuse this panel without the live dot
export default function InGameStats({ session, getPlayer, getDisplayName, heading = 'Live Stats', live = true }) {
  const dn    = getDisplayName ?? ((pid) => getPlayer(pid)?.firstName ?? pid)
  const stats = useMemo(() => computeStats(session, getPlayer), [session, getPlayer])

  if (!stats) {
    return <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>Stats appear after the first hand.</div>
  }

  const { streaks, pStats, players, biggestHand, comboList, crackCount, crackPickerLost, blackBlitzCount, redBlitzCount, doublerCount, totalHands, pickHands, allPass, matrix, extremes, roles, cracks } = stats
  const showLeaster = allPass.leasters > 0
  const blitzers = players.filter(pid => stats.blitz[pid])
  // The sidebar on a TV has room for the grid; a phone gets the same records as a list
  const asGrid = typeof window !== 'undefined' && window.innerWidth >= 1080
  const isBest  = (pk, pt) => extremes.best  && extremes.best.picker  === pk && extremes.best.partner  === pt
  const isWorst = (pk, pt) => extremes.worst && extremes.worst.picker === pk && extremes.worst.partner === pt
  const pickers  = players.filter(pid => matrix[pid])
  const partners = [...players.filter(pid => pickers.some(pk => matrix[pk][pid])), ...(pickers.some(pk => matrix[pk][LONER]) ? [LONER] : [])]
  const pairName = pt => (pt === LONER ? 'Loner' : dn(pt))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: 14 }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {live && <div style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--success)', animation: 'livePulse 2s infinite' }} />}
        <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)' }}>
          {heading} · {totalHands} hand{totalHands !== 1 ? 's' : ''}
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
                  {ss && <span style={{ fontSize: 11, fontWeight: 700, color: ss.color }}>{abs}×</span>}
                  <span style={{ fontSize: ss ? 16 : 12 }}>
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
            const pickRate = pickHands > 0 ? Math.round((s.asPicker / pickHands) * 100) : 0   // leasters / passes left out
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

      {/* Picker × partner records */}
      {pickers.length > 0 && (
        <Section title="Picker × Partner">
          {asGrid ? (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ borderCollapse: 'collapse', fontSize: 10, width: '100%' }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: 'left', padding: '2px 4px', color: 'var(--text-muted)', fontWeight: 700 }}>Pick ↓</th>
                    {partners.map(pt => (
                      <th key={pt} style={{ padding: '2px 3px', color: 'var(--text-muted)', fontWeight: 700, whiteSpace: 'nowrap', maxWidth: 44, overflow: 'hidden', textOverflow: 'ellipsis' }}>{pairName(pt)}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {pickers.map(pk => (
                    <tr key={pk} style={{ borderTop: '1px solid var(--border)' }}>
                      <td style={{ padding: '3px 4px', fontWeight: 700, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{dn(pk)}</td>
                      {partners.map(pt => {
                        const c = matrix[pk][pt]
                        const hl = c && (isBest(pk, pt) ? 'rgba(34,197,94,0.18)' : isWorst(pk, pt) ? 'rgba(239,68,68,0.18)' : null)
                        return (
                          <td key={pt} style={{ padding: '3px 2px', textAlign: 'center', background: hl ?? undefined, borderRadius: 4 }}>
                            {c && <>
                              <div style={{ fontWeight: 700 }}>{c.wins}-{c.losses}</div>
                              <div style={{ fontWeight: 800, color: tone(c.net) }}>{usd(c.net)}</div>
                            </>}
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 220, overflowY: 'auto' }}>
              {pickers.flatMap(pk => Object.entries(matrix[pk]).map(([pt, c]) => ({ pk, pt, ...c })))
                .sort((a, b) => b.net - a.net)
                .map(({ pk, pt, wins, losses, net }) => (
                  <div key={pk + pt} style={{
                    display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, padding: '3px 6px', borderRadius: 4,
                    background: isBest(pk, pt) ? 'rgba(34,197,94,0.15)' : isWorst(pk, pt) ? 'rgba(239,68,68,0.15)' : undefined,
                  }}>
                    <span style={{ flex: 1, color: 'var(--text-secondary)' }}>{dn(pk)} + {pairName(pt)}</span>
                    <span style={{ fontWeight: 700 }}>{wins}-{losses}</span>
                    <span style={{ fontWeight: 800, color: tone(net), width: 48, textAlign: 'right' }}>{usd(net)}</span>
                  </div>
                ))}
            </div>
          )}
          {(extremes.best || extremes.worst) && (
            <div style={{ marginTop: 6, fontSize: 10, color: 'var(--text-muted)' }}>
              {extremes.best && <span style={{ color: 'var(--success)' }}>Best: {dn(extremes.best.picker)} + {pairName(extremes.best.partner)}</span>}
              {extremes.best && extremes.worst && ' · '}
              {extremes.worst && <span style={{ color: 'var(--danger)' }}>Worst: {dn(extremes.worst.picker)} + {pairName(extremes.worst.partner)}</span>}
            </div>
          )}
        </Section>
      )}

      {/* Money by role */}
      <Section title="Money by Role">
        <div style={{ display: 'grid', gridTemplateColumns: `minmax(0,1.4fr) repeat(${showLeaster ? 5 : 4}, minmax(0,1fr))`, gap: '4px 4px', fontSize: 11, alignItems: 'center' }}>
          {['', 'Pick', 'Partner', 'Defend', ...(showLeaster ? ['Leaster'] : []), 'Pick %'].map(h => (
            <span key={h} style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', textAlign: h ? 'right' : 'left' }}>{h}</span>
          ))}
          {players.filter(pid => roles[pid]?.played || roles[pid]?.leaster).map(pid => {
            const r = roles[pid]
            return [
              <span key={pid + 'n'} style={{ color: 'var(--text-secondary)', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{dn(pid)}</span>,
              ...[r.picking, r.partnering, r.defending, ...(showLeaster ? [r.leaster] : [])].map((v, i) => (
                <span key={pid + i} style={{ textAlign: 'right', fontWeight: 700, color: tone(v) }}>{usd(v)}</span>
              )),
              <span key={pid + 'r'} style={{ textAlign: 'right', color: 'var(--text-secondary)' }}>{r.pickRate}%</span>,
            ]
          })}
        </div>
      </Section>

      {/* Crack scorecard */}
      {cracks.total > 0 && (
        <Section title="Cracks">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {Object.entries(cracks.players).sort((a, b) => b[1].net - a[1].net).map(([pid, c]) => (
              <div key={pid} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                <span style={{ flex: 1, color: 'var(--text-secondary)' }}>{dn(pid)}</span>
                <span style={{ color: 'var(--text-muted)' }}>{c.called} called · {c.won} won</span>
                <span style={{ fontWeight: 800, color: tone(c.net), width: 48, textAlign: 'right' }}>{usd(c.net)}</span>
              </div>
            ))}
            <Fact label="Table" value={`${cracks.total} cracked · ${cracks.worked} worked`} />
          </div>
        </Section>
      )}

      {/* Blitzes tonight: count and blitzer's side won–lost */}
      {blitzers.length > 0 && (
        <Section title="Blitzes">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {blitzers.map(pid => {
              const { black: b, red: r } = stats.blitz[pid]
              return (
                <div key={pid} style={{ fontSize: 12, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <span style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>{dn(pid)}:</span>
                  {b.count > 0 && <span>⚫ {b.count} <span style={{ color: 'var(--text-muted)' }}>({b.wins}-{b.losses})</span></span>}
                  {b.count > 0 && r.count > 0 && <span style={{ color: 'var(--text-muted)' }}>·</span>}
                  {r.count > 0 && <span>🔴 {r.count} <span style={{ color: 'var(--text-muted)' }}>({r.wins}-{r.losses})</span></span>}
                </div>
              )
            })}
          </div>
        </Section>
      )}

      {/* Session facts */}
      <Section title="Session">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
          {biggestHand && (
            <Fact label="Biggest swing" value={`${biggestHand.delta > 0 ? '+' : ''}${biggestHand.delta} · ${dn(biggestHand.pid)} H${biggestHand.handNumber}`} color={biggestHand.delta > 0 ? 'var(--success)' : 'var(--danger)'} />
          )}
          {crackCount > 0 && <Fact label="Cracks" value={`${crackCount} total · ${crackPickerLost} worked`} />}
          {(blackBlitzCount > 0 || redBlitzCount > 0) && <Fact label="Blitzes" value={`♠♣ ×${blackBlitzCount}  ♥♦ ×${redBlitzCount}`} />}
          {doublerCount > 0 && <Fact label="Doubled hands" value={`×${doublerCount}`} />}
          {(allPass.leasters > 0 || allPass.passes > 0) && (
            <Fact label="All pass 🎲" value={`Leasters: ${allPass.leasters} · Doublers thrown: ${allPass.passes}`} />
          )}
          {crackCount === 0 && blackBlitzCount === 0 && redBlitzCount === 0 && doublerCount === 0 && !allPass.leasters && !allPass.passes && (
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
