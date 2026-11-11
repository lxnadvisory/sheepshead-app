import { PLAYERS_PER_HAND } from './hands.js'

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

/**
 * Who sits out the next hand. Five play every hand: with 6 active the dealer
 * sits out; with 7 the dealer and the next active seat after them. Left
 * players are skipped. Dealer first.
 */
export function getSitOuts(players, leftPlayers, dealerIndex) {
  const active = players.filter(p => !leftPlayers.includes(p))
  const count  = Math.max(0, active.length - PLAYERS_PER_HAND)
  const out    = []
  let idx = ensureActiveDealer(players, leftPlayers, dealerIndex)
  while (out.length < count) {
    out.push(players[idx])
    idx = nextActiveDealerIndex(players, leftPlayers, idx)
  }
  return out
}
