from __future__ import annotations
from datetime import datetime
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, EmailStr, field_validator


# --- Auth ---

class SetupRequest(BaseModel):
    email: EmailStr
    password: str
    display_name: str

    @field_validator("password")
    @classmethod
    def password_strength(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters")
        return v


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str
    display_name: str

    @field_validator("password")
    @classmethod
    def password_strength(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters")
        return v


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UserResponse(BaseModel):
    id: UUID
    email: str
    display_name: str
    created_at: datetime
    model_config = {"from_attributes": True}


# --- Exercise ---

class ExerciseCreate(BaseModel):
    name: str
    muscle_group: Optional[str] = None
    muscle_groups: Optional[str] = None       # JSON array — all categories
    secondary_muscles: Optional[str] = None
    equipment: Optional[str] = None
    notes: Optional[str] = None
    instructions: Optional[str] = None
    gif_url: Optional[str] = None
    video_url: Optional[str] = None
    source: Optional[str] = None
    ascendapi_id: Optional[str] = None
    workoutx_id: Optional[str] = None


class ExerciseResponse(BaseModel):
    id: UUID
    name: str
    muscle_group: Optional[str]
    muscle_groups: Optional[str]
    secondary_muscles: Optional[str]
    equipment: Optional[str]
    notes: Optional[str]
    instructions: Optional[str]
    gif_url: Optional[str]
    video_url: Optional[str]
    source: Optional[str]
    ascendapi_id: Optional[str]
    workoutx_id: Optional[str]
    created_at: datetime
    model_config = {"from_attributes": True}


# --- Workout set ---

class WorkoutSetCreate(BaseModel):
    exercise_id: UUID
    set_number: int
    log_type: str = "strength"  # strength | cardio | mobility
    # Strength
    reps: Optional[int] = None
    weight_kg: Optional[float] = None
    # Cardio
    duration_seconds: Optional[int] = None
    distance_m: Optional[float] = None
    pace_seconds_per_km: Optional[int] = None
    incline_pct: Optional[float] = None
    laps: Optional[int] = None
    avg_heart_rate: Optional[int] = None
    calories: Optional[int] = None
    # Common
    rpe: Optional[int] = None
    notes: Optional[str] = None
    client_id: Optional[str] = None


class WorkoutSetResponse(BaseModel):
    id: UUID
    exercise_id: UUID
    set_number: int
    log_type: str
    reps: Optional[int]
    weight_kg: Optional[float]
    duration_seconds: Optional[int]
    distance_m: Optional[float]
    pace_seconds_per_km: Optional[int]
    incline_pct: Optional[float]
    laps: Optional[int]
    avg_heart_rate: Optional[int]
    calories: Optional[int]
    is_done: bool
    rpe: Optional[int]
    notes: Optional[str]
    logged_at: datetime
    model_config = {"from_attributes": True}


# --- Workout ---

class WorkoutCreate(BaseModel):
    title: Optional[str] = None
    notes: Optional[str] = None
    started_at: datetime
    ended_at: Optional[datetime] = None
    duration_seconds: Optional[int] = None
    avg_heart_rate: Optional[int] = None
    max_heart_rate: Optional[int] = None
    calories_burned: Optional[int] = None
    garmin_activity_id: Optional[str] = None
    client_id: Optional[str] = None
    sets: list[WorkoutSetCreate] = []


class WorkoutSetUpdate(BaseModel):
    log_type: Optional[str] = None
    is_done: Optional[bool] = None
    reps: Optional[int] = None
    weight_kg: Optional[float] = None
    duration_seconds: Optional[int] = None
    distance_m: Optional[float] = None
    pace_seconds_per_km: Optional[int] = None
    incline_pct: Optional[float] = None
    laps: Optional[int] = None
    avg_heart_rate: Optional[int] = None
    calories: Optional[int] = None
    rpe: Optional[int] = None
    notes: Optional[str] = None


class WorkoutUpdate(BaseModel):
    title: Optional[str] = None
    notes: Optional[str] = None
    started_at: Optional[datetime] = None
    ended_at: Optional[datetime] = None
    duration_seconds: Optional[int] = None
    avg_heart_rate: Optional[int] = None
    max_heart_rate: Optional[int] = None
    calories_burned: Optional[int] = None


class WorkoutResponse(BaseModel):
    id: UUID
    title: Optional[str]
    notes: Optional[str]
    started_at: datetime
    ended_at: Optional[datetime]
    duration_seconds: Optional[int]
    avg_heart_rate: Optional[int]
    max_heart_rate: Optional[int]
    calories_burned: Optional[int]
    garmin_activity_id: Optional[str]
    client_id: Optional[str]
    created_at: datetime
    sets: list[WorkoutSetResponse] = []
    model_config = {"from_attributes": True}


# --- Daily stats ---

class DailyStatCreate(BaseModel):
    date: datetime
    steps: Optional[int] = None
    distance_m: Optional[float] = None
    active_calories: Optional[int] = None
    total_calories: Optional[int] = None
    resting_hr: Optional[int] = None
    avg_stress: Optional[int] = None
    floors_climbed: Optional[int] = None
    active_minutes: Optional[int] = None
    sleep_seconds: Optional[int] = None
    sleep_score: Optional[int] = None


class DailyStatResponse(BaseModel):
    id: UUID
    date: datetime
    steps: Optional[int]
    distance_m: Optional[float]
    active_calories: Optional[int]
    total_calories: Optional[int]
    resting_hr: Optional[int]
    avg_stress: Optional[int]
    floors_climbed: Optional[int]
    active_minutes: Optional[int]
    sleep_seconds: Optional[int]
    sleep_score: Optional[int]
    garmin_synced_at: Optional[datetime]
    model_config = {"from_attributes": True}


# --- Heart rate ---

class HRReadingCreate(BaseModel):
    recorded_at: datetime
    bpm: int
    workout_id: Optional[UUID] = None
    source: str = "garmin"


class HRReadingResponse(BaseModel):
    id: UUID
    recorded_at: datetime
    bpm: int
    workout_id: Optional[UUID]
    source: str
    model_config = {"from_attributes": True}


# --- Batch sync ---

class SyncPayload(BaseModel):
    workouts: list[WorkoutCreate] = []
    daily_stats: list[DailyStatCreate] = []
    hr_readings: list[HRReadingCreate] = []


class SyncResponse(BaseModel):
    workouts_saved: int
    daily_stats_saved: int
    hr_readings_saved: int
    conflicts: list[str] = []


# --- Dashboard ---

class DashboardStats(BaseModel):
    version: str
    total_workouts: int
    workouts_this_week: int
    total_sets: int
    avg_workout_duration_seconds: Optional[float]
    current_streak_days: int
    steps_today: Optional[int]
    resting_hr_today: Optional[int]
    calories_today: Optional[int]


# --- Templates ---

class TemplateSetCreate(BaseModel):
    set_number: int
    log_type: str = "strength"
    target_reps: Optional[int] = None
    target_weight_kg: Optional[float] = None
    target_duration_seconds: Optional[int] = None
    target_distance_m: Optional[float] = None
    target_pace_seconds_per_km: Optional[int] = None
    target_incline_pct: Optional[float] = None
    target_laps: Optional[int] = None
    target_avg_heart_rate: Optional[int] = None
    target_calories: Optional[int] = None
    notes: Optional[str] = None


class TemplateSetResponse(BaseModel):
    id: UUID
    set_number: int
    log_type: str
    target_reps: Optional[int]
    target_weight_kg: Optional[float]
    target_duration_seconds: Optional[int]
    target_distance_m: Optional[float]
    target_pace_seconds_per_km: Optional[int]
    target_incline_pct: Optional[float]
    target_laps: Optional[int]
    target_avg_heart_rate: Optional[int]
    target_calories: Optional[int]
    notes: Optional[str]
    model_config = {"from_attributes": True}


class TemplateExerciseCreate(BaseModel):
    exercise_id: UUID
    order: int = 0
    log_type: str = "strength"
    # Legacy uniform-set fields — kept for backwards compatibility but
    # `sets` (list of TemplateSetCreate) takes precedence when provided
    target_sets: Optional[int] = None
    target_reps: Optional[int] = None
    target_weight_kg: Optional[float] = None
    notes: Optional[str] = None
    sets: list[TemplateSetCreate] = []


class TemplateExerciseUpdate(BaseModel):
    """Update an existing template_exercise. `sets` replaces the full list."""
    order: Optional[int] = None
    log_type: Optional[str] = None
    target_sets: Optional[int] = None
    target_reps: Optional[int] = None
    target_weight_kg: Optional[float] = None
    notes: Optional[str] = None
    sets: Optional[list[TemplateSetCreate]] = None


class TemplateExerciseResponse(BaseModel):
    id: UUID
    exercise_id: UUID
    order: int
    log_type: str
    target_sets: Optional[int]
    target_reps: Optional[int]
    target_weight_kg: Optional[float]
    notes: Optional[str]
    sets: list[TemplateSetResponse] = []
    model_config = {"from_attributes": True}


class TemplateCreate(BaseModel):
    name: str
    notes: Optional[str] = None
    exercises: list[TemplateExerciseCreate] = []  # default empty — new flow adds them later


class TemplateUpdate(BaseModel):
    name: Optional[str] = None
    notes: Optional[str] = None


class TemplateResponse(BaseModel):
    id: UUID
    name: str
    notes: Optional[str]
    created_at: datetime
    updated_at: datetime
    exercises: list[TemplateExerciseResponse] = []
    model_config = {"from_attributes": True}


# --- Admin ---

class BackupStatus(BaseModel):
    last_backup: Optional[str]
    last_backup_size_bytes: Optional[int]
    backup_count: int
    schedule: str
    timezone: str
    backup_dir: str
    cifs_path: Optional[str]


class BackupConfigUpdate(BaseModel):
    backup_schedule: Optional[str] = None
    tz: Optional[str] = None


# --- v0.0.9 backup management ---

class BackupListEntry(BaseModel):
    filename: str
    size_bytes: int
    created_at: datetime
    has_media: bool


class BackupSettingsResponse(BaseModel):
    retention_days: int
    include_media: bool
    updated_at: datetime
    model_config = {"from_attributes": True}


class BackupSettingsUpdate(BaseModel):
    retention_days: Optional[int] = None
    include_media: Optional[bool] = None


class BackupCreateRequest(BaseModel):
    """Optional override of stored settings for an ad-hoc backup."""
    include_media: Optional[bool] = None


class BackupCreateResponse(BaseModel):
    filename: str
    size_bytes: int
    include_media: bool


class BackupRestoreResponse(BaseModel):
    filename: str
    manifest_version: Optional[str]
    media_restored: bool
    media_present_in_backup: bool


class AdminUserResponse(BaseModel):
    id: UUID
    email: str
    display_name: str
    is_active: bool
    created_at: datetime
    model_config = {"from_attributes": True}


class AdminUserCreate(BaseModel):
    email: str
    display_name: str
    password: str

    @field_validator("password")
    @classmethod
    def password_strength(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters")
        return v


class PasswordResetRequest(BaseModel):
    email: str
    new_password: str

    @field_validator("new_password")
    @classmethod
    def password_strength(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters")
        return v


# --- Seed logs ---

class SeedLogResponse(BaseModel):
    id: UUID
    started_at: datetime
    finished_at: Optional[datetime]
    mode: str
    status: str
    added: int
    skipped: int
    gifs_downloaded: int
    log_output: Optional[str]
    error: Optional[str]
    model_config = {"from_attributes": True}
