import { useState, useEffect, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, ExerciseResponse, WorkoutSetResponse } from "@/lib/api";
import { format } from "date-fns";

// --- Timer ---
function useTimer(startTime: Date) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const id = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startTime.getTime()) / 1000));
    }, 1000);
    return () => clearInterval(id);
  }, [startTime]);
  const h = Math.floor(elapsed / 3600);
  const m = Math.floor((elapsed % 3600) / 60);
  const s = elapsed % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
    : `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

// --- Set row ---
interface SetRowProps {
  set: WorkoutSetResponse & { exercise_name?: string };
  onUpdate: (id: string, field: "reps" | "weight_kg" | "rpe", value: number | null) => void;
  onDelete: (id: string) => void;
}

function SetRow({ set, onUpdate, onDelete }: SetRowProps) {
  return (
    <div className="grid grid-cols-[auto_1fr_1fr_1fr_auto] gap-2 items-center py-2 border-b border-border/50">
      <span className="text-xs text-secondary w-6 text-center">{set.set_number}</span>
      <input
        type="number" placeholder="kg" value={set.weight_kg ?? ""}
        onChange={(e) => onUpdate(set.id, "weight_kg", e.target.value ? Number(e.target.value) : null)}
        className="input text-center text-sm py-1.5"
      />
      <input
        type="number" placeholder="reps" value={set.reps ?? ""}
        onChange={(e) => onUpdate(set.id, "reps", e.target.value ? Number(e.target.value) : null)}
        className="input text-center text-sm py-1.5"
      />
      <input
        type="number" placeholder="RPE" min={1} max={10} value={set.rpe ?? ""}
        onChange={(e) => onUpdate(set.id, "rpe", e.target.value ? Number(e.target.value) : null)}
        className="input text-center text-sm py-1.5"
      />
      <button onClick={() => onDelete(set.id)} className="text-secondary hover:text-danger text-sm transition-colors px-1">×</button>
    </div>
  );
}

// --- Exercise picker modal ---
function ExercisePicker({ exercises, onSelect, onClose }: {
  exercises: ExerciseResponse[];
  onSelect: (ex: ExerciseResponse) => void;
  onClose: () => void;
}) {
  const [search, setSearch] = useState("");
  const filtered = exercises.filter(e =>
    e.name.toLowerCase().includes(search.toLowerCase()) ||
    (e.muscle_group?.toLowerCase().includes(search.toLowerCase()) ?? false)
  );

  const grouped = filtered.reduce((acc, ex) => {
    const group = ex.muscle_group ?? "Other";
    if (!acc[group]) acc[group] = [];
    acc[group].push(ex);
    return acc;
  }, {} as Record<string, ExerciseResponse[]>);

  return (
    <div className="fixed inset-0 bg-black/80 z-50 flex items-end sm:items-center justify-center p-4">
      <div className="bg-surface border border-border rounded-2xl w-full max-w-md max-h-[80vh] flex flex-col">
        <div className="p-4 border-b border-border flex items-center justify-between">
          <h3 className="font-medium text-primary">Add exercise</h3>
          <button onClick={onClose} className="text-secondary hover:text-primary text-xl">×</button>
        </div>
        <div className="p-3 border-b border-border">
          <input
            autoFocus type="text" placeholder="Search exercises…"
            value={search} onChange={(e) => setSearch(e.target.value)}
            className="input"
          />
        </div>
        <div className="overflow-y-auto flex-1">
          {Object.entries(grouped).sort().map(([group, exs]) => (
            <div key={group}>
              <p className="px-4 py-2 text-xs text-secondary uppercase tracking-wider bg-card/50 sticky top-0">{group}</p>
              {exs.map((ex) => (
                <button key={ex.id} onClick={() => { onSelect(ex); onClose(); }}
                  className="w-full text-left px-4 py-3 hover:bg-card transition-colors border-b border-border/30 flex items-center gap-3">
                  {ex.gif_url ? (
                    <img src={ex.gif_url} alt={ex.name} className="w-10 h-10 rounded object-cover bg-card shrink-0" loading="lazy" />
                  ) : (
                    <div className="w-10 h-10 rounded bg-card border border-border shrink-0 flex items-center justify-center text-secondary">◈</div>
                  )}
                  <div>
                    <p className="text-sm text-primary">{ex.name}</p>
                    {ex.equipment && <p className="text-xs text-secondary">{ex.equipment}</p>}
                  </div>
                </button>
              ))}
            </div>
          ))}
          {filtered.length === 0 && (
            <p className="text-secondary text-sm text-center py-8">No exercises found</p>
          )}
        </div>
      </div>
    </div>
  );
}

// --- Main component ---
export default function NewWorkoutPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const qc = useQueryClient();
  const startTime = useRef(new Date());
  const timer = useTimer(startTime.current);

  const [title, setTitle] = useState(searchParams.get("title") ?? `Workout ${format(new Date(), "d MMM")}`);
  const [workoutId, setWorkoutId] = useState<string | null>(searchParams.get("workout_id"));
  const [sets, setSets] = useState<(WorkoutSetResponse & { exercise_name: string })[]>([]);
  const [showPicker, setShowPicker] = useState(false);
  const [finishing, setFinishing] = useState(false);

  const { data: exercises } = useQuery({ queryKey: ["exercises"], queryFn: api.exercises.list });

  const exerciseMap = (exercises ?? []).reduce((acc, ex) => { acc[ex.id] = ex; return acc; }, {} as Record<string, ExerciseResponse>);

  // Create workout on first set add if not already created
  async function ensureWorkout(): Promise<string> {
    if (workoutId) return workoutId;
    const w = await api.workouts.create({ title, started_at: startTime.current.toISOString() });
    setWorkoutId(w.id);
    return w.id;
  }

  async function addExercise(ex: ExerciseResponse) {
    const wid = await ensureWorkout();
    // Find max set number for this exercise in current workout
    const existingSets = sets.filter(s => s.exercise_id === ex.id);
    const setNum = existingSets.length + 1;
    const lastSet = existingSets[existingSets.length - 1];

    const newSet = await api.workouts.addSet(wid, {
      exercise_id: ex.id,
      set_number: setNum,
      reps: lastSet?.reps ?? undefined,
      weight_kg: lastSet?.weight_kg ?? undefined,
    });
    setSets(prev => [...prev, { ...newSet, exercise_name: ex.name }]);
  }

  async function addSetToExercise(exerciseId: string) {
    const wid = await ensureWorkout();
    const ex = exerciseMap[exerciseId];
    const existingSets = sets.filter(s => s.exercise_id === exerciseId);
    const setNum = existingSets.length + 1;
    const lastSet = existingSets[existingSets.length - 1];

    const newSet = await api.workouts.addSet(wid, {
      exercise_id: exerciseId,
      set_number: setNum,
      reps: lastSet?.reps ?? undefined,
      weight_kg: lastSet?.weight_kg ?? undefined,
    });
    setSets(prev => [...prev, { ...newSet, exercise_name: ex?.name ?? "" }]);
  }

  async function updateSet(setId: string, field: "reps" | "weight_kg" | "rpe", value: number | null) {
    if (!workoutId) return;
    setSets(prev => prev.map(s => s.id === setId ? { ...s, [field]: value } : s));
    // Debounce the API call would be ideal but for simplicity update immediately
    await api.workouts.updateSet(workoutId, setId, { [field]: value });
  }

  async function deleteSet(setId: string) {
    if (!workoutId) return;
    await api.workouts.deleteSet(workoutId, setId);
    setSets(prev => prev.filter(s => s.id !== setId));
  }

  async function finishWorkout() {
    if (!workoutId) { navigate("/workouts"); return; }
    setFinishing(true);
    const duration = Math.floor((Date.now() - startTime.current.getTime()) / 1000);
    await api.workouts.update(workoutId, {
      title,
      ended_at: new Date().toISOString(),
      duration_seconds: duration,
    });
    qc.invalidateQueries({ queryKey: ["workouts"] });
    qc.invalidateQueries({ queryKey: ["dashboard"] });
    navigate(`/workouts/${workoutId}`);
  }

  // Group sets by exercise
  const exerciseGroups = sets.reduce((acc, s) => {
    if (!acc[s.exercise_id]) acc[s.exercise_id] = [];
    acc[s.exercise_id].push(s);
    return acc;
  }, {} as Record<string, typeof sets>);

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <input
            value={title} onChange={(e) => setTitle(e.target.value)}
            className="bg-transparent text-xl font-bold text-primary border-none outline-none w-64"
          />
          <p className="text-blue font-mono text-lg">{timer}</p>
        </div>
        <div className="flex gap-3">
          <button onClick={() => navigate("/workouts")} className="btn-secondary text-xs">Discard</button>
          <button onClick={finishWorkout} disabled={finishing} className="btn-primary">
            {finishing ? "Saving…" : "Finish ✓"}
          </button>
        </div>
      </div>

      {/* Exercise groups */}
      {Object.entries(exerciseGroups).map(([exerciseId, exSets]) => (
        <div key={exerciseId} className="card overflow-hidden">
          <div className="px-4 py-3 border-b border-border flex items-center justify-between bg-card">
            <p className="font-medium text-primary">{exSets[0].exercise_name}</p>
            <button
              onClick={() => addSetToExercise(exerciseId)}
              className="text-xs text-blue hover:text-blue-dim transition-colors"
            >
              + Add set
            </button>
          </div>
          <div className="px-4 py-2">
            <div className="grid grid-cols-[auto_1fr_1fr_1fr_auto] gap-2 py-1 mb-1">
              {["Set","kg","Reps","RPE",""].map((h, i) => (
                <span key={i} className="text-xs text-secondary text-center">{h}</span>
              ))}
            </div>
            {exSets.map((s) => (
              <SetRow key={s.id} set={s} onUpdate={updateSet} onDelete={deleteSet} />
            ))}
          </div>
        </div>
      ))}

      {/* Add exercise button */}
      <button
        onClick={() => setShowPicker(true)}
        className="w-full card py-5 text-sm text-blue border-dashed hover:bg-card/50 transition-all flex items-center justify-center gap-2"
      >
        <span className="text-lg">+</span> Add exercise
      </button>

      {/* Empty state */}
      {sets.length === 0 && (
        <div className="text-center py-8">
          <p className="text-secondary text-sm">Tap "Add exercise" to start logging</p>
        </div>
      )}

      {/* Exercise picker modal */}
      {showPicker && exercises && (
        <ExercisePicker
          exercises={exercises}
          onSelect={addExercise}
          onClose={() => setShowPicker(false)}
        />
      )}
    </div>
  );
}
