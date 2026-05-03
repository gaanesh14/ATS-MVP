// Mock data for PhotonX ATS

const TAGS = ["React", "TypeScript", "Node.js", "Python", "AWS", "Kubernetes", "Figma", "GraphQL", "SQL", "Tailwind", "Next.js", "Java", "Angular", "Go", "Rust", "Jest"];

const SOURCES = ["LinkedIn", "Website", "Twitter", "Referred"];

const STAGES = [
  { id: "new",         label: "New",         color: "blue"   },
  { id: "shortlisted", label: "Shortlisted", color: "amber"  },
  { id: "interview",   label: "Interview",   color: "violet" },
  { id: "hired",       label: "Hired",       color: "emerald"},
  { id: "rejected",    label: "Rejected",    color: "rose"   },
];

const JOBS = [
  { id: "j1",  title: "Senior Frontend Engineer",  location: "Hyderabad", expMin: 4, expMax: 7, status: "Open",   applicants: 162, ats: 84, postedAt: "2d ago",  isNew: true,  type: "Onsite", vacancies: 3, salaryMin: 12, salaryMax: 25, deadline: "23 Mar, 25", postedDate: "23 Feb, 25" },
  { id: "j2",  title: "Backend Engineer (Node.js)", location: "Bangalore", expMin: 3, expMax: 6, status: "Open",   applicants: 28,  ats: 71, postedAt: "4d ago",  isNew: false, type: "Hybrid", vacancies: 2, salaryMin: 10, salaryMax: 22, deadline: "30 Mar, 25", postedDate: "21 Feb, 25" },
  { id: "j3",  title: "Product Designer",           location: "Remote",    expMin: 2, expMax: 5, status: "Open",   applicants: 56,  ats: 78, postedAt: "6d ago",  isNew: true,  type: "Remote", vacancies: 1, salaryMin: 14, salaryMax: 24, deadline: "15 Apr, 25", postedDate: "19 Feb, 25" },
  { id: "j4",  title: "DevOps Engineer",            location: "Hyderabad", expMin: 5, expMax: 8, status: "Open",   applicants: 12,  ats: 65, postedAt: "1w ago",  isNew: false, type: "Onsite", vacancies: 1, salaryMin: 18, salaryMax: 32, deadline: "10 Apr, 25", postedDate: "17 Feb, 25" },
  { id: "j5",  title: "Marketing Lead",             location: "Mumbai",    expMin: 6, expMax: 10,status: "Closed", applicants: 38,  ats: 73, postedAt: "3w ago",  isNew: false, type: "Onsite", vacancies: 1, salaryMin: 20, salaryMax: 35, deadline: "01 Feb, 25", postedDate: "01 Feb, 25" },
  { id: "j6",  title: "QA Engineer",                location: "Pune",      expMin: 2, expMax: 4, status: "Open",   applicants: 19,  ats: 58, postedAt: "5d ago",  isNew: false, type: "Onsite", vacancies: 2, salaryMin: 6,  salaryMax: 14, deadline: "20 Apr, 25", postedDate: "20 Feb, 25" },
  { id: "j7",  title: "Mobile Engineer (iOS)",      location: "Bangalore", expMin: 3, expMax: 6, status: "Open",   applicants: 31,  ats: 76, postedAt: "8d ago",  isNew: false, type: "Hybrid", vacancies: 1, salaryMin: 14, salaryMax: 26, deadline: "25 Apr, 25", postedDate: "15 Feb, 25" },
  { id: "j8",  title: "Data Engineer",              location: "Hyderabad", expMin: 4, expMax: 7, status: "Open",   applicants: 22,  ats: 69, postedAt: "2w ago",  isNew: false, type: "Onsite", vacancies: 2, salaryMin: 16, salaryMax: 28, deadline: "12 Apr, 25", postedDate: "10 Feb, 25" },
  { id: "j9",  title: "Engineering Manager",        location: "Remote",    expMin: 8, expMax: 12,status: "Open",   applicants: 17,  ats: 82, postedAt: "10d ago", isNew: false, type: "Remote", vacancies: 1, salaryMin: 35, salaryMax: 55, deadline: "30 Apr, 25", postedDate: "13 Feb, 25" },
  { id: "j10", title: "Customer Success Manager",   location: "Mumbai",    expMin: 3, expMax: 5, status: "Closed", applicants: 14,  ats: 61, postedAt: "1mo ago", isNew: false, type: "Hybrid", vacancies: 1, salaryMin: 8,  salaryMax: 16, deadline: "01 Mar, 25", postedDate: "01 Jan, 25" },
  { id: "j11", title: "Security Engineer",          location: "Bangalore", expMin: 5, expMax: 9, status: "Open",   applicants: 9,   ats: 74, postedAt: "12d ago", isNew: false, type: "Onsite", vacancies: 1, salaryMin: 20, salaryMax: 38, deadline: "18 Apr, 25", postedDate: "11 Feb, 25" },
  { id: "j12", title: "Content Writer",             location: "Remote",    expMin: 1, expMax: 3, status: "Open",   applicants: 47,  ats: 67, postedAt: "9d ago",  isNew: false, type: "Remote", vacancies: 2, salaryMin: 4,  salaryMax: 9,  deadline: "22 Apr, 25", postedDate: "14 Feb, 25" },
];

