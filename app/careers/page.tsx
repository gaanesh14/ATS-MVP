'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase, type Job } from '@/lib/supabase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { MapPin, Briefcase } from 'lucide-react';

export default function CareersPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchJobs() {
      const { data } = await supabase
        .from('jobs')
        .select('*')
        .eq('status', 'open')
        .order('created_at', { ascending: false });
      setJobs((data as Job[]) ?? []);
      setLoading(false);
    }
    fetchJobs();
  }, []);

  return (
    <main className="container mx-auto max-w-3xl px-4 py-16">
      <div className="mb-12">
        <p className="mb-2 text-sm font-medium uppercase tracking-wider text-muted-foreground">
          PhotonX Technologies
        </p>
        <h1 className="text-3xl font-semibold tracking-tight">Open positions</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Join our team. Apply directly — no recruiter middleman.
        </p>
      </div>

      {loading && <p className="text-sm text-muted-foreground">Loading…</p>}

      {!loading && jobs.length === 0 && (
        <div className="rounded-lg border border-dashed p-12 text-center text-sm text-muted-foreground">
          No open positions right now. Check back soon.
        </div>
      )}

      <div className="space-y-3">
        {jobs.map((job) => (
          <Link key={job.id} href={`/careers/apply?jobId=${job.id}`} className="block">
            <Card className="cursor-pointer border-border/60 transition-all hover:border-border hover:shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg font-medium">{job.title}</CardTitle>
                <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  {job.location && (
                    <span className="flex items-center gap-1">
                      <MapPin className="h-3.5 w-3.5" /> {job.location}
                    </span>
                  )}
                  <span className="flex items-center gap-1">
                    <Briefcase className="h-3.5 w-3.5" /> {job.min_experience}–{job.max_experience} yrs
                  </span>
                </div>
              </CardHeader>
              {job.description && (
                <CardContent className="pt-0">
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    {job.description.length > 180
                      ? job.description.slice(0, 180).trim() + '…'
                      : job.description}
                  </p>
                </CardContent>
              )}
            </Card>
          </Link>
        ))}
      </div>
    </main>
  );
}
