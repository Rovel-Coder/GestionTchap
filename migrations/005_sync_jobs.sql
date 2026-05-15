CREATE TABLE IF NOT EXISTS sync_jobs (
    id TEXT PRIMARY KEY,
    status TEXT NOT NULL DEFAULT 'pending',
    total INTEGER NOT NULL DEFAULT 0,
    done INTEGER NOT NULL DEFAULT 0,
    current_salon TEXT DEFAULT NULL,
    invited INTEGER NOT NULL DEFAULT 0,
    reinvited INTEGER NOT NULL DEFAULT 0,
    kicked INTEGER NOT NULL DEFAULT 0,
    errors JSONB NOT NULL DEFAULT '[]',
    params JSONB NOT NULL DEFAULT '{}',
    started_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_sync_jobs_started ON sync_jobs (started_at DESC);
