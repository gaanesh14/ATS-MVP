// Create New Job form

const { Icons, UI } = window;
const { Input, Select, Button, Toggle, cn } = UI;

function CreateJob({ navigate }) {
  const [questions, setQuestions] = React.useState([
    { q: "Why are you interested in this role?", type: "Text", required: true },
    { q: "Years of relevant experience?", type: "Number", required: true },
  ]);

  const addQuestion = () => setQuestions([...questions, { q: "", type: "Text", required: false }]);
  const updateQ = (i, patch) => setQuestions(questions.map((q, idx) => idx === i ? { ...q, ...patch } : q));
  const delQ = (i) => setQuestions(questions.filter((_, idx) => idx !== i));

  return (
    <div className="px-8 py-6 max-w-2xl mx-auto">
      <h1 className="text-[28px] font-semibold tracking-tight text-slate-900">Create new job</h1>
      <p className="mt-1 text-slate-500">Tell candidates about the role. Takes about 3 minutes.</p>

      <div className="mt-6 space-y-6">
        <FormSection title="Basic info">
          <Field label="Title" error="Required">
            <Input placeholder="e.g. Senior Frontend Engineer" className="[&>input]:border-rose-300 [&>input]:focus:ring-rose-500/30" />
          </Field>
          <Field label="Description">
            <textarea rows={6} placeholder="Describe the role, responsibilities and what success looks like…" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 resize-none" />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Location"><Input placeholder="e.g. Hyderabad" /></Field>
            <Field label="Job Type">
              <Select defaultValue="Onsite">
                <option>Onsite</option><option>Remote</option><option>Hybrid</option>
              </Select>
            </Field>
          </div>
        </FormSection>

        <FormSection title="Hiring details">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Min Experience (yrs)" success>
              <div className="relative">
                <Input type="number" defaultValue="3" className="[&>input]:border-emerald-300 [&>input]:pr-9" />
                <Icons.CheckCircle className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-emerald-500 pointer-events-none" />
              </div>
            </Field>
            <Field label="Max Experience (yrs)"><Input type="number" placeholder="6" /></Field>
            <Field label="Min Salary (₹L)"><Input type="number" placeholder="12" /></Field>
            <Field label="Max Salary (₹L)"><Input type="number" placeholder="25" /></Field>
            <Field label="Vacancies"><Input type="number" placeholder="1" /></Field>
            <Field label="Deadline"><Input type="date" /></Field>
          </div>
        </FormSection>

        <FormSection title="Screening Questions" right={<Button variant="secondary" size="sm" icon={<Icons.Plus className="w-3.5 h-3.5" />} onClick={addQuestion}>Add Question</Button>}>
          <div className="space-y-3">
            {questions.map((q, i) => (
              <div key={i} className="border border-slate-100 rounded-xl p-3">
                <div className="flex items-start gap-2">
                  <Input className="flex-1" placeholder={`Question ${i + 1}`} value={q.q} onChange={(e) => updateQ(i, { q: e.target.value })} />
                  <Select className="w-32" value={q.type} onChange={(e) => updateQ(i, { type: e.target.value })}>
                    <option>Text</option><option>Number</option><option>Yes/No</option>
                  </Select>
                  <button onClick={() => delQ(i)} className="w-10 h-10 rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-600 grid place-items-center"><Icons.Trash2 className="w-4 h-4" /></button>
                </div>
                <div className="mt-2 flex items-center gap-2 text-sm">
                  <Toggle checked={q.required} onChange={(v) => updateQ(i, { required: v })} />
                  <span className="text-slate-600">Required</span>
                </div>
              </div>
            ))}
          </div>
        </FormSection>

        <div className="flex items-center justify-end gap-3 pt-2">
          <Button variant="secondary" onClick={() => navigate({ name: "jobs" })}>Cancel</Button>
          <Button onClick={() => navigate({ name: "jobs" })}>Create Job</Button>
        </div>
      </div>
    </div>
  );
}

function FormSection({ title, right, children }) {
  return (
    <div className="bg-white border border-slate-100 rounded-2xl shadow-card p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-slate-900 text-[15px]">{title}</h3>
        {right}
      </div>
      <div className="space-y-4">{children}</div>
    </div>
  );
}

function Field({ label, error, success, children }) {
  return (
    <div>
      <div className="text-[13px] font-medium text-slate-700 mb-1.5 flex items-center gap-1.5">
        {label}
        {success && <Icons.CheckCircle className="w-3.5 h-3.5 text-emerald-500" />}
      </div>
      {children}
      {error && <div className="mt-1 text-[12px] text-rose-600 inline-flex items-center gap-1"><Icons.AlertCircle className="w-3 h-3" />{error}</div>}
    </div>
  );
}

window.CreateJob = CreateJob;
