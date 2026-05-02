import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import {
  format, startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  addDays, addWeeks, addMonths, subWeeks, subMonths,
  isSameDay, isSameMonth, isToday,
} from "date-fns";
import { api, type WorkoutResponse, type TemplateResponse } from "@/lib/api";

type ViewMode = "day" | "week" | "month";

const STORAGE_KEY = "magni:workouts:viewmode";
const DATE_KEY = "magni:workouts:cursor";

function fmtDuration(secs: number | null | undefined): string {
  if (!secs) return "";
  const m = Math.round(secs / 60);
  return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`;
}

function workoutDate(w: WorkoutResponse): Date {
  return new Date(w.started_at);
}

// ---------- Schedule modal ----------

function ScheduleModal({
  date, onClose,
}: { date: Date; onClose: () => void }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: templates = [] } = useQuery({ queryKey: ["templates"], queryFn: api.templates.list });
  const [error, setError] = useState("");

  const isTodayDate = isToday(date);

  // "Schedule" = create a planned workout on `date` with sets pre-filled but
  // no ended_at. Doesn't navigate — user stays on the calendar.
  const scheduleFromTemplate = useMutation({
    mutationFn: async (templateId: string) => {
      const r = await api.templates.startWorkout(templateId);
      // Move the created workout to the chosen date (it was created with now())
      await api.workouts.update(r.workout_id, { started_at: date.toISOString() });
      return r;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["workouts"] });
      onClose();
    },
    onError: (e: Error) => setError(e.message),
  });

  // "Start now" = same flow as before — navigate into the logger
  const startNowFromTemplate = useMutation({
    mutationFn: async (templateId: string) => {
      const r = await api.templates.startWorkout(templateId);
      await api.workouts.update(r.workout_id, { started_at: date.toISOString() });
      return r;
    },
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["workouts"] });
      navigate(`/workouts/new?workout_id=${r.workout_id}`);
    },
    onError: (e: Error) => setError(e.message),
  });

  const startBlank = useMutation({
    mutationFn: () => api.workouts.create({
      title: `Workout ${format(date, "d MMM")}`,
      started_at: date.toISOString(),
    }),
    onSuccess: (w) => {
      qc.invalidateQueries({ queryKey: ["workouts"] });
      navigate(`/workouts/new?workout_id=${w.id}`);
    },
    onError: (e: Error) => setError(e.message),
  });

  return (
    <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
      <div className="bg-surface border border-border rounded-2xl w-full max-w-md max-h-[80vh] flex flex-col">
        <div className="p-5 border-b border-border flex items-center justify-between">
          <h3 className="font-medium text-primary">Add to {format(date, "EEEE d MMM")}</h3>
          <button onClick={onClose} className="text-secondary hover:text-primary text-xl">×</button>
        </div>
        <div className="p-5 space-y-4 overflow-y-auto">
          {error && (
            <div className="bg-danger/10 border border-danger/30 text-danger text-sm rounded-lg px-4 py-3">{error}</div>
          )}

          {isTodayDate && (
            <button
              onClick={() => startBlank.mutate()}
              disabled={startBlank.isPending}
              className="btn-primary w-full"
            >
              {startBlank.isPending ? "Starting…" : "▶ Start blank workout now"}
            </button>
          )}

          <div className="text-xs text-secondary uppercase tracking-wider">
            {isTodayDate ? "Or pick a template" : "Schedule a template"}
          </div>
          {templates.length === 0 ? (
            <p className="text-secondary text-sm">No templates yet. <Link to="/templates" className="text-blue hover:underline">Create one</Link>.</p>
          ) : (
            <div className="space-y-1.5">
              {templates.map((t) => (
                <div key={t.id} className="bg-card border border-border rounded-lg p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-primary truncate">{t.name}</p>
                      <p className="text-xs text-secondary">{t.exercises.length} exercise{t.exercises.length !== 1 ? "s" : ""}</p>
                    </div>
                  </div>
                  <div className="flex gap-2 mt-2">
                    <button
                      onClick={() => scheduleFromTemplate.mutate(t.id)}
                      disabled={scheduleFromTemplate.isPending || t.exercises.length === 0}
                      className="btn-secondary text-xs flex-1 disabled:opacity-50"
                    >
                      Schedule
                    </button>
                    {isTodayDate && (
                      <button
                        onClick={() => startNowFromTemplate.mutate(t.id)}
                        disabled={startNowFromTemplate.isPending || t.exercises.length === 0}
                        className="btn-primary text-xs flex-1 disabled:opacity-50"
                      >
                        ▶ Start now
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {!isTodayDate && (
            <p className="text-xs text-secondary border-t border-border pt-3">
              Selected day is not today. The template will be scheduled as planned —
              tap it on the calendar later to start logging.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------- Workout strip (compact list of workouts for a single day) ----------

function WorkoutPill({ w }: { w: WorkoutResponse }) {
  const isPlanned = !w.ended_at && w.sets.length === 0;
  return (
    <Link
      to={`/workouts/${w.id}`}
      className={`block text-xs px-2 py-1 rounded mb-0.5 truncate transition-colors ${
        isPlanned
          ? "bg-magenta-glow text-magenta hover:bg-magenta/20"
          : "bg-blue-glow text-blue hover:bg-blue/20"
      }`}
    >
      {w.title ?? "Workout"}
      {w.duration_seconds ? ` · ${fmtDuration(w.duration_seconds)}` : ""}
    </Link>
  );
}

// ---------- Day view ----------

function DayView({
  cursor, workouts, onAdd,
}: { cursor: Date; workouts: WorkoutResponse[]; onAdd: (d: Date) => void }) {
  const dayWorkouts = workouts.filter(w => isSameDay(workoutDate(w), cursor));
  return (
    <div className="card p-6 space-y-4">
      <div className="flex items-baseline justify-between">
        <div>
          <p className="text-xs text-secondary uppercase tracking-wider">{format(cursor, "EEEE")}</p>
          <h2 className="text-2xl font-bold text-primary">{format(cursor, "d MMMM yyyy")}</h2>
        </div>
        {isToday(cursor) && <span className="text-xs text-blue">Today</span>}
      </div>

      {dayWorkouts.length === 0 ? (
        <div className="text-center py-10 border border-dashed border-border rounded-xl">
          <p className="text-secondary text-sm mb-4">Nothing scheduled for this day</p>
          <button onClick={() => onAdd(cursor)} className="btn-primary">+ Add workout</button>
        </div>
      ) : (
        <>
          <div className="space-y-2">
            {dayWorkouts.map(w => {
              const isPlanned = !w.ended_at && w.sets.length === 0;
              return (
                <Link
                  key={w.id}
                  to={`/workouts/${w.id}`}
                  className="card border block px-4 py-3 hover:bg-card/80 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-primary">{w.title ?? "Workout"}</p>
                      <p className="text-xs text-secondary mt-0.5">
                        {isPlanned ? "Scheduled · not yet started" : `${w.sets.length} sets${w.duration_seconds ? ` · ${fmtDuration(w.duration_seconds)}` : ""}`}
                      </p>
                    </div>
                    <span className={`text-[10px] uppercase tracking-wider px-2 py-1 rounded ${
                      isPlanned ? "bg-magenta-glow text-magenta" : "bg-blue-glow text-blue"
                    }`}>
                      {isPlanned ? "Planned" : "Logged"}
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
          <button onClick={() => onAdd(cursor)} className="text-sm text-blue hover:underline">+ Add another</button>
        </>
      )}
    </div>
  );
}

// ---------- Week view ----------

function WeekView({
  cursor, workouts, onAdd,
}: { cursor: Date; workouts: WorkoutResponse[]; onAdd: (d: Date) => void }) {
  const start = startOfWeek(cursor, { weekStartsOn: 1 });
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  return (
    <div className="grid grid-cols-7 gap-2">
      {days.map(d => {
        const dayWorkouts = workouts.filter(w => isSameDay(workoutDate(w), d));
        return (
          <div
            key={d.toISOString()}
            className={`card p-3 min-h-[150px] flex flex-col ${isToday(d) ? "border-blue" : ""}`}
          >
            <div className="text-[10px] text-secondary uppercase tracking-wider">{format(d, "EEE")}</div>
            <div className={`text-lg font-semibold ${isToday(d) ? "text-blue" : "text-primary"}`}>{format(d, "d")}</div>
            <div className="flex-1 mt-2 overflow-y-auto">
              {dayWorkouts.map(w => <WorkoutPill key={w.id} w={w} />)}
            </div>
            <button
              onClick={() => onAdd(d)}
              className="mt-2 text-[10px] text-secondary hover:text-blue"
            >+ add</button>
          </div>
        );
      })}
    </div>
  );
}

// ---------- Month view ----------

function MonthView({
  cursor, workouts, onAdd,
}: { cursor: Date; workouts: WorkoutResponse[]; onAdd: (d: Date) => void }) {
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
          return (
            <button
              key={d.toISOString()}
              onClick={() => onAdd(d)}
              className={`text-left card p-2 min-h-[90px] flex flex-col transition-colors ${
                inMonth ? "" : "opacity-40"
              } ${isToday(d) ? "border-blue" : ""} hover:border-blue/50`}
            >
              <div className={`text-sm font-medium ${isToday(d) ? "text-blue" : "text-primary"}`}>{format(d, "d")}</div>
              <div className="flex-1 mt-1 overflow-hidden">
                {dayWorkouts.slice(0, 2).map(w => <WorkoutPill key={w.id} w={w} />)}
                {dayWorkouts.length > 2 && (
                  <div className="text-[10px] text-secondary">+{dayWorkouts.length - 2} more</div>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ---------- Page ----------

export default function WorkoutsPage() {
  const [mode, setMode] = useState<ViewMode>(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    return (stored === "day" || stored === "week" || stored === "month") ? stored : "week";
  });
  const [cursor, setCursor] = useState<Date>(() => {
    const stored = localStorage.getItem(DATE_KEY);
    if (stored) {
      const d = new Date(stored);
      if (!isNaN(d.getTime())) return d;
    }
    return new Date();
  });
  const [scheduleDate, setScheduleDate] = useState<Date | null>(null);

  // Persist mode + cursor across sessions
  useEffect(() => { localStorage.setItem(STORAGE_KEY, mode); }, [mode]);
  useEffect(() => { localStorage.setItem(DATE_KEY, cursor.toISOString()); }, [cursor]);

  // Compute date window we need to load
  const range = useMemo(() => {
    if (mode === "day") {
      const start = new Date(cursor); start.setHours(0,0,0,0);
      const end = new Date(cursor); end.setHours(23,59,59,999);
      return { from: start, to: end };
    }
    if (mode === "week") {
      return {
        from: startOfWeek(cursor, { weekStartsOn: 1 }),
        to: endOfWeek(cursor, { weekStartsOn: 1 }),
      };
    }
    // Month view actually shows surrounding weeks too, so widen
    const monthStart = startOfMonth(cursor);
    const monthEnd = endOfMonth(cursor);
    return {
      from: startOfWeek(monthStart, { weekStartsOn: 1 }),
      to: endOfWeek(monthEnd, { weekStartsOn: 1 }),
    };
  }, [mode, cursor]);

  const { data: workouts = [], isLoading } = useQuery({
    queryKey: ["workouts", range.from.toISOString(), range.to.toISOString()],
    queryFn: () => api.workouts.list({
      limit: 200,
      from_date: range.from.toISOString(),
      to_date: range.to.toISOString(),
    }),
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
    mode === "day"   ? format(cursor, "EEEE d MMMM yyyy") :
    mode === "week"  ? `Week of ${format(startOfWeek(cursor, { weekStartsOn: 1 }), "d MMM")}` :
                       format(cursor, "MMMM yyyy");

  return (
    <div className="p-8 space-y-6 max-w-6xl">
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
          <Link to="/workouts/new" className="btn-primary text-sm">+ New workout</Link>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button onClick={goPrev} className="btn-secondary text-sm">←</button>
        <button onClick={() => setCursor(new Date())} className="btn-secondary text-sm">Today</button>
        <button onClick={goNext} className="btn-secondary text-sm">→</button>
        <span className="ml-3 text-sm text-secondary">{headerLabel}</span>
      </div>

      {isLoading && <div className="text-secondary text-sm">Loading…</div>}

      {!isLoading && mode === "day" && (
        <DayView cursor={cursor} workouts={workouts} onAdd={setScheduleDate} />
      )}
      {!isLoading && mode === "week" && (
        <WeekView cursor={cursor} workouts={workouts} onAdd={setScheduleDate} />
      )}
      {!isLoading && mode === "month" && (
        <MonthView cursor={cursor} workouts={workouts} onAdd={setScheduleDate} />
      )}

      {scheduleDate && (
        <ScheduleModal
          date={scheduleDate}
          onClose={() => setScheduleDate(null)}
        />
      )}
    </div>
  );
}

// Re-export so TemplateResponse stays referenced (helps tree-shaking checks)
export type { TemplateResponse };
