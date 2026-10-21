/**
 * Analytics math — pure functions, no React, no I/O. Read-only by design:
 * nothing here (or in the pages that use it) writes to the database.
 *
 * Input is the raw table rows { players, sessions, hands } exactly as stored.
 * Missing score positions (a hand with fewer seat_deltas than seat_order) mean
 * "not seated yet", never a 0-delta hand.
 *
 * Who picked / partnered / cracked comes from the name columns; money comes
 * from seat_deltas by position, matching what the Scoreboard shows. Hands where
 * those two disagree are reported by findMisalignedHands().
 */

import { getTierLabel, getMultiplier } from '../utils/scoring.js'

export const TZ           = 'America/Chicago'
export const STREAK_MIN   = 3   // same threshold as the scoreboard (InGameStats.jsx)
export const MIN_PICKS    = 10  // all-time minimum for pick stats
export const MIN_HANDS    = 10  // all-time minimum for other rates
export const MIN_TOGETHER = 3   // chemistry / best partner / duos
export const MIN_LONERS   = 2   // Lone Wolf

const EPS      = 0.001
const WIN_TIERS = new Set(['SHED_CLEAN', 'HIGH_WIN', 'WIN'])
const SCHNEIDERED = new Set(['NO_SCHNEIDER', 'NO_TRICKS'])
const DAY_MS   = 24 * 60 * 60 * 1000

// ── Small helpers ─────────────────────────────────────────────────────────────

const dayFmt = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' })

/** Local (Chicago) calendar date of a timestamp, as 'YYYY-MM-DD'. */
export function nightKey(ts) {
  const d = new Date(ts)
  return isNaN(d) ? 'unknown' : dayFmt.format(d)
}

/** 'Wed, May 6' (or 'May 6, 2025' outside the current year). */
export function nightLabel(key, { long = false } = {}) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return key
  const [y, m, d] = key.split('-').map(Number)
  const date = new Date(Date.UTC(y, m - 1, d, 12))
  const opts = { timeZone: 'UTC', month: 'short', day: 'numeric' }
  if (long) opts.weekday = 'short'
  if (y !== new Date().getFullYear()) opts.year = 'numeric'
  return date.toLocaleDateString('en-US', opts)
}

export function normalizeTier(t) {
  return String(t ?? '').trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_|_$/g, '')
}

const splitIds = v => Array.isArray(v) ? v.filter(Boolean) : String(v ?? '').split(',').map(s => s.trim()).filter(Boolean)
const isSatOut = role => /^(out|sat[ _-]?out|satout|sitout|sit[ _-]?out)$/i.test(String(role ?? '').trim())
const r2 = n => Math.round(n * 100) / 100

/** A rate with its sample. ok = the sample minimum is met (pct is null when den is 0). */
function rate(num, den, enough = true) {
  return { num, den, pct: den > 0 ? num / den : null, ok: den > 0 && enough }
}

// ── Store fallback ────────────────────────────────────────────────────────────

/**
 * Build row-shaped data from the app's in-memory sessions, for when Supabase
 * isn't available. tier/mult are rebuilt from the hand (stored mult isn't kept
 * in memory), and every seat with a score counts as seated.
 */
