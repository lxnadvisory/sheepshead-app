const { Resend } = require('resend')

module.exports = async function handler(req, res) {
  console.log('[send-summary] hit — method:', req.method, '| body keys:', Object.keys(req.body ?? {}))

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { to, subject, html } = req.body ?? {}

  if (!to?.length || !subject || !html) {
    return res.status(400).json({ error: 'Missing required fields: to, subject, html' })
  }

  if (!process.env.RESEND_API_KEY) {
    console.error('[send-summary] RESEND_API_KEY is not set')
    return res.status(500).json({ error: 'RESEND_API_KEY not configured on server' })
  }

  const resend = new Resend(process.env.RESEND_API_KEY)

  try {
    const { data, error } = await resend.emails.send({
      from: 'The Shed <onboarding@resend.dev>',
      to: ['jaleckson@gmail.com'],
      bcc: to,
      reply_to: 'jaleckson@gmail.com',
      subject,
      html,
    })

    if (error) {
      console.error('[send-summary] Resend API error:', error)
      return res.status(500).json({ error: error.message ?? 'Resend rejected the request' })
    }

    console.log('[send-summary] sent OK — id:', data?.id)
    return res.status(200).json({ id: data?.id })
  } catch (err) {
    console.error('[send-summary] unexpected error:', err)
    return res.status(500).json({ error: err.message ?? 'Unexpected server error' })
  }
}
