import { useState, useCallback } from 'react'
import { getDisplayName as computeDisplayName } from '../utils/displayName'

// ── Default data ──────────────────────────────────────────────────────────────
const DEFAULT_PLAYERS = [
  { id: 'jake',   firstName: 'Jake',   lastName: 'Carey',  venmo: 'Jake-Carey', phone: '', email: '', photo: null },
  { id: 'bubba',  firstName: 'Bubba',  lastName: '',       venmo: 'Bubba',      phone: '', email: '', photo: null },
  { id: 'landon', firstName: 'Landon', lastName: '',       venmo: 'Landon',     phone: '', email: '', photo: null },
  { id: 'jen',    firstName: 'Jen',    lastName: '',       venmo: 'Jen',        phone: '', email: '', photo: null },
  { id: 'matt',   firstName: 'Matt',   lastName: '',       venmo: 'Matt',       phone: '', email: '', photo: null },
  { id: 'kelsey', firstName: 'Kelsey', lastName: '',       venmo: 'Kelsey',     phone: '', email: '', photo: null },
]

// ── localStorage helpers ──────────────────────────────────────────────────────
function load(key, fallback) {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback }
  catch { return fallback }
}
function save(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)) } catch {}
}

// ── Migration helpers ─────────────────────────────────────────────────────────
function migratePlayers(players) {
  return players.map(p => ({
    phone: '', email: '', lastName: '', photo: null,
    ...p,
    firstName: p.firstName ?? p.name ?? '',
  }))
}

function migrateSessions(sessions) {
  return sessions.map(s => ({
    dealerIndex: 0,
    lastRoundRemaining: 0,
    ...s,
  }))
}

// ── Initial state ─────────────────────────────────────────────────────────────
function initState() {
  return {
    players:  migratePlayers(load('shed:players',  DEFAULT_PLAYERS)),
    sessions: migrateSessions(load('shed:sessions', [])),
  }
}

