// Dealer rotation. sessions.dealer_pid is the source of truth; dealerIndex is
// its position in the seat order, kept in memory for the rotation math.

/** Index of the next active (non-left) seat after fromIdx. */
export function nextActiveDealerIndex(players, leftPlayers, fromIdx) {
  const n = players.length
  if (n === 0) return 0
  for (let i = 1; i <= n; i++) {
    const next = (fromIdx + i) % n
    if (!leftPlayers.includes(players[next])) return next
  }
  return (fromIdx + 1) % n
}

/** dealerIndex, moved forward if it points at a left player or past the seats. */
export function ensureActiveDealer(players, leftPlayers, dealerIndex) {
  const n = players.length
  if (n === 0) return 0
  const idx = dealerIndex >= 0 && dealerIndex < n ? dealerIndex : 0
  return leftPlayers.includes(players[idx]) ? nextActiveDealerIndex(players, leftPlayers, idx) : idx
}

/**
 * dealerIndex for a session loaded from the DB. Uses the stored dealer_pid;
 * only sessions saved before it existed (dealer_pid NULL) fall back to the old
 * hand-count guess.
 */
export function deriveDealerIndex(players, leftPlayers, dealerPid, handCount) {
  const n = players.length
  if (n === 0) return 0
  const stored = dealerPid ? players.indexOf(dealerPid) : -1
  const idx = stored >= 0 ? stored : handCount % n
  return ensureActiveDealer(players, leftPlayers, idx)
}
