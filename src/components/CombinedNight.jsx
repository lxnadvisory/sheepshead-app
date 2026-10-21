import { useState, useEffect, useCallback } from 'react'
import { hasSupabase } from '../supabase'
import * as db from '../db'
import { combineSessions, tableLabel } from '../utils/combined'
import Settlement from './Settlement'

const APP_URL = 'https://sheepshead-app.vercel.app/'

const money = n => (n >= 0 ? `+$${n.toFixed(2)}` : `-$${Math.abs(n).toFixed(2)}`)
const pts   = n => `${n > 0 ? '+' : ''}${n}`

// ── Combined email (one summary for the whole night) ─────────────────────────
export function buildCombinedEmail({ tables, players, night, transfers, getPlayer, dn }) {
  const dateStr = new Date(tables[0]?.date ?? Date.now()).toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  })
  const subject   = `Sheepshead Night — ${dateStr} (${tables.length} tables)`
  const standings = [...players].sort((a, b) => (night[b] ?? 0) - (night[a] ?? 0))
  const cell      = 'padding:6px 10px;font-size:13px;'
  const head      = 'padding:8px 12px 6px;background:#18182a;border-bottom:1px solid #2a2a42;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:#4a5568;'
  const box       = 'background:#10101a;border:1px solid #2a2a42;border-radius:10px;margin-bottom:16px;overflow:hidden;'
  const color     = n => (n > 0 ? '#22c55e' : n < 0 ? '#ef4444' : '#94a3b8')

  const standingsRows = standings.map((pid, i) => {
    const total = night[pid] ?? 0
    return `<tr>
      <td style="${cell}color:#94a3b8;">#${i + 1}</td>
      <td style="${cell}font-weight:700;font-size:14px;">${dn(pid)}${i === 0 ? ' 🏆' : ''}</td>
      <td style="${cell}font-weight:800;color:${color(total)};font-size:14px;">${pts(total)} pts</td>
      <td style="${cell}color:#94a3b8;">${money(total)}</td>
    </tr>`
  }).join('')

  const transferRows = transfers.length > 0
    ? transfers.map(t => {
        const toP   = getPlayer(t.to)
        const venmo = toP?.venmo
          ? `<br><a href="https://venmo.com/${toP.venmo}?txn=pay&amount=${Math.abs(t.amount).toFixed(2)}&note=Sheepshead" style="color:#6366f1;font-size:12px;">venmo.com/${toP.venmo}</a>`
          : ''
        return `<tr>
          <td style="${cell}font-size:14px;"><span style="color:#ef4444;font-weight:700;">${dn(t.from)}</span>
            <span style="color:#94a3b8;"> pays </span><span style="color:#22c55e;font-weight:700;">${dn(t.to)}</span></td>
          <td style="${cell}font-weight:800;font-size:15px;">$${Math.abs(t.amount).toFixed(2)}${venmo}</td>
        </tr>`
      }).join('')
    : `<tr><td colspan="2" style="${cell}color:#94a3b8;">Everyone came out even — no transfers needed!</td></tr>`

  const breakdownHead = tables.map(t => `<th style="${cell}color:#94a3b8;text-align:right;font-weight:600;">${t.label}<br><span style="font-size:11px;">${t.handCount} hands</span></th>`).join('')
  const breakdownRows = standings.map(pid => `<tr>
      <td style="${cell}font-weight:700;">${dn(pid)}</td>
      ${tables.map(t => pid in t.totals
        ? `<td style="${cell}text-align:right;color:${color(t.totals[pid])};">${pts(t.totals[pid])}</td>`
        : `<td style="${cell}text-align:right;color:#4a5568;">—</td>`).join('')}
      <td style="${cell}text-align:right;font-weight:800;color:${color(night[pid] ?? 0)};">${pts(night[pid] ?? 0)}</td>
    </tr>`).join('')

  const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#08080f;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#f1f5f9;">
  <div style="max-width:560px;margin:0 auto;padding:24px 16px;">
    <div style="text-align:center;padding:20px 0 16px;">
      <div style="font-size:28px;margin-bottom:6px;">🃏</div>
      <h1 style="margin:0;font-size:22px;font-weight:800;color:#f1f5f9;">Game Night's in the Books!</h1>
      <p style="margin:6px 0 0;font-size:13px;color:#94a3b8;">${dateStr} · The Shed · ${tables.length} tables combined</p>
    </div>
    <div style="${box}"><div style="${head}">Final Standings — whole night</div>
      <table style="width:100%;border-collapse:collapse;">${standingsRows}</table></div>
    <div style="${box}"><div style="${head}">Who Owes Whom</div>
      <table style="width:100%;border-collapse:collapse;">${transferRows}</table></div>
    <div style="${box}"><div style="${head}">Points by Table</div>
      <table style="width:100%;border-collapse:collapse;">
        <tr><th style="${cell}"></th>${breakdownHead}<th style="${cell}color:#94a3b8;text-align:right;">Night</th></tr>
        ${breakdownRows}
      </table></div>
    <div style="text-align:center;padding-bottom:8px;">
      <p style="margin:0 0 12px;font-size:14px;color:#94a3b8;">Good game all — see you next time! 🍺</p>
      <a href="${APP_URL}" style="display:inline-block;padding:9px 20px;background:#6366f1;color:#fff;text-decoration:none;border-radius:6px;font-size:13px;font-weight:600;">Open The Shed App</a>
    </div>
  </div>
