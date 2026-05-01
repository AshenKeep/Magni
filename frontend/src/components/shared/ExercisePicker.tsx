import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, type ExerciseResponse, type LogType, type MetricField, type TemplateSetCreate, type TemplateExerciseCreate } from "../../lib/api";
import { parseMuscleGroups, MUSCLE_CATEGORIES, exerciseMatchesMuscle } from "../../lib/muscleGroups";
import {
  defaultFieldsFor,
  METRIC_TO_TEMPLATE_SET_KEY,
  LOG_TYPE_LABELS,
} from "../../lib/metrics";
import { DynamicMetricFields } from "./DynamicMetricFields";

/**
 * Modal for picking a single exercise and configuring its sets before adding
 * to a template. Two-pane layout:
 *   - Left:  search box, muscle filter chips, scrollable list of exercises
 *   - Right: highlighted exercise preview (GIF + instructions) + set config form
 *
 * On confirm, calls `onAdd(payload)` with a TemplateExerciseCreate.
 * Caller closes the modal.
 */
export interface ExercisePickerProps {
  open: boolean;
  onClose: () => void;
  onAdd: (payload: TemplateExerciseCreate) => Promise<void>;
  /** Title text for the modal header. */
  title?: string;
}

interface SetDraft {
  set_number: number;
  log_type: LogType;
  enabled: MetricField[];
  values: Partial<Record<MetricField, number | null>>;
}

function emptySet(num: number, logType: LogType): SetDraft {
  const enabled = defaultFieldsFor(logType);
  return { set_number: num, log_type: logType, enabled, values: {} };
}

function setDraftToPayload(s: SetDraft): TemplateSetCreate {
  const out: TemplateSetCreate = { set_number: s.set_number, log_type: s.log_type };
  for (const f of s.enabled) {
    const v = s.values[f];
    if (v != null) {
      const key = METRIC_TO_TEMPLATE_SET_KEY[f] as keyof TemplateSetCreate;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (out as any)[key] = v;
    }
  }
  return out;
}

