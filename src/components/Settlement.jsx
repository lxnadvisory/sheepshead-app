import { useState } from 'react'
import { settleDebts } from '../utils/scoring'
import Avatar from './Avatar'

const FROM_EMAIL = 'jaleckson@gmail.com'
const APP_URL    = 'https://sheepshead-app.vercel.app/'

// ── Email content builder ─────────────────────────────────────────────────────
function buildEmail(session, players, totals, getPlayer, dn, transfers) {
  const dateStr = new Date(session.date).toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  })
  const hands = session.hands

  // Standings
  const standings = [...players]
    .map(pid => ({ pid, total: totals[pid] ?? 0 }))
    .sort((a, b) => b.total - a.total)

  // Fun stats
  const shedCleans  = hands.filter(h => h.shedClean).length
  const noTricks    = hands.filter(h => h.pickerNoTricks).length
  const pickCounts  = {}
  hands.forEach(h => { if (h.picker) pickCounts[h.picker] = (pickCounts[h.picker] ?? 0) + 1 })
  const topPickEntry = Object.entries(pickCounts).sort((a, b) => b[1] - a[1])[0]

  let biggestDelta = 0, biggestPid = null, biggestHandNum = null
  hands.forEach(h => {
    Object.entries(h.scores ?? {}).forEach(([pid, delta]) => {
      if (Math.abs(delta) > Math.abs(biggestDelta)) {
        biggestDelta = delta; biggestPid = pid; biggestHandNum = h.handNumber
      }
    })
  })

  const subject = `Sheepshead Night — ${dateStr}`

  let body = `Game night's in the books! Here's the recap from ${dateStr} at The Shed. 🃏\n\n`

  body += `FINAL STANDINGS\n`
  standings.forEach(({ pid, total }, i) => {
    const sign   = total > 0 ? '+' : ''
    const dollar = total >= 0 ? `+$${total.toFixed(2)}` : `-$${Math.abs(total).toFixed(2)}`
    const crown  = i === 0 ? '  🏆' : ''
    body += `  ${i + 1}. ${dn(pid).padEnd(10)} ${(sign + total).padStart(5)} pts  (${dollar})${crown}\n`
  })

  if (transfers.length > 0) {
    body += `\nWHO OWES WHOM\n`
    transfers.forEach(t => {
      const toP   = getPlayer(t.to)
      const venmo = toP?.venmo ? `  → venmo.com/${toP.venmo}` : ''
      body += `  • ${dn(t.from)} pays ${dn(t.to)} $${Math.abs(t.amount).toFixed(2)}${venmo}\n`
    })
  } else {
    body += `\nEveryone came out even — no transfers needed!\n`
  }

  body += `\nFUN STATS\n`
  body += `  • ${hands.length} hand${hands.length !== 1 ? 's' : ''} played\n`
  if (biggestPid && biggestDelta !== 0) {
    const sign = biggestDelta > 0 ? '+' : ''
    body += `  • Biggest swing: ${sign}$${Math.abs(biggestDelta).toFixed(2)} — ${dn(biggestPid)}, Hand #${biggestHandNum}\n`
  }
  if (topPickEntry)  body += `  • Most picks: ${dn(topPickEntry[0])} (${topPickEntry[1]}x)\n`
  if (shedCleans > 0) body += `  • Shed clean${shedCleans !== 1 ? 's' : ''}: ${shedCleans} 🍺\n`
  if (noTricks > 0)   body += `  • No-tricks (barn): ${noTricks} 💀\n`

  body += `\nGood game all — see you next time! 🍺\n\n${APP_URL}`

  return { subject, body }
}

