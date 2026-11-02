import { dollars } from './textTable'

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
      if (h.handType === 'fup' || pid === h.dealerPid) return   // sat out or no deal
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
