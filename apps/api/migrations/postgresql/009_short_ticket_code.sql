ALTER TABLE event_registrations
    ALTER COLUMN ticket_code TYPE VARCHAR(100) USING ticket_code::text;

