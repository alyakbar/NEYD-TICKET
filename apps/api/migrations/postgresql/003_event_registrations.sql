CREATE TABLE IF NOT EXISTS events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug VARCHAR(255) NOT NULL UNIQUE,
  title VARCHAR(255) NOT NULL,
  date VARCHAR(255),
  location VARCHAR(255),
  price_ksh INTEGER NOT NULL DEFAULT 0,
  description TEXT,
  highlights TEXT[],
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS event_registrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  full_name VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL,
  phone VARCHAR(255) NOT NULL,
  company VARCHAR(255),
  role VARCHAR(255),
  ticket_type VARCHAR(255) NOT NULL DEFAULT 'General Admission',
  expectations TEXT,
  dietary_requirements TEXT,
  agree BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO events (slug, title, date, location, price_ksh, description, highlights)
VALUES
  (
    'community-summit',
    'NEYD Community Summit',
    '24 October 2026',
    'KICC, Nairobi',
    3000,
    'A full-day gathering for founders, operators, and ecosystem leaders focused on scaling ideas into real impact.',
    ARRAY['Keynotes', 'Networking', 'Startup demos']
  ),
  (
    'product-lab',
    'Product Lab Workshop',
    '7 November 2026',
    'Westlands Hub',
    2500,
    'Learn practical product thinking, customer discovery, and roadmap prioritization in a guided workshop.',
    ARRAY['Live exercises', 'Facilitated by mentors', 'Small group sessions']
  ),
  (
    'founder-breakfast',
    'Founder Breakfast',
    '21 November 2026',
    'The Waterfront',
    1800,
    'An intimate breakfast for founders and operators who want honest conversations, peer learning, and warm introductions.',
    ARRAY['Peer roundtables', 'Investor access', 'Coffee & breakfast']
  )
ON CONFLICT (slug) DO NOTHING;
