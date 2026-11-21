ALTER TABLE event_registrations
    ADD COLUMN IF NOT EXISTS ticket_code UUID,
    ADD COLUMN IF NOT EXISTS ticket_email_status VARCHAR(16) NOT NULL DEFAULT 'not_sent',
    ADD COLUMN IF NOT EXISTS ticket_email_attempted_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS ticket_email_sent_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS ticket_email_error TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_event_registrations_ticket_code
    ON event_registrations (ticket_code)
    WHERE ticket_code IS NOT NULL;

ALTER TABLE event_registrations
    ADD CONSTRAINT chk_event_registration_ticket_email_status
        CHECK (ticket_email_status IN ('not_sent', 'sending', 'sent', 'failed'));
