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


class Exercise(Base):
    __tablename__ = "exercises"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), nullable=False)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    muscle_group: Mapped[Optional[str]] = mapped_column(String(100))
    equipment: Mapped[Optional[str]] = mapped_column(String(100))
    notes: Mapped[Optional[str]] = mapped_column(Text)
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
    reps: Mapped[Optional[int]] = mapped_column(Integer)
    weight_kg: Mapped[Optional[float]] = mapped_column(Float)
    duration_seconds: Mapped[Optional[int]] = mapped_column(Integer)
    distance_m: Mapped[Optional[float]] = mapped_column(Float)
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
