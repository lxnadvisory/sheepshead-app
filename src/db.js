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
 *           dealerPid           ←→  dealer_pid    (NULL on sessions from before it was stored)
 *           leftPlayers[]       ←→  left_players TEXT[]
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
 *           sitOutPids[]        ←→  sit_out TEXT[] (NULL on old hands: derived from seat_roles / dealer_name)
 *           doublerCount        ←→  doubler_count  (NULL on old hands)
 *           lastRound           ←→  last_round
 *
 * F-Ups (handType 'fup' ←→ hand_type 'FUP') reuse the hands table. The NOT NULL
 * columns are filled with placeholders: picker_name = offender id, points = 0,
 * tier = 'FUP', mult = 1 (or the last-round multiplier if it was applied),
 * offender's seat_role = 'picker'. Always check hand_type before treating a
 * row as a normal hand.
 *
 * All-pass hands (no CHECK constraint on hand_type, so no schema change):
 *   'LEASTER' (handType 'leaster') — winner in picker_name ('picker' seat role),
 *     no partner, points = 0, tier 'LEASTER', mult = the hand's multiplier.
 *   'PASS' (handType 'pass') — thrown in for a doubler: picker_name = '',
 *     points = 0, tier 'PASS', mult = 1, every seat_delta 0.
 */

import { supabase } from './supabase.js'
import { getTierLabel, getMultiplier } from './utils/scoring.js'
import { deriveDoublerCount } from './utils/hands.js'

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
    dealer_pid:         session.dealerPid ?? session.players?.[session.dealerIndex ?? 0] ?? null,
    left_players:       session.leftPlayers ?? [],
  }
}

/**
 * Convert a DB sessions row back to the app's session shape.
 * dealerIndex here is only the old hand-count guess; the store replaces it
 * from dealerPid (utils/dealer.js deriveDealerIndex) once hands are loaded.
 * lastRoundRemaining is ephemeral and not stored — defaults to 0 on remote load.
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
    dealerPid:          row.dealer_pid ?? null,
    leftPlayers:        row.left_players ?? [],
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
  if ('dealerPid'   in data) patch.dealer_pid   = data.dealerPid ?? null
  if ('leftPlayers' in data) patch.left_players = data.leftPlayers ?? []
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

/** Sessions started in [from, to) — ISO timestamps. Oldest first. */
export async function getSessionsStartedBetween(from, to) {
  const { data, error } = await supabase
    .from('sessions')
    .select('*')
    .gte('date', from)
    .lt('date', to)
    .order('date', { ascending: true })
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
  // Scores stored past the end of seat_order (a seat the session row doesn't
  // list). They can't be credited to anyone, but they're kept and written back
  // unchanged so the stored row is never truncated.
  const extra = Array.isArray(row.seat_deltas) && Array.isArray(seatOrder) &&
    row.seat_deltas.length > seatOrder.length
    ? {
        unseatedDeltas: row.seat_deltas.slice(seatOrder.length),
        unseatedRoles:  Array.isArray(row.seat_roles) ? row.seat_roles.slice(seatOrder.length) : [],
      }
    : {}
  // Who sat out: stored list, else seats marked 'out', else the dealer column
  const outSeats = Array.isArray(row.seat_roles) && Array.isArray(seatOrder)
    ? seatOrder.filter((_, i) => row.seat_roles[i] === 'out') : []
  const sitOutPids = Array.isArray(row.sit_out) ? row.sit_out
    : outSeats.length ? outSeats
    : row.dealer_name ? [row.dealer_name] : []

  const kind = String(row.hand_type || '').toLowerCase()
  if (kind === 'leaster' || kind === 'pass') {
    return {
      id:           row.id,
      handNumber:   row.hand_number,
      handType:     kind,
      picker:       kind === 'leaster' ? (row.picker_name || null) : null,   // leaster winner
      partner:      null,
      isLoner:      false,
      pickerPoints: null,
      dealerPid:    row.dealer_name || null,
      crackers:     [],
      recrackers:   [],
      blitzes:      {},
      scores,
      note:         row.note || null,
      sitOutPids,
      doublerCount: row.doubler_count ?? 0,
      lastRound:    row.last_round    ?? false,
      ...extra,
    }
  }
  const isFup = kind === 'fup'
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
      sitOutPids,
      doublerCount: row.doubler_count ?? 0,
      lastRound:    row.last_round    ?? false,
      ...extra,
    }
  }
  const hand = {
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
    sitOutPids,
    doublerCount:   row.doubler_count ?? 0,
    lastRound:      row.last_round    ?? false,
    ...extra,
  }
  // Saved before doubler_count existed: work it out from what the hand paid
  if (row.doubler_count == null) {
    const { doublerCount, warning } = deriveDoublerCount(hand, seatOrder ?? [], row.mult)
    hand.doublerCount = doublerCount
    if (warning) hand.multiplierWarning = warning
  }
  return hand
}

