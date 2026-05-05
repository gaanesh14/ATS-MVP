'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Eye,
  EyeOff,
  Lock,
  AlertCircle,
  CheckCircle,
  Sparkles,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

// Invite acceptance page.
//
// Supabase generates an invite link of the shape:
//   https://<project>.supabase.co/auth/v1/verify
//     ?token=...&type=invite&redirect_to=<this page>
//
// Clicking it consumes the token, creates a session, and redirects here with
// `#access_token=...&type=invite` in the URL hash. The Supabase JS client
// picks the tokens out of the hash and stores them as a normal session.
//
// At that point the user IS signed in but has no password. This page asks
// them to set one before letting them into the dashboard, so they can sign
// back in next time.

export default function AcceptInvitePage() {
  const router = useRouter();
  const [hasSession, setHasSession] = useState<boolean | null>(null);
  const [emailHint, setEmailHint] = useState<string | null>(null);
  const [mustSetPassword, setMustSetPassword] = useState(false);
  const [metadata, setMetadata] = useState<Record<string, unknown>>({});
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // The Supabase client reads the access token from the URL hash on its own.
  // We just check whether a session exists once it has had a moment to do so.
  useEffect(() => {
    let cancelled = false;

    async function check() {
      // Wait one tick for the client to process the URL hash, then look up.
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (cancelled) return;
      if (session?.user) {
        setHasSession(true);
        setEmailHint(session.user.email ?? null);
        const userMeta = (session.user.user_metadata as Record<string, unknown> | null) ?? {};
        setMetadata(userMeta);
        setMustSetPassword(Boolean(userMeta.must_set_password));
      } else {
        setHasSession(false);
      }
    }

    check();
    return () => {
      cancelled = true;
    };
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
    const { error: err } = await supabase.auth.updateUser({
      password,
      data: {
        ...metadata,
        must_set_password: false,
        invite_accepted_at: new Date().toISOString(),
      },
    });

    if (err) {
      setBusy(false);
      setError(err.message);
      return;
    }

    await supabase.auth.signOut();
    setBusy(false);
    setSuccess(true);
    const qs = emailHint
      ? `?flash=invite-ready&email=${encodeURIComponent(emailHint)}`
      : '?flash=invite-ready';
    setTimeout(() => router.replace(`/login${qs}`), 900);
  }

  // Loading state while we figure out whether the recovery session exists.
  if (hasSession === null) {
    return (
      <div className="grid w-full place-items-center py-10 text-sm text-slate-500">
        Verifying your invite…
      </div>
    );
  }

  // No session — the link was opened twice, expired, or hand-typed wrong.
  if (hasSession === false) {
    return (
      <div className="w-full">
        <div className="rounded-2xl border border-slate-100 bg-white p-7 shadow-card">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-rose-50 text-rose-600">
            <AlertCircle className="h-5 w-5" />
          </div>
          <h1 className="mt-3 text-[20px] font-semibold tracking-tight text-slate-900">
            Invite link is invalid or expired
          </h1>
          <p className="mt-1.5 text-[13.5px] leading-relaxed text-slate-600">
            Invite links are single-use and expire after 24 hours. Ask the
            person who invited you to send a fresh one from{' '}
            <strong>Team → Pending invites → Resend invite</strong>.
          </p>
          <div className="mt-5 flex justify-end">
            <Button
              onClick={() => router.replace('/login')}
              className="bg-brand-500 hover:bg-brand-600"
            >
              Go to sign in
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (hasSession && !mustSetPassword) {
    return (
      <div className="w-full">
        <div className="rounded-2xl border border-slate-100 bg-white p-7 shadow-card">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-50 text-emerald-600">
            <CheckCircle className="h-5 w-5" />
          </div>
          <h1 className="mt-3 text-[20px] font-semibold tracking-tight text-slate-900">
            Invite already completed
          </h1>
          <p className="mt-1.5 text-[13.5px] leading-relaxed text-slate-600">
            This invite has already been accepted. Sign in with your password to continue.
          </p>
          <div className="mt-5 flex justify-end">
            <Button
              onClick={() => router.replace('/login')}
              className="bg-brand-500 hover:bg-brand-600"
            >
              Go to sign in
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full">
      <div className="rounded-2xl border border-slate-100 bg-white p-7 shadow-card">
        <div className="text-center">
          <div className="mx-auto grid h-10 w-10 place-items-center rounded-xl bg-brand-50 text-brand-600">
            <Sparkles className="h-5 w-5" />
          </div>
          <h1 className="mt-3 text-[22px] font-semibold tracking-tight text-slate-900">
            Welcome to PhotonX
          </h1>
          <p className="mt-1 text-[13.5px] text-slate-500">
            {emailHint ? (
              <>
                Set a password for <strong>{emailHint}</strong> to finish setting
                up your account. You&apos;ll sign in with it on the next step.
              </>
            ) : (
              'Set a password to finish setting up your account. You will sign in with it next.'
            )}
          </p>
        </div>

        {success ? (
          <div className="mt-5 grid place-items-center gap-2 rounded-xl border border-emerald-100 bg-emerald-50/40 px-4 py-6 text-center">
            <div className="grid h-9 w-9 place-items-center rounded-full bg-white text-emerald-600 shadow-sm">
              <CheckCircle className="h-5 w-5" />
            </div>
            <p className="mt-1 text-[14px] font-medium text-slate-900">
              You&apos;re all set
            </p>
            <p className="text-[12.5px] text-slate-600">Taking you to the dashboard…</p>
          </div>
        ) : (
          <form onSubmit={submit} className="mt-5 space-y-4">
            <div>
              <label
                htmlFor="password"
                className="mb-1.5 block text-[13px] font-medium text-slate-700"
              >
                Choose a password
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
                  autoFocus
                />
                <button
                  type="button"
                  onClick={() => setShowPwd((s) => !s)}
                  tabIndex={-1}
                  aria-label={showPwd ? 'Hide password' : 'Show password'}
                  className="absolute right-2 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                >
                  {showPwd ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
              <p className="mt-1 text-[11.5px] text-slate-500">Minimum 8 characters.</p>
            </div>
            <div>
              <label
                htmlFor="confirm"
                className="mb-1.5 block text-[13px] font-medium text-slate-700"
              >
                Confirm password
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
              disabled={busy || password.length < 8 || password !== confirm}
              className="h-10 w-full bg-brand-500 text-[14px] font-semibold hover:bg-brand-600"
            >
              {busy ? 'Setting up…' : 'Set password & continue'}
            </Button>
          </form>
        )}
      </div>

      <p className="mt-4 text-center text-[11.5px] text-slate-400">
        By continuing, you agree to PhotonX&apos;s terms of service.
      </p>
    </div>
  );
}
