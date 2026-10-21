import { useState } from 'react'
import { settleDebts } from '../utils/scoring'
import Avatar from './Avatar'

const APP_URL = 'https://sheepshead-app.vercel.app/'

// ── HTML email builder ────────────────────────────────────────────────────────
function buildHtmlEmail(session, players, totals, getPlayer, dn, transfers) {
  const dateStr = new Date(session.date).toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  })
  const hands = session.hands

  const standings = [...players]
    .map(pid => ({ pid, total: totals[pid] ?? 0 }))
    .sort((a, b) => b.total - a.total)

  const shedCleans = hands.filter(h => h.shedClean).length
  const noTricks   = hands.filter(h => h.pickerNoTricks).length
  const pickCounts = {}
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

  const standingsRows = standings.map(({ pid, total }, i) => {
    const dollar = total >= 0 ? `+$${total.toFixed(2)}` : `-$${Math.abs(total).toFixed(2)}`
    const crown  = i === 0 ? ' 🏆' : ''
    const color  = total > 0 ? '#22c55e' : total < 0 ? '#ef4444' : '#94a3b8'
    return `
      <tr>
        <td style="padding:6px 12px;color:#94a3b8;font-size:13px;">#${i + 1}</td>
        <td style="padding:6px 12px;font-weight:700;font-size:14px;">${dn(pid)}${crown}</td>
        <td style="padding:6px 12px;font-weight:800;color:${color};font-size:14px;">${total > 0 ? '+' : ''}${total} pts</td>
        <td style="padding:6px 12px;color:#94a3b8;font-size:13px;">${dollar}</td>
      </tr>`
  }).join('')

  const transferRows = transfers.length > 0
    ? transfers.map(t => {
        const toP   = getPlayer(t.to)
        const venmo = toP?.venmo
          ? `<br><a href="https://venmo.com/${toP.venmo}?txn=pay&amount=${Math.abs(t.amount).toFixed(2)}&note=Sheepshead" style="color:#6366f1;font-size:12px;">venmo.com/${toP.venmo}</a>`
          : ''
        return `
          <tr>
            <td style="padding:6px 12px;font-size:14px;">
              <span style="color:#ef4444;font-weight:700;">${dn(t.from)}</span>
              <span style="color:#94a3b8;"> pays </span>
              <span style="color:#22c55e;font-weight:700;">${dn(t.to)}</span>
            </td>
            <td style="padding:6px 12px;font-weight:800;font-size:15px;">$${Math.abs(t.amount).toFixed(2)}${venmo}</td>
          </tr>`
      }).join('')
    : `<tr><td colspan="2" style="padding:8px 12px;color:#94a3b8;font-size:13px;">Everyone came out even — no transfers needed!</td></tr>`

  const statItems = [
    `${hands.length} hand${hands.length !== 1 ? 's' : ''} played`,
    biggestPid && biggestDelta !== 0 ? `Biggest swing: ${biggestDelta > 0 ? '+' : ''}$${Math.abs(biggestDelta).toFixed(2)} — ${dn(biggestPid)}, Hand #${biggestHandNum}` : null,
    topPickEntry ? `Most picks: ${dn(topPickEntry[0])} (${topPickEntry[1]}×)` : null,
    shedCleans > 0 ? `Shed clean${shedCleans !== 1 ? 's' : ''}: ${shedCleans} 🍺` : null,
    noTricks > 0   ? `No-tricks (barn): ${noTricks} 💀` : null,
  ].filter(Boolean)

  const statRows = statItems.map(s => `
    <tr><td style="padding:4px 12px;font-size:13px;color:#cbd5e1;">• ${s}</td></tr>`
  ).join('')

  const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#08080f;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#f1f5f9;">
  <div style="max-width:520px;margin:0 auto;padding:24px 16px;">

    <div style="text-align:center;padding:20px 0 16px;">
      <div style="font-size:28px;margin-bottom:6px;">🃏</div>
      <h1 style="margin:0;font-size:22px;font-weight:800;color:#f1f5f9;">Game Night's in the Books!</h1>
      <p style="margin:6px 0 0;font-size:13px;color:#94a3b8;">${dateStr} · The Shed</p>
    </div>

    <div style="background:#10101a;border:1px solid #2a2a42;border-radius:10px;margin-bottom:16px;overflow:hidden;">
      <div style="padding:8px 12px 6px;background:#18182a;border-bottom:1px solid #2a2a42;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:#4a5568;">Final Standings</div>
      <table style="width:100%;border-collapse:collapse;">
        ${standingsRows}
      </table>
    </div>

    <div style="background:#10101a;border:1px solid #2a2a42;border-radius:10px;margin-bottom:16px;overflow:hidden;">
      <div style="padding:8px 12px 6px;background:#18182a;border-bottom:1px solid #2a2a42;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:#4a5568;">Who Owes Whom</div>
      <table style="width:100%;border-collapse:collapse;">
        ${transferRows}
      </table>
    </div>

    <div style="background:#10101a;border:1px solid #2a2a42;border-radius:10px;margin-bottom:24px;overflow:hidden;">
      <div style="padding:8px 12px 6px;background:#18182a;border-bottom:1px solid #2a2a42;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:#4a5568;">Fun Stats</div>
      <table style="width:100%;border-collapse:collapse;">
        ${statRows}
      </table>
    </div>

    <div style="text-align:center;padding-bottom:8px;">
      <p style="margin:0 0 12px;font-size:14px;color:#94a3b8;">Good game all — see you next time! 🍺</p>
      <a href="${APP_URL}" style="display:inline-block;padding:9px 20px;background:#6366f1;color:#fff;text-decoration:none;border-radius:6px;font-size:13px;font-weight:600;">Open The Shed App</a>
    </div>

  </div>
