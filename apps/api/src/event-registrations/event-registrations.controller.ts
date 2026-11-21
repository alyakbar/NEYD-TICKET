import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { Public, RequirePermissions, RbacGuard } from '../authorization/authorization.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CreateEventRegistrationDto, EventRegistrationsService, UpdateEventRegistrationDto } from './event-registrations.service';

@Controller('event-registrations')
export class EventRegistrationsController {
  constructor(private readonly eventRegistrationsService: EventRegistrationsService) {}

  @Get('count')
  @Public()
  count() {
    return this.eventRegistrationsService.count();
  }

  @Get()
  @RequirePermissions('event-registrations:read')
  @UseGuards(JwtAuthGuard, RbacGuard)
  findAll() {
    return this.eventRegistrationsService.findAll();
  }

  @Patch(':id')
  @RequirePermissions('event-registrations:write')
  @UseGuards(JwtAuthGuard, RbacGuard)
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() payload: UpdateEventRegistrationDto,
  ) {
    return this.eventRegistrationsService.update(id, payload);
  }

  @Post()
  create(@Body() payload: CreateEventRegistrationDto) {
    return this.eventRegistrationsService.create(payload);
  }
}
