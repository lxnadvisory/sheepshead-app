/**
 * Combine several sessions (tables) played the same night into one set of totals.
 * Pure: takes sessions with hands already loaded, never changes them.
 *
 * Returns
 *   tables   [{ id, label, totals: {pid: pts}, unassigned, handCount, active, date, players }]
 *   players  every pid seen at any included table, in first-seen seat order
 *   night    {pid: pts} — sum of that player's table totals
 *   problems human-readable sanity-check failures (empty = all checks pass)
 */

const EPS = 0.001
const fmt = n => `${n > 0 ? '+' : ''}${Math.round(n * 100) / 100}`

export function tableLabel(index, session) {
  const time = new Date(session.date).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  return `Table ${index + 1} · ${time}`
}

export function combineSessions(sessions, dn = pid => pid) {
  const problems = []

  const tables = sessions.map((sess, i) => {
    const totals = {}
    sess.players.forEach(pid => { totals[pid] = 0 })
    let unassigned = 0
    sess.hands.forEach(h => {
      Object.entries(h.scores ?? {}).forEach(([pid, d]) => { totals[pid] = (totals[pid] ?? 0) + d })
      ;(h.unseatedDeltas ?? []).forEach(d => { unassigned += d })
    })
    const label = sess.label ?? tableLabel(i, sess)
    const sum   = Object.values(totals).reduce((a, d) => a + d, 0) + unassigned
    if (Math.abs(unassigned) > EPS || sess.hands.some(h => h.unseatedDeltas?.length)) {
      problems.push(`${label}: has scores not credited to any player (${fmt(unassigned)}). Fix its seat order first.`)
    }
    if (Math.abs(sum) > EPS) problems.push(`${label}: scores don't add up to 0 (sum ${fmt(sum)}).`)
    return {
      id: sess.id, label, totals, unassigned,
      handCount: sess.hands.length, active: sess.active, date: sess.date, players: sess.players,
    }
  })

  // Each table's totals start in seat order, so this is first-seen seat order
  const players = []
  tables.forEach(t => Object.keys(t.totals).forEach(pid => { if (!players.includes(pid)) players.push(pid) }))

  const night = {}
  players.forEach(pid => { night[pid] = tables.reduce((a, t) => a + (t.totals[pid] ?? 0), 0) })

  // Independent recount straight from every hand, to cross-check the per-table path
  const recount = {}
  sessions.forEach(s => s.hands.forEach(h =>
    Object.entries(h.scores ?? {}).forEach(([pid, d]) => { recount[pid] = (recount[pid] ?? 0) + d })))
  players.forEach(pid => {
    if (Math.abs((recount[pid] ?? 0) - night[pid]) > EPS) {
      problems.push(`${dn(pid)}: night total ${fmt(night[pid])} doesn't match the sum of their hands (${fmt(recount[pid] ?? 0)}).`)
    }
  })

  const nightSum = Object.values(night).reduce((a, d) => a + d, 0)
  if (Math.abs(nightSum) > EPS) problems.push(`Combined totals don't add up to $0 (sum ${fmt(nightSum)}).`)

  return { tables, players, night, nightSum, problems }
}
