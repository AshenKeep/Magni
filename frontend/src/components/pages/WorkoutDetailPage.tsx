import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, type WorkoutSetResponse, type LogType } from "@/lib/api";
import { format } from "date-fns";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { LOG_TYPE_LABELS, formatDuration, formatPace } from "@/lib/metrics";

function fmtDuration(secs: number | null | undefined): string {
  if (!secs) return "—";
  const m = Math.round(secs / 60);
  return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`;
}

/** Render the populated metrics for a single workout set. */
function setSummary(s: WorkoutSetResponse): string {
  const parts: string[] = [];
  if (s.reps != null) parts.push(`${s.reps} reps`);
  if (s.weight_kg != null) parts.push(`${s.weight_kg}kg`);
  if (s.duration_seconds != null) parts.push(formatDuration(s.duration_seconds));
  if (s.distance_m != null) {
    const km = s.distance_m / 1000;
    parts.push(km >= 1 ? `${km.toFixed(2)}km` : `${s.distance_m}m`);
  }
  if (s.pace_seconds_per_km != null) parts.push(formatPace(s.pace_seconds_per_km));
  if (s.incline_pct != null) parts.push(`${s.incline_pct}%`);
  if (s.laps != null) parts.push(`${s.laps} laps`);
  if (s.avg_heart_rate != null) parts.push(`HR ${s.avg_heart_rate}`);
  if (s.calories != null) parts.push(`${s.calories} kcal`);
  if (s.rpe != null) parts.push(`RPE ${s.rpe}`);
  return parts.join(" · ") || "—";
}

function SaveAsTemplateModal({ workoutId, defaultName, onClose }: {
  workoutId: string;
  defaultName: string;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [name, setName] = useState(defaultName);
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");

  const save = useMutation({
    mutationFn: () => api.workouts.saveAsTemplate(workoutId, { name, notes: notes || undefined }),
    onSuccess: (t) => {
      qc.invalidateQueries({ queryKey: ["templates"] });
      navigate(`/templates/${t.id}`);
    },
    onError: (e: Error) => setError(e.message),
  });

  return (
    <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
      <div className="bg-surface border border-border rounded-2xl w-full max-w-md">
        <div className="p-5 border-b border-border flex items-center justify-between">
          <h3 className="font-medium text-primary">Save as template</h3>
          <button onClick={onClose} className="text-secondary hover:text-primary text-xl">×</button>
        </div>
        <div className="p-5 space-y-4">
          {error && <div className="bg-danger/10 border border-danger/30 text-danger text-sm rounded-lg px-4 py-3">{error}</div>}
          <div>
            <label className="label">Template name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} className="input" autoFocus />
          </div>
          <div>
            <label className="label">Notes (optional)</label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} className="input resize-none h-16" />
          </div>
          <p className="text-xs text-secondary">
            All sets and metrics will become per-set targets in the new template.
          </p>
          <div className="flex gap-3 pt-2">
            <button onClick={onClose} className="btn-secondary flex-1">Cancel</button>
            <button onClick={() => save.mutate()} disabled={!name || save.isPending} className="btn-primary flex-1">
              {save.isPending ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function WorkoutDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [saveModal, setSaveModal] = useState(false);

  const { data: workout, isLoading } = useQuery({
    queryKey: ["workout", id], queryFn: () => api.workouts.get(id!), enabled: !!id,
  });
  const { data: hrData } = useQuery({
    queryKey: ["hr", id], queryFn: () => api.stats.hr({ workout_id: id }), enabled: !!id,
  });
  const { data: exercises } = useQuery({ queryKey: ["exercises"], queryFn: api.exercises.list });

  const deleteMutation = useMutation({
    mutationFn: () => api.workouts.delete(id!),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["workouts"] });
      navigate("/workouts");
    },
  });

  if (isLoading) return <div className="p-4 md:p-8 text-secondary text-sm">Loading…</div>;
  if (!workout)  return <div className="p-4 md:p-8 text-secondary text-sm">Workout not found.</div>;

  const exerciseMap = (exercises ?? []).reduce((acc, ex) => { acc[ex.id] = ex.name; return acc; }, {} as Record<string, string>);

  const hrPoints = (hrData ?? []).map((r) => ({
    t: format(new Date(r.recorded_at), "HH:mm"), bpm: r.bpm,
  }));

  // Group sets by exercise, preserving first-seen order
  const grouped: Record<string, WorkoutSetResponse[]> = {};
  const order: string[] = [];
  for (const s of workout.sets) {
    if (!grouped[s.exercise_id]) {
      grouped[s.exercise_id] = [];
      order.push(s.exercise_id);
    }
    grouped[s.exercise_id].push(s);
  }

  const isPlanned = !workout.ended_at;  // show Start for any unfinished workout

  return (
    <div className="p-4 md:p-8 space-y-6 max-w-3xl">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <button onClick={() => navigate(-1)} className="text-sm text-secondary hover:text-primary transition-colors">← Back</button>
        <div className="flex gap-2">
          {workout.sets.length > 0 && (
            <button onClick={() => setSaveModal(true)} className="btn-secondary text-xs">
              Save as template
            </button>
          )}
          {isPlanned && (
            <button onClick={() => navigate(`/workouts/new?workout_id=${workout.id}`)} className="btn-primary text-xs">
              ▶ Start workout
            </button>
          )}
          <button onClick={() => { if (confirm("Delete this workout?")) deleteMutation.mutate(); }}
            className="btn-danger text-xs">Delete</button>
        </div>
      </div>

      <div>
        <div className="flex items-center gap-2 flex-wrap">
          <h1 className="text-2xl font-bold text-primary">{workout.title ?? "Workout"}</h1>
          {isPlanned && (
            <span className="text-[10px] uppercase tracking-wider px-2 py-1 rounded bg-magenta-glow text-magenta">Planned</span>
          )}
        </div>
        <p className="text-secondary text-sm mt-1">{format(new Date(workout.started_at), "EEEE d MMMM yyyy · HH:mm")}</p>
      </div>

      {/* Stats strip */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: "Duration", value: fmtDuration(workout.duration_seconds) },
          { label: "Sets", value: workout.sets.length },
          { label: "Avg HR", value: workout.avg_heart_rate ? `${workout.avg_heart_rate} bpm` : "—" },
          { label: "Calories", value: workout.calories_burned ? `${workout.calories_burned}` : "—" },
        ].map(({ label, value }) => (
          <div key={label} className="card p-4">
            <p className="label">{label}</p>
            <p className="text-lg font-semibold text-primary">{value}</p>
          </div>
        ))}
      </div>

      {hrPoints.length > 0 && (
        <div className="card p-5">
          <p className="label mb-4">Heart rate</p>
          <ResponsiveContainer width="100%" height={160}>
            <LineChart data={hrPoints}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1F1F1F" />
              <XAxis dataKey="t" tick={{ fill: "#888", fontSize: 11 }} />
              <YAxis tick={{ fill: "#888", fontSize: 11 }} domain={["auto", "auto"]} />
              <Tooltip contentStyle={{ background: "#141414", border: "1px solid #1F1F1F", borderRadius: 8 }}
                labelStyle={{ color: "#888" }} itemStyle={{ color: "#CC2ECC" }} />
              <Line type="monotone" dataKey="bpm" stroke="#CC2ECC" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {order.map((exerciseId) => {
        const exSets = grouped[exerciseId];
        const logType = (exSets[0].log_type ?? "strength") as LogType;
        return (
          <div key={exerciseId} className="card overflow-hidden">
            <div className="px-5 py-3 border-b border-border bg-card flex items-center justify-between">
              <p className="font-medium text-primary">{exerciseMap[exerciseId] ?? "Unknown exercise"}</p>
              <p className="text-[10px] text-secondary uppercase tracking-wider">{LOG_TYPE_LABELS[logType]}</p>
            </div>
            <div className="divide-y divide-border/40">
              {exSets.sort((a, b) => a.set_number - b.set_number).map((s) => (
                <div key={s.id} className="px-5 py-3 flex items-center justify-between gap-4 text-sm">
                  <span className="text-secondary shrink-0">Set {s.set_number}</span>
                  <span className="text-primary text-right">{setSummary(s)}</span>
                </div>
              ))}
            </div>
          </div>
        );
      })}

      {workout.sets.length === 0 && (
        <div className="card p-8 text-center">
          <p className="text-secondary text-sm">No sets logged yet.</p>
        </div>
      )}

      {workout.notes && (
        <div className="card p-5">
          <p className="label mb-2">Notes</p>
          <p className="text-sm text-primary">{workout.notes}</p>
        </div>
      )}

      {saveModal && (
        <SaveAsTemplateModal
          workoutId={workout.id}
          defaultName={workout.title ?? "Workout template"}
          onClose={() => setSaveModal(false)}
        />
      )}
    </div>
  );
}
