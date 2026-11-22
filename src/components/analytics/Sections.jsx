import { PlayerName, Money, money, useSort, rateValue } from './ui'
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

/** One seat cell: "5 of 26 · 3–2", plus "· 60%" once there are enough picks to trust it. */
export function SeatCell({ c, single }) {
  if (!c) return <span className="an-muted">—</span>
  return (
    <span className="an-num" title={`Picked ${c.picks} of ${c.chances} times in this seat${c.picks ? `, won ${c.wins}, lost ${c.picks - c.wins}` : ''}`}>
      {c.picks} of {c.chances}
      {c.picks > 0 && <span className="an-muted"> · </span>}
      {c.picks > 0 && <>{c.wins}–{c.picks - c.wins}</>}
      {c.picks > 0 && (single || c.winRate.ok) && <span className="an-muted"> · </span>}
      {c.picks > 0 && (single || c.winRate.ok) && <>{Math.round(c.winRate.pct * 100)}%</>}
    </span>
  )
}
const cents = n => (n == null ? '—' : money(n, { cents: true }))

// ── Picking by Seat ───────────────────────────────────────────────────────────

export function SeatTable({ seats }) {
  const { rows, th } = useSort(seats.table, {
    seat: t => -t.pos, hands: t => t.hands, rate: t => rateValue(t.pickRate), wl: t => t.picks ? t.wins - (t.picks - t.wins) / 100 : null,
    win: t => rateValue(t.pickWin), perPick: t => t.perPick, loners: t => t.loners,
  })
  return (
    <div className="an-scroll">
      <table className="an-table">
        <thead>
          <tr>{th('seat', 'Seat')}{th('hands', 'Hands', 'an-r')}{th('rate', 'Pick %', 'an-r')}{th('wl', 'Picker W–L', 'an-r')}{th('win', 'Win %', 'an-r')}{th('perPick', '$ / pick', 'an-r')}{th('loners', 'Loners', 'an-r')}</tr>
        </thead>
        <tbody>
          {rows.map(t => (
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
  const withSeats = ids.filter(pid => seats.players[pid])
  const seatPicks = n => pid => seats.players[pid].cells[n]?.picks ?? null
  const { rows, th } = useSort(withSeats, {
    name: pid => ctx.name(pid), 1: seatPicks(1), 2: seatPicks(2), 3: seatPicks(3), 4: seatPicks(4), 5: seatPicks(5),
  })
  if (!rows.length) return <div className="an-empty">No hands with a recorded dealer yet.</div>
  return (
    <div className="an-scroll">
      <table className="an-table an-seat-matrix">
        <thead>
          <tr>{th('name', 'Player')}{[1, 2, 3, 4, 5].map(n => th(n, <>{n}<div className="an-th-sub">{SEAT_LABELS[n]}</div></>, 'an-c', `Sort by picks in seat ${n} (${SEAT_LABELS[n]})`))}</tr>
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
                      <SeatCell c={c} single={seats.single} />
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
      Each cell: <strong>times picked of times in that seat · won–lost</strong>, plus the win % once there are {MIN_SEAT_PICKS}+ picks
      (e.g. "5 of 26 · 3–2 · 60%" = sat there 26 times, picked 5, won 3). Green = best seat, red = worst, by win %.
    </div>
  )
}

// ── Partners ──────────────────────────────────────────────────────────────────

export function PartnersTable({ a, ids, ctx }) {
  const P = a.players, single = a.single
  const base = ids.filter(pid => P[pid].asPartner?.hands > 0)
    .sort((x, y) => (P[y].asPartner.perHandOk ? P[y].asPartner.perHand : -1e9) - (P[x].asPartner.perHandOk ? P[x].asPartner.perHand : -1e9) || P[y].asPartner.times - P[x].asPartner.times)
  const s = pid => P[pid].asPartner
  const { rows, th } = useSort(base, {
    name: pid => ctx.name(pid), hands: pid => s(pid).hands, times: pid => s(pid).times, rate: pid => rateValue(s(pid).partnerRate),
    wl: pid => s(pid).times ? s(pid).wins - s(pid).losses / 100 : null, win: pid => rateValue(s(pid).winRate),
    net: pid => s(pid).times ? s(pid).net : null, perHand: pid => (s(pid).perHandOk || single) ? s(pid).perHand : null,
    black: pid => s(pid).black, red: pid => s(pid).red, best: pid => s(pid).bestPicker ? ctx.name(s(pid).bestPicker.pid) : null,
  })
  return (
    <div className="an-scroll">
      <table className="an-table">
        <thead>
          <tr>
            {th('name', 'Player')}{th('hands', 'Hands', 'an-r')}{th('times', 'Partner', 'an-r')}{th('rate', 'Partner %', 'an-r')}
            {th('wl', 'W–L', 'an-r')}{th('win', 'Win %', 'an-r')}{th('net', '$ as partner', 'an-r')}{th('perHand', '$ / hand', 'an-r')}
            {th('black', '⚫ Blitz', 'an-r')}{th('red', '🔴 Blitz', 'an-r')}{th('best', 'Best picker')}
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
  const base = ids.filter(pid => blitz.players[pid])
    .sort((x, y) => blitz.players[y].net - blitz.players[x].net)
  const b = (pid, c) => blitz.players[pid][c]
  const col = c => ({
    [`${c}N`]: pid => b(pid, c).count, [`${c}Rate`]: pid => rateValue(b(pid, c).rate),
    [`${c}Win`]: pid => rateValue(b(pid, c).success), [`${c}Net`]: pid => b(pid, c).count ? b(pid, c).net : null,
  })
  const { rows, th } = useSort(base, { name: pid => ctx.name(pid), ...col('black'), ...col('red'), total: pid => blitz.players[pid].net })
  if (!rows.length) return <div className="an-empty">No blitzes yet.</div>
  return (
    <div className="an-scroll">
      <table className="an-table">
        <thead>
          <tr>
            {th('name', 'Player')}
            {th('blackN', '⚫ #', 'an-r')}{th('blackRate', '⚫ rate', 'an-r')}{th('blackWin', '⚫ success', 'an-r')}{th('blackNet', '⚫ $', 'an-r')}
            {th('redN', '🔴 #', 'an-r')}{th('redRate', '🔴 rate', 'an-r')}{th('redWin', '🔴 success', 'an-r')}{th('redNet', '🔴 $', 'an-r')}
            {th('total', 'Total $', 'an-r')}
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
