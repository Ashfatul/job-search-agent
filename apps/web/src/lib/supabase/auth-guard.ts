import { createClient as createSupabaseJsClient, type SupabaseClient, type User } from '@supabase/supabase-js';
import { NextResponse, type NextRequest } from 'next/server';
import { createClient as createServerCookieClient } from './server';

export function isEmailAuthorized(email?: string | null): boolean {
  const allowlistRaw = process.env.ALLOWED_USER_EMAILS?.trim();
  if (!allowlistRaw) return true;
  if (!email) return false;
  const allowed = allowlistRaw
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
  return allowed.includes(email.toLowerCase());
}

/**
 * Authenticates requests from either:
 * 1. Next.js browser session cookies (Web Dashboard)
 * 2. Authorization: Bearer <supabase_access_token> (Chrome Extension)
 */
export async function getAuthenticatedContext(request?: NextRequest): Promise<{
  supabase: SupabaseClient;
  user: User;
  role: 'owner' | 'user';
} | null> {
  const authHeader = request?.headers.get('authorization');
  const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;

  let supabase: SupabaseClient;
  let user: User | null = null;

  if (bearerToken) {
    supabase = createSupabaseJsClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        global: {
          headers: { Authorization: `Bearer ${bearerToken}` },
        },
      },
    );
    const { data, error } = await supabase.auth.getUser(bearerToken);
    if (!error && data.user) {
      user = data.user;
    }
  } else {
    supabase = await createServerCookieClient();
    const { data, error } = await supabase.auth.getUser();
    if (!error && data.user) {
      user = data.user;
    }
  }

  if (!user || !isEmailAuthorized(user.email)) {
    return null;
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();

  const role = profile?.role === 'owner' ? 'owner' : 'user';
  return { supabase, user, role };
}

export function withCors(response: NextResponse): NextResponse {
  response.headers.set('Access-Control-Allow-Origin', '*');
  response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PATCH, PUT, OPTIONS');
  response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  return response;
}
