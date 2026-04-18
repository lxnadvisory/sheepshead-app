/**
 * Calculate deltas for all players in a hand.
 *
 * NEW fields (preferred):
 *   doublerCount  {number}  0–4  each step = ×2 (total ×1/2/4/8/16)
 *   crackers      {string[]} player IDs who cracked (opponents)
 *   recrackers    {string[]} player IDs who re-cracked (picker/partner)
 *   blitzes       {Object}  { [pid]: { black:bool, red:bool } }
 *   lastRound     {boolean} auto-applied by store (session countdown)
 *   dealerPid     {string|null} sits out in 6-player (score = 0)
 *
 * LEGACY fields (still accepted for old hands):
 *   doubler, crack, reCrack, blackBlitz, redBlitz, blitz
 */
// Loner settlement table — do NOT derive from partner-game values.
// Verified: loner === opp × -4 in every row.
const LONER_SETTLEMENT = {
  SHED_CLEAN:   { loner: 24,  opp: -6 },
  HIGH_WIN:     { loner: 16,  opp: -4 },
  WIN:          { loner: 8,   opp: -2 },
  BUMPED:       { loner: -16, opp: 4  },
  NO_SCHNEIDER: { loner: -32, opp: 8  },
  NO_TRICKS:    { loner: -32, opp: 8  },
}

function lonerTierKey(shedClean, pickerNoTricks, pickerPoints) {
  if (shedClean)          return 'SHED_CLEAN'
  if (pickerNoTricks)     return 'NO_TRICKS'
  if (pickerPoints >= 91) return 'HIGH_WIN'
  if (pickerPoints >= 61) return 'WIN'
  if (pickerPoints >= 30) return 'BUMPED'
  return 'NO_SCHNEIDER'
}

export function calculateHandScores({
  picker, partner, isLoner,
  pickerPoints, shedClean, pickerNoTricks,
  smith,
  // new
  doublerCount, crackers, recrackers, blitzes,
  lastRound, dealerPid,
  // legacy
  doubler, crack, reCrack, blackBlitz, redBlitz, blitz,
  players,
}) {
  // ── Multiplier ────────────────────────────────────────────────────────────
  let m = 1

  const dc = doublerCount ?? (doubler ? 1 : 0)
  if (dc > 0) m *= Math.pow(2, Math.min(dc, 4))

  if ((crackers?.length ?? 0) > 0 || crack)     m *= 2
  if ((recrackers?.length ?? 0) > 0 || reCrack)  m *= 2

  const blitzVals = blitzes ? Object.values(blitzes) : []
  const hasBlack  = blitzVals.some(b => b.black) || blackBlitz || blitz
  const hasRed    = blitzVals.some(b => b.red)   || redBlitz   || blitz
  if (hasBlack) m *= 2
  if (hasRed)   m *= 2

  if (lastRound) m *= 2
  m = Math.min(m, 16)

  // ── Scores ────────────────────────────────────────────────────────────────
  const scores = {}
  const activePlayers = dealerPid ? players.filter(p => p !== dealerPid) : players

  if (isLoner) {
    // Use the separate loner lookup table — never derive from partner-game values
    const row = LONER_SETTLEMENT[lonerTierKey(shedClean, pickerNoTricks, pickerPoints)]
    scores[picker] = row.loner * m
    activePlayers.filter(p => p !== picker).forEach(p => { scores[p] = row.opp * m })
  } else {
    // ── Partner-game base tier ──────────────────────────────────────────────
    let pickerBase, partnerBase, oppBase

    if (shedClean) {
      pickerBase = 6;  partnerBase = 3;  oppBase = -3
    } else if (pickerNoTricks) {
      pickerBase = -12; partnerBase = -6; oppBase = 6
    } else if (pickerPoints >= 91) {
      pickerBase = 4;  partnerBase = 2;  oppBase = -2
    } else if (pickerPoints >= 61) {
      pickerBase = 2;  partnerBase = 1;  oppBase = -1
    } else if (pickerPoints >= 30) {
      pickerBase = -4; partnerBase = -2; oppBase = 2
    } else {
      pickerBase = -8; partnerBase = -4; oppBase = 4
    }

    scores[picker] = pickerBase * m

    if (partner) {
      scores[partner] = partnerBase * m
    }

    activePlayers
      .filter(p => p !== picker && p !== partner)
      .forEach(p => { scores[p] = oppBase * m })

    // Smith Rule: picker took 0 tricks individually — redistribute partner's share
    if (smith && partner) {
      if (pickerBase < 0) {
        // Loss: partner is protected, picker absorbs partner's delta
        scores[picker] += scores[partner]
        scores[partner] = 0
      } else if (pickerBase > 0) {
        // Win: picker is protected, partner absorbs picker's delta
        scores[partner] += scores[picker]
        scores[picker] = 0
      }
    }
  }

  if (dealerPid) scores[dealerPid] = 0

  return scores
}

/** Verify that all player deltas sum to zero (conservation invariant). */
export function verifyConservation(scores) {
  const sum = Object.values(scores).reduce((acc, v) => acc + v, 0)
  return Math.abs(sum) < 0.001
}

/** Tier label for display. */
export function getTierLabel({ shedClean, pickerNoTricks, pickerPoints }) {
  if (shedClean)          return 'Shed Clean'
  if (pickerNoTricks)     return 'No Tricks'
  if (pickerPoints >= 91) return 'High Win'
  if (pickerPoints >= 61) return 'Win'
  if (pickerPoints >= 30) return 'Bumped'
  return 'No Schneider'
}

/** Effective multiplier for preview/display. Accepts both new and legacy formats. */
export function getMultiplier({
  doublerCount, crackers, recrackers, blitzes, lastRound,
  doubler, crack, reCrack, blackBlitz, redBlitz, blitz,
} = {}) {
  let m = 1
  const dc = doublerCount ?? (doubler ? 1 : 0)
  if (dc > 0) m *= Math.pow(2, Math.min(dc, 4))
  if ((crackers?.length ?? 0) > 0 || crack)     m *= 2
  if ((recrackers?.length ?? 0) > 0 || reCrack)  m *= 2
  const blitzVals = blitzes ? Object.values(blitzes) : []
  if (blitzVals.some(b => b.black) || blackBlitz || blitz) m *= 2
  if (blitzVals.some(b => b.red)   || redBlitz   || blitz) m *= 2
  if (lastRound) m *= 2
  return Math.min(m, 16)
}

/** End-of-night debt settlement — minimize transfers. */
export function settleDebts(totals) {
  const players   = Object.entries(totals).map(([id, pts]) => ({ id, balance: pts }))
  const creditors = players.filter(p => p.balance > 0).sort((a, b) => b.balance - a.balance)
  const debtors   = players.filter(p => p.balance < 0).sort((a, b) => a.balance - b.balance)
  const transfers = []
  let ci = 0, di = 0

  while (ci < creditors.length && di < debtors.length) {
    const credit = creditors[ci], debit = debtors[di]
    const amount = Math.min(credit.balance, -debit.balance)
    if (amount > 0) transfers.push({ from: debit.id, to: credit.id, amount })
    credit.balance -= amount; debit.balance += amount
    if (Math.abs(credit.balance) < 0.001) ci++
    if (Math.abs(debit.balance)  < 0.001) di++
  }

  return transfers
}
