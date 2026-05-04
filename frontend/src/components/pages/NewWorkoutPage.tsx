/**
 * Workout Logger — /workouts/new?workout_id=<id>
 *
 * Two phases:
 *   PRE-START: shows planned sets as read-only targets + big Start button.
 *   ACTIVE:    global timer runs, each set is editable, each has a Done button
 *              and a rest-interval stopwatch. Finish button saves & navigates away.
 */
import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { api, type WorkoutSetResponse, type ExerciseResponse, type LogType, type MetricField } from "@/lib/api";
import { DynamicMetricFields } from "@/components/shared/DynamicMetricFields";
import { defaultFieldsFor, METRIC_TO_WORKOUT_SET_KEY, LOG_TYPE_LABELS, formatDuration as fmtSecs } from "@/lib/metrics";
import { exerciseMatchesSearch } from "@/lib/muscleGroups";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function useInterval(fn: () => void, ms: number, running: boolean) {
  const fnRef = useRef(fn);
  fnRef.current = fn;
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => fnRef.current(), ms);
    return () => clearInterval(id);
  }, [ms, running]);
}

function fmtTimer(elapsed: number): string {
  const h = Math.floor(elapsed / 3600);
  const m = Math.floor((elapsed % 3600) / 60);
  const s = elapsed % 60;
  if (h > 0) return `${h}:${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`;
  return `${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`;
}

function detectEnabled(set: WorkoutSetResponse): MetricField[] {
  const fields: MetricField[] = [];
  if (set.reps != null) fields.push("reps");
  if (set.weight_kg != null) fields.push("weight_kg");
  if (set.duration_seconds != null) fields.push("duration_seconds");
  if (set.distance_m != null) fields.push("distance_m");
  if (set.pace_seconds_per_km != null) fields.push("pace_seconds_per_km");
  if (set.incline_pct != null) fields.push("incline_pct");
  if (set.laps != null) fields.push("laps");
  if (set.avg_heart_rate != null) fields.push("avg_heart_rate");
  if (set.calories != null) fields.push("calories");
  return fields.length ? fields : defaultFieldsFor((set.log_type ?? "strength") as LogType);
}

function targetSummary(set: WorkoutSetResponse): string {
  const parts: string[] = [];
  if (set.reps != null) parts.push(`${set.reps} reps`);
  if (set.weight_kg != null) parts.push(`${set.weight_kg}kg`);
  if (set.duration_seconds != null) parts.push(fmtSecs(set.duration_seconds));
  if (set.distance_m != null) parts.push(set.distance_m >= 1000 ? `${(set.distance_m/1000).toFixed(2)}km` : `${set.distance_m}m`);
  if (set.laps != null) parts.push(`${set.laps} laps`);
  if (set.incline_pct != null) parts.push(`${set.incline_pct}%`);
  if (set.avg_heart_rate != null) parts.push(`HR ${set.avg_heart_rate}`);
  if (set.calories != null) parts.push(`${set.calories} kcal`);
  return parts.join(" · ") || "—";
}

// ---------------------------------------------------------------------------
// Rest Timer
// ---------------------------------------------------------------------------

