import { useState, useMemo, useEffect, useRef, useCallback } from 'react'
import { calculateHandScores, getTierLabel, getMultiplier, verifyConservation } from '../utils/scoring'
import { parseVoiceCommand } from '../utils/voiceParser'
import Avatar from './Avatar'

const DOUBLER_STEPS = [1, 2, 4, 8, 16]
const COUNTDOWN_SECS = 10
const RING_R = 11
const RING_C = 2 * Math.PI * RING_R
const AUTO_STOP_MS = 60_000

function fmt(n) {
  if (n === 0) return <span className="zero">—</span>
  return n > 0 ? <span className="pos">+{n}</span> : <span className="neg">{n}</span>
}

// Compact section label styles
const LBL  = { fontSize: 9,  fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }
const SLBL = { fontSize: 9,  fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4 }

// ── Main component ─────────────────────────────────────────────────────────────
export default function HandEntryModal({
  players,
  getPlayer,
  getDisplayName,
  dealerPid,
  lastRoundActive,
  initialValues,
  onSubmit,
  onClose,
}) {
  const iv        = initialValues ?? {}
  const isEditing = !!initialValues

  // ── Form state ─────────────────────────────────────────────────────────────
  const [picker,       setPicker]       = useState(iv.picker       ?? '')
  const [partner,      setPartner]      = useState(iv.partner      ?? '')
  const [isLoner,      setIsLoner]      = useState(iv.isLoner      ?? false)
  const [pickerPoints, setPickerPoints] = useState(iv.pickerPoints ?? 60)
  const [shedClean,    setShedClean]    = useState(iv.shedClean    ?? false)
  // pickerNoTricks is DERIVED — no toggle, no state
  const [doublerCount, setDoublerCount] = useState(
    isEditing ? (iv.doublerCount ?? (iv.doubler ? 1 : 0)) : (lastRoundActive ? 1 : 0)
  )
  const [crackers,   setCrackers]   = useState(iv.crackers   ?? [])
  const [recrackers, setRecrackers] = useState(iv.recrackers ?? [])
  const [blitzes,    setBlitzes]    = useState(iv.blitzes    ?? {})
  const [smith,      setSmith]      = useState(iv.smith      ?? false)
  const [blitzOpen,  setBlitzOpen]  = useState(Object.keys(iv.blitzes ?? {}).length > 0)

  // ── Voice state ────────────────────────────────────────────────────────────
  const [listening,        setListening]        = useState(false)
  const [transcript,       setTranscript]       = useState('')
  const [voiceError,       setVoiceError]       = useState(null)
  const [parseResult,      setParseResult]      = useState(null)
  const finalTranscriptRef = useRef('')
  const recognitionRef     = useRef(null)
  const autoStopRef        = useRef(null)

  // ── Countdown state ────────────────────────────────────────────────────────
  const [autoPost,         setAutoPost]         = useState(null)
  const [paused,           setPaused]           = useState(false)
  const [pendingCountdown, setPendingCountdown] = useState(false)

  // ── Derived ────────────────────────────────────────────────────────────────
  const pickerNoTricks    = pickerPoints === 0 && !shedClean
  const availablePartners = players.filter(p => p !== picker)
  const eligibleCrackers  = picker ? players.filter(p => p !== picker && (isLoner || p !== partner)) : []
  const eligibleRecrackers = (partner && !isLoner) ? [picker, partner].filter(Boolean) : picker ? [picker] : []
  const crackActive        = crackers.length > 0
  const blitzCount         = Object.keys(blitzes).length

  // Auto-expand blitz section when a blitz becomes active
  useEffect(() => { if (blitzCount > 0) setBlitzOpen(true) }, [blitzCount])

  // ── Toggles ────────────────────────────────────────────────────────────────
  const toggleCracker = (pid) => {
    setCrackers(prev => {
      const next = prev.includes(pid) ? prev.filter(x => x !== pid) : [...prev, pid]
      if (next.length === 0) setRecrackers([])
      return next
    })
  }
  const toggleRecracker = (pid) =>
    setRecrackers(prev => prev.includes(pid) ? prev.filter(x => x !== pid) : [...prev, pid])

  const toggleBlitz = (pid, color) => setBlitzes(b => {
    const curr = b[pid] ?? { black: false, red: false }
    const next = { ...curr, [color]: !curr[color] }
    if (!next.black && !next.red) { const { [pid]: _, ...rest } = b; return rest }
    return { ...b, [pid]: next }
  })

  const cycleDoubler = () => setDoublerCount(c => (c + 1) % 5)

  // ── Points / specials ──────────────────────────────────────────────────────
  const handleShedClean = () => {
    const next = !shedClean
    setShedClean(next)
    if (next) setPickerPoints(120)
  }
  const handlePointsChange = (val) => {
    const n = Number(val)
    setPickerPoints(n)
    setShedClean(n === 120)
  }
  const handleLoner = () => {
    const next = !isLoner
    setIsLoner(next)
    if (next) { setPartner(''); setRecrackers([]) }
  }

  // ── Countdown ─────────────────────────────────────────────────────────────
  const cancelCountdown = useCallback(() => {
    setAutoPost(null); setPaused(false); setPendingCountdown(false)
  }, [])

  // Tick
  useEffect(() => {
    if (autoPost === null || paused || autoPost === 0) return
    const id = setTimeout(() => setAutoPost(n => n !== null ? n - 1 : null), 1000)
    return () => clearTimeout(id)
  }, [autoPost, paused])

  // Auto-submit at 0
  const handDataRef = useRef(null)
  useEffect(() => {
    if (autoPost !== 0) return
    if (handDataRef.current) { onSubmit(handDataRef.current); setAutoPost(null) }
  }, [autoPost, onSubmit])

  // Pause when tab hidden
  useEffect(() => {
    if (autoPost === null) return
    const h = () => setPaused(document.hidden)
    document.addEventListener('visibilitychange', h)
    return () => document.removeEventListener('visibilitychange', h)
  }, [autoPost !== null])  // eslint-disable-line react-hooks/exhaustive-deps

  // ── Preview ────────────────────────────────────────────────────────────────
  const handData = {
    picker, partner: isLoner ? null : partner,
    isLoner, pickerPoints, shedClean, pickerNoTricks,
    smith: isLoner ? false : smith,
    doublerCount, crackers, recrackers, blitzes,
  }

  const preview = useMemo(() => {
    if (!picker || (!isLoner && !partner)) return null
    return calculateHandScores({
      ...handData,
      players: dealerPid ? [...players, dealerPid] : players,
      dealerPid,
    })
  }, [picker, partner, isLoner, pickerPoints, shedClean, smith, doublerCount, crackers, recrackers, blitzes, players, dealerPid])

  const multiplier    = getMultiplier({ doublerCount, crackers, recrackers, blitzes })
  const tier          = getTierLabel({ shedClean, pickerNoTricks, pickerPoints })
  const canSubmit     = picker && (isLoner || partner) && preview !== null
  const conservationOk = preview ? verifyConservation(preview) : true

  useEffect(() => {
    if (canSubmit) handDataRef.current = { ...handData, scores: preview }
  }, [canSubmit, preview, handData])

  // Start countdown once form is fully populated after a clean voice parse
  useEffect(() => {
    if (pendingCountdown && canSubmit && !isEditing) {
      setAutoPost(COUNTDOWN_SECS); setPendingCountdown(false)
    }
  }, [pendingCountdown, canSubmit, isEditing])

  const handleSubmit = () => {
    if (!canSubmit) return
    if (!conservationOk) {
      alert('Scoring error: hand deltas do not sum to 0. Please report this bug.')
      return
    }
    cancelCountdown()
    onSubmit({ ...handData, scores: preview })
  }

  // ── Apply parsed fields ────────────────────────────────────────────────────
  const applyParseFields = useCallback((fields) => {
    if (fields.picker) { setPicker(fields.picker); setCrackers([]); setRecrackers([]) }
    if (fields.isLoner) {
      setIsLoner(true); setPartner(''); setRecrackers([])
    } else if (fields.partner) {
      setIsLoner(false); setPartner(fields.partner)
    }
    // shedClean and points — derive noTricks automatically from points === 0
    if (fields.shedClean) {
      setShedClean(true)
    } else {
      setShedClean(false)
    }
    if (fields.pickerPoints !== null) setPickerPoints(fields.pickerPoints)
    if (fields.doublerCount > 0)      setDoublerCount(Math.min(fields.doublerCount, 4))
    if (fields.crackers?.length  > 0) setCrackers(fields.crackers)
    if (fields.recrackers?.length > 0) setRecrackers(fields.recrackers)
    if (Object.keys(fields.blitzes ?? {}).length > 0) setBlitzes(fields.blitzes)
    setSmith(fields.smith ?? false)
  }, [])

  // ── Voice: parse transcript ────────────────────────────────────────────────
  const parseTranscript = useCallback((text) => {
    const result = parseVoiceCommand(text, players, getPlayer, getDisplayName)
    applyParseFields(result.fields)
    setParseResult(result)
    if (result.status === 'clean' && !isEditing) setPendingCountdown(true)
  }, [players, getPlayer, getDisplayName, applyParseFields, isEditing])

  // ── Voice recognition — continuous mode ───────────────────────────────────
  const startListening = useCallback(() => {
    const SR = window.SpeechRecognition ?? window.webkitSpeechRecognition
    if (!SR) { setVoiceError('Speech recognition not supported in this browser.'); return }

    setVoiceError(null)
    setTranscript('')
    setParseResult(null)
    cancelCountdown()
    finalTranscriptRef.current = ''

    const rec = new SR()
    rec.continuous     = true
    rec.interimResults = true
    rec.lang           = 'en-US'

    rec.onresult = (e) => {
      let interim = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) {
          finalTranscriptRef.current += e.results[i][0].transcript + ' '
        } else {
          interim = e.results[i][0].transcript
        }
      }
      // Show accumulated finals + current interim live
      setTranscript(finalTranscriptRef.current + interim)
    }

    rec.onerror = (e) => {
      clearTimeout(autoStopRef.current)
      setListening(false)
      if (e.error !== 'no-speech') setVoiceError(`Mic error: ${e.error}`)
    }

    rec.onend = () => {
      clearTimeout(autoStopRef.current)
      setListening(false)
      const final = finalTranscriptRef.current.trim()
      setTranscript(final)
      if (final) parseTranscript(final)
    }

    rec.start()
    setListening(true)
    recognitionRef.current = rec

    // Safety auto-stop after 60 seconds
    autoStopRef.current = setTimeout(() => recognitionRef.current?.stop(), AUTO_STOP_MS)
  }, [parseTranscript, cancelCountdown])

  const stopListening = useCallback(() => {
    clearTimeout(autoStopRef.current)
    recognitionRef.current?.stop()
    // onend fires and handles the rest
  }, [])

  // Spacebar shortcut
  useEffect(() => {
    const onKey = (e) => {
      if (e.code !== 'Space') return
      const tag = document.activeElement?.tagName?.toLowerCase()
      if (tag === 'input' || tag === 'textarea' || tag === 'button' || tag === 'select') return
      e.preventDefault()
      if (listening) stopListening(); else startListening()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [listening, startListening, stopListening])

  // ── Render helpers ─────────────────────────────────────────────────────────
  const allDisplayPlayers = dealerPid ? [...players, dealerPid] : players
  const ringOffset = RING_C * (1 - (autoPost ?? 0) / COUNTDOWN_SECS)

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal modal-lg animate-slide-up">

        {/* ── Header ── */}
        <div className="modal-header">
          <div>
            <h2 style={{ fontSize: 17, fontWeight: 700 }}>{isEditing ? 'Edit Hand' : 'Log Hand'}</h2>
            {dealerPid && (
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                {getDisplayName(dealerPid)} sits out (dealer)
              </div>
            )}
          </div>
          <button className="btn btn-ghost btn-icon" onClick={onClose} style={{ fontSize: 18, lineHeight: 1 }}>✕</button>
        </div>

        {/* ── Body ── */}
        <div
          className="modal-body"
          style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}
          onPointerDown={autoPost !== null ? cancelCountdown : undefined}
        >

          {/* Voice input — full width */}
          <div style={{
            background: 'var(--bg-elevated)',
            border: `1px solid ${listening ? 'var(--danger)' : 'var(--border)'}`,
            borderRadius: 'var(--radius)', padding: '8px 12px', transition: 'border-color 0.2s',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <button
                onClick={listening ? stopListening : startListening}
                style={{
                  width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
                  background: listening ? 'var(--danger)' : 'var(--bg-hover)',
                  border: `2px solid ${listening ? 'var(--danger)' : 'var(--border)'}`,
                  cursor: 'pointer', fontSize: 15,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  animation: listening ? 'livePulse 1s infinite' : 'none',
                  transition: 'all 0.2s',
                }}
              >{listening ? '⏹' : '🎙'}</button>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: listening ? 'var(--danger)' : 'var(--text-secondary)' }}>
                  {listening ? 'Listening… tap to stop' : 'Voice Input — 🎙 or Space'}
                </div>
                {transcript && (
                  <div style={{
                    fontSize: 11, marginTop: 2,
                    color: listening ? 'var(--text-primary)' : 'var(--text-muted)',
                    fontStyle: 'italic',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    "{transcript}"
                  </div>
                )}
                {voiceError && (
                  <div style={{ fontSize: 11, color: 'var(--danger)', marginTop: 2 }}>{voiceError}</div>
                )}
              </div>
            </div>
          </div>

          {/* Parse status bar — full width */}
          {parseResult && (
            <div style={{
              borderRadius: 'var(--radius-sm)',
              border: `1px solid ${parseResult.status === 'clean' ? 'var(--success)' : 'var(--warning)'}`,
              background: parseResult.status === 'clean' ? 'var(--success-dim)' : 'var(--warning-dim)',
              padding: '6px 10px', fontSize: 11,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontWeight: 700, color: parseResult.status === 'clean' ? 'var(--success)' : 'var(--warning)' }}>
                <span>{parseResult.status === 'clean' ? '✓' : '⚠'}</span>
                <span style={{ flex: 1 }}>{parseResult.summary}</span>
              </div>
              {parseResult.messages.length > 0 && (
                <div style={{ marginTop: 3, display: 'flex', flexDirection: 'column', gap: 2 }}>
                  {parseResult.messages.map((m, i) => (
                    <div key={i} style={{ color: 'var(--text-secondary)', paddingLeft: 14, fontSize: 10 }}>{m}</div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── Two-column grid ── */}
          <div className="hand-form-cols" style={{ alignItems: 'start' }}>

            {/* LEFT column: Picker · Partner · Points · Specials */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

              {/* Picker */}
              <div>
                <div style={LBL}>Picker</div>
                <div className="toggle-group">
                  {players.map(pid => (
                    <button key={pid}
                      className={`toggle-btn ${picker === pid ? 'active' : ''}`}
                      onClick={() => { setPicker(pid); if (partner === pid) setPartner(''); setCrackers([]); setRecrackers([]) }}
                      style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 8px', fontSize: 12 }}
                    >
                      <Avatar player={getPlayer(pid)} size={16} />
                      {getDisplayName(pid)}
                    </button>
                  ))}
                </div>
              </div>

              {/* Partner / Loner */}
              <div>
                <div style={LBL}>Partner</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div className="toggle-group">
                    <button
                      className={`toggle-btn ${isLoner ? 'active-danger' : ''}`}
                      onClick={handleLoner}
                      style={{ padding: '5px 10px', fontSize: 12 }}
                    >
                      {isLoner ? '★ Loner' : 'Loner'}
                    </button>
                  </div>
                  {!isLoner && (
                    <div className="toggle-group">
                      {availablePartners.map(pid => (
                        <button key={pid}
                          className={`toggle-btn ${partner === pid ? 'active' : ''}`}
                          onClick={() => { setPartner(pid); setRecrackers([]) }}
                          disabled={!picker}
                          style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 8px', fontSize: 12 }}
                        >
                          <Avatar player={getPlayer(pid)} size={16} />
                          {getDisplayName(pid)}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Points slider */}
              <div>
                <div style={{ ...LBL, display: 'flex', alignItems: 'baseline', gap: 6 }}>
                  <span>Picker's Points</span>
                  <span style={{ color: 'var(--text-primary)', fontSize: 12, fontWeight: 700 }}>{pickerPoints}</span>
                  <span style={{ color: 'var(--primary)', fontWeight: 600, textTransform: 'none', letterSpacing: 0 }}>{tier}</span>
                </div>
                <input
                  type="range" min={0} max={120} step={1} value={pickerPoints}
                  onChange={e => handlePointsChange(e.target.value)}
                  style={{ marginBottom: 3 }}
                />
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--text-muted)' }}>
                  <span>0</span><span>30</span><span>60</span><span>90</span><span>120</span>
                </div>
              </div>

              {/* Shed Clean + Smith Rule */}
              <div>
                <div style={LBL}>Special</div>
                <div className="toggle-group">
                  <button
                    className={`toggle-btn ${shedClean ? 'active-success' : ''}`}
                    onClick={handleShedClean}
                    style={{ padding: '5px 10px', fontSize: 12 }}
                  >
                    Shed Clean
                  </button>
                  <button
                    className={`toggle-btn ${smith && !isLoner ? 'active-warning' : ''}`}
                    onClick={() => setSmith(s => !s)}
                    disabled={isLoner}
                    style={{ padding: '5px 10px', fontSize: 12, opacity: isLoner ? 0.4 : 1 }}
                    title="Picker took 0 tricks individually"
                  >
                    Smith Rule
                  </button>
                </div>
              </div>

            </div>{/* end left column */}

            {/* RIGHT column: Doubler · Crack · Re-crack · Blitz */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

              {/* Doubler */}
              <div>
                <div style={LBL}>
                  Doubler
                  {multiplier > 1 && <span style={{ color: 'var(--warning)', fontWeight: 700, textTransform: 'none', letterSpacing: 0 }}> ×{multiplier}</span>}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <button
                    onClick={cycleDoubler}
                    style={{
                      padding: '5px 14px', borderRadius: 'var(--radius-sm)',
                      border: `1px solid ${doublerCount > 0 ? 'var(--warning)' : 'var(--border)'}`,
                      background: doublerCount > 0 ? 'var(--warning-dim)' : 'transparent',
                      color: doublerCount > 0 ? 'var(--warning)' : 'var(--text-secondary)',
                      fontWeight: 800, fontSize: 16, cursor: 'pointer',
                      minWidth: 58, textAlign: 'center', transition: 'all 0.15s',
                    }}
                  >
                    {doublerCount === 0 ? '×1' : `×${DOUBLER_STEPS[doublerCount]}`}
                  </button>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                    {doublerCount === 0 ? 'Tap to double' : `→ ×${DOUBLER_STEPS[(doublerCount + 1) % 5]}`}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: 4 }}>
                  {DOUBLER_STEPS.map((val, i) => (
                    <button key={i} onClick={() => setDoublerCount(i)} style={{
                      padding: '2px 6px', fontSize: 10, borderRadius: 4, cursor: 'pointer',
                      border: `1px solid ${doublerCount === i ? 'var(--warning)' : 'var(--border)'}`,
                      background: doublerCount === i ? 'var(--warning-dim)' : 'transparent',
                      color: doublerCount === i ? 'var(--warning)' : 'var(--text-muted)',
                      fontWeight: 700,
                    }}>×{val}</button>
                  ))}
                </div>
              </div>

              {/* Cracked By */}
              <div>
                <div style={SLBL}>
                  Crack {!picker && <span style={{ opacity: 0.5 }}>(select picker first)</span>}
                </div>
                <div className="toggle-group">
                  {eligibleCrackers.length === 0 && picker && (
                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>No eligible crackers</span>
                  )}
                  {eligibleCrackers.map(pid => (
                    <button key={pid}
                      className={`toggle-btn ${crackers.includes(pid) ? 'active-warning' : ''}`}
                      onClick={() => toggleCracker(pid)}
                      style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 7px', fontSize: 11 }}
                    >
                      <Avatar player={getPlayer(pid)} size={14} />
                      {getDisplayName(pid)}
                    </button>
                  ))}
                </div>
              </div>

              {/* Re-cracked By */}
              <div style={{ opacity: crackActive ? 1 : 0.35, transition: 'opacity 0.2s' }}>
                <div style={SLBL}>
                  Re-Crack {!crackActive && <span>(requires crack)</span>}
                </div>
                <div className="toggle-group">
                  {eligibleRecrackers.map(pid => (
                    <button key={pid}
                      className={`toggle-btn ${recrackers.includes(pid) ? 'active-warning' : ''}`}
                      onClick={() => crackActive && toggleRecracker(pid)}
                      disabled={!crackActive}
                      style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 7px', fontSize: 11 }}
                    >
                      <Avatar player={getPlayer(pid)} size={14} />
                      {getDisplayName(pid)}
                    </button>
                  ))}
                  {eligibleRecrackers.length === 0 && (
                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Select picker/partner first</span>
                  )}
                </div>
              </div>

              {/* Blitz — collapsible */}
              <div>
                <button
                  onClick={() => setBlitzOpen(o => !o)}
                  style={{
                    ...SLBL, marginBottom: blitzOpen ? 6 : 0,
                    background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                    display: 'flex', alignItems: 'center', gap: 5,
                    color: blitzCount > 0 ? 'var(--warning)' : 'var(--text-muted)',
                  }}
                >
                  <span style={{ fontSize: 10 }}>{blitzOpen ? '▾' : '▸'}</span>
                  {blitzOpen ? '−' : '+'} Blitz
                  {blitzCount > 0 && <span>({blitzCount})</span>}
                </button>
                {blitzOpen && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                    {players.map(pid => {
                      const b = blitzes[pid] ?? { black: false, red: false }
                      return (
                        <div key={pid} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4, width: 70, flexShrink: 0 }}>
                            <Avatar player={getPlayer(pid)} size={14} />
                            <span style={{ fontSize: 11, fontWeight: 600 }}>{getDisplayName(pid)}</span>
                          </div>
                          <div className="toggle-group" style={{ flex: 1 }}>
                            <button
                              className={`toggle-btn ${b.black ? 'active-warning' : ''}`}
                              onClick={() => toggleBlitz(pid, 'black')}
                              style={{ fontSize: 10, padding: '3px 6px' }}
                            >♠♣ Black</button>
                            <button
                              className={`toggle-btn ${b.red ? 'active-danger' : ''}`}
                              onClick={() => toggleBlitz(pid, 'red')}
                              style={{ fontSize: 10, padding: '3px 6px' }}
                            >♥♦ Red</button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>

            </div>{/* end right column */}

          </div>{/* end two-column grid */}

          {/* Preview — full width */}
          {preview && (
            <div style={{
              background: 'var(--bg-elevated)',
              border: `1px solid ${conservationOk ? 'var(--border)' : 'var(--danger)'}`,
              borderRadius: 'var(--radius)', padding: 12,
            }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
                Preview {multiplier > 1 && <span style={{ color: 'var(--warning)' }}>×{multiplier}</span>}
                {smith && !isLoner && <span style={{ color: 'var(--warning)', marginLeft: 8 }}>Smith</span>}
              </div>
              {!conservationOk && (
                <div style={{ marginBottom: 8, padding: '5px 8px', background: 'var(--danger-dim)', border: '1px solid var(--danger)', borderRadius: 'var(--radius-sm)', fontSize: 11, color: 'var(--danger)', fontWeight: 700 }}>
                  ⚠ Scoring error: deltas do not sum to 0. Please report this bug.
                </div>
              )}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                {allDisplayPlayers.map(pid => {
                  const p     = getPlayer(pid)
                  const delta = preview[pid] ?? 0
                  const isDlr = pid === dealerPid
                  const smithActive = smith && !isLoner && partner
                  let role
                  if (isDlr) {
                    role = 'Sits Out'
                  } else if (pid === picker) {
                    role = smithActive ? 'Picker (Smith)' : 'Picker'
                  } else if (!isLoner && pid === partner) {
                    role = smithActive
                      ? (preview[picker] === 0 ? 'Partner (Solo)' : 'Partner (Safe)')
                      : 'Partner'
                  } else {
                    role = 'Opp'
                  }
                  const roleColor = (role === 'Picker' || role === 'Picker (Smith)') ? 'var(--primary)'
                    : (role === 'Partner' || role === 'Partner (Safe)' || role === 'Partner (Solo)') ? 'var(--success)'
                    : 'var(--text-muted)'
                  return (
                    <div key={pid} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', opacity: isDlr ? 0.45 : 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ width: 80, fontSize: 9, fontWeight: 700, color: roleColor, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{role}</span>
                        <Avatar player={p} size={18} />
                        <span style={{ fontWeight: 600, fontSize: 13 }}>{getDisplayName(pid)}</span>
                      </div>
                      <div style={{ fontSize: 15, fontWeight: 800, minWidth: 36, textAlign: 'right' }}>{fmt(delta)}</div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

        </div>{/* end modal-body */}

        {/* ── Footer ── */}
        <div className="modal-footer" style={{ flexDirection: 'column', gap: 8, alignItems: 'stretch' }}>
          {autoPost !== null && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0' }}>
              <svg width="26" height="26" viewBox="0 0 28 28" style={{ flexShrink: 0, transform: 'rotate(-90deg)' }}>
                <circle cx="14" cy="14" r={RING_R} fill="none" stroke="var(--border)" strokeWidth="2.5" />
                <circle
                  cx="14" cy="14" r={RING_R}
                  fill="none" stroke="var(--primary)" strokeWidth="2.5" strokeLinecap="round"
                  strokeDasharray={RING_C} strokeDashoffset={ringOffset}
                  style={{ transition: 'stroke-dashoffset 1s linear' }}
                />
              </svg>
              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--primary)', flex: 1 }}>
                {paused ? `Paused at ${autoPost}s (tab hidden)` : `Auto-posting in ${autoPost}s`}
              </span>
              <button className="btn btn-ghost btn-icon btn-sm" onClick={cancelCountdown} style={{ fontSize: 11 }}>
                ✕ Cancel
              </button>
            </div>
          )}
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
            <button
              className="btn btn-primary btn-lg"
              onClick={handleSubmit}
              disabled={!canSubmit}
              style={{
                animation: autoPost !== null ? 'livePulse 1.5s infinite' : 'none',
                boxShadow: autoPost !== null ? '0 0 18px rgba(99,102,241,0.45)' : undefined,
                transition: 'box-shadow 0.3s',
              }}
            >
              {isEditing ? 'Update Hand' : 'Post Hand'}
            </button>
          </div>
        </div>

      </div>
    </div>
  )
}
