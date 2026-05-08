import { NextResponse } from 'next/server';
import { requireRoleFromRequest, AuthError } from '@/lib/auth-server';

export const runtime = 'nodejs';

// Built-in pipeline stages — every job has these. Custom stages live in
// jobs.extra_stages and are validated per-application against the parent job.
const BUILTIN_STAGES = new Set([
  'new',
  'shortlisted',
  'interview',
  'hired',
  'rejected',
]);

type ExtraStage = { id?: unknown };

/**
 * PATCH /api/applications/[id]/stage
 * Body: { stage: string, expected_version?: number }
 *
 * Stage must be either a built-in id (new, shortlisted, interview, hired,
 * rejected) or a custom stage id defined on the parent job's `extra_stages`.
 *
 * Concurrency:
 *   - If `expected_version` is provided, the row is updated only when its
 *     current version matches; otherwise the response is 409 Conflict and
 *     the caller should refetch. (Requires the multi-tenancy migration.)
 *   - If omitted, falls back to last-write-wins for backwards compatibility
 *     with the pre-migration schema.
 *
 * Hire + close:
 *   - When stage='hired' and `expected_version` is provided, calls the
 *     `try_hire_application(...)` Postgres function which performs the
 *     vacancy-cap check and the job-close in a single transaction with
 *     row locks. Two simultaneous hires can no longer both succeed past
 *     the cap.
 *   - When `expected_version` is omitted, falls back to the legacy
 *     two-query pattern (still in-app today on pre-migration projects).
 */
