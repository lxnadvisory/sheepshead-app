import { useState } from 'react'
import Avatar from './Avatar'

// ── Tab bar button ─────────────────────────────────────────────────────────────
function TabBtn({ label, active, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '10px 16px',
        background: 'none',
        border: 'none',
        borderBottom: active ? '2px solid var(--primary)' : '2px solid transparent',
        color: active ? 'var(--primary)' : 'var(--text-muted)',
        fontWeight: active ? 700 : 500,
        cursor: 'pointer',
        fontSize: 13,
        marginBottom: -1,
        whiteSpace: 'nowrap',
      }}
    >
      {label}
    </button>
  )
}

// ── Add Tab ────────────────────────────────────────────────────────────────────
function AddTab({ session, allRosterPlayers, getDisplayName, onInsert, onClose }) {
  const [selectedPid, setSelectedPid] = useState(null)
  const [seatIndex,   setSeatIndex]   = useState(session.players.length)

  const leftPlayers   = session.leftPlayers ?? []
  const activeCount   = session.players.filter(p => !leftPlayers.includes(p)).length
  const isFull        = session.players.length >= 6
  const available     = allRosterPlayers.filter(p => !session.players.includes(p.id))
  const going6Player  = activeCount === 5

  if (isFull) {
    return (
      <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '24px 0', fontSize: 13 }}>
        All 6 seats are occupied. Remove a player first to make room.
      </p>
    )
  }

  if (available.length === 0) {
    return (
      <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '24px 0', fontSize: 13 }}>
        Everyone on the roster is already in this session.
      </p>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* Player picker */}
      <div>
        <div style={sectionLabel}>Select Player</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {available.map(p => (
            <button
              key={p.id}
              className={`toggle-btn ${selectedPid === p.id ? 'active' : ''}`}
              onClick={() => setSelectedPid(p.id)}
              style={{ display: 'flex', alignItems: 'center', gap: 5 }}
            >
              <Avatar player={p} size={18} />
              {getDisplayName(p.id)}
            </button>
          ))}
        </div>
      </div>

      {/* Seat position picker — only shown once a player is selected */}
      {selectedPid && (
        <div>
          <div style={sectionLabel}>Seat Position</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {session.players.map((pid, i) => (
              <button
                key={`before-${i}`}
                className={`toggle-btn ${seatIndex === i ? 'active' : ''}`}
                onClick={() => setSeatIndex(i)}
                style={{ textAlign: 'left', fontSize: 12, padding: '6px 10px' }}
              >
                Seat {i + 1} — before {getDisplayName(pid)}
              </button>
            ))}
            <button
              className={`toggle-btn ${seatIndex === session.players.length ? 'active' : ''}`}
              onClick={() => setSeatIndex(session.players.length)}
              style={{ textAlign: 'left', fontSize: 12, padding: '6px 10px' }}
            >
              Seat {session.players.length + 1} — last seat
            </button>
          </div>

          {going6Player && (
            <div style={{ marginTop: 10, fontSize: 12, color: 'var(--warning)', background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: 'var(--radius-sm)', padding: '7px 10px' }}>
              Adding a 6th active player enables dealer sit-out rotation.
            </div>
          )}
        </div>
      )}

      <div style={footerRow}>
        <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
        <button
          className="btn btn-primary"
          disabled={!selectedPid}
          onClick={() => { onInsert(selectedPid, seatIndex); onClose() }}
        >
          Add to Game
        </button>
      </div>
    </div>
  )
}

// ── Remove Tab ─────────────────────────────────────────────────────────────────
function RemoveTab({ session, getPlayer, getDisplayName, onMarkLeft, onClose }) {
  const [selectedPid, setSelectedPid] = useState(null)
  const [confirmed,   setConfirmed]   = useState(false)

  const leftPlayers   = session.leftPlayers ?? []
  const activePlayers = session.players.filter(p => !leftPlayers.includes(p))
  const going5Player  = activePlayers.length === 6

  if (activePlayers.length <= 1) {
    return (
      <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '24px 0', fontSize: 13 }}>
        Cannot remove: at least one active player required.
      </p>
    )
  }

  const handsInvolved = selectedPid
    ? session.hands.filter(h =>
        (h.scores?.[selectedPid] ?? 0) !== 0 || h.dealerPid === selectedPid
      ).length
    : 0

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      <div>
        <div style={sectionLabel}>Select Player to Remove</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {activePlayers.map(pid => {
            const p = getPlayer(pid)
            return (
              <button
                key={pid}
                className={`toggle-btn ${selectedPid === pid ? 'active-danger' : ''}`}
                onClick={() => { setSelectedPid(pid); setConfirmed(false) }}
                style={{ display: 'flex', alignItems: 'center', gap: 5 }}
              >
                <Avatar player={p} size={18} />
                {getDisplayName(pid)}
              </button>
            )
          })}
        </div>
      </div>

      {selectedPid && (
        <div style={{ background: 'var(--bg-elevated)', border: '1px solid rgba(239,68,68,0.35)', borderRadius: 'var(--radius-sm)', padding: '12px 14px' }}>
          <div style={{ fontWeight: 700, color: 'var(--danger)', marginBottom: 6, fontSize: 14 }}>
            Remove {getDisplayName(selectedPid)}?
          </div>
          <div style={{ color: 'var(--text-secondary)', fontSize: 12, lineHeight: 1.55, marginBottom: 10 }}>
            Their column will stay on the scoreboard (greyed out) and their balance from{' '}
            <strong>{session.hands.length} hand{session.hands.length !== 1 ? 's' : ''}</strong> is preserved in final settlement.
            They won't appear in future hand entry.
            {going5Player && (
              <span style={{ display: 'block', marginTop: 6, color: 'var(--warning)', fontWeight: 600 }}>
                Going 6→5 active players disables dealer sit-out rotation.
              </span>
            )}
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600, userSelect: 'none' }}>
            <input
              type="checkbox"
              checked={confirmed}
              onChange={e => setConfirmed(e.target.checked)}
              style={{ width: 15, height: 15 }}
            />
            Remove {getDisplayName(selectedPid)} from future hands
          </label>
        </div>
      )}

      <div style={footerRow}>
        <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
        <button
          className="btn btn-danger"
          disabled={!selectedPid || !confirmed}
          onClick={() => { onMarkLeft(selectedPid); onClose() }}
        >
          Remove from Game
        </button>
      </div>
    </div>
  )
}

