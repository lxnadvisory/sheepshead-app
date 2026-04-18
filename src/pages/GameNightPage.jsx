import { useState, useEffect, useMemo, useRef } from 'react'
import Scoreboard    from '../components/Scoreboard'
import HandEntryModal from '../components/HandEntryModal'
import Settlement    from '../components/Settlement'
import InGameStats, { computeStreaks, streakStyle } from '../components/InGameStats'
import Avatar from '../components/Avatar'
import HandIcons from '../components/HandIcons'
import { exportData } from '../utils/backup'

const SEAT_LABELS = ['1st', '2nd', '3rd', '4th', '5th', '6th']

function useIsWide(bp = 1080) {
  const [wide, setWide] = useState(() => window.innerWidth >= bp)
  useEffect(() => {
    const fn = () => setWide(window.innerWidth >= bp)
    window.addEventListener('resize', fn); return () => window.removeEventListener('resize', fn)
  }, [bp])
  return wide
}

// ── Setup View ────────────────────────────────────────────────────────────────
function SetupView({ players, getDisplayName, startSession }) {
  const [selected,     setSelected]     = useState([])
  const [dealerIndex,  setDealerIndex]  = useState(0)

  const toggle = (id) => setSelected(s =>
    s.includes(id) ? s.filter(x => x !== id) : s.length < 6 ? [...s, id] : s
  )
  const moveUp   = (i) => { if (i === 0) return; setSelected(s => { const a=[...s]; [a[i-1],a[i]]=[a[i],a[i-1]]; return a }) }
  const moveDown = (i) => setSelected(s => { if (i===s.length-1) return s; const a=[...s]; [a[i],a[i+1]]=[a[i+1],a[i]]; return a })
  const remove   = (id) => { setSelected(s => s.filter(x => x !== id)); setDealerIndex(0) }

  return (
    <div style={{ maxWidth: 520, margin: '0 auto', padding: '24px 16px' }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800 }}>New Game Night</h1>
        <div style={{ color: 'var(--text-muted)', fontSize: 13, marginTop: 2 }}>Select 5–6 players, arrange seating, pick the first dealer.</div>
      </div>

      {/* Player picker */}
      <div className="card" style={{ marginBottom: 16 }}>
        <label style={{ marginBottom: 10 }}>Select Players ({selected.length}/6)</label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {players.map(p => {
            const active = selected.includes(p.id)
            const disabled = !active && selected.length >= 6
            return (
              <button key={p.id} className={`toggle-btn ${active ? 'active' : ''}`}
                onClick={() => toggle(p.id)} disabled={disabled} style={{ opacity: disabled ? 0.35 : 1, display: 'flex', alignItems: 'center', gap: 5 }}>
                <Avatar player={p} size={18} />
                {getDisplayName(p.id)}
              </button>
            )
          })}
        </div>
      </div>

      {/* Seating order */}
      {selected.length >= 2 && (
        <div className="card" style={{ marginBottom: 16 }}>
          <label style={{ marginBottom: 10 }}>Seating Order</label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {selected.map((pid, i) => {
              const p = players.find(x => x.id === pid)
              return (
                <div key={pid} style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '8px 12px' }}>
                  <span style={{ width: 28, color: 'var(--primary)', fontWeight: 800, fontSize: 12 }}>{SEAT_LABELS[i]}</span>
                  <Avatar player={p} size={24} />
                  <span style={{ flex: 1, fontWeight: 600 }}>{getDisplayName(pid)}</span>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <button className="btn btn-ghost btn-icon btn-sm" onClick={() => moveUp(i)} disabled={i === 0} style={{ fontSize: 12 }}>↑</button>
                    <button className="btn btn-ghost btn-icon btn-sm" onClick={() => moveDown(i)} disabled={i === selected.length-1} style={{ fontSize: 12 }}>↓</button>
                    <button className="btn btn-ghost btn-icon btn-sm" onClick={() => remove(pid)} style={{ fontSize: 12 }}>✕</button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Dealer selection */}
      {selected.length >= 2 && (
        <div className="card" style={{ marginBottom: 20 }}>
          <label style={{ marginBottom: 10 }}>Who deals first?</label>
          <div className="toggle-group">
            {selected.map((pid, i) => {
              const p = players.find(x => x.id === pid)
              return (
                <button key={pid} className={`toggle-btn ${dealerIndex === i ? 'active-warning' : ''}`}
                  onClick={() => setDealerIndex(i)} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <Avatar player={p} size={18} />
                  {getDisplayName(pid)}
                </button>
              )
            })}
          </div>
          {selected.length === 6 && (
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8 }}>
              In a 6-player game the dealer sits out each hand.
            </div>
          )}
        </div>
      )}

      <button className="btn btn-primary btn-lg" style={{ width: '100%' }}
        disabled={selected.length < 5} onClick={() => startSession(selected, dealerIndex)}>
        Start Game Night — {selected.length} Players
      </button>
    </div>
  )
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function isPickerSchneidered(hand) {
  if (!hand.picker || hand.shedClean) return false
  return hand.pickerNoTricks || (hand.pickerPoints != null && hand.pickerPoints < 30)
}

// ── Hand History Item ─────────────────────────────────────────────────────────
function HandItem({ hand, players, getPlayer, getDisplayName, onDelete, onEdit, forceExpanded }) {
  const [expanded, setExpanded] = useState(false)

  // When the ledger hand number is clicked, force-expand this card
  useEffect(() => {
    if (forceExpanded) setExpanded(true)
  }, [forceExpanded])
  const partner = hand.isLoner ? null : getPlayer(hand.partner)
  const schneidered = isPickerSchneidered(hand)

  // Only keep doubler and legacy blitz/crack (new-format crack/blitz shown as per-player icons)
  const hasNewCrack   = (hand.crackers?.length ?? 0) > 0
  const hasNewBlitz   = hand.blitzes && Object.keys(hand.blitzes).length > 0
  const mults = [
    (hand.doublerCount > 0 || hand.doubler) && `×${hand.doublerCount > 0 ? Math.pow(2, hand.doublerCount) : 2}`,
    // Legacy booleans only (no player attribution available)
    !hasNewCrack && (hand.crack   || false) && 'Crack',
    !hasNewCrack && !hand.recrackers?.length && (hand.reCrack || false) && 'RC',
    !hasNewBlitz && (hand.blackBlitz && hand.redBlitz ? 'Blitz' : hand.blackBlitz ? '♠♣ Blitz' : hand.redBlitz ? '♥♦ Blitz' : hand.blitz ? 'Blitz' : null),
  ].filter(Boolean)

  const specials = [
    hand.shedClean      && 'Shed Clean',
    hand.pickerNoTricks && 'No Tricks',
    hand.isLoner        && 'Loner',
    hand.lastRound      && 'Last Round',
  ].filter(Boolean)

  return (
    <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
      <div onClick={() => setExpanded(e => !e)} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', cursor: 'pointer', userSelect: 'none' }}>
        <span style={{ color: 'var(--text-muted)', fontWeight: 700, fontSize: 12, width: 22 }}>#{hand.handNumber}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <span style={{ fontWeight: 700 }}>{getDisplayName(hand.picker)}{schneidered && <span title="Schneidered" style={{ marginLeft: 3 }}>✂️</span>}</span>
            {partner && <><span style={{ color: 'var(--text-muted)', fontSize: 12 }}>+</span><span style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>{getDisplayName(hand.partner)}</span></>}
            {specials.map(s => <span key={s} className="badge badge-warning" style={{ fontSize: 10 }}>{s}</span>)}
            {mults.map((m, i) => <span key={i} className="badge badge-primary" style={{ fontSize: 10 }}>{m}</span>)}
          </div>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', marginTop: 2 }}>
            {hand.isLoner
              ? `🐺 Loner — ${hand.pickerPoints ?? '?'} pts`
              : hand.pickerPoints != null ? `${hand.pickerPoints} pts` : ''}
          </div>
        </div>
        {/* Collapsed score cells with per-player icons */}
        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          {players.slice(0, 6).map(pid => {
            const delta = hand.scores?.[pid] ?? 0
            return (
              <div key={pid} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 30, flexShrink: 0 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: delta > 0 ? 'var(--success)' : delta < 0 ? 'var(--danger)' : 'var(--text-muted)' }}>
                  {delta > 0 ? `+${delta}` : delta === 0 ? '—' : delta}
                </span>
                <HandIcons hand={hand} pid={pid} size={9} showLoner={true} />
              </div>
            )
          })}
        </div>
        <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>{expanded ? '▲' : '▼'}</span>
      </div>

      {expanded && (
        <div style={{ borderTop: '1px solid var(--border)', padding: '12px 14px', background: 'var(--bg-elevated)' }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
            {players.map(pid => {
              const p     = getPlayer(pid)
              const delta = hand.scores?.[pid] ?? 0
              const isPicker  = pid === hand.picker
              const isPartner = !hand.isLoner && pid === hand.partner
              const role  = isPicker ? 'Picker' : isPartner ? 'Partner' : pid === hand.dealerPid ? 'Sat Out' : 'Opp'
              return (
                <div key={pid} style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '6px 10px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, minWidth: 64, opacity: role === 'Sat Out' ? 0.5 : 1 }}>
                  <span style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase' }}>{role}</span>
                  <Avatar player={p} size={24} />
                  <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                    <span style={{ fontWeight: 700, fontSize: 12 }}>{getDisplayName(pid)}</span>
                    <HandIcons hand={hand} pid={pid} size={10} showLoner={true} />
                    {schneidered && isPicker && <span title="Schneidered" style={{ fontSize: 10 }}>✂️</span>}
                  </div>
                  {isPicker && hand.pickerPoints != null && (
                    <span style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: 700 }}>
                      {hand.pickerPoints} pts
                    </span>
                  )}
                  <span style={{ fontSize: 16, fontWeight: 800, color: delta > 0 ? 'var(--success)' : delta < 0 ? 'var(--danger)' : 'var(--text-muted)' }}>
                    {delta > 0 ? `+${delta}` : delta === 0 ? '—' : delta}
                  </span>
                </div>
              )
            })}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-ghost btn-sm" onClick={() => onEdit(hand)}>Edit</button>
            <button className="btn btn-danger btn-sm" onClick={() => onDelete(hand.id)}>Delete Hand</button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Active Game View ──────────────────────────────────────────────────────────
function pickToast(hand) {
  if (hand.shedClean)      return { msg: 'Prost! 🍺',          color: 'var(--success)' }
  if (hand.pickerNoTricks) return { msg: 'Katastrophe!',        color: 'var(--danger)'  }
  if (hand.pickerPoints != null && hand.pickerPoints < 30)
                           return { msg: 'Der Schneider! ✂️',   color: '#f97316'        }
  if (hand.pickerPoints != null && hand.pickerPoints < 61)
                           return { msg: 'Bumped! Schade...',   color: 'var(--warning)' }
  if (hand.pickerPoints != null && hand.pickerPoints >= 91)
                           return { msg: 'Wunderbar! 🎉',       color: 'var(--success)' }
  return null
}

function ActiveGameView({ session, players: allRosterPlayers, getPlayer, getDisplayName, addHand, updateHand, deleteHand, endSession, activateLastRound, addSessionPlayer, onShowDisplay }) {
  const [showModal,   setShowModal]   = useState(false)
  const [showSettle,  setShowSettle]  = useState(false)
  const [confirmEnd,  setConfirmEnd]  = useState(false)
  const [showStats,   setShowStats]   = useState(false)
  const [showAddPlyr, setShowAddPlyr] = useState(false)
  const [toast,        setToast]        = useState(null)
  const [editingHand,  setEditingHand]  = useState(null)   // hand object being edited
  const [scrollTarget, setScrollTarget] = useState(null)   // { id, ts } — click-from-ledger
  const handItemRefs = useRef({})
  const isWide = useIsWide()

  // When a hand number is clicked in the ledger, scroll to + expand that HandItem
  useEffect(() => {
    if (!scrollTarget) return
    const el = handItemRefs.current[scrollTarget.id]
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [scrollTarget])

  const sessionPlayers = session.players
  const hands          = session.hands
  const is6Player      = sessionPlayers.length === 6
  const currentDealer  = sessionPlayers[session.dealerIndex ?? 0]
  const dealerPid      = is6Player ? currentDealer : null

  // Active players for this hand (excludes sitting-out dealer in 6-player)
  const activePlayers = dealerPid ? sessionPlayers.filter(p => p !== dealerPid) : sessionPlayers

  const totals = useMemo(() => {
    const t = {}
    sessionPlayers.forEach(pid => { t[pid] = 0 })
    hands.forEach(h => Object.entries(h.scores ?? {}).forEach(([pid, d]) => { t[pid] = (t[pid] ?? 0) + d }))
    return t
  }, [hands, sessionPlayers])

  const streaks = useMemo(() => computeStreaks(hands, sessionPlayers), [hands, sessionPlayers])
  const sorted  = [...sessionPlayers].sort((a, b) => (totals[b] ?? 0) - (totals[a] ?? 0))

  const lrRemaining = session.lastRoundRemaining ?? 0
  const lastRoundActive = lrRemaining > 0

  const dateStr = new Date(session.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })

  // Roster players not yet in session
  const addablePlayers = allRosterPlayers.filter(p => !sessionPlayers.includes(p.id) && sessionPlayers.length < 6)

  // ── Session header ──────────────────────────────────────────────────────────
  const SessionHeader = (
    <div style={{ padding: '16px 16px 14px', borderBottom: '1px solid var(--border)', position: 'sticky', top: 0, background: 'var(--bg-base)', zIndex: 10 }}>

      {/* Last Round banner */}
      {lastRoundActive && (
        <div style={{ background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: 'var(--radius-sm)', padding: '6px 12px', marginBottom: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--warning)' }}>🏁 Last Round</span>
          <span style={{ fontSize: 12, color: 'var(--warning)' }}>{lrRemaining} hand{lrRemaining !== 1 ? 's' : ''} remaining</span>
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 800 }}>The Shed</h1>
          <div style={{ color: 'var(--text-muted)', fontSize: 12, marginTop: 1 }}>{dateStr} · {hands.length} hand{hands.length !== 1 ? 's' : ''}</div>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          {!isWide && <button className="btn btn-ghost btn-sm" onClick={() => setShowStats(true)}>◈ Stats</button>}
          {addablePlayers.length > 0 && (
            <button className="btn btn-ghost btn-sm" onClick={() => setShowAddPlyr(s => !s)}>+ Player</button>
          )}
          {!lastRoundActive && (
            <button className="btn btn-ghost btn-sm" onClick={() => activateLastRound(session.id)}
              style={{ color: 'var(--warning)', borderColor: 'rgba(245,158,11,0.4)' }}>
              🏁 Last Round
            </button>
          )}
          <button className="btn btn-ghost btn-sm" onClick={() => setShowSettle(s => !s)}>
            {showSettle ? 'Scoreboard' : 'Settle Up'}
          </button>
          {onShowDisplay && (
            <button className="btn btn-ghost btn-sm" onClick={onShowDisplay} title="Open TV display mode" style={{ gap: 4 }}>
              <span style={{ fontSize: 13 }}>📺</span>
              <span>TV</span>
            </button>
          )}
          {!confirmEnd
            ? <button className="btn btn-danger btn-sm" onClick={() => setConfirmEnd(true)}>End Night</button>
            : <button className="btn btn-danger btn-sm" onClick={() => endSession(session.id)}>Confirm End</button>
          }
        </div>
      </div>

      {/* Add player inline panel */}
      {showAddPlyr && addablePlayers.length > 0 && (
        <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '10px 12px', marginBottom: 10 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Add to game</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {addablePlayers.map(p => (
              <button key={p.id} className="toggle-btn"
                onClick={() => { addSessionPlayer(session.id, p.id); setShowAddPlyr(false) }}
                style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <Avatar player={p} size={18} />
                {getDisplayName(p.id)}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Hero standings strip — primary visual element */}
      {(() => {
        const av   = isWide ? 72  : 52
        const nSz  = isWide ? 15  : 13
        const sSz  = isWide ? 44  : 30
        const pad  = isWide ? '18px 16px 16px' : '12px 10px 10px'
        return (
          <div style={{ display: 'flex', gap: isWide ? 12 : 8, overflowX: 'auto', paddingBottom: 2 }}>
            {sorted.map(pid => {
              const p     = getPlayer(pid)
              const total = totals[pid] ?? 0
              const ss    = streakStyle(streaks[pid])
              const isDlr = pid === currentDealer
              return (
                <div key={pid} style={{
                  flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
                  background: ss?.bg ?? 'var(--bg-elevated)',
                  border: `2px solid ${total > 0 ? 'rgba(34,197,94,0.4)' : total < 0 ? 'rgba(239,68,68,0.35)' : 'var(--border)'}`,
                  borderRadius: 'var(--radius)', padding: pad,
                  minWidth: isWide ? 110 : 80, flexShrink: 0,
                  transition: 'background 0.4s', position: 'relative',
                  boxShadow: total !== 0 ? `0 4px 16px ${total > 0 ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.1)'}` : 'none',
                }}>
                  {isDlr && (
                    <span style={{ position: 'absolute', top: 5, right: 5, fontSize: 10, fontWeight: 800, background: 'rgba(245,158,11,0.25)', color: 'var(--warning)', borderRadius: 3, padding: '2px 5px' }}>D</span>
                  )}
                  <Avatar player={p} size={av} />
                  <div style={{ display: 'flex', alignItems: 'center', gap: 3, marginTop: 7 }}>
                    <span style={{ fontSize: nSz, fontWeight: 700, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{getDisplayName(pid)}</span>
                    {ss && <span style={{ fontSize: nSz - 1 }}>{ss.icon}</span>}
                  </div>
                  <span style={{ fontSize: sSz, fontWeight: 900, lineHeight: 1.1, marginTop: 4, color: total > 0 ? 'var(--success)' : total < 0 ? 'var(--danger)' : 'var(--text-muted)' }}>
                    {total > 0 ? `+${total}` : total === 0 ? '0' : total}
                  </span>
                </div>
              )
            })}
          </div>
        )
      })()}
    </div>
  )

  // ── Main content ────────────────────────────────────────────────────────────
  const MainContent = (
    <div style={{ padding: '0 16px 80px' }}>
      {showSettle ? (
        <div style={{ paddingTop: 20 }}>
          <Settlement players={sessionPlayers} totals={totals} getPlayer={getPlayer} getDisplayName={getDisplayName} />
        </div>
      ) : (
        <>
          {hands.length > 0 && (
            <div className="card" style={{ marginTop: 16, padding: 0, overflow: 'hidden' }}>
              <Scoreboard
                players={sessionPlayers}
                getPlayer={getPlayer}
                getDisplayName={getDisplayName}
                hands={hands}
                totals={totals}
                dealerPid={currentDealer}
                onHandClick={(handId) => setScrollTarget({ id: handId, ts: Date.now() })}
              />
            </div>
          )}
          <div style={{ marginTop: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Hands</div>
            {hands.length === 0 && <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)' }}>No hands yet. Log the first hand!</div>}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[...hands].reverse().map(h => (
                <div key={h.id} ref={el => handItemRefs.current[h.id] = el}>
                  <HandItem hand={h} players={sessionPlayers} getPlayer={getPlayer} getDisplayName={getDisplayName}
                    forceExpanded={scrollTarget?.id === h.id}
                    onDelete={(hid) => deleteHand(session.id, hid)}
                    onEdit={(hand) => setEditingHand(hand)}
                  />
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )

  return (
    <div style={{ maxWidth: isWide ? 1160 : 720, margin: '0 auto' }}>
      <div style={{ display: isWide ? 'flex' : 'block', alignItems: 'flex-start' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          {SessionHeader}
          {MainContent}
        </div>

        {/* Desktop stats sidebar */}
        {isWide && !showSettle && (
          <div style={{ width: 296, flexShrink: 0, borderLeft: '1px solid var(--border)', alignSelf: 'flex-start', position: 'sticky', top: 0, maxHeight: '100vh', overflowY: 'auto' }}>
            <InGameStats session={session} getPlayer={getPlayer} getDisplayName={getDisplayName} />
          </div>
        )}
      </div>

      {/* FAB */}
      {!showSettle && (
        <button className="btn btn-primary btn-lg" onClick={() => setShowModal(true)}
          style={{ position: 'fixed', bottom: 24, right: 24, borderRadius: 32, boxShadow: '0 4px 20px rgba(99,102,241,0.45)', paddingLeft: 20, paddingRight: 20, zIndex: 100 }}>
          + Log Hand
        </button>
      )}

      {/* Hand entry modal */}
      {showModal && (
        <HandEntryModal
          players={activePlayers}
          getPlayer={getPlayer}
          getDisplayName={getDisplayName}
          dealerPid={dealerPid}
          lastRoundActive={lastRoundActive}
          onSubmit={(hand) => {
            addHand(session.id, hand)
            setShowModal(false)
            const t = pickToast(hand)
            if (t) setToast({ ...t, key: Date.now() })
          }}
          onClose={() => setShowModal(false)}
        />
      )}

      {/* Edit hand modal */}
      {editingHand && (
        <HandEntryModal
          players={activePlayers}
          getPlayer={getPlayer}
          getDisplayName={getDisplayName}
          dealerPid={dealerPid}
          initialValues={editingHand}
          onSubmit={(hand) => {
            updateHand(session.id, editingHand.id, { ...hand, scores: hand.scores })
            setEditingHand(null)
          }}
          onClose={() => setEditingHand(null)}
        />
      )}

      {/* German toast notification */}
      {toast && (
        <div
          key={toast.key}
          onAnimationEnd={() => setToast(null)}
          style={{
            position: 'fixed', top: 76, left: '50%',
            animation: 'toastFade 2.2s ease forwards',
            background: 'var(--bg-elevated)',
            border: `1px solid ${toast.color}`,
            borderRadius: 'var(--radius)',
            padding: '10px 22px',
            fontSize: 17, fontWeight: 800,
            color: toast.color,
            zIndex: 600,
            boxShadow: 'var(--shadow-lg)',
            pointerEvents: 'none',
            whiteSpace: 'nowrap',
          }}
        >
          {toast.msg}
        </div>
      )}

      {/* Mobile stats slide-out */}
      {!isWide && showStats && (
        <div onClick={() => setShowStats(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(3px)', zIndex: 200, display: 'flex', justifyContent: 'flex-end' }}>
          <div onClick={e => e.stopPropagation()} style={{ width: 300, background: 'var(--bg-surface)', borderLeft: '1px solid var(--border)', height: '100%', overflowY: 'auto', animation: 'slideInRight 0.22s ease' }}>
            <div style={{ padding: '14px 14px 12px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'sticky', top: 0, background: 'var(--bg-surface)' }}>
              <span style={{ fontWeight: 700, fontSize: 15 }}>Live Stats</span>
              <button className="btn btn-ghost btn-icon btn-sm" onClick={() => setShowStats(false)}>✕</button>
            </div>
            <InGameStats session={session} getPlayer={getPlayer} getDisplayName={getDisplayName} />
          </div>
        </div>
      )}
    </div>
  )
}

// ── Past Session Card ─────────────────────────────────────────────────────────
function PastSessionCard({ session, getPlayer, getDisplayName, getSessionTotals, onDelete }) {
  const [expanded, setExpanded] = useState(false)
  const totals = getSessionTotals(session.id)
  const sorted = [...session.players].sort((a, b) => (totals[b] ?? 0) - (totals[a] ?? 0))
  const dateStr = new Date(session.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })

  return (
    <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
      <div onClick={() => setExpanded(e => !e)} style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer', userSelect: 'none' }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700 }}>{dateStr}</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
            {session.hands.length} hands · {session.players.map(pid => getDisplayName(pid)).join(', ')}
          </div>
        </div>
        <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>{expanded ? '▲' : '▼'}</span>
      </div>
      {expanded && (
        <div style={{ borderTop: '1px solid var(--border)', padding: 14, background: 'var(--bg-elevated)' }}>
          <Settlement players={sorted} totals={totals} getPlayer={getPlayer} getDisplayName={getDisplayName} />
          <div style={{ marginTop: 12 }}>
            <button className="btn btn-danger btn-sm" onClick={() => onDelete(session.id)}>Delete Session</button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Main GameNightPage ────────────────────────────────────────────────────────
export default function GameNightPage({
  players, sessions,
  startSession, endSession, deleteSession,
  addHand, updateHand, deleteHand,
  activateLastRound, addSessionPlayer,
  getPlayer, getDisplayName, getActiveSession, getSessionTotals,
  onShowDisplay,
}) {
  const [backupSession, setBackupSession] = useState(null)
  const activeSession = getActiveSession()

  const handleEndSession = (sessionId) => {
    const sess = sessions.find(s => s.id === sessionId)
    endSession(sessionId)
    if (sess) setBackupSession(sess)
  }

  if (activeSession) {
    return (
      <ActiveGameView
        session={activeSession}
        players={players}
        getPlayer={getPlayer}
        getDisplayName={getDisplayName}
        addHand={addHand}
        updateHand={updateHand}
        deleteHand={deleteHand}
        endSession={handleEndSession}
        activateLastRound={activateLastRound}
        addSessionPlayer={addSessionPlayer}
        onShowDisplay={onShowDisplay}
      />
    )
  }

  const pastSessions = [...sessions].filter(s => !s.active).reverse()

  return (
    <div style={{ maxWidth: 560, margin: '0 auto', padding: '24px 16px' }}>

      {/* Post-session backup prompt */}
      {backupSession && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          background: 'var(--bg-elevated)',
          border: '1px solid rgba(99,102,241,0.4)',
          borderRadius: 'var(--radius)',
          padding: '10px 14px',
          marginBottom: 20,
        }}>
          <span style={{ fontSize: 18, flexShrink: 0 }}>💾</span>
          <span style={{ flex: 1, fontSize: 13, color: 'var(--text-secondary)' }}>
            Download a backup of tonight's session?
          </span>
          <button
            className="btn btn-primary btn-sm"
            onClick={() => { exportData(); setBackupSession(null) }}
          >
            Download
          </button>
          <button
            className="btn btn-ghost btn-icon btn-sm"
            onClick={() => setBackupSession(null)}
            title="Dismiss"
          >
            ✕
          </button>
        </div>
      )}

      <SetupView players={players} getDisplayName={getDisplayName} startSession={startSession} />
      {pastSessions.length > 0 && (
        <div style={{ marginTop: 32 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>Past Sessions</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {pastSessions.map(s => (
              <PastSessionCard key={s.id} session={s} getPlayer={getPlayer} getDisplayName={getDisplayName} getSessionTotals={getSessionTotals} onDelete={deleteSession} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
