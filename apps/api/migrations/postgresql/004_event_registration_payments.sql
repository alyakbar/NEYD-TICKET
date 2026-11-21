ALTER TABLE payments
    ALTER COLUMN ticket_id DROP NOT NULL,
    ADD COLUMN IF NOT EXISTS event_registration_id UUID REFERENCES event_registrations(id) ON DELETE CASCADE;

ALTER TABLE event_registrations
    ADD COLUMN IF NOT EXISTS payment_status VARCHAR(16) NOT NULL DEFAULT 'unpaid'
        CHECK (payment_status IN ('unpaid', 'pending', 'paid', 'failed'));

ALTER TABLE payments
    ADD CONSTRAINT chk_payments_single_subject
        CHECK (
            (ticket_id IS NOT NULL AND event_registration_id IS NULL)
            OR (ticket_id IS NULL AND event_registration_id IS NOT NULL)
        );

CREATE INDEX IF NOT EXISTS idx_payments_event_registration_id
    ON payments (event_registration_id);
