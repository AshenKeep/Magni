import { useState, useEffect } from "react";

/**
 * Converts a seconds value to HH:MM:SS parts.
 * Returns {h, m, s} — each a string so empty inputs don't show "0".
 */
function secsToParts(total: number | null | undefined) {
  if (total == null || total <= 0) return { h: "", m: "", s: "" };
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return {
    h: h > 0 ? String(h) : "",
    m: (h > 0 || m > 0) ? String(m) : "",
    s: String(s),
  };
}

function partsToSecs(h: string, m: string, s: string): number | null {
  const hours = parseInt(h || "0", 10);
  const mins  = parseInt(m || "0", 10);
  const secs  = parseInt(s || "0", 10);
  if (isNaN(hours) || isNaN(mins) || isNaN(secs)) return null;
  const total = hours * 3600 + mins * 60 + secs;
  return total > 0 ? total : null;
}

interface DurationInputProps {
  /** Current value in seconds, or null/undefined for empty */
  value: number | null | undefined;
  onChange: (seconds: number | null) => void;
  compact?: boolean;
  /** Label shown above (non-compact) or as placeholder (compact) */
  label?: string;
}

/**
 * Time duration input split into H / M / S fields.
 * Stores and emits values in seconds. Each field is optional —
 * leaving all blank emits null.
 */
export function DurationInput({ value, onChange, compact = false, label = "Duration" }: DurationInputProps) {
  const initial = secsToParts(value);
  const [h, setH] = useState(initial.h);
  const [m, setM] = useState(initial.m);
  const [s, setS] = useState(initial.s);

  // Sync when value changes externally (e.g. template pre-fill)
  useEffect(() => {
    const p = secsToParts(value);
    setH(p.h); setM(p.m); setS(p.s);
  }, [value]);

  const emit = (nh: string, nm: string, ns: string) => {
    onChange(partsToSecs(nh, nm, ns));
  };

  const base = "bg-card border border-border rounded-lg text-sm text-primary text-center focus:outline-none focus:border-blue";
  const w = compact ? "w-10 px-1 py-2" : "w-14 px-2 py-2";

  return (
    <div className={compact ? "flex items-center gap-1" : "space-y-1"}>
      {!compact && <label className="text-xs text-secondary">{label}</label>}
      <div className="flex items-center gap-1">
        <input
          type="number" min={0} max={99} placeholder="h"
          value={h}
          onChange={e => { setH(e.target.value); emit(e.target.value, m, s); }}
          className={`${base} ${w}`}
        />
        <span className="text-secondary text-xs">h</span>
        <input
          type="number" min={0} max={59} placeholder="m"
          value={m}
          onChange={e => { setM(e.target.value); emit(h, e.target.value, s); }}
          className={`${base} ${w}`}
        />
        <span className="text-secondary text-xs">m</span>
        <input
          type="number" min={0} max={59} placeholder="s"
          value={s}
          onChange={e => { setS(e.target.value); emit(h, m, e.target.value); }}
          className={`${base} ${w}`}
        />
        <span className="text-secondary text-xs">s</span>
      </div>
    </div>
  );
}