export function rowsFromStore(players, sessions) {
  const pRows = players.map(p => ({ id: p.id, first_name: p.firstName, last_name: p.lastName }))
  const sRows = [], hRows = []
  sessions.forEach(s => {
    sRows.push({ id: s.id, seat_order: s.players, created_at: s.date, date: s.date, status: s.active ? 'active' : 'ended' })
    s.hands.forEach(h => {
      const isFup = h.handType === 'fup'
      hRows.push({
        id: h.id, session_id: s.id, hand_number: h.handNumber,
        hand_type: isFup ? 'FUP' : null,
        picker_name: isFup ? h.offenderId : h.picker,
        partner_name: isFup ? null : h.partner,
        is_alone: !!h.isLoner,
        points: h.pickerPoints,
        tier: isFup ? 'FUP' : getTierLabel(h),
        mult: isFup ? (h.multiplier ?? 1) : getMultiplier(h),
        seat_deltas: s.players.map(pid => h.scores?.[pid] ?? 0),
        seat_roles: s.players.map(pid =>
          pid === h.dealerPid ? 'out'
          : pid === (isFup ? h.offenderId : h.picker) ? 'picker'
          : !h.isLoner && pid === h.partner ? 'partner' : 'opp'),
        dealer_name: h.dealerPid ?? null,
        cracked_by: (h.crackers ?? []).join(','),
        recracked_by: (h.recrackers ?? []).join(','),
        blitzes: h.blitzes ?? {},
        offender_id: isFup ? h.offenderId : null,
      })
    })
  })
  return { players: pRows, sessions: sRows, hands: hRows }
}

// ── Normalize ─────────────────────────────────────────────────────────────────

/**
 * Flatten rows into chronologically ordered hands.
 * Each hand: { id, sessionId, night, num, isFup, picker, partner, isLoner, tier,
 *   pickerWon, points, mult, crackers, recrackers, blitzers, offender, dealer,
 *   seats: [{ pid, delta, role }], unseated: [delta...] }
 * role is 'picker' | 'partner' | 'opp' | 'out' (sat out).
 */
export function normalize(rows) {
  const sessions = [...(rows.sessions ?? [])]
    .map(s => ({ ...s, _ts: s.created_at ?? s.date }))
    .sort((a, b) => new Date(a._ts) - new Date(b._ts))
  const sessionIdx = new Map(sessions.map((s, i) => [s.id, i]))
  const byId = new Map(sessions.map(s => [s.id, s]))

  const hands = []
  for (const row of rows.hands ?? []) {
    const sess = byId.get(row.session_id)
    if (!sess) continue
    const order  = sess.seat_order ?? []
    const deltas = Array.isArray(row.seat_deltas) ? row.seat_deltas : []
    const roles  = Array.isArray(row.seat_roles) ? row.seat_roles : []
    const isFup  = normalizeTier(row.hand_type) === 'FUP'
    const picker = isFup ? null : (row.picker_name || null)
    const isLoner = !isFup && !!row.is_alone
    const partner = isFup || isLoner ? null : (row.partner_name || null)
    const dealer  = row.dealer_name || null

    const seats = []
    order.forEach((pid, i) => {
      if (i >= deltas.length || deltas[i] == null) return   // not seated yet
      const stored = roles[i]
      const role = isSatOut(stored) || (stored == null && pid === dealer) ? 'out'
        : pid === picker ? 'picker'
        : pid === partner ? 'partner'
        : 'opp'
      seats.push({ pid, delta: Number(deltas[i]) || 0, role, storedRole: stored ?? null })
    })

    const tier = isFup ? 'FUP' : normalizeTier(row.tier)
    const blitzers = Object.entries(row.blitzes ?? {})
      .filter(([, b]) => b && (b.black || b.red)).map(([pid]) => pid)

    hands.push({
      id: row.id,
      sessionId: sess.id,
      sessionOrder: sessionIdx.get(sess.id),
      night: nightKey(sess._ts),
      num: row.hand_number ?? 0,
      isFup,
      picker, partner, isLoner, dealer,
      tier,
      pickerWon: !isFup && WIN_TIERS.has(tier),
      points: row.points == null ? null : Number(row.points),
      mult: Number(row.mult) > 0 ? Number(row.mult) : 1,
      crackers: isFup ? [] : splitIds(row.cracked_by),
      recrackers: isFup ? [] : splitIds(row.recracked_by),
      blitzers: isFup ? [] : blitzers,
      offender: isFup ? (row.offender_id || row.picker_name || null) : null,
      seats,
      unseated: deltas.slice(order.length).map(d => Number(d) || 0),
      storedRoles: roles,
      seatOrder: order,
    })
  }
  hands.sort((a, b) => a.sessionOrder - b.sessionOrder || a.num - b.num)
  return { hands, sessions }
}

