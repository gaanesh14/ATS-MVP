import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, ExternalLink } from 'lucide-react';
import { getDocBySlug, getDocsMeta } from '../shared';

type Props = {
  params: { slug: string };
};

export async function generateStaticParams() {
  const docs = await getDocsMeta();
  return docs.map((doc) => ({ slug: doc.slug }));
}

export async function generateMetadata({ params }: Props) {
  const doc = await getDocBySlug(params.slug);
  return {
    title: doc ? `${doc.title} | PhotonX ATS Docs` : 'Document Not Found | PhotonX ATS',
  };
}

export default async function DocDetailPage({ params }: Props) {
  const doc = await getDocBySlug(params.slug);

  if (!doc) {
    notFound();
  }

  return (
    <main className="min-h-screen bg-page px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-5xl">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <Link
              href="/docs"
              className="inline-flex items-center gap-1.5 text-[13px] font-medium text-slate-500 transition-colors hover:text-slate-900"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Back to docs
            </Link>
            <h1 className="mt-3 text-[28px] font-semibold tracking-tight text-slate-900">
              {doc.title}
            </h1>
            <p className="mt-1 text-[13px] text-slate-500">{doc.fileName}</p>
          </div>

          <a
            href={`/docs/${doc.slug}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
          >
            Open in new tab
            <ExternalLink className="h-4 w-4" />
          </a>
        </div>

        <div className="mt-6 overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-card">
          <pre className="overflow-x-auto whitespace-pre-wrap px-5 py-5 text-[13px] leading-6 text-slate-700">
            {doc.content}
          </pre>
        </div>
      </div>
    </main>
  );
}
