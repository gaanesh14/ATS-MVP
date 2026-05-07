import Link from 'next/link';
import { ArrowRight, FileCode2, FileText } from 'lucide-react';
import { getDocsMeta } from './shared';

export const metadata = {
  title: 'Project Docs | PhotonX ATS',
};

export default async function DocsIndexPage() {
  const docs = await getDocsMeta();
  const featured = docs.find((doc) => doc.fileName.toLowerCase() === 'readme.md');

  return (
    <main className="min-h-screen bg-page px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-5xl">
        <div className="rounded-2xl border border-brand-100 bg-gradient-to-br from-brand-50 via-white to-brand-50/40 p-6 shadow-card sm:p-8 dark:border-brand-500/20 dark:from-brand-500/10 dark:via-slate-900 dark:to-brand-500/5">
          <p className="text-[12px] font-semibold uppercase tracking-[0.18em] text-brand-700">
            Docs
          </p>
          <h1 className="mt-2 text-[30px] font-semibold tracking-tight text-slate-900">
            Project Documentation
          </h1>
          <p className="mt-2 max-w-2xl text-[14px] leading-relaxed text-slate-600">
            Architecture, setup, schema migrations, and sprint guides for this ATS
            project.
          </p>

          {featured && (
            <Link
              href={`/docs/${featured.slug}`}
              className="mt-5 inline-flex items-center gap-2 rounded-xl bg-brand-500 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-brand-600"
            >
              Open overview
              <ArrowRight className="h-4 w-4" />
            </Link>
          )}
        </div>

        <section className="mt-8">
          <h2 className="text-[18px] font-semibold tracking-tight text-slate-900">
            Available documents
          </h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            {docs.map((doc) => (
              <Link
                key={doc.slug}
                href={`/docs/${doc.slug}`}
                className="group rounded-2xl border border-slate-100 bg-white p-5 shadow-card transition-all hover:border-slate-200 hover:shadow-soft"
              >
                <div className="flex items-start gap-3">
                  <div className="grid h-10 w-10 place-items-center rounded-xl bg-brand-50 text-brand-700">
                    {doc.kind === 'sql' ? (
                      <FileCode2 className="h-5 w-5" />
                    ) : (
                      <FileText className="h-5 w-5" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[14px] font-semibold text-slate-900">{doc.title}</p>
                    <p className="mt-1 text-[12px] text-slate-500">{doc.fileName}</p>
                  </div>
                  <ArrowRight className="mt-1 h-4 w-4 flex-shrink-0 text-slate-300 transition-transform group-hover:translate-x-0.5 group-hover:text-brand-600" />
                </div>
              </Link>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
