import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service';
import { Public } from '../authorization/authorization.guard';
import { JwtAuthGuard } from './jwt-auth.guard';

@Controller('auth')
@UseGuards(JwtAuthGuard)
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @Public()
  login(@Body() payload: { email: string; password: string }) {
    return this.authService.login(payload);
  }

  @Get('me')
  me(@Req() req: { user: { sub: string; email: string; role: string; organizationId: string | null } }) {
    return {
      authenticated: true,
      user: req.user,
    };
  }
}
