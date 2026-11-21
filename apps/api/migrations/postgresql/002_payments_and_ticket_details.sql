ALTER TABLE tickets
    ADD COLUMN IF NOT EXISTS phone VARCHAR(32),
    ADD COLUMN IF NOT EXISTS department VARCHAR(150),
    ADD COLUMN IF NOT EXISTS purchase_type VARCHAR(64),
    ADD COLUMN IF NOT EXISTS hardware VARCHAR(255);

ALTER TABLE tickets
    ALTER COLUMN status_history TYPE TEXT USING status_history::text;

CREATE UNIQUE INDEX IF NOT EXISTS idx_departments_organization_name
    ON departments (organization_id, name);

CREATE TABLE IF NOT EXISTS payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
    catalog_item VARCHAR(64) NOT NULL,
    amount_ksh NUMERIC(10, 2) NOT NULL CHECK (amount_ksh > 0),
    currency VARCHAR(16) NOT NULL DEFAULT 'KES',
    status VARCHAR(16) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'paid', 'failed')),
    phone_number VARCHAR(32) NOT NULL,
    merchant_request_id VARCHAR(128),
    checkout_request_id VARCHAR(128) UNIQUE,
    mpesa_receipt_number VARCHAR(64),
    result_code INTEGER,
    result_description TEXT,
    callback_data TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payments_ticket_id ON payments (ticket_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments (status);
