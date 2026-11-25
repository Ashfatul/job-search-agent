import type { AgentRunMetrics } from '@job-bot/shared';
import { sendGmailMessage } from '../mailer/outreach-sender.js';

export function buildSummaryEmailHtml(metrics: AgentRunMetrics, dryRun: boolean, dashboardUrl?: string): string {
  const topRows = metrics.topMatches
    .slice(0, 8)
    .map(
      (m) =>
        `<tr>
          <td style="padding:8px;border-bottom:1px solid #e2e8f0;"><strong>${m.matchScore}%</strong></td>
          <td style="padding:8px;border-bottom:1px solid #e2e8f0;">${m.title}</td>
          <td style="padding:8px;border-bottom:1px solid #e2e8f0;">${m.company}</td>
          <td style="padding:8px;border-bottom:1px solid #e2e8f0;"><a href="${m.applyUrl}">View Post</a></td>
        </tr>`,
    )
    .join('');

  return `
  <div style="font-family:Arial,sans-serif;max-width:640px;margin:0 auto;color:#0f172a;">
    <h2>${dryRun ? '[DRY RUN] ' : ''}JobPilot AI — Daily / Run Summary</h2>
    <ul>
      <li><strong>Jobs Found:</strong> ${metrics.jobsFound}</li>
      <li><strong>Matched Jobs:</strong> ${metrics.jobsMatched}</li>
      <li><strong>Human Emails Drafted:</strong> ${metrics.emailsDrafted}</li>
      <li><strong>Applications Sent:</strong> ${metrics.emailsSent}</li>
      <li><strong>Follow-ups Sent:</strong> ${metrics.followupsSent}</li>
      <li><strong>Employees Reached:</strong> ${metrics.employeesReached}</li>
    </ul>
    ${
      metrics.topMatches.length > 0
        ? `<h3>Top Matches</h3>
           <table style="width:100%;border-collapse:collapse;font-size:13px;">
             <thead>
               <tr style="text-align:left;background:#f8fafc;">
                 <th style="padding:8px;">Match</th>
                 <th style="padding:8px;">Role</th>
                 <th style="padding:8px;">Company</th>
                 <th style="padding:8px;">Link</th>
               </tr>
             </thead>
             <tbody>${topRows}</tbody>
           </table>`
        : '<p>No new high-match jobs in this run.</p>'
    }
    ${dashboardUrl ? `<p style="margin-top:20px;"><a href="${dashboardUrl}">Open Dashboard</a></p>` : ''}
  </div>`;
}

export async function sendSummaryEmail(params: {
  toEmail?: string | null;
  metrics: AgentRunMetrics;
  dryRun: boolean;
  dashboardUrl?: string;
}): Promise<boolean> {
  const to = params.toEmail || process.env.GMAIL_USER || process.env.BREVO_SENDER_EMAIL;
  if (!to) return false;

  const subject = `${params.dryRun ? '[DRY RUN] ' : ''}JobPilot Summary: ${params.metrics.jobsMatched} matched, ${params.metrics.emailsSent} applied, ${params.metrics.employeesReached} reached`;
  const html = buildSummaryEmailHtml(params.metrics, params.dryRun, params.dashboardUrl);
  const text = `Jobs Found: ${params.metrics.jobsFound}\nMatched: ${params.metrics.jobsMatched}\nDrafted: ${params.metrics.emailsDrafted}\nApplied: ${params.metrics.emailsSent}\nFollow-ups: ${params.metrics.followupsSent}\nEmployees Reached: ${params.metrics.employeesReached}`;

  // Prefer Brevo Free API if configured, else use Gmail SMTP
  const brevoKey = process.env.BREVO_API_KEY;
  const brevoSender = process.env.BREVO_SENDER_EMAIL || process.env.GMAIL_USER;
  if (brevoKey && brevoSender) {
    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'api-key': brevoKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        sender: { name: 'JobPilot AI', email: brevoSender },
        to: [{ email: to }],
        subject,
        htmlContent: html,
        textContent: text,
      }),
    });
    if (res.ok) return true;
  }

  if (process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD) {
    await sendGmailMessage({ to, subject, text, html, senderName: 'JobPilot AI Summary' });
    return true;
  }

  return false;
}
