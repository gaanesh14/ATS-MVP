'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Eye,
  EyeOff,
  Lock,
  AlertCircle,
  CheckCircle,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export default function ResetPasswordPage() {
  const router = useRouter();
  const [hasSession, setHasSession] = useState<boolean | null>(null);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Supabase JS client picks up the recovery token from the URL hash and
  // creates a temporary session automatically. We just confirm one exists.
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setHasSession(!!session);
    });
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }

    setBusy(true);
    const { error: err } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (err) {
      setError(err.message);
      return;
    }
    setSuccess(true);
    // Sign out so the user has to log in fresh with the new password.
    await supabase.auth.signOut();
    setTimeout(() => router.replace('/login?flash=password-reset'), 1500);
  }

  return (
    <div className="w-full">
      <div className="rounded-2xl border border-slate-100 bg-white p-7 shadow-card">
        <div className="text-center">
          <div className="mx-auto grid h-10 w-10 place-items-center rounded-xl bg-brand-50 text-brand-600">
            <Lock className="h-5 w-5" />
          </div>
          <h1 className="mt-3 text-[22px] font-semibold tracking-tight text-slate-900">
            Set a new password
          </h1>
          <p className="mt-1 text-[13.5px] text-slate-500">
            Pick a password you haven&apos;t used before.
          </p>
        </div>

        {hasSession === false && (
          <div className="mt-5 flex items-start gap-2 rounded-lg border border-rose-100 bg-rose-50/60 p-3 text-[12.5px] text-rose-700">
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
            <span>
              This reset link is invalid or has expired. Request a new one from{' '}
              <a href="/forgot-password" className="font-medium underline">
                Forgot password
              </a>
              .
            </span>
          </div>
        )}

        {success ? (
          <div className="mt-5 grid place-items-center gap-2 rounded-xl border border-emerald-100 bg-emerald-50/40 px-4 py-6 text-center">
            <div className="grid h-9 w-9 place-items-center rounded-full bg-white text-emerald-600 shadow-sm">
              <CheckCircle className="h-5 w-5" />
            </div>
            <p className="mt-1 text-[14px] font-medium text-slate-900">
              Password updated
            </p>
            <p className="text-[12.5px] text-slate-600">
              Redirecting to sign in…
            </p>
          </div>
        ) : (
          <form onSubmit={submit} className="mt-5 space-y-4">
            <div>
              <label
                htmlFor="password"
                className="mb-1.5 block text-[13px] font-medium text-slate-700"
              >
                New password
              </label>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  id="password"
                  type={showPwd ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="new-password"
                  className="pl-9 pr-10"
                  disabled={hasSession === false}
                  autoFocus
                />
                <button
                  type="button"
                  onClick={() => setShowPwd((s) => !s)}
                  tabIndex={-1}
                  className="absolute right-2 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                >
                  {showPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <p className="mt-1 text-[11.5px] text-slate-500">Minimum 8 characters.</p>
            </div>
            <div>
              <label
                htmlFor="confirm"
                className="mb-1.5 block text-[13px] font-medium text-slate-700"
              >
                Confirm new password
              </label>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  id="confirm"
                  type={showPwd ? 'text' : 'password'}
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  autoComplete="new-password"
                  className="pl-9"
                  disabled={hasSession === false}
                />
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
              disabled={
                busy ||
                hasSession === false ||
                password.length < 8 ||
                password !== confirm
              }
              className="h-10 w-full bg-brand-500 text-[14px] font-semibold hover:bg-brand-600"
            >
              {busy ? 'Updating…' : 'Update password'}
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
