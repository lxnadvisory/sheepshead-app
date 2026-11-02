import { Resend } from 'resend'
import nodemailer from 'nodemailer'

// ESM on purpose: package.json has "type": "module", so a CommonJS file here
// crashes on load (FUNCTION_INVOCATION_FAILED) before the handler ever runs.

// Sends through Gmail when GMAIL_APP_PASSWORD is set in Vercel (a Google app
// password for GMAIL_USER). Otherwise falls back to Resend, where
// onboarding@resend.dev only delivers to the Resend account owner.
const GMAIL_USER     = process.env.GMAIL_USER || 'jaleckson@gmail.com'
const GMAIL_PASSWORD = process.env.GMAIL_APP_PASSWORD?.replace(/\s+/g, '')   // Google shows it in groups of 4
const RESEND_FROM    = process.env.RESEND_FROM || 'The Shed <onboarding@resend.dev>'
const REPLY_TO       = 'jaleckson@gmail.com'
const MAX_MESSAGES   = 15
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const sleep = ms => new Promise(r => setTimeout(r, ms))

/** One send function per provider: (message) → { id } or throws. */
function gmailSender() {
  const transport = nodemailer.createTransport({ service: 'gmail', auth: { user: GMAIL_USER, pass: GMAIL_PASSWORD } })
  return {
    name: 'gmail', from: `"The Shed" <${GMAIL_USER}>`, gapMs: 250,
    async send(m) {
      try {
        const info = await transport.sendMail({ from: this.from, to: m.to, replyTo: REPLY_TO, subject: m.subject, html: m.html, text: m.text })
        return { id: info.messageId }
      } catch (err) {
        if (err?.code === 'EAUTH') {
          throw new Error(`Gmail rejected the login for ${GMAIL_USER}. Check GMAIL_APP_PASSWORD in Vercel is a current app password (not your normal password).`)
        }
        throw err
      }
    },
  }
}

function resendSender() {
  const resend = new Resend(process.env.RESEND_API_KEY)
  return {
    name: 'resend', from: RESEND_FROM, gapMs: 600,   // Resend's default limit is 2/sec
    async send(m) {
      const { data, error } = await resend.emails.send({
        from: this.from, to: [m.to], replyTo: REPLY_TO, subject: m.subject, html: m.html, text: m.text,
      })
      if (error) throw new Error(error.message ?? error.name ?? 'Resend rejected the email.')
      return { id: data?.id }
    },
  }
}

/**
 * POST { messages: [{ id, to, subject, html, text }] }
 * One email per message, sent one at a time.
 * 200 { results: [{ id, to, ok, emailId?, error? }] } — per-message outcome.
 */
export default async function handler(req, res) {
  const provider = GMAIL_PASSWORD ? 'gmail' : 'resend'
  console.log('[send-summary] hit — method:', req.method, '| via:', provider, '| from:', provider === 'gmail' ? GMAIL_USER : RESEND_FROM)

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

  if (provider === 'resend' && !process.env.RESEND_API_KEY) {
    console.error('[send-summary] Neither GMAIL_APP_PASSWORD nor RESEND_API_KEY is set')
    return res.status(500).json({ error: 'No email account is set up: add GMAIL_APP_PASSWORD in this Vercel environment.' })
  }

  const sender  = provider === 'gmail' ? gmailSender() : resendSender()
  const results = []

  for (const [i, m] of messages.entries()) {
    const base = { id: m?.id ?? null, to: m?.to ?? null }
    if (typeof m?.to !== 'string' || !EMAIL_RE.test(m.to) || !m.subject || !m.html || !m.text) {
      results.push({ ...base, ok: false, error: 'Missing or invalid to / subject / html / text.' })
      continue
    }
    if (i > 0) await sleep(sender.gapMs)
    try {
      const { id } = await sender.send(m)
      console.log(`[send-summary] sent ${m.to} — id: ${id}`)
      results.push({ ...base, ok: true, emailId: id ?? null })
    } catch (err) {
      console.error(`[send-summary] ${sender.name} rejected ${m.to}:`, err)
      results.push({ ...base, ok: false, error: err?.message ?? 'Unexpected server error.' })
    }
  }

  console.log(`[send-summary] done — ${results.filter(r => r.ok).length}/${results.length} sent`)
  return res.status(200).json({ results })
}
