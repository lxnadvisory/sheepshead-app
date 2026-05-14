import { useState } from 'react'
import Avatar from '../components/Avatar'
import { getFullName } from '../utils/displayName'
import { streakStyle } from '../components/InGameStats'

const SORT_OPTIONS = [
  { id: 'totalPts',    label: 'Total Pts' },
  { id: 'handsPlayed', label: 'Hands' },
  { id: 'pickRate',    label: 'Pick%' },
  { id: 'lonerRate',   label: 'Alone%' },
]

function StatCard({ label, value }) {
  return (
    <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 800 }}>{value}</div>
    </div>
  )
}

function Bar({ value, maxValue, color }) {
  const pct = maxValue === 0 ? 0 : Math.min(100, (Math.abs(value) / Math.abs(maxValue)) * 100)
  return (
    <div style={{ height: 4, background: 'var(--border)', borderRadius: 3, overflow: 'hidden' }}>
      <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 3, transition: 'width 0.4s ease' }} />
    </div>
  )
}

// Compact stat tile used in the expanded detail panel
function DStat({ label, value, sub, color, dim }) {
  return (
    <div style={{
      background: 'var(--bg-base)', border: '1px solid var(--border)',
      borderRadius: 'var(--radius-sm)', padding: '7px 10px',
      opacity: dim ? 0.38 : 1, flexShrink: 0,
    }}>
      <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 3 }}>
        {label}
      </div>
      <div style={{ fontSize: 14, fontWeight: 800, color: color ?? 'var(--text-primary)', lineHeight: 1.1, whiteSpace: 'nowrap' }}>
        {value ?? '—'}
      </div>
      {sub != null && (
        <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2, lineHeight: 1.2 }}>{sub}</div>
      )}
    </div>
  )
}

