import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { format } from "date-fns";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";

function fmtDuration(secs: number | null | undefined): string {
  if (!secs) return "—";
  const m = Math.round(secs / 60);
  return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`;
}

export default function WorkoutDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();

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

  if (isLoading) return <div className="p-8 text-secondary text-sm">Loading…</div>;
  if (!workout)  return <div className="p-8 text-secondary text-sm">Workout not found.</div>;

  const exerciseMap = (exercises ?? []).reduce((acc, ex) => { acc[ex.id] = ex.name; return acc; }, {} as Record<string, string>);

  const hrPoints = (hrData ?? []).map((r) => ({
    t: format(new Date(r.recorded_at), "HH:mm"), bpm: r.bpm,
  }));

  // Group sets by exercise
  const grouped = workout.sets.reduce((acc, s) => {
    if (!acc[s.exercise_id]) acc[s.exercise_id] = [];
    acc[s.exercise_id].push(s);
    return acc;
  }, {} as Record<string, typeof workout.sets>);

  return (
    <div className="p-8 space-y-6 max-w-3xl">
      <div className="flex items-center justify-between">
        <button onClick={() => navigate(-1)} className="text-sm text-secondary hover:text-primary transition-colors">← Back</button>
        <button onClick={() => { if (confirm("Delete this workout?")) deleteMutation.mutate(); }}
          className="btn-danger text-xs">Delete</button>
      </div>

      <div>
        <h1 className="text-2xl font-bold text-primary">{workout.title ?? "Workout"}</h1>
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

      {/* HR chart */}
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

      {/* Sets by exercise */}
      {Object.entries(grouped).map(([exerciseId, exSets]) => (
        <div key={exerciseId} className="card overflow-hidden">
          <div className="px-5 py-3 border-b border-border bg-card">
            <p className="font-medium text-primary">{exerciseMap[exerciseId] ?? "Unknown exercise"}</p>
          </div>
          <div className="divide-y divide-border/40">
            {exSets.map((s) => (
              <div key={s.id} className="px-5 py-3 grid grid-cols-4 text-sm">
                <span className="text-secondary">Set {s.set_number}</span>
                <span className="text-primary">{s.weight_kg ? `${s.weight_kg} kg` : "—"}</span>
                <span className="text-primary">{s.reps ? `${s.reps} reps` : "—"}</span>
                <span className="text-secondary">{s.rpe ? `RPE ${s.rpe}` : ""}</span>
              </div>
            ))}
          </div>
        </div>
      ))}

      {workout.notes && (
        <div className="card p-5">
          <p className="label mb-2">Notes</p>
          <p className="text-sm text-primary">{workout.notes}</p>
        </div>
      )}
    </div>
  );
}
