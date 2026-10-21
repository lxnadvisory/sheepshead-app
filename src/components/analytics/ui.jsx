import Avatar from '../Avatar'
import { streakStyle } from '../InGameStats'
import { nightLabel } from '../../lib/analytics'

// Categorical line colors, stepped for the dark surface (validated for
// color-vision deficiency on #10101a). Slots go to the players with the most
// all-time hands; everyone else draws in OTHER.
export const SERIES = ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300', '#9085e9', '#e66767']
export const OTHER  = '#4b5468'

export function money(n, { sign = true, cents = false } = {}) {
  if (n == null || Number.isNaN(n)) return '—'
  const v = Math.round(n * 100) / 100
  const abs = Math.abs(v)
  const body = Number.isInteger(abs) && !cents ? abs : abs.toFixed(2)
  if (v === 0) return '$0'
  return `${v < 0 ? '−' : sign ? '+' : ''}$${body}`
}

export function signed(n, digits = 0) {
  if (n == null || Number.isNaN(n)) return '—'
  const v = Number(n.toFixed(digits))
  return `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(digits)}`
}

export const tone = n => n > 0 ? 'var(--success)' : n < 0 ? 'var(--danger)' : 'var(--text-secondary)'

/** All-time: % once the sample minimum is met, else "—". One night: raw counts. */
export function fmtRate(r, single) {
  if (!r || !r.den) return '—'
  if (single) return `${r.num} of ${r.den}`
  return r.ok ? `${Math.round(r.pct * 100)}%` : '—'
}

export function Money({ value, className = '', style }) {
  return <span className={`an-num ${className}`} style={{ color: tone(value), ...style }}>{money(value)}</span>
}

export function Card({ title, aside, children, className = '' }) {
  return (
    <section className={`an-card ${className}`}>
      {(title || aside) && (
        <header className="an-card-head">
          {title && <h2>{title}</h2>}
          {aside && <div className="an-card-aside">{aside}</div>}
        </header>
      )}
      {children}
    </section>
  )
}

/** Tappable avatar + display name — opens the player's profile. */
export function PlayerName({ pid, ctx, size = 28, showAvatar = true, sub }) {
  return (
    <button type="button" className="an-player" onClick={() => ctx.openPlayer(pid)} title={`Open ${ctx.name(pid)}'s profile`}>
      {showAvatar && <Avatar player={ctx.player(pid)} size={size} />}
      <span className="an-player-text">
        <span className="an-player-name">{ctx.name(pid)}</span>
        {sub && <span className="an-player-sub">{sub}</span>}
      </span>
    </button>
  )
}

export function StreakBadge({ n }) {
  const ss = streakStyle(n)
  if (!ss) return null
  return (
    <span className="an-streak" style={{ background: ss.bg, color: ss.color }} title={`${Math.abs(n)} ${n > 0 ? 'wins' : 'losses'} in a row`}>
      {ss.icon} <span className="an-num">{Math.abs(n)}</span>
    </span>
  )
}

/** Small win-% bar; the track is a dim step of the same hue. */
export function WinBar({ rate, single }) {
  const show = rate?.den > 0 && (single || rate.ok)
  return (
    <span className="an-winbar">
      <span className="an-num an-winbar-val">{fmtRate(rate, single)}</span>
      {show && (
        <span className="an-winbar-track" aria-hidden>
          <span className="an-winbar-fill" style={{ width: `${Math.round(rate.pct * 100)}%` }} />
        </span>
      )}
    </span>
  )
}

export function Kpi({ label, value, sub }) {
  return (
    <div className="an-kpi">
      <div className="an-kpi-label">{label}</div>
      <div className="an-kpi-value an-num">{value}</div>
      {sub && <div className="an-kpi-sub">{sub}</div>}
    </div>
  )
}

export const fmtBase = n => signed(n, Number.isInteger(Math.round(n * 100) / 100) ? 0 : 1)

/** Time-range filter: All-time · Last night · Pick a night. */
export function ScopeFilter({ scope, setScope, nights, compact = false }) {
  const picked = scope !== 'all' && scope !== 'last' ? scope : ''
  return (
    <div className={`an-filters ${compact ? 'an-filters-compact' : ''}`}>
      <div className="an-seg" role="group" aria-label="Time range">
        <button type="button" className={scope === 'all' ? 'on' : ''} onClick={() => setScope('all')}>All-time</button>
        <button type="button" className={scope === 'last' ? 'on' : ''} onClick={() => setScope('last')}>Last night</button>
      </div>
      <select className={`an-select ${picked ? 'on' : ''}`} value={picked} onChange={e => setScope(e.target.value || 'all')} aria-label="Pick a night">
        <option value="">Pick a night…</option>
        {[...nights].reverse().map(n => <option key={n} value={n}>{nightLabel(n, { long: true })}</option>)}
      </select>
    </div>
  )
}
