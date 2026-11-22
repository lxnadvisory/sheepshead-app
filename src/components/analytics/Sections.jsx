import { PlayerName, Money, money } from './ui'
import { MIN_SEAT_PICKS, MIN_PARTNER_HANDS, MIN_BLITZES } from '../../lib/analytics'

// Picking by Seat · Partners · Blitzes. Real hands only (no F-Ups, leasters or
// passes). A % shows once its sample minimum is met; below it the raw counts
// show, greyed. One night: counts.

export const SEAT_LABELS = { 1: 'Under the gun', 2: '2nd', 3: '3rd', 4: '4th', 5: 'Last / dealer' }

/** % when the sample is big enough, otherwise "num/den" greyed (counts on a single night). */
export function RateText({ r, single }) {
  if (!r || !r.den) return <span className="an-muted">—</span>
  if (single) return <span className="an-num">{r.num}/{r.den}</span>
  if (r.ok) return <span className="an-num">{Math.round(r.pct * 100)}%</span>
  return <span className="an-num an-muted" title="Not enough hands yet for a %">{r.num}/{r.den}</span>
}

const wl = (w, l) => <span className="an-num">{w}–{l}</span>
const cents = n => (n == null ? '—' : money(n, { cents: true }))

// ── Picking by Seat ───────────────────────────────────────────────────────────