const FIRST = ["Savannah", "Kathryn", "Courtney", "Kristin", "Theresa", "Brooklyn", "Ralph", "Wade", "Marvin", "Esther", "Jenny", "Floyd", "Cody", "Bessie", "Cameron", "Devon", "Aarav", "Priya", "Rohan", "Ananya", "Vikram", "Meera", "Arjun", "Isha", "Karan", "Neha", "Aditya", "Riya", "Siddharth", "Sneha"];
const LAST  = ["Nguyen", "Murphy", "Henry", "Watson", "Webb", "Simmons", "Edwards", "Warren", "McKinney", "Howard", "Wilson", "Miles", "Fisher", "Cooper", "Williamson", "Lane", "Sharma", "Patel", "Iyer", "Reddy", "Kapoor", "Mehta", "Verma", "Singh", "Joshi", "Rao"];

function rand(seed) {
  let x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}

function makeCandidates(count, jobIdSalt) {
  const out = [];
  for (let i = 0; i < count; i++) {
    const seed = jobIdSalt * 1000 + i + 1;
    const fn = FIRST[Math.floor(rand(seed * 1.7) * FIRST.length)];
    const ln = LAST[Math.floor(rand(seed * 2.3) * LAST.length)];
    const stage = STAGES[Math.floor(rand(seed * 3.1) * STAGES.length)].id;
    const ats = Math.floor(40 + rand(seed * 4.7) * 60); // 40..100
    const t1 = TAGS[Math.floor(rand(seed * 5.2) * TAGS.length)];
    const t2 = TAGS[Math.floor(rand(seed * 6.6) * TAGS.length)];
    const tags = t1 === t2 ? [t1] : [t1, t2];
    const source = SOURCES[Math.floor(rand(seed * 7.9) * SOURCES.length)];
    const days = Math.floor(rand(seed * 8.3) * 50);
    const d = new Date(2025, 1, 1);
    d.setDate(d.getDate() + days);
    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const applied = `${d.getDate()} ${monthNames[d.getMonth()]}, 25`;
    const avatarIdx = ((seed * 13) % 70) + 1;
    const exp = Math.floor(2 + rand(seed * 9.1) * 8);
    const daysInStage = Math.floor(rand(seed * 19.4) * 14);
    const notice = [15, 30, 45, 60, 90][Math.floor(rand(seed * 11.2) * 5)];
    const expectedSalary = Math.floor(8 + rand(seed * 12.4) * 30);
    const currentSalary = Math.max(4, expectedSalary - Math.floor(rand(seed * 13.6) * 8) - 2);
    const companies = ["Flipkart", "Razorpay", "Stripe", "Atlassian", "Swiggy", "Zomato", "Postman", "Freshworks", "Gojek", "Notion", "Linear", "Vercel"];
    const roles = ["Senior Engineer", "Software Engineer", "Lead Engineer", "Staff Engineer", "Designer", "Product Designer", "Engineering Manager"];
    const locations = ["Hyderabad", "Bangalore", "Mumbai", "Pune", "Delhi", "Remote", "Chennai"];
    out.push({
      id: `${jobIdSalt}-c${i + 1}`,
      idx: i + 1,
      name: `${fn} ${ln}`,
      email: `${fn.toLowerCase()}@${ln.toLowerCase()}.com`,
      phone: `+91 9${Math.floor(rand(seed * 14.8) * 900000000 + 100000000)}`,
      avatar: `https://i.pravatar.cc/96?img=${avatarIdx}`,
      stage,
      ats,
      tags,
      source,
      applied,
      experience: exp,
      daysInStage,
      noticePeriod: notice,
      currentCompany: companies[Math.floor(rand(seed * 15.7) * companies.length)],
      currentRole: roles[Math.floor(rand(seed * 16.5) * roles.length)],
      location: locations[Math.floor(rand(seed * 17.2) * locations.length)],
      currentSalary,
      expectedSalary,
      atsIssues: ats < 70 ? ["Missing standard sections: Skills", "Resume not parsed cleanly in places"] : ats < 85 ? ["Skills section could be more detailed"] : [],
      answers: [
        { q: "Why are you leaving your current role?", a: "Looking for growth and a more product-focused team where I can ship end-to-end features." },
        { q: "Years of React experience?", a: `${exp - 1} years` },
        { q: "Are you open to relocating?", a: rand(seed * 18.1) > 0.5 ? "Yes" : "No, but open to hybrid" },
      ],
    });
  }
  return out;
}

