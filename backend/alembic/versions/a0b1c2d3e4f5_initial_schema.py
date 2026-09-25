from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = 'a0b1c2d3e4f5'
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table('users',
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('email', sa.Text(), nullable=False),
    sa.Column('username', sa.Text(), nullable=False),
    sa.Column('password_hash', sa.Text(), nullable=False),
    sa.Column('first_name', sa.Text(), nullable=False),
    sa.Column('last_name', sa.Text(), nullable=False),
    sa.Column('photo', sa.Text(), nullable=True),
    sa.Column('language', sa.Text(), nullable=False),
    sa.Column('theme', sa.Text(), nullable=False),
    sa.Column('is_active', sa.Boolean(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('email'),
    sa.UniqueConstraint('username')
    )
    op.create_table('analyses',
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('user_id', sa.UUID(), nullable=False),
    sa.Column('type', sa.Text(), nullable=False),
    sa.Column('title', sa.Text(), nullable=True),
    sa.Column('status', sa.Text(), nullable=False),
    sa.Column('snapshot_name', sa.Text(), nullable=True),
    sa.Column('snapshot_company', sa.Text(), nullable=True),
    sa.Column('snapshot_industry', sa.Text(), nullable=True),
    sa.Column('extends_analysis_id', sa.UUID(), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('completed_at', sa.DateTime(timezone=True), nullable=True),
    sa.ForeignKeyConstraint(['extends_analysis_id'], ['analyses.id'], ondelete='SET NULL'),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index('idx_analyses_extends', 'analyses', ['extends_analysis_id'], unique=False)
    op.create_index('idx_analyses_status', 'analyses', ['status'], unique=False)
    op.create_index('idx_analyses_user_type', 'analyses', ['user_id', 'type'], unique=False)
    op.create_index(
        'uq_analyses_user_title', 'analyses', ['user_id', 'title'],
        unique=True, postgresql_where=sa.text('title IS NOT NULL'),
    )
    op.create_table('password_reset_tokens',
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('user_id', sa.UUID(), nullable=False),
    sa.Column('token', sa.Text(), nullable=False),
    sa.Column('expires_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('used', sa.Boolean(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('token')
    )
    op.create_table('refresh_tokens',
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('user_id', sa.UUID(), nullable=False),
    sa.Column('token_hash', sa.Text(), nullable=False),
    sa.Column('expires_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_table('user_profiles',
    sa.Column('user_id', sa.UUID(), nullable=False),
    sa.Column('company_name', sa.Text(), nullable=True),
    sa.Column('industry', sa.Text(), nullable=True),
    sa.Column('company_size', sa.Text(), nullable=True),
    sa.Column('position', sa.Text(), nullable=True),
    sa.Column('profile_complete', sa.Boolean(), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('user_id')
    )
    op.create_table('abc_xyz_items',
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('analysis_id', sa.UUID(), nullable=False),
    sa.Column('name', sa.Text(), nullable=False),
    sa.Column('quantity', sa.Numeric(), nullable=False),
    sa.Column('unit_cost', sa.Numeric(), nullable=False),
    sa.Column('sales_value', sa.Numeric(), nullable=True),
    sa.Column('share_pct', sa.Numeric(precision=8, scale=4), nullable=True),
    sa.Column('cumulative_pct', sa.Numeric(precision=8, scale=4), nullable=True),
    sa.Column('cv', sa.Numeric(precision=8, scale=4), nullable=True),
    sa.Column('abc_class', sa.Text(), nullable=True),
    sa.Column('xyz_class', sa.Text(), nullable=True),
    sa.Column('category', sa.Text(), nullable=True),
    sa.Column('sort_order', sa.Integer(), nullable=False),
    sa.ForeignKeyConstraint(['analysis_id'], ['analyses.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index('idx_abc_items_analysis', 'abc_xyz_items', ['analysis_id'], unique=False)
    op.create_table('abc_xyz_sessions',
    sa.Column('analysis_id', sa.UUID(), nullable=False),
    sa.Column('period_label', sa.Text(), nullable=True),
    sa.Column('abc_thresholds', postgresql.JSONB(astext_type=sa.Text()), nullable=False),
    sa.ForeignKeyConstraint(['analysis_id'], ['analyses.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('analysis_id')
    )
    op.create_table('eisenhower_tasks',
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('analysis_id', sa.UUID(), nullable=False),
    sa.Column('title', sa.Text(), nullable=False),
    sa.Column('quadrant', sa.Integer(), nullable=True),
    sa.Column('is_done', sa.Boolean(), nullable=False),
    sa.Column('sort_order', sa.Integer(), nullable=False),
    sa.ForeignKeyConstraint(['analysis_id'], ['analyses.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index('idx_eisenhower_analysis', 'eisenhower_tasks', ['analysis_id'], unique=False)
    op.create_table('punktowa_criteria',
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('analysis_id', sa.UUID(), nullable=False),
    sa.Column('name', sa.Text(), nullable=False),
    sa.Column('weight', sa.Numeric(precision=5, scale=4), nullable=False),
    sa.Column('sort_order', sa.Integer(), nullable=False),
    sa.ForeignKeyConstraint(['analysis_id'], ['analyses.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_table('punktowa_sessions',
    sa.Column('analysis_id', sa.UUID(), nullable=False),
    sa.Column('scale_min', sa.Integer(), nullable=False),
    sa.Column('scale_max', sa.Integer(), nullable=False),
    sa.ForeignKeyConstraint(['analysis_id'], ['analyses.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('analysis_id')
    )
    op.create_table('punktowa_subjects',
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('analysis_id', sa.UUID(), nullable=False),
    sa.Column('name', sa.Text(), nullable=False),
    sa.Column('sort_order', sa.Integer(), nullable=False),
    sa.ForeignKeyConstraint(['analysis_id'], ['analyses.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_table('schedule_tasks',
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('analysis_id', sa.UUID(), nullable=False),
    sa.Column('parent_id', sa.UUID(), nullable=True),
    sa.Column('title', sa.Text(), nullable=False),
    sa.Column('responsible', sa.Text(), nullable=True),
    sa.Column('category', sa.Text(), nullable=True),
    sa.Column('start_date', sa.Date(), nullable=False),
    sa.Column('end_date', sa.Date(), nullable=False),
    sa.Column('progress', sa.Integer(), nullable=False),
    sa.Column('color', sa.Text(), nullable=True),
    sa.Column('depends_on', sa.ARRAY(sa.UUID()), nullable=True),
    sa.Column('sort_order', sa.Integer(), nullable=False),
    sa.ForeignKeyConstraint(['analysis_id'], ['analyses.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['parent_id'], ['schedule_tasks.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index('idx_schedule_analysis', 'schedule_tasks', ['analysis_id'], unique=False)
    op.create_table('swot_results',
    sa.Column('analysis_id', sa.UUID(), nullable=False),
    sa.Column('activity', sa.Text(), nullable=True),
    sa.Column('s_scores', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    sa.Column('w_scores', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    sa.Column('o_scores', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    sa.Column('t_scores', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    sa.Column('criteria', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    sa.Column('user_answers', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    sa.Column('manual_weights', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    sa.Column('mode', sa.Text(), nullable=True),
    sa.ForeignKeyConstraint(['analysis_id'], ['analyses.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('analysis_id')
    )
    op.create_table('punktowa_results',
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('analysis_id', sa.UUID(), nullable=False),
    sa.Column('subject_id', sa.UUID(), nullable=False),
    sa.Column('avg_arithmetic', sa.Numeric(precision=6, scale=4), nullable=True),
    sa.Column('avg_weighted', sa.Numeric(precision=6, scale=4), nullable=True),
    sa.Column('percentage', sa.Numeric(precision=6, scale=2), nullable=True),
    sa.Column('rank', sa.Integer(), nullable=True),
    sa.ForeignKeyConstraint(['analysis_id'], ['analyses.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['subject_id'], ['punktowa_subjects.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('analysis_id', 'subject_id')
    )
    op.create_table('punktowa_scores',
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('analysis_id', sa.UUID(), nullable=False),
    sa.Column('criterion_id', sa.UUID(), nullable=False),
    sa.Column('subject_id', sa.UUID(), nullable=False),
    sa.Column('score', sa.Numeric(precision=5, scale=2), nullable=False),
    sa.ForeignKeyConstraint(['analysis_id'], ['analyses.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['criterion_id'], ['punktowa_criteria.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['subject_id'], ['punktowa_subjects.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('criterion_id', 'subject_id')
    )
    op.create_index('idx_punktowa_scores', 'punktowa_scores', ['analysis_id'], unique=False)
    op.create_table('audyt_sessions',
    sa.Column('analysis_id', sa.UUID(), nullable=False),
    sa.Column('scale_min', sa.Integer(), nullable=False, server_default='1'),
    sa.Column('scale_max', sa.Integer(), nullable=False, server_default='10'),
    sa.Column('num_auditors', sa.Integer(), nullable=False, server_default='5'),
    sa.Column('score_red_threshold', sa.Numeric(4, 1), nullable=False, server_default='6'),
    sa.Column('criterion_acceptance_pct', sa.Numeric(5, 2), nullable=False, server_default='59'),
    sa.Column('system_acceptance_pct', sa.Numeric(5, 2), nullable=False, server_default='55'),
    sa.ForeignKeyConstraint(['analysis_id'], ['analyses.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('analysis_id'),
    )
    op.create_table('audyt_criteria',
    sa.Column('id', sa.UUID(), nullable=False, server_default=sa.text('gen_random_uuid()')),
    sa.Column('analysis_id', sa.UUID(), nullable=False),
    sa.Column('name', sa.Text(), nullable=False),
    sa.Column('sort_order', sa.Integer(), nullable=False, server_default='0'),
    sa.ForeignKeyConstraint(['analysis_id'], ['analyses.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('idx_audyt_criteria', 'audyt_criteria', ['analysis_id'], unique=False)
    op.create_table('audyt_scores',
    sa.Column('id', sa.UUID(), nullable=False, server_default=sa.text('gen_random_uuid()')),
    sa.Column('analysis_id', sa.UUID(), nullable=False),
    sa.Column('criterion_id', sa.UUID(), nullable=False),
    sa.Column('auditor_number', sa.Integer(), nullable=False),
    sa.Column('score', sa.Numeric(5, 2), nullable=False),
    sa.ForeignKeyConstraint(['analysis_id'], ['analyses.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['criterion_id'], ['audyt_criteria.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('criterion_id', 'auditor_number', name='uq_audyt_score_criterion_auditor'),
    )
    op.create_index('idx_audyt_scores', 'audyt_scores', ['analysis_id'], unique=False)
    op.create_table('audyt_results',
    sa.Column('id', sa.UUID(), nullable=False, server_default=sa.text('gen_random_uuid()')),
    sa.Column('analysis_id', sa.UUID(), nullable=False),
    sa.Column('criterion_id', sa.UUID(), nullable=False),
    sa.Column('sum_score', sa.Numeric(7, 2), nullable=True),
    sa.Column('avg_score', sa.Numeric(7, 4), nullable=True),
    sa.Column('percentage', sa.Numeric(5, 2), nullable=True),
    sa.Column('accepted', sa.Boolean(), nullable=True),
    sa.ForeignKeyConstraint(['analysis_id'], ['analyses.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['criterion_id'], ['audyt_criteria.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('analysis_id', 'criterion_id', name='uq_audyt_result_analysis_criterion'),
    )


def downgrade() -> None:
    op.drop_table('audyt_results')
    op.drop_index('idx_audyt_scores', table_name='audyt_scores')
    op.drop_table('audyt_scores')
    op.drop_index('idx_audyt_criteria', table_name='audyt_criteria')
    op.drop_table('audyt_criteria')
    op.drop_table('audyt_sessions')
    op.drop_index('idx_punktowa_scores', table_name='punktowa_scores')
    op.drop_table('punktowa_scores')
    op.drop_table('punktowa_results')
    op.drop_table('swot_results')
    op.drop_index('idx_schedule_analysis', table_name='schedule_tasks')
    op.drop_table('schedule_tasks')
    op.drop_table('punktowa_subjects')
    op.drop_table('punktowa_sessions')
    op.drop_table('punktowa_criteria')
    op.drop_index('idx_eisenhower_analysis', table_name='eisenhower_tasks')
    op.drop_table('eisenhower_tasks')
    op.drop_table('abc_xyz_sessions')
    op.drop_index('idx_abc_items_analysis', table_name='abc_xyz_items')
    op.drop_table('abc_xyz_items')
    op.drop_table('user_profiles')
    op.drop_table('refresh_tokens')
    op.drop_table('password_reset_tokens')
    op.drop_index('uq_analyses_user_title', table_name='analyses')
    op.drop_index('idx_analyses_user_type', table_name='analyses')
    op.drop_index('idx_analyses_status', table_name='analyses')
    op.drop_index('idx_analyses_extends', table_name='analyses')
    op.drop_table('analyses')
    op.drop_table('users')
