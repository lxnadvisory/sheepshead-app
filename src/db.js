/**
 * Supabase CRUD helpers.
 *
 * Field-mapping contract
 * ─────────────────────
 * App (camelCase)  ←→  DB (snake_case)
 *
 * players:  firstName/lastName  ←→  first_name/last_name
 * sessions: players[]           ←→  seat_order TEXT[]
 *           active bool         ←→  status 'active'|'ended'
 * hands:    picker/partner      ←→  picker_name/partner_name  (player IDs stored as text)
 *           isLoner             ←→  is_alone
 *           pickerPoints        ←→  points
 *           shedClean           ←→  shed_clean
 *           pickerNoTricks      ←→  no_tricks
 *           smith               ←→  smith_rule
 *           crackers[]          ←→  cracked_by   (comma-joined)
 *           recrackers[]        ←→  recracked_by (comma-joined)
 *           scores {pid:delta}  ←→  seat_deltas REAL[]  (ordered by seat_order)
 *           seat roles          ←→  seat_roles TEXT[]
 *
 * F-Ups (handType 'fup' ←→ hand_type 'FUP') reuse the hands table. The NOT NULL
 * columns are filled with placeholders: picker_name = offender id, points = 0,
 * tier = 'FUP', mult = 1 (or the last-round multiplier if it was applied),
 * offender's seat_role = 'picker'. Always check hand_type before treating a
 * row as a normal hand.
 */

import { supabase } from './supabase.js'
import { getTierLabel, getMultiplier } from './utils/scoring.js'

// ── Players ───────────────────────────────────────────────────────────────────

function playerToDb(p) {
  return {
    id:         p.id,
    first_name: p.firstName  || '',
    last_name:  p.lastName   || '',
    phone:      p.phone      || '',
    email:      p.email      || '',
    venmo:      p.venmo      || '',
    photo:      p.photo      || null,
  }
}

function dbToPlayer(row) {
  return {
    id:        row.id,
    firstName: row.first_name || '',
    lastName:  row.last_name  || '',
    phone:     row.phone      || '',
    email:     row.email      || '',
    venmo:     row.venmo      || '',
    photo:     row.photo      || null,
  }
}

export async function getPlayers() {
  const { data, error } = await supabase
    .from('players')
    .select('*')
    .order('created_at', { ascending: true })
  if (error) throw error
  return (data || []).map(dbToPlayer)
}

export async function savePlayer(player) {
  const { error } = await supabase.from('players').upsert(playerToDb(player))
  if (error) throw error
}

export async function updatePlayer(id, changes) {
  // Build only the fields that changed; id is required for upsert
  const { error } = await supabase
    .from('players')
    .upsert(playerToDb({ id, ...changes }))
  if (error) throw error
}

export async function deletePlayer(id) {
  const { error } = await supabase.from('players').delete().eq('id', id)
  if (error) throw error
}

// ── Sessions ──────────────────────────────────────────────────────────────────

function sessionToDb(session) {
  return {
    id:                 session.id,
    date:               session.date,
    seat_order:         session.players         || [],
    status:             session.active ? 'active' : 'ended',
    smith_rule_enabled: false,
  }
}

/**
 * Convert a DB sessions row back to the app's session shape.
 * dealerIndex is reconstructed from hand count; lastRoundRemaining
 * is ephemeral and not stored — defaults to 0 on remote load.
 */
function dbToSession(row, hands = []) {
  const seatOrder  = row.seat_order || []
  const numPlayers = seatOrder.length
  return {
    id:                 row.id,
    date:               row.date,
    players:            seatOrder,
    active:             row.status === 'active',
    hands,
    dealerIndex:        numPlayers > 0 ? hands.length % numPlayers : 0,
    lastRoundRemaining: 0,
  }
}

export async function createSession(session) {
  const { error } = await supabase.from('sessions').upsert(sessionToDb(session))
  if (error) throw error
}

export async function updateSession(id, data) {
  const patch = {}
  if ('active'  in data) patch.status     = data.active ? 'active' : 'ended'
  if ('players' in data) patch.seat_order = data.players
  if (Object.keys(patch).length === 0) return
  const { error } = await supabase.from('sessions').update(patch).eq('id', id)
  if (error) throw error
}

export async function getSession(id) {
  const { data, error } = await supabase
    .from('sessions').select('*').eq('id', id).single()
  if (error) throw error
  return dbToSession(data)
}

