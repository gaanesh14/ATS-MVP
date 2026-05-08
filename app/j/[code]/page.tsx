import { redirect, notFound } from 'next/navigation';
import { supabase } from '@/lib/supabase';

// Short shareable apply link. The URL `/j/<code>` resolves to the
// existing `/careers/apply?jobId=<uuid>` page so that:
//   • the link recruiters share is short ("…/j/550e8400")
//   • old links with the full uuid keep working
//   • query params like `?source=linkedin` flow through unchanged
//
// `code` may be either:
//   • the full 36-char uuid — used directly
//   • an 8–35-char hex/dash prefix of a uuid — resolved by prefix match
//
// Collision: with 8 lowercase-hex prefix chars there are 16^8 ≈ 4.3 B
// possibilities, so even a few thousand jobs has a vanishing collision
// rate. If two jobs ever share a prefix, we bail with 404 rather than
// pick the wrong one.

export default async function ShortApply({
  params,
  searchParams,
}: {
  params: { code: string };
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const code = params.code.toLowerCase();

  // 8 chars is the prefix length we emit; allow up to a full uuid (36).
  if (!/^[0-9a-f-]{8,36}$/.test(code)) {
    notFound();
  }

  let fullId: string;

  if (code.length === 36) {
    fullId = code;
  } else {
    // Postgres can't `like` a uuid column directly, so fetch ids and
    // filter in memory. The payload is tiny (one uuid per job) and the
    // query runs once per share-link click.
    const { data, error } = await supabase.from('jobs').select('id');
    if (error || !data) notFound();

    const matches = data.filter((j) => (j.id as string).startsWith(code));
    if (matches.length !== 1) notFound();

    fullId = matches[0].id as string;
  }

  // Forward any other search params (source tracking, utm, …) and avoid
  // duplicating jobId/id if the visitor pasted them on by mistake.
  const query = new URLSearchParams();
  query.set('jobId', fullId);
  for (const [k, v] of Object.entries(searchParams)) {
    if (k === 'jobId' || k === 'id') continue;
    if (typeof v === 'string') query.set(k, v);
    else if (Array.isArray(v)) v.forEach((vv) => query.append(k, vv));
  }

  redirect(`/careers/apply?${query.toString()}`);
}
