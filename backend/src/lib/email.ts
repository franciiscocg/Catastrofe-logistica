import nodemailer from 'nodemailer'
import type { Transporter } from 'nodemailer'
import { EMAIL_VERIFICATION_REQUIRED } from './security.js'

type MailInput = {
  to: string
  subject: string
  text: string
  html: string
}

let transporter: Transporter | null = null

type MailTransportConfig = {
  host: string
  port: number
  secure: boolean
  user?: string
  pass?: string
}

function isProduction() {
  return process.env.NODE_ENV === 'production'
}

function getAppBaseUrl() {
  return (process.env.APP_PUBLIC_URL ?? process.env.FRONTEND_URL ?? 'http://localhost:5173').replace(/\/$/, '')
}

function getMailFrom() {
  return process.env.MAIL_FROM ?? 'Catástrofe Logística <no-reply@catlogistica.local>'
}

export function assertEmailConfigured() {
  if (!isProduction() || !EMAIL_VERIFICATION_REQUIRED) return

  const provider = process.env.EMAIL_PROVIDER?.toLowerCase()
  if (provider === 'resend' && !process.env.RESEND_API_KEY) {
    throw new Error('RESEND_API_KEY obligatorio en producción cuando EMAIL_PROVIDER=resend')
  }
  if (provider !== 'resend' && !process.env.SMTP_HOST) {
    throw new Error('SMTP_HOST obligatorio en producción para enviar emails')
  }
  if (!process.env.MAIL_FROM) {
    throw new Error('MAIL_FROM obligatorio en producción para enviar emails')
  }
  if (!process.env.APP_PUBLIC_URL && !process.env.FRONTEND_URL) {
    throw new Error('APP_PUBLIC_URL o FRONTEND_URL obligatorio para generar enlaces de email')
  }
}

function getTransportConfig(): MailTransportConfig | null {
  const host = process.env.SMTP_HOST
  if (!host) return null

  const port = Number(process.env.SMTP_PORT ?? 587)
  return {
    host,
    port,
    secure: process.env.SMTP_SECURE === 'true' || port === 465,
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  }
}

function getTransporter() {
  const config = getTransportConfig()
  if (!config) {
    if (isProduction()) console.info('[mail:disabled] Transporte de email no configurado')
    return null
  }

  if (transporter) return transporter

  transporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: config.user && config.pass ? { user: config.user, pass: config.pass } : undefined,
  })

  return transporter
}

async function sendMail(input: MailInput) {
  if (process.env.EMAIL_PROVIDER?.toLowerCase() === 'resend') {
    const apiKey = process.env.RESEND_API_KEY
    if (!apiKey) throw new Error('RESEND_API_KEY no configurado')

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: getMailFrom(),
        to: [input.to],
        subject: input.subject,
        text: input.text,
        html: input.html,
      }),
      signal: AbortSignal.timeout(15_000),
    })

    if (!response.ok) {
      const detail = await response.text()
      throw new Error(`Resend rechazo el email (${response.status}): ${detail.slice(0, 300)}`)
    }

    const result = await response.json() as { id?: string }
    return { sent: true, messageId: result.id }
  }

  const mailer = getTransporter()
  if (!mailer) {
    console.info(`[mail:dev] ${input.subject}`)
    console.info(`[mail:dev] Para: ${input.to}`)
    console.info(input.text)
    return { sent: false, preview: input.text }
  }

  const result = await mailer.sendMail({
    from: getMailFrom(),
    to: input.to,
    subject: input.subject,
    text: input.text,
    html: input.html,
  })

  return { sent: true, messageId: result.messageId }
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function actionTemplate(title: string, body: string, actionText: string, actionUrl: string) {
  const safeTitle = escapeHtml(title)
  const safeBody = escapeHtml(body)
  const safeActionText = escapeHtml(actionText)
  const safeActionUrl = escapeHtml(actionUrl)

  return `
    <div style="font-family:Arial,sans-serif;line-height:1.5;color:#111827;max-width:560px;margin:0 auto;padding:24px">
      <h1 style="font-size:22px;margin:0 0 12px">${safeTitle}</h1>
      <p style="font-size:15px;margin:0 0 20px;color:#374151">${safeBody}</p>
      <a href="${safeActionUrl}" style="display:inline-block;background:#2563eb;color:#fff;text-decoration:none;font-weight:700;padding:12px 18px;border-radius:8px">
        ${safeActionText}
      </a>
      <p style="font-size:12px;margin:20px 0 0;color:#6b7280">
        Si el boton no funciona, copia y pega este enlace en tu navegador:<br>
        <span style="word-break:break-all">${safeActionUrl}</span>
      </p>
    </div>
  `
}

export async function sendAccountVerificationEmail(input: { to: string; nombre: string; token: string }) {
  const url = `${getAppBaseUrl()}/auth/verify-account?token=${encodeURIComponent(input.token)}`
  const subject = 'Verifica tu cuenta de Catástrofe Logística'
  const body = `Hola ${input.nombre}, verifica tu cuenta para poder iniciar sesión en Catástrofe Logística.`

  return sendMail({
    to: input.to,
    subject,
    text: `${body}\n\nVerificar cuenta: ${url}`,
    html: actionTemplate(subject, body, 'Verificar cuenta', url),
  })
}

export async function sendPasswordResetEmail(input: { to: string; nombre: string; token: string }) {
  const url = `${getAppBaseUrl()}/auth/reset-password?token=${encodeURIComponent(input.token)}`
  const subject = 'Recupera tu contraseña de Catástrofe Logística'
  const body = `Hola ${input.nombre}, hemos recibido una solicitud para restablecer tu contraseña. Si no has sido tu, puedes ignorar este mensaje.`

  return sendMail({
    to: input.to,
    subject,
    text: `${body}\n\nRestablecer contraseña: ${url}`,
    html: actionTemplate(subject, body, 'Restablecer contraseña', url),
  })
}
