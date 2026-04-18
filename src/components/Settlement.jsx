import { settleDebts } from '../utils/scoring'
import Avatar from './Avatar'

export default function Settlement({ players, totals, getPlayer, getDisplayName }) {
  const dn = getDisplayName ?? ((pid) => getPlayer(pid)?.firstName ?? pid)
  const transfers = settleDebts({ ...totals })

  if (transfers.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--text-muted)' }}>
        No transfers needed — everyone is square!
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {transfers.map((t, i) => {
        const from = getPlayer(t.from)
        const to   = getPlayer(t.to)
        const venmoUrl = `https://venmo.com/${to?.venmo ?? dn(t.to)}?txn=pay&amount=${Math.abs(t.amount).toFixed(2)}&note=Sheepshead`
        return (
          <div key={i} style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '14px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
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
      })}

      <div className="divider" />

      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Final Standings</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {players
          .map(pid => ({ pid, total: totals[pid] ?? 0 }))
          .sort((a, b) => b.total - a.total)
          .map(({ pid, total }, rank) => {
            const p = getPlayer(pid)
            const isPos = total > 0, isNeg = total < 0
            return (
              <div key={pid} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', background: 'var(--bg-elevated)', border: `1px solid ${isPos ? 'rgba(34,197,94,0.2)' : isNeg ? 'rgba(239,68,68,0.2)' : 'var(--border)'}`, borderRadius: 'var(--radius)' }}>
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
    </div>
  )
}
