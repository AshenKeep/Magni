from __future__ import annotations
import uuid
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import String, Float, Integer, Boolean, DateTime, ForeignKey, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID

from app.db.session import Base


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    display_name: Mapped[str] = mapped_column(String(100), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    workouts: Mapped[list[Workout]] = relationship("Workout", back_populates="user", cascade="all, delete-orphan")
    exercises: Mapped[list[Exercise]] = relationship("Exercise", back_populates="user", cascade="all, delete-orphan")
    daily_stats: Mapped[list[DailyStat]] = relationship("DailyStat", back_populates="user", cascade="all, delete-orphan")
    hr_readings: Mapped[list[HeartRateReading]] = relationship("HeartRateReading", back_populates="user", cascade="all, delete-orphan")
    templates: Mapped[list[Template]] = relationship("Template", back_populates="user", cascade="all, delete-orphan")


class Exercise(Base):
    __tablename__ = "exercises"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), nullable=False)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    muscle_group: Mapped[Optional[str]] = mapped_column(String(100))
    muscle_groups: Mapped[Optional[str]] = mapped_column(Text)       # JSON array — all categories this exercise targets
    secondary_muscles: Mapped[Optional[str]] = mapped_column(Text)   # JSON array stored as string
    equipment: Mapped[Optional[str]] = mapped_column(String(100))
    notes: Mapped[Optional[str]] = mapped_column(Text)
    instructions: Mapped[Optional[str]] = mapped_column(Text)        # Step-by-step instructions
    gif_url: Mapped[Optional[str]] = mapped_column(String(500))      # External or local GIF URL
    video_url: Mapped[Optional[str]] = mapped_column(String(500))    # Video URL if available
    source: Mapped[Optional[str]] = mapped_column(String(50))        # "ascendapi" | "workoutx" | "manual"
    ascendapi_id: Mapped[Optional[str]] = mapped_column(String(100)) # External ID for deduplication
    workoutx_id: Mapped[Optional[str]] = mapped_column(String(100))  # WorkoutX exercise ID
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    user: Mapped[User] = relationship("User", back_populates="exercises")
    workout_sets: Mapped[list[WorkoutSet]] = relationship("WorkoutSet", back_populates="exercise")


class Workout(Base):
    __tablename__ = "workouts"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), nullable=False)
    title: Mapped[Optional[str]] = mapped_column(String(200))
    notes: Mapped[Optional[str]] = mapped_column(Text)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    ended_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    duration_seconds: Mapped[Optional[int]] = mapped_column(Integer)
    avg_heart_rate: Mapped[Optional[int]] = mapped_column(Integer)
    max_heart_rate: Mapped[Optional[int]] = mapped_column(Integer)
    calories_burned: Mapped[Optional[int]] = mapped_column(Integer)
    garmin_activity_id: Mapped[Optional[str]] = mapped_column(String(100))
    client_id: Mapped[Optional[str]] = mapped_column(String(100), unique=True)
    synced_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    user: Mapped[User] = relationship("User", back_populates="workouts")
    sets: Mapped[list[WorkoutSet]] = relationship("WorkoutSet", back_populates="workout", cascade="all, delete-orphan")


class WorkoutSet(Base):
    __tablename__ = "workout_sets"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    workout_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("workouts.id"), nullable=False)
    exercise_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("exercises.id"), nullable=False)
    set_number: Mapped[int] = mapped_column(Integer, nullable=False)
    # log_type controls which fields are meaningful: strength | cardio | mobility
    log_type: Mapped[str] = mapped_column(String(20), nullable=False, default="strength")
    # Strength fields
    reps: Mapped[Optional[int]] = mapped_column(Integer)
    weight_kg: Mapped[Optional[float]] = mapped_column(Float)
    # Cardio fields (all nullable — user picks which to track per-set via "+ Add field")
    duration_seconds: Mapped[Optional[int]] = mapped_column(Integer)
    distance_m: Mapped[Optional[float]] = mapped_column(Float)
    pace_seconds_per_km: Mapped[Optional[int]] = mapped_column(Integer)
    incline_pct: Mapped[Optional[float]] = mapped_column(Float)
    laps: Mapped[Optional[int]] = mapped_column(Integer)
    avg_heart_rate: Mapped[Optional[int]] = mapped_column(Integer)
    calories: Mapped[Optional[int]] = mapped_column(Integer)
    # Common
    rpe: Mapped[Optional[int]] = mapped_column(Integer)
    notes: Mapped[Optional[str]] = mapped_column(Text)
    logged_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    client_id: Mapped[Optional[str]] = mapped_column(String(100), unique=True)

    workout: Mapped[Workout] = relationship("Workout", back_populates="sets")
    exercise: Mapped[Exercise] = relationship("Exercise", back_populates="workout_sets")


