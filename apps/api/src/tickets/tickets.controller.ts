import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { AbacGuard, Public, RbacGuard, RequireAbacRule, RequirePermissions } from '../authorization/authorization.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TicketsService } from './tickets.service';

interface OperatorRequest extends Request {
  user: {
    role: string;
    organizationId: string | null;
  };
}

@Controller('tickets')
export class TicketsController {
  constructor(private readonly ticketsService: TicketsService) {}

  @Get()
  @RequirePermissions('tickets:read')
  @RequireAbacRule('tenant-isolation')
  @UseGuards(JwtAuthGuard, RbacGuard, AbacGuard)
  findAll(@Req() request: OperatorRequest) {
    return this.ticketsService.findAll(request.user);
  }

  @Post()
  @Public()
  create(
    @Body()
    payload: {
      title: string;
      description: string;
      priority?: string;
      category?: string;
      requesterName?: string;
      requesterEmail?: string;
      phone?: string;
      department?: string;
      serviceArea?: string;
      organization?: { id: string };
      purchaseType?: string;
      hardware?: string;
    },
  ) {
    return this.ticketsService.create(payload);
  }

  @Patch(':id/approve')
  @RequirePermissions('tickets:approve')
  @UseGuards(JwtAuthGuard, RbacGuard)
  approve(@Param('id', ParseUUIDPipe) id: string, @Req() request: OperatorRequest) {
    return this.ticketsService.approve(id, request.user);
  }

  @Patch(':id/assign')
  @RequirePermissions('tickets:assign')
  @UseGuards(JwtAuthGuard, RbacGuard)
  assign(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() payload: { assigneeEmail: string },
    @Req() request: OperatorRequest,
  ) {
    return this.ticketsService.assign(id, payload.assigneeEmail, request.user);
  }
}
