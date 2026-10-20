import { useState, useEffect, useMemo, useRef } from 'react'
import Scoreboard         from '../components/Scoreboard'
import HandEntryModal     from '../components/HandEntryModal'
import FupModal           from '../components/FupModal'
import ManagePlayersModal from '../components/ManagePlayersModal'
import Settlement         from '../components/Settlement'
import InGameStats, { computeStreaks, streakStyle } from '../components/InGameStats'
import Avatar from '../components/Avatar'
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

function ActiveGameView({ session, players: allRosterPlayers, getPlayer, getDisplayName, addHand, updateHand, deleteHand, insertHandAt, endSession, activateLastRound, addSessionPlayer, insertSessionPlayer, markPlayerLeft, reorderSessionPlayers }) {
  const [showModal,          setShowModal]          = useState(false)
  const [showFup,            setShowFup]            = useState(false)
  const [showSettle,         setShowSettle]         = useState(false)
  const [showFinalizeConfirm, setShowFinalizeConfirm] = useState(false)
  const [showStats,          setShowStats]          = useState(false)
  const [showAddPlyr,        setShowAddPlyr]        = useState(false)
  const [showManage,         setShowManage]         = useState(false)
  const [showManualAdd,      setShowManualAdd]      = useState(false)
  const [toast,              setToast]              = useState(null)
  const [editingHand,        setEditingHand]        = useState(null)
  const [editingFupHand,     setEditingFupHand]     = useState(null)
  const isWide = useIsWide()

  const sessionPlayers  = session.players
  const hands           = session.hands

  const leftPlayers     = session.leftPlayers ?? []
  // activeSeatOrder: players still participating (excludes anyone who left mid-session)
  const activeSeatOrder = sessionPlayers.filter(p => !leftPlayers.includes(p))
  const activeCount     = activeSeatOrder.length
  const is6Player       = activeCount === 6
  // store invariant: dealerIndex always points to a non-left player
  const currentDealer   = sessionPlayers[session.dealerIndex ?? 0]
  const dealerPid       = is6Player ? currentDealer : null

  // activePlayers is ONLY for the new-hand entry form (picker/partner dropdowns).
  // The scoreboard and hand history always iterate sessionPlayers for stable column order.
  const activePlayers = dealerPid
    ? activeSeatOrder.filter(p => p !== dealerPid)
    : activeSeatOrder

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

  // Roster players not yet in session (quick-add strip; full seat-position picker is in ManagePlayersModal)
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
          <button className="btn btn-ghost btn-sm" onClick={() => setShowManage(true)} title="Add, remove, or reorder players">
            ⚙ Players
          </button>
          {addablePlayers.length > 0 && (
            <button className="btn btn-ghost btn-sm" onClick={() => setShowAddPlyr(s => !s)}>+ Player</button>
          )}
          {!lastRoundActive && (
            <button className="btn btn-ghost btn-sm" onClick={() => activateLastRound(session.id)}
              style={{ color: 'var(--warning)', borderColor: 'rgba(245,158,11,0.4)' }}>
              🏁 Last Round
            </button>
          )}
          <button className="btn btn-ghost btn-sm" onClick={() => setShowSettle(true)}>
            Settle Up
          </button>
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
        const av   = isWide ? 110 : 72
        const nSz  = isWide ? 15  : 13
        const sSz  = isWide ? 44  : 30
        const pad  = isWide ? '16px 12px 14px' : '10px 8px 10px'
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
                  background: ss?.bg ?? (isDlr ? 'rgba(139,92,246,0.06)' : 'var(--bg-elevated)'),
                  border: `2px solid ${isDlr
                    ? 'rgba(139,92,246,0.75)'
                    : total > 0 ? 'rgba(34,197,94,0.4)' : total < 0 ? 'rgba(239,68,68,0.35)' : 'var(--border)'}`,
                  borderRadius: 'var(--radius)', padding: pad,
                  minWidth: isWide ? 120 : 88, flexShrink: 0,
                  transition: 'background 0.4s', position: 'relative',
                  boxShadow: isDlr
                    ? '0 0 20px rgba(139,92,246,0.35)'
                    : total !== 0 ? `0 4px 16px ${total > 0 ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.1)'}` : 'none',
                }}>
                  {/* Avatar with overlapping streak + dealer icons */}
                  <div style={{ position: 'relative', flexShrink: 0 }}>
                    <Avatar player={p} size={av} />
                    {isDlr && (
                      <span style={{
                        position: 'absolute', bottom: -4, left: -8,
                        fontSize: isWide ? 24 : 18, lineHeight: 1,
                        filter: 'drop-shadow(0 1px 3px rgba(0,0,0,0.7))',
                      }}>🍆</span>
                    )}
                    {ss && (
                      <span style={{
                        position: 'absolute', bottom: -4, right: -8,
                        fontSize: isWide ? 24 : 18, lineHeight: 1,
                        filter: 'drop-shadow(0 1px 3px rgba(0,0,0,0.7))',
                      }}>{ss.icon}</span>
                    )}
                  </div>
                  <div style={{ marginTop: 10 }}>
                    <span style={{ fontSize: nSz, fontWeight: 700, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{getDisplayName(pid)}</span>
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
        <div style={{ paddingTop: 16 }}>
          <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
            <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => setShowSettle(false)}>
              ← Back to Game
            </button>
            <button className="btn btn-danger" style={{ flex: 1 }} onClick={() => setShowFinalizeConfirm(true)}>
              Finalize Night
            </button>
          </div>
          <Settlement
            players={sessionPlayers}
            totals={totals}
            getPlayer={getPlayer}
            getDisplayName={getDisplayName}
            session={session}
          />
        </div>
      ) : (
        <div className="card" style={{ marginTop: 16, padding: 0, overflow: 'hidden' }}>
          <Scoreboard
            players={sessionPlayers}
            getPlayer={getPlayer}
            getDisplayName={getDisplayName}
            hands={hands}
            totals={totals}
            dealerPid={currentDealer}
            leftPlayers={leftPlayers}
            onEditHand={(handId) => {
              const h = hands.find(x => x.id === handId)
              if (!h) return
              if (h.handType === 'fup') { setEditingFupHand(h); setShowFup(true) }
              else setEditingHand(h)
            }}
            onDeleteHand={(handId) => deleteHand(session.id, handId)}
          />
        </div>
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

      {/* FAB + Past Hand + F-Up buttons */}
      {!showSettle && (
        <>
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => setShowManualAdd(true)}
            style={{
              position: 'fixed', bottom: 120, right: 24, zIndex: 100,
              borderRadius: 20, fontSize: 12,
              background: 'var(--bg-elevated)',
              border: '1px solid var(--border)',
              boxShadow: 'var(--shadow)',
            }}
          >
            + Past Hand
          </button>
          <button
            className="btn btn-sm"
            onClick={() => { setEditingFupHand(null); setShowFup(true) }}
            style={{
              position: 'fixed', bottom: 74, right: 24, zIndex: 100,
              borderRadius: 20, fontSize: 13, fontWeight: 700,
              background: 'var(--bg-elevated)',
              border: '1px solid rgba(239,68,68,0.4)',
              color: 'var(--danger)',
              boxShadow: 'var(--shadow)',
              paddingLeft: 12, paddingRight: 12,
            }}
          >
            💩 F-Up
          </button>
          <button className="btn btn-primary btn-lg" onClick={() => setShowModal(true)}
            style={{ position: 'fixed', bottom: 24, right: 24, borderRadius: 32, boxShadow: '0 4px 20px rgba(99,102,241,0.45)', paddingLeft: 20, paddingRight: 20, zIndex: 100 }}>
            + Log Hand
          </button>
        </>
      )}

      {/* Hand entry modal */}
      {showModal && (
        <HandEntryModal
          players={activePlayers}
          getPlayer={getPlayer}
          getDisplayName={getDisplayName}
          dealerPid={dealerPid}
          lastRoundActive={lastRoundActive}
          handNumber={hands.length + 1}
          sessionTotals={totals}
          sessionPlayerIds={sessionPlayers}
          currentDealer={currentDealer}
          onSubmit={(hand) => {
            addHand(session.id, hand)
            setShowModal(false)
            const t = pickToast(hand)
            if (t) setToast({ ...t, key: Date.now() })
          }}
          onClose={() => setShowModal(false)}
        />
      )}

      {/* Edit hand modal — use the original hand's dealerPid, not the current hand's */}
      {editingHand && (
        <HandEntryModal
          players={editingHand.dealerPid
            ? sessionPlayers.filter(p => p !== editingHand.dealerPid)
            : sessionPlayers}
          getPlayer={getPlayer}
          getDisplayName={getDisplayName}
          dealerPid={editingHand.dealerPid}
          handNumber={editingHand.handNumber}
          initialValues={editingHand}
          sessionTotals={totals}
          sessionPlayerIds={sessionPlayers}
          currentDealer={currentDealer}
          onSubmit={(hand) => {
            updateHand(session.id, editingHand.id, { ...hand, scores: hand.scores })
            setEditingHand(null)
          }}
          onClose={() => setEditingHand(null)}
        />
      )}

      {/* Add past hand modal */}
      {showManualAdd && (
        <HandEntryModal
          players={activePlayers}
          getPlayer={getPlayer}
          getDisplayName={getDisplayName}
          dealerPid={null}
          isManualAdd={true}
          allSessionPlayers={sessionPlayers}
          existingHandCount={hands.length}
          sessionTotals={totals}
          sessionPlayerIds={sessionPlayers}
          currentDealer={currentDealer}
          onSubmit={({ insertAfterHandNumber, dealerPid: manualDealer, ...handCore }) => {
            insertHandAt(session.id, { ...handCore, dealerPid: manualDealer }, insertAfterHandNumber)
            setShowManualAdd(false)
          }}
          onClose={() => setShowManualAdd(false)}
        />
      )}

      {/* F-Up modal */}
      {(showFup || editingFupHand) && (
        <FupModal
          players={activePlayers}
          getPlayer={getPlayer}
          getDisplayName={getDisplayName}
          lastRoundActive={lastRoundActive}
          initialValues={editingFupHand ?? undefined}
          onSubmit={(data) => {
            if (editingFupHand) {
              updateHand(session.id, editingFupHand.id, data)
            } else {
              addHand(session.id, data)
            }
            setShowFup(false)
            setEditingFupHand(null)
          }}
          onClose={() => { setShowFup(false); setEditingFupHand(null) }}
        />
      )}

      {/* Manage Players modal */}
      {showManage && (
        <ManagePlayersModal
          session={session}
          allRosterPlayers={allRosterPlayers}
          getPlayer={getPlayer}
          getDisplayName={getDisplayName}
          onInsertPlayer={(pid, idx) => insertSessionPlayer(session.id, pid, idx)}
          onMarkLeft={(pid) => markPlayerLeft(session.id, pid)}
          onReorder={(newOrder) => reorderSessionPlayers(session.id, newOrder)}
          onClose={() => setShowManage(false)}
        />
      )}

      {/* Finalize Night confirmation */}
      {showFinalizeConfirm && (
        <div className="modal-overlay" onClick={() => setShowFinalizeConfirm(false)}>
          <div className="modal animate-slide-up" style={{ maxWidth: 380 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2 style={{ fontSize: 16, fontWeight: 700 }}>Finalize Night?</h2>
              <button className="btn btn-ghost btn-icon" onClick={() => setShowFinalizeConfirm(false)} style={{ fontSize: 18, lineHeight: 1 }}>✕</button>
            </div>
            <div className="modal-body" style={{ padding: '14px 20px' }}>
              <p style={{ color: 'var(--text-secondary)', fontSize: 14, lineHeight: 1.65, margin: 0 }}>
                Lock and save this session — {hands.length} hand{hands.length !== 1 ? 's' : ''} played. You can reopen it later if needed.
              </p>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setShowFinalizeConfirm(false)}>Cancel</button>
              <button className="btn btn-danger" onClick={() => { endSession(session.id); setShowFinalizeConfirm(false) }}>
                Finalize
              </button>
            </div>
          </div>
        </div>
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
function PastSessionCard({ session, getPlayer, getDisplayName, getSessionTotals, onDelete, reopenSession }) {
  const [expanded,      setExpanded]      = useState(false)
  const [reopenConfirm, setReopenConfirm] = useState(false)
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
          <div style={{ marginTop: 12, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            {reopenConfirm ? (
              <>
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Reopen this session?</span>
                <button className="btn btn-primary btn-sm" onClick={() => { reopenSession(session.id); setExpanded(false); setReopenConfirm(false) }}>Confirm Reopen</button>
                <button className="btn btn-ghost btn-sm" onClick={() => setReopenConfirm(false)}>Cancel</button>
              </>
            ) : (
              <>
                <button className="btn btn-ghost btn-sm" onClick={() => setReopenConfirm(true)}>Reopen Night</button>
                <button className="btn btn-danger btn-sm" onClick={() => onDelete(session.id)}>Delete Session</button>
              </>
            )}
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
  addHand, updateHand, deleteHand, insertHandAt,
  activateLastRound, addSessionPlayer,
  insertSessionPlayer, markPlayerLeft, reorderSessionPlayers,
  getPlayer, getDisplayName, getActiveSession, getSessionTotals,
  reopenSession,
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
        insertHandAt={insertHandAt}
        endSession={handleEndSession}
        activateLastRound={activateLastRound}
        addSessionPlayer={addSessionPlayer}
        insertSessionPlayer={insertSessionPlayer}
        markPlayerLeft={markPlayerLeft}
        reorderSessionPlayers={reorderSessionPlayers}
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
              <PastSessionCard key={s.id} session={s} getPlayer={getPlayer} getDisplayName={getDisplayName} getSessionTotals={getSessionTotals} onDelete={deleteSession} reopenSession={reopenSession} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
