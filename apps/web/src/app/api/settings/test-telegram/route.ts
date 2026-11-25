import { NextResponse, type NextRequest } from 'next/server';
import { getAuthenticatedContext } from '@/lib/supabase/auth-guard';

export async function POST(request: NextRequest) {
  const ctx = await getAuthenticatedContext(request);
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as { chatId?: string };
  const token = process.env.TELEGRAM_BOT_TOKEN;

  const { data: profile } = await ctx.supabase
    .from('profiles')
    .select('telegram_chat_id')
    .eq('id', ctx.user.id)
    .maybeSingle();

  const chatId = body.chatId?.trim() || profile?.telegram_chat_id || process.env.TELEGRAM_CHAT_ID;

  if (!token || !chatId) {
    return NextResponse.json(
      { error: 'TELEGRAM_BOT_TOKEN and a Telegram Chat ID are required.' },
      { status: 400 },
    );
  }

  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text: '✅ <b>JobPilot AI</b>: Telegram alerts are connected and working!',
      parse_mode: 'HTML',
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    return NextResponse.json({ error: `Telegram error ${res.status}: ${errText}` }, { status: 502 });
  }

  return NextResponse.json({ ok: true });
}
