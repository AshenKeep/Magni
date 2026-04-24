from uuid import UUID
from typing import Optional
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.db.session import get_db
from app.models.models import Workout, WorkoutSet
from app.schemas.schemas import WorkoutCreate, WorkoutUpdate, WorkoutResponse, WorkoutSetCreate, WorkoutSetResponse, WorkoutSetUpdate
from app.core.security import get_current_user_id

router = APIRouter(prefix="/workouts", tags=["workouts"])


@router.post("/", response_model=WorkoutResponse, status_code=201)
async def create_workout(
    payload: WorkoutCreate,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    if payload.client_id:
        existing = await db.execute(select(Workout).where(Workout.client_id == payload.client_id))
        if existing.scalar_one_or_none():
            raise HTTPException(status_code=409, detail="Workout already synced")

    workout = Workout(
        user_id=user_id,
        title=payload.title,
        notes=payload.notes,
        started_at=payload.started_at,
        ended_at=payload.ended_at,
        duration_seconds=payload.duration_seconds,
        avg_heart_rate=payload.avg_heart_rate,
        max_heart_rate=payload.max_heart_rate,
        calories_burned=payload.calories_burned,
        garmin_activity_id=payload.garmin_activity_id,
        client_id=payload.client_id,
        synced_at=datetime.now(timezone.utc),
    )
    db.add(workout)
    await db.flush()

    for s in payload.sets:
        db.add(WorkoutSet(
            workout_id=workout.id,
            exercise_id=s.exercise_id,
            set_number=s.set_number,
            reps=s.reps,
            weight_kg=s.weight_kg,
            duration_seconds=s.duration_seconds,
            distance_m=s.distance_m,
            rpe=s.rpe,
            notes=s.notes,
            client_id=s.client_id,
        ))

    await db.flush()
    result = await db.execute(
        select(Workout).where(Workout.id == workout.id).options(selectinload(Workout.sets))
    )
    return result.scalar_one()


@router.get("/", response_model=list[WorkoutResponse])
async def list_workouts(
    limit: int = Query(20, le=100),
    offset: int = Query(0, ge=0),
    from_date: Optional[datetime] = None,
    to_date: Optional[datetime] = None,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    q = (
        select(Workout)
        .where(Workout.user_id == user_id)
        .options(selectinload(Workout.sets))
        .order_by(Workout.started_at.desc())
        .offset(offset)
        .limit(limit)
    )
    if from_date:
        q = q.where(Workout.started_at >= from_date)
    if to_date:
        q = q.where(Workout.started_at <= to_date)
    result = await db.execute(q)
    return result.scalars().all()


@router.get("/{workout_id}", response_model=WorkoutResponse)
async def get_workout(
    workout_id: UUID,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Workout)
        .where(Workout.id == workout_id, Workout.user_id == user_id)
        .options(selectinload(Workout.sets))
    )
    workout = result.scalar_one_or_none()
    if not workout:
        raise HTTPException(status_code=404, detail="Workout not found")
    return workout


@router.patch("/{workout_id}", response_model=WorkoutResponse)
async def update_workout(
    workout_id: UUID,
    payload: WorkoutUpdate,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Workout).where(Workout.id == workout_id, Workout.user_id == user_id)
    )
    workout = result.scalar_one_or_none()
    if not workout:
        raise HTTPException(status_code=404, detail="Workout not found")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(workout, field, value)
    await db.flush()
    result = await db.execute(
        select(Workout).where(Workout.id == workout_id).options(selectinload(Workout.sets))
    )
    return result.scalar_one()


@router.delete("/{workout_id}", status_code=204)
async def delete_workout(
    workout_id: UUID,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Workout).where(Workout.id == workout_id, Workout.user_id == user_id)
    )
    workout = result.scalar_one_or_none()
    if not workout:
        raise HTTPException(status_code=404, detail="Workout not found")
    await db.delete(workout)


# ---------------------------------------------------------------------------
# Set-level CRUD (for live workout logging)
# ---------------------------------------------------------------------------

@router.post("/{workout_id}/sets", response_model=WorkoutSetResponse, status_code=201)
async def add_set(
    workout_id: UUID,
    payload: WorkoutSetCreate,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Workout).where(Workout.id == workout_id, Workout.user_id == user_id))
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Workout not found")
    ws = WorkoutSet(workout_id=workout_id, **payload.model_dump())
    db.add(ws)
    await db.flush()
    return ws


@router.patch("/{workout_id}/sets/{set_id}", response_model=WorkoutSetResponse)
async def update_set(
    workout_id: UUID,
    set_id: UUID,
    payload: WorkoutSetUpdate,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Workout).where(Workout.id == workout_id, Workout.user_id == user_id))
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Workout not found")
    result = await db.execute(select(WorkoutSet).where(WorkoutSet.id == set_id, WorkoutSet.workout_id == workout_id))
    ws = result.scalar_one_or_none()
    if not ws:
        raise HTTPException(status_code=404, detail="Set not found")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(ws, field, value)
    await db.flush()
    return ws


@router.delete("/{workout_id}/sets/{set_id}", status_code=204)
async def delete_set(
    workout_id: UUID,
    set_id: UUID,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Workout).where(Workout.id == workout_id, Workout.user_id == user_id))
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Workout not found")
    result = await db.execute(select(WorkoutSet).where(WorkoutSet.id == set_id, WorkoutSet.workout_id == workout_id))
    ws = result.scalar_one_or_none()
    if not ws:
        raise HTTPException(status_code=404, detail="Set not found")
    await db.delete(ws)
