import nodemailer, { type Transporter } from 'nodemailer'
import { config } from '../config/env.js'
import { logger } from '../config/logger.js'

// Outgoing mail. MAIL_DRIVER=smtp sends through SMTP_*; MAIL_DRIVER=log writes the mail to the log
// (development without a mail server: the invite link shows up in the console).

export interface Mail {
  to: string
  subject: string
  text: string
  html?: string
}

export interface Mailer {
  send(mail: Mail): Promise<void>
}

class SmtpMailer implements Mailer {
  private readonly transport: Transporter
  constructor() {
    const { host, port, secure, user, password } = config.mail.smtp
    this.transport = nodemailer.createTransport({ host, port, secure, auth: user ? { user, pass: password } : undefined })
  }
  async send(mail: Mail): Promise<void> {
    await this.transport.sendMail({ from: config.mail.from, ...mail })
  }
}

class LogMailer implements Mailer {
  async send(mail: Mail): Promise<void> {
    logger.info(`[mail] to ${mail.to}: ${mail.subject}\n${mail.text}`)
  }
}

/** keeps sent mail in memory (tests read `sent`) */
export class MemoryMailer implements Mailer {
  readonly sent: Mail[] = []
  async send(mail: Mail): Promise<void> {
    this.sent.push(mail)
  }
}

let mailer: Mailer | null = null

export function getMailer(): Mailer {
  mailer ??= config.mail.driver === 'smtp' ? new SmtpMailer() : new LogMailer()
  return mailer
}

export const setMailer = (next: Mailer | null) => {
  mailer = next
}
