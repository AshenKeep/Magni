import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import { format } from "date-fns";

function fmtDuration(secs: number | null | undefined): string {
  if (!secs) return "";
  const m = Math.round(secs / 60);
  return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`;
}

const LIMIT = 20;

export default function WorkoutsPage() {
  const [offset, setOffset] = useState(0);
  const { data: workouts, isLoading } = useQuery({
    queryKey: ["workouts", offset],
    queryFn: () => api.workouts.list({ limit: LIMIT, offset }),
  });

  return (
    <div className="p-8 space-y-6 max-w-4xl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-primary">Workouts</h1>
        <div className="flex gap-3">
          <Link to="/templates" className="btn-secondary">From template</Link>
          <Link to="/workouts/new" className="btn-primary">+ New workout</Link>
        </div>
      </div>

      {isLoading && <div className="text-secondary text-sm">Loading…</div>}

      <div className="space-y-2">
        {(workouts ?? []).map((w) => (
          <Link key={w.id} to={`/workouts/${w.id}`}
            className="card px-5 py-4 flex items-center justify-between hover:bg-card/80 transition-all block">
            <div>
              <p className="font-medium text-primary">{w.title ?? "Workout"}</p>
              <p className="text-xs text-secondary mt-1">
                {format(new Date(w.started_at), "EEEE d MMMM yyyy")}
                {w.duration_seconds ? ` · ${fmtDuration(w.duration_seconds)}` : ""}
                {` · ${w.sets.length} sets`}
              </p>
            </div>
            <div className="flex gap-4 text-xs items-center">
              {w.avg_heart_rate  && <span className="text-magenta">♥ {w.avg_heart_rate}</span>}
              {w.calories_burned && <span className="text-secondary">{w.calories_burned} cal</span>}
              <span className="text-secondary">→</span>
            </div>
          </Link>
        ))}
        {!isLoading && (workouts ?? []).length === 0 && (
          <div className="card p-10 text-center">
            <p className="text-secondary text-sm mb-4">No workouts logged yet</p>
            <Link to="/workouts/new" className="btn-primary inline-flex">Start your first workout</Link>
          </div>
        )}
      </div>

      <div className="flex gap-4">
        <button onClick={() => setOffset(Math.max(0, offset - LIMIT))} disabled={offset === 0}
          className="text-sm text-secondary hover:text-primary disabled:opacity-30 transition-colors">
          ← Previous
        </button>
        <button onClick={() => setOffset(offset + LIMIT)} disabled={(workouts ?? []).length < LIMIT}
          className="text-sm text-secondary hover:text-primary disabled:opacity-30 transition-colors">
          Next →
        </button>
      </div>
    </div>
  );
}
