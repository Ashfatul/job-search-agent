import dotenv from 'dotenv';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import http from 'node:http';
import cron from 'node-cron';
import { createClient } from '@supabase/supabase-js';
import { runAgentForUser } from './agent/job-agent.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
for (const candidate of [
  path.resolve(process.cwd(), '.env'),
  path.resolve(process.cwd(), '../../.env'),
  path.resolve(__dirname, '../../../.env'),
]) {
  if (fs.existsSync(candidate)) {
    dotenv.config({ path: candidate, override: false });
  }
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceKey, {
  auth: { persistSession: false },
});

async function runAllActiveUsers(trigger: 'cron' | 'manual') {
  const { data: settingsRows, error } = await supabase
    .from('agent_settings')
    .select('user_id, is_paused')
    .eq('is_paused', false);

  if (error) {
    console.error('[worker] Failed to query agent_settings:', error.message);
    return [];
  }

  const results = [];
  for (const row of settingsRows ?? []) {
    try {
      const metrics = await runAgentForUser({
        supabase,
        userId: row.user_id,
        trigger,
      });
      console.log(`[worker] Completed run for ${row.user_id}:`, metrics);
      results.push({ userId: row.user_id, ok: true, metrics });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[worker] Error for ${row.user_id}:`, msg);
      results.push({ userId: row.user_id, ok: false, error: msg });
    }
  }
  return results;
}

if (process.argv.includes('--once')) {
  runAllActiveUsers('manual')
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
} else {
  const schedule = process.env.DEFAULT_CRON_SCHEDULE || '0 */6 * * *';
  console.log(`[worker] Scheduling autonomous agent runs with cron: ${schedule}`);

  // Clean up any stale running rows left behind by an unclean restart
  const staleCutoff = new Date(Date.now() - 15 * 60_000).toISOString();
  void supabase
    .from('agent_runs')
    .update({
      status: 'failed',
      finished_at: new Date().toISOString(),
      error_message: 'Worker restarted before previous run completed',
      log_summary: {
        stage: 'failed',
        message: 'Worker restarted before previous run completed',
        progress: 100,
      },
    })
    .eq('status', 'running')
    .lt('started_at', staleCutoff);

  cron.schedule(schedule, () => {
    void runAllActiveUsers('cron');
  });

  // Lightweight hourly keep-alive query prevents Supabase Free Tier 7-day inactivity pause
  cron.schedule('15 * * * *', async () => {
    await supabase.from('profiles').select('id').limit(1);
  });

  const port = Number(process.env.WORKER_PORT || '4001');
  const server = http.createServer(async (req, res) => {
    res.setHeader('Content-Type', 'application/json');

    if (req.method === 'GET' && req.url === '/health') {
      res.writeHead(200);
      res.end(
        JSON.stringify({
          ok: true,
          service: 'job-search-bot-worker',
          dryRun: process.env.DRY_RUN === 'true',
          cronSchedule: schedule,
        }),
      );
      return;
    }

    if (req.method === 'POST' && req.url === '/run') {
      const secret = process.env.WORKER_SECRET;
      if (secret && req.headers['x-worker-secret'] !== secret) {
        res.writeHead(401);
        res.end(JSON.stringify({ error: 'Unauthorized worker secret' }));
        return;
      }

      let rawBody = '';
      for await (const chunk of req) rawBody += chunk;
      let userId: string | undefined;
      try {
        userId = rawBody ? (JSON.parse(rawBody) as { userId?: string }).userId : undefined;
      } catch {
        // Run all active users if no JSON body
      }

      if (userId) {
        runAgentForUser({ supabase, userId, trigger: 'manual' }).catch((e) =>
          console.error('[worker] Manual run failed:', e),
        );
      } else {
        runAllActiveUsers('manual').catch((e) => console.error('[worker] Manual run failed:', e));
      }

      res.writeHead(202);
      res.end(JSON.stringify({ accepted: true, message: 'Agent run started in background' }));
      return;
    }

    res.writeHead(404);
    res.end(JSON.stringify({ error: 'Not found' }));
  });

  server.listen(port, () => {
    console.log(`[worker] Control server listening on port ${port}`);
  });
}