// ── The hook ──────────────────────────────────────────────────────────────────
export function useStore() {
  const [state, setState] = useState(initState)

  const update = useCallback((updater) => {
    setState(prev => {
      const next = updater(prev)
      save('shed:players',  next.players)
      save('shed:sessions', next.sessions)
      return next
    })
  }, [])

  // ── Player actions ───────────────────────────────────────────────────────
  const addPlayer = useCallback(({ firstName, lastName = '', venmo = '', phone = '', email = '', photo = null }) => {
    const id = `p_${Date.now()}`
    update(s => ({
      ...s,
      players: [...s.players, {
        id,
        firstName: firstName.trim(),
        lastName:  lastName.trim(),
        venmo:     venmo.trim(),
        phone:     phone.trim(),
        email:     email.trim(),
        photo,
      }],
    }))
  }, [update])

  const updatePlayer = useCallback((id, changes) => {
    update(s => ({ ...s, players: s.players.map(p => p.id === id ? { ...p, ...changes } : p) }))
  }, [update])

  const removePlayer = useCallback((id) => {
    update(s => ({ ...s, players: s.players.filter(p => p.id !== id) }))
  }, [update])

  // ── Session actions ──────────────────────────────────────────────────────
  /**
   * @param {string[]} playerIds  - ordered seating
   * @param {number}   dealerIndex - index of first dealer (0-based)
   */
  const startSession = useCallback((playerIds, dealerIndex = 0) => {
    const session = {
      id: `s_${Date.now()}`,
      date: new Date().toISOString(),
      players: playerIds,
      hands: [],
      active: true,
      dealerIndex,
      lastRoundRemaining: 0,
    }
    update(s => ({ ...s, sessions: [...s.sessions, session] }))
    return session.id
  }, [update])

  const endSession = useCallback((sessionId) => {
    update(s => ({
      ...s,
      sessions: s.sessions.map(sess =>
        sess.id === sessionId ? { ...sess, active: false } : sess
      ),
    }))
  }, [update])

  const deleteSession = useCallback((sessionId) => {
    update(s => ({ ...s, sessions: s.sessions.filter(sess => sess.id !== sessionId) }))
  }, [update])

  /**
   * Add a hand. Automatically:
   *  - bakes in lastRound flag from session state
   *  - records the current dealer
   *  - advances dealerIndex
   *  - decrements lastRoundRemaining
   */
  const addHand = useCallback((sessionId, hand) => {
    update(s => ({
      ...s,
      sessions: s.sessions.map(sess => {
        if (sess.id !== sessionId) return sess
        const handNumber   = sess.hands.length + 1
        const numPlayers   = sess.players.length
        const dealerPid    = sess.players[sess.dealerIndex] ?? null
        const lastRound    = (sess.lastRoundRemaining ?? 0) > 0
        const nextDealer   = (sess.dealerIndex + 1) % numPlayers
        const nextLR       = lastRound ? Math.max(0, (sess.lastRoundRemaining ?? 0) - 1) : 0
        return {
          ...sess,
          hands: [...sess.hands, {
            ...hand,
            id:         `h_${Date.now()}`,
            handNumber,
            lastRound,
            dealerPid:  numPlayers === 6 ? dealerPid : null,
          }],
          dealerIndex:          nextDealer,
          lastRoundRemaining:   nextLR,
        }
      }),
    }))
  }, [update])

  const updateHand = useCallback((sessionId, handId, handData) => {
    update(s => ({
      ...s,
      sessions: s.sessions.map(sess => {
        if (sess.id !== sessionId) return sess
        return {
          ...sess,
          hands: sess.hands.map(h => {
            if (h.id !== handId) return h
            // Preserve auto-generated fields; overwrite everything else
            return { id: h.id, handNumber: h.handNumber, lastRound: h.lastRound, dealerPid: h.dealerPid, ...handData }
          }),
        }
      }),
    }))
  }, [update])

  const deleteHand = useCallback((sessionId, handId) => {
    update(s => ({
      ...s,
      sessions: s.sessions.map(sess => {
        if (sess.id !== sessionId) return sess
        const hands = sess.hands
          .filter(h => h.id !== handId)
          .map((h, i) => ({ ...h, handNumber: i + 1 }))
        return { ...sess, hands }
      }),
    }))
  }, [update])

  /** Start the Last Round countdown (5 or 6 hands based on player count). */
  const activateLastRound = useCallback((sessionId) => {
    update(s => ({
      ...s,
      sessions: s.sessions.map(sess => {
        if (sess.id !== sessionId || (sess.lastRoundRemaining ?? 0) > 0) return sess
        return { ...sess, lastRoundRemaining: sess.players.length }
      }),
    }))
  }, [update])

  /** Add a player from the roster to an active session (up to 6). */
  const addSessionPlayer = useCallback((sessionId, playerId) => {
    update(s => ({
      ...s,
      sessions: s.sessions.map(sess => {
        if (sess.id !== sessionId) return sess
        if (sess.players.includes(playerId) || sess.players.length >= 6) return sess
        return { ...sess, players: [...sess.players, playerId] }
      }),
    }))
  }, [update])

  // ── Computed helpers ─────────────────────────────────────────────────────
  const getPlayer = useCallback((id) => state.players.find(p => p.id === id), [state.players])

  /** Smart display name — appends last initial if first name is shared. */
  const getDisplayName = useCallback((pid) =>
    computeDisplayName(state.players, pid),
  [state.players])

  const getSession        = useCallback((id) => state.sessions.find(s => s.id === id), [state.sessions])
  const getActiveSession  = useCallback(() => state.sessions.find(s => s.active), [state.sessions])

  const getSessionTotals  = useCallback((sessionId) => {
    const sess = state.sessions.find(s => s.id === sessionId)
    if (!sess) return {}
    const totals = {}
    sess.players.forEach(pid => { totals[pid] = 0 })
    sess.hands.forEach(h => {
      Object.entries(h.scores ?? {}).forEach(([pid, d]) => { totals[pid] = (totals[pid] ?? 0) + d })
    })
    return totals
  }, [state.sessions])

  const getAnalytics = useCallback(() => {
    const sortedSessions = [...state.sessions].sort((a, b) => new Date(a.date) - new Date(b.date))
    const allHands = sortedSessions.flatMap(s => s.hands)
    const stats = {}

    const ensure = (id) => {
      if (!stats[id]) stats[id] = {
        handsPlayed: 0, asPicker: 0, asPartner: 0, asOpp: 0,
        totalPts: 0, pickerPts: 0, partnerPts: 0, oppPts: 0,
        wins: 0, losses: 0,
        pickerLosses: 0, lonerCount: 0,
        pickerPointsSum: 0,
        crackCount: 0, blitzCount: 0, schneiderCount: 0,
        longestWinStreak: 0, longestLossStreak: 0,
        currentStreak: 0, biggestHandWin: 0,
        sessionsPlayed: 0,
      }
    }

    // Sessions per player
    state.sessions.forEach(sess => {
      sess.players.forEach(pid => { ensure(pid); stats[pid].sessionsPlayed++ })
    })

    // Per-hand stats
    allHands.forEach(h => {
      Object.entries(h.scores ?? {}).forEach(([pid, delta]) => {
        ensure(pid)
        const s = stats[pid]
        s.totalPts    += delta
        s.handsPlayed++
        if (delta > 0) s.wins++
        if (delta < 0) s.losses++
        if (delta > s.biggestHandWin) s.biggestHandWin = delta

        if (pid === h.picker) {
          s.asPicker++; s.pickerPts += delta
          if (delta < 0) s.pickerLosses++
          if (h.isLoner) s.lonerCount++
          s.pickerPointsSum += h.pickerPoints ?? 60
          if (h.pickerNoTricks || (h.pickerPoints != null && h.pickerPoints < 30)) s.schneiderCount++
        } else if (!h.isLoner && pid === h.partner) {
          s.asPartner++; s.partnerPts += delta
        } else if (pid !== h.dealerPid) {
          s.asOpp++;     s.oppPts += delta
        }

        if ((h.crackers ?? []).includes(pid)) s.crackCount++
        if (h.blitzes?.[pid]?.black || h.blitzes?.[pid]?.red) s.blitzCount++
      })
    })

    // Compute streaks per player across all hands chronologically
    state.players.forEach(({ id: pid }) => {
      ensure(pid)
      const s = stats[pid]
      let curW = 0, curL = 0, maxW = 0, maxL = 0, cur = 0
      allHands.forEach(h => {
        const delta = h.scores?.[pid]
        if (delta === undefined) return
        if (delta > 0) {
          curW++; curL = 0; if (curW > maxW) maxW = curW; cur = curW
        } else if (delta < 0) {
          curL++; curW = 0; if (curL > maxL) maxL = curL; cur = -curL
        } else {
          curW = 0; curL = 0; cur = 0
        }
      })
      s.longestWinStreak  = maxW
      s.longestLossStreak = maxL
      s.currentStreak     = cur
    })

    return stats
  }, [state.sessions, state.players])

  return {
    players:  state.players,
    sessions: state.sessions,
    addPlayer, updatePlayer, removePlayer,
    startSession, endSession, deleteSession,
    addHand, updateHand, deleteHand,
    activateLastRound, addSessionPlayer,
    getPlayer, getDisplayName, getSession, getActiveSession,
    getSessionTotals, getAnalytics,
  }
}
