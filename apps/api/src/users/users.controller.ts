import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { RequirePermissions, RbacGuard } from '../authorization/authorization.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { UsersService } from './users.service';

interface OperatorRequest extends Request {
  user: {
    role: string;
    organizationId: string | null;
  };
}

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @RequirePermissions('users:read')
  @UseGuards(JwtAuthGuard, RbacGuard)
  findAll(@Req() request: OperatorRequest) {
    return this.usersService.findAll(request.user);
  }

  @Get(':id')
  @RequirePermissions('users:read')
  @UseGuards(JwtAuthGuard, RbacGuard)
  findOne(@Param('id', ParseUUIDPipe) id: string, @Req() request: OperatorRequest) {
    return this.usersService.findOne(id, request.user);
  }

  @Post()
  @RequirePermissions('users:write')
  @UseGuards(JwtAuthGuard, RbacGuard)
  create(
    @Body()
    payload: {
      firstName: string;
      lastName: string;
      email: string;
      role?: string;
      accountType?: string;
      phone?: string;
      organization?: { id: string };
      password: string;
    },
    @Req() request: OperatorRequest,
  ) {
    return this.usersService.create(payload, request.user);
  }
}
