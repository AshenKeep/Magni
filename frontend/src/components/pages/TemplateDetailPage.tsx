import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router-dom";
import { api, type ExerciseResponse, type TemplateExerciseCreate, type TemplateExerciseResponse, type TemplateExerciseUpdate, type LogType, type MetricField, type TemplateSetCreate } from "../../lib/api";
import { ExercisePicker } from "../shared/ExercisePicker";
import { LOG_TYPE_LABELS, formatDuration, defaultFieldsFor, METRIC_TO_TEMPLATE_SET_KEY } from "../../lib/metrics";
import { DynamicMetricFields } from "../shared/DynamicMetricFields";

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

// ─── Edit modal ──────────────────────────────────────────────────────────────

interface SetDraft {
  set_number: number;
  log_type: LogType;
  enabled: MetricField[];
  values: Partial<Record<MetricField, number | null>>;
  notes: string;
}

function emptySetFromExisting(s: TemplateExerciseResponse["sets"][number]): SetDraft {
  const vals: Partial<Record<MetricField, number | null>> = {
    reps: s.target_reps, weight_kg: s.target_weight_kg,
    duration_seconds: s.target_duration_seconds, distance_m: s.target_distance_m,
    pace_seconds_per_km: s.target_pace_seconds_per_km, incline_pct: s.target_incline_pct,
    laps: s.target_laps, avg_heart_rate: s.target_avg_heart_rate, calories: s.target_calories,
  };
  const enabled = (Object.entries(vals) as [MetricField, number | null][])
    .filter(([, v]) => v != null).map(([k]) => k);
  return {
    set_number: s.set_number,
    log_type: s.log_type as LogType,
    enabled: enabled.length ? enabled : defaultFieldsFor(s.log_type as LogType),
    values: vals,
    notes: s.notes ?? "",
  };
}

function setDraftToPayload(s: SetDraft): TemplateSetCreate {
  const out: TemplateSetCreate = { set_number: s.set_number, log_type: s.log_type };
  for (const f of s.enabled) {
    const v = s.values[f];
    if (v != null) (out as unknown as Record<string, unknown>)[METRIC_TO_TEMPLATE_SET_KEY[f]] = v;
  }
  if (s.notes.trim()) out.notes = s.notes.trim();
  return out;
}

