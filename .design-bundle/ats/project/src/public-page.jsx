// Public careers page

const { Icons, UI, MOCK } = window;
const { Input, Button, cn } = UI;

function PublicPage({ route, navigate }) {
  const job = MOCK.JOBS.find((j) => j.id === route.jobId) || MOCK.JOBS[0];
  const [submitted, setSubmitted] = React.useState(false);

  return (
    <div className="min-h-screen bg-page">
      <div className="bg-white border-b border-slate-100">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-brand-500 text-white grid place-items-center text-[11px] font-bold">PX</div>
            <span className="font-semibold text-slate-900">PhotonX</span>
            <span className="text-slate-400">·</span>
            <span className="text-slate-500 text-sm">Careers</span>
          </div>
          <button onClick={() => navigate({ name: "job-detail", jobId: job.id, jobTitle: job.title, tab: "details" })} className="text-sm text-slate-500 hover:text-brand-600 inline-flex items-center gap-1.5">
            <Icons.ArrowLeft className="w-3.5 h-3.5" /> Back to dashboard
          </button>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-6 py-10">
        <div className="bg-white border border-slate-100 rounded-2xl shadow-card p-8">
          <div className="text-sm text-brand-600 font-medium">{job.type} · {job.location}</div>
          <h1 className="mt-2 text-[32px] font-semibold tracking-tight text-slate-900">{job.title}</h1>
          <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-sm text-slate-500">
            <span className="inline-flex items-center gap-1.5"><Icons.MapPin className="w-3.5 h-3.5" />{job.location}</span>
            <span className="inline-flex items-center gap-1.5"><Icons.Briefcase className="w-3.5 h-3.5" />{job.expMin}–{job.expMax} yrs</span>
            <span className="inline-flex items-center gap-1.5"><Icons.DollarSign className="w-3.5 h-3.5" />₹{job.salaryMin}L – ₹{job.salaryMax}L</span>
            <span className="inline-flex items-center gap-1.5"><Icons.Clock className="w-3.5 h-3.5" />Apply by {job.deadline}</span>
          </div>

          <div className="mt-7 space-y-4 text-[15px] text-slate-700 leading-relaxed">
            {MOCK.JOB_DESCRIPTION.map((p, i) => <p key={i}>{p}</p>)}
          </div>

          <h3 className="mt-8 font-semibold text-slate-900 text-[15px]">What you'll bring</h3>
          <div className="mt-3 flex flex-wrap gap-2">
            {MOCK.JOB_SKILLS.map((s) => (
              <span key={s} className="px-3 py-1.5 rounded-full border border-slate-200 bg-slate-50 text-[13px] font-medium text-slate-700">{s}</span>
            ))}
          </div>
        </div>

        <div id="apply" className="mt-6 bg-white border border-slate-100 rounded-2xl shadow-card p-8">
          {submitted ? (
            <div className="py-8 text-center">
              <div className="w-14 h-14 rounded-full bg-emerald-50 text-emerald-600 grid place-items-center mx-auto"><Icons.CheckCircle className="w-7 h-7" /></div>
              <h2 className="mt-3 text-[20px] font-semibold text-slate-900">Application submitted</h2>
              <p className="mt-1 text-slate-500 text-sm">Thanks! We'll review your application and get back to you soon.</p>
            </div>
          ) : (
            <>
              <h2 className="text-[20px] font-semibold text-slate-900">Apply now</h2>
              <p className="mt-1 text-slate-500 text-sm">Takes about 3 minutes.</p>
              <div className="mt-6 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <Field label="Full name"><Input placeholder="Jane Doe" /></Field>
                  <Field label="Email"><Input type="email" placeholder="jane@example.com" /></Field>
                </div>
                <Field label="Phone"><Input placeholder="+91 98765 43210" /></Field>
                <Field label="Resume">
                  <label className="block border-2 border-dashed border-slate-200 rounded-xl p-6 text-center cursor-pointer hover:border-brand-300 hover:bg-brand-50/30 transition-colors">
                    <Icons.Upload className="w-6 h-6 mx-auto text-slate-400" />
                    <div className="mt-2 text-sm text-slate-700 font-medium">Drop your resume here, or click to browse</div>
                    <div className="text-xs text-slate-400">PDF, DOCX up to 10 MB</div>
                    <input type="file" className="hidden" />
                  </label>
                </Field>

                <div className="pt-2">
                  <h3 className="font-semibold text-slate-900 text-[15px] mb-3">Screening Questions</h3>
                  <div className="space-y-4">
                    {MOCK.JOB_QUESTIONS.map((q, i) => (
                      <div key={i}>
                        <div className="text-[14px] text-slate-800 font-medium">
                          {q.q} {q.required && <span className="text-rose-500">*</span>}
                        </div>
                        <div className="mt-1.5">
                          {q.type === "Text" ? (
                            <textarea rows={3} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 resize-none" />
                          ) : q.type === "Number" ? (
                            <Input type="number" placeholder="0" />
                          ) : (
                            <div className="flex items-center gap-3">
                              {["Yes", "No"].map((opt) => (
                                <label key={opt} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-200 cursor-pointer hover:border-brand-300 has-[:checked]:border-brand-500 has-[:checked]:bg-brand-50">
                                  <input type="radio" name={`q${i}`} className="accent-brand-500" />
                                  <span className="text-sm">{opt}</span>
                                </label>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <Button onClick={() => setSubmitted(true)} className="w-full justify-center mt-3" size="lg">Submit Application</Button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <div className="text-[13px] font-medium text-slate-700 mb-1.5">{label}</div>
      {children}
    </div>
  );
}

window.PublicPage = PublicPage;
