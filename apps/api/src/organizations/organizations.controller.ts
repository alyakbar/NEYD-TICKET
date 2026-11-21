import { Body, Controller, ForbiddenException, Get, Post, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { Public, RequirePermissions, RbacGuard } from '../authorization/authorization.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { OrganizationsService } from './organizations.service';

interface OperatorRequest extends Request {
  user: {
    role: string;
    organizationId: string | null;
  };
}

@Controller('organizations')
export class OrganizationsController {
  constructor(private readonly organizationsService: OrganizationsService) {}

  @Get('public')
  @Public()
  findPublic() {
    return this.organizationsService.findPublic();
  }

  @Get()
  @RequirePermissions('tickets:read')
  @UseGuards(JwtAuthGuard, RbacGuard)
  findAll(@Req() request: OperatorRequest) {
    return this.organizationsService.findAll(request.user);
  }

  @Post()
  @RequirePermissions('organizations:write')
  @UseGuards(JwtAuthGuard, RbacGuard)
  create(
    @Body() payload: { name: string; slug: string; code?: string; timezone?: string; countryCode?: string },
    @Req() request: OperatorRequest,
  ) {
    if (request.user.role !== 'super-administrator') {
      throw new ForbiddenException('Only a super administrator can create organizations.');
    }
    return this.organizationsService.create(payload);
  }
}
