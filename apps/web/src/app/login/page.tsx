'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export default function LoginPage() {
  const router = useRouter();
  const allowSignup = process.env.NEXT_PUBLIC_ALLOW_SIGNUP !== 'false';
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setMessage(null);

    const supabase = createClient();
    try {
      if (mode === 'signup') {
        const { error: signUpErr } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
        });
        if (signUpErr) throw signUpErr;
        setMessage('Account created! Check your email to confirm (or sign in if confirmation is disabled).');
      } else {
        const { error: signInErr } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (signInErr) throw signInErr;
        router.push('/');
        router.refresh();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  async function handleMagicLink() {
    if (!email.trim()) {
      setError('Enter your email address first.');
      return;
    }
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const { error: otpErr } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });
    setLoading(false);
    if (otpErr) setError(otpErr.message);
    else setMessage('Magic login link sent to your email!');
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-[var(--bg)]">
      <div className="w-full max-w-md rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-7 shadow-2xl">
        <div className="mb-6">
          <div className="inline-flex items-center justify-center h-10 w-10 rounded-xl bg-blue-600/20 border border-blue-500/40 text-blue-400 font-bold mb-3">
            JB
          </div>
          <h1 className="text-xl font-bold">JobPilot AI</h1>
          <p className="text-xs text-[var(--muted)] mt-1">
            Sign in to access your private job application agent & tracker.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-[var(--muted)] mb-1">Email</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg bg-[var(--bg)] border border-[var(--border)] px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
              placeholder="you@gmail.com"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-[var(--muted)] mb-1">Password</label>
            <input
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg bg-[var(--bg)] border border-[var(--border)] px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
              placeholder="••••••••"
            />
          </div>

          {error && (
            <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">
              {error}
            </div>
          )}
          {message && (
            <div className="text-xs text-emerald-300 bg-emerald-500/10 border border-emerald-500/30 rounded-lg px-3 py-2">
              {message}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 py-2.5 text-sm font-semibold text-white cursor-pointer"
          >
            {loading ? 'Working...' : mode === 'signin' ? 'Sign In' : 'Create Account'}
          </button>
        </form>

        <div className="mt-4 flex flex-col gap-2">
          <button
            type="button"
            onClick={handleMagicLink}
            disabled={loading}
            className="w-full rounded-lg border border-[var(--border)] hover:bg-[var(--surface-elevated)] py-2 text-xs font-medium text-[var(--muted)] cursor-pointer"
          >
            Send One-Time Magic Link
          </button>

          {allowSignup && (
            <button
              type="button"
              onClick={() => setMode(mode === 'signin' ? 'signup' : 'signin')}
              className="text-xs text-blue-400 hover:underline mt-2 cursor-pointer"
            >
              {mode === 'signin' ? 'Need an account? Sign up' : 'Already have an account? Sign in'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
