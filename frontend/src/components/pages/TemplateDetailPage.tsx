import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router-dom";
import { api, type TemplateExerciseCreate, type TemplateExerciseResponse } from "../../lib/api";
import { ExercisePicker } from "../shared/ExercisePicker";
import { LOG_TYPE_LABELS, formatDuration } from "../../lib/metrics";

function formatSetSummary(s: TemplateExerciseResponse["sets"][number]): string {
  const parts: string[] = [];
  if (s.target_reps != null) parts.push(`${s.target_reps} reps`);
  if (s.target_weight_kg != null) parts.push(`${s.target_weight_kg}kg`);
  if (s.target_duration_seconds != null) parts.push(formatDuration(s.target_duration_seconds));
  if (s.target_distance_m != null) {
    const km = s.target_distance_m / 1000;
    parts.push(km >= 1 ? `${km.toFixed(2)}km` : `${s.target_distance_m}m`);
  }
  if (s.target_pace_seconds_per_km != null) parts.push(`pace ${formatDuration(s.target_pace_seconds_per_km)}/km`);
  if (s.target_incline_pct != null) parts.push(`${s.target_incline_pct}% incline`);
  if (s.target_laps != null) parts.push(`${s.target_laps} laps`);
  if (s.target_avg_heart_rate != null) parts.push(`HR ${s.target_avg_heart_rate}`);
  if (s.target_calories != null) parts.push(`${s.target_calories} kcal`);
  return parts.join(" · ") || "—";
}

export default function TemplateDetailPage() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [pickerOpen, setPickerOpen] = useState(false);

  const { data: template, isLoading } = useQuery({
    queryKey: ["template", id],
    queryFn: () => api.templates.get(id!),
    enabled: !!id,
  });
  const { data: exercises } = useQuery({
    queryKey: ["exercises"],
    queryFn: api.exercises.list,
  });

  const exerciseMap = (exercises ?? []).reduce((acc, e) => {
    acc[e.id] = e;
    return acc;
  }, {} as Record<string, typeof exercises[number]>);

  const addMutation = useMutation({
    mutationFn: (payload: TemplateExerciseCreate) =>
      api.templates.addExercise(id!, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["template", id] });
      qc.invalidateQueries({ queryKey: ["templates"] });
    },
  });

  const removeMutation = useMutation({
    mutationFn: (teId: string) => api.templates.removeExercise(id!, teId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["template", id] });
      qc.invalidateQueries({ queryKey: ["templates"] });
    },
  });

  const startMutation = useMutation({
    mutationFn: () => api.templates.startWorkout(id!),
    onSuccess: (data) => navigate(`/workouts/new?workout_id=${data.workout_id}`),
  });

  if (isLoading) return <div className="p-8 text-secondary text-sm">Loading…</div>;
  if (!template) return <div className="p-8 text-secondary text-sm">Template not found.</div>;

  return (
    <div className="p-8 space-y-6 max-w-4xl">
      <div className="flex items-center gap-4">
        <button
          onClick={() => navigate("/templates")}
          className="text-secondary hover:text-primary text-sm"
        >
          ← Templates
        </button>
        <h1 className="text-2xl font-bold text-primary flex-1">{template.name}</h1>
        <button
          onClick={() => startMutation.mutate()}
          disabled={startMutation.isPending || template.exercises.length === 0}
          className="btn-primary disabled:opacity-50"
        >
          {startMutation.isPending ? "Starting…" : "▶ Start workout"}
        </button>
      </div>

      {template.notes && (
        <p className="text-sm text-secondary">{template.notes}</p>
      )}

      <div className="space-y-3">
        {template.exercises.length === 0 ? (
          <div className="card p-10 text-center">
            <p className="text-secondary text-sm mb-4">No exercises in this template yet.</p>
            <button onClick={() => setPickerOpen(true)} className="btn-primary inline-flex">
              + Add your first exercise
            </button>
          </div>
        ) : (
          template.exercises.sort((a, b) => a.order - b.order).map(te => {
            const ex = exerciseMap[te.exercise_id];
            return (
              <div key={te.id} className="card p-4">
                <div className="flex items-start gap-3">
                  {ex?.gif_url && (
                    <img
                      src={ex.gif_url}
                      alt={ex.name}
                      className="w-16 h-16 object-cover rounded-lg bg-bg-secondary flex-shrink-0"
                    />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="font-medium text-primary">
                          {ex?.name ?? "Unknown exercise"}
                        </div>
                        <div className="text-xs text-secondary">
                          {LOG_TYPE_LABELS[te.log_type]} · {te.sets.length} set{te.sets.length !== 1 ? "s" : ""}
                        </div>
                      </div>
                      <button
                        onClick={() => {
                          if (confirm(`Remove "${ex?.name}" from this template?`))
                            removeMutation.mutate(te.id);
                        }}
                        className="text-xs text-secondary hover:text-danger flex-shrink-0"
                      >
                        Remove
                      </button>
                    </div>
                    <div className="mt-2 space-y-0.5">
                      {te.sets.sort((a, b) => a.set_number - b.set_number).map(s => (
                        <div key={s.id} className="text-xs">
                          <span className="text-secondary">Set {s.set_number}:</span>{" "}
                          <span className="text-primary">{formatSetSummary(s)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        )}

        {template.exercises.length > 0 && (
          <button
            onClick={() => setPickerOpen(true)}
            className="w-full py-3 text-sm text-blue border border-dashed border-blue/30 rounded-lg hover:bg-blue-glow transition-colors"
          >
            + Add another exercise
          </button>
        )}
      </div>

      <ExercisePicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onAdd={async (payload) => {
          payload.order = template.exercises.length;
          await addMutation.mutateAsync(payload);
        }}
        title={`Add to "${template.name}"`}
      />
    </div>
  );
}
