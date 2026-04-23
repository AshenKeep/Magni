import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
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

  const { data: workout, isLoading } = useQuery({
    queryKey: ["workout", id],
    queryFn: () => api.workouts.get(id!),
    enabled: !!id,
  });
  const { data: hrData } = useQuery({
    queryKey: ["hr", id],
    queryFn: () => api.stats.hr({ workout_id: id }),
    enabled: !!id,
  });

  if (isLoading) return <div className="p-8 text-gray-500 text-sm">Loading…</div>;
  if (!workout)  return <div className="p-8 text-gray-500 text-sm">Workout not found.</div>;

  const hrPoints = (hrData ?? []).map((r) => ({
    t: format(new Date(r.recorded_at), "HH:mm"),
    bpm: r.bpm,
  }));

  const meta = [
    { label: "Duration",  value: fmtDuration(workout.duration_seconds) },
    { label: "Sets",      value: workout.sets.length },
    { label: "Avg HR",    value: workout.avg_heart_rate ? `${workout.avg_heart_rate} bpm` : "—" },
    { label: "Calories",  value: workout.calories_burned ? `${workout.calories_burned} cal` : "—" },
  ];

  return (
    <div className="p-8 space-y-8 max-w-3xl">
      <button onClick={() => navigate(-1)} className="text-sm text-gray-500 hover:text-gray-300 transition-colors">
        ← Back
      </button>

      <div>
        <h1 className="text-2xl font-bold text-gray-100">{workout.title ?? "Workout"}</h1>
        <p className="text-gray-500 text-sm mt-1">{format(new Date(workout.started_at), "EEEE d MMMM yyyy · HH:mm")}</p>
      </div>

      <div className="grid grid-cols-4 gap-4">
        {meta.map(({ label, value }) => (
          <div key={label} className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <p className="text-xs text-gray-500">{label}</p>
            <p className="text-lg font-semibold text-gray-100 mt-0.5">{value}</p>
          </div>
        ))}
      </div>

      {hrPoints.length > 0 && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
          <p className="text-sm font-medium text-gray-400 mb-4">Heart rate</p>
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={hrPoints}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
              <XAxis dataKey="t" tick={{ fill: "#6b7280", fontSize: 11 }} />
              <YAxis tick={{ fill: "#6b7280", fontSize: 11 }} domain={["auto", "auto"]} />
              <Tooltip
                contentStyle={{ background: "#111827", border: "1px solid #374151", borderRadius: 8 }}
                labelStyle={{ color: "#9ca3af" }}
                itemStyle={{ color: "#f87171" }}
              />
              <Line type="monotone" dataKey="bpm" stroke="#f87171" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-800">
          <p className="text-sm font-medium text-gray-400">Sets</p>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-gray-500 border-b border-gray-800">
              {["Set", "Reps", "Weight", "RPE"].map((h) => (
                <th key={h} className="px-6 py-3 text-left">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {workout.sets.map((s) => (
              <tr key={s.id} className="border-b border-gray-800/50 hover:bg-gray-800/30 transition-colors">
                <td className="px-6 py-3 text-gray-400">{s.set_number}</td>
                <td className="px-6 py-3 text-gray-300">{s.reps ?? "—"}</td>
                <td className="px-6 py-3 text-gray-300">{s.weight_kg ? `${s.weight_kg} kg` : "—"}</td>
                <td className="px-6 py-3 text-gray-400">{s.rpe ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {workout.notes && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
          <p className="text-xs text-gray-500 mb-2">Notes</p>
          <p className="text-sm text-gray-300">{workout.notes}</p>
        </div>
      )}
    </div>
  );
}
