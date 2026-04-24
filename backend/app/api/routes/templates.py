from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.db.session import get_db
from app.models.models import Template, TemplateExercise, Workout, WorkoutSet
from app.schemas.schemas import (
    TemplateCreate, TemplateUpdate, TemplateResponse, TemplateExerciseCreate
)
from app.core.security import get_current_user_id

router = APIRouter(prefix="/templates", tags=["templates"])


@router.post("/", response_model=TemplateResponse, status_code=201)
async def create_template(
    payload: TemplateCreate,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    template = Template(user_id=user_id, name=payload.name, notes=payload.notes)
    db.add(template)
    await db.flush()

    for ex in payload.exercises:
        db.add(TemplateExercise(template_id=template.id, **ex.model_dump()))

    await db.flush()
    result = await db.execute(
        select(Template).where(Template.id == template.id).options(selectinload(Template.exercises))
    )
    return result.scalar_one()


@router.get("/", response_model=list[TemplateResponse])
async def list_templates(
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Template)
        .where(Template.user_id == user_id)
        .options(selectinload(Template.exercises))
        .order_by(Template.name)
    )
    return result.scalars().all()


@router.get("/{template_id}", response_model=TemplateResponse)
async def get_template(
    template_id: UUID,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Template)
        .where(Template.id == template_id, Template.user_id == user_id)
        .options(selectinload(Template.exercises))
    )
    t = result.scalar_one_or_none()
    if not t:
        raise HTTPException(status_code=404, detail="Template not found")
    return t


@router.patch("/{template_id}", response_model=TemplateResponse)
async def update_template(
    template_id: UUID,
    payload: TemplateUpdate,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Template).where(Template.id == template_id, Template.user_id == user_id)
    )
    t = result.scalar_one_or_none()
    if not t:
        raise HTTPException(status_code=404, detail="Template not found")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(t, field, value)
    await db.flush()
    result = await db.execute(
        select(Template).where(Template.id == template_id).options(selectinload(Template.exercises))
    )
    return result.scalar_one()


@router.delete("/{template_id}", status_code=204)
async def delete_template(
    template_id: UUID,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Template).where(Template.id == template_id, Template.user_id == user_id)
    )
    t = result.scalar_one_or_none()
    if not t:
        raise HTTPException(status_code=404, detail="Template not found")
    await db.delete(t)


@router.post("/{template_id}/exercises", response_model=TemplateResponse, status_code=201)
async def add_exercise_to_template(
    template_id: UUID,
    payload: TemplateExerciseCreate,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Template).where(Template.id == template_id, Template.user_id == user_id)
    )
    t = result.scalar_one_or_none()
    if not t:
        raise HTTPException(status_code=404, detail="Template not found")
    db.add(TemplateExercise(template_id=template_id, **payload.model_dump()))
    await db.flush()
    result = await db.execute(
        select(Template).where(Template.id == template_id).options(selectinload(Template.exercises))
    )
    return result.scalar_one()


@router.delete("/{template_id}/exercises/{ex_id}", status_code=204)
async def remove_exercise_from_template(
    template_id: UUID,
    ex_id: UUID,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Template).where(Template.id == template_id, Template.user_id == user_id)
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Template not found")
    result = await db.execute(
        select(TemplateExercise).where(TemplateExercise.id == ex_id, TemplateExercise.template_id == template_id)
    )
    te = result.scalar_one_or_none()
    if not te:
        raise HTTPException(status_code=404, detail="Exercise not found in template")
    await db.delete(te)


@router.post("/{template_id}/start", response_model=dict, status_code=201)
async def start_workout_from_template(
    template_id: UUID,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """Creates a new in-progress workout pre-filled from a template. Returns the workout ID."""
    from datetime import datetime, timezone
    result = await db.execute(
        select(Template)
        .where(Template.id == template_id, Template.user_id == user_id)
        .options(selectinload(Template.exercises))
    )
    t = result.scalar_one_or_none()
    if not t:
        raise HTTPException(status_code=404, detail="Template not found")

    workout = Workout(
        user_id=user_id,
        title=t.name,
        started_at=datetime.now(timezone.utc),
    )
    db.add(workout)
    await db.flush()

    for i, te in enumerate(sorted(t.exercises, key=lambda x: x.order)):
        for set_num in range(1, (te.target_sets or 1) + 1):
            db.add(WorkoutSet(
                workout_id=workout.id,
                exercise_id=te.exercise_id,
                set_number=set_num,
                reps=te.target_reps,
                weight_kg=te.target_weight_kg,
                notes=te.notes,
            ))

    return {"workout_id": str(workout.id)}
