ALTER TABLE events
    ALTER COLUMN highlights TYPE TEXT
    USING CASE
        WHEN highlights IS NULL THEN NULL
        ELSE to_json(highlights)::TEXT
    END;
