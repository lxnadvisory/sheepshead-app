import { calculateHandScores } from './scoring.js'

// Five people play every hand; anyone else at the table sits out.
export const PLAYERS_PER_HAND = 5

const scoreOf = (hand, pid) => hand.scores?.[pid] ?? 0

/**
 * The people who actually played `hand`: picker, partner (unless loner), the
 * F-Up offender, and everyone with a non-zero stored score — minus that hand's
 * sit-outs. If that's fewer than five (e.g. a zero for someone), fill from the
 * seats taken at the time, then from the seat order, skipping sit-outs.
 *
 * seatOrder: session.players. hands: all of the session's hands (to tell who was
 * seated at the time: someone who scored both at-or-before and at-or-after it).
 */
export function handParticipants(hand, seatOrder, hands = []) {
  const out  = new Set(hand.sitOutPids ?? (hand.dealerPid ? [hand.dealerPid] : []))
  const list = []
  const add  = pid => { if (pid && !out.has(pid) && !list.includes(pid)) list.push(pid) }

  if (hand.handType === 'fup') add(hand.offenderId)
  add(hand.picker)
  if (!hand.isLoner) add(hand.partner)
  seatOrder.forEach(pid => { if (scoreOf(hand, pid) !== 0) add(pid) })
  if (list.length >= PLAYERS_PER_HAND) return list

  const n = hand.handNumber
  const playedBetween = pid =>
    hands.some(h => h.handNumber <= n && scoreOf(h, pid) !== 0) &&
    hands.some(h => h.handNumber >= n && scoreOf(h, pid) !== 0)
  seatOrder.filter(playedBetween).forEach(pid => { if (list.length < PLAYERS_PER_HAND) add(pid) })
  seatOrder.forEach(pid => { if (list.length < PLAYERS_PER_HAND) add(pid) })
  return list
}

const isPow2 = f => Number.isInteger(f) && f >= 1 && (f & (f - 1)) === 0

/**
 * Doubler count for a hand saved before doubler_count was stored. The multiplier
 * the hand actually paid is read from its stored scores (what everyone was charged
 * vs. the same hand at ×1); crack, re-crack and blitz factors are divided out and
 * what's left is the doublers (the last-round ×2 counts as one).
 *
 * The stored `mult` column isn't used: last-round hands stored it doubled.
 * Returns { doublerCount, warning } — warning set when the result isn't a clean
 * power of two, so the edit form can ask the user instead of guessing.
 */
export function deriveDoublerCount(hand, seatOrder, storedMult) {
  const parts = handParticipants(hand, seatOrder)
  const base  = calculateHandScores({
    ...hand, doublerCount: 0, crackers: [], recrackers: [], blitzes: {}, lastRound: false,
    doubler: false, crack: false, reCrack: false, blackBlitz: false, redBlitz: false, blitz: false,
    dealerPid: null, players: parts,
  })
  const paid   = parts.reduce((a, p) => a + Math.abs(scoreOf(hand, p)), 0)
  const atOne  = parts.reduce((a, p) => a + Math.abs(base[p] ?? 0), 0)
  const actual = atOne ? paid / atOne : null

  const blitzVals = Object.values(hand.blitzes ?? {})
  const others = (hand.crackers?.length ? 2 : 1) * (hand.recrackers?.length ? 2 : 1) *
    (blitzVals.some(b => b.black) ? 2 : 1) * (blitzVals.some(b => b.red) ? 2 : 1)
  const factor = actual != null ? actual / others : null

  const shown = actual != null ? Math.round(actual * 100) / 100 : storedMult
  if (factor != null && isPow2(factor) && factor <= 16) {
    const doublerCount = Math.log2(factor)
    // Clean factor, but the stored scores still don't come back (e.g. seats were
    // shifted after the hand was saved) — let the user check rather than rewrite
    const re = calculateHandScores({ ...hand, doublerCount, lastRound: false, dealerPid: null, players: parts })
    if (parts.some(p => (re[p] ?? 0) !== scoreOf(hand, p))) {
      return { doublerCount, warning: `Stored scores don't match a re-score at ×${shown} — check doublers and seats` }
    }
    return { doublerCount, warning: null }
  }
  return { doublerCount: 0, warning: `Original multiplier was ×${shown} — check doublers` }
}