</body>
</html>`

  let text = `Game night's in the books! Recap from ${dateStr} at The Shed — ${tables.length} tables combined. 🃏\n\n`
  text += `FINAL STANDINGS (whole night)\n`
  standings.forEach((pid, i) => {
    text += `  ${i + 1}. ${dn(pid).padEnd(10)} ${pts(night[pid] ?? 0)} pts  (${money(night[pid] ?? 0)})${i === 0 ? '  🏆' : ''}\n`
  })
  text += transfers.length > 0 ? `\nWHO OWES WHOM\n` : `\nEveryone came out even — no transfers needed!\n`
  transfers.forEach(t => {
    const toP = getPlayer(t.to)
    text += `  • ${dn(t.from)} pays ${dn(t.to)} $${Math.abs(t.amount).toFixed(2)}${toP?.venmo ? `  → venmo.com/${toP.venmo}` : ''}\n`
  })
  text += `\nPOINTS BY TABLE\n`
  tables.forEach(t => {
    text += `  ${t.label} (${t.handCount} hands): ` +
      Object.entries(t.totals).map(([pid, p]) => `${dn(pid)} ${pts(p)}`).join(', ') + '\n'
  })
  text += `\nGood game all — see you next time! 🍺\n\n${APP_URL}`

  return { subject, html, text }
}

// ── Screen ───────────────────────────────────────────────────────────────────
const sectionLabel = { fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }
const th = { padding: '6px 8px', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textAlign: 'right', whiteSpace: 'nowrap' }
const td = { padding: '7px 8px', fontSize: 14, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }
const tone = n => (n > 0 ? 'var(--success)' : n < 0 ? 'var(--danger)' : 'var(--text-muted)')

/** Every session started today (local date) with its hands, fresh from Supabase. */
async function loadTodaysTables() {
  if (!hasSupabase) {
    throw new Error('Combined Night reads both tables from the database, and this device is not connected to it.')
  }
  const from = new Date(); from.setHours(0, 0, 0, 0)
  const to   = new Date(from); to.setDate(to.getDate() + 1)
  const rows = await db.getSessionsStartedBetween(from.toISOString(), to.toISOString())
  return Promise.all(rows.map(async s => {
    const { hands, issues } = await db.getHandsBySession(s.id, s.players)
    return { ...s, hands, issues }
  }))
}

/**
 * Read-only view of every session started today, combined. Always reloads from
 * Supabase (never this device's copy) so both tables' latest hands are counted.
 */