</body>
</html>`

  return { subject, html }
}

// ── Plain-text fallback for mailto ────────────────────────────────────────────
function buildMailtoBody(session, players, totals, getPlayer, dn, transfers) {
  const dateStr = new Date(session.date).toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  })
  const hands = session.hands

  const standings = [...players]
    .map(pid => ({ pid, total: totals[pid] ?? 0 }))
    .sort((a, b) => b.total - a.total)

  const pickCounts = {}
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

  let body = `Game night's in the books! Here's the recap from ${dateStr} at The Shed. 🃏\n\n`
  body += `FINAL STANDINGS\n`
  standings.forEach(({ pid, total }, i) => {
    const dollar = total >= 0 ? `+$${total.toFixed(2)}` : `-$${Math.abs(total).toFixed(2)}`
    body += `  ${i + 1}. ${dn(pid).padEnd(10)} ${(total > 0 ? '+' : '') + total} pts  (${dollar})${i === 0 ? '  🏆' : ''}\n`
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
  if (biggestPid && biggestDelta !== 0) body += `  • Biggest swing: ${biggestDelta > 0 ? '+' : ''}$${Math.abs(biggestDelta).toFixed(2)} — ${dn(biggestPid)}, Hand #${biggestHandNum}\n`
  if (topPickEntry) body += `  • Most picks: ${dn(topPickEntry[0])} (${topPickEntry[1]}x)\n`
  if (hands.filter(h => h.shedClean).length > 0)      body += `  • Shed cleans: ${hands.filter(h => h.shedClean).length} 🍺\n`
  if (hands.filter(h => h.pickerNoTricks).length > 0) body += `  • No-tricks (barn): ${hands.filter(h => h.pickerNoTricks).length} 💀\n`
  body += `\nGood game all — see you next time! 🍺\n\n${APP_URL}`

  return body
}

