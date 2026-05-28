import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { to, subject, html } = req.body ?? {}

  if (!to?.length || !subject || !html) {
    return res.status(400).json({ error: 'Missing required fields: to, subject, html' })
  }

  try {
    const data = await resend.emails.send({
      from: 'The Shed <onboarding@resend.dev>',
      to: ['jaleckson@gmail.com'],
      bcc: to,
      reply_to: 'jaleckson@gmail.com',
      subject,
      html,
    })
    return res.status(200).json({ id: data.id })
  } catch (err) {
    console.error('Resend error:', err)
    return res.status(500).json({ error: err.message ?? 'Failed to send email' })
  }
}