export default function CombinedNight({ getPlayer, getDisplayName, endSession, onClose, loadTables = loadTodaysTables }) {
  const dn = getDisplayName ?? (pid => getPlayer(pid)?.firstName ?? pid)

  const [sessions,     setSessions]     = useState([])
  const [excluded,     setExcluded]     = useState(() => new Set())   // unchecked tables; new ones default to included
  const [status,       setStatus]       = useState('loading')         // loading | ready | error
  const [loadError,    setLoadError]    = useState(null)
  const [loadedAt,     setLoadedAt]     = useState(null)
  const [view,         setView]         = useState('totals')          // totals | settle
  const [confirming,   setConfirming]   = useState(false)
  const [finalizing,   setFinalizing]   = useState(false)
  const [finalizeErr,  setFinalizeErr]  = useState(null)
  const [justFinalized, setJustFinalized] = useState(false)

  const load = useCallback(async () => {
    setStatus(s => (s === 'ready' ? 'ready' : 'loading'))
    setLoadError(null)
    try {
      const loaded = await loadTables()
      setSessions(loaded.map((s, i) => ({ ...s, label: tableLabel(i, s) })))
      setLoadedAt(new Date())
      setStatus('ready')
    } catch (err) {
      console.error('[CombinedNight] load failed:', err)
      setLoadError(hasSupabase ? `Couldn't load tonight's tables: ${err?.message || err}` : err.message)
      setStatus('error')
    }
  }, [loadTables])

  useEffect(() => { load() }, [load])

  const included = sessions.filter(s => !excluded.has(s.id))
  const combined = combineSessions(included, dn)
  const { tables, players, night, nightSum, problems } = combined
  const ranked   = [...players].sort((a, b) => (night[b] ?? 0) - (night[a] ?? 0))
  const liveIncluded = tables.filter(t => t.active)
  const canSettle = included.length > 0 && problems.length === 0
  const notes = included.flatMap(s => (s.issues ?? []).map(msg => `${s.label}: ${msg}`))

  const toggle = (id) => setExcluded(prev => {
    const next = new Set(prev)
    next.has(id) ? next.delete(id) : next.add(id)
    return next
  })

  const finalizeAll = async () => {
    setFinalizing(true)
    setFinalizeErr(null)
    const done = []
    try {
      for (const t of liveIncluded) {
        await endSession(t.id)
        done.push(t.label)
      }
      setConfirming(false)
      setJustFinalized(true)
      await load()
    } catch (err) {
      setFinalizeErr(
        `${err?.message || err}` +
        (done.length ? ` Already finalized: ${done.join(', ')}.` : ' Nothing was finalized.') +
        ' No email was sent.')
    } finally {
      setFinalizing(false)
    }
  }

  const header = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
      <div style={{ flex: 1, minWidth: 180 }}>
        <h1 style={{ fontSize: 20, fontWeight: 800 }}>Combined Night</h1>
        <div style={{ color: 'var(--text-muted)', fontSize: 12, marginTop: 2 }}>
          {new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
          {loadedAt && ` · loaded ${loadedAt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit' })}`}
        </div>
      </div>
      <button className="btn btn-ghost btn-sm" onClick={load} disabled={status === 'loading'}>↻ Refresh</button>
      <button className="btn btn-ghost btn-sm" onClick={onClose}>← Back to Game</button>
    </div>
  )

  if (status === 'loading' || status === 'error') {
    return (
      <div style={{ maxWidth: 720, margin: '0 auto', padding: '24px 16px' }}>
        {header}
        <div style={{ textAlign: 'center', padding: '40px 0', color: status === 'error' ? 'var(--danger)' : 'var(--text-muted)', fontSize: 14 }}>
          {status === 'error' ? loadError : 'Loading tonight\'s tables…'}
        </div>
      </div>
    )
  }

  // ── Settle view ──
  if (view === 'settle') {
    return (
      <div style={{ maxWidth: 720, margin: '0 auto', padding: '24px 16px' }}>
        {header}
        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => { setView('totals'); setJustFinalized(false) }}>
            ← Table totals
          </button>
          {liveIncluded.length > 0 ? (
            <button className="btn btn-danger" style={{ flex: 1 }} disabled={!canSettle} onClick={() => setConfirming(true)}>
              Finalize Combined Night
            </button>
          ) : (
            <div style={{ flex: 1, alignSelf: 'center', textAlign: 'center', fontSize: 13, color: 'var(--success)', fontWeight: 700 }}>
              ✓ All {tables.length} tables finalized
            </div>
          )}
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 14 }}>
          Combining {tables.map(t => `${t.label} (${t.handCount} hands)`).join(' + ')}.
        </div>
        {!canSettle ? (
          <div style={{ color: 'var(--danger)', fontSize: 13 }}>Sanity checks failed — go back to the table totals.</div>
        ) : (
          <Settlement
            key={justFinalized ? 'finalized' : 'open'}
            players={ranked}
            totals={night}
            getPlayer={getPlayer}
            getDisplayName={getDisplayName}
            buildEmail={(transfers) => buildCombinedEmail({ tables, players: ranked, night, transfers, getPlayer, dn })}
            autoOpen={justFinalized}
          />
        )}

        {confirming && (
          <div className="modal-overlay" onClick={() => !finalizing && setConfirming(false)}>
            <div className="modal animate-slide-up" style={{ maxWidth: 400 }} onClick={e => e.stopPropagation()}>
              <div className="modal-header">
                <h2 style={{ fontSize: 16, fontWeight: 700 }}>Finalize Combined Night?</h2>
                <button className="btn btn-ghost btn-icon" disabled={finalizing} onClick={() => setConfirming(false)} style={{ fontSize: 18, lineHeight: 1 }}>✕</button>
              </div>
              <div className="modal-body" style={{ padding: '14px 20px', fontSize: 14, lineHeight: 1.6, color: 'var(--text-secondary)' }}>
                This locks {liveIncluded.length === 1 ? 'this table' : `all ${liveIncluded.length} live tables`}:
                <ul style={{ margin: '8px 0', paddingLeft: 18 }}>
                  {liveIncluded.map(t => <li key={t.id}>{t.label} — {t.handCount} hands</li>)}
                </ul>
                Any open game screens for these tables close. You can reopen a table later from Past Sessions.
                Next you'll be asked to send <strong>one</strong> combined summary email — don't also send per-table emails.
                {finalizeErr && (
                  <div style={{ marginTop: 10, color: 'var(--danger)', fontSize: 13 }}>{finalizeErr}</div>
                )}
              </div>
              <div className="modal-footer">
                <button className="btn btn-ghost" disabled={finalizing} onClick={() => setConfirming(false)}>Cancel</button>
                <button className="btn btn-danger" disabled={finalizing} onClick={finalizeAll}>
                  {finalizing ? 'Finalizing…' : 'Finalize'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    )
  }

  // ── Totals view ──
  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '24px 16px' }}>
      {header}

      {sessions.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)', fontSize: 14 }}>
          No game nights have been started today.
        </div>
      ) : (
        <>
          <div style={sectionLabel}>Tables started today</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 20 }}>
            {sessions.map(s => (
              <label key={s.id} style={{
                display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer',
                background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '10px 14px',
              }}>
                <input type="checkbox" checked={!excluded.has(s.id)} onChange={() => toggle(s.id)} style={{ width: 16, height: 16 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>{s.label} · {s.hands.length} hands</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {s.players.map(dn).join(', ')}
                  </div>
                </div>
                {s.active
                  ? <span className="badge badge-success">Live</span>
                  : <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Finalized</span>}
              </label>
            ))}
          </div>

          {tables.length > 0 && (
            <>
              <div style={sectionLabel}>Points by table</div>
              <div className="card" style={{ padding: 0, overflowX: 'auto', marginBottom: 16 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border)' }}>
                      <th style={{ ...th, textAlign: 'left' }}>Player</th>
                      {tables.map(t => <th key={t.id} style={th}>{t.label}</th>)}
                      <th style={{ ...th, color: 'var(--text-primary)' }}>Night</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ranked.map(pid => (
                      <tr key={pid} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ ...td, textAlign: 'left', fontWeight: 700 }}>{dn(pid)}</td>
                        {tables.map(t => (
                          <td key={t.id} style={{ ...td, color: pid in t.totals ? tone(t.totals[pid]) : 'var(--text-muted)' }}>
                            {pid in t.totals ? pts(t.totals[pid]) : '—'}
                          </td>
                        ))}
                        <td style={{ ...td, fontWeight: 800, color: tone(night[pid] ?? 0) }}>
                          {pts(night[pid] ?? 0)} <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)' }}>{money(night[pid] ?? 0)}</span>
                        </td>
                      </tr>
                    ))}
                    <tr>
                      <td style={{ ...td, textAlign: 'left', fontSize: 12, color: 'var(--text-muted)' }}>Sum</td>
                      {tables.map(t => (
                        <td key={t.id} style={{ ...td, fontSize: 12, color: 'var(--text-muted)' }}>
                          {pts(Object.values(t.totals).reduce((a, d) => a + d, 0) + t.unassigned)}
                        </td>
                      ))}
                      <td style={{ ...td, fontSize: 12, color: 'var(--text-muted)' }}>{pts(nightSum)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Sanity checks */}
              <div style={{
                borderRadius: 'var(--radius)', padding: '10px 14px', marginBottom: 16, fontSize: 13, lineHeight: 1.5,
                background: problems.length ? 'rgba(239,68,68,0.1)' : 'rgba(34,197,94,0.08)',
                border: `1px solid ${problems.length ? 'rgba(239,68,68,0.35)' : 'rgba(34,197,94,0.3)'}`,
              }}>
                {problems.length === 0 ? (
                  <span style={{ color: 'var(--success)', fontWeight: 700 }}>
                    ✓ Checks pass: every table sums to 0, the night sums to $0, and each player's night total equals their table totals.
                  </span>
                ) : (
                  <>
                    <div style={{ color: 'var(--danger)', fontWeight: 700, marginBottom: 4 }}>Can't settle — checks failed:</div>
                    <ul style={{ margin: 0, paddingLeft: 18 }}>{problems.map((p, i) => <li key={i}>{p}</li>)}</ul>
                  </>
                )}
              </div>

              {notes.length > 0 && (
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16 }}>
                  <div style={{ fontWeight: 700, marginBottom: 2 }}>Data notes</div>
                  <ul style={{ margin: 0, paddingLeft: 18 }}>{notes.map((n, i) => <li key={i}>{n}</li>)}</ul>
                </div>
              )}

              <button className="btn btn-primary" style={{ width: '100%' }} disabled={!canSettle} onClick={() => setView('settle')}>
                Settle Combined Night
              </button>
            </>
          )}
        </>
      )}
    </div>
  )
}
