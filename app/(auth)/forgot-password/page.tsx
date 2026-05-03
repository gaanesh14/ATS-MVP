'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Mail, ArrowLeft, AlertCircle } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!/^[\w.-]+@[\w.-]+\.\w+$/.test(email.trim())) {
      setError('Enter a valid email address.');
      return;
    }
    setBusy(true);
    const { error: err } = await supabase.auth.resetPasswordForEmail(
      email.trim(),
      {
        redirectTo:
          typeof window !== 'undefined'
            ? `${window.location.origin}/reset-password`
            : undefined,
      }
    );
    setBusy(false);
    if (err) {
      setError(err.message);
      return;
    }
    setSent(true);
  }

  return (
    <div className="w-full">
      <div className="rounded-2xl border border-slate-100 bg-white p-7 shadow-card">
        <Link
          href="/login"
          className="inline-flex items-center gap-1.5 text-[13px] font-medium text-slate-500 transition-colors hover:text-slate-900"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to sign in
        </Link>

        <div className="mt-4">
          <h1 className="text-[22px] font-semibold tracking-tight text-slate-900">
            Forgot password?
          </h1>
          <p className="mt-1 text-[13.5px] text-slate-500">
            Enter your email and we&apos;ll send a reset link.
          </p>
        </div>

        {sent ? (
          <div className="mt-6 grid place-items-center gap-2 rounded-xl border border-emerald-100 bg-emerald-50/40 px-4 py-8 text-center">
            <div className="grid h-10 w-10 place-items-center rounded-full bg-white text-emerald-600 shadow-sm">
              <Mail className="h-5 w-5" />
            </div>
            <p className="mt-1 text-[14px] font-medium text-slate-900">
              Check your inbox
            </p>
            <p className="text-[12.5px] text-slate-600">
              We sent a reset link to <span className="font-medium">{email}</span>.
              The link expires in 1 hour.
            </p>
            <p className="mt-1 text-[11.5px] text-slate-400">
              Didn&apos;t get it? Check spam or{' '}
              <button
                type="button"
                onClick={() => setSent(false)}
                className="font-medium text-brand-600 hover:underline"
              >
                try a different email
              </button>
              .
            </p>
          </div>
        ) : (
          <form onSubmit={submit} className="mt-5 space-y-4">
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
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  placeholder="you@photonx.com"
                  className="pl-9"
                  autoFocus
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
              disabled={busy || !email.trim()}
              className="h-10 w-full bg-brand-500 text-[14px] font-semibold hover:bg-brand-600"
            >
              {busy ? 'Sending…' : 'Send reset link'}
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
