import { NextResponse } from 'next/server';
import { requireRoleFromRequest, AuthError } from '@/lib/auth-server';

export const runtime = 'nodejs';

// GET /api/me
// Returns the signed-in user's team_members row plus their organization.
// Used by the client-side AuthProvider to bootstrap session state without
// querying team_members from the anon client — which, post multi-tenancy
// migration, can't see its own pending row due to the RLS chicken-and-egg
// described in lib/auth-server.ts. The server route uses the service-role
// admin client and self-heals pending → active on first authenticated load.
export async function GET(req: Request) {
  let auth;
  try {
    auth = await requireRoleFromRequest(req);
  } catch (err) {
    if (err instanceof AuthError) return err.toResponse();
    throw err;
  }
  const { admin, member, orgId } = auth;

  let organization = null;
  if (orgId) {
    const { data } = await admin
      .from('organizations')
      .select('*')
      .eq('id', orgId)
      .maybeSingle();
    organization = data ?? null;
  }

  return NextResponse.json({ member, organization });
}