class DailyStat(Base):
    __tablename__ = "daily_stats"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), nullable=False)
    date: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    steps: Mapped[Optional[int]] = mapped_column(Integer)
    distance_m: Mapped[Optional[float]] = mapped_column(Float)
    active_calories: Mapped[Optional[int]] = mapped_column(Integer)
    total_calories: Mapped[Optional[int]] = mapped_column(Integer)
    resting_hr: Mapped[Optional[int]] = mapped_column(Integer)
    avg_stress: Mapped[Optional[int]] = mapped_column(Integer)
    floors_climbed: Mapped[Optional[int]] = mapped_column(Integer)
    active_minutes: Mapped[Optional[int]] = mapped_column(Integer)
    sleep_seconds: Mapped[Optional[int]] = mapped_column(Integer)
    sleep_score: Mapped[Optional[int]] = mapped_column(Integer)
    garmin_synced_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    user: Mapped[User] = relationship("User", back_populates="daily_stats")


class HeartRateReading(Base):
    __tablename__ = "hr_readings"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), nullable=False)
    workout_id: Mapped[Optional[uuid.UUID]] = mapped_column(ForeignKey("workouts.id"), nullable=True)
    recorded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    bpm: Mapped[int] = mapped_column(Integer, nullable=False)
    source: Mapped[str] = mapped_column(String(50), default="garmin")

    user: Mapped[User] = relationship("User", back_populates="hr_readings")


# ---------------------------------------------------------------------------
# Workout Template
# ---------------------------------------------------------------------------
class Template(Base):
    __tablename__ = "templates"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), nullable=False)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    notes: Mapped[Optional[str]] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    user: Mapped[User] = relationship("User", back_populates="templates")
    exercises: Mapped[list[TemplateExercise]] = relationship("TemplateExercise", back_populates="template", cascade="all, delete-orphan", order_by="TemplateExercise.order")


class TemplateExercise(Base):
    __tablename__ = "template_exercises"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    template_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("templates.id"), nullable=False)
    exercise_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("exercises.id"), nullable=False)
    order: Mapped[int] = mapped_column(Integer, default=0)
    # Default log type for this exercise — overridable per-set
    log_type: Mapped[str] = mapped_column(String(20), nullable=False, default="strength")
    # Legacy "uniform across all sets" fields — still used as defaults when adding sets
    target_sets: Mapped[Optional[int]] = mapped_column(Integer)
    target_reps: Mapped[Optional[int]] = mapped_column(Integer)
    target_weight_kg: Mapped[Optional[float]] = mapped_column(Float)
    notes: Mapped[Optional[str]] = mapped_column(Text)

    template: Mapped[Template] = relationship("Template", back_populates="exercises")
    exercise: Mapped[Exercise] = relationship("Exercise")
    sets: Mapped[list["TemplateSet"]] = relationship(
        "TemplateSet",
        back_populates="template_exercise",
        cascade="all, delete-orphan",
        order_by="TemplateSet.set_number",
    )


class TemplateSet(Base):
    """
    Per-set targets within a template_exercise. Each set is fully independent
    and can have its own log_type and metric fields. e.g. set 1 = 5km in 25min,
    set 2 = 10 laps in 10min, set 3 = strength reps after the cardio cool-down.
    """
    __tablename__ = "template_sets"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    template_exercise_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("template_exercises.id", ondelete="CASCADE"), nullable=False
    )
    set_number: Mapped[int] = mapped_column(Integer, nullable=False)
    log_type: Mapped[str] = mapped_column(String(20), nullable=False, default="strength")
    # Strength
    target_reps: Mapped[Optional[int]] = mapped_column(Integer)
    target_weight_kg: Mapped[Optional[float]] = mapped_column(Float)
    # Cardio (all opt-in via "+ Add field")
    target_duration_seconds: Mapped[Optional[int]] = mapped_column(Integer)
    target_distance_m: Mapped[Optional[float]] = mapped_column(Float)
    target_pace_seconds_per_km: Mapped[Optional[int]] = mapped_column(Integer)
    target_incline_pct: Mapped[Optional[float]] = mapped_column(Float)
    target_laps: Mapped[Optional[int]] = mapped_column(Integer)
    target_avg_heart_rate: Mapped[Optional[int]] = mapped_column(Integer)
    target_calories: Mapped[Optional[int]] = mapped_column(Integer)
    notes: Mapped[Optional[str]] = mapped_column(Text)

    template_exercise: Mapped[TemplateExercise] = relationship(
        "TemplateExercise", back_populates="sets"
    )


# ---------------------------------------------------------------------------
# Seed Log — records each exercise seed attempt
# ---------------------------------------------------------------------------
class SeedLog(Base):
    __tablename__ = "seed_logs"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), nullable=False)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    finished_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    mode: Mapped[str] = mapped_column(String(50))          # metadata_only | with_gifs | download_gifs
    status: Mapped[str] = mapped_column(String(20))        # running | success | error
    added: Mapped[int] = mapped_column(Integer, default=0)
    skipped: Mapped[int] = mapped_column(Integer, default=0)
    gifs_downloaded: Mapped[int] = mapped_column(Integer, default=0)
    log_output: Mapped[Optional[str]] = mapped_column(Text) # newline-separated log lines
    error: Mapped[Optional[str]] = mapped_column(Text)

    user: Mapped[User] = relationship("User")


# ---------------------------------------------------------------------------
# API Keys — for external exercise providers
# ---------------------------------------------------------------------------
class ApiKey(Base):
    __tablename__ = "api_keys"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    provider: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)  # "ascendapi" | "workoutx"
    api_key: Mapped[str] = mapped_column(Text, nullable=False)
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)
