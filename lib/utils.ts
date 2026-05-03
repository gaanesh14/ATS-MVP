import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatINR(value: number | null | undefined): string {
  if (value == null) return '—';
  if (value >= 10000000) return `₹${(value / 10000000).toFixed(1)} Cr`;
  if (value >= 100000) return `₹${(value / 100000).toFixed(1)} L`;
  return `₹${value.toLocaleString('en-IN')}`;
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

// Treat very large maxes as "no upper bound". The DB column defaults to 100;
// that almost always means "the recruiter didn't pick a max", not "literally
// up to 100 years of experience" — so format it as open-ended.
const EXP_MAX_OPEN = 50;

export function formatExperienceRange(
  min: number | null | undefined,
  max: number | null | undefined
): string {
  const lo = min ?? 0;
  const hi = max ?? null;
  const hiOpen = hi == null || hi >= EXP_MAX_OPEN;
  if (lo === 0 && hiOpen) return 'Any experience';
  if (hiOpen) return `${lo}+ yrs`;
  if (lo === 0) return `Up to ${hi} yrs`;
  if (lo === hi) return `${lo} yrs`;
  return `${lo}–${hi} yrs`;
}

// For a single candidate's parsed experience number.
export function formatExperience(years: number | null | undefined): string {
  if (years == null) return '—';
  if (years === 0) return 'Fresher';
  if (years < 1) return '< 1 yr';
  if (Number.isInteger(years)) return `${years} yr${years === 1 ? '' : 's'}`;
  return `${years} yrs`;
}
