import type { AgentRunMetrics } from '@job-bot/shared';

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export function formatTelegramReport(params: {
  metrics: AgentRunMetrics;
  dryRun: boolean;
  dashboardUrl?: string;
}): string {
  const { metrics, dryRun, dashboardUrl } = params;
  const prefix = dryRun ? '🧪 [DRY RUN] ' : '🤖 ';
  const lines = [
    `${prefix}<b>JobPilot AI Run Summary</b>`,
    `• Found / Scanned: <b>${metrics.jobsFound}</b>`,
    `• Matched Resume: <b>${metrics.jobsMatched}</b>`,
    `• Emails Drafted: <b>${metrics.emailsDrafted}</b>`,
    `• Applied (Emails Sent): <b>${metrics.emailsSent}</b>`,
    `• Follow-ups Sent: <b>${metrics.followupsSent}</b>`,
    `• Employees Reached: <b>${metrics.employeesReached}</b>`,
  ];

  if (metrics.topMatches.length > 0) {
    lines.push('', '<b>Top Matched Roles:</b>');
    for (const m of metrics.topMatches.slice(0, 5)) {
      lines.push(
        `• ${m.matchScore}% — <b>${escapeHtml(m.title)}</b> @ ${escapeHtml(m.company)}\n  ${escapeHtml(m.applyUrl)}`,
      );
    }
  }

  if (metrics.errors.length > 0) {
    const shortErrs = metrics.errors
      .slice(0, 3)
      .map((e) => escapeHtml(e.slice(0, 140)))
      .join('\n• ');
    lines.push('', `⚠️ <b>Notes/Errors (${metrics.errors.length}):</b>\n• ${shortErrs}`);
  }

  if (dashboardUrl) {
    lines.push('', `Dashboard: ${escapeHtml(dashboardUrl)}`);
  }

  return lines.join('\n').slice(0, 4000);
}

export async function sendTelegramSummary(params: {
  chatId?: string | null;
  metrics: AgentRunMetrics;
  dryRun: boolean;
  dashboardUrl?: string;
}): Promise<boolean> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = params.chatId || process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return false;

  const text = formatTelegramReport({
    metrics: params.metrics,
    dryRun: params.dryRun,
    dashboardUrl: params.dashboardUrl,
  });

  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Telegram API error ${res.status}: ${errText}`);
  }
  return true;
}
