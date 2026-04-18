import { useRef, useEffect } from 'react'
import Avatar from './Avatar'
import HandIcons from './HandIcons'

function fmt(n) {
  if (n === 0) return <span className="zero">—</span>
  return n > 0 ? <span className="pos">+{n}</span> : <span className="neg">{n}</span>
}

// Approximate row height for 5-row visible window (header ~64px + 5 rows ~44px each)
const VISIBLE_ROWS = 5
const ROW_H        = 44
const HEADER_H     = 64
const MAX_H        = HEADER_H + VISIBLE_ROWS * ROW_H  // 284px

export default function Scoreboard({ players, getPlayer, getDisplayName, hands, totals, dealerPid, onHandClick }) {
  const scrollRef = useRef(null)

  // Auto-scroll to the bottom (most recent hand) whenever a new hand is added
  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [hands.length])

  if (!players.length) return null

  return (
    <div
      ref={scrollRef}
      style={{ overflowX: 'auto', overflowY: 'auto', WebkitOverflowScrolling: 'touch', maxHeight: MAX_H }}
    >
      <table style={{
        width: '100%', borderCollapse: 'collapse',
        minWidth: Math.max(320, players.length * 90 + 96),
        fontSize: 13,
      }}>
        <thead>
          <tr>
            <th style={thStyle()}>Hnd</th>
            {players.map(pid => {
              const p = getPlayer(pid)
              const isDealer = pid === dealerPid
              return (
                <th key={pid} style={thStyle()}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
                    <Avatar player={p} size={26} />
                    <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                      <span>{getDisplayName ? getDisplayName(pid) : (p?.firstName ?? p?.name ?? pid)}</span>
                      {isDealer && (
                        <span style={{
                          fontSize: 9, fontWeight: 800, padding: '1px 4px',
                          background: 'rgba(245,158,11,0.2)', color: 'var(--warning)',
                          borderRadius: 4, letterSpacing: '0.02em',
                        }}>D</span>
                      )}
                    </div>
                  </div>
                </th>
              )
            })}
          </tr>
        </thead>
        <tbody>
          {hands.map(hand => (
            <tr key={hand.id} style={{ borderBottom: '1px solid var(--border)' }}>
              <td style={tdStyle(true)}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                  {/* Clickable hand number */}
                  <span
                    onClick={() => onHandClick?.(hand.id)}
                    style={{
                      fontWeight: 700,
                      color: onHandClick ? 'var(--primary)' : 'var(--text-secondary)',
                      cursor: onHandClick ? 'pointer' : 'default',
                      textDecoration: onHandClick ? 'underline' : 'none',
                      textDecorationStyle: 'dotted',
                    }}
                  >
                    {hand.handNumber}
                  </span>
                  {handBadge(hand)}
                  {/* Card points — no suffix, prominent */}
                  {hand.pickerPoints != null && (
                    <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 700, lineHeight: 1 }}>
                      {hand.pickerPoints}
                    </span>
                  )}
                </div>
              </td>
              {players.map(pid => {
                const delta = hand.scores?.[pid] ?? 0
                const isKey = pid === hand.picker || (!hand.isLoner && pid === hand.partner)
                const isSit = pid === hand.dealerPid
                return (
                  <td key={pid} style={{
                    ...tdStyle(false),
                    background: isKey ? 'rgba(99,102,241,0.04)' : undefined,
                    opacity: isSit ? 0.35 : 1,
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

          {hands.length > 0 && (
            <tr style={{ borderTop: '2px solid var(--border)' }}>
              <td style={{ ...tdStyle(true), color: 'var(--text-muted)', fontSize: 11, fontWeight: 700, textTransform: 'uppercase' }}>Total</td>
              {players.map(pid => (
                <td key={pid} style={{ ...tdStyle(false), fontSize: 16, fontWeight: 800 }}>
                  {fmt(totals[pid] ?? 0)}
                </td>
              ))}
            </tr>
          )}
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

function handBadge(hand) {
  const flags = []
  if (hand.shedClean)      flags.push(<span key="sc" style={pill('var(--success)')}>SC</span>)
  if (hand.pickerNoTricks) flags.push(<span key="nt" style={pill('var(--danger)')}>NT</span>)
  if (hand.isLoner)        flags.push(<span key="ln" style={{ ...pill('var(--warning)'), fontSize: 11 }}>🐺</span>)
  if (hand.lastRound)      flags.push(<span key="lr" style={pill('var(--primary)')}>LR</span>)
  const m = getM(hand)
  if (m > 1)               flags.push(<span key="mx" style={pill('var(--warning)')}>×{m}</span>)
  return flags.length ? <div style={{ display: 'flex', gap: 2, flexWrap: 'wrap', justifyContent: 'center' }}>{flags}</div> : null
}

function pill(color) {
  return { fontSize: 9, fontWeight: 800, color, background: color + '22', borderRadius: 4, padding: '1px 4px', letterSpacing: '0.04em' }
}

function getM(hand) {
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