// ── Confirmation modal ────────────────────────────────────────────────────────
function EmailConfirmModal({ allRecipients, emailTargets, onSend, onClose, sending }) {
  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal animate-slide-up" style={{ maxWidth: 420 }}>
        <div className="modal-header">
          <h2 style={{ fontSize: 16, fontWeight: 700 }}>Send Game Night Summary?</h2>
          <button className="btn btn-ghost btn-icon" onClick={onClose} style={{ fontSize: 18, lineHeight: 1 }} disabled={sending}>✕</button>
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
          <button className="btn btn-ghost" onClick={onClose} disabled={sending}>Cancel</button>
          <button
            className="btn btn-primary"
            onClick={onSend}
            disabled={emailTargets.length === 0 || sending}
            style={{ minWidth: 90 }}
          >
            {sending
              ? <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ width: 14, height: 14, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.7s linear infinite', display: 'inline-block' }} />
                  Sending…
                </span>
              : 'Send'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
/**
 * buildEmail (optional): (transfers) => ({ subject, html, text }) replaces the
 * single-session email — used by Combined Night. The email button shows when
 * either `session` or `buildEmail` is given.
 */
export default function Settlement({ players, totals, getPlayer, getDisplayName, session, buildEmail, autoOpen, onAutoOpenHandled }) {
  const [showModal, setShowModal] = useState(() => !!autoOpen)
  const [sending,   setSending]   = useState(false)
  const [sent,      setSent]      = useState(false)
  const [sendError, setSendError] = useState(null)

  const dn        = getDisplayName ?? ((pid) => getPlayer(pid)?.firstName ?? pid)
  const transfers = settleDebts({ ...totals })

  const canEmail      = Boolean(session || buildEmail)
  const allRecipients = canEmail
    ? players.map(pid => ({ pid, player: getPlayer(pid), email: getPlayer(pid)?.email ?? null }))
    : []
  const emailTargets = allRecipients.filter(r => r.email)

  const handleOpenModal = () => {
    setSendError(null)
    setShowModal(true)
    onAutoOpenHandled?.()
  }

  const handleClose = () => {
    setShowModal(false)
    onAutoOpenHandled?.()
  }

  const handleSend = async () => {
    setSending(true)
    setSendError(null)

    const custom = buildEmail?.(transfers)
    const { subject, html } = custom ?? buildHtmlEmail(session, players, totals, getPlayer, dn, transfers)
    const toList = emailTargets.map(r => r.email)

    let fetchRes = null
    try {
      fetchRes = await fetch('/api/send-summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: toList, subject, html }),
      })

      console.log('[send-summary] response status:', fetchRes.status, fetchRes.statusText)

      if (!fetchRes.ok) {
        const data = await fetchRes.json().catch(() => ({}))
        console.error('[send-summary] error body:', data)
        throw new Error(data.error ?? `Server error ${fetchRes.status}`)
      }

      setSent(true)
      setShowModal(false)
    } catch (err) {
      console.error('[send-summary] caught error:', err.message, '| fetchRes:', fetchRes?.status ?? 'no response')

      // Only fall back to mailto if the endpoint was truly unreachable (no response at all) or 404
      const noResponse = fetchRes === null
      const is404 = fetchRes?.status === 404

      if (noResponse || is404) {
        console.log('[send-summary] falling back to mailto')
        const body = custom ? custom.text : buildMailtoBody(session, players, totals, getPlayer, dn, transfers)
        const bccList = toList.join(',')
        const a = document.createElement('a')
        a.href = `mailto:jaleckson@gmail.com?bcc=${encodeURIComponent(bccList)}&subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
        a.click()
        setSent(true)
        setShowModal(false)
      } else {
        setSendError(err.message ?? 'Failed to send — please try again.')
      }
    } finally {
      setSending(false)
    }
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
      {canEmail && (
        <div style={{ marginTop: 6, paddingTop: 14, borderTop: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 8 }}>
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
            <>
              {sendError && (
                <div style={{
                  padding: '8px 12px', borderRadius: 'var(--radius-sm)',
                  background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)',
                  fontSize: 12, color: 'var(--danger)',
                }}>
                  {sendError}
                </div>
              )}
              <button
                className="btn btn-ghost"
                onClick={handleOpenModal}
                disabled={emailTargets.length === 0}
                title={emailTargets.length === 0 ? 'No players have email addresses on file' : 'Email game night recap to all players'}
                style={{ width: '100%', fontSize: 13, gap: 8 }}
              >
                📧 Send Summary Email
              </button>
            </>
          )}
        </div>
      )}

      {/* ── Confirmation modal ── */}
      {showModal && (
        <EmailConfirmModal
          allRecipients={allRecipients}
          emailTargets={emailTargets}
          onSend={handleSend}
          onClose={handleClose}
          sending={sending}
        />
      )}
    </div>
  )
}
