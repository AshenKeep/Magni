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
        <h1 className="text-2xl font-bold text-gray-100">Workouts</h1>
        <p className="text-xs text-gray-600">Synced from Android app</p>
      </div>

      {isLoading && <p className="text-gray-500 text-sm">Loading…</p>}

      <div className="space-y-2">
        {(workouts ?? []).map((w) => (
          <Link
            key={w.id} to={`/workouts/${w.id}`}
            className="block bg-gray-900 border border-gray-800 rounded-xl px-5 py-4 hover:border-gray-700 transition-colors"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-gray-100">{w.title ?? "Workout"}</p>
                <p className="text-xs text-gray-500 mt-1">
                  {format(new Date(w.started_at), "EEEE d MMMM yyyy")}
                  {w.duration_seconds ? ` · ${fmtDuration(w.duration_seconds)}` : ""}
                  {` · ${w.sets.length} sets`}
                </p>
              </div>
              <div className="flex gap-3 text-xs">
                {w.avg_heart_rate  && <span className="text-red-400">♥ {w.avg_heart_rate}</span>}
                {w.calories_burned && <span className="text-gray-400">{w.calories_burned} cal</span>}
              </div>
            </div>
          </Link>
        ))}
        {!isLoading && (workouts ?? []).length === 0 && (
          <p className="text-gray-600 text-sm">No workouts logged yet.</p>
        )}
      </div>

      <div className="flex gap-4">
        <button onClick={() => setOffset(Math.max(0, offset - LIMIT))} disabled={offset === 0}
          className="text-sm text-gray-500 hover:text-gray-300 disabled:opacity-30 transition-colors">
          ← Previous
        </button>
        <button onClick={() => setOffset(offset + LIMIT)} disabled={(workouts ?? []).length < LIMIT}
          className="text-sm text-gray-500 hover:text-gray-300 disabled:opacity-30 transition-colors">
          Next →
        </button>
      </div>
    </div>
  );
}
