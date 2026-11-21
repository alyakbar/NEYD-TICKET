CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE organizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(32) NOT NULL UNIQUE,
    name VARCHAR(255) NOT NULL UNIQUE,
    slug VARCHAR(100) NOT NULL UNIQUE,
    description TEXT,
    website VARCHAR(255),
    timezone VARCHAR(64) NOT NULL DEFAULT 'Africa/Nairobi',
    country_code VARCHAR(8) NOT NULL DEFAULT 'KE',
    default_locale VARCHAR(16) NOT NULL DEFAULT 'en-KE',
    active BOOLEAN NOT NULL DEFAULT TRUE,
    mfa_required BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id VARCHAR(64),
    first_name VARCHAR(128) NOT NULL,
    last_name VARCHAR(128) NOT NULL,
    email VARCHAR(255) NOT NULL UNIQUE,
    phone VARCHAR(32),
    password_hash VARCHAR(255),
    role VARCHAR(64) NOT NULL DEFAULT 'standard-employee',
    account_type VARCHAR(64) NOT NULL DEFAULT 'employee',
    status VARCHAR(32) NOT NULL DEFAULT 'active',
    email_verified BOOLEAN NOT NULL DEFAULT FALSE,
    mfa_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    locale VARCHAR(16) NOT NULL DEFAULT 'en-KE',
    last_login_at TIMESTAMPTZ,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE
);

CREATE TABLE departments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(150) NOT NULL,
    description TEXT,
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE
);

CREATE TABLE tickets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'new',
    priority VARCHAR(32) NOT NULL DEFAULT 'medium',
    severity VARCHAR(32) NOT NULL DEFAULT 'medium',
    category VARCHAR(64) NOT NULL DEFAULT 'general',
    service_area VARCHAR(64) NOT NULL DEFAULT 'it-service',
    requester_name VARCHAR(128),
    requester_email VARCHAR(255),
    assignee VARCHAR(128),
    sla_hours INTEGER NOT NULL DEFAULT 8,
    sla_deadline TIMESTAMPTZ,
    first_response_at TIMESTAMPTZ,
    resolved_at TIMESTAMPTZ,
    status_history JSONB,
    escalated BOOLEAN NOT NULL DEFAULT FALSE,
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_users_organization ON users (organization_id);
CREATE INDEX idx_departments_organization ON departments (organization_id);
CREATE INDEX idx_tickets_organization ON tickets (organization_id);
CREATE INDEX idx_tickets_status ON tickets (status);
CREATE INDEX idx_tickets_priority ON tickets (priority);
