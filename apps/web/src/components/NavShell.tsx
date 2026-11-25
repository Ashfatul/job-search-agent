'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  Activity,
  Briefcase,
  FileText,
  LogOut,
  Settings,
  ShieldCheck,
  Sparkles,
  Workflow,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';

interface NavShellProps {
  userEmail: string;
  role: string;
  children: React.ReactNode;
}

const NAV_ITEMS = [
  { href: '/', label: 'Control & Workflow', icon: Workflow },
  { href: '/tracker', label: 'Job Pipeline', icon: Briefcase },
  { href: '/resume', label: 'Resume & Profile', icon: FileText },
  { href: '/settings', label: 'Settings & Sources', icon: Settings },
];

export function NavShell({ userEmail, role, children }: NavShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [workerState, setWorkerState] = useState<{
    checked: boolean;
    online: boolean;
    dryRun: boolean;
    isPaused: boolean;
  }>({ checked: false, online: false, dryRun: true, isPaused: false });

  useEffect(() => {
    let active = true;
    async function pollHealth() {
      try {
        const res = await fetch('/api/worker/status', { cache: 'no-store' });
        if (!res.ok) return;
        const data = (await res.json()) as {
          online: boolean;
          dryRun: boolean;
          isPaused: boolean;
        };
        if (active) {
          setWorkerState({
            checked: true,
            online: Boolean(data.online),
            dryRun: Boolean(data.dryRun),
            isPaused: Boolean(data.isPaused),
          });
        }
      } catch {
        if (active) setWorkerState((prev) => ({ ...prev, checked: true, online: false }));
      }
    }
    void pollHealth();
    const timer = setInterval(pollHealth, 15000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  }

  const initial = (userEmail[0] ?? 'U').toUpperCase();

  return (
    <div className="min-h-screen flex flex-col md:flex-row">
      <aside className="w-full md:w-64 shrink-0 border-b md:border-b-0 md:border-r border-zinc-800/80 bg-zinc-950/85 backdrop-blur-xl flex flex-col justify-between p-4">
        <div className="space-y-6">
          <div className="flex items-center gap-3 px-2 pt-1">
            <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-indigo-500 to-cyan-500 flex items-center justify-center text-white shadow-md shadow-indigo-950/60">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <div className="font-bold text-sm tracking-tight text-zinc-100">JobPilot AI</div>
              <div className="text-[11px] text-zinc-400">Manual-Control OS</div>
            </div>
          </div>

          <nav className="flex md:flex-col gap-1 overflow-x-auto pb-1 md:pb-0">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const active = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    'flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-medium transition-all whitespace-nowrap border',
                    active
                      ? 'bg-indigo-500/15 text-indigo-200 border-indigo-500/30 shadow-sm'
                      : 'border-transparent text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900/80',
                  )}
                >
                  <Icon className={cn('w-4 h-4 shrink-0', active ? 'text-indigo-400' : 'text-zinc-500')} />
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="hidden md:block rounded-2xl border border-zinc-800/90 bg-zinc-900/50 p-3.5 space-y-2.5 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-zinc-400 flex items-center gap-1.5 text-[11px]">
                <Activity className="w-3.5 h-3.5 text-zinc-500" /> VPS Worker
              </span>
              {!workerState.checked ? (
                <span className="text-[11px] text-zinc-500">Checking...</span>
              ) : workerState.online ? (
                <Badge variant="emerald" className="py-0 px-2 text-[10px]">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  Online
                </Badge>
              ) : (
                <Badge variant="amber" className="py-0 px-2 text-[10px]">
                  <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
                  Offline
                </Badge>
              )}
            </div>

            <div className="flex items-center justify-between text-[11px]">
              <span className="text-zinc-500">Scheduler</span>
              <span className={workerState.isPaused ? 'text-amber-300' : 'text-zinc-200'}>
                {workerState.isPaused ? 'Paused' : 'Active'}
              </span>
            </div>

            <div className="flex items-center justify-between text-[11px]">
              <span className="text-zinc-500">Outreach</span>
              <span className="text-emerald-300 font-medium">Manual Only</span>
            </div>

            {workerState.dryRun && (
              <div className="rounded-lg bg-amber-500/10 border border-amber-500/25 text-amber-300 px-2.5 py-1 text-[10px] font-medium text-center">
                DRY_RUN Active (Safe Mode)
              </div>
            )}
          </div>
        </div>

        <div className="hidden md:flex flex-col gap-3 pt-4 border-t border-zinc-800/80">
          <div className="flex items-center gap-2.5 px-1">
            <div className="h-8 w-8 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center text-xs font-bold text-zinc-200 shrink-0">
              {initial}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1 text-[10px] text-emerald-400 font-semibold uppercase tracking-wider">
                <ShieldCheck className="w-3 h-3" />
                {role}
              </div>
              <div className="text-xs text-zinc-400 truncate" title={userEmail}>
                {userEmail}
              </div>
            </div>
          </div>
          <button
            onClick={handleSignOut}
            className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium text-zinc-400 hover:text-red-300 hover:bg-red-500/10 transition-colors cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            Sign Out
          </button>
        </div>
      </aside>

      <main className="flex-1 p-4 md:p-8 max-w-[1440px] w-full mx-auto">{children}</main>
    </div>
  );
}
