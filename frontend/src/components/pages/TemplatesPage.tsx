import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { api, type TemplateResponse } from "../../lib/api";

function NewTemplateModal({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");

  const create = useMutation({
    mutationFn: () => api.templates.create({ name, notes: notes || undefined }),
    onSuccess: (t) => {
      qc.invalidateQueries({ queryKey: ["templates"] });
      onCreated(t.id);
    },
    onError: (e: Error) => setError(e.message),
  });

  return (
    <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
      <div className="bg-surface border border-border rounded-2xl w-full max-w-md">
        <div className="p-5 border-b border-border flex items-center justify-between">
          <h3 className="font-medium text-primary">New template</h3>
          <button onClick={onClose} className="text-secondary hover:text-primary text-xl">×</button>
        </div>
        <div className="p-5 space-y-4">
          {error && (
            <div className="bg-danger/10 border border-danger/30 text-danger text-sm rounded-lg px-4 py-3">{error}</div>
          )}
          <div>
            <label className="label">Template name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} className="input" placeholder="e.g. Push Day A" autoFocus />
          </div>
          <div>
            <label className="label">Notes (optional)</label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} className="input resize-none h-16" />
          </div>
          <p className="text-xs text-secondary">
            You'll add exercises after creating. Each can be configured with its own
            sets — strength, cardio, or mobility.
          </p>
          <div className="flex gap-3 pt-2">
            <button onClick={onClose} className="btn-secondary flex-1">Cancel</button>
            <button
              onClick={() => create.mutate()}
              disabled={!name || create.isPending}
              className="btn-primary flex-1"
            >
              {create.isPending ? "Creating…" : "Create"}
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
  const [showNew, setShowNew] = useState(false);

  const { data: templates, isLoading } = useQuery({
    queryKey: ["templates"],
    queryFn: api.templates.list,
  });
  const { data: exercises } = useQuery({
    queryKey: ["exercises"],
    queryFn: api.exercises.list,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.templates.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["templates"] }),
  });

  const startMutation = useMutation({
    mutationFn: (id: string) => api.templates.startWorkout(id),
    onSuccess: (data) => navigate(`/workouts/new?workout_id=${data.workout_id}`),
  });

  const exerciseMap = (exercises ?? []).reduce((acc, e) => {
    acc[e.id] = e.name;
    return acc;
  }, {} as Record<string, string>);

  return (
    <div className="p-8 space-y-6 max-w-4xl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-primary">Templates</h1>
        <button onClick={() => setShowNew(true)} className="btn-primary">+ New template</button>
      </div>

      {isLoading && <div className="text-secondary text-sm">Loading…</div>}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {(templates ?? []).map((t: TemplateResponse) => (
          <div key={t.id} className="card p-5 space-y-4">
            <div className="flex items-start justify-between">
              <button
                onClick={() => navigate(`/templates/${t.id}`)}
                className="text-left flex-1 hover:text-blue transition-colors"
              >
                <p className="font-medium text-primary">{t.name}</p>
                {t.notes && <p className="text-xs text-secondary mt-0.5">{t.notes}</p>}
              </button>
              <button
                onClick={() => { if (confirm(`Delete "${t.name}"?`)) deleteMutation.mutate(t.id); }}
                className="text-xs text-secondary hover:text-danger transition-colors"
              >Delete</button>
            </div>

            <div className="space-y-1">
              {t.exercises.sort((a, b) => a.order - b.order).slice(0, 5).map((ex) => (
                <div key={ex.id} className="flex items-center justify-between text-xs">
                  <span className="text-secondary truncate">{exerciseMap[ex.exercise_id] ?? "Unknown"}</span>
                  <span className="text-primary text-[10px] uppercase tracking-wide">
                    {ex.sets.length > 0 ? `${ex.sets.length} set${ex.sets.length > 1 ? "s" : ""}` : "—"}
                  </span>
                </div>
              ))}
              {t.exercises.length > 5 && (
                <div className="text-xs text-secondary">+{t.exercises.length - 5} more</div>
              )}
              {t.exercises.length === 0 && <p className="text-xs text-secondary">No exercises yet — tap to add</p>}
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => navigate(`/templates/${t.id}`)}
                className="btn-secondary flex-1"
              >
                Edit
              </button>
              <button
                onClick={() => startMutation.mutate(t.id)}
                disabled={startMutation.isPending || t.exercises.length === 0}
                className="btn-primary flex-1 disabled:opacity-50"
              >
                ▶ Start
              </button>
            </div>
          </div>
        ))}

        {!isLoading && (templates ?? []).length === 0 && (
          <div className="card p-10 text-center col-span-2">
            <p className="text-secondary text-sm mb-4">No templates yet</p>
            <button onClick={() => setShowNew(true)} className="btn-primary inline-flex">
              Create your first template
            </button>
          </div>
        )}
      </div>

      {showNew && (
        <NewTemplateModal
          onClose={() => setShowNew(false)}
          onCreated={(id) => {
            setShowNew(false);
            navigate(`/templates/${id}`);
          }}
        />
      )}
    </div>
  );
}
