// Circular progress indicator for ATS score. Used in the candidates list table
// where the score deserves more visual presence than a flat pill.

export function AtsRing({
  score,
  size = 44,
}: {
  score: number | null | undefined;
  size?: number;
}) {
  const stroke = 4;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;

  if (score == null) {
    return (
      <div
        className="grid place-items-center rounded-full bg-slate-100 text-[12px] font-semibold text-slate-400"
        style={{ width: size, height: size }}
        title="Not yet scored"
      >
        —
      </div>
    );
  }

  const pct = Math.max(0, Math.min(100, score));
  const dash = (pct / 100) * c;
  const color =
    score >= 80
      ? '#10b981' // emerald-500
      : score >= 60
      ? '#84cc16' // lime-500
      : score >= 40
      ? '#f59e0b' // amber-500
      : '#f43f5e'; // rose-500

  return (
    <div
      className="relative inline-flex items-center justify-center"
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke="#e2e8f0"
          strokeWidth={stroke}
          fill="none"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={color}
          strokeWidth={stroke}
          fill="none"
          strokeDasharray={`${dash} ${c}`}
          strokeLinecap="round"
        />
      </svg>
      <span className="num absolute text-[12px] font-semibold text-slate-900">{score}</span>
    </div>
  );
}
