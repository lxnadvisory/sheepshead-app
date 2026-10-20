import { useRef, useEffect } from 'react'
import Avatar from './Avatar'
import HandIcons from './HandIcons'

function fmt(n) {
  if (n === 0) return <span className="zero">—</span>
  return n > 0 ? <span className="pos">+{n}</span> : <span className="neg">{n}</span>
}

function isPickerSchneidered(hand) {
  if (!hand.picker || hand.shedClean) return false
  return hand.pickerNoTricks || (hand.pickerPoints != null && hand.pickerPoints < 30)
}

function handMult(hand) {
  let m = 1
  const dc = hand.doublerCount ?? (hand.doubler ? 1 : 0)
  if (dc > 0) m *= Math.pow(2, Math.min(dc, 4))
  if ((hand.crackers?.length ?? 0) > 0 || hand.crack)     m *= 2
  if ((hand.recrackers?.length ?? 0) > 0 || hand.reCrack)  m *= 2
  const bv = hand.blitzes ? Object.values(hand.blitzes) : []
  if (bv.some(b => b.black) || hand.blackBlitz || hand.blitz) m *= 2
  if (bv.some(b => b.red)   || hand.redBlitz   || hand.blitz) m *= 2
  if (hand.lastRound) m *= 2
  return Math.min(m, 16)
}

function handTier(hand) {
  if (hand.shedClean)          return 'Shed Clean'
  if (hand.pickerNoTricks)     return 'No Tricks'
  if (hand.pickerPoints >= 91) return 'High Win'
  if (hand.pickerPoints >= 61) return 'Win'
  if (hand.pickerPoints >= 30) return 'Bumped'
  return 'No Schneider'
}

function pill(color) {
  return { fontSize: 9, fontWeight: 800, color, background: color + '22', borderRadius: 4, padding: '1px 4px', letterSpacing: '0.04em' }
}

function handBadge(hand) {
  if (hand.handType === 'fup') {
    return <span style={{ fontSize: 13, lineHeight: 1 }} title={hand.note || 'F-Up'}>💩</span>
  }
  const flags = []
  if (hand.shedClean)      flags.push(<span key="sc" style={pill('var(--success)')}>SC</span>)
  if (hand.pickerNoTricks) flags.push(<span key="nt" style={pill('var(--danger)')}>NT</span>)
  if (hand.isLoner)        flags.push(<span key="ln" style={{ ...pill('var(--warning)'), fontSize: 11 }}>🐺</span>)
  if (hand.lastRound)      flags.push(<span key="lr" style={pill('var(--primary)')}>LR</span>)
  const m = handMult(hand)
  if (m > 1)               flags.push(<span key="mx" style={pill('var(--warning)')}>×{m}</span>)
  return flags.length ? <div style={{ display: 'flex', gap: 2, flexWrap: 'wrap', justifyContent: 'center' }}>{flags}</div> : null
}

// Header row height (avatar 48 + name + total + padding) + big card (info row + tiles) + N compact rows
const HEADER_H  = 108
const BIG_H     = 168
const VISIBLE   = 4
const ROW_H     = 44
const MAX_H     = HEADER_H + BIG_H + VISIBLE * ROW_H

