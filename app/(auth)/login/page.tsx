'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Eye, EyeOff, Mail, Lock, AlertCircle } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export default function LoginPageWrapper() {
  return (
    <Suspense fallback={<p className="text-sm text-slate-500">Loading…</p>}>
      <LoginPage />
    </Suspense>
  );
}

function LoginPage() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get('next') ?? '/dashboard';
  const flash = params.get('flash');
  const emailFromUrl = params.get('email') ?? '';

  const [email, setEmail] = useState(emailFromUrl);
  const [password, setPassword] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // If a session already exists, hop straight into the app.
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) router.replace(next);
    });
  }, [router, next]);

  useEffect(() => {
    setEmail(emailFromUrl);
  }, [emailFromUrl]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!email.trim() || !password) {
      setError('Email and password are required.');
      return;
    }
    setBusy(true);
    const { error: err } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    setBusy(false);
    if (err) {
      const msg = err.message.toLowerCase();
      if (msg.includes('invalid login')) {
        setError('Invalid email or password.');
      } else if (msg.includes('email not confirmed')) {
        setError(
          'Email not confirmed. Check your inbox or ask an admin to disable confirmations in Supabase.'
        );
      } else {
        setError(err.message);
      }
      return;
    }
    router.replace(next);
  }

  return (
    <div className="w-full">
      <div className="rounded-2xl border border-slate-100 bg-white p-7 shadow-card">
        <div className="text-center">
          <h1 className="text-[22px] font-semibold tracking-tight text-slate-900">
            Welcome back
          </h1>
          <p className="mt-1 text-[13.5px] text-slate-500">
            Sign in to your PhotonX dashboard.
          </p>
        </div>

        {flash === 'check-email' && (
          <div className="mt-5 flex items-start gap-2 rounded-lg border border-emerald-100 bg-emerald-50/60 p-3 text-[13px] text-emerald-700">
            <Mail className="mt-0.5 h-4 w-4 flex-shrink-0" />
            <span>
              Check your email for a password reset link. It expires in 1 hour.
            </span>
          </div>
        )}
        {flash === 'password-reset' && (
          <div className="mt-5 flex items-start gap-2 rounded-lg border border-emerald-100 bg-emerald-50/60 p-3 text-[13px] text-emerald-700">
            <Lock className="mt-0.5 h-4 w-4 flex-shrink-0" />
            <span>Password updated. Sign in with your new password.</span>
          </div>
        )}
        {flash === 'signed-up' && (
          <div className="mt-5 flex items-start gap-2 rounded-lg border border-emerald-100 bg-emerald-50/60 p-3 text-[13px] text-emerald-700">
            <Mail className="mt-0.5 h-4 w-4 flex-shrink-0" />
            <span>Account created. Sign in to continue.</span>
          </div>
        )}
        {flash === 'invite-ready' && (
          <div className="mt-5 flex items-start gap-2 rounded-lg border border-emerald-100 bg-emerald-50/60 p-3 text-[13px] text-emerald-700">
            <Lock className="mt-0.5 h-4 w-4 flex-shrink-0" />
            <span>Password saved. Sign in to continue.</span>
          </div>
        )}

        <form onSubmit={submit} className="mt-6 space-y-4">
          <div>
            <label
              htmlFor="email"
              className="mb-1.5 block text-[13px] font-medium text-slate-700"
            >
              Email
            </label>
            <div className="relative">
              <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                id="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@photonx.com"
                className="pl-9"
                autoFocus
              />
            </div>
          </div>

          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <label
                htmlFor="password"
                className="text-[13px] font-medium text-slate-700"
              >
                Password
              </label>
              <Link
                href="/forgot-password"
                className="text-[12.5px] font-medium text-brand-600 hover:text-brand-700"
              >
                Forgot password?
              </Link>
            </div>
            <div className="relative">
              <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                id="password"
                type={showPwd ? 'text' : 'password'}
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="pl-9 pr-10"
              />
              <button
                type="button"
                onClick={() => setShowPwd((s) => !s)}
                tabIndex={-1}
                className="absolute right-2 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                title={showPwd ? 'Hide' : 'Show'}
              >
                {showPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          {error && (
            <div className="flex items-start gap-2 rounded-lg border border-rose-100 bg-rose-50/60 p-2.5 text-[12.5px] text-rose-700">
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <Button
            type="submit"
            disabled={busy || !email.trim() || !password}
            className="h-10 w-full bg-brand-500 text-[14px] font-semibold hover:bg-brand-600"
          >
            {busy ? 'Signing in…' : 'Sign in'}
          </Button>
        </form>

        <p className="mt-6 text-center text-[13px] text-slate-500">
          Don&apos;t have an account?{' '}
          <Link
            href="/signup"
            className="font-medium text-brand-600 hover:text-brand-700"
          >
            Create one
          </Link>
        </p>
      </div>

      <p className="mt-4 text-center text-[11.5px] text-slate-400">
        By signing in you agree to PhotonX&apos;s terms of service.
      </p>
    </div>
  );
}
