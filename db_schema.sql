CREATE TABLE users (
    id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    email         TEXT        NOT NULL UNIQUE,
    username      TEXT        NOT NULL UNIQUE,
    password_hash TEXT        NOT NULL,
    first_name    TEXT        NOT NULL,
    last_name     TEXT        NOT NULL,
    photo         TEXT,
    language      TEXT        NOT NULL,
    theme         TEXT        NOT NULL,
    is_active     BOOLEAN     NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE user_profiles (
    user_id          UUID    PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    company_name     TEXT,
    industry         TEXT,
    company_size     TEXT,
    position         TEXT,
    profile_complete BOOLEAN NOT NULL,
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE refresh_tokens (
    id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash TEXT        NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE password_reset_tokens (
    id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token      TEXT        NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    used       BOOLEAN     NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE analyses (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type                TEXT        NOT NULL,
    title               TEXT,
    status              TEXT        NOT NULL,
    snapshot_name       TEXT,
    snapshot_company    TEXT,
    snapshot_industry   TEXT,
    extends_analysis_id UUID        REFERENCES analyses(id) ON DELETE SET NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at        TIMESTAMPTZ
);

CREATE INDEX idx_analyses_user_type  ON analyses(user_id, type);
CREATE INDEX idx_analyses_status     ON analyses(status);
CREATE INDEX idx_analyses_extends    ON analyses(extends_analysis_id);
CREATE UNIQUE INDEX uq_analyses_user_title ON analyses(user_id, title) WHERE title IS NOT NULL;

CREATE TABLE swot_results (
    analysis_id    UUID PRIMARY KEY REFERENCES analyses(id) ON DELETE CASCADE,
    activity       TEXT,
    s_scores       JSONB,
    w_scores       JSONB,
    o_scores       JSONB,
    t_scores       JSONB,
    criteria       JSONB,
    user_answers   JSONB,
    manual_weights JSONB,
    mode           TEXT
);

CREATE TABLE abc_xyz_sessions (
    analysis_id     UUID  PRIMARY KEY REFERENCES analyses(id) ON DELETE CASCADE,
    period_label    TEXT,
    abc_thresholds  JSONB NOT NULL
);

CREATE TABLE abc_xyz_items (
    id             UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
    analysis_id    UUID    NOT NULL REFERENCES analyses(id) ON DELETE CASCADE,
    name           TEXT    NOT NULL,
    quantity       NUMERIC NOT NULL,
    unit_cost      NUMERIC NOT NULL,
    sales_value    NUMERIC,
    share_pct      NUMERIC(8,4),
    cumulative_pct NUMERIC(8,4),
    cv             NUMERIC(8,4),
    abc_class      TEXT,
    xyz_class      TEXT,
    category       TEXT,
    sort_order     INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX idx_abc_items_analysis ON abc_xyz_items(analysis_id);

CREATE TABLE eisenhower_tasks (
    id          UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
    analysis_id UUID    NOT NULL REFERENCES analyses(id) ON DELETE CASCADE,
    title       TEXT    NOT NULL,
    quadrant    INTEGER,
    is_done     BOOLEAN NOT NULL DEFAULT FALSE,
    sort_order  INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX idx_eisenhower_analysis ON eisenhower_tasks(analysis_id);

CREATE TABLE schedule_tasks (
    id          UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
    analysis_id UUID    NOT NULL REFERENCES analyses(id) ON DELETE CASCADE,
    parent_id   UUID    REFERENCES schedule_tasks(id),
    title       TEXT    NOT NULL,
    responsible TEXT,
    category    TEXT,
    start_date  DATE    NOT NULL,
    end_date    DATE    NOT NULL,
    progress    INTEGER NOT NULL DEFAULT 0,
    color       TEXT,
    depends_on  UUID[],
    sort_order  INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX idx_schedule_analysis ON schedule_tasks(analysis_id);

CREATE TABLE punktowa_sessions (
    analysis_id UUID    PRIMARY KEY REFERENCES analyses(id) ON DELETE CASCADE,
    scale_min   INTEGER NOT NULL DEFAULT 1,
    scale_max   INTEGER NOT NULL DEFAULT 5
);

CREATE TABLE punktowa_criteria (
    id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    analysis_id UUID         NOT NULL REFERENCES analyses(id) ON DELETE CASCADE,
    name        TEXT         NOT NULL,
    weight      NUMERIC(5,4) NOT NULL,
    sort_order  INTEGER      NOT NULL DEFAULT 0
);

CREATE TABLE punktowa_subjects (
    id          UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
    analysis_id UUID    NOT NULL REFERENCES analyses(id) ON DELETE CASCADE,
    name        TEXT    NOT NULL,
    sort_order  INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE punktowa_scores (
    id           UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    analysis_id  UUID         NOT NULL REFERENCES analyses(id) ON DELETE CASCADE,
    criterion_id UUID         NOT NULL REFERENCES punktowa_criteria(id) ON DELETE CASCADE,
    subject_id   UUID         NOT NULL REFERENCES punktowa_subjects(id) ON DELETE CASCADE,
    score        NUMERIC(5,2) NOT NULL,
    UNIQUE(criterion_id, subject_id)
);

CREATE INDEX idx_punktowa_scores ON punktowa_scores(analysis_id);

CREATE TABLE punktowa_results (
    id             UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    analysis_id    UUID         NOT NULL REFERENCES analyses(id) ON DELETE CASCADE,
    subject_id     UUID         NOT NULL REFERENCES punktowa_subjects(id) ON DELETE CASCADE,
    avg_arithmetic NUMERIC(6,4),
    avg_weighted   NUMERIC(6,4),
    percentage     NUMERIC(6,2),
    rank           INTEGER,
    UNIQUE(analysis_id, subject_id)
);

CREATE TABLE audyt_sessions (
    analysis_id              UUID         PRIMARY KEY REFERENCES analyses(id) ON DELETE CASCADE,
    scale_min                INTEGER      NOT NULL DEFAULT 1,
    scale_max                INTEGER      NOT NULL DEFAULT 10,
    num_auditors             INTEGER      NOT NULL DEFAULT 5,
    score_red_threshold      NUMERIC(4,1) NOT NULL DEFAULT 6,
    criterion_acceptance_pct NUMERIC(5,2) NOT NULL DEFAULT 59,
    system_acceptance_pct    NUMERIC(5,2) NOT NULL DEFAULT 55
);

CREATE TABLE audyt_criteria (
    id          UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
    analysis_id UUID    NOT NULL REFERENCES analyses(id) ON DELETE CASCADE,
    name        TEXT    NOT NULL,
    sort_order  INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX idx_audyt_criteria ON audyt_criteria(analysis_id);

CREATE TABLE audyt_scores (
    id             UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    analysis_id    UUID         NOT NULL REFERENCES analyses(id) ON DELETE CASCADE,
    criterion_id   UUID         NOT NULL REFERENCES audyt_criteria(id) ON DELETE CASCADE,
    auditor_number INTEGER      NOT NULL,
    score          NUMERIC(5,2) NOT NULL,
    UNIQUE(criterion_id, auditor_number)
);

CREATE INDEX idx_audyt_scores ON audyt_scores(analysis_id);

CREATE TABLE audyt_results (
    id           UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    analysis_id  UUID         NOT NULL REFERENCES analyses(id) ON DELETE CASCADE,
    criterion_id UUID         NOT NULL REFERENCES audyt_criteria(id) ON DELETE CASCADE,
    sum_score    NUMERIC(7,2),
    avg_score    NUMERIC(7,4),
    percentage   NUMERIC(5,2),
    accepted     BOOLEAN,
    UNIQUE(analysis_id, criterion_id)
);
