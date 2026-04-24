import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import { format } from "date-fns";

function StatCard({ label, value, accent = "blue", sub }: { label: string; value: string | number; accent?: "blue" | "magenta"; sub?: string }) {
  return (
    <div className={`card p-5 border-t-2 ${accent === "blue" ? "border-t-blue" : "border-t-magenta"}`}>
      <p className="label">{label}</p>
      <p className={`text-2xl font-bold ${accent === "blue" ? "text-blue" : "text-magenta"}`}>{value}</p>
      {sub && <p className="text-xs text-secondary mt-1">{sub}</p>}
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
  const { data: recent } = useQuery({ queryKey: ["workouts", "recent"], queryFn: () => api.workouts.list({ limit: 5 }) });

  return (
    <div className="p-8 space-y-8 max-w-5xl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-primary">Dashboard</h1>
        <Link to="/workouts/new" className="btn-primary flex items-center gap-2">
          <span>+</span> Start workout
        </Link>
      </div>

      {isLoading ? (
        <div className="text-secondary text-sm">Loading…</div>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard label="Total workouts"  value={dash?.total_workouts ?? 0} accent="blue" />
            <StatCard label="This week"        value={dash?.workouts_this_week ?? 0} sub="workouts" accent="blue" />
            <StatCard label="Streak"           value={`${dash?.current_streak_days ?? 0} days`} accent="magenta" />
            <StatCard label="Avg duration"     value={fmtDuration(dash?.avg_workout_duration_seconds)} accent="magenta" />
          </div>

          {(dash?.steps_today || dash?.resting_hr_today || dash?.calories_today) && (
            <div>
              <p className="label mb-3">Today — Garmin</p>
              <div className="grid grid-cols-3 gap-4">
                <StatCard label="Steps"      value={dash.steps_today?.toLocaleString() ?? "—"} accent="blue" />
                <StatCard label="Resting HR" value={dash.resting_hr_today ? `${dash.resting_hr_today} bpm` : "—"} accent="magenta" />
                <StatCard label="Active cal" value={dash.calories_today?.toLocaleString() ?? "—"} accent="blue" />
              </div>
            </div>
          )}

          <div>
            <div className="flex items-center justify-between mb-3">
              <p className="label">Recent workouts</p>
              <Link to="/workouts" className="text-xs text-blue hover:text-blue-dim transition-colors">View all →</Link>
            </div>
            <div className="space-y-2">
              {(recent ?? []).map((w) => (
                <Link key={w.id} to={`/workouts/${w.id}`}
                  className="card px-5 py-4 flex items-center justify-between hover:border-border/80 hover:bg-card/80 transition-all block">
                  <div>
                    <p className="text-sm font-medium text-primary">{w.title ?? "Workout"}</p>
                    <p className="text-xs text-secondary mt-0.5">
                      {format(new Date(w.started_at), "EEE d MMM")} · {w.sets.length} sets
                      {w.duration_seconds ? ` · ${fmtDuration(w.duration_seconds)}` : ""}
                    </p>
                  </div>
                  <div className="text-right space-y-0.5">
                    {w.avg_heart_rate && <p className="text-xs text-magenta">♥ {w.avg_heart_rate} bpm</p>}
                    {w.calories_burned && <p className="text-xs text-secondary">{w.calories_burned} cal</p>}
                  </div>
                </Link>
              ))}
              {(recent ?? []).length === 0 && (
                <div className="card p-8 text-center">
                  <p className="text-secondary text-sm mb-3">No workouts yet</p>
                  <Link to="/workouts/new" className="btn-primary inline-flex">Start your first workout</Link>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
