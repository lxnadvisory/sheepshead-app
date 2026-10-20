import { useState } from 'react'
import Avatar from './Avatar'

export default function FupModal({
  players,          // active player IDs for this hand (dealer excluded for 6-player)
  getPlayer,
  getDisplayName,
  lastRoundActive,  // whether last-round multiplier is in effect
  initialValues,    // set when editing an existing F-Up hand
  onSubmit,
  onClose,
}) {
  const iv = initialValues ?? {}
  const isEditing = !!initialValues

  const [offenderId,     setOffenderId]     = useState(iv.offenderId    ?? '')
  const [amountPerPlayer, setAmountPerPlayer] = useState(iv.amount ?? 2)
  const [applyMultiplier, setApplyMultiplier] = useState(false)
  const [advanceDealer,   setAdvanceDealer]   = useState(true)
  const [note,            setNote]            = useState(iv.note ?? '')

  const currentMultiplier = lastRoundActive ? 2 : 1
  const effectiveAmount   = applyMultiplier ? amountPerPlayer * currentMultiplier : amountPerPlayer
  const others            = offenderId ? players.filter(p => p !== offenderId) : []

  const previewScores = offenderId ? {
    [offenderId]: -(effectiveAmount * others.length),
    ...Object.fromEntries(others.map(p => [p, effectiveAmount])),
  } : null

  const canSubmit = offenderId !== '' && amountPerPlayer > 0 && others.length > 0

  const handleSubmit = () => {
    if (!canSubmit) return
    onSubmit({
      handType:           'fup',
      offenderId,
      note:               note.trim(),
      amount:             effectiveAmount,
      scores:             previewScores,
      skipDealerAdvance:  !advanceDealer,
    })
  }

  const LBL = { fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal animate-slide-up" style={{ maxWidth: 440 }}>

        {/* Header */}
        <div className="modal-header">
          <h2 style={{ fontSize: 17, fontWeight: 700 }}>
            {isEditing ? '💩 Edit F-Up' : '💩 F-Up'}
          </h2>
          <button className="btn btn-ghost btn-icon" onClick={onClose} style={{ fontSize: 18, lineHeight: 1 }}>✕</button>
        </div>

        {/* Body */}
        <div className="modal-body" style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* Offender */}
          <div>
            <div style={LBL}>Offender</div>
            <div className="toggle-group" style={{ flexWrap: 'wrap' }}>
              {players.map(pid => (
                <button key={pid}
                  className={`toggle-btn ${offenderId === pid ? 'active-danger' : ''}`}
                  onClick={() => setOffenderId(pid)}
                  style={{ display: 'flex', alignItems: 'center', gap: 5 }}
                >
                  <Avatar player={getPlayer(pid)} size={16} />
                  {getDisplayName(pid)}
                </button>
              ))}
            </div>
          </div>

          {/* Amount per player */}
          <div>
            <div style={LBL}>Amount per player ($)</div>
            <input
              type="number"
              min={1}
              value={amountPerPlayer}
              onChange={e => setAmountPerPlayer(Math.max(1, Number(e.target.value)))}
              style={{
                width: 90, padding: '6px 10px',
                background: 'var(--bg-surface)', border: '1px solid var(--border)',
                borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)',
                fontSize: 18, fontWeight: 800, textAlign: 'center',
              }}
            />
          </div>

          {/* Toggles */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {currentMultiplier > 1 && (
              <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', userSelect: 'none' }}>
                <div
                  onClick={() => setApplyMultiplier(v => !v)}
                  style={{
                    width: 36, height: 20, borderRadius: 10, flexShrink: 0,
                    background: applyMultiplier ? 'var(--primary)' : 'var(--border)',
                    position: 'relative', cursor: 'pointer', transition: 'background 0.2s',
                  }}
                >
                  <div style={{
                    position: 'absolute', top: 2, left: applyMultiplier ? 18 : 2,
                    width: 16, height: 16, borderRadius: '50%', background: '#fff',
                    transition: 'left 0.2s',
                  }} />
                </div>
                <span style={{ fontSize: 13 }}>Apply current multiplier (×{currentMultiplier})</span>
              </label>
            )}
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', userSelect: 'none' }}>
              <div
                onClick={() => setAdvanceDealer(v => !v)}
                style={{
                  width: 36, height: 20, borderRadius: 10, flexShrink: 0,
                  background: advanceDealer ? 'var(--primary)' : 'var(--border)',
                  position: 'relative', cursor: 'pointer', transition: 'background 0.2s',
                }}
              >
                <div style={{
                  position: 'absolute', top: 2, left: advanceDealer ? 18 : 2,
                  width: 16, height: 16, borderRadius: '50%', background: '#fff',
                  transition: 'left 0.2s',
                }} />
              </div>
              <span style={{ fontSize: 13 }}>Advance dealer 🍆</span>
            </label>
          </div>

          {/* Note */}
          <div>
            <div style={LBL}>Note (optional)</div>
            <input
              type="text"
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder="e.g. led the wrong suit"
              style={{
                width: '100%', padding: '8px 10px', boxSizing: 'border-box',
                background: 'var(--bg-surface)', border: '1px solid var(--border)',
                borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)', fontSize: 13,
              }}
            />
          </div>

          {/* Preview */}
          {previewScores && offenderId && (
            <div style={{
              background: 'var(--bg-elevated)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius)', padding: '10px 12px',
            }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
                Preview {applyMultiplier && currentMultiplier > 1 ? `(×${currentMultiplier} last round)` : ''}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                {players.map(pid => {
                  const p     = getPlayer(pid)
                  const delta = previewScores[pid] ?? 0
                  return (
                    <div key={pid} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Avatar player={p} size={18} />
                        <span style={{ fontSize: 13, fontWeight: 600 }}>{getDisplayName(pid)}</span>
                        {pid === offenderId && (
                          <span style={{ fontSize: 9, fontWeight: 800, color: 'var(--danger)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Offender</span>
                        )}
                      </div>
                      <span style={{ fontSize: 16, fontWeight: 800, color: delta > 0 ? 'var(--success)' : delta < 0 ? 'var(--danger)' : 'var(--text-muted)' }}>
                        {delta > 0 ? `+${delta}` : delta}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

        </div>

        {/* Footer */}
        <div className="modal-footer" style={{ gap: 10, justifyContent: 'flex-end' }}>
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-danger btn-lg" onClick={handleSubmit} disabled={!canSubmit}>
            {isEditing ? 'Update F-Up' : 'Log F-Up'}
          </button>
        </div>

      </div>
    </div>
  )
}