// ── Reorder Tab ────────────────────────────────────────────────────────────────
function ReorderTab({ session, getPlayer, getDisplayName, onReorder, onClose }) {
  const [order, setOrder] = useState([...session.players])

  const leftPlayers = session.leftPlayers ?? []
  const changed = order.some((pid, i) => pid !== session.players[i])

  const moveUp   = i => { if (i === 0) return; setOrder(o => { const a = [...o]; [a[i-1], a[i]] = [a[i], a[i-1]]; return a }) }
  const moveDown = i => { if (i === order.length - 1) return; setOrder(o => { const a = [...o]; [a[i], a[i+1]] = [a[i+1], a[i]]; return a }) }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 }}>
        Drag columns to a new position. Previous hand scores are unaffected — only the scoreboard column order changes.
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        {order.map((pid, i) => {
          const p      = getPlayer(pid)
          const isLeft = leftPlayers.includes(pid)
          return (
            <div
              key={pid}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                background: 'var(--bg-elevated)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-sm)',
                padding: '8px 12px',
                opacity: isLeft ? 0.5 : 1,
              }}
            >
              <span style={{ width: 28, color: 'var(--primary)', fontWeight: 800, fontSize: 12 }}>
                {i + 1}
              </span>
              <Avatar player={p} size={24} />
              <span style={{ flex: 1, fontWeight: 600, fontSize: 13 }}>
                {getDisplayName(pid)}
                {isLeft && (
                  <span style={{ marginLeft: 7, fontSize: 10, color: 'var(--danger)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    Left
                  </span>
                )}
              </span>
              <div style={{ display: 'flex', gap: 4 }}>
                <button className="btn btn-ghost btn-icon btn-sm" onClick={() => moveUp(i)}   disabled={i === 0}               style={{ fontSize: 12 }}>↑</button>
                <button className="btn btn-ghost btn-icon btn-sm" onClick={() => moveDown(i)} disabled={i === order.length - 1} style={{ fontSize: 12 }}>↓</button>
              </div>
            </div>
          )
        })}
      </div>

      <div style={footerRow}>
        <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
        <button
          className="btn btn-primary"
          disabled={!changed}
          onClick={() => { onReorder(order); onClose() }}
        >
          Apply New Order
        </button>
      </div>
    </div>
  )
}

// ── Main modal ─────────────────────────────────────────────────────────────────
export default function ManagePlayersModal({
  session,
  allRosterPlayers,
  getPlayer,
  getDisplayName,
  onInsertPlayer,
  onMarkLeft,
  onReorder,
  onClose,
}) {
  const [tab, setTab] = useState('add')

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal animate-slide-up" style={{ maxWidth: 480 }}>

        <div className="modal-header">
          <h2 style={{ fontSize: 17, fontWeight: 700 }}>Manage Players</h2>
          <button className="btn btn-ghost btn-icon" onClick={onClose} style={{ fontSize: 18, lineHeight: 1 }}>✕</button>
        </div>

        {/* Tab bar */}
        <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', padding: '0 16px', overflowX: 'auto' }}>
          <TabBtn label="+ Add"      active={tab === 'add'}     onClick={() => setTab('add')}     />
          <TabBtn label="− Remove"   active={tab === 'remove'}  onClick={() => setTab('remove')}  />
          <TabBtn label="⇅ Reorder"  active={tab === 'reorder'} onClick={() => setTab('reorder')} />
        </div>

        <div className="modal-body" style={{ padding: '16px' }}>
          {tab === 'add' && (
            <AddTab
              session={session}
              allRosterPlayers={allRosterPlayers}
              getPlayer={getPlayer}
              getDisplayName={getDisplayName}
              onInsert={onInsertPlayer}
              onClose={onClose}
            />
          )}
          {tab === 'remove' && (
            <RemoveTab
              session={session}
              getPlayer={getPlayer}
              getDisplayName={getDisplayName}
              onMarkLeft={onMarkLeft}
              onClose={onClose}
            />
          )}
          {tab === 'reorder' && (
            <ReorderTab
              session={session}
              getPlayer={getPlayer}
              getDisplayName={getDisplayName}
              onReorder={onReorder}
              onClose={onClose}
            />
          )}
        </div>

      </div>
    </div>
  )
}

// ── Shared styles ──────────────────────────────────────────────────────────────
const sectionLabel = {
  fontSize: 11, fontWeight: 700, color: 'var(--text-muted)',
  textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8,
}

const footerRow = {
  display: 'flex', gap: 10, justifyContent: 'flex-end', paddingTop: 4,
}
