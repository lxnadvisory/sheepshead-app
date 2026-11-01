import { useEffect, useState } from 'react'
import { hasSupabase } from '../supabase'
import * as db from '../db'
import { combineSessions, tableLabel } from '../utils/combined'
import { settleDebts, getTierLabel } from '../utils/scoring'
import { getDisplayName as computeDisplayName, getFullName } from '../utils/displayName'
import { nightLabel } from '../lib/analytics'
import { dollars } from '../utils/textTable'

// Public, read-only page for one night, reached by /night/<token> without the
// PIN. Shows only what the link names: no navigation, no edit controls.

const sectionLabel = { fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '20px 0 8px' }
const box  = { background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)' }
const tone = n => (n > 0 ? 'var(--success)' : n < 0 ? 'var(--danger)' : 'var(--text-muted)')
const pts  = n => `${n > 0 ? '+' : ''}${Math.round(n * 100) / 100}`

function handSummary(h, dn) {
  if (h.handType === 'fup') return `F-Up · ${dn(h.offenderId)}${h.note ? ` — "${h.note}"` : ''}`
  const who = h.isLoner || !h.partner ? `${dn(h.picker)} alone` : `${dn(h.picker)} + ${dn(h.partner)}`
  return `${who} · ${getTierLabel(h)}${h.pickerPoints != null ? ` (${h.pickerPoints})` : ''}`
}

function TableHands({ table, session, dn }) {
  return (
    <details style={{ ...box, marginBottom: 8 }}>
      <summary style={{ padding: '10px 14px', cursor: 'pointer', fontWeight: 700, fontSize: 14 }}>
        {table.label} · {session.hands.length} hands
        <div style={{ fontSize: 12, fontWeight: 400, color: 'var(--text-muted)', marginTop: 2 }}>{session.players.map(dn).join(', ')}</div>
      </summary>
      <div style={{ borderTop: '1px solid var(--border)' }}>
        {session.hands.map(h => (
          <div key={h.id} style={{ padding: '8px 14px', borderBottom: '1px solid var(--border)', fontSize: 13 }}>
            <div style={{ fontWeight: 600 }}>
              <span style={{ color: 'var(--text-muted)', marginRight: 6 }}>#{h.handNumber}</span>{handSummary(h, dn)}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2px 12px', marginTop: 3, fontSize: 12 }}>
              {session.players.map(pid => {
                const d = h.scores?.[pid] ?? 0
                return <span key={pid} style={{ color: tone(d) }}>{dn(pid)} {d === 0 ? '—' : pts(d)}</span>
              })}
            </div>
          </div>
        ))}
        <div style={{ padding: '8px 14px', fontSize: 12, display: 'flex', flexWrap: 'wrap', gap: '2px 12px' }}>
          <span style={{ fontWeight: 700, color: 'var(--text-muted)' }}>Table total</span>
          {Object.entries(table.totals).map(([pid, t]) => <span key={pid} style={{ color: tone(t), fontWeight: 700 }}>{dn(pid)} {pts(t)}</span>)}
        </div>
      </div>
    </details>
  )
}

export default function NightSharePage({ token }) {
  const [data,   setData]   = useState(null)
  const [status, setStatus] = useState('loading')   // loading | ready | missing | error
  const [error,  setError]  = useState(null)

  useEffect(() => {
    if (!hasSupabase) { setStatus('error'); setError('Not connected to the database.'); return }
    db.getNightShare(token)
      .then(d => { setData(d); setStatus(d ? 'ready' : 'missing') })
      .catch(err => { console.error('[NightShare] load failed:', err); setError(err?.message || String(err)); setStatus('error') })
  }, [token])

  useEffect(() => {
    if (data) document.title = `The Shed · ${nightLabel(data.nightDate, { long: true })}`
  }, [data])

  const wrap = children => (
    <div style={{ maxWidth: 640, margin: '0 auto', padding: '24px 16px 48px', minHeight: '100vh', background: 'var(--bg-base)' }}>
      <div style={{ textAlign: 'center', marginBottom: 8 }}>
        <div style={{ fontWeight: 900, fontSize: 22, letterSpacing: '0.08em' }}>THE SHED</div>
        {data && <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 2 }}>{nightLabel(data.nightDate, { long: true })}</div>}
      </div>
      {children}
    </div>
  )

  if (status !== 'ready') {
    return wrap(
      <div style={{ textAlign: 'center', padding: '40px 0', color: status === 'error' ? 'var(--danger)' : 'var(--text-muted)', fontSize: 14 }}>
        {status === 'loading' ? 'Loading…' : status === 'missing' ? 'This link doesn\'t match any game night.' : `Couldn't load this night: ${error}`}
      </div>
    )
  }

  // Full name when two of tonight's players would otherwise read the same
  const short = new Map(data.players.map(p => [p.id, computeDisplayName(data.players, p.id)]))
  const dn = pid => {
    const p = data.players.find(x => x.id === pid)
    const clash = [...short].some(([id, n]) => id !== pid && n === short.get(pid))
    return clash && p ? getFullName(p) : (short.get(pid) ?? pid)
  }
  const sessions  = data.sessions.map((s, i) => ({ ...s, label: data.sessions.length > 1 ? tableLabel(i, s) : 'Hands' }))
  const { tables, players, night } = combineSessions(sessions, dn)
  const ranked    = [...players].sort((a, b) => (night[b] ?? 0) - (night[a] ?? 0))
  const transfers = settleDebts({ ...night })
  const handCount = sessions.reduce((a, s) => a + s.hands.length, 0)

  return wrap(
    <>
      <div style={{ textAlign: 'center', fontSize: 12, color: 'var(--text-muted)' }}>
        {tables.length > 1 ? `${tables.length} tables · ` : ''}{handCount} hands
      </div>

      <div style={sectionLabel}>Standings</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {ranked.map((pid, i) => (
          <div key={pid} style={{ ...box, display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px' }}>
            <span style={{ width: 22, color: 'var(--text-muted)', fontSize: 12, fontWeight: 700 }}>#{i + 1}</span>
            <span style={{ flex: 1, fontWeight: 700 }}>{dn(pid)}</span>
            <span style={{ fontWeight: 800, color: tone(night[pid] ?? 0) }}>
              {(night[pid] ?? 0) > 0 ? '+' : (night[pid] ?? 0) < 0 ? '-' : ''}{dollars(night[pid] ?? 0)}
            </span>
          </div>
        ))}
      </div>

      <div style={sectionLabel}>Settlement</div>
      <div style={{ ...box, padding: '4px 0' }}>
        {transfers.length === 0 ? (
          <div style={{ padding: '10px 14px', color: 'var(--text-muted)', fontSize: 13 }}>Everyone came out even.</div>
        ) : transfers.map((t, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', fontSize: 14 }}>
            <span style={{ fontWeight: 700, color: 'var(--danger)' }}>{dn(t.from)}</span>
            <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>pays</span>
            <span style={{ fontWeight: 700, color: 'var(--success)' }}>{dn(t.to)}</span>
            <span style={{ marginLeft: 'auto', fontWeight: 800 }}>{dollars(t.amount)}</span>
          </div>
        ))}
      </div>

      <div style={sectionLabel}>Hand history</div>
      {tables.map((t, i) => <TableHands key={t.id} table={t} session={sessions[i]} dn={dn} />)}
    </>
  )
}
