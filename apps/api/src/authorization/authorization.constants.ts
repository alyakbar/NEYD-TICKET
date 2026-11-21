export const PUBLIC_KEY = 'isPublic';
export const REQUIRED_PERMISSIONS = 'requiredPermissions';
export const REQUIRED_ABAC_POLICY = 'requiredAbacPolicy';

export const DEFAULT_ROLE_PERMISSIONS = {
  'super-administrator': ['tickets:read', 'tickets:write', 'tickets:assign', 'tickets:approve', 'tickets:escalate', 'users:read', 'users:write', 'departments:read', 'departments:write', 'organizations:write', 'audit:read', 'event-registrations:read', 'event-registrations:write', 'events:read', 'events:write'],
  'organization-admin': ['tickets:read', 'tickets:write', 'tickets:assign', 'tickets:approve', 'tickets:escalate', 'users:read', 'users:write', 'departments:read', 'departments:write', 'event-registrations:read', 'event-registrations:write', 'events:read', 'events:write'],
  'it-director': ['tickets:read', 'tickets:write', 'tickets:assign', 'tickets:approve', 'tickets:escalate', 'reports:read', 'audit:read'],
  'department-head': ['tickets:read', 'tickets:write', 'tickets:assign', 'tickets:approve', 'reports:read'],
  'it-support-manager': ['tickets:read', 'tickets:write', 'tickets:assign', 'tickets:approve', 'tickets:escalate', 'reports:read'],
  'it-support-agent': ['tickets:read', 'tickets:write', 'tickets:assign'],
  'standard-employee': ['tickets:read', 'tickets:write'],
  'auditor': ['audit:read', 'tickets:read'],
  'read-only-user': ['tickets:read'],
} as const;
