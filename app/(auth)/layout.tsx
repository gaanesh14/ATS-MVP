import Link from 'next/link';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-page">
      <header className="border-b border-slate-100 bg-white/80 backdrop-blur-sm">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
          <Link href="/" className="flex items-center gap-2.5">
            <div className="grid h-7 w-7 place-items-center rounded-lg bg-brand-500 text-[11px] font-bold text-white shadow-sm">
              PX
            </div>
            <span className="text-[14px] font-semibold tracking-tight text-slate-900">
              PhotonX ATS
            </span>
          </Link>
          <Link
            href="/careers"
            className="text-[13px] font-medium text-slate-500 transition-colors hover:text-slate-900"
          >
            Looking for jobs? →
          </Link>
        </div>
      </header>

      <main className="mx-auto flex min-h-[calc(100vh-3.5rem)] max-w-md items-center justify-center px-4 py-10">
        {children}
      </main>
    </div>
  );
}
