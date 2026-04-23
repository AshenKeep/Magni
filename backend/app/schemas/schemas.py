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
    equipment: Optional[str] = None
    notes: Optional[str] = None


class ExerciseResponse(BaseModel):
    id: UUID
    name: str
    muscle_group: Optional[str]
    equipment: Optional[str]
    notes: Optional[str]
    created_at: datetime
    model_config = {"from_attributes": True}


# --- Workout set ---

class WorkoutSetCreate(BaseModel):
    exercise_id: UUID
    set_number: int
    reps: Optional[int] = None
    weight_kg: Optional[float] = None
    duration_seconds: Optional[int] = None
    distance_m: Optional[float] = None
    rpe: Optional[int] = None
    notes: Optional[str] = None
    client_id: Optional[str] = None


class WorkoutSetResponse(BaseModel):
    id: UUID
    exercise_id: UUID
    set_number: int
    reps: Optional[int]
    weight_kg: Optional[float]
    duration_seconds: Optional[int]
    distance_m: Optional[float]
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


class WorkoutUpdate(BaseModel):
    title: Optional[str] = None
    notes: Optional[str] = None
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