// ── Data checks ───────────────────────────────────────────────────────────────

/**
 * Hands whose stored seat_roles disagree with picker/partner/dealer names —
 * i.e. the positional scores are probably credited to the wrong seats.
 * Every earlier hand of the same session is flagged too: a seat move that
 * didn't rewrite old hands shifts all of them, even ones where the roles
 * happen to line up.
 */
export function findMisalignedHands(norm) {
  const proven = new Map()   // sessionId -> Set(num)
  for (const h of norm.hands) {
    if (h.isFup || !h.storedRoles.length) continue
    const bad = h.seatOrder.some((pid, i) => {
      if (i >= h.storedRoles.length) return false
      const r = h.storedRoles[i]
      if (isSatOut(r)) return h.dealer ? pid !== h.dealer : false
      const expected = pid === h.picker ? 'picker' : pid === h.partner ? 'partner' : 'opp'
      if (pid === h.dealer) return true   // dealer should be sitting out
      return String(r).toLowerCase() !== expected
    })
    if (bad) {
      if (!proven.has(h.sessionId)) proven.set(h.sessionId, new Set())
      proven.get(h.sessionId).add(h.num)
    }
  }
  const out = []
  for (const [sessionId, nums] of proven) {
    const last = Math.max(...nums)
    const hs = norm.hands.filter(h => h.sessionId === sessionId && !h.isFup && h.num <= last)
    hs.forEach(h => out.push({ sessionId, night: h.night, num: h.num, proven: nums.has(h.num) }))
  }
  return out
}

/** Sum every stored delta (including uncredited ones). Should be 0. */
export function conservation(norm) {
  let sum = 0
  norm.hands.forEach(h => {
    h.seats.forEach(s => { sum += s.delta })
    h.unseated.forEach(d => { sum += d })
  })
  return { sum: r2(sum), ok: Math.abs(sum) < EPS }
}

// ── Scope ─────────────────────────────────────────────────────────────────────

export function listNights(norm) {
  const set = new Set(norm.hands.map(h => h.night))
  return [...set].sort()
}

/** scope: 'all' | 'last' | 'YYYY-MM-DD'. Returns the night key or null for all-time. */
export function resolveScope(norm, scope) {
  if (!scope || scope === 'all') return null
  const nights = listNights(norm)
  if (scope === 'last') return nights[nights.length - 1] ?? null
  return nights.includes(scope) ? scope : null
}

// ── Main ──────────────────────────────────────────────────────────────────────

function blankPlayer(pid) {
  return {
    pid,
    net: 0, base: 0, hands: 0, moved: 0,
    nights: new Set(), nightNet: {}, nightHands: {},
    nightsWon: 0,
    picks: 0, pickWins: 0, pickNet: 0, pointsSum: 0, pointsN: 0,
    loners: 0, lonerWins: 0, lonerNet: 0, schneidered: 0,
    partnerHands: 0, partnerWins: 0,
    oppHands: 0, oppBumps: 0,
    cracks: 0, crackWins: 0, crackNet: 0, recracks: 0, blitzes: 0, fups: 0,
    hot: 0, cold: 0, current: 0,
    hotRun: null, coldRun: null,
    bestHand: null, worstHand: null,
  }
}

/**
 * Compute everything the dashboard and profiles show.
 *   rows   raw { players, sessions, hands }
 *   opts   { scope: 'all'|'last'|'YYYY-MM-DD', now: Date }
 */
