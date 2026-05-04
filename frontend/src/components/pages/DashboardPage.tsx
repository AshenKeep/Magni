import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import { format, isToday } from "date-fns";
import type { WorkoutResponse } from "@/lib/api";

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

function TodayWorkoutCard({ workout }: { workout: WorkoutResponse }) {
  const navigate = useNavigate();
  const isPlanned = !workout.ended_at && workout.sets.length === 0;
  const isInProgress = !workout.ended_at && workout.sets.length > 0;
  const exCount = new Set(workout.sets.map(s => s.exercise_id)).size;

  return (
    <div className="card border-t-2 border-t-magenta overflow-hidden">
      <div className="px-5 py-4 border-b border-border flex items-center justify-between bg-card">
        <div>
          <p className="text-xs text-magenta uppercase tracking-wider font-medium">
            {isPlanned ? "📋 Scheduled for today" : isInProgress ? "🏋 In progress" : "✅ Today's workout"}
          </p>
          <p className="font-semibold text-primary mt-0.5">{workout.title ?? "Workout"}</p>
        </div>
        {/* Go to the detail/overview page — user can choose to Start from there */}
        <button
          onClick={() => navigate(`/workouts/${workout.id}`)}
          className="btn-primary"
        >
          Go to workout
        </button>
      </div>
      <div className="px-5 py-3">
        {isPlanned ? (
          <p className="text-sm text-secondary">
            {workout.sets.length > 0
              ? `${workout.sets.length} sets planned · ${exCount} exercise${exCount !== 1 ? "s" : ""}`
              : "Tap View to see your plan and start."}
          </p>
        ) : (
          <p className="text-sm text-secondary">
            {workout.sets.length} sets logged
            {exCount > 0 ? ` · ${exCount} exercise${exCount !== 1 ? "s" : ""}` : ""}
            {workout.duration_seconds ? ` · ${Math.round(workout.duration_seconds / 60)}m` : " · in progress"}
          </p>
        )}
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const { data: dash, isLoading } = useQuery({ queryKey: ["dashboard"], queryFn: api.dashboard.get });
  const { data: recent } = useQuery({ queryKey: ["workouts", "recent"], queryFn: () => api.workouts.list({ limit: 5 }) });

  // Query for today's window to find scheduled/in-progress workouts
  const todayStart = new Date(); todayStart.setHours(0,0,0,0);
  const todayEnd   = new Date(); todayEnd.setHours(23,59,59,999);
  const { data: todayWorkouts = [] } = useQuery({
    queryKey: ["workouts-today"],
    queryFn: () => api.workouts.list({ limit: 10, from_date: todayStart.toISOString(), to_date: todayEnd.toISOString() }),
  });

  // Show the most relevant today workout — prefer planned, then in-progress
  const todayWorkout: WorkoutResponse | null = (
    todayWorkouts.find(w => !w.ended_at && w.sets.length === 0) ??   // planned
    todayWorkouts.find(w => !w.ended_at && w.sets.length > 0)  ??   // in-progress
    null
  );

  return (
    <div className="p-4 md:p-8 space-y-8 max-w-5xl w-full">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-primary">Dashboard</h1>
        <Link to="/workouts/new" className="btn-primary flex items-center gap-2">
          <span>+</span> New workout
        </Link>
      </div>

      {/* Today's scheduled workout — only shows if one exists */}
      {todayWorkout && <TodayWorkoutCard workout={todayWorkout} />}

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
              <Link to="/workouts" className="text-xs text-blue hover:text-blue-dim transition-colors">View schedule →</Link>
            </div>
            <div className="space-y-2">
              {(recent ?? [])
                .filter(w => !isToday(new Date(w.started_at)) || w.ended_at)  // don't repeat today's in-progress
                .map((w) => (
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
