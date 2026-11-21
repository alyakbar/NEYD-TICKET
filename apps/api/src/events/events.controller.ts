import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { Public, RequirePermissions, RbacGuard } from '../authorization/authorization.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CreateEventDto, EventsService, UpdateEventDto } from './events.service';

@Controller('events')
export class EventsController {
  constructor(private readonly eventsService: EventsService) {}

  @Get()
  @Public()
  findAll() {
    return this.eventsService.findAll();
  }

  @Get('admin')
  @RequirePermissions('events:read')
  @UseGuards(JwtAuthGuard, RbacGuard)
  findAllForAdmin() {
    return this.eventsService.findAllForAdmin();
  }

  @Post()
  @RequirePermissions('events:write')
  @UseGuards(JwtAuthGuard, RbacGuard)
  create(@Body() payload: CreateEventDto) {
    return this.eventsService.create(payload);
  }

  @Patch(':id')
  @RequirePermissions('events:write')
  @UseGuards(JwtAuthGuard, RbacGuard)
  update(@Param('id', ParseUUIDPipe) id: string, @Body() payload: UpdateEventDto) {
    return this.eventsService.update(id, payload);
  }

  @Patch(':id/archive')
  @RequirePermissions('events:write')
  @UseGuards(JwtAuthGuard, RbacGuard)
  archive(@Param('id', ParseUUIDPipe) id: string) {
    return this.eventsService.archive(id);
  }

  @Patch(':id/restore')
  @RequirePermissions('events:write')
  @UseGuards(JwtAuthGuard, RbacGuard)
  restore(@Param('id', ParseUUIDPipe) id: string) {
    return this.eventsService.restore(id);
  }
}
