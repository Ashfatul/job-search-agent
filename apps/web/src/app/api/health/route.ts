import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({
    ok: true,
    service: 'job-search-bot-web',
    timestamp: new Date().toISOString(),
  });
}
