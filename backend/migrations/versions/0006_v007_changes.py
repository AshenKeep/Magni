"""v0.0.7 — per-set cardio metrics, log_type field, template_sets table

Revision ID: 0006
Revises: 0005
Create Date: 2026-04-30

Adds:
  - workout_sets.log_type (strength | cardio | mobility)
  - workout_sets.pace_seconds_per_km, incline_pct, laps, avg_heart_rate, calories
  - template_exercises.log_type
  - new template_sets table — per-set targets with full cardio field flexibility

Backfills:
  - workout_sets.log_type defaults to 'strength' for existing rows
  - template_exercises.log_type defaults to 'strength' for existing rows
"""
from alembic import op
import sqlalchemy as sa


revision = "0006"
down_revision = "0005"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ---- workout_sets ----
    op.add_column("workout_sets", sa.Column("log_type", sa.String(20), nullable=False, server_default="strength"))
    op.add_column("workout_sets", sa.Column("pace_seconds_per_km", sa.Integer(), nullable=True))
    op.add_column("workout_sets", sa.Column("incline_pct", sa.Float(), nullable=True))
    op.add_column("workout_sets", sa.Column("laps", sa.Integer(), nullable=True))
    op.add_column("workout_sets", sa.Column("avg_heart_rate", sa.Integer(), nullable=True))
    op.add_column("workout_sets", sa.Column("calories", sa.Integer(), nullable=True))

    # ---- template_exercises ----
    op.add_column(
        "template_exercises",
        sa.Column("log_type", sa.String(20), nullable=False, server_default="strength"),
    )

    # ---- template_sets (new) ----
    op.create_table(
        "template_sets",
        sa.Column("id", sa.dialects.postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "template_exercise_id",
            sa.dialects.postgresql.UUID(as_uuid=True),
            sa.ForeignKey("template_exercises.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("set_number", sa.Integer(), nullable=False),
        sa.Column("log_type", sa.String(20), nullable=False, server_default="strength"),
        sa.Column("target_reps", sa.Integer(), nullable=True),
        sa.Column("target_weight_kg", sa.Float(), nullable=True),
        sa.Column("target_duration_seconds", sa.Integer(), nullable=True),
        sa.Column("target_distance_m", sa.Float(), nullable=True),
        sa.Column("target_pace_seconds_per_km", sa.Integer(), nullable=True),
        sa.Column("target_incline_pct", sa.Float(), nullable=True),
        sa.Column("target_laps", sa.Integer(), nullable=True),
        sa.Column("target_avg_heart_rate", sa.Integer(), nullable=True),
        sa.Column("target_calories", sa.Integer(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
    )
    op.create_index(
        "ix_template_sets_template_exercise_id",
        "template_sets",
        ["template_exercise_id"],
    )

    # ---- Backfill template_sets from existing template_exercises ----
    # For each existing template_exercise row that has target_sets, generate
    # that many TemplateSet rows with the legacy reps/weight as targets.
    op.execute("""
        INSERT INTO template_sets (
            id, template_exercise_id, set_number, log_type,
            target_reps, target_weight_kg
        )
        SELECT
            gen_random_uuid(),
            te.id,
            generate_series(1, COALESCE(te.target_sets, 1)),
            'strength',
            te.target_reps,
            te.target_weight_kg
        FROM template_exercises te
        WHERE te.target_sets IS NOT NULL AND te.target_sets > 0
    """)


def downgrade() -> None:
    op.drop_index("ix_template_sets_template_exercise_id", table_name="template_sets")
    op.drop_table("template_sets")

    op.drop_column("template_exercises", "log_type")

    op.drop_column("workout_sets", "calories")
    op.drop_column("workout_sets", "avg_heart_rate")
    op.drop_column("workout_sets", "laps")
    op.drop_column("workout_sets", "incline_pct")
    op.drop_column("workout_sets", "pace_seconds_per_km")
    op.drop_column("workout_sets", "log_type")
