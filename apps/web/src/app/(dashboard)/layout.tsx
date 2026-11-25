import { redirect } from 'next/navigation';
import { getAuthenticatedContext } from '@/lib/supabase/auth-guard';
import { NavShell } from '@/components/NavShell';

export const dynamic = 'force-dynamic';

export default async function DashboardGroupLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const ctx = await getAuthenticatedContext();
  if (!ctx) redirect('/login');

  return (
    <NavShell userEmail={ctx.user.email ?? ''} role={ctx.role}>
      {children}
    </NavShell>
  );
}
