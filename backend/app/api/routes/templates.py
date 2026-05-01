from uuid import UUID
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete
from sqlalchemy.orm import selectinload

from app.db.session import get_db
from app.models.models import (
    Template, TemplateExercise, TemplateSet, Workout, WorkoutSet,
)
from app.schemas.schemas import (
    TemplateCreate, TemplateUpdate, TemplateResponse,
    TemplateExerciseCreate, TemplateExerciseUpdate,
)
from app.core.security import get_current_user_id

router = APIRouter(prefix="/templates", tags=["templates"])


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

async def _full_template(db: AsyncSession, template_id: UUID) -> Template:
    """Re-fetch a template with all relations eagerly loaded for response."""
    result = await db.execute(
        select(Template)
        .where(Template.id == template_id)
        .options(
            selectinload(Template.exercises).selectinload(TemplateExercise.sets)
        )
    )
    return result.scalar_one()


async def _own_template_or_404(
    db: AsyncSession, template_id: UUID, user_id: str
) -> Template:
    result = await db.execute(
        select(Template).where(
            Template.id == template_id, Template.user_id == user_id
        )
    )
    t = result.scalar_one_or_none()
    if not t:
        raise HTTPException(status_code=404, detail="Template not found")
    return t


def _create_template_exercise(
    template_id: UUID, payload: TemplateExerciseCreate
) -> TemplateExercise:
    """Build a TemplateExercise (and its TemplateSets) from a create payload."""
    te = TemplateExercise(
        template_id=template_id,
        exercise_id=payload.exercise_id,
        order=payload.order,
        log_type=payload.log_type,
        target_sets=payload.target_sets,
        target_reps=payload.target_reps,
        target_weight_kg=payload.target_weight_kg,
        notes=payload.notes,
    )
    # Build sets: prefer the explicit `sets` list; otherwise fall back to
    # generating N uniform sets from legacy target_sets/target_reps fields.
    if payload.sets:
        for s in payload.sets:
            te.sets.append(TemplateSet(**s.model_dump()))
    elif payload.target_sets:
        for n in range(1, payload.target_sets + 1):
            te.sets.append(TemplateSet(
                set_number=n,
                log_type=payload.log_type,
                target_reps=payload.target_reps,
                target_weight_kg=payload.target_weight_kg,
            ))
    return te


# ---------------------------------------------------------------------------
# Template CRUD
# ---------------------------------------------------------------------------

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
        db.add(_create_template_exercise(template.id, ex))

    await db.flush()
    return await _full_template(db, template.id)


@router.get("/", response_model=list[TemplateResponse])
async def list_templates(
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Template)
        .where(Template.user_id == user_id)
        .options(selectinload(Template.exercises).selectinload(TemplateExercise.sets))
        .order_by(Template.name)
    )
    return result.scalars().all()


