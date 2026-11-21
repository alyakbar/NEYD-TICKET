import { Injectable } from '@nestjs/common';
import { DEFAULT_ROLE_PERMISSIONS } from './authorization.constants';

@Injectable()
export class AuthorizationService {
  getRolePermissions(role: string): string[] {
    const normalizedRole = (role ?? '').toLowerCase();
    return [...(DEFAULT_ROLE_PERMISSIONS[normalizedRole as keyof typeof DEFAULT_ROLE_PERMISSIONS] ?? [])];
  }

  canReadTickets(role: string): boolean {
    return this.getRolePermissions(role).includes('tickets:read');
  }

  canWriteTickets(role: string): boolean {
    return this.getRolePermissions(role).includes('tickets:write');
  }

  canAssignTickets(role: string): boolean {
    return this.getRolePermissions(role).includes('tickets:assign');
  }

  canEscalateTickets(role: string): boolean {
    return this.getRolePermissions(role).includes('tickets:escalate');
  }

  matchAbacPolicy(user: Record<string, any> | undefined, policy: string, context: Record<string, any> = {}): boolean {
    if (!user) {
      return false;
    }

    switch (policy) {
      case 'tenant-isolation':
        return user.role === 'super-administrator' ||
          (Boolean(user.organizationId) && Boolean(context.organizationId) && user.organizationId === context.organizationId);
      case 'department-scope':
        return user.role === 'super-administrator' ||
          (Boolean(user.departmentId) && Boolean(context.departmentId) && user.departmentId === context.departmentId);
      case 'self-service':
        return Boolean(context.requesterEmail) && (user.email === context.requesterEmail || user.role === 'super-administrator');
      default:
        return false;
    }
  }
}
