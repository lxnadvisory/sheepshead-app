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
