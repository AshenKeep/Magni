"""initial

Revision ID: 0001
Revises:
Create Date: 2026-04-23

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = '0001'
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'users',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('email', sa.String(length=255), nullable=False),
        sa.Column('hashed_password', sa.String(length=255), nullable=False),
        sa.Column('display_name', sa.String(length=100), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('is_active', sa.Boolean(), nullable=True),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_users_email'), 'users', ['email'], unique=True)

    op.create_table(
        'exercises',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('user_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('name', sa.String(length=200), nullable=False),
        sa.Column('muscle_group', sa.String(length=100), nullable=True),
        sa.Column('equipment', sa.String(length=100), nullable=True),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ),
        sa.PrimaryKeyConstraint('id'),
    )

    op.create_table(
        'workouts',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('user_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('title', sa.String(length=200), nullable=True),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('started_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('ended_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('duration_seconds', sa.Integer(), nullable=True),
        sa.Column('avg_heart_rate', sa.Integer(), nullable=True),
        sa.Column('max_heart_rate', sa.Integer(), nullable=True),
        sa.Column('calories_burned', sa.Integer(), nullable=True),
        sa.Column('garmin_activity_id', sa.String(length=100), nullable=True),
        sa.Column('client_id', sa.String(length=100), nullable=True),
        sa.Column('synced_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('client_id'),
    )

    op.create_table(
        'workout_sets',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('workout_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('exercise_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('set_number', sa.Integer(), nullable=False),
        sa.Column('reps', sa.Integer(), nullable=True),
        sa.Column('weight_kg', sa.Float(), nullable=True),
        sa.Column('duration_seconds', sa.Integer(), nullable=True),
        sa.Column('distance_m', sa.Float(), nullable=True),
        sa.Column('rpe', sa.Integer(), nullable=True),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('logged_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('client_id', sa.String(length=100), nullable=True),
        sa.ForeignKeyConstraint(['exercise_id'], ['exercises.id'], ),
        sa.ForeignKeyConstraint(['workout_id'], ['workouts.id'], ),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('client_id'),
    )

    op.create_table(
        'daily_stats',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('user_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('date', sa.DateTime(timezone=True), nullable=False),
        sa.Column('steps', sa.Integer(), nullable=True),
        sa.Column('distance_m', sa.Float(), nullable=True),
        sa.Column('active_calories', sa.Integer(), nullable=True),
        sa.Column('total_calories', sa.Integer(), nullable=True),
        sa.Column('resting_hr', sa.Integer(), nullable=True),
        sa.Column('avg_stress', sa.Integer(), nullable=True),
        sa.Column('floors_climbed', sa.Integer(), nullable=True),
        sa.Column('active_minutes', sa.Integer(), nullable=True),
        sa.Column('sleep_seconds', sa.Integer(), nullable=True),
        sa.Column('sleep_score', sa.Integer(), nullable=True),
        sa.Column('garmin_synced_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ),
        sa.PrimaryKeyConstraint('id'),
    )

    op.create_table(
        'hr_readings',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('user_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('workout_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('recorded_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('bpm', sa.Integer(), nullable=False),
        sa.Column('source', sa.String(length=50), nullable=True),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ),
        sa.ForeignKeyConstraint(['workout_id'], ['workouts.id'], ),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_hr_readings_recorded_at'), 'hr_readings', ['recorded_at'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_hr_readings_recorded_at'), table_name='hr_readings')
    op.drop_table('hr_readings')
    op.drop_table('daily_stats')
    op.drop_table('workout_sets')
    op.drop_table('workouts')
    op.drop_table('exercises')
    op.drop_index(op.f('ix_users_email'), table_name='users')
    op.drop_table('users')
