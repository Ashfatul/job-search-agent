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
  Workflow,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

interface NavShellProps {
  userEmail: string;
  role: string;
  children: React.ReactNode;
}

const NAV_ITEMS = [
  { href: '/', label: 'Control & Workflow', icon: Workflow },
  { href: '/tracker', label: 'Pipeline & Tracker', icon: Briefcase },
  { href: '/resume', label: 'Resume & Profile', icon: FileText },
  { href: '/settings', label: 'Sources & Rules', icon: Settings },
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

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-[var(--bg)] text-[var(--text)]">
      <aside className="w-full md:w-64 shrink-0 border-b md:border-b-0 md:border-r border-[var(--border)] bg-[var(--surface)] flex flex-col justify-between p-4">
        <div>
          <div className="flex items-center justify-between px-2 py-2 mb-5">
            <div className="flex items-center gap-2.5">
              <div className="h-9 w-9 rounded-lg bg-blue-600/20 border border-blue-500/40 flex items-center justify-center text-blue-400 font-bold">
                JB
              </div>
              <div>
                <div className="font-semibold text-sm leading-tight">JobPilot AI</div>
                <div className="text-[11px] text-[var(--muted)]">Manual-Control Workflow</div>
              </div>
            </div>
          </div>

          <nav className="flex md:flex-col gap-1 overflow-x-auto pb-2 md:pb-0">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const active = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                    active
                      ? 'bg-[var(--accent-soft)] text-blue-400 border border-blue-500/30'
                      : 'text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--surface-elevated)]'
                  }`}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="hidden md:block mt-6 rounded-xl border border-[var(--border)] bg-[var(--bg)] p-3 space-y-2 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-[var(--muted)] flex items-center gap-1.5">
                <Activity className="w-3.5 h-3.5" /> Worker
              </span>
              {!workerState.checked ? (
                <span className="text-[var(--muted)]">Checking...</span>
              ) : workerState.online ? (
                <span className="inline-flex items-center gap-1.5 text-emerald-400 font-semibold">
                  <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                  Online
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 text-amber-400 font-semibold">
                  <span className="h-2 w-2 rounded-full bg-amber-400" />
                  Offline
                </span>
              )}
            </div>

            <div className="flex items-center justify-between text-[11px] text-[var(--muted)]">
              <span>Scheduler</span>
              <span className={workerState.isPaused ? 'text-amber-300' : 'text-slate-300'}>
                {workerState.isPaused ? 'Paused' : 'Active'}
              </span>
            </div>

            <div className="flex items-center justify-between text-[11px] text-[var(--muted)]">
              <span>Outreach Policy</span>
              <span className="text-emerald-300">Manual Only</span>
            </div>

            {workerState.dryRun && (
              <div className="text-[10px] rounded bg-amber-500/15 border border-amber-500/30 text-amber-300 px-2 py-1 text-center font-medium">
                DRY_RUN=true (Safe Test Mode)
              </div>
            )}
          </div>
        </div>

        <div className="hidden md:flex flex-col gap-3 pt-4 border-t border-[var(--border)]">
          <div className="px-2">
            <div className="flex items-center gap-1.5 text-xs text-emerald-400 mb-1">
              <ShieldCheck className="w-3.5 h-3.5" />
              <span className="uppercase tracking-wide font-semibold">{role}</span>
            </div>
            <div className="text-xs text-[var(--muted)] truncate" title={userEmail}>
              {userEmail}
            </div>
          </div>
          <button
            onClick={handleSignOut}
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium text-[var(--muted)] hover:text-red-400 hover:bg-red-500/10 transition-colors cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
            Sign Out
          </button>
        </div>
      </aside>

      <main className="flex-1 p-4 md:p-7 max-w-[1440px] w-full mx-auto">{children}</main>
    </div>
  );
}
