import { NextResponse, type NextRequest } from 'next/server';
import pdfParse from 'pdf-parse';
import { parseResumeWithAI } from '@job-bot/shared';
import { getAuthenticatedContext } from '@/lib/supabase/auth-guard';

export async function GET(request: NextRequest) {
  const ctx = await getAuthenticatedContext(request);
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data, error } = await ctx.supabase
    .from('resumes')
    .select('*')
    .eq('user_id', ctx.user.id)
    .order('updated_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ resumes: data ?? [] });
}

export async function POST(request: NextRequest) {
  const ctx = await getAuthenticatedContext(request);
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let title = 'Primary Resume';
  let rawText = '';

  const contentType = request.headers.get('content-type') ?? '';
  if (contentType.includes('multipart/form-data')) {
    const formData = await request.formData();
    const file = formData.get('file');
    const textField = formData.get('rawText');
    const titleField = formData.get('title');
    if (typeof titleField === 'string' && titleField.trim()) {
      title = titleField.trim();
    }
    if (file instanceof File) {
      const buffer = Buffer.from(await file.arrayBuffer());
      if (file.name.toLowerCase().endsWith('.pdf')) {
        const parsed = await pdfParse(buffer);
        rawText = parsed.text;
      } else {
        rawText = buffer.toString('utf-8');
      }
    } else if (typeof textField === 'string') {
      rawText = textField;
    }
  } else {
    const body = (await request.json()) as { title?: string; rawText?: string };
    if (body.title?.trim()) title = body.title.trim();
    rawText = body.rawText ?? '';
  }

  if (!rawText || rawText.trim().length < 50) {
    return NextResponse.json(
      { error: 'Please provide resume text or a readable PDF (at least 50 characters).' },
      { status: 400 },
    );
  }

  const parsedProfile = await parseResumeWithAI(rawText);

  await ctx.supabase
    .from('resumes')
    .update({ is_active: false })
    .eq('user_id', ctx.user.id);

  const { data, error } = await ctx.supabase
    .from('resumes')
    .insert({
      user_id: ctx.user.id,
      title,
      raw_text: rawText.trim(),
      parsed_profile: parsedProfile,
      is_active: true,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Sync preferred roles into agent_settings if default
  if (parsedProfile.preferredRoles.length > 0) {
    await ctx.supabase
      .from('agent_settings')
      .update({
        target_roles: parsedProfile.preferredRoles.slice(0, 6),
        target_locations: parsedProfile.preferredLocations.length
          ? parsedProfile.preferredLocations
          : ['Remote'],
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', ctx.user.id);
  }

  return NextResponse.json({ resume: data });
}