export function ExercisePicker({ open, onClose, onAdd, title }: ExercisePickerProps) {
  const { data: exercises = [] } = useQuery({
    queryKey: ["exercises"],
    queryFn: () => api.exercises.list(),
    enabled: open,
  });

  const [search, setSearch] = useState("");
  const [muscleFilter, setMuscleFilter] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [logType, setLogType] = useState<LogType>("strength");
  const [sets, setSets] = useState<SetDraft[]>([emptySet(1, "strength")]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const filtered = useMemo(() => {
    return exercises.filter(ex => {
      if (search && !ex.name.toLowerCase().includes(search.toLowerCase())) return false;
      if (muscleFilter && !exerciseMatchesMuscle(ex, muscleFilter)) return false;
      return true;
    });
  }, [exercises, search, muscleFilter]);

  const selected = exercises.find(e => e.id === selectedId) || null;

  const onSelect = (ex: ExerciseResponse) => {
    setSelectedId(ex.id);
    setError("");
    // Auto-suggest log_type based on muscle group
    const cats = parseMuscleGroups(ex);
    const isCardio = cats.includes("Cardio");
    const newType: LogType = isCardio ? "cardio" : "strength";
    setLogType(newType);
    setSets([emptySet(1, newType)]);
  };

  const changeLogType = (t: LogType) => {
    setLogType(t);
    // Reset sets to defaults for the new type so the UI feels predictable
    setSets(sets.map((_, i) => emptySet(i + 1, t)));
  };

  const addSet = () => {
    const last = sets[sets.length - 1];
    setSets([...sets, {
      set_number: sets.length + 1,
      log_type: last?.log_type ?? logType,
      enabled: last ? [...last.enabled] : defaultFieldsFor(logType),
      values: { ...(last?.values ?? {}) },
    }]);
  };

  const removeSet = (idx: number) => {
    if (sets.length === 1) return;
    setSets(sets.filter((_, i) => i !== idx).map((s, i) => ({ ...s, set_number: i + 1 })));
  };

  const updateSet = (idx: number, patch: Partial<SetDraft>) => {
    setSets(sets.map((s, i) => (i === idx ? { ...s, ...patch } : s)));
  };

  const handleAdd = async () => {
    if (!selected) return;
    setSubmitting(true);
    setError("");
    try {
      const payload: TemplateExerciseCreate = {
        exercise_id: selected.id,
        log_type: logType,
        sets: sets.map(setDraftToPayload),
      };
      await onAdd(payload);
      // Reset for next add
      setSelectedId(null);
      setSearch("");
      setSets([emptySet(1, "strength")]);
      setLogType("strength");
      onClose();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to add");
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
      <div className="bg-bg-primary border border-border rounded-2xl w-full max-w-5xl h-[85vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <h2 className="text-lg font-semibold">{title ?? "Add exercise"}</h2>
          <button onClick={onClose} className="text-text-muted hover:text-text-primary text-xl leading-none">×</button>
        </div>

        <div className="flex-1 flex overflow-hidden">
          {/* Left: list */}
          <div className="w-1/2 border-r border-border flex flex-col">
            <div className="p-4 border-b border-border space-y-2">
              <input
                type="text"
                placeholder="Search exercises…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="bg-bg-secondary border border-border rounded-lg px-3 py-2 text-sm w-full"
              />
              <div className="flex flex-wrap gap-1">
                <button
                  onClick={() => setMuscleFilter(null)}
                  className={`text-xs px-2 py-1 rounded ${muscleFilter === null ? "bg-primary text-white" : "bg-bg-secondary text-text-muted hover:text-text-primary"}`}
                >
                  All
                </button>
                {MUSCLE_CATEGORIES.map(m => (
                  <button
                    key={m}
                    onClick={() => setMuscleFilter(m)}
                    className={`text-xs px-2 py-1 rounded ${muscleFilter === m ? "bg-primary text-white" : "bg-bg-secondary text-text-muted hover:text-text-primary"}`}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex-1 overflow-y-auto">
              {filtered.length === 0 ? (
                <div className="p-6 text-center text-text-muted text-sm">No exercises match.</div>
              ) : (
                <ul className="divide-y divide-border">
                  {filtered.map(ex => (
                    <li
                      key={ex.id}
                      onClick={() => onSelect(ex)}
                      className={`px-4 py-3 cursor-pointer hover:bg-bg-secondary ${selectedId === ex.id ? "bg-bg-secondary border-l-4 border-primary" : ""}`}
                    >
                      <div className="font-medium text-sm">{ex.name}</div>
                      <div className="text-xs text-text-muted">
                        {parseMuscleGroups(ex).join(", ") || "—"}
                        {ex.equipment && ` · ${ex.equipment}`}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          {/* Right: preview + form */}
          <div className="w-1/2 flex flex-col overflow-hidden">
            {!selected ? (
              <div className="flex-1 flex items-center justify-center text-text-muted text-sm p-8 text-center">
                Pick an exercise from the list to configure sets.
              </div>
            ) : (
              <>
                <div className="p-4 border-b border-border overflow-y-auto max-h-[40%]">
                  <div className="flex gap-3">
                    {selected.gif_url && (
                      <img
                        src={selected.gif_url}
                        alt={selected.name}
                        className="w-32 h-32 object-cover rounded-lg bg-bg-secondary"
                      />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold">{selected.name}</div>
                      <div className="text-xs text-text-muted mt-0.5">
                        {parseMuscleGroups(selected).join(", ") || "—"}
                        {selected.equipment && ` · ${selected.equipment}`}
                      </div>
                      {selected.instructions && (
                        <div className="text-xs text-text-muted mt-2 line-clamp-4">
                          {selected.instructions}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="p-4 flex-1 overflow-y-auto">
                  {/* Log type selector */}
                  <div className="mb-3">
                    <label className="text-xs text-text-muted block mb-1">Log as</label>
                    <div className="flex gap-1">
                      {(["strength", "cardio", "mobility"] as LogType[]).map(t => (
                        <button
                          key={t}
                          onClick={() => changeLogType(t)}
                          className={`flex-1 text-xs px-3 py-2 rounded ${logType === t ? "bg-primary text-white" : "bg-bg-secondary text-text-muted hover:text-text-primary"}`}
                        >
                          {LOG_TYPE_LABELS[t]}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Sets */}
                  <div className="space-y-3">
                    {sets.map((s, idx) => (
                      <div key={idx} className="bg-bg-secondary border border-border rounded-lg p-3">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs font-medium">Set {s.set_number}</span>
                          {sets.length > 1 && (
                            <button
                              onClick={() => removeSet(idx)}
                              className="text-text-muted hover:text-danger text-xs"
                            >
                              Remove
                            </button>
                          )}
                        </div>
                        <DynamicMetricFields
                          logType={s.log_type}
                          enabled={s.enabled}
                          values={s.values}
                          onEnabledChange={enabled => updateSet(idx, { enabled })}
                          onValueChange={(field, value) =>
                            updateSet(idx, { values: { ...s.values, [field]: value } })
                          }
                          compact
                        />
                      </div>
                    ))}
                    <button
                      onClick={addSet}
                      className="text-xs text-primary hover:underline"
                    >
                      + Add another set
                    </button>
                  </div>
                </div>

                {error && (
                  <div className="px-4 pb-2 text-xs text-danger">{error}</div>
                )}

                <div className="border-t border-border p-4 flex justify-end gap-2">
                  <button onClick={onClose} className="btn-secondary text-sm">Cancel</button>
                  <button
                    onClick={handleAdd}
                    disabled={submitting || !selected}
                    className="btn-primary text-sm disabled:opacity-50"
                  >
                    {submitting ? "Adding…" : "Add to template"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
