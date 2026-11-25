import { NextResponse, type NextRequest } from 'next/server';
import { RECOMMENDED_DEFAULT_SOURCES, type SourceType } from '@job-bot/shared';
import { getAuthenticatedContext } from '@/lib/supabase/auth-guard';

export async function GET(request: NextRequest) {
  const ctx = await getAuthenticatedContext(request);
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const [profileRes, settingsRes, sourcesRes] = await Promise.all([
    ctx.supabase.from('profiles').select('*').eq('id', ctx.user.id).single(),
    ctx.supabase.from('agent_settings').select('*').eq('user_id', ctx.user.id).single(),
    ctx.supabase.from('job_sources').select('*').eq('user_id', ctx.user.id).order('created_at', { ascending: true }),
  ]);

  return NextResponse.json({
    profile: profileRes.data,
    settings: settingsRes.data,
    sources: sourcesRes.data ?? [],
    user: {
      email: ctx.user.email ?? '',
      role: ctx.role,
    },
  });
}

export async function PUT(request: NextRequest) {
  const ctx = await getAuthenticatedContext(request);
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = (await request.json()) as {
    profile?: {
      full_name?: string;
      telegram_chat_id?: string;
      summary_email?: string;
    };
    settings?: {
      cron_schedule?: string;
      target_roles?: string[];
      target_locations?: string[];
      remote_only?: boolean;
      min_match_score?: number;
      auto_send_enabled?: boolean;
      auto_send_min_score?: number;
      daily_email_cap?: number;
      followup_delays_days?: number[];
      telegram_enabled?: boolean;
      summary_email_enabled?: boolean;
      is_paused?: boolean;
    };
    addSource?: {
      name: string;
      source_type: SourceType;
      config: Record<string, unknown>;
    };
    toggleSource?: {
      id: string;
      enabled: boolean;
    };
    toggleAllSources?: boolean;
    deleteSourceId?: string;
    seedRecommendedSources?: boolean;
  };

  const formatDbError = (msg: string) => {
    if (msg.includes('job_sources_source_type_check')) {
      return 'Your Supabase job_sources table needs migration 003_more_sources.sql! Run supabase/migrations/003_more_sources.sql in Supabase SQL Editor, then click + Enable again.';
    }
    return msg;
  };

  if (body.profile) {
    const { error } = await ctx.supabase
      .from('profiles')
      .update({
        ...body.profile,
        updated_at: new Date().toISOString(),
      })
      .eq('id', ctx.user.id);
    if (error) return NextResponse.json({ error: formatDbError(error.message) }, { status: 400 });
  }

  if (body.settings) {
    const { error } = await ctx.supabase
      .from('agent_settings')
      .upsert(
        {
          user_id: ctx.user.id,
          ...body.settings,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' },
      );
    if (error) return NextResponse.json({ error: formatDbError(error.message) }, { status: 400 });
  }

  if (body.addSource) {
    const { error } = await ctx.supabase.from('job_sources').insert({
      user_id: ctx.user.id,
      name: body.addSource.name,
      source_type: body.addSource.source_type,
      config: body.addSource.config,
      enabled: true,
    });
    if (error) return NextResponse.json({ error: formatDbError(error.message) }, { status: 400 });
  }

  if (body.toggleSource) {
    const { error } = await ctx.supabase
      .from('job_sources')
      .update({ enabled: body.toggleSource.enabled })
      .eq('id', body.toggleSource.id)
      .eq('user_id', ctx.user.id);
    if (error) return NextResponse.json({ error: formatDbError(error.message) }, { status: 400 });
  }

  if (typeof body.toggleAllSources === 'boolean') {
    const { error } = await ctx.supabase
      .from('job_sources')
      .update({ enabled: body.toggleAllSources })
      .eq('user_id', ctx.user.id);
    if (error) return NextResponse.json({ error: formatDbError(error.message) }, { status: 400 });
  }

  if (body.deleteSourceId) {
    const { error } = await ctx.supabase
      .from('job_sources')
      .delete()
      .eq('id', body.deleteSourceId)
      .eq('user_id', ctx.user.id);
    if (error) return NextResponse.json({ error: formatDbError(error.message) }, { status: 400 });
  }

  if (body.seedRecommendedSources) {
    const { data: existing, error: readErr } = await ctx.supabase
      .from('job_sources')
      .select('source_type')
      .eq('user_id', ctx.user.id);
    if (readErr) return NextResponse.json({ error: formatDbError(readErr.message) }, { status: 400 });

    const existingTypes = new Set((existing ?? []).map((r) => r.source_type));
    const missing = RECOMMENDED_DEFAULT_SOURCES.filter((s) => !existingTypes.has(s.source_type)).map(
      (s) => ({
        user_id: ctx.user.id,
        name: s.name,
        source_type: s.source_type,
        config: s.config,
        enabled: true,
      }),
    );
    if (missing.length > 0) {
      const { error } = await ctx.supabase.from('job_sources').insert(missing);
      if (error) return NextResponse.json({ error: formatDbError(error.message) }, { status: 400 });
    }
  }

  return NextResponse.json({ ok: true });
}
