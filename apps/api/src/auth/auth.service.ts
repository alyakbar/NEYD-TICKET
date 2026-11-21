import { Injectable, InternalServerErrorException, UnauthorizedException } from '@nestjs/common';
import * as jwt from 'jsonwebtoken';
import { UsersService } from '../users/users.service';
import { verifyPassword } from './password.util';

@Injectable()
export class AuthService {
  constructor(private readonly usersService: UsersService) {}

  async login(payload: { email: string; password: string }) {
    if (!payload?.email || !payload.password) {
      throw new UnauthorizedException('Email and password are required.');
    }

    const user = await this.usersService.findByEmail(payload.email.trim().toLowerCase());
    if (!user || !user.active || !user.passwordHash || !verifyPassword(payload.password, user.passwordHash)) {
      throw new UnauthorizedException('Invalid credentials.');
    }

    const secret = process.env.JWT_SECRET;
    if (!secret) {
      throw new InternalServerErrorException('JWT_SECRET must be configured before operator login is enabled.');
    }

    const expiresAt = Date.now() + 8 * 60 * 60 * 1000;
    const token = jwt.sign(
      {
        sub: user.id,
        email: user.email,
        role: user.role ?? 'standard-employee',
        organizationId: user.organization?.id ?? null,
      },
      secret,
      { expiresIn: '8h' },
    );

    return {
      ok: true,
      accessToken: token,
      tokenType: 'Bearer',
      expiresAt: new Date(expiresAt).toISOString(),
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        organization: user.organization?.name ?? 'NEYD Kenya',
        mfaEnabled: user.mfaEnabled,
      },
    };
  }
}
