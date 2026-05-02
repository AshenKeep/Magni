import { useState, useEffect, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ExerciseResponse, WorkoutSetResponse, type LogType, type MetricField } from "@/lib/api";
import { format } from "date-fns";
import { DynamicMetricFields } from "@/components/shared/DynamicMetricFields";
import { defaultFieldsFor, METRIC_TO_WORKOUT_SET_KEY, LOG_TYPE_LABELS } from "@/lib/metrics";
import { exerciseMatchesSearch } from "@/lib/muscleGroups";

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

// Helper: determine which metric fields are populated on an existing set so
// we know what inputs to render. Used when loading sets pre-filled from a
// template — we honour whatever the template put on the set.
function detectEnabledFields(set: WorkoutSetResponse): MetricField[] {
  const enabled: MetricField[] = [];
  if (set.reps != null) enabled.push("reps");
  if (set.weight_kg != null) enabled.push("weight_kg");
  if (set.duration_seconds != null) enabled.push("duration_seconds");
  if (set.distance_m != null) enabled.push("distance_m");
  if (set.pace_seconds_per_km != null) enabled.push("pace_seconds_per_km");
  if (set.incline_pct != null) enabled.push("incline_pct");
  if (set.laps != null) enabled.push("laps");
  if (set.avg_heart_rate != null) enabled.push("avg_heart_rate");
  if (set.calories != null) enabled.push("calories");
  // If nothing is set yet, fall back to log_type defaults
  if (enabled.length === 0) return defaultFieldsFor(set.log_type as LogType);
  return enabled;
}

// --- Set row (type-aware) ---
interface SetRowProps {
  set: WorkoutSetResponse & { exercise_name?: string };
  onUpdate: (id: string, patch: Partial<WorkoutSetResponse>) => void;
  onDelete: (id: string) => void;
}

function SetRow({ set, onUpdate, onDelete }: SetRowProps) {
  const [enabled, setEnabled] = useState<MetricField[]>(() => detectEnabledFields(set));
  // Snapshot of values for the dynamic-field component
  const values: Partial<Record<MetricField, number | null>> = {
    reps: set.reps, weight_kg: set.weight_kg,
    duration_seconds: set.duration_seconds, distance_m: set.distance_m,
    pace_seconds_per_km: set.pace_seconds_per_km, incline_pct: set.incline_pct,
    laps: set.laps, avg_heart_rate: set.avg_heart_rate, calories: set.calories,
  };

  const handleValueChange = (field: MetricField, value: number | null) => {
    const key = METRIC_TO_WORKOUT_SET_KEY[field] as keyof WorkoutSetResponse;
    onUpdate(set.id, { [key]: value } as Partial<WorkoutSetResponse>);
  };

  return (
    <div className="border-b border-border/50 py-2 px-1">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-secondary">Set {set.set_number}</span>
        <button onClick={() => onDelete(set.id)} className="text-secondary hover:text-danger text-xs">×</button>
      </div>
      {set.notes && (
        <div className="text-[11px] text-blue italic mb-1.5 bg-blue-glow border border-blue/20 rounded px-2 py-1">
          📝 {set.notes}
        </div>
      )}
      <DynamicMetricFields
        logType={(set.log_type ?? "strength") as LogType}
        enabled={enabled}
        values={values}
        onEnabledChange={setEnabled}
        onValueChange={handleValueChange}
        compact
      />
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
  const filtered = exercises.filter(e => exerciseMatchesSearch(e, search));

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

  // If we navigated here with ?workout_id=… (i.e. started from a template),
  // load the existing workout and pre-fill the set list. This is what makes
  // template-driven workouts editable in v0.0.7.
  useEffect(() => {
    if (!workoutId || sets.length > 0) return;
    let cancelled = false;
    (async () => {
      try {
        const w = await api.workouts.get(workoutId);
        if (cancelled) return;
        if (w.title) setTitle(w.title);
        const enriched = w.sets.map(s => ({
          ...s,
          exercise_name: exerciseMap[s.exercise_id]?.name ?? "",
        }));
        setSets(enriched);
      } catch { /* swallow — empty workout is fine */ }
    })();
    return () => { cancelled = true; };
    // Only run on first mount with a workout ID
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workoutId, exercises]);

  // Create workout on first set add if not already created
  async function ensureWorkout(): Promise<string> {
    if (workoutId) return workoutId;
    const w = await api.workouts.create({ title, started_at: startTime.current.toISOString() });
    setWorkoutId(w.id);
    return w.id;
  }

  async function addExercise(ex: ExerciseResponse) {
    const wid = await ensureWorkout();
    const existingSets = sets.filter(s => s.exercise_id === ex.id);
    const setNum = existingSets.length + 1;
    const lastSet = existingSets[existingSets.length - 1];
    const logType: LogType = (lastSet?.log_type as LogType) ?? "strength";

    const newSet = await api.workouts.addSet(wid, {
      exercise_id: ex.id,
      set_number: setNum,
      log_type: logType,
      reps: lastSet?.reps ?? undefined,
      weight_kg: lastSet?.weight_kg ?? undefined,
      duration_seconds: lastSet?.duration_seconds ?? undefined,
      distance_m: lastSet?.distance_m ?? undefined,
    });
    setSets(prev => [...prev, { ...newSet, exercise_name: ex.name }]);
  }

  async function addSetToExercise(exerciseId: string) {
    const wid = await ensureWorkout();
    const ex = exerciseMap[exerciseId];
    const existingSets = sets.filter(s => s.exercise_id === exerciseId);
    const setNum = existingSets.length + 1;
    const lastSet = existingSets[existingSets.length - 1];
    const logType: LogType = (lastSet?.log_type as LogType) ?? "strength";

    const newSet = await api.workouts.addSet(wid, {
      exercise_id: exerciseId,
      set_number: setNum,
      log_type: logType,
      reps: lastSet?.reps ?? undefined,
      weight_kg: lastSet?.weight_kg ?? undefined,
      duration_seconds: lastSet?.duration_seconds ?? undefined,
      distance_m: lastSet?.distance_m ?? undefined,
    });
    setSets(prev => [...prev, { ...newSet, exercise_name: ex?.name ?? "" }]);
  }

  async function updateSet(setId: string, patch: Partial<WorkoutSetResponse>) {
    if (!workoutId) return;
    setSets(prev => prev.map(s => s.id === setId ? { ...s, ...patch } : s));
    await api.workouts.updateSet(workoutId, setId, patch);
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
      {Object.entries(exerciseGroups).map(([exerciseId, exSets]) => {
        const logType = (exSets[0].log_type ?? "strength") as LogType;
        return (
          <div key={exerciseId} className="card overflow-hidden">
            <div className="px-4 py-3 border-b border-border flex items-center justify-between bg-card">
              <div>
                <p className="font-medium text-primary">{exSets[0].exercise_name}</p>
                <p className="text-[10px] text-secondary uppercase tracking-wide">{LOG_TYPE_LABELS[logType]}</p>
              </div>
              <button
                onClick={() => addSetToExercise(exerciseId)}
                className="text-xs text-blue hover:text-blue-dim transition-colors"
              >
                + Add set
              </button>
            </div>
            <div className="px-4 py-2 space-y-1">
              {exSets.sort((a, b) => a.set_number - b.set_number).map((s) => (
                <SetRow key={s.id} set={s} onUpdate={updateSet} onDelete={deleteSet} />
              ))}
            </div>
          </div>
        );
      })}

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
