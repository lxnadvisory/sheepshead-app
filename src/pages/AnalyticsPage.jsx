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

function StatCard({ label, value, sub, color }) {
  return (
    <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 800, color: color ?? 'var(--text-primary)' }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{sub}</div>}
    </div>
  )
}

function Bar({ value, maxValue, color }) {
  const pct = maxValue === 0 ? 0 : Math.min(100, (Math.abs(value) / Math.abs(maxValue)) * 100)
  return (
    <div style={{ height: 5, background: 'var(--border)', borderRadius: 3, overflow: 'hidden' }}>
      <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 3, transition: 'width 0.4s ease' }} />
    </div>
  )
}

function MiniStat({ label, value, color }) {
  return (
    <div style={{ background: 'var(--bg-elevated)', borderRadius: 'var(--radius-sm)', padding: '5px 7px', display: 'flex', flexDirection: 'column', gap: 2 }}>
      <div style={{ fontSize: 9, color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</div>
      <div style={{ fontSize: 13, fontWeight: 800, color: color ?? 'var(--text-primary)' }}>{value}</div>
    </div>
  )
}

function sign(n) { return n >= 0 ? '+' : '' }

export default function AnalyticsPage({ players, sessions, getPlayer, getDisplayName, getAnalytics }) {
  const [sortBy, setSortBy] = useState('totalPts')

  const dn    = getDisplayName ?? ((pid) => getPlayer(pid)?.firstName ?? pid)
  const stats = getAnalytics()
  const allHands      = sessions.flatMap(s => s.hands)
  const totalHands    = allHands.length
  const totalSessions = sessions.length

  const playerIds = players.map(p => p.id).filter(id => stats[id])

  const getSortValue = (id) => {
    const s = stats[id]
    if (!s) return 0
    if (sortBy === 'totalPts')    return s.totalPts
    if (sortBy === 'handsPlayed') return s.handsPlayed
    if (sortBy === 'pickRate')    return s.handsPlayed ? s.asPicker / s.handsPlayed : 0
    if (sortBy === 'lonerRate')   return s.asPicker    ? s.lonerCount / s.asPicker   : 0
    return 0
  }

  const ranked = [...playerIds].sort((a, b) => getSortValue(b) - getSortValue(a))
  const maxAbs = Math.max(1, ...ranked.map(id => Math.abs(stats[id]?.totalPts ?? 0)))

  // "NEW" = only appeared in 1 session so far
  const isNew = (id) => (stats[id]?.sessionsPlayed ?? 0) <= 1 && (stats[id]?.handsPlayed ?? 0) > 0

  return (
    <div style={{ maxWidth: 680, margin: '0 auto', padding: '24px 16px' }}>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800 }}>Stats</h1>
        <div style={{ color: 'var(--text-muted)', fontSize: 13, marginTop: 2 }}>All-time stats for the Shed</div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 24 }}>
        <StatCard label="Sessions"    value={totalSessions} />
        <StatCard label="Total Hands" value={totalHands} />
        <StatCard label="Players"     value={players.length} />
      </div>

      {totalHands === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text-muted)' }}>No games logged yet. Play some Sheepshead!</div>
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
            const sc = stats[mostSchneidered]?.schneiderCount ?? 0
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
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>Leaderboard</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {ranked.map((id, rank) => {
                const p     = getPlayer(id)
                const s     = stats[id]
                const total = s?.totalPts ?? 0
                const isPos = total > 0, isNeg = total < 0

                const winRate       = s?.handsPlayed ? Math.round((s.wins          / s.handsPlayed) * 100) : 0
                const pickRate      = s?.handsPlayed ? Math.round((s.asPicker      / s.handsPlayed) * 100) : 0
                const partnerRate   = s?.handsPlayed ? Math.round((s.asPartner     / s.handsPlayed) * 100) : 0
                const bumpRate      = s?.asPicker    ? Math.round((s.pickerLosses  / s.asPicker)    * 100) : 0
                const aloneRate     = s?.asPicker    ? Math.round((s.lonerCount    / s.asPicker)    * 100) : 0
                const crackRate     = s?.handsPlayed ? Math.round((s.crackCount    / s.handsPlayed) * 100) : 0
                const blitzRate     = s?.handsPlayed ? Math.round((s.blitzCount    / s.handsPlayed) * 100) : 0
                const schneiderRate  = s?.asPicker ? Math.round((s.schneiderCount / s.asPicker) * 100) : 0
                const avgPickerPts  = s?.asPicker ? Math.round(s.pickerPointsSum / s.asPicker) : null

                const cur = s?.currentStreak ?? 0
                const ss  = streakStyle(cur)

                return (
                  <div key={id} style={{ background: 'var(--bg-surface)', border: `1px solid ${isPos ? 'rgba(34,197,94,0.2)' : isNeg ? 'rgba(239,68,68,0.15)' : 'var(--border)'}`, borderRadius: 'var(--radius)', padding: '14px 16px' }}>

                    {/* Name + total */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
                      <span style={{ width: 28, height: 28, borderRadius: '50%', background: rank === 0 ? 'rgba(245,158,11,0.2)' : 'var(--bg-elevated)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 800, color: rank === 0 ? 'var(--warning)' : 'var(--text-muted)', flexShrink: 0 }}>#{rank+1}</span>
                      <Avatar player={p} size={32} />
                      <span style={{ flex: 1, fontWeight: 700, fontSize: 16, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        {getFullName(p) || dn(id)}
                        {isNew(id) && <span className="badge badge-primary" style={{ fontSize: 9 }}>NEW</span>}
                      </span>
                      <span style={{ fontSize: 20, fontWeight: 800, color: isPos ? 'var(--success)' : isNeg ? 'var(--danger)' : 'var(--text-muted)' }}>{sign(total)}{total}</span>
                    </div>

                    <Bar value={total} maxValue={maxAbs} color={isPos ? 'var(--success)' : isNeg ? 'var(--danger)' : 'var(--text-muted)'} />

                    {/* Rate stats */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6, marginTop: 10 }}>
                      <MiniStat label="Win%"      value={`${winRate}%`}      color={winRate >= 50 ? 'var(--success)' : 'var(--danger)'} />
                      <MiniStat label="Pick%"     value={s?.asPicker    ? `${pickRate}%`      : '—'} />
                      <MiniStat label="Partner%"  value={s?.asPartner   ? `${partnerRate}%`   : '—'} />
                      <MiniStat label="Bump%"     value={s?.asPicker    ? `${bumpRate}%`      : '—'} color={s?.asPicker ? (bumpRate > 55 ? 'var(--danger)' : bumpRate > 35 ? 'var(--warning)' : 'var(--success)') : undefined} />
                      <MiniStat label="Alone%"    value={s?.asPicker    ? `${aloneRate}%`     : '—'} />
                      <MiniStat label="✂️ Schndr%" value={s?.asPicker    ? `${schneiderRate}%` : '—'} color={schneiderRate > 30 ? 'var(--danger)' : schneiderRate > 0 ? '#f97316' : undefined} />
                      <MiniStat label="Avg Pts"   value={avgPickerPts != null ? `${avgPickerPts}p` : '—'} color={avgPickerPts != null ? (avgPickerPts >= 61 ? 'var(--success)' : avgPickerPts >= 30 ? 'var(--warning)' : 'var(--danger)') : undefined} />
                      <MiniStat label="Crack%"    value={crackRate > 0  ? `${crackRate}%`     : '—'} />
                    </div>

                    {/* Streak stats */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 6, marginTop: 6, paddingTop: 8, borderTop: '1px solid var(--border)' }}>
                      <MiniStat
                        label="Streak"
                        value={
                          <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                            {cur === 0 ? '—' : `${cur > 0 ? '+' : ''}${cur}`}
                            {ss && <span style={{ fontSize: 12 }}>{ss.icon}</span>}
                          </span>
                        }
                        color={cur > 0 ? 'var(--success)' : cur < 0 ? 'var(--danger)' : undefined}
                      />
                      <MiniStat label="Best W"    value={s?.longestWinStreak  || '—'} color={s?.longestWinStreak  ? 'var(--success)' : undefined} />
                      <MiniStat label="Worst L"   value={s?.longestLossStreak || '—'} color={s?.longestLossStreak ? 'var(--danger)'  : undefined} />
                      <MiniStat label="Best Hand" value={s?.biggestHandWin > 0 ? `+${s.biggestHandWin}` : '—'} color={s?.biggestHandWin > 0 ? 'var(--success)' : undefined} />
                      <MiniStat label="Hands"     value={s?.handsPlayed ?? 0} />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Picker stats table */}
          <div style={{ marginBottom: 28 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>Picker Stats</div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 480, fontSize: 13 }}>
                <thead>
                  <tr>
                    {['Player', 'Picked', 'Pick Win%', 'Avg Pts', 'Loner W', 'Opp Pts'].map(h => (
                      <th key={h} style={{ padding: '8px 12px', textAlign: h === 'Player' ? 'left' : 'right', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', borderBottom: '2px solid var(--border)', background: 'var(--bg-elevated)', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {ranked.map(id => {
                    const p = getPlayer(id)
                    const s = stats[id]
                    const pickWins = allHands.filter(h => h.picker === id && (h.scores?.[id] ?? 0) > 0).length
                    const pickWinRate = s?.asPicker ? Math.round((pickWins / s.asPicker) * 100) : 0
                    const avgPts      = s?.asPicker ? (s.pickerPts / s.asPicker).toFixed(1) : '—'
                    const lonerWins   = allHands.filter(h => h.picker === id && h.isLoner && (h.scores?.[id] ?? 0) > 0).length
                    const lonerTotal  = allHands.filter(h => h.picker === id && h.isLoner).length
                    return (
                      <tr key={id} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: '10px 12px', fontWeight: 700 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <Avatar player={p} size={22} />
                            {getFullName(p) || dn(id)}
                          </div>
                        </td>
                        <td style={{ padding: '10px 12px', textAlign: 'right', color: 'var(--text-secondary)' }}>{s?.asPicker ?? 0}</td>
                        <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700, color: pickWinRate >= 50 ? 'var(--success)' : pickWinRate > 0 ? 'var(--danger)' : 'var(--text-muted)' }}>{s?.asPicker ? `${pickWinRate}%` : '—'}</td>
                        <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700, color: Number(avgPts) > 0 ? 'var(--success)' : Number(avgPts) < 0 ? 'var(--danger)' : 'var(--text-muted)' }}>{avgPts}</td>
                        <td style={{ padding: '10px 12px', textAlign: 'right', color: 'var(--text-secondary)' }}>{lonerTotal > 0 ? `${lonerWins}/${lonerTotal}` : '—'}</td>
                        <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700, color: (s?.oppPts ?? 0) > 0 ? 'var(--success)' : (s?.oppPts ?? 0) < 0 ? 'var(--danger)' : 'var(--text-muted)' }}>{sign(s?.oppPts ?? 0)}{s?.oppPts ?? 0}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
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
