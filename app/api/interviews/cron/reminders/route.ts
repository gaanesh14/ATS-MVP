import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { sendInterviewInvite } from '@/lib/email/interview-invite';
import type { Interview } from '@/lib/supabase';

export const runtime = 'nodejs';
// Vercel Cron invokes this via GET. We also accept POST for ad-hoc local
// testing via curl.
export const dynamic = 'force-dynamic';

// GET /api/interviews/cron/reminders
//
// Vercel Cron config (vercel.json) hits this every 10 minutes. For each
// pending interview, decide which reminder (if any) is due and dispatch.
//
// Window logic:
//   * 24h reminder fires when scheduled_at - now ∈ [23h, 25h] AND
//     reminder_24h_sent_at IS NULL.
//   * 1h reminder fires when scheduled_at - now ∈ [50min, 70min] AND
//     reminder_1h_sent_at IS NULL.
//
// Wider-than-step windows give us slack against clock drift / cron retries
// without resulting in duplicate emails (the *_sent_at guards make each
// reminder idempotent).
//
// Auth: Vercel Cron sets `Authorization: Bearer ${CRON_SECRET}`. We accept
// a missing header in dev (NODE_ENV !== 'production') so you can hit it
// from curl without configuring anything.
export async function GET(req: Request) {
  const auth = req.headers.get('authorization') ?? '';
  const expected = process.env.CRON_SECRET;
  if (process.env.NODE_ENV === 'production') {
    if (!expected) {
      return NextResponse.json(
        { error: 'CRON_SECRET not configured on the server.' },
        { status: 500 }
      );
    }
    if (auth !== `Bearer ${expected}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  let admin: ReturnType<typeof getSupabaseAdmin>;
  try {
    admin = getSupabaseAdmin();
  } catch (err) {
    return NextResponse.json(
      {
        error: `Admin client unavailable: ${err instanceof Error ? err.message : String(err)}`,
      },
      { status: 500 }
    );
  }

  const now = new Date();
  const in23h = new Date(now.getTime() + 23 * 60 * 60_000).toISOString();
  const in25h = new Date(now.getTime() + 25 * 60 * 60_000).toISOString();
  const in50m = new Date(now.getTime() + 50 * 60_000).toISOString();
  const in70m = new Date(now.getTime() + 70 * 60_000).toISOString();

  // Pull both windows in parallel.
  const [due24h, due1h] = await Promise.all([
    admin
      .from('interviews')
      .select('*, applications(jobs(title))')
      .eq('status', 'scheduled')
      .is('reminder_24h_sent_at', null)
      .gte('scheduled_at', in23h)
      .lte('scheduled_at', in25h),
    admin
      .from('interviews')
      .select('*, applications(jobs(title))')
      .eq('status', 'scheduled')
      .is('reminder_1h_sent_at', null)
      .gte('scheduled_at', in50m)
      .lte('scheduled_at', in70m),
  ]);

  type Result = { id: string; kind: '24h' | '1h'; ok: boolean; error?: string };
  const results: Result[] = [];

  async function dispatch(
    rows: { data: unknown[] | null },
    kind: '24h' | '1h'
  ) {
    const list = (rows.data ?? []) as Array<
      Interview & { applications?: { jobs?: { title?: string } | null } | null }
    >;
    for (const row of list) {
      const jobTitle = row.applications?.jobs?.title ?? '';
      const action = kind === '24h' ? 'reminder_24h' : 'reminder_1h';
      const send = await sendInterviewInvite({ interview: row, jobTitle, action });

      // Stamp the *_sent_at column EVEN ON FAILURE — without this, a broken
      // Brevo key would mean we re-send (and re-fail) every cron tick. The
      // recruiter still has the manual "Resend invite" button.
      const patch: Record<string, string> = {
        reminder_sent_at: now.toISOString(),
      };
      patch[kind === '24h' ? 'reminder_24h_sent_at' : 'reminder_1h_sent_at'] =
        now.toISOString();

      await admin.from('interviews').update(patch).eq('id', row.id);

      results.push({
        id: row.id,
        kind,
        ok: send.ok,
        error: send.ok ? undefined : send.error,
      });
    }
  }

  await Promise.all([dispatch(due24h, '24h'), dispatch(due1h, '1h')]);

  return NextResponse.json({
    ranAt: now.toISOString(),
    sent: results.length,
    results,
  });
}

// Mirror as POST for manual invocation in dev / from a scripted retry.
export async function POST(req: Request) {
  return GET(req);
}
