/**
 * "Text the table": one short settlement text per player, sent by hand from
 * the phone's Messages app. Points are dollars (1 pt = $1).
 */

const cents = n => Math.round(Math.abs(n) * 100) / 100

/** $18 or $18.50 */
export const dollars = n => {
  const c = cents(n)
  return `$${Number.isInteger(c) ? c : c.toFixed(2)}`
}

/** '2026-10-22' → '10/22' */
export function shortDate(nightDate) {
  const [, m, d] = nightDate.split('-').map(Number)
  return `${m}/${d}`
}

export const venmoHandle = v => (v ?? '').trim().replace(/^@/, '')

export function venmoPayUrl(handle, amount, md) {
  return `https://venmo.com/?txn=pay&recipients=${encodeURIComponent(handle)}` +
    `&amount=${cents(amount).toFixed(2)}&note=${encodeURIComponent(`Shed ${md}`)}`
}

export const smsPhone = phone => (phone ?? '').replace(/[^\d+]/g, '')

export function smsUrl(phone, body) {
  return `sms:${smsPhone(phone)}?body=${encodeURIComponent(body)}`
}

const joinNames = items =>
  items.length <= 1 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`

/** transfers: settleDebts() output for the same totals */
export function buildPlayerText({ pid, net, transfers, nightDate, statsUrl, getPlayer, dn }) {
  const md     = shortDate(nightDate)
  const head   = `Shed ${md}:`
  const paying = transfers.filter(t => t.from === pid)
  const paidBy = transfers.filter(t => t.to === pid)

  let lines
  if (paying.length) {
    lines = [
      `${head} you're down ${dollars(net)}. Pay ${joinNames(paying.map(t => `${dn(t.to)} ${dollars(t.amount)}`))}:`,
      ...paying.map(t => {
        const handle = venmoHandle(getPlayer(t.to)?.venmo)
        return handle ? venmoPayUrl(handle, t.amount, md) : `pay ${dn(t.to)} directly`
      }),
    ]
  } else if (paidBy.length) {
    lines = [`${head} you're up ${dollars(net)}. ${joinNames(paidBy.map(t => `${dn(t.from)} (${dollars(t.amount)})`))} will Venmo you.`]
  } else {
    lines = [`${head} you broke even.`]
  }
  return [...lines, '', `Stats: ${statsUrl}`].join('\n')
}

// ── Email version (same content as the text) ─────────────────────────────────

const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))

/** { subject, html, text } for one player. Same inputs as buildPlayerText, plus an optional teaser line and allTimeUrl. */
export function buildPlayerEmail(args) {
  const { pid, net, transfers, nightDate, statsUrl, getPlayer, dn, teaser, allTimeUrl } = args
  const md     = shortDate(nightDate)
  const paying = transfers.filter(t => t.from === pid)
  const paidBy = transfers.filter(t => t.to === pid)

  const result  = paying.length ? `you're down ${dollars(net)}` : paidBy.length ? `you're up ${dollars(net)}` : 'you broke even'
  const subject = `Shed ${md}: ${result}`

  const row = inner => `<tr><td style="padding:6px 0;font-size:15px;color:#1f2937;">${inner}</td></tr>`
  let detail = ''
  if (paying.length) {
    detail = row('Pay:') + paying.map(t => {
      const handle = venmoHandle(getPlayer(t.to)?.venmo)
      const action = handle
        ? `<a href="${esc(venmoPayUrl(handle, t.amount, md))}" style="display:inline-block;margin-left:8px;padding:5px 12px;background:#008cff;color:#ffffff;text-decoration:none;border-radius:6px;font-size:13px;font-weight:600;">Venmo ${esc(dn(t.to))}</a>`
        : `<span style="margin-left:8px;color:#6b7280;font-size:13px;">pay ${esc(dn(t.to))} directly</span>`
      return row(`<strong>${esc(dn(t.to))}</strong> ${dollars(t.amount)}${action}`)
    }).join('')
  } else if (paidBy.length) {
    detail = row('Coming your way on Venmo:') +
      paidBy.map(t => row(`<strong>${esc(dn(t.from))}</strong> ${dollars(t.amount)}`)).join('')
  }

  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="max-width:480px;margin:0 auto;padding:24px 16px;">
    <div style="background:#ffffff;border:1px solid #e5e7eb;border-radius:10px;padding:20px 22px;">
      <div style="font-size:12px;font-weight:700;letter-spacing:0.08em;color:#6b7280;text-transform:uppercase;">The Shed · ${md}</div>
      <div style="margin-top:6px;font-size:22px;font-weight:800;color:${paying.length ? '#dc2626' : paidBy.length ? '#16a34a' : '#374151'};">${esc(result.charAt(0).toUpperCase() + result.slice(1))}</div>
      ${detail ? `<table style="margin-top:12px;border-collapse:collapse;">${detail}</table>` : ''}
      ${teaser ? `<div style="margin-top:14px;font-size:14px;color:#374151;">${esc(teaser)}</div>` : ''}
      <div style="margin-top:18px;padding-top:14px;border-top:1px solid #e5e7eb;">
        <a href="${esc(statsUrl)}" style="color:#4f46e5;font-size:14px;font-weight:600;text-decoration:none;">See your night: picks, partners & stats →</a>
        ${allTimeUrl ? `<div style="margin-top:10px;"><a href="${esc(allTimeUrl)}" style="color:#4f46e5;font-size:14px;font-weight:600;text-decoration:none;">Your all-time stats →</a></div>` : ''}
      </div>
    </div>
  </div>
</body></html>`

  let text = buildPlayerText(args)
  if (allTimeUrl) text += `\nAll-time: ${allTimeUrl}`
  return { subject, html, text: teaser ? text.replace('\n\nStats: ', `\n\n${teaser}\n\nStats: `) : text }
}
