import { CanActivate, ExecutionContext, ForbiddenException, Injectable, SetMetadata, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { authenticateOperatorRequest, OperatorClaims } from '../auth/jwt-auth.guard';
import { DEFAULT_ROLE_PERMISSIONS, REQUIRED_ABAC_POLICY, REQUIRED_PERMISSIONS, PUBLIC_KEY } from './authorization.constants';

export const Public = () => SetMetadata(PUBLIC_KEY, true);
export const RequirePermissions = (...permissions: string[]) => SetMetadata(REQUIRED_PERMISSIONS, permissions);
export const RequireAbacRule = (policy: string, context: Record<string, any> = {}) => SetMetadata(REQUIRED_ABAC_POLICY, { policy, context });

@Injectable()
export class RbacGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(PUBLIC_KEY, [context.getHandler(), context.getClass()]);
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request & { user?: OperatorClaims }>();
    const requiredPermissions = this.reflector.getAllAndOverride<string[]>(REQUIRED_PERMISSIONS, [context.getHandler(), context.getClass()]) ?? [];

    if (requiredPermissions.length === 0) {
      return true;
    }

    const user = request.user ?? authenticateOperatorRequest(request);
    const role = String(user.role ?? '').toLowerCase();
    if (!role) {
      throw new UnauthorizedException('A verified operator identity is required.');
    }

    const permissions = new Set<string>(DEFAULT_ROLE_PERMISSIONS[role as keyof typeof DEFAULT_ROLE_PERMISSIONS] ?? []);

    if (!requiredPermissions.every((permission) => permissions.has(permission))) {
      throw new ForbiddenException('Your role does not have permission to perform this action.');
    }

    return true;
  }
}

@Injectable()
export class AbacGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request & { user?: OperatorClaims }>();
    const rule = this.reflector.getAllAndOverride<{ policy: string; context: Record<string, any> }>(REQUIRED_ABAC_POLICY, [context.getHandler(), context.getClass()]);

    if (!rule) {
      return true;
    }

    const user = request.user ?? authenticateOperatorRequest(request);

    const policyContext = {
      ...rule.context,
    };

    if (!this.matchesPolicy(user, rule.policy, policyContext)) {
      throw new ForbiddenException('The requested resource is outside your access scope.');
    }

    return true;
  }

  private matchesPolicy(user: Record<string, any>, policy: string, context: Record<string, any>): boolean {
    if (!user || !policy) {
      return false;
    }

    switch (policy) {
      case 'tenant-isolation':
        return user.role === 'super-administrator' ||
          (Boolean(user.organizationId) && (!context.organizationId || user.organizationId === context.organizationId));
      case 'department-scope':
        return user.role === 'super-administrator' ||
          (Boolean(user.departmentId) && (!context.departmentId || user.departmentId === context.departmentId));
      case 'self-service':
        return Boolean(context.requesterEmail) && (user.email === context.requesterEmail || user.role === 'super-administrator');
      default:
        return false;
    }
  }
}
