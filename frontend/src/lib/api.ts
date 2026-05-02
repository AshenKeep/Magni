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

/** Multipart upload helper. Browser sets Content-Type with the boundary, so we
 *  must NOT set it manually — that's why this can't share the request() body. */
async function uploadFile<T>(path: string, file: File): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const fd = new FormData();
  fd.append("file", file);

  const res = await fetch(`${BASE}${path}`, { method: "POST", headers, body: fd });

  if (res.status === 401) {
    clearToken();
    window.location.href = "/login";
    throw new Error("Unauthenticated");
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail ?? "Upload failed");
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
    updateSet: (workoutId: string, setId: string, body: Partial<WorkoutSetResponse> | Partial<WorkoutSetCreate>) => request<WorkoutSetResponse>(`/api/workouts/${workoutId}/sets/${setId}`, { method: "PATCH", body: JSON.stringify(body) }),
    deleteSet: (workoutId: string, setId: string) => request<void>(`/api/workouts/${workoutId}/sets/${setId}`, { method: "DELETE" }),
    saveAsTemplate: (workoutId: string, body: { name: string; notes?: string }) => request<TemplateResponse>(`/api/workouts/${workoutId}/save-as-template`, { method: "POST", body: JSON.stringify(body) }),
  },

  exercises: {
    list:   () => request<ExerciseResponse[]>("/api/exercises/"),
    create: (body: { name: string; muscle_group?: string; muscle_groups?: string; equipment?: string; notes?: string; instructions?: string; gif_url?: string; video_url?: string; ascendapi_id?: string; workoutx_id?: string; source?: string }) => request<ExerciseResponse>("/api/exercises/", { method: "POST", body: JSON.stringify(body) }),
    update: (id: string, body: { name?: string; muscle_group?: string; muscle_groups?: string; equipment?: string; notes?: string; instructions?: string; gif_url?: string; video_url?: string }) => request<ExerciseResponse>(`/api/exercises/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
    delete: (id: string) => request<void>(`/api/exercises/${id}`, { method: "DELETE" }),
    uploadImage: (id: string, file: File) => uploadFile<ExerciseResponse>(`/api/exercises/${id}/upload-image`, file),
  },

  templates: {
    list:   () => request<TemplateResponse[]>("/api/templates/"),
    get:    (id: string) => request<TemplateResponse>(`/api/templates/${id}`),
    create: (body: TemplateCreate) => request<TemplateResponse>("/api/templates/", { method: "POST", body: JSON.stringify(body) }),
    update: (id: string, body: { name?: string; notes?: string }) => request<TemplateResponse>(`/api/templates/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
    delete: (id: string) => request<void>(`/api/templates/${id}`, { method: "DELETE" }),
    addExercise:    (id: string, body: TemplateExerciseCreate) => request<TemplateResponse>(`/api/templates/${id}/exercises`, { method: "POST", body: JSON.stringify(body) }),
    updateExercise: (id: string, teId: string, body: TemplateExerciseUpdate) => request<TemplateResponse>(`/api/templates/${id}/exercises/${teId}`, { method: "PATCH", body: JSON.stringify(body) }),
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
    backupStatus:    () => request<BackupStatus>("/api/admin/backup/status"),
    runBackup:       (body: { include_media?: boolean } = {}) => request<BackupCreateResponse>("/api/admin/backup/run", { method: "POST", body: JSON.stringify(body) }),
    listBackups:     () => request<BackupListEntry[]>("/api/admin/backup/list"),
    getBackupSettings: () => request<BackupSettingsResponse>("/api/admin/backup/settings"),
    updateBackupSettings: (body: { retention_days?: number; include_media?: boolean }) => request<BackupSettingsResponse>("/api/admin/backup/settings", { method: "PATCH", body: JSON.stringify(body) }),
    restoreBackup:   (filename: string) => request<BackupRestoreResponse>(`/api/admin/backup/restore/${encodeURIComponent(filename)}`, { method: "POST" }),
    deleteBackup:    (filename: string) => request<void>(`/api/admin/backup/${encodeURIComponent(filename)}`, { method: "DELETE" }),
    listUsers:       () => request<AdminUser[]>("/api/admin/users"),
    resetPassword:   (email: string, new_password: string) => request<{ status: string }>("/api/admin/users/reset-password", { method: "POST", body: JSON.stringify({ email, new_password }) }),
    toggleActive:    (userId: string) => request<{ email: string; is_active: boolean }>(`/api/admin/users/${userId}/toggle-active`, { method: "PATCH" }),
    apiKeysList:     () => request<ApiKeysList>("/api/admin/api-keys"),
    apiKeySave:      (provider: string, api_key: string) => request<{ status: string; provider: string; preview: string }>("/api/admin/api-keys", { method: "POST", body: JSON.stringify({ provider, api_key }) }),
    apiKeyDelete:    (provider: string) => request<{ status: string; provider: string }>(`/api/admin/api-keys/${provider}`, { method: "DELETE" }),
    seedEstimate:    (provider: string, downloadGifs: boolean) => request<SeedEstimate>(`/api/admin/exercises/seed/estimate?provider=${provider}&download_gifs=${downloadGifs}`),
    seedExercises:   (provider: string, downloadGifs: boolean) => request<SeedResult>(`/api/admin/exercises/seed?provider=${provider}&download_gifs=${downloadGifs}`, { method: "POST" }),
    downloadGifs:    () => request<GifDownloadResult>("/api/admin/exercises/download-gifs", { method: "POST" }),
    recategorize:    () => request<{ status: string; updated: number; total: number }>("/api/admin/exercises/recategorize", { method: "POST" }),
    debugWorkoutXGif: (id: string) => request<unknown>(`/api/admin/debug/workoutx-gif/${id}`),
    mediaStatus:     () => request<MediaStatus>("/api/admin/exercises/media/status"),
    seedLogs:        () => request<SeedLogEntry[]>("/api/admin/logs/seed"),
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
  id: string;
  exercise_id: string;
  set_number: number;
  log_type: LogType;
  reps: number | null;
  weight_kg: number | null;
  duration_seconds: number | null;
  distance_m: number | null;
  pace_seconds_per_km: number | null;
  incline_pct: number | null;
  laps: number | null;
  avg_heart_rate: number | null;
  calories: number | null;
  rpe: number | null;
  notes: string | null;
  logged_at: string;
}

export interface WorkoutCreate {
  title?: string; started_at: string; ended_at?: string; duration_seconds?: number;
  avg_heart_rate?: number; max_heart_rate?: number; calories_burned?: number; client_id?: string;
  sets?: WorkoutSetCreate[];
}

export interface WorkoutSetCreate {
  exercise_id: string;
  set_number: number;
  log_type?: LogType;
  reps?: number;
  weight_kg?: number;
  duration_seconds?: number;
  distance_m?: number;
  pace_seconds_per_km?: number;
  incline_pct?: number;
  laps?: number;
  avg_heart_rate?: number;
  calories?: number;
  rpe?: number;
  notes?: string;
  client_id?: string;
}

export interface ExerciseResponse {
  id: string; name: string;
  muscle_group: string | null;
  muscle_groups: string | null;       // JSON array string
  secondary_muscles: string | null;
  equipment: string | null;
  notes: string | null;
  instructions: string | null;
  gif_url: string | null;
  video_url: string | null;
  source: string | null;
  ascendapi_id: string | null;
  workoutx_id: string | null;
  created_at: string;
}

// ---------------------------------------------------------------------------
// v0.0.7: per-set targets, log_type, and the cardio metric fields
// ---------------------------------------------------------------------------

export type LogType = "strength" | "cardio" | "mobility";

/** All metric fields that can be tracked. UI uses the keys listed in `enabledFields`
 *  to decide which inputs to show. "+ Add field" toggles fields in/out. */
export type MetricField =
  | "reps" | "weight_kg"
  | "duration_seconds" | "distance_m" | "pace_seconds_per_km"
  | "incline_pct" | "laps" | "avg_heart_rate" | "calories";

export interface TemplateSetCreate {
  set_number: number;
  log_type: LogType;
  target_reps?: number | null;
  target_weight_kg?: number | null;
  target_duration_seconds?: number | null;
  target_distance_m?: number | null;
  target_pace_seconds_per_km?: number | null;
  target_incline_pct?: number | null;
  target_laps?: number | null;
  target_avg_heart_rate?: number | null;
  target_calories?: number | null;
  notes?: string | null;
}

export interface TemplateSetResponse {
  id: string;
  set_number: number;
  log_type: LogType;
  target_reps: number | null;
  target_weight_kg: number | null;
  target_duration_seconds: number | null;
  target_distance_m: number | null;
  target_pace_seconds_per_km: number | null;
  target_incline_pct: number | null;
  target_laps: number | null;
  target_avg_heart_rate: number | null;
  target_calories: number | null;
  notes: string | null;
}

export interface TemplateExerciseCreate {
  exercise_id: string;
  order?: number;
  log_type?: LogType;
  // legacy (used as defaults if `sets` empty)
  target_sets?: number;
  target_reps?: number;
  target_weight_kg?: number;
  notes?: string;
  sets?: TemplateSetCreate[];
}

export interface TemplateExerciseUpdate {
  order?: number;
  log_type?: LogType;
  target_sets?: number;
  target_reps?: number;
  target_weight_kg?: number;
  notes?: string;
  sets?: TemplateSetCreate[];
}

export interface TemplateExerciseResponse {
  id: string;
  exercise_id: string;
  order: number;
  log_type: LogType;
  target_sets: number | null;
  target_reps: number | null;
  target_weight_kg: number | null;
  notes: string | null;
  sets: TemplateSetResponse[];
}

export interface TemplateCreate {
  name: string;
  notes?: string;
  exercises?: TemplateExerciseCreate[];   // optional — new flow creates empty
}

export interface TemplateResponse {
  id: string;
  name: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
  exercises: TemplateExerciseResponse[];
}

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

export interface BackupListEntry {
  filename: string;
  size_bytes: number;
  created_at: string;
  has_media: boolean;
}

export interface BackupSettingsResponse {
  retention_days: number;
  include_media: boolean;
  updated_at: string;
}

export interface BackupCreateResponse {
  filename: string;
  size_bytes: number;
  include_media: boolean;
}

export interface BackupRestoreResponse {
  filename: string;
  manifest_version: string | null;
  media_restored: boolean;
  media_present_in_backup: boolean;
}

export interface AdminUser { id: string; email: string; display_name: string; is_active: boolean; created_at: string; }

export interface SeedEstimate {
  provider: string;
  metadata_requests: number;
  gif_requests: number;
  total_requests: number;
  free_quota: number;
  remaining_estimate: number;
}

export interface SeedResult {
  status: string;
  provider: string;
  added: number;
  skipped: number;
  total_fetched: number;
  gifs_downloaded: number;
  media_storage: string;
}

export interface GifDownloadResult {
  status: string;
  downloaded: number;
  skipped_already_local: number;
  failed: number;
  total: number;
}

export interface MediaStatus {
  media_storage: string;
  media_dir: string;
  gif_count: number;
  cifs_configured: boolean;
  providers: {
    ascendapi: { configured: boolean };
    workoutx:  { configured: boolean };
  };
}

export interface ApiKeyProvider {
  provider: string;
  name: string;
  configured: boolean;
  enabled: boolean;
  preview: string;
  free_quota: number;
  docs_url: string;
  signup_instructions: string;
}

export interface ApiKeysList {
  providers: ApiKeyProvider[];
}

export interface SeedLogEntry {
  id: string;
  started_at: string;
  finished_at: string | null;
  mode: string;
  status: string;
  added: number;
  skipped: number;
  gifs_downloaded: number;
  log_output: string | null;
  error: string | null;
}
