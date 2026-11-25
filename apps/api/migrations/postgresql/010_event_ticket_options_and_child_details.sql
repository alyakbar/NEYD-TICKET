ALTER TABLE events
    ADD COLUMN IF NOT EXISTS ticket_options TEXT;

UPDATE events
SET ticket_options = json_build_array(
    json_build_object(
        'name', 'General Admission',
        'priceKsh', price_ksh,
        'requiresChildDetails', false
    ),
    json_build_object(
        'name', 'Parent',
        'priceKsh', NULL,
        'requiresChildDetails', false
    ),
    json_build_object(
        'name', 'Parent + Child',
        'priceKsh', NULL,
        'requiresChildDetails', true
    ),
    json_build_object(
        'name', 'Child',
        'priceKsh', NULL,
        'requiresChildDetails', true
    )
)::text
WHERE ticket_options IS NULL;

ALTER TABLE event_registrations
    ADD COLUMN IF NOT EXISTS child_name VARCHAR(120),
    ADD COLUMN IF NOT EXISTS child_age INTEGER;

ALTER TABLE event_registrations
    ADD CONSTRAINT event_registrations_child_age_range
    CHECK (child_age IS NULL OR child_age BETWEEN 0 AND 17);