// ── Confirmation modal ────────────────────────────────────────────────────────
function EmailConfirmModal({ allRecipients, emailTargets, onSend, onClose }) {
  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal animate-slide-up" style={{ maxWidth: 420 }}>
        <div className="modal-header">
          <h2 style={{ fontSize: 16, fontWeight: 700 }}>Send Game Night Summary?</h2>
          <button className="btn btn-ghost btn-icon" onClick={onClose} style={{ fontSize: 18, lineHeight: 1 }}>✕</button>
        </div>

        <div className="modal-body" style={{ padding: '14px 20px' }}>
          <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 14 }}>
            Send a game night summary to all players?
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
            {allRecipients.map(({ pid, player, email }) => (
              <div key={pid} style={{
                display: 'flex', alignItems: 'center', gap: 10,
                opacity: email ? 1 : 0.4,
              }}>
                <Avatar player={player} size={22} />
                <span style={{ fontWeight: 600, fontSize: 13, flex: 1 }}>
                  {player?.firstName ?? pid}
                </span>
                <span style={{
                  fontSize: 11,
                  color: email ? 'var(--text-muted)' : 'var(--danger)',
                  fontStyle: email ? 'normal' : 'italic',
                }}>
                  {email ?? '(no email)'}
                </span>
              </div>
            ))}
          </div>

          {emailTargets.length === 0 && (
            <div style={{
              marginTop: 14, padding: '8px 12px',
              background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)',
              borderRadius: 'var(--radius-sm)', fontSize: 12, color: 'var(--warning)',
            }}>
              No players have email addresses on file. Add emails via the Roster tab.
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button
            className="btn btn-primary"
            onClick={onSend}
            disabled={emailTargets.length === 0}
          >
            Send
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
export default function Settlement({ players, totals, getPlayer, getDisplayName, session }) {
  const [showModal, setShowModal] = useState(false)
  const [sent,      setSent]      = useState(false)

  const dn        = getDisplayName ?? ((pid) => getPlayer(pid)?.firstName ?? pid)
  const transfers = settleDebts({ ...totals })

  // Build recipient list for the modal
  const allRecipients = session
    ? players.map(pid => ({ pid, player: getPlayer(pid), email: getPlayer(pid)?.email ?? null }))
    : []
  const emailTargets = allRecipients.filter(r => r.email)

  const handleSend = () => {
    const { subject, body } = buildEmail(session, players, totals, getPlayer, dn, transfers)
    const bccList = emailTargets.map(r => r.email).join(',')

    // Primary: open system mail client via mailto (works without a backend)
    const a  = document.createElement('a')
    a.href   = `mailto:${FROM_EMAIL}?bcc=${encodeURIComponent(bccList)}&subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
    a.click()

    setSent(true)
    setShowModal(false)
  }

  const noTransfers = transfers.length === 0

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>

      {/* ── Transfers ── */}
      {noTransfers ? (
        <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--text-muted)' }}>
          No transfers needed — everyone is square!
        </div>
      ) : (
        transfers.map((t, i) => {
          const from     = getPlayer(t.from)
          const to       = getPlayer(t.to)
          const venmoUrl = `https://venmo.com/${to?.venmo ?? dn(t.to)}?txn=pay&amount=${Math.abs(t.amount).toFixed(2)}&note=Sheepshead`
          return (
            <div key={i} style={{
              background: 'var(--bg-elevated)', border: '1px solid var(--border)',
              borderRadius: 'var(--radius)', padding: '14px 16px',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <Avatar player={from} size={24} />
                  <span style={{ fontWeight: 700, color: 'var(--danger)' }}>{dn(t.from)}</span>
                </div>
                <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>owes</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <Avatar player={to} size={24} />
                  <span style={{ fontWeight: 700, color: 'var(--success)' }}>{dn(t.to)}</span>
                </div>
                <span style={{ fontWeight: 800, fontSize: 18, color: 'var(--text-primary)', marginLeft: 'auto' }}>
                  ${Math.abs(t.amount).toFixed(2)}
                </span>
              </div>
              {to?.venmo && (
                <a href={venmoUrl} target="_blank" rel="noreferrer" className="btn btn-primary btn-sm" style={{ flexShrink: 0 }}>Venmo</a>
              )}
            </div>
          )
        })
      )}

      {/* ── Final Standings ── */}
      {!noTransfers && <div className="divider" />}

      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
        Final Standings
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {players
          .map(pid => ({ pid, total: totals[pid] ?? 0 }))
          .sort((a, b) => b.total - a.total)
          .map(({ pid, total }, rank) => {
            const p     = getPlayer(pid)
            const isPos = total > 0, isNeg = total < 0
            return (
              <div key={pid} style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '10px 14px',
                background: 'var(--bg-elevated)',
                border: `1px solid ${isPos ? 'rgba(34,197,94,0.2)' : isNeg ? 'rgba(239,68,68,0.2)' : 'var(--border)'}`,
                borderRadius: 'var(--radius)',
              }}>
                <span style={{ width: 22, textAlign: 'center', color: 'var(--text-muted)', fontSize: 12, fontWeight: 700 }}>#{rank + 1}</span>
                <Avatar player={p} size={28} />
                <span style={{ flex: 1, fontWeight: 700 }}>{dn(pid)}</span>
                <span style={{ fontSize: 18, fontWeight: 800, color: isPos ? 'var(--success)' : isNeg ? 'var(--danger)' : 'var(--text-muted)' }}>
                  {total > 0 ? '+' : ''}{total}
                </span>
                <span style={{ color: 'var(--text-muted)', fontSize: 12, fontWeight: 600 }}>
                  {total >= 0 ? `+$${total.toFixed(2)}` : `-$${Math.abs(total).toFixed(2)}`}
                </span>
              </div>
            )
          })}
      </div>

      {/* ── Email summary button (only when session data is present) ── */}
      {session && (
        <div style={{ marginTop: 6, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
          {sent ? (
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              padding: '10px 16px', borderRadius: 'var(--radius)',
              background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.3)',
              color: 'var(--success)', fontWeight: 700, fontSize: 13,
            }}>
              ✓ Summary sent!
            </div>
          ) : (
            <button
              className="btn btn-ghost"
              onClick={() => setShowModal(true)}
              disabled={emailTargets.length === 0}
              title={emailTargets.length === 0 ? 'No players have email addresses on file' : 'Email game night recap to all players'}
              style={{ width: '100%', fontSize: 13, gap: 8 }}
            >
              📧 Send Summary Email
            </button>
          )}
        </div>
      )}

      {/* ── Confirmation modal ── */}
      {showModal && (
        <EmailConfirmModal
          allRecipients={allRecipients}
          emailTargets={emailTargets}
          onSend={handleSend}
          onClose={() => setShowModal(false)}
        />
      )}
    </div>
  )
}
