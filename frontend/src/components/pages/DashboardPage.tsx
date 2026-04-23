import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { format } from "date-fns";

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
      <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">{label}</p>
      <p className="text-2xl font-bold text-gray-100">{value}</p>
      {sub && <p className="text-xs text-gray-500 mt-1">{sub}</p>}
    </div>
  );
}

function fmtDuration(secs: number | null | undefined): string {
  if (!secs) return "—";
  const m = Math.round(secs / 60);
  return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`;
}

export default function DashboardPage() {
  const { data: dash, isLoading } = useQuery({ queryKey: ["dashboard"], queryFn: api.dashboard.get });
  const { data: recent }          = useQuery({ queryKey: ["workouts", "recent"], queryFn: () => api.workouts.list({ limit: 5 }) });

  if (isLoading) return <div className="p-8 text-gray-500 text-sm">Loading…</div>;

  return (
    <div className="p-8 space-y-8 max-w-5xl">
      <h1 className="text-2xl font-bold text-gray-100">Dashboard</h1>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total workouts"  value={dash?.total_workouts ?? 0} />
        <StatCard label="This week"       value={dash?.workouts_this_week ?? 0} sub="workouts" />
        <StatCard label="Streak"          value={`${dash?.current_streak_days ?? 0} days`} />
        <StatCard label="Avg duration"    value={fmtDuration(dash?.avg_workout_duration_seconds)} />
      </div>

      {(dash?.steps_today || dash?.resting_hr_today || dash?.calories_today) && (
        <div>
          <h2 className="text-xs text-gray-500 uppercase tracking-wider mb-3">Today — Garmin</h2>
          <div className="grid grid-cols-3 gap-4">
            <StatCard label="Steps"       value={dash.steps_today?.toLocaleString() ?? "—"} />
            <StatCard label="Resting HR"  value={dash.resting_hr_today ? `${dash.resting_hr_today} bpm` : "—"} />
            <StatCard label="Active cal"  value={dash.calories_today?.toLocaleString() ?? "—"} />
          </div>
        </div>
      )}

      <div>
        <h2 className="text-xs text-gray-500 uppercase tracking-wider mb-3">Recent workouts</h2>
        <div className="space-y-2">
          {(recent ?? []).map((w) => (
            <div key={w.id} className="bg-gray-900 border border-gray-800 rounded-xl px-5 py-4 flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-100">{w.title ?? "Workout"}</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  {format(new Date(w.started_at), "EEE d MMM")} · {w.sets.length} sets
                </p>
              </div>
              <div className="text-right">
                {w.duration_seconds && <p className="text-xs text-gray-400">{fmtDuration(w.duration_seconds)}</p>}
                {w.avg_heart_rate   && <p className="text-xs text-red-400">♥ {w.avg_heart_rate} bpm</p>}
              </div>
            </div>
          ))}
          {(recent ?? []).length === 0 && (
            <p className="text-sm text-gray-600">No workouts yet — log your first one in the Android app.</p>
          )}
        </div>
      </div>
    </div>
  );
}