export function SeatTable({ seats }) {
  return (
    <div className="an-scroll">
      <table className="an-table">
        <thead>
          <tr><th>Seat</th><th className="an-r">Hands</th><th className="an-r">Pick %</th><th className="an-r">Picker W–L</th><th className="an-r">Win %</th><th className="an-r">$ / pick</th><th className="an-r">Loners</th></tr>
        </thead>
        <tbody>
          {seats.table.map(t => (
            <tr key={t.pos}>
              <td><span className="an-num">{t.pos}</span> <span className="an-muted">· {SEAT_LABELS[t.pos]}</span></td>
              <td className="an-r an-num">{t.hands}</td>
              <td className="an-r"><RateText r={t.pickRate} single={seats.single} /></td>
              <td className="an-r">{t.picks ? wl(t.wins, t.picks - t.wins) : <span className="an-muted">—</span>}</td>
              <td className="an-r"><RateText r={t.pickWin} single={seats.single} /></td>
              <td className="an-r">{t.perPick == null ? <span className="an-muted">—</span> : <Money value={t.perPick} />}</td>
              <td className="an-r an-num">{t.loners || <span className="an-muted">0</span>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function SeatMatrix({ seats, ids, ctx }) {
  const rows = ids.filter(pid => seats.players[pid])
  if (!rows.length) return <div className="an-empty">No hands with a recorded dealer yet.</div>
  return (
    <div className="an-scroll">
      <table className="an-table an-seat-matrix">
        <thead>
          <tr><th>Player</th>{[1, 2, 3, 4, 5].map(n => <th key={n} className="an-c" title={SEAT_LABELS[n]}>{n}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map(pid => {
            const sp = seats.players[pid]
            return (
              <tr key={pid}>
                <td><PlayerName pid={pid} ctx={ctx} size={24} /></td>
                {[1, 2, 3, 4, 5].map(n => {
                  const c = sp.cells[n]
                  const cls = n === sp.best ? 'an-seat-best' : n === sp.worst ? 'an-seat-worst' : ''
                  return (
                    <td key={n} className={`an-c ${cls}`} title={n === sp.best ? 'Best seat' : n === sp.worst ? 'Worst seat' : undefined}>
                      {c ? (
                        <span className="an-num">
                          {c.picks}/{c.chances}
                          {c.picks > 0 && <> · <RateText r={c.winRate} single={seats.single} /></>}
                        </span>
                      ) : <span className="an-muted">—</span>}
                    </td>
                  )
                })}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

export function SeatFootnote({ seats }) {
  return (
    <div className="an-footnote">
      Position stats start from hands where the dealer was recorded ({seats.known} of {seats.total} hands).
      Cells read picks / chances · win %; best and worst seats need {MIN_SEAT_PICKS}+ picks there.
    </div>
  )
}

// ── Partners ──────────────────────────────────────────────────────────────────

export function PartnersTable({ a, ids, ctx }) {
  const P = a.players, single = a.single
  const rows = ids.filter(pid => P[pid].asPartner?.hands > 0)
    .sort((x, y) => (P[y].asPartner.perHandOk ? P[y].asPartner.perHand : -1e9) - (P[x].asPartner.perHandOk ? P[x].asPartner.perHand : -1e9) || P[y].asPartner.times - P[x].asPartner.times)
  return (
    <div className="an-scroll">
      <table className="an-table">
        <thead>
          <tr>
            <th>Player</th><th className="an-r">Hands</th><th className="an-r">Partner</th><th className="an-r">Partner %</th>
            <th className="an-r">W–L</th><th className="an-r">Win %</th><th className="an-r">$ as partner</th><th className="an-r">$ / hand</th>
            <th className="an-r">⚫ Blitz</th><th className="an-r">🔴 Blitz</th><th>Best picker</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(pid => {
            const s = P[pid].asPartner
            return (
              <tr key={pid}>
                <td><PlayerName pid={pid} ctx={ctx} size={24} /></td>
                <td className="an-r an-num">{s.hands}</td>
                <td className="an-r an-num">{s.times}</td>
                <td className="an-r"><RateText r={s.partnerRate} single={single} /></td>
                <td className="an-r">{s.times ? wl(s.wins, s.losses) : <span className="an-muted">—</span>}</td>
                <td className="an-r"><RateText r={s.winRate} single={single} /></td>
                <td className="an-r">{s.times ? <Money value={s.net} /> : <span className="an-muted">—</span>}</td>
                <td className="an-r">{s.perHand == null ? <span className="an-muted">—</span>
                  : s.perHandOk || single ? <span className="an-num" style={{ color: s.perHand > 0 ? 'var(--success)' : s.perHand < 0 ? 'var(--danger)' : undefined }}>{cents(s.perHand)}</span>
                  : <span className="an-num an-muted">{cents(s.perHand)}</span>}</td>
                <td className="an-r">{s.black ? <><span className="an-num">{s.black}</span> <span className="an-muted">·</span> <RateText r={s.blackRate} single={single} /></> : <span className="an-muted">0</span>}</td>
                <td className="an-r">{s.red ? <><span className="an-num">{s.red}</span> <span className="an-muted">·</span> <RateText r={s.redRate} single={single} /></> : <span className="an-muted">0</span>}</td>
                <td>{s.bestPicker
                  ? <span className="an-best-picker"><PlayerName pid={s.bestPicker.pid} ctx={ctx} size={20} /> <span className="an-num an-muted">{s.bestPicker.wins}–{s.bestPicker.hands - s.bestPicker.wins}</span></span>
                  : <span className="an-muted">—</span>}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <div className="an-footnote">Rates need {MIN_PARTNER_HANDS}+ partner hands; best picker needs 3+ hands together.</div>
    </div>
  )
}

// ── Blitzes ───────────────────────────────────────────────────────────────────

function BlitzSide({ label, r, single }) {
  return (
    <div className="an-blitz-side">
      <div className="an-blitz-label">{label}</div>
      <div className="an-blitz-count an-num">{r.count}</div>
      <div className="an-blitz-facts">
        <span>rate <RateText r={r.rate} single={single} /></span>
        <span>success <RateText r={r.success} single={single} /> <span className="an-muted">({r.wins}–{r.losses})</span></span>
        <span>{r.count ? <Money value={r.net} /> : <span className="an-muted">$0</span>}{r.avgMult != null && <span className="an-muted"> · avg ×{r.avgMult.toFixed(1)}</span>}</span>
        <span className="an-muted">
          picker {r.byRole.picker.count} · partner {r.byRole.partner.count} · defense {r.byRole.defender.count}
          {r.cracked.count > 0 && <> · cracked {r.cracked.count} ({r.cracked.wins}–{r.cracked.count - r.cracked.wins})</>}
        </span>
      </div>
    </div>
  )
}

export function BlitzSummary({ blitz, single }) {
  return (
    <div className="an-blitz-summary">
      <BlitzSide label="⚫ Black" r={blitz.table.black} single={single} />
      <BlitzSide label="🔴 Red" r={blitz.table.red} single={single} />
    </div>
  )
}

export function BlitzTable({ blitz, ids, ctx, single }) {
  const rows = ids.filter(pid => blitz.players[pid])
    .sort((x, y) => blitz.players[y].net - blitz.players[x].net)
  if (!rows.length) return <div className="an-empty">No blitzes yet.</div>
  return (
    <div className="an-scroll">
      <table className="an-table">
        <thead>
          <tr>
            <th>Player</th>
            <th className="an-r">⚫ #</th><th className="an-r">⚫ rate</th><th className="an-r">⚫ success</th><th className="an-r">⚫ $</th>
            <th className="an-r">🔴 #</th><th className="an-r">🔴 rate</th><th className="an-r">🔴 success</th><th className="an-r">🔴 $</th>
            <th className="an-r">Total $</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(pid => {
            const { black: b, red: r, net } = blitz.players[pid]
            const cells = x => [
              <td key="n" className="an-r an-num">{x.count || <span className="an-muted">0</span>}</td>,
              <td key="r" className="an-r"><RateText r={x.rate} single={single} /></td>,
              <td key="s" className="an-r">{x.count ? <><RateText r={x.success} single={single} /> <span className="an-muted an-num">{x.wins}–{x.losses}</span></> : <span className="an-muted">—</span>}</td>,
              <td key="m" className="an-r">{x.count ? <Money value={x.net} /> : <span className="an-muted">—</span>}</td>,
            ]
            return (
              <tr key={pid}>
                <td><PlayerName pid={pid} ctx={ctx} size={24} /></td>
                {cells(b)}{cells(r)}
                <td className="an-r"><Money value={net} /></td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <div className="an-footnote">A blitz succeeds when the blitzer's side wins the hand. Success % needs {MIN_BLITZES}+ blitzes.</div>
    </div>
  )
}
