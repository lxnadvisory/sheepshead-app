import { Resend } from 'resend'

// ESM on purpose: package.json has "type": "module", so a CommonJS file here
// crashes on load (FUNCTION_INVOCATION_FAILED) before the handler ever runs.

// Until a domain is verified in Resend, onboarding@resend.dev can only deliver
// to the Resend account owner's own address. Set RESEND_FROM in Vercel to e.g.
// "The Shed <shed@yourdomain>" once the domain is verified.
const FROM     = process.env.RESEND_FROM || 'The Shed <onboarding@resend.dev>'
const REPLY_TO = 'jaleckson@gmail.com'
const MAX_MESSAGES = 15
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const sleep = ms => new Promise(r => setTimeout(r, ms))

/**
 * POST { messages: [{ id, to, subject, html, text }] }
 * One email per message, sent one at a time (Resend's default limit is 2/sec).
 * 200 { results: [{ id, to, ok, emailId?, error? }] } — per-message outcome.
 */
export default async function handler(req, res) {
  console.log('[send-summary] hit — method:', req.method, '| from:', FROM)

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const messages = req.body?.messages
  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'No messages to send.' })
  }
  if (messages.length > MAX_MESSAGES) {
    return res.status(400).json({ error: `Too many messages (${messages.length}); the limit is ${MAX_MESSAGES}.` })
  }

  if (!process.env.RESEND_API_KEY) {
    console.error('[send-summary] RESEND_API_KEY is not set')
    return res.status(500).json({ error: 'RESEND_API_KEY is not set in this Vercel environment.' })
  }

  const resend  = new Resend(process.env.RESEND_API_KEY)
  const results = []

  for (const [i, m] of messages.entries()) {
    const base = { id: m?.id ?? null, to: m?.to ?? null }
    if (typeof m?.to !== 'string' || !EMAIL_RE.test(m.to) || !m.subject || !m.html || !m.text) {
      results.push({ ...base, ok: false, error: 'Missing or invalid to / subject / html / text.' })
      continue
    }
    if (i > 0) await sleep(600)
    try {
      const { data, error } = await resend.emails.send({
        from: FROM, to: [m.to], replyTo: REPLY_TO, subject: m.subject, html: m.html, text: m.text,
      })
      if (error) {
        console.error(`[send-summary] Resend rejected ${m.to}:`, error)
        results.push({ ...base, ok: false, error: error.message ?? error.name ?? 'Resend rejected the email.' })
      } else {
        console.log(`[send-summary] sent ${m.to} — id: ${data?.id}`)
        results.push({ ...base, ok: true, emailId: data?.id ?? null })
      }
    } catch (err) {
      console.error(`[send-summary] error sending ${m.to}:`, err)
      results.push({ ...base, ok: false, error: err?.message ?? 'Unexpected server error.' })
    }
  }

  console.log(`[send-summary] done — ${results.filter(r => r.ok).length}/${results.length} sent`)
  return res.status(200).json({ results })
}
