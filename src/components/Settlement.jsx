import { useState } from 'react'
import { settleDebts } from '../utils/scoring'
import Avatar from './Avatar'
import TextTable from './TextTable'
import SummaryEmail from './SummaryEmail'

// ── Main component ────────────────────────────────────────────────────────────
/**
 * textNight (optional): { nightDate: 'YYYY-MM-DD', sessionIds } shows the
 * "Email the table" and "Text the table" buttons; updatePlayer saves
 * phone/venmo added inline. autoOpen opens the email dialog on mount.
 */
export default function Settlement({ players, totals, getPlayer, getDisplayName, autoOpen, onAutoOpenHandled, textNight, updatePlayer }) {
  const [showEmail, setShowEmail] = useState(() => !!autoOpen && !!textNight)
  const [showText,  setShowText]  = useState(false)

  const dn        = getDisplayName ?? ((pid) => getPlayer(pid)?.firstName ?? pid)
  const transfers = settleDebts({ ...totals })

  const closeEmail = () => {
    setShowEmail(false)
    onAutoOpenHandled?.()
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

      {/* ── Email / text the table ── */}
      {textNight && (
        <div style={{ marginTop: 6, paddingTop: 14, borderTop: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <button className="btn btn-ghost" onClick={() => setShowEmail(true)} style={{ width: '100%', fontSize: 13, gap: 8 }}>
            📧 Email the table
          </button>
          <button className="btn btn-ghost" onClick={() => setShowText(true)} style={{ width: '100%', fontSize: 13, gap: 8 }}>
            💬 Text the table
          </button>
        </div>
      )}
      {showEmail && (
        <SummaryEmail
          players={players}
          totals={totals}
          transfers={transfers}
          getPlayer={getPlayer}
          getDisplayName={getDisplayName}
          nightDate={textNight.nightDate}
          sessionIds={textNight.sessionIds}
          onClose={closeEmail}
        />
      )}
      {showText && (
        <TextTable
          players={players}
          totals={totals}
          transfers={transfers}
          getPlayer={getPlayer}
          getDisplayName={getDisplayName}
          updatePlayer={updatePlayer}
          nightDate={textNight.nightDate}
          sessionIds={textNight.sessionIds}
          onClose={() => setShowText(false)}
        />
      )}

    </div>
  )
}
