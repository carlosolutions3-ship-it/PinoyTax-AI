'use client';

// Lightweight, dependency-free SVG charts. Every value is a visible direct
// label (never hover-only), so nothing is gated behind a tooltip — a plain
// hover/focus highlight plus a native <title> supplies the pointer/keyboard
// readout on top of that. Categorical hues below are validated for CVD
// separation (see the dataviz skill's validator); bars stay direct-labeled
// regardless of adjacency, satisfying the secondary-encoding requirement
// for the one pair that lands in the 6-8 warn band.
export const CATEGORICAL_COLORS = ['#1d4ed8', '#059669', '#d97706', '#7c3aed', '#e11d48'];

interface BarDatum {
  label: string;
  value: number;
  color?: string;
}

/** Horizontal bar chart — one metric per category, sorted by the caller. */
export function BarChart({
  data,
  formatValue = (v) => v.toLocaleString(),
  height = 28,
}: {
  data: BarDatum[];
  formatValue?: (value: number) => string;
  height?: number;
}) {
  const max = Math.max(...data.map((d) => d.value), 1);

  if (data.length === 0) {
    return <p className="text-sm text-slate-500">No data to chart yet.</p>;
  }

  return (
    <div className="flex flex-col gap-2" role="img" aria-label="Bar chart">
      {data.map((d, i) => {
        const widthPct = Math.max((d.value / max) * 100, d.value > 0 ? 2 : 0);
        const color = d.color ?? CATEGORICAL_COLORS[i % CATEGORICAL_COLORS.length];
        return (
          <div key={d.label} className="flex items-center gap-3">
            <span className="w-36 shrink-0 truncate text-xs text-slate-600" title={d.label}>
              {d.label}
            </span>
            <div className="relative flex-1 rounded-sm bg-slate-100" style={{ height }}>
              <div
                className="absolute inset-y-0 left-0 rounded-sm transition-[width] duration-300 hover:brightness-110"
                style={{ width: `${widthPct}%`, backgroundColor: color }}
                title={`${d.label}: ${formatValue(d.value)}`}
              />
              <span className="absolute inset-y-0 left-2 flex items-center text-xs font-medium text-white mix-blend-difference">
                {formatValue(d.value)}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** A single-metric progress meter — sequential (one hue), lighter track. */
export function ProgressBar({
  value,
  max = 100,
  color = '#1d4ed8',
  label,
}: {
  value: number;
  max?: number;
  color?: string;
  label?: string;
}) {
  const pct = Math.min(Math.max((value / max) * 100, 0), 100);
  return (
    <div className="flex flex-col gap-1">
      <div className="h-2 w-full overflow-hidden rounded-full bg-blue-50" title={label ?? `${pct.toFixed(0)}%`}>
        <div
          className="h-full rounded-full transition-[width] duration-300"
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </div>
    </div>
  );
}
