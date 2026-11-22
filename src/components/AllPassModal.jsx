import { useState, useEffect, useRef } from 'react'
import { calculateLeasterScores, verifyConservation } from '../utils/scoring'
import Avatar from './Avatar'
import SaveErrorBox from './SaveErrorBox'

// Everyone passed: roll a die. 1–3 → play a leaster, 4–6 → throw it in for a
// doubler (logged as an all-pass hand; the next hand defaults to ×2).
const FACES      = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅']
const ROLL_MS    = 1100
const TICK_MS    = 75
const MULT_STEPS = [1, 2, 4, 8, 16]
const outcomeOf  = roll => (roll <= 3 ? 'leaster' : 'doubler')

const LBL = { fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }

export default function AllPassModal({
  players,               // the five playing this hand (sit-outs excluded)
  sitOutPids = [],
  getPlayer,
  getDisplayName,
  lastRoundActive,
  pendingDoublers = 0,   // all-pass hands directly before this one
  initialValues,         // editing a stored leaster / all-pass hand
  onSubmit,
  onClose,
}) {
  const iv        = initialValues
  const isEditing = !!iv

  const [face,    setFace]    = useState(0)
  const [rolling, setRolling] = useState(!isEditing)
  const [rolled,  setRolled]  = useState(null)   // 1–6 from the app's die; null = table's own dice
  const [outcome, setOutcome] = useState(isEditing ? (iv.handType === 'leaster' ? 'leaster' : 'doubler') : null)
  const [winner,  setWinner]  = useState(iv?.handType === 'leaster' ? iv.picker : '')
  const [doublerCount, setDoublerCount] = useState(
    isEditing ? (iv.doublerCount ?? 0) : Math.min(4, (lastRoundActive ? 1 : 0) + pendingDoublers))
  const [saving,    setSaving]    = useState(false)
  const [saveError, setSaveError] = useState(null)
  const timers = useRef([])

  const stopTimers = () => timers.current.forEach(t => { clearTimeout(t); clearInterval(t) })

  const roll = () => {
    stopTimers()
    setRolling(true); setOutcome(null); setRolled(null)
    const tick = setInterval(() => setFace(f => (f + 1 + Math.floor(Math.random() * 5)) % 6), TICK_MS)
    const stop = setTimeout(() => {
      clearInterval(tick)
      const n = 1 + Math.floor(Math.random() * 6)
      setFace(n - 1); setRolled(n); setOutcome(outcomeOf(n)); setRolling(false)
    }, ROLL_MS)
    timers.current = [stop, tick]
  }
  useEffect(() => {
    if (!isEditing) roll()
    return stopTimers
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Real dice at the table: take their result instead
  const override = which => {
    stopTimers()
    setRolling(false); setRolled(null); setOutcome(which)
  }

  const multiplier = MULT_STEPS[Math.min(doublerCount, 4)]
  const scores = outcome === 'leaster' && winner
    ? calculateLeasterScores({ winner, players, doublerCount, sitOutPids })
    : null
  const canSave = !rolling && (outcome === 'doubler' || (outcome === 'leaster' && !!scores && verifyConservation(scores)))
  const nextMult = MULT_STEPS[Math.min(4, pendingDoublers + 1 + (lastRoundActive ? 1 : 0))]

  const save = async () => {
    if (!canSave || saving) return
    setSaving(true); setSaveError(null)
    const base = { partner: null, isLoner: false, pickerPoints: null, crackers: [], recrackers: [], blitzes: {} }
    const data = outcome === 'leaster'
      ? { ...base, handType: 'leaster', picker: winner, doublerCount, scores }
      : { ...base, handType: 'pass', picker: null, doublerCount: 0, scores: Object.fromEntries(players.map(p => [p, 0])) }
    try {
      await onSubmit(data)   // parent closes on success
    } catch (err) {
      setSaveError(err?.message || String(err))
      setSaving(false)
    }
  }

  const pill = (active, cls) => `toggle-btn ${active ? cls : ''}`

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && !saving && onClose()}>
      <div className="modal animate-slide-up" style={{ maxWidth: 440 }}>
        <div className="modal-header">
          <h2 style={{ fontSize: 17, fontWeight: 700 }}>{isEditing ? `Editing Hand #${iv.handNumber} · All Pass` : 'All Pass 🎲'}</h2>
          <button className="btn btn-ghost btn-icon" onClick={onClose} disabled={saving} style={{ fontSize: 18, lineHeight: 1 }}>✕</button>
        </div>

        <div className="modal-body" style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Die + result */}
          {!isEditing && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
              <span style={{
                fontSize: 96, lineHeight: 1, display: 'inline-block',
                animation: rolling ? 'dieShake 0.3s linear infinite' : 'none',
                color: outcome === 'leaster' ? 'var(--primary)' : outcome === 'doubler' ? 'var(--warning)' : 'var(--text-primary)',
              }}>{FACES[face]}</span>
              <div style={{ minHeight: 44, textAlign: 'center' }}>
                {rolling ? (
                  <span style={{ fontSize: 14, color: 'var(--text-muted)' }}>Rolling…</span>
                ) : outcome === 'leaster' ? (
                  <>
                    <div style={{ fontSize: 24, fontWeight: 900, color: 'var(--primary)' }}>Leaster!</div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{rolled ? `Rolled ${rolled} (1–3)` : 'Table rolled'} · lowest points with a trick wins</div>
                  </>
                ) : outcome === 'doubler' ? (
                  <>
                    <div style={{ fontSize: 24, fontWeight: 900, color: 'var(--warning)' }}>Doubler — next hand ×2</div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{rolled ? `Rolled ${rolled} (4–6)` : 'Table rolled'} · throw it in</div>
                  </>
                ) : null}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', justifyContent: 'center', fontSize: 12 }}>
                <span style={{ color: 'var(--text-muted)' }}>Rolled real dice?</span>
                <button className={pill(!rolled && outcome === 'leaster', 'active')} onClick={() => override('leaster')} style={{ padding: '4px 10px', fontSize: 12 }}>Leaster</button>
                <button className={pill(!rolled && outcome === 'doubler', 'active-warning')} onClick={() => override('doubler')} style={{ padding: '4px 10px', fontSize: 12 }}>Doubler</button>
                <button className="btn btn-ghost btn-sm" onClick={roll} disabled={rolling} style={{ fontSize: 12 }}>Re-roll</button>
              </div>
            </div>
          )}

          {isEditing && (
            <div className="toggle-group">
              <button className={pill(outcome === 'leaster', 'active')} onClick={() => setOutcome('leaster')}>🎲 Leaster</button>
              <button className={pill(outcome === 'doubler', 'active-warning')} onClick={() => setOutcome('doubler')}>All pass → Doubler</button>
            </div>
          )}

          {/* Leaster: winner, multiplier, preview */}
          {outcome === 'leaster' && !rolling && (
            <>
              <div>
                <div style={LBL}>Winner — lowest points among players who took a trick</div>
                <div className="toggle-group" style={{ flexWrap: 'wrap' }}>
                  {players.map(pid => (
                    <button key={pid} className={pill(winner === pid, 'active-success')}
                      onClick={() => setWinner(pid)} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                      <Avatar player={getPlayer(pid)} size={18} />{getDisplayName(pid)}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <div style={LBL}>
                  Multiplier
                  {!isEditing && pendingDoublers > 0 && ` (includes ${pendingDoublers} pending doubler${pendingDoublers > 1 ? 's' : ''})`}
                  {!isEditing && lastRoundActive && ' (last round ×2)'}
                </div>
                <div className="toggle-group">
                  {MULT_STEPS.map((m, i) => (
                    <button key={m} className={pill(doublerCount === i, 'active-warning')}
                      onClick={() => setDoublerCount(i)} style={{ padding: '4px 10px', fontSize: 12 }}>×{m}</button>
                  ))}
                </div>
              </div>
              {scores && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, background: 'var(--bg-elevated)', borderRadius: 'var(--radius-sm)', padding: '8px 12px' }}>
                  {[...players, ...sitOutPids].map(pid => {
                    const d = scores[pid] ?? 0
                    const out = sitOutPids.includes(pid)
                    return (
                      <div key={pid} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, opacity: out ? 0.5 : 1 }}>
                        <span style={{ width: 62, fontSize: 10, fontWeight: 700, color: pid === winner ? 'var(--success)' : 'var(--text-muted)', textTransform: 'uppercase' }}>
                          {out ? 'Sits out' : pid === winner ? 'Winner' : ''}
                        </span>
                        <span style={{ flex: 1 }}>{getDisplayName(pid)}</span>
                        <span style={{ fontWeight: 800, color: d > 0 ? 'var(--success)' : d < 0 ? 'var(--danger)' : 'var(--text-muted)' }}>{d > 0 ? `+${d}` : d === 0 ? '—' : d}</span>
                      </div>
                    )
                  })}
                  {multiplier > 1 && <div style={{ fontSize: 11, color: 'var(--warning)', fontWeight: 700 }}>×{multiplier}</div>}
                </div>
              )}
            </>
          )}

          {outcome === 'doubler' && !rolling && (
            <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              Logs an all-pass hand (nobody pays). The dealer moves on
              {isEditing ? '.' : <>, and the next hand starts at <strong>×{nextMult}</strong> — you can still change it there.</>}
            </div>
          )}
        </div>

        <div className="modal-footer" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
          {saveError && <SaveErrorBox message={saveError} />}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button className="btn btn-ghost" onClick={onClose} disabled={saving}>Cancel</button>
            <button className="btn btn-primary" onClick={save} disabled={!canSave || saving}>
              {saving ? 'Saving…' : outcome === 'leaster' ? (winner ? 'Save leaster' : 'Pick the winner') : outcome === 'doubler' ? 'Log all pass' : 'Rolling…'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
