import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import {
  format, startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  addDays, addWeeks, addMonths, subWeeks, subMonths,
  isSameDay, isSameMonth, isToday,
} from "date-fns";
import { api, type WorkoutResponse } from "@/lib/api";

type ViewMode = "day" | "week" | "month";

const STORAGE_KEY = "magni:workouts:viewmode";
const DATE_KEY    = "magni:workouts:cursor";

function fmtDuration(secs: number | null | undefined): string {
  if (!secs) return "";
  const m = Math.round(secs / 60);
  return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`;
}

function workoutDate(w: WorkoutResponse): Date { return new Date(w.started_at); }

function isPlanned(w: WorkoutResponse) { return !w.ended_at && w.sets.length === 0; }

// ---------------------------------------------------------------------------
// Event popup — shown when user taps a workout pill
// ---------------------------------------------------------------------------

function EventPopup({
  workout,
  exercises,
  onClose,
  onStart,
  onRemove,
}: {
  workout: WorkoutResponse;
  exercises: Record<string, string>;
  onClose: () => void;
  onStart: () => void;
  onRemove: () => void;
}) {
  const planned = isPlanned(workout);
  // Group sets by exercise
  const byExercise: Record<string, number> = {};
  const order: string[] = [];
  for (const s of workout.sets) {
    if (!byExercise[s.exercise_id]) { byExercise[s.exercise_id] = 0; order.push(s.exercise_id); }
    byExercise[s.exercise_id]++;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60"
      onClick={onClose}
    >
      <div
        className="bg-surface border border-border rounded-t-2xl sm:rounded-2xl w-full max-w-md p-5 space-y-4"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="font-semibold text-primary">{workout.title ?? "Workout"}</p>
            <p className="text-xs text-secondary mt-0.5">
              {format(workoutDate(workout), "EEEE d MMM")}
              {workout.duration_seconds ? ` · ${fmtDuration(workout.duration_seconds)}` : ""}
            </p>
          </div>
          <span className={`text-[10px] uppercase tracking-wider px-2 py-1 rounded shrink-0 ${
            planned ? "bg-magenta-glow text-magenta" : "bg-blue-glow text-blue"
          }`}>
            {planned ? "Planned" : "Logged"}
          </span>
        </div>

        {order.length > 0 ? (
          <div className="space-y-1 max-h-40 overflow-y-auto">
            {order.map(exId => (
              <div key={exId} className="flex items-center justify-between text-xs">
                <span className="text-secondary">{exercises[exId] ?? "Unknown"}</span>
                <span className="text-primary">{byExercise[exId]} set{byExercise[exId] !== 1 ? "s" : ""}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-secondary italic">No sets logged yet — waiting to be started.</p>
        )}

        <div className="flex gap-2 pt-1">
          <button
            onClick={onStart}
            className="btn-primary flex-1"
          >
            {planned ? "▶ Start workout" : "View / continue"}
          </button>
          <button
            onClick={onRemove}
            className="btn-danger text-sm px-4"
          >
            Remove
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Day action panel — shown when user selects a day
// ---------------------------------------------------------------------------

function DayPanel({
  date,
  workouts,
  exercises,
  onAddTemplate,
  onAddBlank,
  onClose,
}: {
  date: Date;
  workouts: WorkoutResponse[];
  exercises: Record<string, string>;
  onAddTemplate: () => void;
  onAddBlank: () => void;
  onClose: () => void;
}) {
  const [eventPopup, setEventPopup] = useState<WorkoutResponse | null>(null);
  const navigate = useNavigate();
  const qc = useQueryClient();

  const deleteMut = useMutation({
    mutationFn: (id: string) => api.workouts.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["workouts"] });
      setEventPopup(null);
    },
  });

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-30 bg-black/40"
        onClick={onClose}
      />
      {/* Slide-in panel from right */}
      <div className="fixed top-0 right-0 z-40 h-full w-full max-w-sm bg-surface border-l border-border flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div>
            <p className="font-semibold text-primary">{format(date, "EEEE d MMMM")}</p>
            {isToday(date) && <p className="text-xs text-blue">Today</p>}
          </div>
          <button onClick={onClose} className="text-secondary hover:text-primary text-xl leading-none">×</button>
        </div>

        {/* Events */}
        <div className="flex-1 overflow-y-auto p-5 space-y-2">
          {workouts.length === 0 ? (
            <p className="text-secondary text-sm">No workouts scheduled for this day.</p>
          ) : (
            workouts.map(w => {
              const planned = isPlanned(w);
              const exCount = new Set(w.sets.map(s => s.exercise_id)).size;
              return (
                <button
                  key={w.id}
                  onClick={() => setEventPopup(w)}
                  className="w-full text-left bg-card border border-border hover:border-blue rounded-xl px-4 py-3 transition-colors"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-primary truncate">{w.title ?? "Workout"}</p>
                      <p className="text-xs text-secondary mt-0.5">
                        {planned
                          ? "Tap to start"
                          : `${w.sets.length} sets${exCount > 1 ? ` · ${exCount} exercises` : ""}${w.duration_seconds ? ` · ${fmtDuration(w.duration_seconds)}` : ""}`
                        }
                      </p>
                    </div>
                    <span className={`text-[10px] uppercase tracking-wider px-2 py-1 rounded shrink-0 ${
                      planned ? "bg-magenta-glow text-magenta" : "bg-blue-glow text-blue"
                    }`}>
                      {planned ? "Planned" : "Logged"}
                    </span>
                  </div>
                </button>
              );
            })
          )}
        </div>

        {/* Action buttons */}
        <div className="p-5 border-t border-border space-y-2">
          <button
            onClick={onAddTemplate}
            className="btn-primary w-full"
          >
            📋 Add template to this day
          </button>
          <button
            onClick={onAddBlank}
            className="btn-secondary w-full"
          >
            ▶ Start blank workout now
          </button>
        </div>
      </div>

      {/* Event popup */}
      {eventPopup && (
        <EventPopup
          workout={eventPopup}
          exercises={exercises}
          onClose={() => setEventPopup(null)}
          onStart={() => {
            setEventPopup(null);
            onClose();
            navigate(`/workouts/new?workout_id=${eventPopup.id}`);
          }}
          onRemove={() => {
            if (confirm(`Remove "${eventPopup.title ?? "this workout"}" from the schedule?`)) {
              deleteMut.mutate(eventPopup.id);
            }
          }}
        />
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Template picker modal — opened from the DayPanel
// ---------------------------------------------------------------------------

function TemplatePicker({
  date,
  onClose,
}: { date: Date; onClose: () => void }) {
  const qc = useQueryClient();
  const { data: templates = [] } = useQuery({ queryKey: ["templates"], queryFn: api.templates.list });
  const [error, setError] = useState("");
  const isTodayDate = isToday(date);

  const schedule = useMutation({
    mutationFn: async (templateId: string) => {
      const r = await api.templates.startWorkout(templateId);
      await api.workouts.update(r.workout_id, { started_at: date.toISOString() });
      return r.workout_id;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["workouts"] });
      qc.invalidateQueries({ queryKey: ["workouts-today"] });
      onClose();
    },
    onError: (e: Error) => setError(e.message),
  });

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-end sm:items-center justify-center p-4">
      <div className="bg-surface border border-border rounded-t-2xl sm:rounded-2xl w-full max-w-md max-h-[70vh] flex flex-col">
        <div className="px-5 py-4 border-b border-border flex items-center justify-between">
          <p className="font-medium text-primary">Add template — {format(date, "d MMM")}</p>
          <button onClick={onClose} className="text-secondary hover:text-primary text-xl">×</button>
        </div>
        <div className="flex-1 overflow-y-auto p-5 space-y-2">
          {error && <div className="bg-danger/10 border border-danger/30 text-danger text-sm rounded-lg px-4 py-3">{error}</div>}
          {templates.length === 0 && (
            <p className="text-secondary text-sm">No templates yet. <Link to="/templates" className="text-blue hover:underline">Create one</Link>.</p>
          )}
          {templates.map(t => (
            <div key={t.id} className="bg-card border border-border rounded-xl p-4 space-y-3">
              <div>
                <p className="text-sm font-medium text-primary">{t.name}</p>
                <p className="text-xs text-secondary">{t.exercises.length} exercise{t.exercises.length !== 1 ? "s" : ""}</p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => schedule.mutate(t.id)}
                  disabled={schedule.isPending || t.exercises.length === 0}
                  className="btn-secondary text-xs flex-1 disabled:opacity-50"
                >
                  📅 Schedule
                </button>
                {isTodayDate && (
                  <button
                    onClick={async () => {
                      try {
                        const r = await api.templates.startWorkout(t.id);
                        await api.workouts.update(r.workout_id, { started_at: date.toISOString() });
                        qc.invalidateQueries({ queryKey: ["workouts"] });
                        qc.invalidateQueries({ queryKey: ["workouts-today"] });
                        onClose();
                      } catch (e) {
                        setError(e instanceof Error ? e.message : "Failed");
                      }
                    }}
                    disabled={t.exercises.length === 0}
                    className="btn-primary text-xs flex-1 disabled:opacity-50"
                  >
                    ▶ Start now
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shared: small workout pill for week/month grid cells
// ---------------------------------------------------------------------------

function WorkoutPill({ w, onClick }: { w: WorkoutResponse; onClick: (e: React.MouseEvent) => void }) {
  const planned = isPlanned(w);
  return (
    <button
      onClick={onClick}
      className={`block w-full text-left text-[10px] px-1.5 py-0.5 rounded mb-0.5 truncate transition-colors ${
        planned
          ? "bg-magenta-glow text-magenta hover:bg-magenta/20"
          : "bg-blue-glow text-blue hover:bg-blue/20"
      }`}
    >
      {w.title ?? "Workout"}
      {w.duration_seconds ? ` · ${fmtDuration(w.duration_seconds)}` : ""}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Views
// ---------------------------------------------------------------------------

function DayViewGrid({
  cursor,
  workouts,
  selectedDate,
  onSelectDate,
}: {
  cursor: Date;
  workouts: WorkoutResponse[];
  selectedDate: Date | null;
  onSelectDate: (d: Date) => void;
}) {
  const dayWorkouts = workouts.filter(w => isSameDay(workoutDate(w), cursor));
  const selected = selectedDate && isSameDay(cursor, selectedDate);
  return (
    <div
      onClick={() => onSelectDate(cursor)}
      className={`card p-6 cursor-pointer transition-colors hover:border-blue ${selected ? "border-blue" : ""}`}
    >
      <div className="flex items-baseline justify-between mb-4">
        <div>
          <p className="text-xs text-secondary uppercase tracking-wider">{format(cursor, "EEEE")}</p>
          <h2 className="text-2xl font-bold text-primary">{format(cursor, "d MMMM yyyy")}</h2>
        </div>
        {isToday(cursor) && <span className="text-xs text-blue">Today</span>}
      </div>
      {dayWorkouts.length === 0 ? (
        <p className="text-secondary text-sm">No workouts — tap to add one.</p>
      ) : (
        <div className="space-y-2">
          {dayWorkouts.map(w => {
            const planned = isPlanned(w);
            return (
              <div key={w.id} className={`bg-card border rounded-lg px-4 py-3 flex items-center justify-between ${
                planned ? "border-magenta/30" : "border-blue/30"
              }`}>
                <div>
                  <p className="text-sm font-medium text-primary">{w.title ?? "Workout"}</p>
                  <p className="text-xs text-secondary">{planned ? "Planned" : `${w.sets.length} sets`}</p>
                </div>
                <span className={`text-[10px] uppercase tracking-wider px-2 py-1 rounded ${
                  planned ? "bg-magenta-glow text-magenta" : "bg-blue-glow text-blue"
                }`}>{planned ? "Planned" : "Logged"}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function WeekView({
  cursor, workouts, selectedDate, onSelectDate,
}: {
  cursor: Date;
  workouts: WorkoutResponse[];
  selectedDate: Date | null;
  onSelectDate: (d: Date) => void;
}) {
  const start = startOfWeek(cursor, { weekStartsOn: 1 });
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  return (
    <div className="grid grid-cols-7 gap-2">
      {days.map(d => {
        const dayWorkouts = workouts.filter(w => isSameDay(workoutDate(w), d));
        const selected = selectedDate && isSameDay(d, selectedDate);
        return (
          <div
            key={d.toISOString()}
            onClick={() => onSelectDate(d)}
            className={`card p-3 min-h-[140px] flex flex-col cursor-pointer transition-colors hover:border-blue/50 ${
              isToday(d) ? "border-blue" : ""
            } ${selected ? "border-blue bg-blue-glow/20" : ""}`}
          >
            <div className="text-[10px] text-secondary uppercase tracking-wider">{format(d, "EEE")}</div>
            <div className={`text-lg font-semibold mb-2 ${isToday(d) ? "text-blue" : "text-primary"}`}>{format(d, "d")}</div>
            <div className="flex-1 overflow-y-auto">
              {dayWorkouts.map(w => (
                <WorkoutPill
                  key={w.id}
                  w={w}
                  onClick={e => { e.stopPropagation(); onSelectDate(d); }}
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function MonthView({
  cursor, workouts, selectedDate, onSelectDate,
}: {
  cursor: Date;
  workouts: WorkoutResponse[];
  selectedDate: Date | null;
  onSelectDate: (d: Date) => void;
}) {
  const monthStart = startOfMonth(cursor);
  const monthEnd = endOfMonth(cursor);
  const gridStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
  const days: Date[] = [];
  for (let d = gridStart; d <= gridEnd; d = addDays(d, 1)) days.push(d);

  return (
    <div>
      <div className="grid grid-cols-7 gap-1 mb-2">
        {["Mon","Tue","Wed","Thu","Fri","Sat","Sun"].map(d => (
          <div key={d} className="text-[10px] text-secondary uppercase tracking-wider text-center">{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {days.map(d => {
          const dayWorkouts = workouts.filter(w => isSameDay(workoutDate(w), d));
          const inMonth = isSameMonth(d, cursor);
          const selected = selectedDate && isSameDay(d, selectedDate);
          return (
            <div
              key={d.toISOString()}
              onClick={() => onSelectDate(d)}
              className={`card p-2 min-h-[80px] flex flex-col cursor-pointer transition-colors ${
                !inMonth ? "opacity-40" : ""
              } ${isToday(d) ? "border-blue" : ""} ${
                selected ? "border-blue bg-blue-glow/20" : "hover:border-blue/40"
              }`}
            >
              <div className={`text-xs font-medium mb-1 ${isToday(d) ? "text-blue" : "text-primary"}`}>{format(d, "d")}</div>
              <div className="flex-1 overflow-hidden">
                {dayWorkouts.slice(0, 2).map(w => (
                  <WorkoutPill
                    key={w.id}
                    w={w}
                    onClick={e => { e.stopPropagation(); onSelectDate(d); }}
                  />
                ))}
                {dayWorkouts.length > 2 && (
                  <div className="text-[10px] text-secondary">+{dayWorkouts.length - 2} more</div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function WorkoutsPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [mode, setMode] = useState<ViewMode>(() => {
    const s = localStorage.getItem(STORAGE_KEY);
    return (s === "day" || s === "week" || s === "month") ? s : "week";
  });
  const [cursor, setCursor] = useState<Date>(() => {
    const s = localStorage.getItem(DATE_KEY);
    if (s) { const d = new Date(s); if (!isNaN(d.getTime())) return d; }
    return new Date();
  });
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [showTemplatePicker, setShowTemplatePicker] = useState(false);

  useEffect(() => { localStorage.setItem(STORAGE_KEY, mode); }, [mode]);
  useEffect(() => { localStorage.setItem(DATE_KEY, cursor.toISOString()); }, [cursor]);

  const range = useMemo(() => {
    // Use local-time midnight so the range matches what the user sees on the calendar,
    // not UTC midnight (which would be off by the timezone offset).
    function localMidnight(d: Date): Date {
      const r = new Date(d); r.setHours(0, 0, 0, 0); return r;
    }
    function localEndOfDay(d: Date): Date {
      const r = new Date(d); r.setHours(23, 59, 59, 999); return r;
    }
    if (mode === "day") {
      return { from: localMidnight(cursor), to: localEndOfDay(cursor) };
    }
    if (mode === "week") {
      return {
        from: localMidnight(startOfWeek(cursor, { weekStartsOn: 1 })),
        to: localEndOfDay(endOfWeek(cursor, { weekStartsOn: 1 })),
      };
    }
    return {
      from: localMidnight(startOfWeek(startOfMonth(cursor), { weekStartsOn: 1 })),
      to: localEndOfDay(endOfWeek(endOfMonth(cursor), { weekStartsOn: 1 })),
    };
  }, [mode, cursor]);

  const { data: workouts = [], isLoading } = useQuery({
    queryKey: ["workouts", range.from.toISOString(), range.to.toISOString()],
    queryFn: () => api.workouts.list({ limit: 200, from_date: range.from.toISOString(), to_date: range.to.toISOString() }),
  });

  const { data: exercises = [] } = useQuery({ queryKey: ["exercises"], queryFn: api.exercises.list });
  const exerciseMap = useMemo(() =>
    exercises.reduce((acc, e) => { acc[e.id] = e.name; return acc; }, {} as Record<string, string>)
  , [exercises]);

  const addBlankMut = useMutation({
    mutationFn: (d: Date) => api.workouts.create({
      title: `Workout ${format(d, "d MMM")}`,
      started_at: d.toISOString(),
    }),
    onSuccess: (w) => {
      qc.invalidateQueries({ queryKey: ["workouts"] });
      navigate(`/workouts/new?workout_id=${w.id}`);
    },
  });

  const goPrev = () => {
    if (mode === "day") setCursor(addDays(cursor, -1));
    else if (mode === "week") setCursor(subWeeks(cursor, 1));
    else setCursor(subMonths(cursor, 1));
  };
  const goNext = () => {
    if (mode === "day") setCursor(addDays(cursor, 1));
    else if (mode === "week") setCursor(addWeeks(cursor, 1));
    else setCursor(addMonths(cursor, 1));
  };

  const headerLabel =
    mode === "day"  ? format(cursor, "EEEE d MMMM yyyy") :
    mode === "week" ? `Week of ${format(startOfWeek(cursor, { weekStartsOn: 1 }), "d MMM")}` :
                     format(cursor, "MMMM yyyy");

  const selectedDayWorkouts = useMemo(() =>
    selectedDate ? workouts.filter(w => isSameDay(workoutDate(w), selectedDate)) : []
  , [selectedDate, workouts]);

  const onSelectDate = (d: Date) => {
    // If same day re-selected, close the panel
    setSelectedDate(prev => (prev && isSameDay(prev, d)) ? null : d);
    setShowTemplatePicker(false);
  };

  return (
    <div className="p-8 space-y-6 max-w-6xl">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-primary">Schedule</h1>
        <div className="flex gap-2 items-center">
          <div className="flex bg-card border border-border rounded-lg overflow-hidden">
            {(["day","week","month"] as ViewMode[]).map(m => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`px-3 py-1.5 text-xs ${mode === m ? "bg-blue text-white" : "text-secondary hover:text-primary"}`}
              >
                {m.charAt(0).toUpperCase() + m.slice(1)}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Nav */}
      <div className="flex items-center gap-3">
        <button onClick={goPrev} className="btn-secondary text-sm">←</button>
        <button onClick={() => setCursor(new Date())} className="btn-secondary text-sm">Today</button>
        <button onClick={goNext} className="btn-secondary text-sm">→</button>
        <span className="ml-3 text-sm text-secondary">{headerLabel}</span>
      </div>

      {isLoading && <div className="text-secondary text-sm">Loading…</div>}

      {/* Calendar grid */}
      {!isLoading && mode === "day" && (
        <DayViewGrid cursor={cursor} workouts={workouts} selectedDate={selectedDate} onSelectDate={onSelectDate} />
      )}
      {!isLoading && mode === "week" && (
        <WeekView cursor={cursor} workouts={workouts} selectedDate={selectedDate} onSelectDate={onSelectDate} />
      )}
      {!isLoading && mode === "month" && (
        <MonthView cursor={cursor} workouts={workouts} selectedDate={selectedDate} onSelectDate={onSelectDate} />
      )}

      {/* Day panel — slides in from right when a day is selected */}
      {selectedDate && (
        <DayPanel
          date={selectedDate}
          workouts={selectedDayWorkouts}
          exercises={exerciseMap}
          onAddTemplate={() => setShowTemplatePicker(true)}
          onAddBlank={() => {
            if (selectedDate) addBlankMut.mutate(selectedDate);
          }}
          onClose={() => { setSelectedDate(null); setShowTemplatePicker(false); }}
        />
      )}

      {/* Template picker */}
      {showTemplatePicker && selectedDate && (
        <TemplatePicker
          date={selectedDate}
          onClose={() => setShowTemplatePicker(false)}
        />
      )}
    </div>
  );
}