function RestTimer() {
  const [running, setRunning] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  useInterval(() => setElapsed(e => e + 1), 1000, running);
  return (
    <div className="flex items-center gap-3 py-2 px-3 bg-blue-glow border border-blue/20 rounded-lg text-xs mt-1">
      <span className="text-secondary">Rest</span>
      <span className="font-mono text-primary text-sm w-12 text-center">{fmtTimer(elapsed)}</span>
      <button
        onClick={() => setRunning(r => !r)}
        className={`px-3 py-1 rounded text-xs font-medium ${running ? "bg-danger text-white" : "bg-blue text-white"}`}
      >
        {running ? "Stop" : "Start"}
      </button>
      <button
        onClick={() => { setElapsed(0); setRunning(false); }}
        className="text-secondary hover:text-primary"
      >
        Reset
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Set edit modal — full fields
// ---------------------------------------------------------------------------

function SetEditModal({
  set,
  target,
  onSave,
  onClose,
}: {
  set: SetState;
  target: WorkoutSetResponse;
  onSave: (patch: Partial<WorkoutSetResponse>) => void;
  onClose: () => void;
}) {
  const [enabled, setEnabled] = useState<MetricField[]>(() => detectEnabled({ ...target, ...set.actual } as WorkoutSetResponse));
  const [values, setValues] = useState<Partial<Record<MetricField, number | null>>>({ ...set.actual });

  const handleSave = () => {
    const patch: Partial<WorkoutSetResponse> = {};
    for (const f of enabled) {
      const key = METRIC_TO_WORKOUT_SET_KEY[f] as keyof WorkoutSetResponse;
      (patch as Record<string, unknown>)[key] = values[f] ?? null;
    }
    onSave(patch);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/80 z-50 flex items-end sm:items-center justify-center p-4">
      <div className="bg-surface border border-border rounded-2xl w-full max-w-sm">
        <div className="p-4 border-b border-border flex items-center justify-between">
          <p className="font-medium text-primary">Set {set.set_number} — edit values</p>
          <button onClick={onClose} className="text-secondary hover:text-primary text-xl">×</button>
        </div>
        <div className="p-4 space-y-3">
          <div className="text-xs text-secondary bg-card rounded-lg px-3 py-2">
            Target: {targetSummary(target)}
          </div>
          <DynamicMetricFields
            logType={(set.log_type ?? "strength") as LogType}
            enabled={enabled}
            values={values}
            onEnabledChange={setEnabled}
            onValueChange={(f, v) => setValues(prev => ({ ...prev, [f]: v }))}
            compact={false}
          />
        </div>
        <div className="p-4 border-t border-border flex gap-3">
          <button onClick={onClose} className="btn-secondary flex-1">Cancel</button>
          <button onClick={handleSave} className="btn-primary flex-1">Save</button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// State shape for a set during active logging
// ---------------------------------------------------------------------------

interface SetState {
  id: string;
  exercise_id: string;
  set_number: number;
  log_type: string;
  is_done: boolean;
  notes: string | null;
  // actual values the user enters — start from template targets
  actual: Partial<Record<MetricField, number | null>>;
}

function setToActual(s: WorkoutSetResponse): Partial<Record<MetricField, number | null>> {
  return {
    reps: s.reps, weight_kg: s.weight_kg,
    duration_seconds: s.duration_seconds, distance_m: s.distance_m,
    pace_seconds_per_km: s.pace_seconds_per_km, incline_pct: s.incline_pct,
    laps: s.laps, avg_heart_rate: s.avg_heart_rate, calories: s.calories,
  };
}

// ---------------------------------------------------------------------------
// In-line set row (compact editing + done button)
// ---------------------------------------------------------------------------

function SetRow({
  state,
  target,
  active,
  onFieldChange,
  onDone,
  onOpenModal,
}: {
  state: SetState;
  target: WorkoutSetResponse;
  active: boolean;
  onFieldChange: (f: MetricField, v: number | null) => void;
  onDone: () => void;
  onOpenModal: () => void;
}) {
  const [enabled, setEnabled] = useState<MetricField[]>(() => detectEnabled({ ...target, ...state.actual } as WorkoutSetResponse));

  return (
    <div className={`border border-border rounded-xl p-3 transition-colors ${state.is_done ? "opacity-70 bg-card/50" : "bg-card"}`}>
      {/* Set header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-secondary">Set {state.set_number}</span>
          <span className="text-[10px] text-secondary uppercase">{LOG_TYPE_LABELS[(state.log_type ?? "strength") as LogType]}</span>
        </div>
        <div className="flex items-center gap-2">
          {active && (
            <button
              onClick={onOpenModal}
              className="text-[10px] text-blue hover:underline"
            >
              Edit all
            </button>
          )}
          {active && (
            <button
              onClick={onDone}
              className={`flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg font-medium transition-all ${
                state.is_done
                  ? "bg-green-500/20 text-green-400 border border-green-500/30"
                  : "bg-card border border-border hover:border-blue text-secondary"
              }`}
            >
              {state.is_done ? "✓ Done" : "Done"}
            </button>
          )}
        </div>
      </div>

      {/* Target row — always visible */}
      <div className="text-[11px] text-secondary italic mb-2 px-1">
        Target: {targetSummary(target)}
      </div>

      {/* Notes from template */}
      {state.notes && (
        <div className="text-[11px] text-blue italic bg-blue-glow border border-blue/20 rounded px-2 py-1 mb-2">
          📝 {state.notes}
        </div>
      )}

      {/* Actual inputs — only editable when workout is active */}
      {active ? (
        <DynamicMetricFields
          logType={(state.log_type ?? "strength") as LogType}
          enabled={enabled}
          values={state.actual}
          onEnabledChange={setEnabled}
          onValueChange={onFieldChange}
          compact
        />
      ) : (
        <div className="text-xs text-secondary px-1">
          {targetSummary({ ...target, ...state.actual } as WorkoutSetResponse)}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Exercise picker (reused from v0.0.9, lightweight inline version)
// ---------------------------------------------------------------------------

function InlineExercisePicker({ exercises, onSelect, onClose }: {
  exercises: ExerciseResponse[];
  onSelect: (ex: ExerciseResponse) => void;
  onClose: () => void;
}) {
  const [search, setSearch] = useState("");
  const filtered = exercises.filter(e => exerciseMatchesSearch(e, search));

  return (
    <div className="fixed inset-0 bg-black/80 z-50 flex items-end sm:items-center justify-center p-4">
      <div className="bg-surface border border-border rounded-2xl w-full max-w-md max-h-[70vh] flex flex-col">
        <div className="p-4 border-b border-border flex items-center justify-between">
          <p className="font-medium text-primary">Add exercise</p>
          <button onClick={onClose} className="text-secondary hover:text-primary text-xl">×</button>
        </div>
        <div className="p-3 border-b border-border">
          <input autoFocus value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search exercises…" className="input text-sm" />
        </div>
        <div className="flex-1 overflow-y-auto divide-y divide-border/40">
          {filtered.slice(0, 50).map(ex => (
            <button key={ex.id} onClick={() => onSelect(ex)}
              className="w-full text-left px-4 py-3 hover:bg-card transition-colors">
              <p className="text-sm text-primary">{ex.name}</p>
              <p className="text-xs text-secondary">{ex.equipment ?? "—"}</p>
            </button>
          ))}
          {filtered.length === 0 && <p className="p-6 text-center text-secondary text-sm">No results.</p>}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function NewWorkoutPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const qc = useQueryClient();

  const workoutIdParam = searchParams.get("workout_id");
  const [workoutId, setWorkoutId] = useState<string | null>(workoutIdParam);
  const [title, setTitle] = useState(`Workout ${format(new Date(), "d MMM")}`);

  // Phase: "pre" = not started yet, "active" = running, "done" = finished
  const [phase, setPhase] = useState<"pre" | "active" | "done">("pre");
  const [globalElapsed, setGlobalElapsed] = useState(0);
  const startedAtRef = useRef<Date | null>(null);

  // The raw server-side sets (used as targets)
  const [targets, setTargets] = useState<Record<string, WorkoutSetResponse>>({});
  // The mutable state the user edits
  const [sets, setSets] = useState<SetState[]>([]);
  // Order of exercise groups
  const [exerciseOrder, setExerciseOrder] = useState<string[]>([]);

  const [editModal, setEditModal] = useState<string | null>(null); // set id
  const [showPicker, setShowPicker] = useState(false);
  const [finishing, setFinishing] = useState(false);

  const { data: exercises } = useQuery({ queryKey: ["exercises"], queryFn: api.exercises.list });
  const exerciseMap = (exercises ?? []).reduce((acc, ex) => { acc[ex.id] = ex; return acc; }, {} as Record<string, ExerciseResponse>);

  // Global timer — runs only when phase === "active"
  useInterval(() => setGlobalElapsed(e => e + 1), 1000, phase === "active");

  // Load existing workout on mount
  useEffect(() => {
    if (!workoutId) return;
    let cancelled = false;
    (async () => {
      try {
        const w = await api.workouts.get(workoutId);
        if (cancelled) return;
        if (w.title) setTitle(w.title);

        const targetsMap: Record<string, WorkoutSetResponse> = {};
        const newSets: SetState[] = [];
        const order: string[] = [];

        for (const s of w.sets) {
          targetsMap[s.id] = s;
          newSets.push({
            id: s.id, exercise_id: s.exercise_id, set_number: s.set_number,
            log_type: s.log_type, is_done: s.is_done, notes: s.notes,
            actual: setToActual(s),
          });
          if (!order.includes(s.exercise_id)) order.push(s.exercise_id);
        }

        setTargets(targetsMap);
        setSets(newSets);
        setExerciseOrder(order);

        // If the workout was already active (ended_at is null but it has a started_at)
        // remain in pre phase so the user can explicitly press Start
      } catch (e) {
        console.error("Failed to load workout", e);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workoutId, exercises]);

  // -------------------------------------------------------------------------
  // Start / Finish
  // -------------------------------------------------------------------------

  const handleStart = useCallback(async () => {
    const now = new Date();
    startedAtRef.current = now;
    setPhase("active");

    // Create the workout if needed (blank workout started from scratch)
    let wid = workoutId;
    if (!wid) {
      const w = await api.workouts.create({ title, started_at: now.toISOString() });
      wid = w.id;
      setWorkoutId(wid);
    } else {
      // Stamp the actual start time now (not the template schedule date)
      await api.workouts.update(wid, { started_at: now.toISOString() });
    }
  }, [workoutId, title]);

  const handleFinish = useCallback(async () => {
    if (!workoutId || finishing) return;
    setFinishing(true);
    const now = new Date();
    const duration = startedAtRef.current
      ? Math.floor((now.getTime() - startedAtRef.current.getTime()) / 1000)
      : globalElapsed;

    // Save any un-saved set changes first
    // (sets are saved optimistically on each change, so just finish)
    await api.workouts.update(workoutId, {
      title,
      ended_at: now.toISOString(),
      duration_seconds: duration,
    });

    qc.invalidateQueries({ queryKey: ["workouts"] });
    qc.invalidateQueries({ queryKey: ["workouts-today"] });
    qc.invalidateQueries({ queryKey: ["workouts-activity"] });
    qc.invalidateQueries({ queryKey: ["dashboard"] });
    navigate(`/workouts/${workoutId}`);
  }, [workoutId, finishing, title, globalElapsed, navigate, qc]);

  // -------------------------------------------------------------------------
  // Set manipulation
  // -------------------------------------------------------------------------

  const updateSetField = useCallback(async (setId: string, f: MetricField, v: number | null) => {
    setSets(prev => prev.map(s => s.id === setId ? { ...s, actual: { ...s.actual, [f]: v } } : s));
    if (!workoutId) return;
    const key = METRIC_TO_WORKOUT_SET_KEY[f];
    await api.workouts.updateSet(workoutId, setId, { [key]: v });
  }, [workoutId]);

  const updateSetPatch = useCallback(async (setId: string, patch: Partial<WorkoutSetResponse>) => {
    setSets(prev => prev.map(s => {
      if (s.id !== setId) return s;
      const actual = { ...s.actual };
      for (const [k, v] of Object.entries(patch)) {
        const mf = Object.entries(METRIC_TO_WORKOUT_SET_KEY).find(([, mk]) => mk === k)?.[0] as MetricField | undefined;
        if (mf) actual[mf] = v as number;
      }
      return { ...s, actual };
    }));
    if (!workoutId) return;
    await api.workouts.updateSet(workoutId, setId, patch);
  }, [workoutId]);

  const toggleDone = useCallback(async (setId: string) => {
    const set = sets.find(s => s.id === setId);
    if (!set) return;
    const newDone = !set.is_done;
    setSets(prev => prev.map(s => s.id === setId ? { ...s, is_done: newDone } : s));
    if (!workoutId) return;
    await api.workouts.updateSet(workoutId, setId, { is_done: newDone });
  }, [sets, workoutId]);

  const addSet = useCallback(async (exerciseId: string) => {
    if (!workoutId) return;
    const exSets = sets.filter(s => s.exercise_id === exerciseId);
    const last = exSets[exSets.length - 1];
    const newSet = await api.workouts.addSet(workoutId, {
      exercise_id: exerciseId,
      set_number: exSets.length + 1,
      log_type: (last?.log_type ?? "strength") as LogType,
      reps: last ? (targets[last.id]?.reps ?? undefined) : undefined,
      weight_kg: last ? (targets[last.id]?.weight_kg ?? undefined) : undefined,
    });
    setTargets(prev => ({ ...prev, [newSet.id]: newSet }));
    setSets(prev => [...prev, {
      id: newSet.id, exercise_id: exerciseId, set_number: newSet.set_number,
      log_type: newSet.log_type, is_done: false, notes: null,
      actual: setToActual(newSet),
    }]);
  }, [workoutId, sets, targets]);

  const addExercise = useCallback(async (ex: ExerciseResponse) => {
    if (!workoutId) return;
    const newSet = await api.workouts.addSet(workoutId, {
      exercise_id: ex.id, set_number: 1,
      log_type: "strength",
    });
    setTargets(prev => ({ ...prev, [newSet.id]: newSet }));
    setSets(prev => [...prev, {
      id: newSet.id, exercise_id: ex.id, set_number: 1,
      log_type: newSet.log_type, is_done: false, notes: null,
      actual: setToActual(newSet),
    }]);
    setExerciseOrder(prev => prev.includes(ex.id) ? prev : [...prev, ex.id]);
    setShowPicker(false);
  }, [workoutId]);

  // -------------------------------------------------------------------------
  // Grouped view
  // -------------------------------------------------------------------------

  const groupedSets = exerciseOrder.map(exId => ({
    exercise_id: exId,
    sets: sets.filter(s => s.exercise_id === exId).sort((a, b) => a.set_number - b.set_number),
  }));

  // Any sets from exercises not in order yet (edge case)
  const unmappedExIds = [...new Set(sets.map(s => s.exercise_id).filter(id => !exerciseOrder.includes(id)))];
  for (const id of unmappedExIds) {
    groupedSets.push({ exercise_id: id, sets: sets.filter(s => s.exercise_id === id) });
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  const isActive = phase === "active";

  return (
    <div className="max-w-2xl mx-auto p-4 md:p-6 space-y-4 pb-24">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex-1 min-w-0">
          <input
            value={title}
            onChange={e => setTitle(e.target.value)}
            className="bg-transparent text-xl font-bold text-primary border-none outline-none w-full truncate"
          />
          {isActive && (
            <p className="font-mono text-blue text-lg">{fmtTimer(globalElapsed)}</p>
          )}
        </div>
        <div className="flex gap-2 shrink-0">
          <button
            onClick={() => navigate(-1)}
            className="btn-secondary text-xs"
          >
            {isActive ? "Discard" : "← Back"}
          </button>
          {isActive && (
            <button
              onClick={handleFinish}
              disabled={finishing}
              className="btn-primary"
            >
              {finishing ? "Saving…" : "Finish ✓"}
            </button>
          )}
        </div>
      </div>

      {/* PRE-START banner */}
      {!isActive && (
        <div className="card p-6 text-center space-y-4">
          <p className="text-secondary text-sm">
            {sets.length > 0
              ? `${groupedSets.length} exercise${groupedSets.length !== 1 ? "s" : ""} · ${sets.length} set${sets.length !== 1 ? "s" : ""} planned below`
              : "Add exercises below or start a blank session."}
          </p>
          <button onClick={handleStart} className="btn-primary text-base px-8 py-3">
            ▶ Start workout
          </button>
        </div>
      )}

      {/* Exercise groups */}
      {groupedSets.map(({ exercise_id, sets: exSets }) => {
        const ex = exerciseMap[exercise_id];
        const doneSets = exSets.filter(s => s.is_done).length;
        const totalSets = exSets.length;

        return (
          <div key={exercise_id} className="card overflow-hidden">
            {/* Exercise header */}
            <div className="px-4 py-3 border-b border-border bg-card flex items-center gap-3">
              {ex?.gif_url && (
                <img src={ex.gif_url} alt="" className="w-10 h-10 rounded-lg object-cover" />
              )}
              <div className="flex-1 min-w-0">
                <p className="font-medium text-primary truncate">{ex?.name ?? "Unknown"}</p>
                {isActive && (
                  <p className="text-xs text-secondary">
                    {doneSets}/{totalSets} sets done
                  </p>
                )}
              </div>
            </div>

            {/* Sets */}
            <div className="p-3 space-y-3">
              {exSets.map((s, idx) => {
                const tgt = targets[s.id] ?? {} as WorkoutSetResponse;
                return (
                  <div key={s.id}>
                    <SetRow
                      state={s}
                      target={tgt}
                      active={isActive}
                      onFieldChange={(f, v) => updateSetField(s.id, f, v)}
                      onDone={() => toggleDone(s.id)}
                      onOpenModal={() => setEditModal(s.id)}
                    />
                    {/* Rest timer — shown below each set once active, collapsed by default */}
                    {isActive && (
                      <RestTimer key={`rest-${s.id}`} />
                    )}
                  </div>
                );
              })}

              {/* Add set */}
              {isActive && (
                <button
                  onClick={() => addSet(exercise_id)}
                  className="text-xs text-blue hover:underline w-full text-left px-1 mt-1"
                >
                  + Add set
                </button>
              )}
            </div>
          </div>
        );
      })}

      {/* Add exercise button */}
      {isActive && (
        <button
          onClick={() => setShowPicker(true)}
          className="w-full py-3 text-sm text-blue border border-dashed border-blue/30 rounded-xl hover:bg-blue-glow/20 transition-colors"
        >
          + Add exercise
        </button>
      )}

      {/* Edit modal */}
      {editModal && targets[editModal] && (
        <SetEditModal
          set={sets.find(s => s.id === editModal)!}
          target={targets[editModal]}
          onSave={patch => updateSetPatch(editModal, patch)}
          onClose={() => setEditModal(null)}
        />
      )}

      {/* Exercise picker */}
      {showPicker && (
        <InlineExercisePicker
          exercises={exercises ?? []}
          onSelect={addExercise}
          onClose={() => setShowPicker(false)}
        />
      )}
    </div>
  );
}