// Section header inside the expanded panel
function DGroup({ title, children }) {
  return (
    <div>
      <div style={{ fontSize: 9, fontWeight: 800, color: 'var(--primary)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 7 }}>
        {title}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {children}
      </div>
    </div>
  )
}

function sign(n) { return n >= 0 ? '+' : '' }

// Derive all per-player detail stats that aren't already in getAnalytics()
function computeDetail(pid, allHands, stats) {
  const s = stats[pid]
  if (!s) return null

  const pickWins    = allHands.filter(h => h.picker === pid && (h.scores?.[pid] ?? 0) > 0).length
  const pickWinRate = s.asPicker ? Math.round(pickWins / s.asPicker * 100) : null

  const partnerWins    = allHands.filter(h => !h.isLoner && h.partner === pid && (h.scores?.[pid] ?? 0) > 0).length
  const partnerWinRate = s.asPartner ? Math.round(partnerWins / s.asPartner * 100) : null

  const oppWins    = allHands.filter(h =>
    h.picker !== pid && (h.isLoner || h.partner !== pid) && h.dealerPid !== pid &&
    h.scores?.[pid] !== undefined && h.scores[pid] > 0
  ).length
  const oppWinRate = s.asOpp ? Math.round(oppWins / s.asOpp * 100) : null

  const activeHands     = s.asPicker + s.asPartner + s.asOpp
  const partnerCallRate = activeHands ? Math.round(s.asPartner / activeHands * 100) : null

  let biggestLoss = 0
  allHands.forEach(h => {
    const d = h.scores?.[pid] ?? 0
    if (d < biggestLoss) biggestLoss = d
  })

  const partnerCounts = {}
  allHands.forEach(h => {
    if (h.isLoner) return
    if (h.picker === pid && h.partner)      partnerCounts[h.partner] = (partnerCounts[h.partner] ?? 0) + 1
    else if (h.partner === pid && h.picker) partnerCounts[h.picker]  = (partnerCounts[h.picker]  ?? 0) + 1
  })
  const topP       = Object.entries(partnerCounts).sort((a, b) => b[1] - a[1])[0]
  const topPartner = topP ? { pid: topP[0], count: topP[1] } : null

  const recrackCount   = allHands.filter(h => (h.recrackers ?? []).includes(pid)).length
  const shedCleanCount = allHands.filter(h => h.picker === pid && h.shedClean).length
  const lonerWins      = allHands.filter(h => h.picker === pid && h.isLoner && (h.scores?.[pid] ?? 0) > 0).length
  const avgPickerPts   = s.asPicker ? Math.round(s.pickerPointsSum / s.asPicker) : null
  const netPerHand     = activeHands ? Number((s.totalPts / activeHands).toFixed(1)) : null

  return {
    pickWins, pickWinRate,
    partnerWins, partnerWinRate,
    oppWins, oppWinRate,
    activeHands, partnerCallRate,
    biggestLoss, topPartner,
    recrackCount, shedCleanCount,
    lonerWins, avgPickerPts, netPerHand,
  }
}

function PlayerCard({ id, rank, p, s, maxAbs, isNew, expanded, onToggle, allHands, stats, dn }) {
  const total  = s?.totalPts ?? 0
  const isPos  = total > 0
  const isNeg  = total < 0
  const cur    = s?.currentStreak ?? 0
  const ss     = streakStyle(cur)
  const detail = computeDetail(id, allHands, stats)

  const bumpRate    = s?.asPicker    ? Math.round(s.pickerLosses  / s.asPicker    * 100) : 0
  const pickPct     = s?.handsPlayed ? Math.round(s.asPicker      / s.handsPlayed * 100) : 0
  const partnerPct  = s?.handsPlayed ? Math.round(s.asPartner     / s.handsPlayed * 100) : 0

  return (
    <div style={{
      background: 'var(--bg-surface)',
      border: `1px solid ${isPos ? 'rgba(34,197,94,0.22)' : isNeg ? 'rgba(239,68,68,0.18)' : 'var(--border)'}`,
      borderRadius: 'var(--radius)',
      overflow: 'hidden',
    }}>

      {/* ── Collapsed header (always visible) ── */}
      <div
        onClick={onToggle}
        style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10, cursor: 'pointer', userSelect: 'none' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{
            width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
            background: rank === 0 ? 'rgba(245,158,11,0.2)' : 'var(--bg-elevated)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 12, fontWeight: 800,
            color: rank === 0 ? 'var(--warning)' : 'var(--text-muted)',
          }}>#{rank + 1}</span>

          <Avatar player={p} size={32} />

          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 15, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              {getFullName(p) || dn(id)}
              {isNew && <span className="badge badge-primary" style={{ fontSize: 9 }}>NEW</span>}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>
              {s?.handsPlayed ?? 0} hands · {s?.sessionsPlayed ?? 0} sessions
            </div>
          </div>

          {ss && <span style={{ fontSize: 14, flexShrink: 0 }} title={`Current streak: ${cur}`}>{ss.icon}</span>}

          <span style={{
            fontSize: 21, fontWeight: 900, flexShrink: 0, minWidth: 36, textAlign: 'right',
            color: isPos ? 'var(--success)' : isNeg ? 'var(--danger)' : 'var(--text-muted)',
          }}>{sign(total)}{total}</span>

          <span style={{
            fontSize: 11, color: 'var(--text-muted)', flexShrink: 0, marginLeft: 2,
            transition: 'transform 0.22s ease',
            transform: expanded ? 'rotate(180deg)' : 'none',
          }}>▼</span>
        </div>

        <Bar
          value={total}
          maxValue={maxAbs}
          color={isPos ? 'var(--success)' : isNeg ? 'var(--danger)' : 'var(--border)'}
        />
      </div>

      {/* ── Expandable detail panel ── */}
      <div style={{
        display: 'grid',
        gridTemplateRows: expanded ? '1fr' : '0fr',
        transition: 'grid-template-rows 0.25s ease',
      }}>
        <div style={{ overflow: 'hidden' }}>
          <div style={{
            padding: '14px 16px 16px',
            borderTop: '1px solid var(--border)',
            display: 'flex', flexDirection: 'column', gap: 16,
          }}>
            {detail && (
              <>
                {/* ── As Picker ── */}
                {s.asPicker > 0 && (
                  <DGroup title="As Picker">
                    <DStat
                      label="Picked"
                      value={s.asPicker}
                      sub={`${pickPct}% of hands`}
                    />
                    <DStat
                      label="Pick Win%"
                      value={detail.pickWinRate != null ? `${detail.pickWinRate}%` : null}
                      color={detail.pickWinRate != null ? (detail.pickWinRate >= 50 ? 'var(--success)' : 'var(--danger)') : undefined}
                    />
                    <DStat
                      label="Avg Card Pts"
                      value={detail.avgPickerPts}
                      sub="picker's pts"
                      color={detail.avgPickerPts != null
                        ? (detail.avgPickerPts >= 61 ? 'var(--success)'
                          : detail.avgPickerPts >= 30 ? 'var(--warning)'
                          : 'var(--danger)')
                        : undefined}
                    />
                    <DStat
                      label="Net as Picker"
                      value={`${sign(s.pickerPts)}${s.pickerPts}`}
                      color={(s.pickerPts ?? 0) >= 0 ? 'var(--success)' : 'var(--danger)'}
                    />
                    <DStat
                      label="Bumped"
                      value={s.pickerLosses}
                      sub={s.asPicker ? `${bumpRate}% of picks` : ''}
                      color={s.pickerLosses > 0 ? (bumpRate > 55 ? 'var(--danger)' : 'var(--warning)') : undefined}
                      dim={s.pickerLosses === 0}
                    />
                    <DStat
                      label="Schneidered ✂️"
                      value={s.schneiderCount}
                      color={s.schneiderCount > 0 ? '#f97316' : undefined}
                      dim={s.schneiderCount === 0}
                    />
                    <DStat
                      label="Shed Cleans"
                      value={detail.shedCleanCount}
                      color={detail.shedCleanCount > 0 ? 'var(--success)' : undefined}
                      dim={detail.shedCleanCount === 0}
                    />
                    {s.lonerCount > 0 && (
                      <DStat
                        label="Loners"
                        value={s.lonerCount}
                        sub={`${detail.lonerWins}W / ${s.lonerCount - detail.lonerWins}L`}
                        color="var(--warning)"
                      />
                    )}
                  </DGroup>
                )}

                {/* ── As Partner ── */}
                {s.asPartner > 0 && (
                  <DGroup title="As Partner">
                    <DStat
                      label="Called"
                      value={s.asPartner}
                      sub={detail.partnerCallRate != null ? `${detail.partnerCallRate}% of active` : ''}
                    />
                    <DStat
                      label="Partner Win%"
                      value={detail.partnerWinRate != null ? `${detail.partnerWinRate}%` : null}
                      color={detail.partnerWinRate != null ? (detail.partnerWinRate >= 50 ? 'var(--success)' : 'var(--danger)') : undefined}
                    />
                    <DStat
                      label="Net as Partner"
                      value={`${sign(s.partnerPts)}${s.partnerPts}`}
                      color={(s.partnerPts ?? 0) >= 0 ? 'var(--success)' : 'var(--danger)'}
                    />
                    {detail.topPartner && (
                      <DStat
                        label="Most Often With"
                        value={dn(detail.topPartner.pid)}
                        sub={`${detail.topPartner.count}× together`}
                        color="var(--primary)"
                      />
                    )}
                  </DGroup>
                )}

                {/* ── As Opponent ── */}
                {s.asOpp > 0 && (
                  <DGroup title="As Opponent">
                    <DStat
                      label="Hands Opp"
                      value={s.asOpp}
                      sub={detail.activeHands ? `${Math.round(s.asOpp / detail.activeHands * 100)}% of active` : ''}
                    />
                    <DStat
                      label="Opp Win%"
                      value={detail.oppWinRate != null ? `${detail.oppWinRate}%` : null}
                      color={detail.oppWinRate != null ? (detail.oppWinRate >= 50 ? 'var(--success)' : 'var(--danger)') : undefined}
                    />
                    <DStat
                      label="Net as Opp"
                      value={`${sign(s.oppPts)}${s.oppPts}`}
                      color={(s.oppPts ?? 0) >= 0 ? 'var(--success)' : 'var(--danger)'}
                    />
                  </DGroup>
                )}

                {/* ── Multipliers ── */}
                {(s.crackCount > 0 || detail.recrackCount > 0 || s.blitzCount > 0) && (
                  <DGroup title="Multipliers Declared">
                    {s.crackCount > 0         && <DStat label="Cracks"    value={s.crackCount}         color="var(--warning)" />}
                    {detail.recrackCount > 0  && <DStat label="Re-cracks" value={detail.recrackCount}  color="var(--warning)" />}
                    {s.blitzCount > 0         && <DStat label="Blitzes"   value={s.blitzCount}         color="var(--danger)"  />}
                  </DGroup>
                )}

                {/* ── Overall ── */}
                <DGroup title="Overall">
                  <DStat
                    label="Best Hand"
                    value={s.biggestHandWin > 0 ? `+${s.biggestHandWin}` : null}
                    color="var(--success)"
                    dim={!s.biggestHandWin}
                  />
                  <DStat
                    label="Worst Hand"
                    value={detail.biggestLoss < 0 ? `${detail.biggestLoss}` : null}
                    color="var(--danger)"
                    dim={detail.biggestLoss >= 0}
                  />
                  <DStat
                    label="Net / Hand"
                    value={detail.netPerHand != null ? `${sign(detail.netPerHand)}${detail.netPerHand}` : null}
                    color={detail.netPerHand != null
                      ? (detail.netPerHand > 0 ? 'var(--success)' : detail.netPerHand < 0 ? 'var(--danger)' : undefined)
                      : undefined}
                  />
                  <DStat
                    label="Best Streak"
                    value={s.longestWinStreak || null}
                    color="var(--success)"
                    dim={!s.longestWinStreak}
                  />
                  <DStat
                    label="Worst Streak"
                    value={s.longestLossStreak || null}
                    color="var(--danger)"
                    dim={!s.longestLossStreak}
                  />
                </DGroup>
              </>
            )}
          </div>
        </div>
      </div>

    </div>
  )
}

export default function AnalyticsPage({ players, sessions, getPlayer, getDisplayName, getAnalytics }) {
  const [sortBy,     setSortBy]     = useState('totalPts')
  const [expandedId, setExpandedId] = useState(null)

  const dn         = getDisplayName ?? ((pid) => getPlayer(pid)?.firstName ?? pid)
  const stats      = getAnalytics()
  const allHands   = sessions.flatMap(s => s.hands)
  const totalHands = allHands.length

  const playerIds = players.map(p => p.id).filter(id => stats[id])

  const getSortValue = (id) => {
    const s = stats[id]
    if (!s) return 0
    if (sortBy === 'totalPts')    return s.totalPts
    if (sortBy === 'handsPlayed') return s.handsPlayed
    if (sortBy === 'pickRate')    return s.handsPlayed ? s.asPicker / s.handsPlayed : 0
    if (sortBy === 'lonerRate')   return s.asPicker    ? s.lonerCount / s.asPicker  : 0
    return 0
  }

  const ranked = [...playerIds].sort((a, b) => getSortValue(b) - getSortValue(a))
  const maxAbs = Math.max(1, ...ranked.map(id => Math.abs(stats[id]?.totalPts ?? 0)))
  const isNew  = (id) => (stats[id]?.sessionsPlayed ?? 0) <= 1 && (stats[id]?.handsPlayed ?? 0) > 0

  const handleToggle = (id) => setExpandedId(prev => prev === id ? null : id)

  return (
    <div style={{ maxWidth: 680, margin: '0 auto', padding: '24px 16px' }}>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800 }}>Stats</h1>
        <div style={{ color: 'var(--text-muted)', fontSize: 13, marginTop: 2 }}>All-time stats for the Shed</div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 24 }}>
        <StatCard label="Sessions"    value={sessions.length} />
        <StatCard label="Total Hands" value={totalHands} />
        <StatCard label="Players"     value={players.length} />
      </div>

      {totalHands === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text-muted)' }}>
          No games logged yet. Play some Sheepshead!
        </div>
      ) : (
        <>
          {/* Sort controls */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Sort by</div>
            <div className="toggle-group">
              {SORT_OPTIONS.map(o => (
                <button key={o.id} className={`toggle-btn ${sortBy === o.id ? 'active' : ''}`} onClick={() => setSortBy(o.id)}>
                  {o.label}
                </button>
              ))}
            </div>
          </div>

          {/* Fun stats callout */}
          {(() => {
            const mostSchneidered = ranked.reduce((best, id) => {
              const sc = stats[id]?.schneiderCount ?? 0
              return sc > (stats[best]?.schneiderCount ?? 0) ? id : best
            }, ranked[0])
            const sc       = stats[mostSchneidered]?.schneiderCount ?? 0
            const mostWins = [...ranked].sort((a, b) => (stats[b]?.wins ?? 0) - (stats[a]?.wins ?? 0))[0]
            if (!sc && !mostWins) return null
            return (
              <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
                {sc > 0 && (
                  <div style={{ flex: 1, minWidth: 140, background: 'var(--bg-elevated)', border: '1px solid rgba(249,115,22,0.3)', borderRadius: 'var(--radius)', padding: '10px 14px' }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Most Schneidered ✂️</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Avatar player={getPlayer(mostSchneidered)} size={22} />
                      <span style={{ fontWeight: 700, fontSize: 14 }}>{dn(mostSchneidered)}</span>
                    </div>
                    <div style={{ fontSize: 11, color: '#f97316', marginTop: 3 }}>{sc}× schneidered</div>
                  </div>
                )}
                {mostWins && (stats[mostWins]?.wins ?? 0) > 0 && (
                  <div style={{ flex: 1, minWidth: 140, background: 'var(--bg-elevated)', border: '1px solid rgba(34,197,94,0.25)', borderRadius: 'var(--radius)', padding: '10px 14px' }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Most Wins 🏆</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Avatar player={getPlayer(mostWins)} size={22} />
                      <span style={{ fontWeight: 700, fontSize: 14 }}>{dn(mostWins)}</span>
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--success)', marginTop: 3 }}>{stats[mostWins]?.wins} hands won</div>
                  </div>
                )}
              </div>
            )
          })()}

          {/* Leaderboard */}
          <div style={{ marginBottom: 28 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>
              Leaderboard
              <span style={{ fontSize: 10, fontWeight: 400, textTransform: 'none', letterSpacing: 0, marginLeft: 8 }}>· tap to expand</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {ranked.map((id, rank) => (
                <PlayerCard
                  key={id}
                  id={id}
                  rank={rank}
                  p={getPlayer(id)}
                  s={stats[id]}
                  maxAbs={maxAbs}
                  isNew={isNew(id)}
                  expanded={expandedId === id}
                  onToggle={() => handleToggle(id)}
                  allHands={allHands}
                  stats={stats}
                  dn={dn}
                />
              ))}
            </div>
          </div>

          {/* Session history */}
          {sessions.length > 0 && (
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>Session History</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {[...sessions].reverse().map(sess => {
                  const t = {}
                  sess.players.forEach(pid => { t[pid] = 0 })
                  sess.hands.forEach(h => Object.entries(h.scores ?? {}).forEach(([pid, d]) => { t[pid] = (t[pid] ?? 0) + d }))
                  const winner  = [...sess.players].sort((a, b) => (t[b] ?? 0) - (t[a] ?? 0))[0]
                  const dateStr = new Date(sess.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                  return (
                    <div key={sess.id} style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 600, fontSize: 14 }}>{dateStr}</div>
                        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                          {sess.hands.length} hands · {sess.players.map(pid => dn(pid)).join(', ')}
                        </div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Winner</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                          <Avatar player={getPlayer(winner)} size={20} />
                          <span style={{ fontWeight: 700, color: 'var(--warning)' }}>{dn(winner)}</span>
                        </div>
                      </div>
                      {sess.active && <span className="badge badge-success">Live</span>}
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
