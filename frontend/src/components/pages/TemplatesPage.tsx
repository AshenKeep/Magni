import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { api, TemplateResponse, ExerciseResponse } from "@/lib/api";

function TemplateModal({ template, exercises, onClose }: {
  template?: TemplateResponse;
  exercises: ExerciseResponse[];
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [name, setName] = useState(template?.name ?? "");
  const [notes, setNotes] = useState(template?.notes ?? "");
  const [exRows, setExRows] = useState<{ exercise_id: string; target_sets: number; target_reps: number; target_weight_kg: number; order: number }[]>(
    template?.exercises.map(e => ({
      exercise_id: e.exercise_id,
      target_sets: e.target_sets ?? 3,
      target_reps: e.target_reps ?? 10,
      target_weight_kg: e.target_weight_kg ?? 0,
      order: e.order,
    })) ?? []
  );
  const [error, setError] = useState("");

  const save = useMutation({
    mutationFn: () => template
      ? api.templates.update(template.id, { name, notes })
      : api.templates.create({ name, notes, exercises: exRows.map((e, i) => ({ ...e, order: i })) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["templates"] }); onClose(); },
    onError: (e: Error) => setError(e.message),
  });

  function addRow() {
    if (exercises.length === 0) return;
    setExRows(prev => [...prev, { exercise_id: exercises[0].id, target_sets: 3, target_reps: 10, target_weight_kg: 0, order: prev.length }]);
  }

  const hasExercises = exercises.length > 0;

  return (
    <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-surface border border-border rounded-2xl w-full max-w-lg my-4">
        <div className="p-5 border-b border-border flex items-center justify-between">
          <h3 className="font-medium text-primary">{template ? "Edit template" : "New template"}</h3>
          <button onClick={onClose} className="text-secondary hover:text-primary text-xl">×</button>
        </div>
        <div className="p-5 space-y-4">
          {error && (
            <div className="bg-danger/10 border border-danger/30 text-danger text-sm rounded-lg px-4 py-3">{error}</div>
          )}
          <div>
            <label className="label">Template name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} className="input" placeholder="e.g. Push Day A" />
          </div>
          <div>
            <label className="label">Notes</label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} className="input resize-none h-16" />
          </div>

          <div>
            <label className="label">Exercises</label>
            {!hasExercises ? (
              <div className="card p-5 text-center space-y-2">
                <p className="text-sm text-secondary">No exercises in your library yet</p>
                <p className="text-xs text-secondary/60">
                  Go to <span className="text-blue">Admin → Seed exercises</span> to import from AscendAPI,
                  or add exercises manually in the <span className="text-blue">Exercise Library</span>
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {exRows.map((row, i) => (
                  <div key={i} className="card p-3 space-y-2">
                    <div className="flex gap-2 items-center">
                      <select
                        value={row.exercise_id}
                        onChange={(e) => setExRows(prev => prev.map((r, idx) => idx === i ? { ...r, exercise_id: e.target.value } : r))}
                        className="input flex-1 text-sm"
                      >
                        {exercises.map(ex => <option key={ex.id} value={ex.id}>{ex.name}</option>)}
                      </select>
                      <button
                        onClick={() => setExRows(prev => prev.filter((_, idx) => idx !== i))}
                        className="text-secondary hover:text-danger transition-colors text-lg px-1"
                      >×</button>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <label className="label">Sets</label>
                        <input type="number" value={row.target_sets} min={1}
                          onChange={(e) => setExRows(prev => prev.map((r, idx) => idx === i ? { ...r, target_sets: Number(e.target.value) } : r))}
                          className="input text-sm" />
                      </div>
                      <div>
                        <label className="label">Reps</label>
                        <input type="number" value={row.target_reps} min={1}
                          onChange={(e) => setExRows(prev => prev.map((r, idx) => idx === i ? { ...r, target_reps: Number(e.target.value) } : r))}
                          className="input text-sm" />
                      </div>
                      <div>
                        <label className="label">Weight (kg)</label>
                        <input type="number" value={row.target_weight_kg} min={0} step={0.5}
                          onChange={(e) => setExRows(prev => prev.map((r, idx) => idx === i ? { ...r, target_weight_kg: Number(e.target.value) } : r))}
                          className="input text-sm" />
                      </div>
                    </div>
                  </div>
                ))}
                <button
                  onClick={addRow}
                  className="w-full py-2 text-sm text-blue border border-dashed border-blue/30 rounded-lg hover:bg-blue-glow transition-colors"
                >
                  + Add exercise
                </button>
              </div>
            )}
          </div>

          <div className="flex gap-3 pt-2">
            <button onClick={onClose} className="btn-secondary flex-1">Cancel</button>
            <button
              onClick={() => save.mutate()}
              disabled={!name || save.isPending}
              className="btn-primary flex-1"
            >
              {save.isPending ? "Saving…" : "Save template"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function TemplatesPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [modal, setModal] = useState<"new" | TemplateResponse | null>(null);

  const { data: templates, isLoading } = useQuery({ queryKey: ["templates"], queryFn: api.templates.list });
  const { data: exercises } = useQuery({ queryKey: ["exercises"], queryFn: api.exercises.list });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.templates.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["templates"] }),
  });

  const startMutation = useMutation({
    mutationFn: (id: string) => api.templates.startWorkout(id),
    onSuccess: (data) => navigate(`/workouts/new?workout_id=${data.workout_id}`),
  });

  const exerciseMap = (exercises ?? []).reduce((acc, e) => { acc[e.id] = e.name; return acc; }, {} as Record<string, string>);

  return (
    <div className="p-8 space-y-6 max-w-4xl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-primary">Templates</h1>
        <button onClick={() => setModal("new")} className="btn-primary">+ New template</button>
      </div>

      {isLoading && <div className="text-secondary text-sm">Loading…</div>}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {(templates ?? []).map((t) => (
          <div key={t.id} className="card p-5 space-y-4">
            <div className="flex items-start justify-between">
              <div>
                <p className="font-medium text-primary">{t.name}</p>
                {t.notes && <p className="text-xs text-secondary mt-0.5">{t.notes}</p>}
              </div>
              <div className="flex gap-2">
                <button onClick={() => setModal(t)} className="text-xs text-blue hover:text-blue-dim transition-colors">Edit</button>
                <button
                  onClick={() => { if (confirm(`Delete "${t.name}"?`)) deleteMutation.mutate(t.id); }}
                  className="text-xs text-secondary hover:text-danger transition-colors"
                >Delete</button>
              </div>
            </div>

            <div className="space-y-1">
              {t.exercises.sort((a, b) => a.order - b.order).map((ex) => (
                <div key={ex.id} className="flex items-center justify-between text-xs">
                  <span className="text-secondary">{exerciseMap[ex.exercise_id] ?? "Unknown"}</span>
                  <span className="text-primary">
                    {ex.target_sets && ex.target_reps ? `${ex.target_sets}×${ex.target_reps}` : ""}
                    {ex.target_weight_kg ? ` @ ${ex.target_weight_kg}kg` : ""}
                  </span>
                </div>
              ))}
              {t.exercises.length === 0 && <p className="text-xs text-secondary">No exercises yet</p>}
            </div>

            <button
              onClick={() => startMutation.mutate(t.id)}
              disabled={startMutation.isPending}
              className="btn-primary w-full"
            >
              {startMutation.isPending ? "Starting…" : "▶ Start workout"}
            </button>
          </div>
        ))}

        {!isLoading && (templates ?? []).length === 0 && (
          <div className="card p-10 text-center col-span-2">
            <p className="text-secondary text-sm mb-4">No templates yet</p>
            <button onClick={() => setModal("new")} className="btn-primary inline-flex">
              Create your first template
            </button>
          </div>
        )}
      </div>

      {modal !== null && exercises && (
        <TemplateModal
          template={modal === "new" ? undefined : modal}
          exercises={exercises}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
}
