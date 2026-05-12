'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';
import { useRouter } from 'next/navigation';
import type { User } from '@supabase/supabase-js';
import {
  supabase,
  type Organization,
  type TeamMember,
  type TeamRole,
} from '@/lib/supabase';
import { authedFetch } from '@/lib/authed-fetch';

type AuthContextValue = {
  loading: boolean;
  authUser: User | null;
  member: TeamMember | null;
  role: TeamRole | null;
  // The active organization for the signed-in user. Read from team_members
  // → organizations after sign-in. Until the multi-tenancy migration has
  // been applied this stays null and pages fall back to the legacy "single
  // pool" behavior — see docs/scaling-rollout.md.
  currentOrg: Organization | null;
  orgId: string | null;
  signOut: () => Promise<void>;
  refreshMember: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue>({
  loading: true,
  authUser: null,
  member: null,
  role: null,
  currentOrg: null,
  orgId: null,
  signOut: async () => {},
  refreshMember: async () => {},
});

export function useAuth(): AuthContextValue {
  return useContext(AuthContext);
}

// ──────────────────────────────────────────────────────────────────────────
// Provider — gates dashboard render behind a valid Supabase Auth session.
//
// Behavior:
//   1. On mount, check supabase.auth.getUser(). No user → replace to /login.
//   2. With a user, fetch the matching team_members row. If absent (e.g. row
//      was archived after the trigger fired), upsert one with role=recruiter
//      so the user isn't locked out.
//   3. Subscribe to auth state changes — if the session ends in another tab
//      we redirect here too.
//   4. Stamp last_active_at once per mount so the team page shows recency.
// ──────────────────────────────────────────────────────────────────────────

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [member, setMember] = useState<TeamMember | null>(null);
  const [currentOrg, setCurrentOrg] = useState<Organization | null>(null);

  // Resolve the signed-in user's team_members row and organization via the
  // server. Querying team_members from the anon client used to live here,
  // but RLS post multi-tenancy migration hides a user's own row while it
  // is still status='pending' — see lib/auth-server.ts:resolveActiveMember
  // for the chicken-and-egg this avoids. The server uses the service-role
  // key, bypasses RLS, and self-heals pending → active on first sign-in.
  const fetchSession = useCallback(
    async (): Promise<{ member: TeamMember | null; org: Organization | null }> => {
      try {
        const res = await authedFetch('/api/me', { cache: 'no-store' });
        if (!res.ok) return { member: null, org: null };
        const json = (await res.json()) as {
          member: TeamMember | null;
          organization: Organization | null;
        };
        return { member: json.member ?? null, org: json.organization ?? null };
      } catch {
        return { member: null, org: null };
      }
    },
    []
  );

  const refreshMember = useCallback(async () => {
    if (!authUser) return;
    const { member: m, org } = await fetchSession();
    setMember(m);
    setCurrentOrg(org);
  }, [authUser, fetchSession]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setAuthUser(null);
    setMember(null);
    setCurrentOrg(null);
    router.replace('/login');
  }, [router]);

  useEffect(() => {
    let active = true;

    async function bootstrap() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!active) return;

      if (!user) {
        router.replace('/login');
        return;
      }

      const mustSetPassword = Boolean(
        (user.user_metadata as { must_set_password?: boolean } | null)?.must_set_password
      );
      if (mustSetPassword) {
        router.replace('/accept-invite');
        return;
      }

      const { member: m, org } = await fetchSession();
      if (!active) return;

      // Stamp last_active_at — nice-to-have signal for the team list. Safe
      // to run via the anon client; once the server has self-healed
      // status to 'active' the row is visible to the user under RLS.
      if (m) {
        supabase
          .from('team_members')
          .update({ last_active_at: new Date().toISOString() })
          .eq('id', m.id)
          .then(() => {});
      }

      setAuthUser(user);
      setMember(m);
      setCurrentOrg(org);
      setLoading(false);
    }

    bootstrap();

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT' || !session) {
        if (active) router.replace('/login');
      }
      if (event === 'SIGNED_IN' && session?.user) {
        // Re-bootstrap after a fresh sign-in (e.g. via the same tab).
        bootstrap();
      }
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, [router, fetchSession]);

  if (loading) {
    return (
      <div className="grid h-screen place-items-center bg-page">
        <div className="flex flex-col items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-brand-500 text-white shadow-sm">
            <span className="text-[14px] font-bold tracking-tight">PX</span>
          </div>
          <p className="text-[13px] text-slate-500">Signing you in…</p>
        </div>
      </div>
    );
  }

  return (
    <AuthContext.Provider
      value={{
        loading,
        authUser,
        member,
        role: member?.role ?? null,
        currentOrg,
        orgId: currentOrg?.id ?? null,
        signOut,
        refreshMember,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