const JOB_QUESTIONS = [
  { q: "Why are you leaving your current role?", type: "Text",   required: true  },
  { q: "Years of React experience?",             type: "Number", required: true  },
  { q: "Are you open to relocating to Hyderabad?", type: "Yes/No", required: true  },
  { q: "What is your expected CTC (in ₹ lakhs)?", type: "Number", required: true  },
  { q: "Briefly describe a challenging project you led.", type: "Text", required: false },
];

const JOB_DESCRIPTION = [
  "We're looking for a Senior Frontend Engineer to lead the development of our next-generation recruiter dashboard. You'll work closely with designers, backend engineers and product managers to ship polished, performant interfaces used by hundreds of recruiting teams every day.",
  "You'll own significant parts of our React + TypeScript codebase, drive the design system forward, and mentor mid-level engineers. We value people who think carefully about UX details, ship pragmatically, and care about the craft of building software.",
  "This role is based out of our Hyderabad HQ, with flexibility to work hybrid. You'll be part of a small, senior team where your decisions visibly shape the product.",
];

const JOB_SKILLS = ["React", "TypeScript", "Next.js", "Tailwind", "GraphQL", "Jest", "Storybook", "Node.js"];

const RECENT_APPLICANTS = [
  { idx: 1, name: "Savannah Nguyen",  email: "savannah@nguyen.com",  job: "Senior Frontend Engineer", applied: "1 Mar, 25", ats: 84, source: "LinkedIn", avatar: "https://i.pravatar.cc/96?img=47" },
  { idx: 2, name: "Aarav Sharma",     email: "aarav@sharma.com",     job: "Backend Engineer (Node.js)", applied: "1 Mar, 25", ats: 72, source: "Website",  avatar: "https://i.pravatar.cc/96?img=12" },
  { idx: 3, name: "Courtney Henry",   email: "courtney@henry.com",   job: "Product Designer", applied: "29 Feb, 25", ats: 91, source: "Referred", avatar: "https://i.pravatar.cc/96?img=5"  },
  { idx: 4, name: "Priya Iyer",       email: "priya@iyer.com",       job: "DevOps Engineer", applied: "29 Feb, 25", ats: 65, source: "Twitter",  avatar: "https://i.pravatar.cc/96?img=24" },
  { idx: 5, name: "Wade Warren",      email: "wade@warren.com",      job: "QA Engineer", applied: "28 Feb, 25", ats: 58, source: "LinkedIn", avatar: "https://i.pravatar.cc/96?img=33" },
];

window.MOCK = { TAGS, SOURCES, STAGES, JOBS, JOB_QUESTIONS, JOB_DESCRIPTION, JOB_SKILLS, RECENT_APPLICANTS, makeCandidates };
