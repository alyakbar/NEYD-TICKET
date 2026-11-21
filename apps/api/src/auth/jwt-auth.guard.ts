import { CanActivate, ExecutionContext, Injectable, InternalServerErrorException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import * as jwt from 'jsonwebtoken';
import { PUBLIC_KEY } from '../authorization/authorization.constants';

export interface OperatorClaims extends jwt.JwtPayload {
  sub: string;
  email: string;
  role: string;
  organizationId: string | null;
}

export function authenticateOperatorRequest(request: Request & { user?: OperatorClaims }): OperatorClaims {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new InternalServerErrorException('JWT_SECRET must be configured before operator endpoints can be used.');
  }

  const authorization = request.headers.authorization ?? '';
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
  if (!token) {
    throw new UnauthorizedException('A bearer access token is required.');
  }

  try {
    const claims = jwt.verify(token, secret, { algorithms: ['HS256'] }) as OperatorClaims;
    if (!claims.sub || !claims.email || !claims.role) {
      throw new UnauthorizedException('The access token is missing operator claims.');
    }
    request.user = claims;
    return claims;
  } catch (error) {
    if (error instanceof UnauthorizedException) {
      throw error;
    }
    throw new UnauthorizedException('The access token is invalid or expired.');
  }
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(PUBLIC_KEY, [context.getHandler(), context.getClass()]);
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request & { user?: OperatorClaims }>();
    authenticateOperatorRequest(request);
    return true;
  }
}
