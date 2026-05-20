import { useState, useCallback, useEffect, useRef } from 'react'
import { getDisplayName as computeDisplayName } from '../utils/displayName'
import { supabase, hasSupabase } from '../supabase'
import * as db from '../db'

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
    leftPlayers: [],
    ...s,
  }))
}

// ── Dealer rotation helpers ───────────────────────────────────────────────────
// Returns the index of the next active (non-left) player after fromIdx.
function nextActiveDealerIndex(players, leftPlayers, fromIdx) {
  const n = players.length
  if (n === 0) return 0
  for (let i = 1; i <= n; i++) {
    const next = (fromIdx + i) % n
    if (!leftPlayers.includes(players[next])) return next
  }
  return (fromIdx + 1) % n
}

// ── UUID migration ────────────────────────────────────────────────────────────
// Supabase UUID columns require proper UUID format. On first Supabase connect,
// migrate all local IDs (e.g. 'jake', 'p_xxx', 'h_xxx') to crypto.randomUUID().

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const isUUID  = id => Boolean(id && UUID_RE.test(id))

function ensureUUIDs(state) {
  const needsMigration =
    state.players.some(p => !isUUID(p.id)) ||
    state.sessions.some(s =>
      !isUUID(s.id) ||
      (s.hands || []).some(h => !isUUID(h.id))
    )
  if (!needsMigration) return state

  // Build a map of old-id → new-uuid (stable within this call)
  const idMap = {}
  const mapId = id => {
    if (!id) return id
    if (isUUID(id)) return id
    if (!idMap[id]) idMap[id] = crypto.randomUUID()
    return idMap[id]
  }
  const mapIds    = ids    => (ids    || []).map(mapId)
  const mapScores = scores => scores
    ? Object.fromEntries(Object.entries(scores).map(([k, v]) => [mapId(k), v]))
    : scores
  const mapBlitzes = blitzes => blitzes
    ? Object.fromEntries(Object.entries(blitzes).map(([k, v]) => [mapId(k), v]))
    : blitzes

  const players  = state.players.map(p => ({ ...p, id: mapId(p.id) }))
  const sessions = state.sessions.map(sess => ({
    ...sess,
    id:      mapId(sess.id),
    players: mapIds(sess.players),
    hands:   (sess.hands || []).map(h => ({
      ...h,
      id:         mapId(h.id),
      picker:     mapId(h.picker),
      partner:    mapId(h.partner),
      dealerPid:  mapId(h.dealerPid),
      scores:     mapScores(h.scores),
      crackers:   mapIds(h.crackers),
      recrackers: mapIds(h.recrackers),
      blitzes:    mapBlitzes(h.blitzes),
    })),
  }))

  return { players, sessions }
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
  const [state,    setState]    = useState(initState)
  const [isLoading, setIsLoading] = useState(false)
  const [syncError, setSyncError] = useState(null)

  // Mirror of latest state for reading inside async callbacks
  // (React batches setState, so we can't rely on closure-captured `state`).
  const stateRef = useRef(state)

  const update = useCallback((updater) => {
    setState(prev => {
      const next = updater(prev)
      stateRef.current = next
      save('shed:players',  next.players)
      save('shed:sessions', next.sessions)
      return next
    })
  }, [])

  // ── Initial Supabase load ────────────────────────────────────────────────
  useEffect(() => {
    if (!hasSupabase) return

    async function loadAndSync() {
      setIsLoading(true)
      setSyncError(null)

      try {
        // 1. Migrate local IDs to UUID format so they can be stored in Supabase
        const local = ensureUUIDs(stateRef.current)
        if (local !== stateRef.current) {
          console.log('[Supabase] Migrated local IDs to UUID format')
          update(() => local)
        }

        // 2. Load from Supabase
        console.log('[Supabase] Loading players and sessions...')
        const [dbPlayers, dbSessions] = await Promise.all([
          db.getPlayers(),
          db.getSessions(),
        ])
        console.log(`[Supabase] Found ${dbPlayers.length} players, ${dbSessions.length} sessions in DB`)

        // 3. Load hands for each session
        const sessionsWithHands = await Promise.all(
          dbSessions.map(async sess => {
            const hands = await db.getHandsBySession(sess.id, sess.players)
            return { ...sess, hands }
          })
        )

        if (dbPlayers.length > 0 || sessionsWithHands.length > 0) {
          // Supabase has data — always use it as the source of truth.
          // Never overwrite with local state on load.
          const players = dbPlayers.length > 0 ? dbPlayers : local.players

          // Warn if local has sessions with hands that are absent from Supabase.
          // This can happen when a device was offline during a game and its local
          // history diverged. Supabase wins; local-only sessions are discarded.
          const dbSessionIds = new Set(sessionsWithHands.map(s => s.id))
          const orphaned     = local.sessions.filter(s => (s.hands?.length ?? 0) > 0 && !dbSessionIds.has(s.id))
          if (orphaned.length > 0) {
            console.warn(
              `[Supabase] Conflict: ${orphaned.length} local session(s) with hand data not found in Supabase — ` +
              `Supabase wins, local-only data discarded.`,
              orphaned.map(s => ({ id: s.id, hands: s.hands.length, date: s.date }))
            )
          }

          update(() => ({ players, sessions: sessionsWithHands }))
          console.log('[Supabase] State hydrated from DB')
        } else {
          // Supabase returned empty. Guard against pushing default/blank state:
          // only proceed if local actually has sessions with hands logged.
          // A fresh device (or one where Supabase silently returned nothing due to
          // RLS / network) should never push DEFAULT_PLAYERS or empty sessions,
          // as that would clobber data another device may have just written.
          const localSessionsWithHands = local.sessions.filter(s => (s.hands?.length ?? 0) > 0)

          if (localSessionsWithHands.length === 0) {
            console.log('[Supabase] Supabase empty and no local game data — skipping push to avoid overwriting with defaults')
            return  // stay local-only; nothing meaningful to sync
          }

          // First-time sync: local has genuine game history that Supabase doesn't have yet.
          console.log(`[Supabase] DB empty — pushing ${local.players.length} players and ${local.sessions.length} sessions from localStorage`)

          const playerResults = await Promise.allSettled(
            local.players.map(p => db.savePlayer(p))
          )
          const playerOk  = playerResults.filter(r => r.status === 'fulfilled').length
          const playerErr = playerResults.filter(r => r.status === 'rejected')
          playerErr.forEach(r => console.error('[Supabase] savePlayer failed:', r.reason))
          console.log(`[Supabase] Migrated ${playerOk}/${local.players.length} players to Supabase`)

          for (const session of local.sessions) {
            try {
              await db.createSession(session)
              const handResults = await Promise.allSettled(
                session.hands.map(h => db.addHand(h, session.id, session.players))
              )
              const handOk  = handResults.filter(r => r.status === 'fulfilled').length
              const handErr = handResults.filter(r => r.status === 'rejected')
              handErr.forEach(r => console.error('[Supabase] addHand failed:', r.reason))
              console.log(`[Supabase] Migrated session ${session.id.slice(0, 8)}… with ${handOk}/${session.hands.length} hands`)
            } catch (err) {
              console.error('[Supabase] createSession failed:', err)
            }
          }
        }
      } catch (err) {
        console.error('[Supabase] initial load failed:', err)
        setSyncError('Sync unavailable — using local data')
      } finally {
        setIsLoading(false)
      }
    }

    loadAndSync()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Real-time subscription (hands table) ─────────────────────────────────
  useEffect(() => {
    if (!hasSupabase) return

    const channel = supabase
      .channel('shed-hands')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'hands' },
        payload => {
          const row = payload.new
          setState(prev => {
            const sess = prev.sessions.find(s => s.id === row.session_id)
            if (!sess) return prev
            // Skip hands we just wrote ourselves (already in local state)
            if (sess.hands.some(h => h.id === row.id)) return prev

            const hand     = db.dbRowToHand(row, sess.players)
            const newHands = [...sess.hands, hand]
              .sort((a, b) => a.handNumber - b.handNumber)
            const numPlayers    = sess.players.length
            const newDealerIdx  = numPlayers > 0 ? newHands.length % numPlayers : 0

            const updated = prev.sessions.map(s =>
              s.id === row.session_id
                ? { ...s, hands: newHands, dealerIndex: newDealerIdx }
                : s
            )
            const next = { ...prev, sessions: updated }
            stateRef.current = next
            save('shed:sessions', next.sessions)
            return next
          })
        }
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'hands' },
        payload => {
          const deletedId = payload.old?.id
          if (!deletedId) return
          setState(prev => {
            const updated = prev.sessions.map(s => ({
              ...s,
              hands: s.hands
                .filter(h => h.id !== deletedId)
                .map((h, i) => ({ ...h, handNumber: i + 1 })),
            }))
            const next = { ...prev, sessions: updated }
            stateRef.current = next
            save('shed:sessions', next.sessions)
            return next
          })
        }
      )
      .subscribe((status) => {
        console.log('[Supabase] Real-time subscription status:', status)
      })

    return () => supabase.removeChannel(channel)
  }, []) // once on mount

  // ── Player actions ───────────────────────────────────────────────────────
  const addPlayer = useCallback(({ firstName, lastName = '', venmo = '', phone = '', email = '', photo = null }) => {
    const id = crypto.randomUUID()
    const player = {
      id,
      firstName: firstName.trim(),
      lastName:  lastName.trim(),
      venmo:     venmo.trim(),
      phone:     phone.trim(),
      email:     email.trim(),
      photo,
    }
    update(s => ({ ...s, players: [...s.players, player] }))
    if (hasSupabase) db.savePlayer(player).catch(console.error)
  }, [update])

  const updatePlayer = useCallback((id, changes) => {
    update(s => ({ ...s, players: s.players.map(p => p.id === id ? { ...p, ...changes } : p) }))
    if (hasSupabase) {
      const current = stateRef.current.players.find(p => p.id === id)
      if (current) db.updatePlayer(id, { ...current, ...changes }).catch(console.error)
    }
  }, [update])

  const removePlayer = useCallback((id) => {
    update(s => ({ ...s, players: s.players.filter(p => p.id !== id) }))
    if (hasSupabase) db.deletePlayer(id).catch(console.error)
  }, [update])

  // ── Session actions ──────────────────────────────────────────────────────
  const startSession = useCallback((playerIds, dealerIndex = 0) => {
    const session = {
      id:                 crypto.randomUUID(),
      date:               new Date().toISOString(),
      players:            playerIds,
      hands:              [],
      active:             true,
      dealerIndex,
      lastRoundRemaining: 0,
    }
    update(s => ({ ...s, sessions: [...s.sessions, session] }))
    if (hasSupabase) db.createSession(session).catch(console.error)
    return session.id
  }, [update])

  const endSession = useCallback((sessionId) => {
    update(s => ({
      ...s,
      sessions: s.sessions.map(sess =>
        sess.id === sessionId ? { ...sess, active: false } : sess
      ),
    }))
    if (hasSupabase) db.updateSession(sessionId, { active: false }).catch(console.error)
  }, [update])

  const deleteSession = useCallback((sessionId) => {
    update(s => ({ ...s, sessions: s.sessions.filter(sess => sess.id !== sessionId) }))
    if (hasSupabase) db.deleteSession(sessionId).catch(console.error)
  }, [update])

  /**
   * Add a hand. Automatically:
   *  - bakes in lastRound flag from session state
   *  - records the current dealer
   *  - advances dealerIndex
   *  - decrements lastRoundRemaining
   */
  const addHand = useCallback((sessionId, hand) => {
    // Pre-read session from ref so we can send to Supabase after the sync update
    const sess = stateRef.current.sessions.find(s => s.id === sessionId)
    if (!sess) return

    const leftPlayers     = sess.leftPlayers ?? []
    const activeSeatOrder = sess.players.filter(p => !leftPlayers.includes(p))
    const activeCount     = activeSeatOrder.length
    const is6Player       = activeCount === 6

    const handNumber  = sess.hands.length + 1
    const rawDealerPid = sess.players[sess.dealerIndex] ?? null
    const dealerPid   = is6Player ? rawDealerPid : null
    const lastRound   = (sess.lastRoundRemaining ?? 0) > 0
    const nextDealer  = nextActiveDealerIndex(sess.players, leftPlayers, sess.dealerIndex)
    const nextLR      = lastRound ? Math.max(0, (sess.lastRoundRemaining ?? 0) - 1) : 0

    const fullHand = {
      ...hand,
      id:        crypto.randomUUID(),
      handNumber,
      lastRound,
      dealerPid,
    }

    update(s => ({
      ...s,
      sessions: s.sessions.map(session => {
        if (session.id !== sessionId) return session
        return {
          ...session,
          hands:              [...session.hands, fullHand],
          dealerIndex:        nextDealer,
          lastRoundRemaining: nextLR,
        }
      }),
    }))

    if (hasSupabase) {
      db.addHand(fullHand, sessionId, sess.players).catch(console.error)
    }
  }, [update])

  const updateHand = useCallback((sessionId, handId, handData) => {
    const sess        = stateRef.current.sessions.find(s => s.id === sessionId)
    const existingHand = sess?.hands.find(h => h.id === handId)

    update(s => ({
      ...s,
      sessions: s.sessions.map(session => {
        if (session.id !== sessionId) return session
        return {
          ...session,
          hands: session.hands.map(h => {
            if (h.id !== handId) return h
            // Preserve auto-generated fields; overwrite everything else
            return { id: h.id, handNumber: h.handNumber, lastRound: h.lastRound, dealerPid: h.dealerPid, ...handData }
          }),
        }
      }),
    }))

    if (hasSupabase && sess && existingHand) {
      const finalHand = {
        id:         handId,
        handNumber: existingHand.handNumber,
        lastRound:  existingHand.lastRound,
        dealerPid:  existingHand.dealerPid,
        ...handData,
      }
      db.addHand(finalHand, sessionId, sess.players).catch(console.error)
    }
  }, [update])

  const deleteHand = useCallback((sessionId, handId) => {
    update(s => ({
      ...s,
      sessions: s.sessions.map(session => {
        if (session.id !== sessionId) return session
        const hands = session.hands
          .filter(h => h.id !== handId)
          .map((h, i) => ({ ...h, handNumber: i + 1 }))
        return { ...session, hands }
      }),
    }))
    if (hasSupabase) db.deleteHand(handId).catch(console.error)
  }, [update])

  /** Start the Last Round countdown (one hand per active player). */
  const activateLastRound = useCallback((sessionId) => {
    update(s => ({
      ...s,
      sessions: s.sessions.map(sess => {
        if (sess.id !== sessionId || (sess.lastRoundRemaining ?? 0) > 0) return sess
        const leftPlayers = sess.leftPlayers ?? []
        const activeCount = sess.players.filter(p => !leftPlayers.includes(p)).length
        return { ...sess, lastRoundRemaining: activeCount }
      }),
    }))
  }, [update])

  /** Append a player from the roster to an active session (up to 6 total). */
  const addSessionPlayer = useCallback((sessionId, playerId) => {
    update(s => ({
      ...s,
      sessions: s.sessions.map(sess => {
        if (sess.id !== sessionId) return sess
        if (sess.players.includes(playerId) || sess.players.length >= 6) return sess
        return { ...sess, players: [...sess.players, playerId] }
      }),
    }))
    if (hasSupabase) {
      const sess = stateRef.current.sessions.find(s => s.id === sessionId)
      if (sess && !sess.players.includes(playerId) && sess.players.length < 6) {
        db.updateSession(sessionId, { players: [...sess.players, playerId] }).catch(console.error)
      }
    }
  }, [update])

  /** Insert a roster player at a specific seat position (up to 6 total). */
  const insertSessionPlayer = useCallback((sessionId, playerId, seatIndex) => {
    const sess = stateRef.current.sessions.find(s => s.id === sessionId)
    if (!sess || sess.players.includes(playerId) || sess.players.length >= 6) return

    const newPlayers = [
      ...sess.players.slice(0, seatIndex),
      playerId,
      ...sess.players.slice(seatIndex),
    ]
    // Shift dealerIndex when insertion lands before the current dealer's slot
    const newDealerIndex = seatIndex <= sess.dealerIndex
      ? sess.dealerIndex + 1
      : sess.dealerIndex

    update(s => ({
      ...s,
      sessions: s.sessions.map(session => {
        if (session.id !== sessionId) return session
        return { ...session, players: newPlayers, dealerIndex: newDealerIndex }
      }),
    }))
    if (hasSupabase) {
      db.updateSession(sessionId, { players: newPlayers }).catch(console.error)
    }
  }, [update])

  /** Mark a player as having left the session. Their column/history is preserved. */
  const markPlayerLeft = useCallback((sessionId, playerId) => {
    const sess = stateRef.current.sessions.find(s => s.id === sessionId)
    if (!sess || (sess.leftPlayers ?? []).includes(playerId)) return

    const leftPlayers = [...(sess.leftPlayers ?? []), playerId]

    // If the departing player is the current dealer, advance to the next active player
    let dealerIndex = sess.dealerIndex
    if (sess.players[dealerIndex] === playerId) {
      dealerIndex = nextActiveDealerIndex(sess.players, leftPlayers, dealerIndex)
    }

    update(s => ({
      ...s,
      sessions: s.sessions.map(session => {
        if (session.id !== sessionId) return session
        return { ...session, leftPlayers, dealerIndex }
      }),
    }))
    // leftPlayers is stored in localStorage only; no matching column in current Supabase schema
  }, [update])

  /** Insert a hand at a specific position in the hand history. Renumbers subsequent hands. */
  const insertHandAt = useCallback((sessionId, handCore, afterHandNumber) => {
    const sess = stateRef.current.sessions.find(s => s.id === sessionId)
    if (!sess) return

    // afterHandNumber === 0: insert before hand #1; afterHandNumber === N: insert after hand #N
    const insertIdx = afterHandNumber

    const newHand = { ...handCore, id: crypto.randomUUID(), handNumber: afterHandNumber + 1 }
    const before  = sess.hands.slice(0, insertIdx)
    const after   = sess.hands.slice(insertIdx)
    const renumberedAfter = after.map((h, i) => ({ ...h, handNumber: afterHandNumber + 2 + i }))
    const newHands = [...before, newHand, ...renumberedAfter]

    update(s => ({
      ...s,
      sessions: s.sessions.map(session => {
        if (session.id !== sessionId) return session
        return { ...session, hands: newHands }
      }),
    }))

    if (hasSupabase) {
      db.addHand(newHand, sessionId, sess.players).catch(console.error)
      renumberedAfter.forEach(h => db.addHand(h, sessionId, sess.players).catch(console.error))
    }
  }, [update])

  /** Reorder the session seat order. Updates dealerIndex to track the same dealer. */
  const reorderSessionPlayers = useCallback((sessionId, newOrder) => {
    const sess = stateRef.current.sessions.find(s => s.id === sessionId)
    if (!sess) return

    const currentDealerPid = sess.players[sess.dealerIndex]
    const newDealerIndex   = newOrder.indexOf(currentDealerPid)

    update(s => ({
      ...s,
      sessions: s.sessions.map(session => {
        if (session.id !== sessionId) return session
        return {
          ...session,
          players:     newOrder,
          dealerIndex: newDealerIndex >= 0 ? newDealerIndex : 0,
        }
      }),
    }))
    if (hasSupabase) {
      db.updateSession(sessionId, { players: newOrder }).catch(console.error)
    }
  }, [update])

  // ── Computed helpers ─────────────────────────────────────────────────────
  const getPlayer = useCallback((id) => state.players.find(p => p.id === id), [state.players])

  /** Smart display name — appends last initial if first name is shared. */
  const getDisplayName = useCallback((pid) =>
    computeDisplayName(state.players, pid),
  [state.players])

  const getSession       = useCallback((id) => state.sessions.find(s => s.id === id),   [state.sessions])
  const getActiveSession = useCallback(()    => state.sessions.find(s => s.active),      [state.sessions])

  const getSessionTotals = useCallback((sessionId) => {
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

    state.sessions.forEach(sess => {
      sess.players.forEach(pid => { ensure(pid); stats[pid].sessionsPlayed++ })
    })

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

    state.players.forEach(({ id: pid }) => {
      ensure(pid)
      const s = stats[pid]
      let curW = 0, curL = 0, maxW = 0, maxL = 0, cur = 0
      allHands.forEach(h => {
        const delta = h.scores?.[pid]
        if (delta === undefined) return
        if (pid === h.dealerPid) return   // sit-out hands don't break streaks
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
    isLoading,
    syncError,
    addPlayer, updatePlayer, removePlayer,
    startSession, endSession, deleteSession,
    addHand, updateHand, deleteHand, insertHandAt,
    activateLastRound, addSessionPlayer,
    insertSessionPlayer, markPlayerLeft, reorderSessionPlayers,
    getPlayer, getDisplayName, getSession, getActiveSession,
    getSessionTotals, getAnalytics,
  }
}
