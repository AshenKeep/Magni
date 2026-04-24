const BASE = import.meta.env.VITE_API_URL ?? "";

if (BASE && !BASE.startsWith("https://")) {
  console.warn(`[Magni] VITE_API_URL must be https://. Got: "${BASE}"`);
}

function getToken(): string | null {
  return localStorage.getItem("gym_token");
}

export function setToken(token: string) {
  localStorage.setItem("gym_token", token);
}

export function clearToken() {
  localStorage.removeItem("gym_token");
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(init.headers as Record<string, string>),
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${BASE}${path}`, { ...init, headers });

  if (res.status === 401) {
    clearToken();
    window.location.href = "/login";
    throw new Error("Unauthenticated");
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail ?? "Request failed");
  }

  if (res.status === 204) return undefined as T;
  return res.json();
}

export const api = {
  auth: {
    login:    (email: string, password: string) => request<{ access_token: string }>("/api/auth/login", { method: "POST", body: JSON.stringify({ email, password }) }),
    register: (email: string, password: string, display_name: string) => request<UserResponse>("/api/auth/register", { method: "POST", body: JSON.stringify({ email, password, display_name }) }),
    me:       () => request<UserResponse>("/api/auth/me"),
  },

  dashboard: {
    get: () => request<DashboardStats>("/api/dashboard/"),
  },

  workouts: {
    list: (params?: { limit?: number; offset?: number; from_date?: string; to_date?: string }) => {
      const q = new URLSearchParams();
      if (params?.limit)     q.set("limit",     String(params.limit));
      if (params?.offset)    q.set("offset",    String(params.offset));
      if (params?.from_date) q.set("from_date", params.from_date);
      if (params?.to_date)   q.set("to_date",   params.to_date);
      return request<WorkoutResponse[]>(`/api/workouts/?${q}`);
    },
    get:    (id: string) => request<WorkoutResponse>(`/api/workouts/${id}`),
    create: (body: WorkoutCreate) => request<WorkoutResponse>("/api/workouts/", { method: "POST", body: JSON.stringify(body) }),
    update: (id: string, body: Partial<WorkoutCreate>) => request<WorkoutResponse>(`/api/workouts/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
    delete: (id: string) => request<void>(`/api/workouts/${id}`, { method: "DELETE" }),
    addSet: (workoutId: string, body: WorkoutSetCreate) => request<WorkoutSetResponse>(`/api/workouts/${workoutId}/sets`, { method: "POST", body: JSON.stringify(body) }),
    updateSet: (workoutId: string, setId: string, body: Partial<WorkoutSetCreate>) => request<WorkoutSetResponse>(`/api/workouts/${workoutId}/sets/${setId}`, { method: "PATCH", body: JSON.stringify(body) }),
    deleteSet: (workoutId: string, setId: string) => request<void>(`/api/workouts/${workoutId}/sets/${setId}`, { method: "DELETE" }),
  },

  exercises: {
    list:   () => request<ExerciseResponse[]>("/api/exercises/"),
    create: (body: { name: string; muscle_group?: string; equipment?: string; notes?: string; instructions?: string; gif_url?: string; video_url?: string; ascendapi_id?: string }) => request<ExerciseResponse>("/api/exercises/", { method: "POST", body: JSON.stringify(body) }),
    update: (id: string, body: { name?: string; muscle_group?: string; equipment?: string; notes?: string; instructions?: string; gif_url?: string; video_url?: string }) => request<ExerciseResponse>(`/api/exercises/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
    delete: (id: string) => request<void>(`/api/exercises/${id}`, { method: "DELETE" }),
  },

  templates: {
    list:   () => request<TemplateResponse[]>("/api/templates/"),
    get:    (id: string) => request<TemplateResponse>(`/api/templates/${id}`),
    create: (body: TemplateCreate) => request<TemplateResponse>("/api/templates/", { method: "POST", body: JSON.stringify(body) }),
    update: (id: string, body: { name?: string; notes?: string }) => request<TemplateResponse>(`/api/templates/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
    delete: (id: string) => request<void>(`/api/templates/${id}`, { method: "DELETE" }),
    addExercise:    (id: string, body: TemplateExerciseCreate) => request<TemplateResponse>(`/api/templates/${id}/exercises`, { method: "POST", body: JSON.stringify(body) }),
    removeExercise: (id: string, exId: string) => request<void>(`/api/templates/${id}/exercises/${exId}`, { method: "DELETE" }),
    startWorkout:   (id: string) => request<{ workout_id: string }>(`/api/templates/${id}/start`, { method: "POST" }),
  },

  stats: {
    daily: (days = 30) => request<DailyStatResponse[]>(`/api/stats/daily?days=${days}`),
    hr:    (params?: { workout_id?: string; from_dt?: string; to_dt?: string }) => {
      const q = new URLSearchParams();
      if (params?.workout_id) q.set("workout_id", params.workout_id);
      if (params?.from_dt)    q.set("from_dt",    params.from_dt);
      if (params?.to_dt)      q.set("to_dt",      params.to_dt);
      return request<HRReadingResponse[]>(`/api/stats/hr?${q}`);
    },
  },

  admin: {
    backupStatus:  () => request<BackupStatus>("/api/admin/backup/status"),
    runBackup:     () => request<{ status: string }>("/api/admin/backup/run", { method: "POST" }),
    listUsers:     () => request<AdminUser[]>("/api/admin/users"),
    resetPassword: (email: string, new_password: string) => request<{ status: string }>("/api/admin/users/reset-password", { method: "POST", body: JSON.stringify({ email, new_password }) }),
    toggleActive:  (userId: string) => request<{ email: string; is_active: boolean }>(`/api/admin/users/${userId}/toggle-active`, { method: "PATCH" }),
    seedExercises: () => request<{ status: string; added: number; skipped: number; total_fetched: number }>("/api/admin/exercises/seed", { method: "POST" }),
  },
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface UserResponse { id: string; email: string; display_name: string; created_at: string; }

export interface DashboardStats {
  version: string; total_workouts: number; workouts_this_week: number; total_sets: number;
  avg_workout_duration_seconds: number | null; current_streak_days: number;
  steps_today: number | null; resting_hr_today: number | null; calories_today: number | null;
}

export interface WorkoutResponse {
  id: string; title: string | null; notes: string | null; started_at: string;
  ended_at: string | null; duration_seconds: number | null; avg_heart_rate: number | null;
  max_heart_rate: number | null; calories_burned: number | null; garmin_activity_id: string | null;
  client_id: string | null; created_at: string; sets: WorkoutSetResponse[];
}

export interface WorkoutSetResponse {
  id: string; exercise_id: string; set_number: number; reps: number | null;
  weight_kg: number | null; duration_seconds: number | null; rpe: number | null; logged_at: string;
}

export interface WorkoutCreate {
  title?: string; started_at: string; ended_at?: string; duration_seconds?: number;
  avg_heart_rate?: number; max_heart_rate?: number; calories_burned?: number; client_id?: string;
  sets?: WorkoutSetCreate[];
}

export interface WorkoutSetCreate {
  exercise_id: string; set_number: number; reps?: number; weight_kg?: number; rpe?: number; notes?: string; client_id?: string;
}

export interface ExerciseResponse { id: string; name: string; muscle_group: string | null; secondary_muscles: string | null; equipment: string | null; notes: string | null; instructions: string | null; gif_url: string | null; video_url: string | null; ascendapi_id: string | null; created_at: string; }

export interface TemplateExerciseCreate { exercise_id: string; order?: number; target_sets?: number; target_reps?: number; target_weight_kg?: number; notes?: string; }

export interface TemplateExerciseResponse { id: string; exercise_id: string; order: number; target_sets: number | null; target_reps: number | null; target_weight_kg: number | null; notes: string | null; }

export interface TemplateCreate { name: string; notes?: string; exercises?: TemplateExerciseCreate[]; }

export interface TemplateResponse { id: string; name: string; notes: string | null; created_at: string; updated_at: string; exercises: TemplateExerciseResponse[]; }

export interface DailyStatResponse {
  id: string; date: string; steps: number | null; distance_m: number | null; active_calories: number | null;
  total_calories: number | null; resting_hr: number | null; avg_stress: number | null; floors_climbed: number | null;
  active_minutes: number | null; sleep_seconds: number | null; sleep_score: number | null; garmin_synced_at: string | null;
}

export interface HRReadingResponse { id: string; recorded_at: string; bpm: number; workout_id: string | null; source: string; }

export interface BackupStatus {
  last_backup: string | null; last_backup_size_bytes: number | null; backup_count: number;
  schedule: string; timezone: string; backup_dir: string; cifs_path: string | null;
}

export interface AdminUser { id: string; email: string; display_name: string; is_active: boolean; created_at: string; }
