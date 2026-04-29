"""v0.0.6 — multi-category muscle tags, api_keys table, source tracking

Revision ID: 0005
Revises: 0004
Create Date: 2026-04-29

Adds:
  - exercises.muscle_groups (JSON array as text — all categories this exercise targets)
  - exercises.source (which provider added it: ascendapi/workoutx/manual)
  - exercises.workoutx_id (WorkoutX provider deduplication)
  - api_keys table (provider, api_key, enabled)

Backfill:
  - For existing exercises, muscle_groups = [muscle_group] (single primary muscle as 1-item list)
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = '0005'
down_revision = '0004'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # exercises additions
    op.add_column('exercises', sa.Column('muscle_groups', sa.Text(), nullable=True))
    op.add_column('exercises', sa.Column('source', sa.String(length=50), nullable=True))
    op.add_column('exercises', sa.Column('workoutx_id', sa.String(length=100), nullable=True))

    # Backfill muscle_groups from existing muscle_group
    op.execute("""
        UPDATE exercises
        SET muscle_groups = '["' || muscle_group || '"]'
        WHERE muscle_group IS NOT NULL AND muscle_groups IS NULL
    """)
    op.execute("""
        UPDATE exercises
        SET source = 'ascendapi'
        WHERE ascendapi_id IS NOT NULL AND source IS NULL
    """)
    op.execute("""
        UPDATE exercises
        SET source = 'manual'
        WHERE source IS NULL
    """)

    # api_keys table
    op.create_table(
        'api_keys',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('provider', sa.String(length=50), nullable=False),
        sa.Column('api_key', sa.Text(), nullable=False),
        sa.Column('enabled', sa.Boolean(), nullable=True, default=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('provider'),
    )


def downgrade() -> None:
    op.drop_table('api_keys')
    op.drop_column('exercises', 'workoutx_id')
    op.drop_column('exercises', 'source')
    op.drop_column('exercises', 'muscle_groups')
