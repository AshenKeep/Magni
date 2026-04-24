import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, ExerciseResponse } from "@/lib/api";

const MUSCLE_GROUPS = ["Chest","Back","Shoulders","Biceps","Triceps","Legs","Glutes","Core","Cardio","Full Body","Other"];
const EQUIPMENT = ["Barbell","Dumbbell","Machine","Cable","Bodyweight","Resistance Band","Kettlebell","Other"];

function ExerciseModal({ exercise, onClose }: { exercise?: ExerciseResponse; onClose: () => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState(exercise?.name ?? "");
  const [muscle, setMuscle] = useState(exercise?.muscle_group ?? "");
  const [equipment, setEquipment] = useState(exercise?.equipment ?? "");
  const [notes, setNotes] = useState(exercise?.notes ?? "");
  const [error, setError] = useState("");

  const save = useMutation({
    mutationFn: () => exercise
      ? api.exercises.update(exercise.id, { name, muscle_group: muscle, equipment, notes })
      : api.exercises.create({ name, muscle_group: muscle, equipment, notes }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["exercises"] }); onClose(); },
    onError: (e: Error) => setError(e.message),
  });

  return (
    <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
      <div className="bg-surface border border-border rounded-2xl w-full max-w-md">
        <div className="p-5 border-b border-border flex items-center justify-between">
          <h3 className="font-medium text-primary">{exercise ? "Edit exercise" : "New exercise"}</h3>
          <button onClick={onClose} className="text-secondary hover:text-primary text-xl">×</button>
        </div>
        <div className="p-5 space-y-4">
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
            <label className="label">Notes</label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} className="input resize-none h-20" />
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
  const [modal, setModal] = useState<"new" | ExerciseResponse | null>(null);
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
        <h1 className="text-2xl font-bold text-primary">Exercise Library</h1>
        <button onClick={() => setModal("new")} className="btn-primary">+ New exercise</button>
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
                <div key={ex.id} className="px-5 py-3 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-primary">{ex.name}</p>
                    {ex.equipment && <p className="text-xs text-secondary">{ex.equipment}</p>}
                  </div>
                  <div className="flex gap-3">
                    <button onClick={() => setModal(ex)} className="text-xs text-blue hover:text-blue-dim transition-colors">Edit</button>
                    <button onClick={() => { if (confirm(`Delete "${ex.name}"?`)) deleteMutation.mutate(ex.id); }}
                      className="text-xs text-secondary hover:text-danger transition-colors">Delete</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
        {!isLoading && filtered.length === 0 && (
          <div className="card p-10 text-center">
            <p className="text-secondary text-sm mb-4">No exercises found</p>
            <button onClick={() => setModal("new")} className="btn-primary inline-flex">Add your first exercise</button>
          </div>
        )}
      </div>

      {modal && (
        <ExerciseModal
          exercise={modal === "new" ? undefined : modal}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
}