export async function getSessions() {
  const { data, error } = await supabase
    .from('sessions')
    .select('*')
    .order('created_at', { ascending: true })
  if (error) throw error
  return (data || []).map(row => dbToSession(row))
}

export async function deleteSession(id) {
  // Remove hands first (handles DBs without CASCADE)
  const { error: handsError } = await supabase.from('hands').delete().eq('session_id', id)
  if (handsError) throw handsError
  const { error } = await supabase.from('sessions').delete().eq('id', id)
  if (error) throw error
}

// ── Hands ─────────────────────────────────────────────────────────────────────

/**
 * Convert a DB hands row to the app's hand shape.
 * Exported so the real-time subscription handler can use it.
 *
 * @param {object} row        - Raw Supabase row
 * @param {string[]} seatOrder - Ordered player IDs (session.players)
 */
export function dbRowToHand(row, seatOrder) {
  const scores = {}
  if (Array.isArray(row.seat_deltas) && Array.isArray(seatOrder)) {
    seatOrder.forEach((pid, i) => {
      scores[pid] = row.seat_deltas[i] ?? 0
    })
  }
  const isFup = String(row.hand_type || '').toLowerCase() === 'fup'
  if (isFup) {
    return {
      id:           row.id,
      handNumber:   row.hand_number,
      handType:     'fup',
      offenderId:   row.offender_id || row.picker_name || null,
      note:         row.note        || null,
      // amount isn't stored; every non-offender receives the same delta
      amount:       Math.max(0, ...Object.values(scores)),
      multiplier:   row.mult ?? 1,
      dealerPid:    row.dealer_name || null,
      scores,
      picker:       null,
      partner:      null,
      isLoner:      false,
      pickerPoints: null,
      crackers:     [],
      recrackers:   [],
      blitzes:      {},
      doublerCount: 0,
      lastRound:    false,
    }
  }
  return {
    id:             row.id,
    handNumber:     row.hand_number,
    picker:         row.picker_name   || null,
    partner:        row.partner_name  || null,
    isLoner:        row.is_alone      || false,
    pickerPoints:   row.points        ?? null,
    shedClean:      row.shed_clean    || false,
    pickerNoTricks: row.no_tricks     || false,
    smith:          row.smith_rule    || false,
    dealerPid:      row.dealer_name   || null,
    crackers:       row.cracked_by    ? row.cracked_by.split(',').filter(Boolean)    : [],
    recrackers:     row.recracked_by  ? row.recracked_by.split(',').filter(Boolean)  : [],
    blitzes:        row.blitzes       || {},
    scores,
    handType:   row.hand_type   || null,
    offenderId: row.offender_id || null,
    note:       row.note        || null,
    // doublerCount and lastRound are not stored in the DB schema.
    // lastRound is cosmetic; doublerCount is not needed to display stored scores.
    doublerCount: 0,
    lastRound:    false,
  }
}

function fupToDb(hand, sessionId, seatOrder) {
  return {
    id:           hand.id,
    session_id:   sessionId,
    hand_number:  hand.handNumber,
    picker_name:  hand.offenderId,
    partner_name: null,
    is_alone:     false,
    points:       0,
    tier:         'FUP',
    mult:         hand.multiplier ?? 1,
    seat_deltas:  seatOrder.map(pid => hand.scores?.[pid] ?? 0),
    seat_roles:   seatOrder.map(pid => {
      if (pid === hand.offenderId) return 'picker'
      if (pid === hand.dealerPid)  return 'out'
      return 'opp'
    }),
    dealer_name:  hand.dealerPid || null,
    shed_clean:   false,
    no_tricks:    false,
    smith_rule:   false,
    cracked_by:   '',
    recracked_by: '',
    blitzes:      {},
    hand_type:    'FUP',
    offender_id:  hand.offenderId,
    note:         hand.note || null,
  }
}

