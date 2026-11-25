ALTER TABLE event_registrations
    ADD COLUMN IF NOT EXISTS ticket_selections TEXT,
    ADD COLUMN IF NOT EXISTS amount_ksh INTEGER;

UPDATE event_registrations AS registration
SET amount_ksh = e.price_ksh
FROM events AS e
WHERE registration.event_id = e.id
  AND registration.amount_ksh IS NULL;

UPDATE events AS e
SET ticket_options = COALESCE(updated.options, '[]'::jsonb)::text
FROM (
    SELECT source_event.id AS event_id, jsonb_agg(
        jsonb_set(
            jsonb_set(ticket_option, '{pricingMode}', to_jsonb('per_person'::text), true),
            '{peoplePerTicket}', to_jsonb(1), true
        ) ORDER BY ordinal
    ) FILTER (WHERE lower(ticket_option ->> 'name') <> 'parent + child') AS options
    FROM events AS source_event
    CROSS JOIN LATERAL jsonb_array_elements(source_event.ticket_options::jsonb)
        WITH ORDINALITY AS option_rows(ticket_option, ordinal)
    WHERE source_event.ticket_options IS NOT NULL
    GROUP BY source_event.id
) AS updated
WHERE e.id = updated.event_id;

DO $$
DECLARE
    constraint_name TEXT;
BEGIN
    FOR constraint_name IN
        SELECT conname
        FROM pg_constraint
        WHERE conrelid = 'event_registrations'::regclass
          AND confrelid = 'events'::regclass
          AND contype = 'f'
    LOOP
        EXECUTE format('ALTER TABLE event_registrations DROP CONSTRAINT %I', constraint_name);
    END LOOP;

    ALTER TABLE event_registrations
        ADD CONSTRAINT event_registrations_event_id_delete_restrict
        FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE RESTRICT;
END $$;