export async function PATCH(
  req: Request,
  { params }: { params: { id: string } }
) {
  const { id } = params;
  console.log(`[stage] PATCH id=${id}`);

  // 1. AuthN + AuthZ. Recruiters are read-only and won't pass this gate.
  let auth;
  try {
    auth = await requireRoleFromRequest(req, 'applications.update');
  } catch (err) {
    if (err instanceof AuthError) return err.toResponse();
    throw err;
  }
  const { admin, orgId } = auth;

  // 2. Parse body — defer stage validation until we have the parent job.
  let body: { stage?: string; expected_version?: number };
  try {
    body = await req.json();
  } catch {
    console.error('[stage] invalid JSON body');
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const stage = body.stage;
  const expectedVersion =
    typeof body.expected_version === 'number' ? body.expected_version : null;
  if (!stage || typeof stage !== 'string') {
    return NextResponse.json({ error: 'stage is required' }, { status: 400 });
  }

  // 3. Verify the application exists and belongs to the caller's org.
  const baseQuery = admin
    .from('applications')
    .select('id, job_id, stage, version')
    .eq('id', id);
  const scopedQuery = orgId ? baseQuery.eq('org_id', orgId) : baseQuery;
  const { data: existing, error: existErr } = await scopedQuery.maybeSingle();

  if (existErr) {
    console.error(`[stage] select failed: ${existErr.message}`);
    return NextResponse.json({ error: existErr.message }, { status: 500 });
  }
  if (!existing) {
    console.error(`[stage] application not found or wrong org: ${id}`);
    return NextResponse.json({ error: 'Application not found' }, { status: 404 });
  }

  // 4. Validate the requested stage against the parent job's allowed set.
  if (!BUILTIN_STAGES.has(stage)) {
    if (!existing.job_id) {
      return NextResponse.json(
        { error: 'Custom stages require a parent job' },
        { status: 400 }
      );
    }
    const { data: parentJob, error: jobErr } = await admin
      .from('jobs')
      .select('extra_stages')
      .eq('id', existing.job_id)
      .maybeSingle();

    if (jobErr) {
      console.error(`[stage] job lookup failed: ${jobErr.message}`);
      const hint = /extra_stages/i.test(jobErr.message)
        ? 'Run docs/schema-migration-extra-stages.sql in Supabase.'
        : '';
      return NextResponse.json(
        { error: `${jobErr.message}${hint ? ` — ${hint}` : ''}` },
        { status: 500 }
      );
    }

    const extras = (parentJob?.extra_stages ?? []) as ExtraStage[];
    const customIds = new Set(
      extras.map((s) => (typeof s?.id === 'string' ? s.id : null)).filter(Boolean) as string[]
    );

    if (!customIds.has(stage)) {
      console.error(`[stage] invalid stage "${stage}" for job ${existing.job_id}`);
      const allowed = [...BUILTIN_STAGES, ...customIds];
      return NextResponse.json(
        {
          error: `Invalid stage "${stage}" for this job. Allowed: ${allowed.join(', ')}`,
        },
        { status: 400 }
      );
    }
  }

  // 5. No-op short-circuit.
  if (existing.stage === stage) {
    console.log(`[stage] already in ${stage}, no-op`);
    return NextResponse.json({
      ok: true,
      application: existing,
      autoClosedJob: false,
    });
  }

  // 6a. Atomic hire path — single RPC handles version-check, hire, and
  //     job-close under row locks. Used when the client has supplied an
  //     expected_version (i.e. multi-tenancy migration is live).
  if (stage === 'hired' && expectedVersion != null) {
    const { data, error: rpcErr } = await admin.rpc('try_hire_application', {
      p_application_id: id,
      p_expected_version: expectedVersion,
    });
    if (rpcErr) {
      console.error(`[stage] try_hire_application failed: ${rpcErr.message}`);
      return NextResponse.json({ error: rpcErr.message }, { status: 500 });
    }
    const result = (Array.isArray(data) ? data[0] : data) as
      | { moved_to_hired: boolean; job_closed: boolean; current_version: number }
      | null;
    if (!result?.moved_to_hired) {
      return NextResponse.json(
        {
          error: 'Stage was changed by someone else. Please refresh.',
          current_version: result?.current_version ?? null,
        },
        { status: 409 }
      );
    }
    console.log(
      `[stage] ${id}: ${existing.stage} -> hired (job_closed=${result.job_closed})`
    );
    return NextResponse.json({
      ok: true,
      application: { id, job_id: existing.job_id, stage: 'hired', version: result.current_version },
      autoClosedJob: result.job_closed,
    });
  }

  // 6b. Compare-and-swap update for non-hire stages when expected_version
  //     is provided. Safe under concurrent edits.
  if (expectedVersion != null) {
    const { data: updated, error: updErr } = await admin
      .from('applications')
      .update({ stage })
      .eq('id', id)
      .eq('version', expectedVersion)
      .select('id, version')
      .maybeSingle();
    if (updErr) {
      console.error(`[stage] CAS update failed: ${updErr.message}`);
      return NextResponse.json({ error: updErr.message }, { status: 500 });
    }
    if (!updated) {
      // Version mismatch — someone else moved it.
      return NextResponse.json(
        { error: 'Stage was changed by someone else. Please refresh.' },
        { status: 409 }
      );
    }
    console.log(`[stage] ${id}: ${existing.stage} -> ${stage} (v${updated.version})`);
    return NextResponse.json({
      ok: true,
      application: { id, job_id: existing.job_id, stage, version: updated.version },
      autoClosedJob: false,
    });
  }

  // 6c. Legacy path — pre-migration schema. Last-write-wins. Kept so clients
  //     not yet sending expected_version still work; remove once every
  //     caller has been updated.
  const { error: updErr } = await admin
    .from('applications')
    .update({ stage })
    .eq('id', id);

  if (updErr) {
    console.error(`[stage] legacy update failed: ${updErr.message}`);
    return NextResponse.json({ error: updErr.message }, { status: 500 });
  }
  console.log(`[stage] ${id}: ${existing.stage} -> ${stage} (legacy, no version check)`);

  // Legacy auto-close (two-query, racy). Kept for parity until callers move
  // to the atomic path above.
  let autoClosedJob = false;
  if (stage === 'hired' && existing.job_id) {
    const { data: job } = await admin
      .from('jobs')
      .select('id, vacancies, status')
      .eq('id', existing.job_id)
      .maybeSingle();

    if (job && job.status === 'open') {
      const { count: hiredCount } = await admin
        .from('applications')
        .select('id', { count: 'exact', head: true })
        .eq('job_id', existing.job_id)
        .eq('stage', 'hired');

      const target = job.vacancies ?? 1;
      if (hiredCount != null && hiredCount >= target) {
        const { error: closeErr } = await admin
          .from('jobs')
          .update({ status: 'closed' })
          .eq('id', existing.job_id);
        if (!closeErr) {
          autoClosedJob = true;
          console.log(
            `[stage] auto-closed job ${existing.job_id} (${hiredCount}/${target} filled)`
          );
        }
      }
    }
  }

  return NextResponse.json({
    ok: true,
    application: { id, job_id: existing.job_id, stage },
    autoClosedJob,
  });
}
