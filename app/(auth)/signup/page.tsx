'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Eye,
  EyeOff,
  Mail,
  Lock,
  AlertCircle,
  User,
  CheckCircle,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export default function SignupPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) router.replace('/dashboard');
    });
  }, [router]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!name.trim()) return setError('Name is required.');
    if (!/^[\w.-]+@[\w.-]+\.\w+$/.test(email.trim())) {
      return setError('Enter a valid email address.');
    }
    if (password.length < 8) return setError('Password must be at least 8 characters.');

    setBusy(true);

    const { data, error: err } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: { name: name.trim() },
        emailRedirectTo:
          typeof window !== 'undefined'
            ? `${window.location.origin}/login`
            : undefined,
      },
    });

    if (err) {
      setBusy(false);
      const msg = err.message.toLowerCase();
      if (msg.includes('already')) {
        setError('An account with that email already exists. Sign in instead.');
      } else {
        setError(err.message);
      }
      return;
    }

    // Belt-and-suspenders: the on_auth_user_created trigger inserts a
    // team_members row, but if the trigger isn't installed yet we upsert
    // here so first-time login still finds a member row.
    if (data.user) {
      await supabase
        .from('team_members')
        .upsert(
          {
            auth_user_id: data.user.id,
            email: email.trim(),
            name: name.trim(),
            role: 'recruiter',
            status: 'active',
            joined_at: new Date().toISOString(),
          },
          { onConflict: 'email' }
        );
    }

    setBusy(false);

    // If email confirmations are enabled, the session is null — send the user
    // to login with a "check email" flash. Otherwise we have a session and
    // can redirect straight in.
    if (data.session) {
      router.replace('/dashboard');
    } else {
      router.replace('/login?flash=signed-up');
    }
  }

  return (
    <div className="w-full">
      <div className="rounded-2xl border border-slate-100 bg-white p-7 shadow-card">
        <div className="text-center">
          <h1 className="text-[22px] font-semibold tracking-tight text-slate-900">
            Create your account
          </h1>
          <p className="mt-1 text-[13.5px] text-slate-500">
            Start screening candidates in under 2 minutes.
          </p>
        </div>

        <div className="mt-5 flex items-start gap-2 rounded-lg border border-sky-100 bg-sky-50/60 p-3 text-[12.5px] text-sky-900">
          <CheckCircle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-sky-600" />
          <span>
            New accounts join as <strong>Recruiter</strong> (read-only). A super
            admin can promote you from <strong>Team → Manage member</strong>.
          </span>
        </div>

        <form onSubmit={submit} className="mt-5 space-y-4">
          <div>
            <label
              htmlFor="name"
              className="mb-1.5 block text-[13px] font-medium text-slate-700"
            >
              Full name
            </label>
            <div className="relative">
              <User className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoComplete="name"
                placeholder="Aarav Sharma"
                className="pl-9"
                autoFocus
              />
            </div>
          </div>
          <div>
            <label
              htmlFor="email"
              className="mb-1.5 block text-[13px] font-medium text-slate-700"
            >
              Work email
            </label>
            <div className="relative">
              <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                placeholder="aarav@photonx.com"
                className="pl-9"
              />
            </div>
          </div>
          <div>
            <label
              htmlFor="password"
              className="mb-1.5 block text-[13px] font-medium text-slate-700"
            >
              Password
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
            <p className="mt-1 text-[11.5px] text-slate-500">Minimum 8 characters.</p>
          </div>

          {error && (
            <div className="flex items-start gap-2 rounded-lg border border-rose-100 bg-rose-50/60 p-2.5 text-[12.5px] text-rose-700">
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <Button
            type="submit"
            disabled={busy || !name.trim() || !email.trim() || password.length < 8}
            className="h-10 w-full bg-brand-500 text-[14px] font-semibold hover:bg-brand-600"
          >
            {busy ? 'Creating account…' : 'Create account'}
          </Button>
        </form>

        <p className="mt-6 text-center text-[13px] text-slate-500">
          Already have an account?{' '}
          <Link href="/login" className="font-medium text-brand-600 hover:text-brand-700">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
