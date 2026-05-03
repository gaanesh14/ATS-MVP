import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

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
 * Body: { stage: string }
 *
 * Stage must be either a built-in id (new, shortlisted, interview, hired,
 * rejected) or a custom stage id defined on the parent job's `extra_stages`.
 *
 * If moving to 'hired' fills the parent job's vacancies, also flips the job
 * to 'closed'.
 */
export async function PATCH(
  req: Request,
  { params }: { params: { id: string } }
) {
  const { id } = params;
  console.log(`[stage] PATCH id=${id}`);

  // 1. Parse body — defer stage validation until we have the parent job.
  let body: { stage?: string };
  try {
    body = await req.json();
  } catch {
    console.error('[stage] invalid JSON body');
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const stage = body.stage;
  if (!stage || typeof stage !== 'string') {
    return NextResponse.json({ error: 'stage is required' }, { status: 400 });
  }

  // 2. Verify the application exists FIRST so we can give a real 404 if it doesn't.
  const { data: existing, error: existErr } = await supabase
    .from('applications')
    .select('id, job_id, stage')
    .eq('id', id)
    .maybeSingle();

  if (existErr) {
    console.error(`[stage] select failed: ${existErr.message}`);
    return NextResponse.json({ error: existErr.message }, { status: 500 });
  }
  if (!existing) {
    console.error(`[stage] application not found: ${id}`);
    return NextResponse.json({ error: 'Application not found' }, { status: 404 });
  }

  // 3. Validate the requested stage against the parent job's allowed set.
  //    Built-ins are always valid; custom stages must exist on jobs.extra_stages.
  if (!BUILTIN_STAGES.has(stage)) {
    if (!existing.job_id) {
      return NextResponse.json(
        { error: 'Custom stages require a parent job' },
        { status: 400 }
      );
    }
    const { data: parentJob, error: jobErr } = await supabase
      .from('jobs')
      .select('extra_stages')
      .eq('id', existing.job_id)
      .maybeSingle();

    if (jobErr) {
      console.error(`[stage] job lookup failed: ${jobErr.message}`);
      // If the column doesn't exist yet (migration not run), surface a helpful message.
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

  // 3. No-op if stage isn't actually changing — saves a write.
  if (existing.stage === stage) {
    console.log(`[stage] already in ${stage}, no-op`);
    return NextResponse.json({ ok: true, application: existing, autoClosedJob: false });
  }

  // 4. Apply the update (no chained .select().single() — that's where the 404 was coming from).
  const { error: updErr } = await supabase
    .from('applications')
    .update({ stage })
    .eq('id', id);

  if (updErr) {
    console.error(`[stage] update failed: ${updErr.message}`);
    return NextResponse.json({ error: updErr.message }, { status: 500 });
  }

  console.log(`[stage] ${id}: ${existing.stage} -> ${stage}`);

  // 5. Auto-close the job when hired count reaches vacancies.
  let autoClosedJob = false;
  if (stage === 'hired' && existing.job_id) {
    const { data: job } = await supabase
      .from('jobs')
      .select('id, vacancies, status')
      .eq('id', existing.job_id)
      .maybeSingle();

    if (job && job.status === 'open') {
      const { count: hiredCount } = await supabase
        .from('applications')
        .select('id', { count: 'exact', head: true })
        .eq('job_id', existing.job_id)
        .eq('stage', 'hired');

      const target = job.vacancies ?? 1;
      if (hiredCount != null && hiredCount >= target) {
        const { error: closeErr } = await supabase
          .from('jobs')
          .update({ status: 'closed' })
          .eq('id', existing.job_id);
        if (!closeErr) {
          autoClosedJob = true;
          console.log(`[stage] auto-closed job ${existing.job_id} (${hiredCount}/${target} filled)`);
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
