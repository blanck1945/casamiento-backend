export type InviteEmailContent = {
  subject: string
  text: string
  html: string
}

export function buildInviteEmail(guestName: string, link: string): InviteEmailContent {
  const subject = 'Invitación al casamiento de Vanesa y Augusto'
  const text = [
    `Hola ${guestName},`,
    '',
    'Te invitamos a celebrar nuestro casamiento.',
    '',
    `Confirmá tu asistencia en este link personalizado:`,
    link,
    '',
    '¡Te esperamos!',
    'Vanesa y Augusto',
  ].join('\n')

  const html = `<!DOCTYPE html>
<html lang="es">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f5f4f0;font-family:Georgia,'Times New Roman',serif;color:#1a1a2e;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f4f0;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#fff;border:1px solid #e4e3df;border-radius:8px;padding:32px 28px;">
        <tr><td style="text-align:center;padding-bottom:8px;">
          <p style="margin:0;font-size:13px;letter-spacing:0.12em;text-transform:uppercase;color:#7a7d8a;">Casamiento</p>
          <h1 style="margin:8px 0 0;font-size:26px;font-weight:600;color:#1a1a2e;">Vanesa &amp; Augusto</h1>
        </td></tr>
        <tr><td style="padding:24px 0 8px;font-size:16px;line-height:1.6;">
          <p style="margin:0 0 16px;">Hola <strong>${escapeHtml(guestName)}</strong>,</p>
          <p style="margin:0 0 16px;">Te invitamos a celebrar nuestro casamiento. Confirmá tu asistencia con el botón de abajo — es tu link personalizado.</p>
        </td></tr>
        <tr><td align="center" style="padding:8px 0 24px;">
          <a href="${escapeHtml(link)}" style="display:inline-block;background:#4361ee;color:#fff;text-decoration:none;font-size:15px;font-weight:600;padding:12px 28px;border-radius:6px;">Ver invitación y confirmar</a>
        </td></tr>
        <tr><td style="font-size:13px;color:#7a7d8a;line-height:1.5;border-top:1px solid #e4e3df;padding-top:20px;">
          <p style="margin:0;">Si el botón no funciona, copiá este link en el navegador:</p>
          <p style="margin:8px 0 0;word-break:break-all;"><a href="${escapeHtml(link)}" style="color:#4361ee;">${escapeHtml(link)}</a></p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`

  return { subject, text, html }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