// ── Big card: two <tr> elements for the most recent hand ─────────────────────
function BigCardRows({ hand, players, getPlayer, getDisplayName, leftPlayers, onEdit, onDelete }) {
  const isFup       = hand.handType === 'fup'
  const schneidered = !isFup && isPickerSchneidered(hand)
  const mult        = !isFup ? handMult(hand) : 1
  const tier        = !isFup ? handTier(hand) : null
  const accent      = isFup ? 'var(--danger)' : 'var(--primary)'
  const bgInfo      = isFup ? 'rgba(239,68,68,0.06)' : 'rgba(99,102,241,0.07)'
  const bgTiles     = isFup ? 'rgba(239,68,68,0.02)' : 'rgba(99,102,241,0.03)'

  return (
    <>
      {/* Hand info row — spans all columns */}
      <tr style={{ borderTop: `2px solid ${accent}`, background: bgInfo }}>
        <td colSpan={players.length + 1} style={{ padding: '10px 14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ color: 'var(--text-muted)', fontWeight: 700, fontSize: 12 }}>#{hand.handNumber}</span>
              {isFup ? (
                <>
                  <span style={{ fontSize: 16 }}>💩</span>
                  <span style={{ fontWeight: 800 }}>F-Up</span>
                  <span style={{ color: 'var(--danger)', fontWeight: 700 }}>{getDisplayName(hand.offenderId)}</span>
                  {hand.note && <span style={{ fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic' }}>"{hand.note}"</span>}
                </>
              ) : (
                <>
                  <span style={{ fontWeight: 800, fontSize: 15 }}>
                    {getDisplayName(hand.picker)}{schneidered && <span style={{ marginLeft: 4 }}>✂️</span>}
                  </span>
                  {!hand.isLoner && hand.partner && (
                    <><span style={{ color: 'var(--text-muted)', fontSize: 14 }}>+</span>
                    <span style={{ fontWeight: 700, fontSize: 14 }}>{getDisplayName(hand.partner)}</span></>
                  )}
                  {hand.isLoner && <span style={{ fontSize: 16 }}>🐺</span>}
                  <span className="badge badge-primary" style={{ fontSize: 11 }}>{tier}</span>
                  {hand.pickerPoints != null && (
                    <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 700 }}>{hand.pickerPoints} pts</span>
                  )}
                  {mult > 1 && <span style={{ fontSize: 13, color: 'var(--warning)', fontWeight: 800 }}>×{mult}</span>}
                </>
              )}
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button className="btn btn-ghost btn-sm" onClick={() => onEdit?.(hand.id)}>Edit</button>
              <button className="btn btn-danger btn-sm" onClick={() => onDelete?.(hand.id)}>Delete</button>
            </div>
          </div>
        </td>
      </tr>

      {/* Player tiles row — one <td> per player column */}
      <tr style={{ borderBottom: `2px solid ${accent}`, background: bgTiles }}>
        <td style={tdStyle(true)} />
        {players.map(pid => {
          const p      = getPlayer(pid)
          const delta  = hand.scores?.[pid] ?? 0
          const isSat  = !isFup && pid === hand.dealerPid
          const isLeft = leftPlayers.includes(pid)

          let role = null
          if (isFup) {
            if (pid === hand.offenderId) role = 'OFFENDER'
          } else {
            if (pid === hand.picker)                        role = hand.isLoner ? 'LONER' : 'PICKER'
            else if (!hand.isLoner && pid === hand.partner) role = 'PARTNER'
            else if (isSat)                                 role = 'SAT OUT'
          }

          return (
            <td key={pid} style={{ ...tdStyle(false), padding: '8px 4px', opacity: (isSat || isLeft) ? 0.45 : 1 }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <div style={{ height: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 3 }}>
                  {role && (
                    <span style={{
                      fontSize: 9, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.04em',
                      color: role === 'OFFENDER' ? 'var(--danger)' : 'var(--text-muted)',
                      whiteSpace: 'nowrap',
                    }}>
                      {role}
                    </span>
                  )}
                </div>
                {!isFup && <HandIcons hand={hand} pid={pid} size={11} showLoner={true} />}
                <span style={{
                  fontSize: 22, fontWeight: 900, lineHeight: 1, marginTop: 2,
                  color: delta > 0 ? 'var(--success)' : delta < 0 ? 'var(--danger)' : 'var(--text-muted)',
                }}>
                  {delta > 0 ? `+${delta}` : delta === 0 ? '—' : delta}
                </span>
              </div>
            </td>
          )
        })}
      </tr>
    </>
  )
}

// ── Main export ───────────────────────────────────────────────────────────────
export default function Scoreboard({ players, getPlayer, getDisplayName, hands, totals, dealerPid, leftPlayers = [], onEditHand, onDeleteHand }) {
  const scrollRef = useRef(null)

  // Scroll the internal container to top whenever a hand is added or removed
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 0
  }, [hands.length])

  if (!players.length) return null

  const mostRecent   = hands.length > 0 ? hands[hands.length - 1] : null
  const earlierHands = hands.length > 1 ? [...hands.slice(0, -1)].reverse() : []

  return (
    <div
      ref={scrollRef}
      style={{ overflowX: 'auto', overflowY: 'auto', WebkitOverflowScrolling: 'touch', maxHeight: MAX_H }}
    >
      <table style={{
        width: '100%', borderCollapse: 'collapse',
        minWidth: Math.max(320, players.length * 100 + 96),
        fontSize: 13,
      }}>

        {/* ── Header: avatar + name + running total ── */}
        <thead>
          <tr>
            <th style={thStyle()}>Hnd</th>
            {players.map(pid => {
              const p        = getPlayer(pid)
              const isDealer = pid === dealerPid
              const isLeft   = leftPlayers.includes(pid)
              const total    = totals[pid] ?? 0
              return (
                <th key={pid} style={{ ...thStyle(), opacity: isLeft ? 0.45 : 1 }}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
                    <div style={{ position: 'relative' }}>
                      <Avatar player={p} size={48} />
                      {isDealer && !isLeft && (
                        <span style={{
                          position: 'absolute', bottom: -4, right: -6,
                          fontSize: 16, lineHeight: 1,
                          filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.5))',
                        }}>🍆</span>
                      )}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                      <span style={{ color: isLeft ? 'var(--text-muted)' : undefined }}>
                        {getDisplayName ? getDisplayName(pid) : (p?.firstName ?? p?.name ?? pid)}
                      </span>
                      {isLeft && (
                        <span style={{
                          fontSize: 9, fontWeight: 800, padding: '1px 4px',
                          background: 'rgba(239,68,68,0.15)', color: 'var(--danger)',
                          borderRadius: 4, letterSpacing: '0.02em',
                        }}>Left</span>
                      )}
                    </div>
                    <span style={{
                      fontSize: 20, fontWeight: 900, lineHeight: 1,
                      color: total > 0 ? 'var(--success)' : total < 0 ? 'var(--danger)' : 'var(--text-muted)',
                    }}>
                      {total > 0 ? `+${total}` : total === 0 ? '0' : total}
                    </span>
                  </div>
                </th>
              )
            })}
          </tr>
        </thead>

        <tbody>
          {/* Empty state */}
          {hands.length === 0 && (
            <tr>
              <td colSpan={players.length + 1} style={{ textAlign: 'center', padding: '36px 0', color: 'var(--text-muted)', fontSize: 13 }}>
                No hands yet — log the first one!
              </td>
            </tr>
          )}

          {/* Most recent hand as inline big card */}
          {mostRecent && (
            <BigCardRows
              hand={mostRecent}
              players={players}
              getPlayer={getPlayer}
              getDisplayName={getDisplayName}
              leftPlayers={leftPlayers}
              onEdit={onEditHand}
              onDelete={onDeleteHand}
            />
          )}

          {/* Earlier hands — compact rows, newest first */}
          {earlierHands.map(hand => (
            <tr key={hand.id} style={{ borderBottom: '1px solid var(--border)' }}>
              <td style={tdStyle(true)}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                    <span style={{ fontWeight: 700, color: 'var(--text-secondary)' }}>
                      {hand.handNumber}
                    </span>
                    {onEditHand && (
                      <button
                        onClick={() => onEditHand(hand.id)}
                        title="Edit hand"
                        style={{
                          background: 'none', border: 'none', cursor: 'pointer',
                          color: 'var(--text-muted)', fontSize: 11, lineHeight: 1,
                          padding: '1px 3px', borderRadius: 3, opacity: 0.65,
                        }}
                      >✎</button>
                    )}
                  </div>
                  {handBadge(hand)}
                  {hand.pickerPoints != null && (
                    <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 700, lineHeight: 1 }}>
                      {hand.pickerPoints}
                    </span>
                  )}
                </div>
              </td>
              {players.map(pid => {
                const delta  = hand.scores?.[pid] ?? 0
                const isKey  = pid === hand.picker || (!hand.isLoner && pid === hand.partner)
                const isSit  = pid === hand.dealerPid
                const isLeft = leftPlayers.includes(pid)
                return (
                  <td key={pid} style={{
                    ...tdStyle(false),
                    background: isKey && !isLeft ? 'rgba(99,102,241,0.04)' : undefined,
                    opacity: isSit || isLeft ? 0.35 : 1,
                  }}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
                      {fmt(delta)}
                      <HandIcons hand={hand} pid={pid} size={10} showLoner={true} />
                    </div>
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function thStyle() {
  return {
    padding: '10px 12px', textAlign: 'center',
    color: 'var(--text-secondary)', fontSize: 12, fontWeight: 700,
    textTransform: 'uppercase', letterSpacing: '0.04em',
    borderBottom: '2px solid var(--border)',
    background: 'var(--bg-elevated)',
    position: 'sticky', top: 0, zIndex: 2, whiteSpace: 'nowrap',
  }
}

function tdStyle(isFirst) {
  return {
    padding: '8px 12px', textAlign: 'center', verticalAlign: 'middle',
    fontWeight: isFirst ? 600 : 700, fontSize: 14,
    color: isFirst ? 'var(--text-secondary)' : undefined,
    minWidth: isFirst ? 56 : undefined,
  }
}
