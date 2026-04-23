from uuid import UUID
from typing import Optional
from datetime import datetime, timezone, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from app.db.session import get_db
from app.models.models import Exercise, DailyStat, HeartRateReading, Workout, WorkoutSet
from app.schemas.schemas import (
    ExerciseCreate, ExerciseResponse,
    DailyStatCreate, DailyStatResponse,
    HRReadingCreate, HRReadingResponse,
    SyncPayload, SyncResponse,
    DashboardStats,
)
from app.core.config import APP_VERSION
from app.core.security import get_current_user_id

# ---------------------------------------------------------------------------
exercises_router = APIRouter(prefix="/exercises", tags=["exercises"])


@exercises_router.post("/", response_model=ExerciseResponse, status_code=201)
async def create_exercise(
    payload: ExerciseCreate,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    ex = Exercise(user_id=user_id, **payload.model_dump())
    db.add(ex)
    await db.flush()
    return ex


@exercises_router.get("/", response_model=list[ExerciseResponse])
async def list_exercises(
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Exercise).where(Exercise.user_id == user_id).order_by(Exercise.name)
    )
    return result.scalars().all()


@exercises_router.delete("/{exercise_id}", status_code=204)
async def delete_exercise(
    exercise_id: UUID,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Exercise).where(Exercise.id == exercise_id, Exercise.user_id == user_id)
    )
    ex = result.scalar_one_or_none()
    if not ex:
        raise HTTPException(status_code=404, detail="Exercise not found")
    await db.delete(ex)


# ---------------------------------------------------------------------------
stats_router = APIRouter(prefix="/stats", tags=["stats"])


