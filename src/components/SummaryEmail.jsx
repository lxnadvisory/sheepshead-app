import { useState } from 'react'
import { buildPlayerEmail, dollars, shortDate } from '../utils/textTable'
import { useNightShareLink } from './TextTable'
import Avatar from './Avatar'

const TEST_EMAIL = 'jaleckson@gmail.com'

/** POST to the email function; always resolves to { results } or throws a readable Error. */
async function postMessages(messages) {
  let res
  try {
    res = await fetch('/api/send-summary', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages }),
    })
  } catch (err) {
    throw new Error(`Couldn't reach the email server (${err?.message || err}).`)
  }
  const raw = await res.text()
  let data = null
  try { data = JSON.parse(raw) } catch {}
  if (!res.ok || !Array.isArray(data?.results)) {
    const detail = data?.error || raw.trim().split('\n').filter(Boolean).slice(0, 2).join(' · ') || res.statusText
    throw new Error(`Email server error ${res.status}: ${detail}`)
  }
  return data.results
}

/**
 * One personal email per player: their result, who they pay (Venmo links) or
 * who pays them, and the night's stats link. "Send test to me only" sends a
 * single sample to Jake.
 */
export default function SummaryEmail({ players, totals, transfers, getPlayer, getDisplayName, nightDate, sessionIds, onClose }) {
  const dn = getDisplayName ?? (pid => getPlayer(pid)?.firstName ?? pid)
  const { statsUrl, linkError, retry } = useNightShareLink(nightDate, sessionIds)

  const [sending,   setSending]   = useState(null)   // null | 'test' | 'all'
  const [results,   setResults]   = useState({})     // pid → { ok, error }
  const [testNote,  setTestNote]  = useState(null)   // { ok, text }
  const [sendError, setSendError] = useState(null)

  const rows       = players.map(pid => ({ pid, player: getPlayer(pid), email: getPlayer(pid)?.email?.trim() || null }))
  const recipients = rows.filter(r => r.email)
  const emailFor   = pid => buildPlayerEmail({ pid, net: totals[pid] ?? 0, transfers, nightDate, statsUrl, getPlayer, dn })

  // Never re-sends to anyone already marked sent
  const sendAll = async () => {
    setSending('all'); setSendError(null)
    const todo = recipients.filter(r => !results[r.pid]?.ok)
    try {
      const out = await postMessages(todo.map(r => ({ id: r.pid, to: r.email, ...emailFor(r.pid) })))
      setResults(prev => ({ ...prev, ...Object.fromEntries(out.map(r => [r.id, { ok: r.ok, error: r.error }])) }))
    } catch (err) {
      setSendError(err.message)
    } finally {
      setSending(null)
    }
  }

  // Jake's own email if he played, otherwise the first player's, labelled
  const sendTest = async () => {
    setSending('test'); setSendError(null); setTestNote(null)
    const jake   = rows.find(r => r.email?.toLowerCase() === TEST_EMAIL) ?? rows.find(r => r.player?.firstName === 'Jake')
    const sample = jake ?? rows[0]
    const msg    = emailFor(sample.pid)
    if (!jake) msg.subject = `[Test: ${dn(sample.pid)}'s email] ${msg.subject}`
    try {
      const [r] = await postMessages([{ id: sample.pid, to: TEST_EMAIL, ...msg }])
      setTestNote(r.ok
        ? { ok: true,  text: `Test sent to ${TEST_EMAIL} (${dn(sample.pid)}'s email). Check Gmail, including Spam.` }
        : { ok: false, text: `Test failed: ${r.error}` })
    } catch (err) {
      setSendError(err.message)
    } finally {
      setSending(null)
    }
  }

  const sentCount   = Object.values(results).filter(r => r.ok).length
  const failedCount = Object.values(results).filter(r => !r.ok).length
  const ready       = Boolean(statsUrl) && !sending

  const banner = (tone, children) => (
    <div style={{
      padding: '8px 12px', borderRadius: 'var(--radius-sm)', fontSize: 12, lineHeight: 1.5,
      background: tone === 'ok' ? 'rgba(34,197,94,0.1)' : tone === 'warn' ? 'rgba(245,158,11,0.1)' : 'rgba(239,68,68,0.1)',
      border: `1px solid ${tone === 'ok' ? 'rgba(34,197,94,0.3)' : tone === 'warn' ? 'rgba(245,158,11,0.3)' : 'rgba(239,68,68,0.3)'}`,
      color: tone === 'ok' ? 'var(--success)' : tone === 'warn' ? 'var(--warning)' : 'var(--danger)',
    }}>{children}</div>
  )

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && !sending && onClose()}>
      <div className="modal animate-slide-up" style={{ maxWidth: 460 }}>
        <div className="modal-header">
          <h2 style={{ fontSize: 16, fontWeight: 700 }}>Email the table · {shortDate(nightDate)}</h2>
          <button className="btn btn-ghost btn-icon" onClick={onClose} disabled={!!sending} style={{ fontSize: 18, lineHeight: 1 }}>✕</button>
        </div>

        <div className="modal-body" style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
            Each player gets their own email: their result, who to pay (with Venmo links) or who pays them, and the stats link.
          </div>

          {linkError && banner('err', <>{linkError} <button className="btn btn-ghost btn-sm" onClick={retry}>Retry</button></>)}
          {!linkError && !statsUrl && <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Creating the stats link…</div>}
          {sendError && banner('err', sendError)}
          {testNote && banner(testNote.ok ? 'ok' : 'err', testNote.text)}
          {(sentCount + failedCount) > 0 && banner(failedCount ? 'warn' : 'ok', `${sentCount} sent${failedCount ? `, ${failedCount} failed` : ''}.`)}
          {recipients.length === 0 && banner('warn', 'No players have email addresses on file. Add emails via the Roster tab.')}

          {rows.map(({ pid, player, email }) => {
            const r   = results[pid]
            const net = totals[pid] ?? 0
            return (
              <div key={pid} style={{ display: 'flex', alignItems: 'center', gap: 10, opacity: email ? 1 : 0.45 }}>
                <Avatar player={player} size={22} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ fontWeight: 600, fontSize: 13 }}>{dn(pid)}</span>
                  <span style={{ fontSize: 12, marginLeft: 6, color: net > 0 ? 'var(--success)' : net < 0 ? 'var(--danger)' : 'var(--text-muted)' }}>
                    {Math.abs(net) < 0.005 ? 'even' : `${net > 0 ? '+' : '-'}${dollars(net)}`}
                  </span>
                  <div style={{ fontSize: 11, color: email ? 'var(--text-muted)' : 'var(--danger)', fontStyle: email ? 'normal' : 'italic', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {email ?? '(no email)'}
                  </div>
                  {r && !r.ok && <div style={{ fontSize: 11, color: 'var(--danger)' }}>{r.error}</div>}
                </div>
                {r && <span style={{ fontSize: 11, fontWeight: 700, color: r.ok ? 'var(--success)' : 'var(--danger)' }}>{r.ok ? '✓ sent' : 'failed'}</span>}
              </div>
            )
          })}
        </div>

        <div className="modal-footer" style={{ flexWrap: 'wrap' }}>
          <button className="btn btn-ghost" onClick={sendTest} disabled={!ready || rows.length === 0}>
            {sending === 'test' ? 'Sending…' : 'Send test to me only'}
          </button>
          <button className="btn btn-primary" onClick={sendAll} disabled={!ready || recipients.length === 0 || sentCount === recipients.length} style={{ minWidth: 120 }}>
            {sending === 'all' ? 'Sending…'
              : sentCount === recipients.length && sentCount > 0 ? 'All sent'
              : failedCount ? `Retry ${failedCount} failed`
              : `Send to ${recipients.length} player${recipients.length !== 1 ? 's' : ''}`}
          </button>
        </div>
      </div>
    </div>
  )
}
