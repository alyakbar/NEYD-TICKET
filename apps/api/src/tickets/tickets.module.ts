import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TicketsController } from './tickets.controller';
import { TicketsService } from './tickets.service';
import { Ticket } from './ticket.entity';
import { TicketWorkflowService } from './ticket-workflow.service';
import { User } from '../users/user.entity';
import { Organization } from '../organizations/organization.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Ticket, User, Organization])],
  controllers: [TicketsController],
  providers: [TicketsService, TicketWorkflowService],
  exports: [TicketsService, TicketWorkflowService],
})
export class TicketsModule {}
