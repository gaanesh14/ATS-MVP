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
import { supabase, type TeamMember, type TeamRole } from '@/lib/supabase';

type AuthContextValue = {
  loading: boolean;
  authUser: User | null;
  member: TeamMember | null;
  role: TeamRole | null;
  signOut: () => Promise<void>;
  refreshMember: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue>({
  loading: true,
  authUser: null,
  member: null,
  role: null,
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

  const fetchMember = useCallback(
    async (user: User): Promise<TeamMember | null> => {
      // Prefer matching by auth_user_id (FK). Fall back to email for invited
      // members whose row existed before they signed up.
      const byId = await supabase
        .from('team_members')
        .select('*')
        .eq('auth_user_id', user.id)
        .maybeSingle();

      if (byId.data) return byId.data as TeamMember;

      const byEmail = await supabase
        .from('team_members')
        .select('*')
        .eq('email', user.email ?? '')
        .maybeSingle();

      if (byEmail.data) {
        // Backfill the link + activation if this is the first sign-in for an
        // invited user.
        const patch: Record<string, unknown> = { auth_user_id: user.id };
        if (byEmail.data.status === 'pending') {
          patch.status = 'active';
          patch.joined_at = new Date().toISOString();
        }
        const { data: linked } = await supabase
          .from('team_members')
          .update(patch)
          .eq('id', byEmail.data.id)
          .select('*')
          .single();
        return (linked ?? byEmail.data) as TeamMember;
      }

      // Brand-new user with no row yet (signed up via Auth without going
      // through the app form, or before the trigger landed). Provision a
      // recruiter row so they can at least sign in.
      const { data: created } = await supabase
        .from('team_members')
        .insert({
          auth_user_id: user.id,
          email: user.email ?? '',
          name:
            (user.user_metadata as { name?: string } | null)?.name ??
            user.email?.split('@')[0] ??
            'New member',
          role: 'recruiter',
          status: 'active',
          joined_at: new Date().toISOString(),
        })
        .select('*')
        .single();
      return (created as TeamMember) ?? null;
    },
    []
  );

  const refreshMember = useCallback(async () => {
    if (!authUser) return;
    const m = await fetchMember(authUser);
    setMember(m);
  }, [authUser, fetchMember]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setAuthUser(null);
    setMember(null);
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

      const m = await fetchMember(user);
      if (!active) return;

      // Stamp last_active_at — nice-to-have signal for the team list.
      if (m) {
        supabase
          .from('team_members')
          .update({ last_active_at: new Date().toISOString() })
          .eq('id', m.id)
          .then(() => {});
      }

      setAuthUser(user);
      setMember(m);
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
  }, [router, fetchMember]);

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
        signOut,
        refreshMember,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