/** Append unseated scores back on so a rewrite never shortens the stored arrays. */
function withUnseated(hand, seatDeltas, seatRoles) {
  const extraDeltas = hand.unseatedDeltas ?? []
  const extraRoles  = hand.unseatedRoles  ?? []
  return {
    seat_deltas: [...seatDeltas, ...extraDeltas],
    seat_roles:  [...seatRoles, ...extraDeltas.map((_, i) => extraRoles[i] ?? 'opp')],
  }
}

/** Everyone who sat out the hand; always includes the dealer when they sat out. */
function sitOutsOf(hand) {
  const list = hand.sitOutPids ?? []
  return hand.dealerPid && !list.includes(hand.dealerPid) ? [hand.dealerPid, ...list] : list
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
    ...withUnseated(hand,
      seatOrder.map(pid => hand.scores?.[pid] ?? 0),
      seatOrder.map(pid => {
        if (pid === hand.offenderId)       return 'picker'
        if (sitOutsOf(hand).includes(pid)) return 'out'
        return 'opp'
      })),
    dealer_name:  hand.dealerPid || null,
    sit_out:      sitOutsOf(hand),
    doubler_count: hand.doublerCount ?? 0,
    last_round:   hand.lastRound || false,
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

/** Leaster / all-pass hands — see the header for the placeholder columns. */
function allPassToDb(hand, sessionId, seatOrder) {
  const isLeaster = hand.handType === 'leaster'
  return {
    id:           hand.id,
    session_id:   sessionId,
    hand_number:  hand.handNumber,
    picker_name:  isLeaster ? hand.picker : '',
    partner_name: null,
    is_alone:     false,
    points:       0,
    tier:         isLeaster ? 'LEASTER' : 'PASS',
    mult:         isLeaster ? getMultiplier({ doublerCount: hand.doublerCount }) : 1,
    ...withUnseated(hand,
      seatOrder.map(pid => hand.scores?.[pid] ?? 0),
      seatOrder.map(pid => {
        if (sitOutsOf(hand).includes(pid))        return 'out'
        if (isLeaster && pid === hand.picker)     return 'picker'
        return 'opp'
      })),
    dealer_name:   hand.dealerPid || null,
    sit_out:       sitOutsOf(hand),
    doubler_count: hand.doublerCount ?? 0,
    last_round:    hand.lastRound || false,
    shed_clean:    false,
    no_tricks:     false,
    smith_rule:    false,
    cracked_by:    '',
    recracked_by:  '',
    blitzes:       {},
    hand_type:     isLeaster ? 'LEASTER' : 'PASS',
    offender_id:   null,
    note:          hand.note || null,
  }
}

function handToDb(hand, sessionId, seatOrder) {
  if (hand.handType === 'fup') return fupToDb(hand, sessionId, seatOrder)
  if (hand.handType === 'leaster' || hand.handType === 'pass') return allPassToDb(hand, sessionId, seatOrder)

  const seatDeltas = seatOrder.map(pid => hand.scores?.[pid] ?? 0)
  const seatRoles  = seatOrder.map(pid => {
    if (sitOutsOf(hand).includes(pid))       return 'out'
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
    // The last-round ×2 is already one of the doublers; lastRound is only a label
    mult:         getMultiplier({ ...hand, lastRound: false }),
    ...withUnseated(hand, seatDeltas, seatRoles),
    dealer_name:  hand.dealerPid || null,
    sit_out:      sitOutsOf(hand),
    doubler_count: hand.doublerCount ?? 0,
    last_round:   hand.lastRound || false,
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
  // Unseated scores belong to a seat we can't identify — moving seats around
  // would pin them on whoever lands in that position. Refuse rather than guess.
  const stuck = hands.filter(h => h.unseatedDeltas?.length)
  if (stuck.length) {
    throw new Error(
      `Hands ${stuck.map(h => '#' + h.handNumber).join(', ')} have scores for a seat this night doesn't list. ` +
      "Fix the night's seat order in the database before adding or moving players.")
  }
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
    const extra = row.seat_deltas.slice(seatOrder.length).map(d => (d > 0 ? '+' : '') + d).join(', ')
    issues.push(`${label}: has ${row.seat_deltas.length} scores but the night lists ${seatOrder.length} players — ` +
      `the extra score (${extra}) isn't credited to anyone yet. Stored data is untouched.`)
  }
  // Conservation counts every stored score, credited or not
  const sum = [...Object.values(hand?.scores ?? {}), ...(hand?.unseatedDeltas ?? [])].reduce((a, d) => a + d, 0)
  if (Math.abs(sum) > 0.001) issues.push(`${label}: scores don't balance (sum ${sum > 0 ? '+' : ''}${sum})`)
  if (hand?.handType === 'fup') {
    if (!hand.offenderId) issues.push(`${label}: no offender recorded`)
    else if (!seatOrder.includes(hand.offenderId)) issues.push(`${label}: offender is not seated in this session`)
  } else if (hand?.handType === 'leaster') {
    if (!hand.picker) issues.push(`${label}: leaster has no winner recorded`)
  } else if (hand?.handType === 'pass') {
    // all scores 0 — nothing else to check
  } else {
    if (row.hand_type) issues.push(`${label}: unknown hand type "${row.hand_type}"`)
    if (!hand?.picker) issues.push(`${label}: no picker recorded`)
  }
  return issues
}

// ── Night share links (/night/<token>) ────────────────────────────────────────

/** 24 url-safe chars from 18 random bytes; unrelated to any session id. */
function randomToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(18))
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/**
 * The share token for this night + set of tables. Reuses an existing link;
 * creates one on first use. nightDate is 'YYYY-MM-DD'.
 */
export async function getOrCreateNightShare(nightDate, sessionIds) {
  const ids = [...sessionIds].sort()
  const { data, error } = await supabase
    .from('night_shares').select('token, session_ids').eq('night_date', nightDate)
  if (error) throw error
  const existing = (data || []).find(r => [...(r.session_ids || [])].sort().join() === ids.join())
  if (existing) return existing.token

  const token = randomToken()
  const { error: insertError } = await supabase
    .from('night_shares').insert({ token, night_date: nightDate, session_ids: ids })
  if (insertError) throw insertError
  return token
}

/**
 * Everything the public night page shows, looked up by token only. Players
 * come back as names only (no phone, email or venmo). null = no such link.
 */
export async function getNightShare(token) {
  const { data: share, error } = await supabase
    .from('night_shares').select('night_date, session_ids').eq('token', token).maybeSingle()
  if (error) throw error
  if (!share) return null

  const { data: sessionRows, error: sessionsError } = await supabase
    .from('sessions').select('*').in('id', share.session_ids).order('date', { ascending: true })
  if (sessionsError) throw sessionsError

  const sessions = await Promise.all((sessionRows || []).map(async row => {
    const sess = dbToSession(row)
    const { hands } = await getHandsBySession(sess.id, sess.players)
    return { ...sess, hands }
  }))

  const pids = [...new Set(sessions.flatMap(s => s.players))]
  const { data: playerRows, error: playersError } = pids.length
    ? await supabase.from('players').select('id, first_name, last_name').in('id', pids)
    : { data: [], error: null }
  if (playersError) throw playersError

  return {
    nightDate: share.night_date,
    sessions,
    players: (playerRows || []).map(r => ({ id: r.id, firstName: r.first_name || '', lastName: r.last_name || '' })),
  }
}

// ── Analytics (read-only) ─────────────────────────────────────────────────────

async function selectAll(table) {
  const rows = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from(table).select('*').range(from, from + 999)
    if (error) throw error
    rows.push(...(data || []))
    if (!data || data.length < 1000) return rows
  }
}

/**
 * Raw players / sessions / hands rows, unmapped, for src/lib/analytics.js.
 * SELECT only — the analytics page never writes.
 */
export async function getAnalyticsRows() {
  const [players, sessions, hands] = await Promise.all(['players', 'sessions', 'hands'].map(selectAll))
  return { players, sessions, hands }
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
