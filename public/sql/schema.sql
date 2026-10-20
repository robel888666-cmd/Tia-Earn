
-- ==================================================
-- TIA EARN TELEGRAM MINI APP
-- DATABASE: PostgreSQL
-- FILE: sql/schema.sql
-- VERSION: 1.0
-- ==================================================

BEGIN;

-- ==========================================
-- 1. USERS
-- ==========================================

CREATE TABLE IF NOT EXISTS users (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    telegram_id BIGINT NOT NULL UNIQUE,

    first_name VARCHAR(100) NOT NULL DEFAULT '',

    username VARCHAR(100) NOT NULL DEFAULT '',

    referrer_id BIGINT REFERENCES users(id)
        ON DELETE SET NULL,

    status VARCHAR(20) NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'blocked')),

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CHECK (telegram_id > 0),
    CHECK (referrer_id IS NULL OR referrer_id <> id)
);

CREATE INDEX IF NOT EXISTS idx_users_referrer
ON users(referrer_id);

CREATE INDEX IF NOT EXISTS idx_users_status
ON users(status);

CREATE INDEX IF NOT EXISTS idx_users_created
ON users(created_at DESC);


-- ==========================================
-- 2. WALLETS
-- ==========================================

CREATE TABLE IF NOT EXISTS wallets (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    user_id BIGINT NOT NULL UNIQUE
        REFERENCES users(id) ON DELETE RESTRICT,

    balance NUMERIC(18,2) NOT NULL DEFAULT 0
        CHECK (balance >= 0),

    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wallets_user
ON wallets(user_id);


-- ==========================================
-- 3. WALLET LEDGER
-- ==========================================

CREATE TABLE IF NOT EXISTS ledger (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    user_id BIGINT NOT NULL
        REFERENCES users(id) ON DELETE RESTRICT,

    type VARCHAR(50) NOT NULL,

    amount NUMERIC(18,2) NOT NULL,

    reference VARCHAR(160) NOT NULL UNIQUE,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CHECK (amount <> 0)
);

CREATE INDEX IF NOT EXISTS idx_ledger_user
ON ledger(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ledger_type
ON ledger(type);

CREATE INDEX IF NOT EXISTS idx_ledger_created
ON ledger(created_at DESC);


-- ==========================================
-- 4. ADMIN SETTINGS
-- ==========================================

CREATE TABLE IF NOT EXISTS settings (
    key VARCHAR(100) PRIMARY KEY,

    value TEXT NOT NULL,

    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO settings (key, value)
VALUES
    ('minWithdrawal', '100'),
    ('withdrawalFeePercent', '5'),
    ('dailyAdLimit', '30'),
    ('adCooldownSeconds', '30'),
    ('referralBonus', '0'),
    ('referralCommissionPercent', '0'),
    ('officialChannel', ''),
    ('supportLink', '')
ON CONFLICT (key) DO NOTHING;


-- ==========================================
-- 5. AD SESSIONS
-- ==========================================

CREATE TABLE IF NOT EXISTS ad_sessions (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    user_id BIGINT NOT NULL
        REFERENCES users(id) ON DELETE RESTRICT,

    network VARCHAR(30) NOT NULL
        CHECK (network IN (
            'monetag',
            'adsgram',
            'gigapub'
        )),

    status VARCHAR(30) NOT NULL DEFAULT 'pending'
        CHECK (status IN (
            'pending',
            'verified',
            'rejected',
            'expired'
        )),

    provider_event_id VARCHAR(200) UNIQUE,

    reward NUMERIC(18,2) NOT NULL DEFAULT 0
        CHECK (reward >= 0),

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    verified_at TIMESTAMPTZ,

    expires_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_ads_user_date
ON ad_sessions(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ads_status
ON ad_sessions(status);

CREATE INDEX IF NOT EXISTS idx_ads_network
ON ad_sessions(network);


-- ==========================================
-- 6. TASKS
-- ==========================================

CREATE TABLE IF NOT EXISTS tasks (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    title VARCHAR(160) NOT NULL,

    description TEXT NOT NULL DEFAULT '',

    reward NUMERIC(18,2) NOT NULL DEFAULT 0
        CHECK (reward >= 0),

    active BOOLEAN NOT NULL DEFAULT TRUE,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tasks_active
ON tasks(active);


-- ==========================================
-- 7. TASK SUBMISSIONS
-- ==========================================

CREATE TABLE IF NOT EXISTS task_submissions (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    task_id BIGINT NOT NULL
        REFERENCES tasks(id) ON DELETE RESTRICT,

    user_id BIGINT NOT NULL
        REFERENCES users(id) ON DELETE RESTRICT,

    status VARCHAR(20) NOT NULL DEFAULT 'pending'
        CHECK (status IN (
            'pending',
            'approved',
            'rejected'
        )),

    submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    reviewed_at TIMESTAMPTZ,

    UNIQUE (task_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_task_submissions_user
ON task_submissions(user_id);

CREATE INDEX IF NOT EXISTS idx_task_submissions_status
ON task_submissions(status);


-- ==========================================
-- 8. WITHDRAWALS
-- ==========================================

CREATE TABLE IF NOT EXISTS withdrawals (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    user_id BIGINT NOT NULL
        REFERENCES users(id) ON DELETE RESTRICT,

    method VARCHAR(20) NOT NULL
        CHECK (method IN ('bkash', 'binance')),

    account VARCHAR(120) NOT NULL,

    amount NUMERIC(18,2) NOT NULL
        CHECK (amount > 0),

    fee NUMERIC(18,2) NOT NULL DEFAULT 0
        CHECK (fee >= 0 AND fee <= amount),

    status VARCHAR(20) NOT NULL DEFAULT 'pending'
        CHECK (status IN (
            'pending',
            'paid',
            'rejected'
        )),

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    reviewed_at TIMESTAMPTZ,

    reviewed_by BIGINT REFERENCES users(id)
        ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_withdrawals_user
ON withdrawals(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_withdrawals_status
ON withdrawals(status);

CREATE INDEX IF NOT EXISTS idx_withdrawals_created
ON withdrawals(created_at DESC);


-- ==========================================
-- 9. AUDIT LOGS
-- ==========================================

CREATE TABLE IF NOT EXISTS audit_logs (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    actor_id BIGINT REFERENCES users(id)
        ON DELETE SET NULL,

    action VARCHAR(120) NOT NULL,

    details JSONB NOT NULL DEFAULT '{}'::jsonb,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_actor
ON audit_logs(actor_id);

CREATE INDEX IF NOT EXISTS idx_audit_created
ON audit_logs(created_at DESC);


-- ==========================================
-- 10. REFERRAL REWARDS
-- ==========================================

CREATE TABLE IF NOT EXISTS referral_rewards (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    referrer_id BIGINT NOT NULL
        REFERENCES users(id) ON DELETE RESTRICT,

    referred_user_id BIGINT NOT NULL
        REFERENCES users(id) ON DELETE RESTRICT,

    reward_type VARCHAR(30) NOT NULL
        CHECK (reward_type IN ('bonus', 'commission')),

    source_reference VARCHAR(160) NOT NULL,

    amount NUMERIC(18,2) NOT NULL
        CHECK (amount > 0),

    status VARCHAR(20) NOT NULL DEFAULT 'pending'
        CHECK (status IN (
            'pending',
            'approved',
            'rejected'
        )),

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE (reward_type, source_reference),

    CHECK (referrer_id <> referred_user_id)
);

CREATE INDEX IF NOT EXISTS idx_referral_rewards_referrer
ON referral_rewards(referrer_id);


-- ==========================================
-- 11. FRAUD FLAGS
-- ==========================================

CREATE TABLE IF NOT EXISTS fraud_flags (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    user_id BIGINT NOT NULL
        REFERENCES users(id) ON DELETE RESTRICT,

    reason VARCHAR(160) NOT NULL,

    details JSONB NOT NULL DEFAULT '{}'::jsonb,

    severity VARCHAR(20) NOT NULL DEFAULT 'medium'
        CHECK (severity IN ('low', 'medium', 'high')),

    status VARCHAR(20) NOT NULL DEFAULT 'open'
        CHECK (status IN (
            'open',
            'reviewed',
            'dismissed'
        )),

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fraud_flags_user
ON fraud_flags(user_id);

CREATE INDEX IF NOT EXISTS idx_fraud_flags_status
ON fraud_flags(status);


-- ==========================================
-- 12. PAYMENT PROVIDER RECORDS
-- ==========================================

CREATE TABLE IF NOT EXISTS payment_records (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    withdrawal_id BIGINT NOT NULL UNIQUE
        REFERENCES withdrawals(id) ON DELETE RESTRICT,

    provider VARCHAR(30) NOT NULL,

    provider_transaction_id VARCHAR(200) UNIQUE,

    status VARCHAR(30) NOT NULL DEFAULT 'pending'
        CHECK (status IN (
            'pending',
            'processing',
            'completed',
            'failed'
        )),

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    completed_at TIMESTAMPTZ
);


-- ==========================================
-- 13. DATABASE VERSION
-- ==========================================

CREATE TABLE IF NOT EXISTS schema_versions (
    version VARCHAR(30) PRIMARY KEY,

    installed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO schema_versions(version)
VALUES ('1.0')
ON CONFLICT(version) DO NOTHING;


-- ==========================================
-- 14. AUTOMATIC WALLET TIMESTAMP
-- ==========================================

CREATE OR REPLACE FUNCTION update_wallet_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS wallet_updated_trigger
ON wallets;

CREATE TRIGGER wallet_updated_trigger
BEFORE UPDATE ON wallets
FOR EACH ROW
EXECUTE FUNCTION update_wallet_timestamp();


-- ==========================================
-- 15. AUTOMATIC SETTINGS TIMESTAMP
-- ==========================================

CREATE OR REPLACE FUNCTION update_settings_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS settings_updated_trigger
ON settings;

CREATE TRIGGER settings_updated_trigger
BEFORE UPDATE ON settings
FOR EACH ROW
EXECUTE FUNCTION update_settings_timestamp();


COMMIT;

-- END OF TIA EARN DATABASE SCHEMA
