INSERT INTO organizations (
    code, name, slug, description, timezone, country_code, default_locale, active, mfa_required
)
VALUES (
    'NEYD', 'NEYD Kenya', 'neyd', 'NEYD service desk organization',
    'Africa/Nairobi', 'KE', 'en-KE', TRUE, TRUE
)
ON CONFLICT (slug) DO UPDATE SET active = TRUE;

WITH neyd AS (
    SELECT id FROM organizations WHERE slug = 'neyd'
)
INSERT INTO departments (name, description, organization_id)
SELECT departments.name, departments.description, neyd.id
FROM neyd
CROSS JOIN (VALUES
    ('Information Technology', 'Service desk and infrastructure operations'),
    ('Finance', 'Finance and procurement'),
    ('Human Resources', 'People operations')
) AS departments(name, description)
WHERE NOT EXISTS (
    SELECT 1
    FROM departments existing
    WHERE existing.organization_id = neyd.id AND existing.name = departments.name
);

WITH neyd AS (
    SELECT id FROM organizations WHERE slug = 'neyd'
)
INSERT INTO users (
    first_name, last_name, email, role, account_type, status, email_verified, active, organization_id
)
SELECT people.first_name, people.last_name, people.email, people.role,
       'administrator', 'active', TRUE, TRUE, neyd.id
FROM neyd
CROSS JOIN (VALUES
    ('System', 'Administrator', 'admin@neyd.local', 'super-administrator'),
    ('Service', 'Manager', 'manager@neyd.local', 'it-support-manager'),
    ('Support', 'Agent', 'agent@neyd.local', 'it-support-agent')
) AS people(first_name, last_name, email, role)
ON CONFLICT (email) DO UPDATE SET
    first_name = EXCLUDED.first_name,
    last_name = EXCLUDED.last_name,
    role = EXCLUDED.role,
    active = TRUE,
    organization_id = EXCLUDED.organization_id;
