import { useState, useEffect, useCallback } from 'react'
import { hasSupabase } from '../supabase'
import * as db from '../db'
import { buildPlayerText, smsUrl, smsPhone, venmoHandle, dollars, shortDate } from '../utils/textTable'
import Avatar from './Avatar'

// Which rows were already texted, per share link — survives the trip out to Messages
const sentKey = token => `shed:texted:${token}`
function loadSent(token) {
  try { return new Set(JSON.parse(sessionStorage.getItem(sentKey(token)) ?? '[]')) } catch { return new Set() }
}
function saveSent(token, set) {
  try { sessionStorage.setItem(sentKey(token), JSON.stringify([...set])) } catch {}
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text)
  } catch {
    const ta = document.createElement('textarea')
    ta.value = text
    document.body.appendChild(ta)
    ta.select()
    document.execCommand('copy')
    ta.remove()
  }
}

/** Inline "add phone" / "add venmo" editor that saves to the player record. */
function InlineAdd({ label, placeholder, inputMode, onSave }) {
  const [open,  setOpen]  = useState(false)
  const [value, setValue] = useState('')
  if (!open) {
    return (
      <button className="btn btn-ghost btn-sm" style={{ fontSize: 11, padding: '2px 8px', color: 'var(--warning)' }} onClick={() => setOpen(true)}>
        add {label}
      </button>
    )
  }
  const save = () => { if (value.trim()) { onSave(value.trim()); setOpen(false); setValue('') } }
  return (
    <span style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
      <input
        autoFocus value={value} placeholder={placeholder} inputMode={inputMode}
        onChange={e => setValue(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setOpen(false) }}
        style={{ width: 130, padding: '4px 8px', fontSize: 13, background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)' }}
      />
      <button className="btn btn-primary btn-sm" style={{ padding: '3px 8px' }} onClick={save}>Save</button>
      <button className="btn btn-ghost btn-sm" style={{ padding: '3px 6px' }} onClick={() => setOpen(false)}>✕</button>
    </span>
  )
}

/** The night's public stats link, created on first use. Shared with the email dialog. */
export function useNightShareLink(nightDate, sessionIds) {
  const [token,     setToken]     = useState(null)
  const [linkError, setLinkError] = useState(null)

  const idsKey = [...sessionIds].sort().join()
  const loadLink = useCallback(async () => {
    setLinkError(null)
    if (!hasSupabase) { setLinkError('The stats link needs the database, and this device is not connected to it.'); return }
    try {
      setToken(await db.getOrCreateNightShare(nightDate, sessionIds))
    } catch (err) {
      console.error('[NightShare] Could not create the stats link:', err)
      setLinkError(`Couldn't create the stats link: ${err?.message || err}`)
    }
  }, [nightDate, idsKey]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { loadLink() }, [loadLink])

  const statsUrl = token ? `${window.location.origin}/night/${token}` : null
  return { token, statsUrl, linkError, retry: loadLink }
}

/**
 * One row per player with their personal settlement text. "Text" opens the
 * phone's Messages app pre-filled for that player only; nothing is sent from here.
 */
export default function TextTable({ players, totals, transfers, getPlayer, getDisplayName, updatePlayer, nightDate, sessionIds, onClose }) {
  const dn = getDisplayName ?? (pid => getPlayer(pid)?.firstName ?? pid)

  const { token, statsUrl, linkError, retry: loadLink } = useNightShareLink(nightDate, sessionIds)
  const [sent,      setSent]      = useState(() => new Set())
  const [copied,    setCopied]    = useState(null)

  useEffect(() => { if (token) setSent(loadSent(token)) }, [token])

  const markSent = pid => setSent(prev => {
    const next = new Set(prev).add(pid)
    saveSent(token, next)
    return next
  })

  const rows = [...players].sort((a, b) => (totals[a] ?? 0) - (totals[b] ?? 0))

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal animate-slide-up" style={{ maxWidth: 480 }}>
        <div className="modal-header">
          <h2 style={{ fontSize: 16, fontWeight: 700 }}>Text the table · {shortDate(nightDate)}</h2>
          <button className="btn btn-ghost btn-icon" onClick={onClose} style={{ fontSize: 18, lineHeight: 1 }}>✕</button>
        </div>

        <div className="modal-body" style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {linkError ? (
            <div style={{ padding: '8px 12px', borderRadius: 'var(--radius-sm)', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', fontSize: 12, color: 'var(--danger)' }}>
              {linkError} <button className="btn btn-ghost btn-sm" onClick={loadLink}>Retry</button>
            </div>
          ) : !statsUrl ? (
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Creating the stats link…</div>
          ) : (
            <div style={{ fontSize: 12, color: 'var(--text-muted)', wordBreak: 'break-all' }}>Stats link: {statsUrl}</div>
          )}

          {rows.map(pid => {
            const p        = getPlayer(pid)
            const net      = totals[pid] ?? 0
            const phone    = smsPhone(p?.phone)
            const isPaid   = transfers.some(t => t.to === pid)
            const isSent   = sent.has(pid)
            const message  = statsUrl && buildPlayerText({ pid, net, transfers, nightDate, statsUrl, getPlayer, dn })
            return (
              <div key={pid} style={{
                display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
                padding: '10px 12px', borderRadius: 'var(--radius)',
                background: 'var(--bg-elevated)', border: `1px solid ${isSent ? 'rgba(34,197,94,0.35)' : 'var(--border)'}`,
                opacity: isSent ? 0.7 : 1,
              }}>
                <Avatar player={p} size={26} />
                <div style={{ flex: 1, minWidth: 110 }}>
                  <div style={{ fontWeight: 700 }}>{dn(pid)}</div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: net > 0 ? 'var(--success)' : net < 0 ? 'var(--danger)' : 'var(--text-muted)' }}>
                    {Math.abs(net) < 0.005 ? 'even' : `${net > 0 ? '+' : '-'}${dollars(net)}`}
                  </div>
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 2 }}>
                    {!phone && <InlineAdd label="phone" placeholder="Phone number" inputMode="tel" onSave={v => updatePlayer?.(pid, { phone: v })} />}
                    {isPaid && !venmoHandle(p?.venmo) && <InlineAdd label="venmo" placeholder="Venmo handle" onSave={v => updatePlayer?.(pid, { venmo: venmoHandle(v) })} />}
                  </div>
                </div>
                {isSent && <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--success)' }}>✓ sent</span>}
                <button
                  className="btn btn-ghost btn-sm" disabled={!message}
                  onClick={() => copyText(message).then(() => { markSent(pid); setCopied(pid); setTimeout(() => setCopied(c => (c === pid ? null : c)), 1500) })}
                >
                  {copied === pid ? 'Copied' : 'Copy'}
                </button>
                {phone && message ? (
                  <a className="btn btn-primary btn-sm" href={smsUrl(phone, message)} onClick={() => markSent(pid)}>Text</a>
                ) : (
                  <button className="btn btn-primary btn-sm" disabled title={phone ? 'Waiting for the stats link' : 'Add a phone number first'}>Text</button>
                )}
              </div>
            )
          })}
        </div>

        <div className="modal-footer">
          <span style={{ flex: 1, fontSize: 12, color: 'var(--text-muted)' }}>{sent.size} of {rows.length} texted</span>
          <button className="btn btn-ghost" onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  )
}
