import { Injectable, ServiceUnavailableException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { buildInviteEmail } from './invite-email.template'

/** Use a verified @zyta.app mailbox (Resend). Custom local-parts may not deliver. */
const DEFAULT_FROM_ADDRESS = 'Casamiento Vanesa y Augusto <aspastrana@zyta.app>'
const DEFAULT_PUBLIC_BASE_URL = 'https://casamiento-vanesa-augusto.vercel.app'

export type SendInvitationEmailInput = {
  to: string
  guestName: string
  link: string
}

@Injectable()
export class CommsService {
  constructor(private readonly config: ConfigService) {}

  getPublicBaseUrl(): string {
    const raw = this.config.get<string>('INVITE_PUBLIC_BASE_URL')?.trim()
    return raw || DEFAULT_PUBLIC_BASE_URL
  }

  getFromAddress(): string {
    const raw = this.config.get<string>('INVITE_FROM_ADDRESS')?.trim()
    return raw || DEFAULT_FROM_ADDRESS
  }

  buildPublicLink(token: string): string {
    const base = this.getPublicBaseUrl().replace(/\/+$/, '')
    return `${base}/i/${token}`
  }

  isConfigured(): boolean {
    const baseUrl = this.config.get<string>('ZYTA_COMMS_BASE_URL')?.trim()
    const apiKey = this.config.get<string>('ZYTA_COMMS_API_KEY')?.trim()
    return !!(baseUrl && apiKey)
  }

  async sendInvitationEmail(input: SendInvitationEmailInput): Promise<void> {
    const baseUrl = this.config.get<string>('ZYTA_COMMS_BASE_URL')?.trim()
    const apiKey = this.config.get<string>('ZYTA_COMMS_API_KEY')?.trim()

    if (!baseUrl || !apiKey) {
      throw new ServiceUnavailableException(
        'Email service is not configured. Set ZYTA_COMMS_BASE_URL and ZYTA_COMMS_API_KEY.',
      )
    }

    const { subject, text, html } = buildInviteEmail(input.guestName, input.link)
    const url = `${baseUrl.replace(/\/+$/, '')}/v1/messages/send`

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        channel: 'email',
        to: input.to,
        subject,
        text,
        html,
        fromAddress: this.getFromAddress(),
      }),
    })

    if (!res.ok) {
      let detail = `HTTP ${res.status}`
      try {
        const body = (await res.json()) as { message?: unknown }
        if (body?.message) detail = String(body.message)
      } catch {
        const textBody = await res.text().catch(() => '')
        if (textBody) detail = textBody.slice(0, 200)
      }
      throw new ServiceUnavailableException(`Failed to send email: ${detail}`)
    }
  }
}