export function computeAnalytics(rows, { scope = 'all', now = new Date() } = {}) {
  const norm   = normalize(rows)
  const allNights = listNights(norm)
  const night  = resolveScope(norm, scope)
  const single = night != null
  const hands  = single ? norm.hands.filter(h => h.night === night) : norm.hands
  const nights = single ? [night] : allNights
  const minPicks = single ? 0 : MIN_PICKS
  const minHands = single ? 0 : MIN_HANDS

  const P = {}
  const get = pid => (P[pid] ??= blankPlayer(pid))

  let movedTotal = 0, normalHands = 0, pickerWins = 0, multSum = 0, crackedHands = 0
  const pairs = {}       // `${picker}|${partner}` -> { picker, partner, hands, wins }
  const together = {}    // unordered `${a}|${b}` -> { a, b, hands, wins, net }
  const beatBy = {}      // picker -> { opp -> count }
  const runningByHand = []  // single-night running money

  for (const h of hands) {
    for (const s of h.seats) {
      const p = get(s.pid)
      p.net += s.delta
      if (s.delta > 0) { p.moved += s.delta; movedTotal += s.delta }
      p.nightNet[h.night] = (p.nightNet[h.night] ?? 0) + s.delta
      if (h.isFup) continue
      p.base += s.delta / h.mult
      if (s.role === 'out') continue
      p.hands++
      p.nights.add(h.night)
      p.nightHands[h.night] = (p.nightHands[h.night] ?? 0) + 1
      const ref = { night: h.night, num: h.num, mult: h.mult, delta: s.delta, sessionId: h.sessionId }
      if (s.delta > 0 && (!p.bestHand || s.delta > p.bestHand.delta)) p.bestHand = ref
      if (s.delta < 0 && (!p.worstHand || s.delta < p.worstHand.delta)) p.worstHand = ref

      if (s.role === 'picker') {
        p.picks++; p.pickNet += s.delta
        if (h.pickerWon) p.pickWins++
        if (h.points != null) { p.pointsSum += h.points; p.pointsN++ }
        if (h.isLoner) { p.loners++; p.lonerNet += s.delta; if (h.pickerWon) p.lonerWins++ }
        if (SCHNEIDERED.has(h.tier)) p.schneidered++
      } else if (s.role === 'partner') {
        p.partnerHands++; if (h.pickerWon) p.partnerWins++
      } else {
        p.oppHands++; if (!h.pickerWon) p.oppBumps++
      }
      if (h.crackers.includes(s.pid)) { p.cracks++; p.crackNet += s.delta; if (!h.pickerWon) p.crackWins++ }
      if (h.recrackers.includes(s.pid)) p.recracks++
      if (h.blitzers.includes(s.pid)) p.blitzes++
    }
    if (h.isFup) {
      if (h.offender) get(h.offender).fups++
    } else {
      normalHands++
      multSum += h.mult
      if (h.pickerWon) pickerWins++
      if (h.crackers.length) crackedHands++
      if (h.picker && h.partner) {
        const k = `${h.picker}|${h.partner}`
        pairs[k] ??= { picker: h.picker, partner: h.partner, hands: 0, wins: 0 }
        pairs[k].hands++; if (h.pickerWon) pairs[k].wins++
        const [a, b] = [h.picker, h.partner].sort()
        const u = `${a}|${b}`
        together[u] ??= { a, b, hands: 0, wins: 0 }
        together[u].hands++; if (h.pickerWon) together[u].wins++
      }
      if (h.picker && !h.pickerWon) {
        beatBy[h.picker] ??= {}
        h.seats.filter(s => s.role === 'opp').forEach(s => { beatBy[h.picker][s.pid] = (beatBy[h.picker][s.pid] ?? 0) + 1 })
      }
    }
    if (single) runningByHand.push(h)
  }

  // Streaks — chronological, F-ups / sat-out / 0 / not-seated don't count
  const runState = {}
  for (const h of hands) {
    if (h.isFup) continue
    for (const s of h.seats) {
      if (s.role === 'out' || s.delta === 0) continue
      const p = get(s.pid)
      const st = runState[s.pid] ??= { n: 0, start: null }
      const dir = s.delta > 0 ? 1 : -1
      if (Math.sign(st.n) === dir) st.n += dir
      else { st.n = dir; st.start = h.night }
      p.current = st.n
      if (st.n > p.hot)   { p.hot = st.n;   p.hotRun  = { len: st.n,  from: st.start, to: h.night } }
      if (-st.n > p.cold) { p.cold = -st.n; p.coldRun = { len: -st.n, from: st.start, to: h.night } }
    }
  }

  // Night results: finishes and nights won (ties share)
  const nightResults = nights.map(n => {
    const ps = Object.values(P).filter(p => p.nights.has(n))
    const ranked = ps.map(p => ({ pid: p.pid, net: r2(p.nightNet[n] ?? 0), hands: p.nightHands[n] ?? 0 }))
      .sort((a, b) => b.net - a.net)
    ranked.forEach((r, i) => { r.rank = i > 0 && Math.abs(r.net - ranked[i - 1].net) < EPS ? ranked[i - 1].rank : i + 1 })
    const top = ranked[0]?.net
    ranked.forEach(r => { if (Math.abs(r.net - top) < EPS) P[r.pid].nightsWon++ })
    const handCount = hands.filter(h => h.night === n && !h.isFup).length
    return { night: n, players: ranked, hands: handCount }
  })

  // Players in view = anyone with a hand played or a score in scope
  const ids = Object.keys(P).filter(pid => P[pid].hands > 0 || Math.abs(P[pid].net) > EPS)

  // Best partner / nemesis
  const bestPartner = {}, nemesis = {}
  ids.forEach(pid => {
    const mates = Object.values(together)
      .filter(t => (t.a === pid || t.b === pid) && t.hands >= MIN_TOGETHER)
      .map(t => ({ pid: t.a === pid ? t.b : t.a, hands: t.hands, wins: t.wins, pct: t.wins / t.hands }))
      .sort((x, y) => y.pct - x.pct || y.hands - x.hands)
    bestPartner[pid] = mates[0] ?? null
    const foes = Object.entries(beatBy[pid] ?? {}).sort((x, y) => y[1] - x[1])
    nemesis[pid] = foes.length ? { pid: foes[0][0], count: foes[0][1], picksLost: P[pid].picks - P[pid].pickWins } : null
  })

  const players = {}
  ids.forEach(pid => {
    const p = P[pid]
    const handsOk = p.hands >= minHands
    const picksOk = p.picks >= minPicks
    players[pid] = {
      pid,
      net: r2(p.net), base: r2(p.base), hands: p.hands, nights: p.nights.size, nightsWon: p.nightsWon,
      perHand: p.hands >= Math.max(1, minHands) ? p.net / p.hands : null,
      perHandRaw: p.hands ? p.net / p.hands : null,
      picks: p.picks,
      pickRate:   rate(p.picks, p.hands, handsOk),
      pickWin:    rate(p.pickWins, p.picks, picksOk),
      bumped:     rate(p.picks - p.pickWins, p.picks, picksOk),
      perPick:    p.picks && p.picks >= minPicks ? p.pickNet / p.picks : null,
      pickNet:    r2(p.pickNet),
      avgPoints:  p.pointsN && p.picks >= minPicks ? p.pointsSum / p.pointsN : null,
      loners: p.loners, lonerWins: p.lonerWins, lonerNet: r2(p.lonerNet),
      schneidered: p.schneidered,
      partnerWin: rate(p.partnerWins, p.partnerHands, handsOk),
      partnerHands: p.partnerHands,
      defense:    rate(p.oppBumps, p.oppHands, handsOk),
      cracks: p.cracks, crackWin: rate(p.crackWins, p.cracks, handsOk), crackNet: r2(p.crackNet),
      recracks: p.recracks, blitzes: p.blitzes, fups: p.fups,
      hot: p.hot, cold: p.cold, current: p.current, hotRun: p.hotRun, coldRun: p.coldRun,
      bestHand: p.bestHand, worstHand: p.worstHand,
      bestPartner: bestPartner[pid], nemesis: nemesis[pid],
      handsEnough: handsOk, picksEnough: picksOk,
    }
  })

  const ranking = [...ids].sort((a, b) => players[b].net - players[a].net || players[b].hands - players[a].hands)
  ranking.forEach((pid, i) => {
    const prev = ranking[i - 1]
    players[pid].rank = prev && Math.abs(players[prev].net - players[pid].net) < EPS ? players[prev].rank : i + 1
  })

  // Running money: by night (all-time) or by hand (one night)
  const running = buildRunning(ids, P, nights, single ? runningByHand : null)

  // Records
  const allHandRefs = ids.flatMap(pid => [players[pid].bestHand, players[pid].worstHand].filter(Boolean).map(r => ({ ...r, pid })))
  const biggest = maxBy(allHandRefs.filter(r => r.delta > 0), r => r.delta)
  const worst   = maxBy(allHandRefs.filter(r => r.delta < 0), r => -r.delta)
  const nightNets = nightResults.flatMap(n => n.players.map(r => ({ pid: r.pid, night: n.night, net: r.net })))
  const records = {
    biggestHand: biggest,
    worstHand: worst,
    hotStreak:  longestRun(ids, players, 'hotRun'),
    coldStreak: longestRun(ids, players, 'coldRun'),
    bestNight:  maxBy(nightNets.filter(r => r.net > 0), r => r.net),
    worstNight: maxBy(nightNets.filter(r => r.net < 0), r => -r.net),
  }

  // Chemistry matrix
  const pickers  = [...new Set(Object.values(pairs).map(p => p.picker))]
  const partners = [...new Set(Object.values(pairs).map(p => p.partner))]
  const byRank = (a, b) => ranking.indexOf(a) - ranking.indexOf(b)
  const duos = Object.values(together).filter(t => t.hands >= MIN_TOGETHER)
    .map(t => ({ ...t, pct: t.wins / t.hands }))
  const chemistry = {
    rows: pickers.sort(byRank), cols: partners.sort(byRank),
    cell: (pk, pt) => pairs[`${pk}|${pt}`] ?? null,
    bestDuo:  maxBy(duos, d => d.pct * 1000 + d.hands),
    worstDuo: maxBy(duos, d => (1 - d.pct) * 1000 + d.hands),
  }

  const fupsRecent = recentFups(norm, now)
  const awards = computeAwards(ids, players, chemistry, fupsRecent)

  const kpis = {
    nights: nights.filter(n => hands.some(h => h.night === n)).length,
    hands: normalHands,
    players: ids.filter(pid => players[pid].hands > 0).length,
    moved: r2(movedTotal),
    biggestHand: biggest,
    pickerWin: rate(pickerWins, normalHands),
    avgMult: normalHands ? multSum / normalHands : null,
    crackRate: rate(crackedHands, normalHands),
  }

  // Group pick rate (for profile "vs group avg")
  const totHands = ids.reduce((a, pid) => a + players[pid].hands, 0)
  const totPicks = ids.reduce((a, pid) => a + players[pid].picks, 0)

  const check = conservation(norm)
  const misaligned = findMisalignedHands(norm)

  return {
    scope: single ? night : 'all', single, night, allNights, nights,
    kpis, players, ranking, running, records, chemistry, awards, nightResults,
    groupPickRate: totHands ? totPicks / totHands : null,
    check, misaligned,
  }
}

