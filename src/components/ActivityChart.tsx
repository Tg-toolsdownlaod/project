import { useState } from 'react';

export interface ActivityPoint {
  /** ISO date (YYYY-MM-DD) for the day this bar covers. */
  date: string;
  value: number;
}

/**
 * Downloads completed per day. One series, so no legend — the card title names
 * it — and no number on every bar; the hover tooltip carries the exact value.
 */
export function ActivityChart({ data, label }: { data: ActivityPoint[]; label: string }) {
  const [hovered, setHovered] = useState<number | null>(null);
  const max = Math.max(...data.map((d) => d.value), 1);

  if (data.every((d) => d.value === 0)) {
    return (
      <div className="flex h-40 items-center justify-center rounded-lg border border-dashed border-dark-800 text-xs text-dark-600">
        No completed downloads in this period yet
      </div>
    );
  }

  return (
    <div className="relative">
      {/* Recessive gridline at the top of the scale, labelled once. */}
      <div className="relative h-40">
        <div className="absolute inset-x-0 top-0 border-t border-dashed border-dark-800" />
        <span className="absolute -top-2 right-0 text-[10px] tabular-nums text-dark-600">{max}</span>

        <div className="flex h-full items-end gap-[2px]">
          {data.map((point, index) => {
            const heightPct = (point.value / max) * 100;
            const isHovered = hovered === index;
            return (
              <button
                key={point.date}
                onMouseEnter={() => setHovered(index)}
                onMouseLeave={() => setHovered(null)}
                onFocus={() => setHovered(index)}
                onBlur={() => setHovered(null)}
                className="group relative flex h-full flex-1 items-end"
                aria-label={`${formatDay(point.date)}: ${point.value}`}
              >
                {/* An invisible full-height target so short bars stay hoverable. */}
                <span
                  className={`w-full rounded-t transition-colors ${
                    isHovered ? 'bg-primary-400' : 'bg-primary-500/70'
                  }`}
                  style={{ height: `${Math.max(heightPct, point.value > 0 ? 4 : 1)}%` }}
                />
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-2 flex items-center justify-between text-[10px] text-dark-600">
        <span>{formatDay(data[0]?.date)}</span>
        <span className="text-dark-500">{label}</span>
        <span>{formatDay(data[data.length - 1]?.date)}</span>
      </div>

      {hovered !== null && data[hovered] && (
        <div className="pointer-events-none absolute -top-2 left-1/2 -translate-x-1/2 -translate-y-full rounded-lg border border-dark-700 bg-dark-950 px-2.5 py-1.5 text-[11px] shadow-xl">
          <span className="font-semibold text-white tabular-nums">{data[hovered].value}</span>
          <span className="text-dark-400"> · {formatDay(data[hovered].date)}</span>
        </div>
      )}
    </div>
  );
}

function formatDay(iso?: string): string {
  if (!iso) return '';
  return new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
}
