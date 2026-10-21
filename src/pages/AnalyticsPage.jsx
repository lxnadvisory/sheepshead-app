import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { hasSupabase } from '../supabase'
import * as db from '../db'
import { computeAnalytics, rowsFromStore, nightLabel, MIN_PICKS, MIN_HANDS } from '../lib/analytics'
import { getDisplayName } from '../utils/displayName'
import { Card, Kpi, Money, PlayerName, ScopeFilter, StreakBadge, WinBar, fmtBase, fmtRate, money, SERIES, OTHER } from '../components/analytics/ui'
import RunningMoney from '../components/analytics/RunningMoney'
import Heatmap from '../components/analytics/Heatmap'
import PlayerProfile from './PlayerProfile'
import '../components/analytics/analytics.css'

// ── Routing: #stats (dashboard) · #stats/p/<id> (profile) ─────────────────────
const profileFromHash = () => {
  const m = window.location.hash.match(/^#stats\/p\/([^/?#]+)/)
  return m ? decodeURIComponent(m[1]) : null
}

export default function AnalyticsPage({ players, sessions, dataWarnings = [] }) {
  // ── Load raw rows (read-only) ──────────────────────────────────────────────
  // Re-fetch whenever the store's hands change (new hand, edit, remote update).
  const storeKey = useMemo(() => sessions.map(s =>
    `${s.id}:${s.players.join('.')}:` + s.hands.map(h => `${h.id}=${Object.values(h.scores ?? {}).join(',')}`).join(';')
  ).join('|'), [sessions])

  const [rows, setRows] = useState(null)
  const [loadError, setLoadError] = useState(null)
  const loaded = useRef(false)

  useEffect(() => {
    if (!hasSupabase) { setRows(rowsFromStore(players, sessions)); return }
    let alive = true
    const t = setTimeout(() => {
      db.getAnalyticsRows()
        .then(r => { if (alive) { setRows(r); setLoadError(null); loaded.current = true } })
        .catch(err => {
          console.error('[Analytics] Could not load stats from the database:', err)
          if (alive) { setRows(rowsFromStore(players, sessions)); setLoadError(err?.message || String(err)) }
        })
    }, loaded.current ? 400 : 0)
    return () => { alive = false; clearTimeout(t) }
  }, [storeKey]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Scope + route ──────────────────────────────────────────────────────────
  const [scope, setScope] = useState('all')
  const [profile, setProfile] = useState(profileFromHash)
  const fromDashboard = useRef(false)

  useEffect(() => {
    const onHash = () => setProfile(profileFromHash())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  const openPlayer = useCallback(pid => {
    fromDashboard.current = true
    window.location.hash = `#stats/p/${encodeURIComponent(pid)}`
  }, [])
  // body is the scroll container (html/body are height: 100%), so reset both
  useEffect(() => { if (profile) { window.scrollTo(0, 0); document.body.scrollTo(0, 0) } }, [profile])
  const closeProfile = useCallback(() => {
    if (fromDashboard.current) { fromDashboard.current = false; window.history.back() }
    else window.location.hash = '#stats'
  }, [])

  // ── Analytics ──────────────────────────────────────────────────────────────
  const allTime = useMemo(() => rows && computeAnalytics(rows), [rows])
  const a       = useMemo(() => rows && (scope === 'all' ? allTime : computeAnalytics(rows, { scope })), [rows, scope, allTime])

  useEffect(() => {
    if (allTime && !allTime.check.ok) {
      console.error(`[Analytics] Data check failed: all players' net adds up to ${allTime.check.sum}, not $0.`)
    }
  }, [allTime])

  // Names / avatars come from the same rows as the stats; photos from the store
  const roster = useMemo(() => {
    const list = (rows?.players ?? []).map(p => ({
      id: p.id, firstName: p.first_name ?? p.firstName ?? '', lastName: p.last_name ?? p.lastName ?? '',
      photo: p.photo ?? players.find(x => x.id === p.id)?.photo ?? null,
    }))
    players.forEach(p => { if (!list.some(x => x.id === p.id)) list.push(p) })
    return list
  }, [rows, players])

  const ctx = useMemo(() => {
    const byId = new Map(roster.map(p => [p.id, p]))
    // Display names; where two still collide (Matt S. / Matt S.) use the full name
    const names = new Map(roster.map(p => [p.id, getDisplayName(roster, p.id)]))
    const counts = {}
    names.forEach(n => { counts[n] = (counts[n] ?? 0) + 1 })
    roster.forEach(p => {
      if (counts[names.get(p.id)] > 1) names.set(p.id, `${p.firstName} ${p.lastName}`.trim())
    })
    // Colour slots: players in view, ordered by all-time hands, so regulars keep their colour
    const inView = a ? Object.keys(a.players) : []
    const order = [...inView].sort((x, y) => (allTime?.players[y]?.hands ?? 0) - (allTime?.players[x]?.hands ?? 0))
    const slot = new Map(order.slice(0, SERIES.length).map((pid, i) => [pid, i]))
    return {
      player: pid => byId.get(pid) ?? null,
      name: pid => names.get(pid) ?? 'Unknown',
      colorSlot: pid => slot.get(pid) ?? null,
      color: pid => slot.has(pid) ? SERIES[slot.get(pid)] : OTHER,
      openPlayer,
    }
  }, [roster, a, allTime, openPlayer])

  if (!rows || !a) {
    return <div className="an-page"><div className="an-empty an-loading">Loading stats…</div></div>
  }

  const notes = (
    <DataNotes a={allTime} loadError={loadError} dataWarnings={dataWarnings} offline={!hasSupabase} />
  )

  if (profile) {
    return (
      <div className="an-page an-page-profile">
        <PlayerProfile a={a} allTime={allTime} pid={profile} ctx={ctx}
          scope={scope} setScope={setScope} onBack={closeProfile} />
        {notes}
      </div>
    )
  }

  return (
    <div className="an-page">
      <Dashboard a={a} ctx={ctx} scope={scope} setScope={setScope} />
      {notes}
    </div>
  )
}

// ── Dashboard ─────────────────────────────────────────────────────────────────

function Dashboard({ a, ctx, scope, setScope }) {
  const { kpis, players: P, ranking, single } = a
  const inView = ranking.filter(pid => P[pid].hands > 0)
  const scopeText = single ? nightLabel(a.night, { long: true }) : 'All-time'

  return (
    <>
      <header className="an-head">
        <div>
          <h1 className="an-title">THE SHED <span>/</span> ANALYTICS</h1>
          <div className="an-subline">
            {scopeText} · {kpis.nights} night{kpis.nights === 1 ? '' : 's'} · {kpis.hands} hands · {kpis.players} players
          </div>
        </div>
        <div className="an-head-filters">
          <ScopeFilter scope={scope} setScope={setScope} nights={a.allNights} />
          <select className="an-select" value="" onChange={e => e.target.value && ctx.openPlayer(e.target.value)} aria-label="Open a player's profile">
            <option value="">Player…</option>
            {[...inView].sort((x, y) => ctx.name(x).localeCompare(ctx.name(y))).map(pid => <option key={pid} value={pid}>{ctx.name(pid)}</option>)}
          </select>
        </div>
      </header>

      {kpis.hands === 0 ? (
        <div className="an-empty">No hands logged {single ? 'that night' : 'yet'}. Play some Sheepshead!</div>
      ) : (
        <>
          <div className="an-kpis">
            <Kpi label="Nights" value={kpis.nights} />
            <Kpi label="Hands" value={kpis.hands} />
            <Kpi label="$ moved" value={money(kpis.moved, { sign: false })} />
            <Kpi label="Biggest hand" value={kpis.biggestHand ? money(kpis.biggestHand.delta) : '—'}
              sub={kpis.biggestHand && `${ctx.name(kpis.biggestHand.pid)} · ${nightLabel(kpis.biggestHand.night)} · ×${kpis.biggestHand.mult}`} />
            <Kpi label="Picker win %" value={kpis.pickerWin.pct == null ? '—' : `${Math.round(kpis.pickerWin.pct * 100)}%`}
              sub={`${kpis.pickerWin.num} of ${kpis.pickerWin.den}`} />
            <Kpi label="Avg multiplier" value={kpis.avgMult == null ? '—' : `×${kpis.avgMult.toFixed(1)}`} />
            <Kpi label="Crack rate" value={kpis.crackRate.pct == null ? '—' : `${Math.round(kpis.crackRate.pct * 100)}%`}
              sub={`${kpis.crackRate.num} of ${kpis.crackRate.den} hands`} />
          </div>

          <div className="an-row an-row-lead">
            <Card title="Leaderboard">
              <Leaderboard a={a} ctx={ctx} ids={ranking} />
            </Card>
            <Card title="Running money" aside={single ? 'by hand' : 'by night'}>
              <RunningMoney running={a.running} ctx={ctx} />
            </Card>
          </div>

          <div className="an-row">
            <Card title="Picking" aside={single ? 'counts for this night' : `rates need ${MIN_PICKS}+ picks`}>
              <PickingTable a={a} ctx={ctx} />
            </Card>
            <Card title="Chemistry" aside="picker × partner">
              <Heatmap chemistry={a.chemistry} ctx={ctx} />
              <DuoLines chem={a.chemistry} ctx={ctx} />
            </Card>
          </div>

          <div className="an-row">
            <Card title="Defense & guts" aside={single ? 'counts for this night' : `rates need ${MIN_HANDS}+ hands`}>
              <DefenseTable a={a} ctx={ctx} ids={inView} />
            </Card>
            <Card title="Record book">
              <RecordBook r={a.records} ctx={ctx} />
            </Card>
          </div>

          <Card title="Awards wall" className="an-awards-card">
            <AwardsWall awards={a.awards} ctx={ctx} />
          </Card>
        </>
      )}
    </>
  )
}

function Leaderboard({ a, ctx, ids }) {
  const P = a.players
  return (
    <div className="an-scroll">
      <table className="an-table an-lead">
        <thead>
          <tr><th className="an-c">#</th><th>Player</th><th className="an-r">Net $</th><th className="an-r">$/hand</th><th className="an-r">Base</th><th className="an-r">Nights won</th><th className="an-c">Streak</th></tr>
        </thead>
        <tbody>
          {ids.map(pid => {
            const p = P[pid]
            return (
              <tr key={pid}>
                <td className="an-c an-num an-rank">{p.rank}</td>
                <td><PlayerName pid={pid} ctx={ctx} size={34} sub={`${p.hands} hands`} /></td>
                <td className="an-r"><Money value={p.net} className="an-big" /></td>
                <td className="an-r an-num" style={{ color: 'var(--text-secondary)' }}>{p.perHand == null ? '—' : money(p.perHand, { cents: true })}</td>
                <td className="an-r an-num">{fmtBase(p.base)}</td>
                <td className="an-r an-num">{p.nightsWon || <span className="an-muted">0</span>}</td>
                <td className="an-c"><StreakBadge n={p.current} /></td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function PickingTable({ a, ctx }) {
  const P = a.players, single = a.single
  const ids = a.ranking.filter(pid => P[pid].picks > 0).sort((x, y) => P[y].picks - P[x].picks || P[y].net - P[x].net)
  if (!ids.length) return <div className="an-empty">No picks yet.</div>
  return (
    <div className="an-scroll">
      <table className="an-table">
        <thead>
          <tr><th>Player</th><th className="an-r">Picks</th><th className="an-r">Pick rate</th><th>Win %</th><th className="an-r">$ / pick</th><th className="an-r">Avg pts</th><th className="an-r">Bumped</th><th className="an-r">Loner W–L</th></tr>
        </thead>
        <tbody>
          {ids.map(pid => {
            const p = P[pid]
            return (
              <tr key={pid}>
                <td><PlayerName pid={pid} ctx={ctx} size={26} /></td>
                <td className="an-r an-num">{p.picks}</td>
                <td className="an-r an-num">{fmtRate(p.pickRate, single)}</td>
                <td><WinBar rate={p.pickWin} single={single} /></td>
                <td className="an-r">{p.perPick == null ? <span className="an-muted">—</span> : <Money value={p.perPick} />}</td>
                <td className="an-r an-num">{p.avgPoints == null ? '—' : Math.round(p.avgPoints)}</td>
                <td className="an-r an-num">{fmtRate(p.bumped, single)}</td>
                <td className="an-r an-num">{p.loners ? `${p.lonerWins}–${p.loners - p.lonerWins}` : '—'}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function DuoLines({ chem, ctx }) {
  const line = (label, d) => d && (
    <div className="an-duo">
      <span className="an-duo-label">{label}</span>
      <span className="an-duo-who">
        <PlayerName pid={d.a} ctx={ctx} size={22} /> <span className="an-muted">&</span> <PlayerName pid={d.b} ctx={ctx} size={22} />
      </span>
      <span className="an-num an-duo-stat">{d.wins} of {d.hands} · {Math.round(d.pct * 100)}%</span>
    </div>
  )
  if (!chem.bestDuo) return <div className="an-duos an-muted">No pair has played 3 hands together yet.</div>
  return (
    <div className="an-duos">
      {line('Best duo', chem.bestDuo)}
      {chem.worstDuo && chem.worstDuo !== chem.bestDuo && line('Worst duo', chem.worstDuo)}
    </div>
  )
}

function DefenseTable({ a, ctx, ids }) {
  const P = a.players, single = a.single
  return (
    <div className="an-scroll">
      <table className="an-table">
        <thead>
          <tr><th>Player</th><th className="an-r">Bumps picker</th><th className="an-r">Cracks</th><th className="an-r">Crack win %</th><th className="an-r">Crack $</th><th className="an-r">Re-cracks</th><th className="an-r">Blitzes</th><th className="an-r">F-ups</th></tr>
        </thead>
        <tbody>
          {ids.map(pid => {
            const p = P[pid]
            return (
              <tr key={pid}>
                <td><PlayerName pid={pid} ctx={ctx} size={26} /></td>
                <td className="an-r an-num">{fmtRate(p.defense, single)}</td>
                <td className="an-r an-num">{p.cracks || <span className="an-muted">0</span>}</td>
                <td className="an-r an-num">{fmtRate(p.crackWin, single)}</td>
                <td className="an-r">{p.cracks ? <Money value={p.crackNet} /> : <span className="an-muted">—</span>}</td>
                <td className="an-r an-num">{p.recracks || <span className="an-muted">0</span>}</td>
                <td className="an-r an-num">{p.blitzes || <span className="an-muted">0</span>}</td>
                <td className="an-r an-num">{p.fups || <span className="an-muted">0</span>}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function RecordBook({ r, ctx }) {
  const range = x => (x.from === x.to ? nightLabel(x.from) : `${nightLabel(x.from)} – ${nightLabel(x.to)}`) +
    (x.tied?.length ? ` · tied with ${x.tied.map(ctx.name).join(', ')}` : '')
  const items = [
    ['Biggest hand', r.biggestHand, x => money(x.delta), x => `${nightLabel(x.night)} · hand #${x.num} · ×${x.mult}`],
    ['Worst hand',   r.worstHand,   x => money(x.delta), x => `${nightLabel(x.night)} · hand #${x.num} · ×${x.mult}`],
    ['Longest hot streak',  r.hotStreak,  x => `🔥 ${x.len}`, range],
    ['Longest cold streak', r.coldStreak, x => `🥶 ${x.len}`, range],
    ['Best night',  r.bestNight,  x => money(x.net), x => nightLabel(x.night, { long: true })],
    ['Worst night', r.worstNight, x => money(x.net), x => nightLabel(x.night, { long: true })],
  ]
  return (
    <div className="an-records">
      {items.map(([label, x, val, when]) => (
        <div key={label} className="an-record">
          <div className="an-record-label">{label}</div>
          {x ? (
            <>
              <div className="an-record-main">
                <PlayerName pid={x.pid} ctx={ctx} size={28} />
                <span className="an-num an-record-val" style={{ color: x.delta < 0 || x.net < 0 ? 'var(--danger)' : x.delta > 0 || x.net > 0 ? 'var(--success)' : undefined }}>{val(x)}</span>
              </div>
              <div className="an-record-when">{when(x)}</div>
            </>
          ) : <div className="an-muted">—</div>}
        </div>
      ))}
    </div>
  )
}

function AwardsWall({ awards, ctx }) {
  if (!awards.length) return <div className="an-empty">No awards yet.</div>
  return (
    <div className="an-awards">
      {awards.map(aw => (
        <div key={aw.id} className="an-award">
          <div className="an-award-title"><span aria-hidden>{aw.emoji}</span> {aw.title}</div>
          <div className="an-award-who">
            {aw.winners.slice(0, 3).map(pid => <PlayerName key={pid} pid={pid} ctx={ctx} size={30} />)}
            {aw.winners.length > 3 && <span className="an-muted">+{aw.winners.length - 3} tied</span>}
          </div>
          <div className="an-award-reason">{aw.winners.length > 1 && !aw.duo ? 'Tied · ' : ''}{aw.reason}</div>
        </div>
      ))}
    </div>
  )
}

// ── Data notes (bottom of page) ───────────────────────────────────────────────

function DataNotes({ a, loadError, dataWarnings, offline }) {
  const byNight = {}
  a.misaligned.forEach(m => { (byNight[m.night] ??= []).push(m) })
  const hasAny = !a.check.ok || a.misaligned.length || loadError || dataWarnings.length || offline
  if (!hasAny) return null
  return (
    <footer className="an-notes">
      {!a.check.ok && (
        <div className="an-note an-note-bad">
          <strong>Data check failed:</strong> all players' net adds up to {money(a.check.sum)}, not $0.
        </div>
      )}
      {a.misaligned.length > 0 && (
        <div className="an-note">
          <strong>Data check:</strong> {a.misaligned.length} hands have scores that are probably on the wrong seats
          (a player was moved after these hands were saved). Stats use them as stored.
          <ul>
            {Object.entries(byNight).map(([n, ms]) => (
              <li key={n}>{nightLabel(n, { long: true })}: {ms.map(m => `#${m.num}`).join(', ')}</li>
            ))}
          </ul>
        </div>
      )}
      {loadError && <div className="an-note">Couldn't load from the database ({loadError}) — showing this device's saved copy.</div>}
      {offline && <div className="an-note">Offline mode: stats use this device's saved copy; multipliers are rebuilt from each hand.</div>}
      {dataWarnings.length > 0 && (
        <div className="an-note">
          <strong>Data health:</strong>
          <ul>{dataWarnings.map((w, i) => <li key={i}>{w.text}</li>)}</ul>
        </div>
      )}
    </footer>
  )
}