function EditExerciseModal({ te, exerciseName, templateId, onClose }: {
  te: TemplateExerciseResponse;
  exerciseName: string;
  templateId: string;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [logType, setLogType] = useState<LogType>(te.log_type as LogType);
  const [sets, setSets] = useState<SetDraft[]>(
    te.sets.length > 0
      ? te.sets.map(emptySetFromExisting)
      : [{ set_number: 1, log_type: te.log_type as LogType, enabled: defaultFieldsFor(te.log_type as LogType), values: {}, notes: "" }]
  );
  const [exerciseNotes, setExerciseNotes] = useState(te.notes ?? "");
  const [error, setError] = useState("");

  const updateMut = useMutation({
    mutationFn: (payload: TemplateExerciseUpdate) =>
      api.templates.updateExercise(templateId, te.id, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["template", templateId] });
      qc.invalidateQueries({ queryKey: ["templates"] });
      onClose();
    },
    onError: (e: Error) => setError(e.message),
  });

  const addSet = () => {
    const last = sets[sets.length - 1];
    setSets([...sets, { set_number: sets.length + 1, log_type: last?.log_type ?? logType, enabled: last ? [...last.enabled] : defaultFieldsFor(logType), values: { ...last?.values }, notes: "" }]);
  };

  const removeSet = (idx: number) => {
    if (sets.length === 1) return;
    setSets(sets.filter((_, i) => i !== idx).map((s, i) => ({ ...s, set_number: i + 1 })));
  };

  const updateSet = (idx: number, patch: Partial<SetDraft>) =>
    setSets(sets.map((s, i) => i === idx ? { ...s, ...patch } : s));

  const changeLogType = (t: LogType) => {
    setLogType(t);
    setSets(sets.map((s, i) => ({ ...s, log_type: t, enabled: defaultFieldsFor(t), values: {} })));
  };

  return (
    <div className="fixed inset-0 bg-black/80 z-50 flex items-end lg:items-center justify-center lg:p-4">
      <div className="bg-surface border border-border rounded-t-2xl lg:rounded-2xl w-full max-w-md max-h-[85vh] flex flex-col">
        <div className="p-4 border-b border-border flex items-center justify-between">
          <div>
            <p className="font-medium text-primary">Edit sets</p>
            <p className="text-xs text-secondary">{exerciseName}</p>
          </div>
          <button onClick={onClose} className="text-secondary hover:text-primary text-xl">×</button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {error && <div className="bg-danger/10 border border-danger/30 text-danger text-sm rounded-lg px-4 py-2">{error}</div>}

          {/* Log type */}
          <div>
            <p className="label">Log as</p>
            <div className="flex gap-1">
              {(["strength", "cardio", "mobility"] as LogType[]).map(t => (
                <button key={t} onClick={() => changeLogType(t)}
                  className={`flex-1 text-xs px-3 py-2 rounded ${logType === t ? "bg-blue text-white" : "bg-card text-secondary"}`}>
                  {LOG_TYPE_LABELS[t]}
                </button>
              ))}
            </div>
          </div>

          {/* Exercise notes */}
          <div>
            <p className="label">Exercise notes</p>
            <input value={exerciseNotes} onChange={e => setExerciseNotes(e.target.value)}
              placeholder="e.g. 2 min rest between sets" className="input" />
          </div>

          {/* Sets */}
          <div className="space-y-2">
            <p className="label">Sets</p>
            {sets.map((s, idx) => (
              <div key={idx} className="bg-card border border-border rounded-xl p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium">Set {s.set_number}</span>
                  {sets.length > 1 && (
                    <button onClick={() => removeSet(idx)} className="text-secondary hover:text-danger text-xs">Remove</button>
                  )}
                </div>
                <DynamicMetricFields
                  logType={s.log_type}
                  enabled={s.enabled}
                  values={s.values}
                  onEnabledChange={enabled => updateSet(idx, { enabled })}
                  onValueChange={(field, value) => updateSet(idx, { values: { ...s.values, [field]: value } })}
                  compact
                />
                <input type="text" value={s.notes} onChange={e => updateSet(idx, { notes: e.target.value })}
                  placeholder="Set note (optional)"
                  className="mt-2 bg-surface border border-border rounded-lg px-2 py-1 text-xs text-primary placeholder-secondary w-full" />
              </div>
            ))}
            <button onClick={addSet} className="text-xs text-blue hover:underline">+ Add set</button>
          </div>
        </div>
        <div className="p-4 border-t border-border flex gap-3">
          <button onClick={onClose} className="btn-secondary flex-1">Cancel</button>
          <button
            onClick={() => updateMut.mutate({ log_type: logType, notes: exerciseNotes.trim() || undefined, sets: sets.map(setDraftToPayload) })}
            disabled={updateMut.isPending}
            className="btn-primary flex-1"
          >
            {updateMut.isPending ? "Saving…" : "Save changes"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function TemplateDetailPage() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [editingTe, setEditingTe] = useState<TemplateExerciseResponse | null>(null);

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
  }, {} as Record<string, ExerciseResponse>);

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

  if (isLoading) return <div className="p-4 lg:p-8 text-secondary text-sm">Loading…</div>;
  if (!template) return <div className="p-4 lg:p-8 text-secondary text-sm">Template not found.</div>;

  return (
    <div className="p-4 lg:p-8 space-y-6 max-w-4xl w-full">
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
                      className="w-16 h-16 object-cover rounded-lg bg-card flex-shrink-0"
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
                      <div className="flex items-center gap-3 flex-shrink-0">
                        <button
                          onClick={() => setEditingTe(te)}
                          className="text-xs text-blue hover:text-blue-dim"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => {
                            if (confirm(`Remove "${ex?.name}" from this template?`))
                              removeMutation.mutate(te.id);
                          }}
                          className="text-xs text-secondary hover:text-danger"
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                    <div className="mt-2 space-y-0.5">
                      {te.notes && (
                        <div className="text-xs text-blue italic mb-1">📝 {te.notes}</div>
                      )}
                      {te.sets.sort((a, b) => a.set_number - b.set_number).map(s => (
                        <div key={s.id} className="text-xs">
                          <span className="text-secondary">Set {s.set_number}:</span>{" "}
                          <span className="text-primary">{formatSetSummary(s)}</span>
                          {s.notes && (
                            <span className="text-blue italic"> · {s.notes}</span>
                          )}
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

      {editingTe && (
        <EditExerciseModal
          te={editingTe}
          exerciseName={exerciseMap[editingTe.exercise_id]?.name ?? "Exercise"}
          templateId={id!}
          onClose={() => setEditingTe(null)}
        />
      )}
    </div>
  );
}