@stats_router.post("/daily", response_model=DailyStatResponse, status_code=201)
async def upsert_daily_stat(
    payload: DailyStatCreate,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    date_start = payload.date.replace(hour=0, minute=0, second=0, microsecond=0)
    date_end = date_start + timedelta(days=1)
    result = await db.execute(
        select(DailyStat).where(
            DailyStat.user_id == user_id,
            DailyStat.date >= date_start,
            DailyStat.date < date_end,
        )
    )
    stat = result.scalar_one_or_none()
    data = payload.model_dump()
    if stat:
        for k, v in data.items():
            if v is not None:
                setattr(stat, k, v)
        stat.garmin_synced_at = datetime.now(timezone.utc)
    else:
        stat = DailyStat(user_id=user_id, garmin_synced_at=datetime.now(timezone.utc), **data)
        db.add(stat)
    await db.flush()
    return stat


@stats_router.get("/daily", response_model=list[DailyStatResponse])
async def list_daily_stats(
    days: int = Query(30, le=365),
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    since = datetime.now(timezone.utc) - timedelta(days=days)
    result = await db.execute(
        select(DailyStat)
        .where(DailyStat.user_id == user_id, DailyStat.date >= since)
        .order_by(DailyStat.date.desc())
    )
    return result.scalars().all()


@stats_router.post("/hr", response_model=list[HRReadingResponse], status_code=201)
async def bulk_add_hr(
    readings: list[HRReadingCreate],
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    rows = [HeartRateReading(user_id=user_id, **r.model_dump()) for r in readings]
    db.add_all(rows)
    await db.flush()
    return rows


@stats_router.get("/hr", response_model=list[HRReadingResponse])
async def get_hr_readings(
    workout_id: Optional[UUID] = None,
    from_dt: Optional[datetime] = None,
    to_dt: Optional[datetime] = None,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    q = select(HeartRateReading).where(HeartRateReading.user_id == user_id)
    if workout_id:
        q = q.where(HeartRateReading.workout_id == workout_id)
    if from_dt:
        q = q.where(HeartRateReading.recorded_at >= from_dt)
    if to_dt:
        q = q.where(HeartRateReading.recorded_at <= to_dt)
    result = await db.execute(q.order_by(HeartRateReading.recorded_at).limit(2000))
    return result.scalars().all()


# ---------------------------------------------------------------------------
sync_router = APIRouter(prefix="/sync", tags=["sync"])


@sync_router.post("/", response_model=SyncResponse)
async def batch_sync(
    payload: SyncPayload,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    workouts_saved = 0
    daily_saved = 0
    hr_saved = 0
    conflicts: list[str] = []

    for w in payload.workouts:
        if w.client_id:
            existing = await db.execute(select(Workout).where(Workout.client_id == w.client_id))
            if existing.scalar_one_or_none():
                conflicts.append(f"workout:{w.client_id}")
                continue
        workout = Workout(
            user_id=user_id,
            synced_at=datetime.now(timezone.utc),
            **w.model_dump(exclude={"sets"}),
        )
        db.add(workout)
        await db.flush()
        for s in w.sets:
            db.add(WorkoutSet(workout_id=workout.id, **s.model_dump()))
        workouts_saved += 1

    for d in payload.daily_stats:
        date_start = d.date.replace(hour=0, minute=0, second=0, microsecond=0)
        date_end = date_start + timedelta(days=1)
        existing = await db.execute(
            select(DailyStat).where(
                DailyStat.user_id == user_id,
                DailyStat.date >= date_start,
                DailyStat.date < date_end,
            )
        )
        stat = existing.scalar_one_or_none()
        if stat:
            for k, v in d.model_dump().items():
                if v is not None:
                    setattr(stat, k, v)
        else:
            db.add(DailyStat(user_id=user_id, garmin_synced_at=datetime.now(timezone.utc), **d.model_dump()))
        daily_saved += 1

    hr_rows = [HeartRateReading(user_id=user_id, **r.model_dump()) for r in payload.hr_readings]
    db.add_all(hr_rows)
    hr_saved = len(hr_rows)

    return SyncResponse(
        workouts_saved=workouts_saved,
        daily_stats_saved=daily_saved,
        hr_readings_saved=hr_saved,
        conflicts=conflicts,
    )


# ---------------------------------------------------------------------------
dashboard_router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@dashboard_router.get("/", response_model=DashboardStats)
async def get_dashboard(
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    now = datetime.now(timezone.utc)
    week_start = now - timedelta(days=now.weekday())

    total_workouts = (await db.execute(
        select(func.count()).where(Workout.user_id == user_id)
    )).scalar_one()

    workouts_this_week = (await db.execute(
        select(func.count()).where(Workout.user_id == user_id, Workout.started_at >= week_start)
    )).scalar_one()

    total_sets = (await db.execute(
        select(func.count(WorkoutSet.id))
        .join(Workout, WorkoutSet.workout_id == Workout.id)
        .where(Workout.user_id == user_id)
    )).scalar_one()

    avg_duration = (await db.execute(
        select(func.avg(Workout.duration_seconds)).where(
            Workout.user_id == user_id, Workout.duration_seconds.isnot(None)
        )
    )).scalar_one()

    streak = 0
    check_date = now.date()
    while streak <= 365:
        day_start = datetime.combine(check_date, datetime.min.time()).replace(tzinfo=timezone.utc)
        day_end = day_start + timedelta(days=1)
        count = (await db.execute(
            select(func.count()).where(
                Workout.user_id == user_id,
                Workout.started_at >= day_start,
                Workout.started_at < day_end,
            )
        )).scalar_one()
        if count == 0:
            break
        streak += 1
        check_date = check_date - timedelta(days=1)

    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    today_stat = (await db.execute(
        select(DailyStat).where(DailyStat.user_id == user_id, DailyStat.date >= today_start)
    )).scalar_one_or_none()

    return DashboardStats(
        version=APP_VERSION,
        total_workouts=total_workouts,
        workouts_this_week=workouts_this_week,
        total_sets=total_sets,
        avg_workout_duration_seconds=avg_duration,
        current_streak_days=streak,
        steps_today=today_stat.steps if today_stat else None,
        resting_hr_today=today_stat.resting_hr if today_stat else None,
        calories_today=today_stat.active_calories if today_stat else None,
    )