function maxBy(arr, f) {
  let best = null, bv = -Infinity
  for (const x of arr) { const v = f(x); if (v > bv) { bv = v; best = x } }
  return best
}

/** Longest streak run, plus everyone else who matched it. */
function longestRun(ids, players, key) {
  const runs = ids.map(pid => players[pid][key] && { pid, ...players[pid][key] }).filter(Boolean)
  const best = maxBy(runs, r => r.len)
  return best && { ...best, tied: runs.filter(r => r.len === best.len && r.pid !== best.pid).map(r => r.pid) }
}

function buildRunning(ids, P, nights, nightHands) {
  if (nightHands) {
    // One night: x = hand order; each line starts the hand before the player's first seat
    // Several tables that night: prefix the table number (T1 #4, T2 #3)
    const tables = [...new Set(nightHands.map(h => h.sessionId))]
    const xs = nightHands.map((h, i) => ({
      i: i + 1,
      label: tables.length > 1 ? `T${tables.indexOf(h.sessionId) + 1} #${h.num}` : `#${h.num}`,
    }))
    const series = ids.map(pid => {
      let cum = 0, started = false
      const pts = []
      nightHands.forEach((h, i) => {
        const s = h.seats.find(x => x.pid === pid)
        if (!s && !started) return
        if (!started) { pts.push({ x: i, y: 0 }); started = true }
        cum += s?.delta ?? 0
        pts.push({ x: i + 1, y: r2(cum) })
      })
      return { pid, points: pts }
    })
    return { mode: 'hand', xs: [{ i: 0, label: 'Start' }, ...xs], series }
  }
  const series = ids.map(pid => {
    let cum = 0, started = false
    const pts = []
    nights.forEach((n, i) => {
      if (!started && P[pid].nightNet[n] == null) return
      if (!started) { pts.push({ x: i, y: 0 }); started = true }
      cum += P[pid].nightNet[n] ?? 0
      pts.push({ x: i + 1, y: r2(cum) })
    })
    return { pid, points: pts }
  })
  return { mode: 'night', xs: [{ i: 0, label: '' }, ...nights.map((n, i) => ({ i: i + 1, label: n }))], series }
}