@router.get("/{template_id}", response_model=TemplateResponse)
async def get_template(
    template_id: UUID,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    await _own_template_or_404(db, template_id, user_id)
    return await _full_template(db, template_id)


@router.patch("/{template_id}", response_model=TemplateResponse)
async def update_template(
    template_id: UUID,
    payload: TemplateUpdate,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    t = await _own_template_or_404(db, template_id, user_id)
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(t, field, value)
    await db.flush()
    return await _full_template(db, template_id)


@router.delete("/{template_id}", status_code=204)
async def delete_template(
    template_id: UUID,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    t = await _own_template_or_404(db, template_id, user_id)
    await db.delete(t)


# ---------------------------------------------------------------------------
# Template-exercise management (the v0.0.7 incremental flow)
# ---------------------------------------------------------------------------

@router.post(
    "/{template_id}/exercises",
    response_model=TemplateResponse,
    status_code=201,
)
async def add_exercise_to_template(
    template_id: UUID,
    payload: TemplateExerciseCreate,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """Add a single exercise (with its per-set targets) to an existing template."""
    await _own_template_or_404(db, template_id, user_id)
    db.add(_create_template_exercise(template_id, payload))
    await db.flush()
    return await _full_template(db, template_id)


@router.patch(
    "/{template_id}/exercises/{te_id}",
    response_model=TemplateResponse,
)
async def update_template_exercise(
    template_id: UUID,
    te_id: UUID,
    payload: TemplateExerciseUpdate,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """
    Edit an exercise inside a template. If `sets` is provided, it REPLACES the
    existing set list (delete-and-recreate, simplest semantics for the
    'edit sets' modal).
    """
    await _own_template_or_404(db, template_id, user_id)
    result = await db.execute(
        select(TemplateExercise).where(
            TemplateExercise.id == te_id,
            TemplateExercise.template_id == template_id,
        ).options(selectinload(TemplateExercise.sets))
    )
    te = result.scalar_one_or_none()
    if not te:
        raise HTTPException(status_code=404, detail="Exercise not in template")

    data = payload.model_dump(exclude_unset=True)
    new_sets = data.pop("sets", None)

    for field, value in data.items():
        setattr(te, field, value)

    if new_sets is not None:
        await db.execute(
            delete(TemplateSet).where(TemplateSet.template_exercise_id == te.id)
        )
        for s in new_sets:
            db.add(TemplateSet(template_exercise_id=te.id, **s))

    await db.flush()
    return await _full_template(db, template_id)


@router.delete("/{template_id}/exercises/{te_id}", status_code=204)
async def remove_exercise_from_template(
    template_id: UUID,
    te_id: UUID,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    await _own_template_or_404(db, template_id, user_id)
    result = await db.execute(
        select(TemplateExercise).where(
            TemplateExercise.id == te_id,
            TemplateExercise.template_id == template_id,
        )
    )
    te = result.scalar_one_or_none()
    if not te:
        raise HTTPException(status_code=404, detail="Exercise not in template")
    await db.delete(te)


# ---------------------------------------------------------------------------
# Start a workout from a template
# ---------------------------------------------------------------------------

@router.post("/{template_id}/start", response_model=dict, status_code=201)
async def start_workout_from_template(
    template_id: UUID,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """
    Creates an in-progress Workout pre-filled with WorkoutSets generated
    from the template's TemplateSets. Each TemplateSet becomes one WorkoutSet,
    inheriting log_type and target values — which the user can edit when
    actually logging the workout (in case they don't quite hit the targets).
    """
    result = await db.execute(
        select(Template)
        .where(Template.id == template_id, Template.user_id == user_id)
        .options(selectinload(Template.exercises).selectinload(TemplateExercise.sets))
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

    for te in sorted(t.exercises, key=lambda x: x.order):
        if te.sets:
            for ts in sorted(te.sets, key=lambda s: s.set_number):
                db.add(WorkoutSet(
                    workout_id=workout.id,
                    exercise_id=te.exercise_id,
                    set_number=ts.set_number,
                    log_type=ts.log_type,
                    reps=ts.target_reps,
                    weight_kg=ts.target_weight_kg,
                    duration_seconds=ts.target_duration_seconds,
                    distance_m=ts.target_distance_m,
                    pace_seconds_per_km=ts.target_pace_seconds_per_km,
                    incline_pct=ts.target_incline_pct,
                    laps=ts.target_laps,
                    avg_heart_rate=ts.target_avg_heart_rate,
                    calories=ts.target_calories,
                    notes=ts.notes,
                ))
        else:
            for n in range(1, (te.target_sets or 1) + 1):
                db.add(WorkoutSet(
                    workout_id=workout.id,
                    exercise_id=te.exercise_id,
                    set_number=n,
                    log_type=te.log_type,
                    reps=te.target_reps,
                    weight_kg=te.target_weight_kg,
                    notes=te.notes,
                ))

    return {"workout_id": str(workout.id)}
