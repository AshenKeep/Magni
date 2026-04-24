import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, ExerciseResponse } from "@/lib/api";

const MUSCLE_GROUPS = ["Chest","Back","Shoulders","Biceps","Triceps","Legs","Glutes","Core","Cardio","Full Body","Other"];
const EQUIPMENT = ["Barbell","Dumbbell","Machine","Cable","Bodyweight","Resistance Band","Kettlebell","Other"];

// Exercise detail modal — shows GIF, instructions, muscles
function ExerciseDetailModal({ exercise, onClose, onEdit }: {
  exercise: ExerciseResponse;
  onClose: () => void;
  onEdit: () => void;
}) {
  const instructions = exercise.instructions?.split("\n").filter(Boolean) ?? [];

  return (
    <div className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4">
      <div className="bg-surface border border-border rounded-2xl w-full max-w-lg max-h-[90vh] flex flex-col">
        <div className="p-5 border-b border-border flex items-center justify-between">
          <h3 className="font-medium text-primary">{exercise.name}</h3>
          <div className="flex gap-3 items-center">
            <button onClick={onEdit} className="text-xs text-blue hover:text-blue-dim transition-colors">Edit</button>
            <button onClick={onClose} className="text-secondary hover:text-primary text-xl">×</button>
          </div>
        </div>

        <div className="overflow-y-auto flex-1">
          {/* GIF */}
          {exercise.gif_url && (
            <div className="bg-card border-b border-border flex items-center justify-center p-4">
              <img
                src={exercise.gif_url}
                alt={exercise.name}
                className="max-h-64 rounded-lg object-contain"
                loading="lazy"
              />
            </div>
          )}

          <div className="p-5 space-y-4">
            {/* Muscle info */}
            <div className="flex flex-wrap gap-2">
              {exercise.muscle_group && (
                <span className="badge-blue">{exercise.muscle_group}</span>
              )}
              {exercise.equipment && (
                <span className="badge-magenta">{exercise.equipment}</span>
              )}
              {exercise.secondary_muscles && (() => {
                try {
                  const muscles = JSON.parse(exercise.secondary_muscles);
                  return muscles.slice(0, 3).map((m: string) => (
                    <span key={m} className="inline-flex items-center bg-muted text-secondary text-xs px-2 py-0.5 rounded-full capitalize">{m}</span>
                  ));
                } catch { return null; }
              })()}
            </div>

            {/* Instructions */}
            {instructions.length > 0 && (
              <div>
                <p className="label mb-2">Instructions</p>
                <ol className="space-y-2">
                  {instructions.map((step, i) => (
                    <li key={i} className="text-sm text-secondary flex gap-2">
                      <span className="text-blue font-mono shrink-0">{i + 1}.</span>
                      <span>{step.replace(/^\d+\.\s*/, "")}</span>
                    </li>
                  ))}
                </ol>
              </div>
            )}

            {/* Notes */}
            {exercise.notes && (
              <div>
                <p className="label mb-1">Notes</p>
                <p className="text-sm text-secondary">{exercise.notes}</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function ExerciseFormModal({ exercise, onClose }: { exercise?: ExerciseResponse; onClose: () => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState(exercise?.name ?? "");
  const [muscle, setMuscle] = useState(exercise?.muscle_group ?? "");
  const [equipment, setEquipment] = useState(exercise?.equipment ?? "");
  const [notes, setNotes] = useState(exercise?.notes ?? "");
  const [instructions, setInstructions] = useState(exercise?.instructions ?? "");
  const [gifUrl, setGifUrl] = useState(exercise?.gif_url ?? "");
  const [error, setError] = useState("");

  const save = useMutation({
    mutationFn: () => exercise
      ? api.exercises.update(exercise.id, { name, muscle_group: muscle, equipment, notes, instructions, gif_url: gifUrl })
      : api.exercises.create({ name, muscle_group: muscle, equipment, notes, instructions, gif_url: gifUrl }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["exercises"] }); onClose(); },
    onError: (e: Error) => setError(e.message),
  });

  return (
    <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
      <div className="bg-surface border border-border rounded-2xl w-full max-w-md max-h-[90vh] flex flex-col">
        <div className="p-5 border-b border-border flex items-center justify-between">
          <h3 className="font-medium text-primary">{exercise ? "Edit exercise" : "New exercise"}</h3>
          <button onClick={onClose} className="text-secondary hover:text-primary text-xl">×</button>
        </div>
        <div className="p-5 space-y-4 overflow-y-auto">
          {error && <div className="bg-danger/10 border border-danger/30 text-danger text-sm rounded-lg px-4 py-3">{error}</div>}
          <div>
            <label className="label">Exercise name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} className="input" placeholder="e.g. Bench Press" />
          </div>
          <div>
            <label className="label">Muscle group</label>
            <select value={muscle} onChange={(e) => setMuscle(e.target.value)} className="input">
              <option value="">Select…</option>
              {MUSCLE_GROUPS.map(g => <option key={g} value={g}>{g}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Equipment</label>
            <select value={equipment} onChange={(e) => setEquipment(e.target.value)} className="input">
              <option value="">Select…</option>
              {EQUIPMENT.map(e => <option key={e} value={e}>{e}</option>)}
            </select>
          </div>
          <div>
            <label className="label">GIF / Image URL <span className="text-secondary normal-case">(optional)</span></label>
            <input value={gifUrl} onChange={(e) => setGifUrl(e.target.value)} className="input" placeholder="https://…" />
          </div>
          <div>
            <label className="label">Instructions <span className="text-secondary normal-case">(one step per line)</span></label>
            <textarea value={instructions} onChange={(e) => setInstructions(e.target.value)} className="input resize-none h-28" placeholder="1. Lie on the bench...&#10;2. Grip the bar..." />
          </div>
          <div>
            <label className="label">Notes</label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} className="input resize-none h-16" />
          </div>
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

export default function ExercisesPage() {
  const qc = useQueryClient();
  const [formModal, setFormModal] = useState<"new" | ExerciseResponse | null>(null);
  const [detailModal, setDetailModal] = useState<ExerciseResponse | null>(null);
  const [search, setSearch] = useState("");
  const [filterGroup, setFilterGroup] = useState("");

  const { data: exercises, isLoading } = useQuery({ queryKey: ["exercises"], queryFn: api.exercises.list });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.exercises.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["exercises"] }),
  });

  const filtered = (exercises ?? []).filter(e =>
    (search === "" || e.name.toLowerCase().includes(search.toLowerCase())) &&
    (filterGroup === "" || e.muscle_group === filterGroup)
  );

  const grouped = filtered.reduce((acc, ex) => {
    const group = ex.muscle_group ?? "Other";
    if (!acc[group]) acc[group] = [];
    acc[group].push(ex);
    return acc;
  }, {} as Record<string, ExerciseResponse[]>);

  return (
    <div className="p-8 space-y-6 max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-primary">Exercise Library</h1>
          <p className="text-xs text-secondary mt-1">{(exercises ?? []).length} exercises · Seed more from Admin → AscendAPI</p>
        </div>
        <button onClick={() => setFormModal("new")} className="btn-primary">+ New exercise</button>
      </div>

      <div className="flex gap-3">
        <input value={search} onChange={(e) => setSearch(e.target.value)}
          placeholder="Search exercises…" className="input flex-1" />
        <select value={filterGroup} onChange={(e) => setFilterGroup(e.target.value)} className="input w-48">
          <option value="">All muscles</option>
          {MUSCLE_GROUPS.map(g => <option key={g} value={g}>{g}</option>)}
        </select>
      </div>

      {isLoading && <div className="text-secondary text-sm">Loading…</div>}

      <div className="space-y-4">
        {Object.entries(grouped).sort().map(([group, exs]) => (
          <div key={group} className="card overflow-hidden">
            <div className="px-5 py-3 border-b border-border bg-card">
              <p className="text-xs text-secondary uppercase tracking-wider">{group} · {exs.length}</p>
            </div>
            <div className="divide-y divide-border/40">
              {exs.map((ex) => (
                <div key={ex.id} className="px-4 py-3 flex items-center gap-3">
                  {/* Thumbnail */}
                  {ex.gif_url ? (
                    <img src={ex.gif_url} alt={ex.name}
                      className="w-12 h-12 rounded-lg object-cover bg-card shrink-0 cursor-pointer"
                      onClick={() => setDetailModal(ex)} loading="lazy" />
                  ) : (
                    <div className="w-12 h-12 rounded-lg bg-card border border-border shrink-0 flex items-center justify-center text-secondary text-lg">
                      ◈
                    </div>
                  )}

                  <div className="flex-1 min-w-0">
                    <button onClick={() => setDetailModal(ex)} className="text-sm font-medium text-primary hover:text-blue transition-colors text-left">
                      {ex.name}
                    </button>
                    <p className="text-xs text-secondary">{ex.equipment ?? "No equipment"}</p>
                  </div>

                  <div className="flex gap-3 shrink-0">
                    <button onClick={() => { setDetailModal(null); setFormModal(ex); }} className="text-xs text-blue hover:text-blue-dim transition-colors">Edit</button>
                    <button onClick={() => { if (confirm(`Delete "${ex.name}"?`)) deleteMutation.mutate(ex.id); }}
                      className="text-xs text-secondary hover:text-danger transition-colors">Delete</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}

        {!isLoading && filtered.length === 0 && (exercises ?? []).length === 0 && (
          <div className="card p-10 text-center space-y-3">
            <p className="text-secondary text-sm">No exercises yet</p>
            <p className="text-xs text-secondary/60">Seed your library from Admin → AscendAPI, or add exercises manually</p>
            <div className="flex gap-3 justify-center">
              <button onClick={() => setFormModal("new")} className="btn-secondary text-xs">Add manually</button>
            </div>
          </div>
        )}

        {!isLoading && filtered.length === 0 && (exercises ?? []).length > 0 && (
          <div className="card p-8 text-center">
            <p className="text-secondary text-sm">No exercises match your search</p>
          </div>
        )}
      </div>

      {detailModal && (
        <ExerciseDetailModal
          exercise={detailModal}
          onClose={() => setDetailModal(null)}
          onEdit={() => { setFormModal(detailModal); setDetailModal(null); }}
        />
      )}

      {formModal && (
        <ExerciseFormModal
          exercise={formModal === "new" ? undefined : formModal}
          onClose={() => setFormModal(null)}
        />
      )}
    </div>
  );
}