function handToDb(hand, sessionId, seatOrder) {
  if (hand.handType === 'fup') return fupToDb(hand, sessionId, seatOrder)

  const seatDeltas = seatOrder.map(pid => hand.scores?.[pid] ?? 0)
  const seatRoles  = seatOrder.map(pid => {
    if (pid === hand.dealerPid)              return 'out'
    if (pid === hand.picker)                 return 'picker'
    if (!hand.isLoner && pid === hand.partner) return 'partner'
    return 'opp'
  })

  return {
    id:           hand.id,
    session_id:   sessionId,
    hand_number:  hand.handNumber,
    picker_name:  hand.picker   || null,
    partner_name: hand.partner  || null,
    is_alone:     hand.isLoner  || false,
    points:       hand.pickerPoints ?? null,
    tier:         getTierLabel(hand),
    mult:         getMultiplier(hand),
    seat_deltas:  seatDeltas,
    seat_roles:   seatRoles,
    dealer_name:  hand.dealerPid || null,
    shed_clean:   hand.shedClean      || false,
    no_tricks:    hand.pickerNoTricks || false,
    smith_rule:   hand.smith          || false,
    cracked_by:   (hand.crackers   || []).join(','),
    recracked_by: (hand.recrackers || []).join(','),
    blitzes:      hand.blitzes || {},
    hand_type:    hand.handType   || null,
    offender_id:  hand.offenderId || null,
    note:         hand.note       || null,
  }
}

export async function addHand(hand, sessionId, seatOrder) {
  return upsertHands([hand], sessionId, seatOrder)
}

/** Upsert several hands in one statement — all succeed or none do. */
export async function upsertHands(hands, sessionId, seatOrder) {
  const { error } = await supabase
    .from('hands')
    .upsert(hands.map(h => handToDb(h, sessionId, seatOrder)))
  if (error) throw error
}

export async function deleteHand(id) {
  const { error } = await supabase.from('hands').delete().eq('id', id)
  if (error) throw error
}

/**
 * Rewrite seat_deltas/seat_roles for existing hands after the seat order changes.
 * seat_deltas is positional, so without this a reorder or mid-seat insert would
 * shift every stored score onto the wrong player on the next load.
 * Only those two columns are touched so stored tier/mult stay intact.
 */
export async function reseatHands(hands, seatOrder) {
  const results = await Promise.all(hands.map(h => {
    const { seat_deltas, seat_roles } = handToDb(h, null, seatOrder)
    return supabase.from('hands').update({ seat_deltas, seat_roles }).eq('id', h.id)
  }))
  const failed = results.find(r => r.error)
  if (failed) throw failed.error
}

/**
 * Sanity-check a loaded hand. Returns human-readable problems (empty = OK).
 * Problems never hide a hand — they're surfaced as warnings.
 */
export function validateLoadedHand(row, hand, seatOrder) {
  const label  = `Hand #${row.hand_number ?? '?'}${hand?.handType === 'fup' ? ' (F-Up)' : ''}`
  const issues = []
  if (row.hand_number == null) issues.push(`${label}: missing hand number`)
  if (!Array.isArray(row.seat_deltas)) {
    issues.push(`${label}: no score data (seat_deltas)`)
  } else if (row.seat_deltas.length > seatOrder.length) {
    issues.push(`${label}: has ${row.seat_deltas.length} scores but the session has ${seatOrder.length} seats — extra scores dropped`)
  }
  const sum = Object.values(hand?.scores ?? {}).reduce((a, d) => a + d, 0)
  if (Math.abs(sum) > 0.001) issues.push(`${label}: scores don't balance (sum ${sum > 0 ? '+' : ''}${sum})`)
  if (hand?.handType === 'fup') {
    if (!hand.offenderId) issues.push(`${label}: no offender recorded`)
    else if (!seatOrder.includes(hand.offenderId)) issues.push(`${label}: offender is not seated in this session`)
  } else {
    if (row.hand_type) issues.push(`${label}: unknown hand type "${row.hand_type}"`)
    if (!hand?.picker) issues.push(`${label}: no picker recorded`)
  }
  return issues
}

/**
 * Load a session's hands. Rows that fail to map are skipped but reported in
 * `issues`, as are rows that load but fail validation (those stay visible).
 */
export async function getHandsBySession(sessionId, seatOrder) {
  const { data, error } = await supabase
    .from('hands')
    .select('*')
    .eq('session_id', sessionId)
    .order('hand_number', { ascending: true })
  if (error) throw error
  const hands  = []
  const issues = []
  for (const row of data || []) {
    try {
      const hand = dbRowToHand(row, seatOrder)
      hands.push(hand)
      issues.push(...validateLoadedHand(row, hand, seatOrder))
    } catch (err) {
      console.error('[Supabase] Could not load hand row:', row, err)
      issues.push(`Hand #${row.hand_number ?? '?'} could not be loaded and is NOT shown: ${err?.message || err}`)
    }
  }
  return { hands, issues }
}