function recentFups(norm, now) {
  const cutoff = nightKey(new Date(now.getTime() - 30 * DAY_MS))
  const counts = {}
  norm.hands.forEach(h => { if (h.isFup && h.offender && h.night >= cutoff) counts[h.offender] = (counts[h.offender] ?? 0) + 1 })
  return counts
}

// ── Awards ────────────────────────────────────────────────────────────────────

const pct = r => r?.pct == null ? '' : `${Math.round(r.pct * 100)}%`
const money = n => `${n > 0 ? '+' : n < 0 ? '−' : ''}$${Math.abs(Math.round(n * 100) / 100)}`

/**
 * Each award: { id, title, emoji, winners: [pid], reason, metric: pid -> number|null, better: 'high' }
 * metric drives the profile's "Chasing" list. Awards nobody qualifies for are dropped.
 */
function computeAwards(ids, P, chem, fupsRecent) {
  const defs = [
    { id: 'mensch', title: 'The Mensch', emoji: '🤑',
      metric: pid => P[pid].net > 0 ? P[pid].net : null,
      reason: v => `${money(v)} net`, unit: v => money(v) },
    { id: 'lonewolf', title: 'Lone Wolf', emoji: '🐺',
      metric: pid => P[pid].loners >= MIN_LONERS ? P[pid].lonerWins / P[pid].loners + P[pid].lonerWins / 1000 : null,
      reason: (_, pid) => `${P[pid].lonerWins}–${P[pid].loners - P[pid].lonerWins} going alone`,
      unit: (_, pid) => `${P[pid].lonerWins}–${P[pid].loners - P[pid].lonerWins} loners`,
      need: pid => P[pid].loners < MIN_LONERS ? `${MIN_LONERS - P[pid].loners} more loner${MIN_LONERS - P[pid].loners > 1 ? 's' : ''} to qualify` : null },
    { id: 'crackhead', title: 'Crackhead', emoji: '💥',
      metric: pid => P[pid].cracks || null,
      reason: v => `${v} crack${v === 1 ? '' : 's'}`, unit: v => `${v} cracks` },
    { id: 'wall', title: 'Defensive Wall', emoji: '🧱',
      metric: pid => P[pid].defense.ok ? P[pid].defense.pct : null,
      reason: (_, pid) => `Bumped the picker ${pct(P[pid].defense)} on defense`, unit: (_, pid) => pct(P[pid].defense) },
    { id: 'schneider', title: 'Schneider Magnet', emoji: '🧲',
      metric: pid => P[pid].schneidered || null,
      reason: v => `Schneidered ${v}× as picker`, unit: v => `${v}×` },
    { id: 'bumpking', title: 'Bumped King', emoji: '👑',
      metric: pid => P[pid].picks >= MIN_PICKS && P[pid].bumped.pct > 0 ? P[pid].bumped.pct : null,
      reason: (_, pid) => `Bumped on ${pct(P[pid].bumped)} of ${P[pid].picks} picks`, unit: (_, pid) => pct(P[pid].bumped),
      need: pid => P[pid].picks < MIN_PICKS ? `${MIN_PICKS - P[pid].picks} more picks to qualify` : null },
    { id: 'fup', title: 'F-Up of the Month', emoji: '💩',
      metric: pid => fupsRecent[pid] || null,
      reason: v => `${v} F-up${v === 1 ? '' : 's'} in the last 30 days`, unit: v => `${v} F-ups` },
    { id: 'hot', title: 'Hot Hand', emoji: '🔥',
      metric: pid => P[pid].hot >= STREAK_MIN ? P[pid].hot : null,
      reason: v => `${v} winning hands in a row`, unit: v => `${v} in a row` },
    { id: 'cold', title: 'Ice Cold', emoji: '🥶',
      metric: pid => P[pid].cold >= STREAK_MIN ? P[pid].cold : null,
      reason: v => `${v} losing hands in a row`, unit: v => `${v} in a row` },
  ]

  const out = []
  for (const d of defs) {
    const vals = ids.map(pid => [pid, d.metric(pid)]).filter(([, v]) => v != null)
    if (!vals.length) continue
    const top = Math.max(...vals.map(([, v]) => v))
    const winners = vals.filter(([, v]) => Math.abs(v - top) < 1e-9).map(([pid]) => pid)
    out.push({ id: d.id, title: d.title, emoji: d.emoji, winners, top,
      reason: d.reason(top, winners[0]),
      values: Object.fromEntries(vals), unit: d.unit, need: d.need })
    // Best Duo goes right after Defensive Wall, matching the wall order
    if (d.id === 'wall' && chem.bestDuo) {
      const b = chem.bestDuo
      out.push({ id: 'duo', title: 'Best Duo', emoji: '🤝', winners: [b.a, b.b], top: b.pct,
        reason: `${b.wins} of ${b.hands} won together (${Math.round(b.pct * 100)}%)`, values: {}, duo: true })
    }
  }
  if (!out.some(a => a.id === 'duo') && chem.bestDuo) {
    const b = chem.bestDuo
    out.push({ id: 'duo', title: 'Best Duo', emoji: '🤝', winners: [b.a, b.b], top: b.pct,
      reason: `${b.wins} of ${b.hands} won together (${Math.round(b.pct * 100)}%)`, values: {}, duo: true })
  }
  return out
}

/** Awards a player is closest to (or holds), best first. */
export function chasing(analytics, pid, limit = 3) {
  const list = []
  for (const a of analytics.awards) {
    if (a.duo) continue
    const holds = a.winners.includes(pid)
    const v = a.values[pid]
    const need = a.need?.(pid)
    if (holds) { list.push({ award: a, holds: true, closeness: 2, text: a.unit(v, pid) }); continue }
    if (v != null && a.top > 0) {
      list.push({ award: a, holds: false, closeness: v / a.top, text: `${a.unit(v, pid)} · leader ${a.unit(a.top, a.winners[0])}` })
    } else if (need) {
      list.push({ award: a, holds: false, closeness: 0, text: need })
    }
  }
  return list.sort((x, y) => y.closeness - x.closeness).slice(0, limit)
}
