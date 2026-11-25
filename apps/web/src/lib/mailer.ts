import nodemailer from 'nodemailer';

export interface SendEmailInput {
  to: string;
  subject: string;
  text: string;
  senderName?: string;
  inReplyTo?: string | null;
  references?: string | null;
}

export async function sendEmailViaGmail(input: SendEmailInput): Promise<{ messageId: string }> {
  const gmailUser = process.env.GMAIL_USER;
  const gmailPass = process.env.GMAIL_APP_PASSWORD;

  if (gmailUser && gmailPass) {
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: gmailUser,
        pass: gmailPass,
      },
    });

    const displayName = input.senderName || process.env.SENDER_NAME || gmailUser;
    const info = await transporter.sendMail({
      from: `"${displayName}" <${gmailUser}>`,
      to: input.to,
      subject: input.subject,
      text: input.text,
      ...(input.inReplyTo ? { inReplyTo: input.inReplyTo } : {}),
      ...(input.references ? { references: input.references } : {}),
    });

    return { messageId: info.messageId };
  }

  const brevoKey = process.env.BREVO_API_KEY;
  const brevoSender = process.env.BREVO_SENDER_EMAIL;
  if (brevoKey && brevoSender) {
    const headers: Record<string, string> = {};
    if (input.inReplyTo) headers['In-Reply-To'] = input.inReplyTo;
    if (input.references) headers['References'] = input.references;

    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'api-key': brevoKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        sender: { name: input.senderName || process.env.SENDER_NAME || 'Job Applicant', email: brevoSender },
        to: [{ email: input.to }],
        subject: input.subject,
        textContent: input.text,
        ...(Object.keys(headers).length ? { headers } : {}),
      }),
    });

    const data = (await res.json()) as { messageId?: string; message?: string };
    if (!res.ok) {
      throw new Error(`Brevo error ${res.status}: ${data.message || JSON.stringify(data)}`);
    }
    return { messageId: data.messageId || `brevo-${Date.now()}` };
  }

  throw new Error('Configure GMAIL_USER + GMAIL_APP_PASSWORD or BREVO_API_KEY + BREVO_SENDER_EMAIL.');
}
