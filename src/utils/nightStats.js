import { dollars } from './textTable'
import { sitOutsOf } from './hands'

/**
 * One player's night across every table they sat at: picks, partner calls and
 * how they did alongside each partner. Pure; sessions need hands loaded.
 *
 * Returns null if they played no hands, else
 *   { played, picks, pickWins, pickLosses, pickRate, called, net,
 *     partners: [{ pid, hands, wins, losses, net }] }   (most hands first)
 */
export function playerNightStats(sessions, pid) {
  let played = 0, picks = 0, pickWins = 0, pickLosses = 0, called = 0, net = 0
  const byPartner = {}

  sessions.forEach(s => {
    if (!s.players?.includes(pid)) return
    s.hands.forEach(h => {
      const d = h.scores?.[pid] ?? 0
      net += d
      if (h.handType === 'fup' || sitOutsOf(h).includes(pid)) return   // sat out or no deal
      played++
      if (h.picker === pid) {
        picks++
        if (d > 0) pickWins++
        else if (d < 0) pickLosses++
      }
      if (!h.isLoner && h.partner === pid) called++

      // Same side as pid this hand: picker ↔ partner
      const mate = h.isLoner || !h.partner ? null
        : h.picker === pid ? h.partner
        : h.partner === pid ? h.picker
        : null
      if (!mate) return
      const p = (byPartner[mate] ??= { pid: mate, hands: 0, wins: 0, losses: 0, net: 0 })
      p.hands++
      p.net += d
      if (d > 0) p.wins++
      else if (d < 0) p.losses++
    })
  })

  if (!played) return null
  const partners = Object.values(byPartner).sort((a, b) => b.hands - a.hands || b.net - a.net)
  return { played, picks, pickWins, pickLosses, pickRate: Math.round((picks / played) * 100), called, net, partners }
}

/** Best partner by net, only if they came out ahead together. */
export function bestPartner(stats) {
  const best = [...(stats?.partners ?? [])].sort((a, b) => b.net - a.net)[0]
  return best && best.net > 0 ? best : null
}

/** One-line recap for the email, e.g. "Picked 6 of 15 (40%), won 4 · Best partner: Cody (3-0, +$14)". */
export function nightTeaser(stats, dn) {
  if (!stats) return null
  const parts = [stats.picks
    ? `Picked ${stats.picks} of ${stats.played} (${stats.pickRate}%), won ${stats.pickWins}`
    : `Didn't pick in ${stats.played} hands`]
  const best = bestPartner(stats)
  if (best) parts.push(`Best partner: ${dn(best.pid)} (${best.wins}-${best.losses}, +${dollars(best.net)})`)
  return parts.join(' · ')
}

/** The night link, opened as this player (highlights them and shows their partners). */
export function personalStatsUrl(statsUrl, pid) {
  return `${statsUrl}?p=${encodeURIComponent(pid)}`
}

/** Public all-time stats (/stats, no PIN): the player's profile, or the dashboard. */
export function allTimeStatsUrl(origin, pid) {
  return pid ? `${origin}/stats#stats/p/${encodeURIComponent(pid)}` : `${origin}/stats`
}

// ── In-game stats (shared with the Analytics page later) ─────────────────────
// All take one night's hands. F-Ups are left out, and a player only counts in
// hands they played (not their sit-outs).

// Played = not sitting out and in the hand (every defender pays or collects; a
// Smith-rule picker/partner can be at 0). Seats joined later load as 0 on old hands.
const playedHand = (h, pid) => h.handType !== 'fup' && !sitOutsOf(h).includes(pid) &&
  ((h.scores?.[pid] ?? 0) !== 0 || pid === h.picker || (!h.isLoner && pid === h.partner))
const delta = (h, pid) => h.scores?.[pid] ?? 0

export const LONER = 'loner'

/**
 * Picker × partner records: { [picker]: { [partner | LONER]: { wins, losses, net } } }.
 * net is the picking side's combined result (picker + partner); a hand counts as
 * a win when that is positive.
 */
export function pairMatrix(hands) {
  const m = {}
  hands.forEach(h => {
    if (h.handType === 'fup' || !h.picker) return
    const col  = h.isLoner || !h.partner ? LONER : h.partner
    const team = delta(h, h.picker) + (col === LONER ? 0 : delta(h, h.partner))
    const cell = ((m[h.picker] ??= {})[col] ??= { wins: 0, losses: 0, net: 0 })
    cell.net += team
    if (team > 0) cell.wins++
    else if (team < 0) cell.losses++
  })
  return m
}

/** Best and worst picker+partner pair by net: { best, worst } as { picker, partner, ...cell }. */
export function pairExtremes(matrix) {
  const cells = Object.entries(matrix).flatMap(([picker, row]) =>
    Object.entries(row).map(([partner, c]) => ({ picker, partner, ...c })))
  if (cells.length < 2) return { best: null, worst: null }
  const sorted = [...cells].sort((a, b) => b.net - a.net)
  const best = sorted[0].net > 0 ? sorted[0] : null
  const worst = sorted.at(-1).net < 0 ? sorted.at(-1) : null
  return { best, worst }
}

/**
 * Money by role per player: { [pid]: { picking, partnering, defending, picks, played, pickRate } }.
 * pickRate = hands picked ÷ hands played (0–100).
 */
export function moneyByRole(hands, players) {
  const out = Object.fromEntries(players.map(pid => [pid, { picking: 0, partnering: 0, defending: 0, picks: 0, played: 0, pickRate: 0 }]))
  hands.forEach(h => players.forEach(pid => {
    if (!playedHand(h, pid)) return
    const s = out[pid]
    s.played++
    if (pid === h.picker) { s.picks++; s.picking += delta(h, pid) }
    else if (!h.isLoner && pid === h.partner) s.partnering += delta(h, pid)
    else s.defending += delta(h, pid)
  }))
  Object.values(out).forEach(s => { s.pickRate = s.played ? Math.round((s.picks / s.played) * 100) : 0 })
  return out
}

/**
 * Crack scorecard: { players: { [pid]: { called, won, net } }, total, worked }.
 * called = hands they cracked, won = those they came out ahead on, net = their
 * result on those hands. total / worked = cracked hands at the table and how
 * many the picker lost (same as the "Cracks" line).
 */
export function crackScorecard(hands) {
  const players = {}
  let total = 0, worked = 0
  hands.forEach(h => {
    if (h.handType === 'fup') return
    const crackers = h.crackers ?? []
    if (!crackers.length && !h.crack) return
    total++
    if (delta(h, h.picker) < 0) worked++
    crackers.forEach(pid => {
      const s = (players[pid] ??= { called: 0, won: 0, net: 0 })
      s.called++
      s.net += delta(h, pid)
      if (delta(h, pid) > 0) s.won++
    })
  })
  return { players, total, worked }
}
