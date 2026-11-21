import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Ticket } from '../tickets/ticket.entity';
import { EventRegistration } from '../event-registrations/event-registration.entity';
import { EventTicketEmailService } from '../event-registrations/event-ticket-email.service';
import { Payment } from './payment.entity';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';

@Module({
  imports: [TypeOrmModule.forFeature([Payment, Ticket, EventRegistration])],
  controllers: [PaymentsController],
  providers: [PaymentsService, EventTicketEmailService],
  exports: [PaymentsService],
})
export class PaymentsModule {}
