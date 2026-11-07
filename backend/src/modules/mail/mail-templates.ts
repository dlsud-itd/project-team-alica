import type { TicketConfirmationDetails } from './mail.interfaces.js';

function baseEmailWrapper(title: string, contentHtml: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f4f6f8; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1e293b;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color: #f4f6f8; padding: 32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width: 580px; background-color: #ffffff; border-radius: 8px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
          <!-- Header -->
          <tr>
            <td style="padding: 24px 32px; background-color: #0f172a; text-align: left;">
              <h1 style="margin: 0; font-size: 20px; font-weight: 700; color: #ffffff; letter-spacing: 0.5px;">CHECKPOINT</h1>
              <p style="margin: 4px 0 0; font-size: 13px; color: #94a3b8;">Event Management & Attendance Verification</p>
            </td>
          </tr>
          <!-- Body Content -->
          <tr>
            <td style="padding: 32px;">
              ${contentHtml}
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding: 20px 32px; background-color: #f8fafc; border-top: 1px solid #e2e8f0; text-align: center;">
              <p style="margin: 0; font-size: 12px; color: #64748b; line-height: 1.5;">
                This is an automated notification from Checkpoint. Please do not reply directly to this email.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export function getWelcomeEmailTemplate(fullName: string): { html: string; text: string } {
  const text = `Welcome to Checkpoint, ${fullName}!\n\nYour account has been successfully created. You can now browse campus events, register for sessions, and access your event tickets seamlessly.\n\nBest regards,\nThe Checkpoint Team`;

  const html = baseEmailWrapper(
    'Welcome to Checkpoint',
    `
    <h2 style="margin: 0 0 16px; font-size: 20px; font-weight: 600; color: #0f172a;">Welcome to Checkpoint, ${fullName}</h2>
    <p style="margin: 0 0 16px; font-size: 14px; line-height: 1.6; color: #334155;">
      Your account is now active. You have full access to explore upcoming campus events, RSVP for sessions, and view digital tickets directly from your dashboard.
    </p>
    <div style="background-color: #f1f5f9; border: 1px solid #e2e8f0; border-radius: 6px; padding: 16px; margin: 24px 0;">
      <p style="margin: 0; font-size: 13px; line-height: 1.5; color: #475569;">
        <strong>Quick Tip:</strong> Keep your student or attendee credentials updated in your profile to ensure rapid check-in at all campus checkpoints.
      </p>
    </div>
    <p style="margin: 24px 0 0; font-size: 14px; color: #475569;">
      Sincerely,<br>
      <strong style="color: #0f172a;">The Checkpoint Team</strong>
    </p>
    `,
  );

  return { html, text };
}

export function getTicketConfirmationEmailTemplate(details: TicketConfirmationDetails): { html: string; text: string } {
  const text = `Event Registration Confirmation\n\nHello ${details.attendeeName},\n\nYou are confirmed for "${details.eventTitle}".\nTicket Code: ${details.ticketCode}\nVenue: ${details.venueName}\nDate & Time: ${details.startDate}\n\nPlease present this ticket code or your digital pass upon arrival.\n\nBest regards,\nThe Checkpoint Team`;

  const html = baseEmailWrapper(
    `Registration Confirmed: ${details.eventTitle}`,
    `
    <h2 style="margin: 0 0 12px; font-size: 20px; font-weight: 600; color: #0f172a;">Registration Confirmed</h2>
    <p style="margin: 0 0 24px; font-size: 14px; line-height: 1.6; color: #334155;">
      Hello <strong>${details.attendeeName}</strong>, your spot for <strong>${details.eventTitle}</strong> is locked in.
    </p>

    <!-- Ticket Summary Card -->
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color: #f8fafc; border: 1px solid #cbd5e1; border-radius: 8px; margin: 0 0 24px;">
      <tr>
        <td style="padding: 20px;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
            <tr>
              <td style="padding-bottom: 12px; border-bottom: 1px solid #e2e8f0;">
                <span style="font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; color: #64748b; font-weight: 600;">Event</span>
                <div style="font-size: 16px; font-weight: 600; color: #0f172a; margin-top: 2px;">${details.eventTitle}</div>
              </td>
            </tr>
            <tr>
              <td style="padding: 12px 0; border-bottom: 1px solid #e2e8f0;">
                <span style="font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; color: #64748b; font-weight: 600;">Venue</span>
                <div style="font-size: 14px; color: #1e293b; margin-top: 2px;">${details.venueName}</div>
              </td>
            </tr>
            <tr>
              <td style="padding: 12px 0; border-bottom: 1px solid #e2e8f0;">
                <span style="font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; color: #64748b; font-weight: 600;">Date & Time</span>
                <div style="font-size: 14px; color: #1e293b; margin-top: 2px;">${details.startDate}</div>
              </td>
            </tr>
            <tr>
              <td style="padding-top: 16px; text-align: center;">
                <span style="font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; color: #64748b; font-weight: 600;">Your Checkpoint Ticket Code</span>
                <div style="display: inline-block; background-color: #0f172a; color: #ffffff; font-size: 18px; font-weight: 700; letter-spacing: 2px; padding: 10px 24px; border-radius: 6px; margin-top: 8px; font-family: monospace;">
                  ${details.ticketCode}
                </div>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>

    <p style="margin: 0; font-size: 13px; line-height: 1.5; color: #64748b;">
      Present this ticket code or display your QR code from the attendee portal at the entry scanner checkpoint.
    </p>
    `,
  );

  return { html, text };
}

export function getTestEmailTemplate(recipient: string, sentAt: string): { html: string; text: string } {
  const text = `Checkpoint SMTP Test Email\n\nRecipient: ${recipient}\nSent At: ${sentAt}\n\nYour modular email service is properly configured and successfully transmitting messages.`;

  const html = baseEmailWrapper(
    'Checkpoint SMTP Test Email',
    `
    <h2 style="margin: 0 0 12px; font-size: 20px; font-weight: 600; color: #0f172a;">SMTP Configuration Test</h2>
    <p style="margin: 0 0 16px; font-size: 14px; line-height: 1.6; color: #334155;">
      Congratulations! Your modular SMTP mailer has successfully delivered this test message.
    </p>

    <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 16px; margin: 20px 0;">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="font-size: 13px; color: #334155;">
        <tr>
          <td style="padding: 4px 0; font-weight: 600; width: 100px;">Recipient:</td>
          <td style="padding: 4px 0;">${recipient}</td>
        </tr>
        <tr>
          <td style="padding: 4px 0; font-weight: 600;">Timestamp:</td>
          <td style="padding: 4px 0;">${sentAt}</td>
        </tr>
        <tr>
          <td style="padding: 4px 0; font-weight: 600;">Status:</td>
          <td style="padding: 4px 0; color: #166534; font-weight: 600;">Connected & Operational</td>
        </tr>
      </table>
    </div>

    <p style="margin: 0; font-size: 13px; color: #64748b; line-height: 1.5;">
      You can now use this email service across authentication, attendee RSVPs, and organizer notification workflows.
    </p>
    `,
  );

  return { html, text };
}

