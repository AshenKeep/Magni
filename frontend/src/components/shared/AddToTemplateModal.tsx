import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, type ExerciseResponse, type LogType, type MetricField, type TemplateExerciseCreate, type TemplateSetCreate } from "../../lib/api";
import { parseMuscleGroups } from "../../lib/muscleGroups";
import { defaultFieldsFor, METRIC_TO_TEMPLATE_SET_KEY, LOG_TYPE_LABELS } from "../../lib/metrics";
import { DynamicMetricFields } from "./DynamicMetricFields";

interface SetDraft {
  set_number: number;
  log_type: LogType;
  enabled: MetricField[];
  values: Partial<Record<MetricField, number | null>>;
}

function emptySet(num: number, logType: LogType): SetDraft {
  return { set_number: num, log_type: logType, enabled: defaultFieldsFor(logType), values: {} };
}

function setToPayload(s: SetDraft): TemplateSetCreate {
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

export interface AddToTemplateModalProps {
  exercise: ExerciseResponse;
  onClose: () => void;
}

/**
 * Lightweight modal launched from the Exercises tab — same configure-sets UI as
 * ExercisePicker but with a template selector instead of an exercise list.
 */
export function AddToTemplateModal({ exercise, onClose }: AddToTemplateModalProps) {
  const qc = useQueryClient();
  const { data: templates = [] } = useQuery({
    queryKey: ["templates"],
    queryFn: api.templates.list,
  });

  // Auto-suggest cardio if exercise's muscle group is Cardio
  const cats = parseMuscleGroups(exercise);
  const initialType: LogType = cats.includes("Cardio") ? "cardio" : "strength";

  const [templateId, setTemplateId] = useState<string>(templates[0]?.id ?? "");
  const [logType, setLogType] = useState<LogType>(initialType);
  const [sets, setSets] = useState<SetDraft[]>([emptySet(1, initialType)]);
  const [error, setError] = useState("");

  const addMut = useMutation({
    mutationFn: (payload: TemplateExerciseCreate) =>
      api.templates.addExercise(templateId, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["templates"] });
      qc.invalidateQueries({ queryKey: ["template", templateId] });
      onClose();
    },
    onError: (e: Error) => setError(e.message),
  });

  const changeLogType = (t: LogType) => {
    setLogType(t);
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

  const submit = () => {
    if (!templateId) {
      setError("Pick a template first.");
      return;
    }
    const tpl = templates.find(t => t.id === templateId);
    addMut.mutate({
      exercise_id: exercise.id,
      log_type: logType,
      order: tpl?.exercises.length ?? 0,
      sets: sets.map(setToPayload),
    });
  };

  return (
    <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-surface border border-border rounded-2xl w-full max-w-md my-4">
        <div className="p-5 border-b border-border flex items-center justify-between">
          <h3 className="font-medium text-primary">Add to template</h3>
          <button onClick={onClose} className="text-secondary hover:text-primary text-xl">×</button>
        </div>
        <div className="p-5 space-y-4">
          {error && (
            <div className="bg-danger/10 border border-danger/30 text-danger text-sm rounded-lg px-4 py-3">{error}</div>
          )}

          <div className="text-sm">
            <span className="text-secondary">Exercise: </span>
            <span className="text-primary font-medium">{exercise.name}</span>
          </div>

          {templates.length === 0 ? (
            <div className="bg-card border border-border rounded-lg p-4 text-sm text-secondary">
              You don't have any templates yet. Create one in the Templates tab first.
            </div>
          ) : (
            <>
              <div>
                <label className="label">Template</label>
                <select
                  value={templateId}
                  onChange={(e) => setTemplateId(e.target.value)}
                  className="input"
                >
                  {templates.map(t => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="label">Log as</label>
                <div className="flex gap-1">
                  {(["strength", "cardio", "mobility"] as LogType[]).map(t => (
                    <button
                      key={t}
                      onClick={() => changeLogType(t)}
                      className={`flex-1 text-xs px-3 py-2 rounded ${logType === t ? "bg-blue text-white" : "bg-card text-secondary hover:text-primary"}`}
                    >
                      {LOG_TYPE_LABELS[t]}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <label className="label">Sets</label>
                {sets.map((s, idx) => (
                  <div key={idx} className="bg-card border border-border rounded-lg p-3">
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
                      onEnabledChange={(enabled) => updateSet(idx, { enabled })}
                      onValueChange={(field, value) =>
                        updateSet(idx, { values: { ...s.values, [field]: value } })
                      }
                      compact
                    />
                  </div>
                ))}
                <button onClick={addSet} className="text-xs text-primary hover:underline">+ Add another set</button>
              </div>
            </>
          )}

          <div className="flex gap-3 pt-2">
            <button onClick={onClose} className="btn-secondary flex-1">Cancel</button>
            <button
              onClick={submit}
              disabled={addMut.isPending || templates.length === 0 || !templateId}
              className="btn-primary flex-1 disabled:opacity-50"
            >
              {addMut.isPending ? "Adding…" : "Add to template"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
