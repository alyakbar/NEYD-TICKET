import { Body, Controller, Get, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { IsUUID } from 'class-validator';
import { Public } from '../authorization/authorization.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PaymentsService } from './payments.service';

class InitiateEventPaymentDto {
  @IsUUID()
  registrationId: string;
}

@Controller('payments')
@UseGuards(JwtAuthGuard)
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Get('catalog')
  @Public()
  getCatalog() {
    return this.paymentsService.getCatalog();
  }

  @Post('stk-push')
  @Public()
  initiate(@Body() payload: { ticketId: string; phoneNumber: string; catalogItem: string }) {
    return this.paymentsService.initiateStkPush(payload.ticketId, payload.phoneNumber, payload.catalogItem);
  }

  @Post('event-stk-push')
  @Public()
  initiateEventPayment(@Body() payload: InitiateEventPaymentDto) {
    return this.paymentsService.initiateEventRegistrationStkPush(payload.registrationId);
  }

  @Get('event-registration/:registrationId/status')
  @Public()
  eventRegistrationStatus(@Param('registrationId', ParseUUIDPipe) registrationId: string) {
    return this.paymentsService.getEventRegistrationPaymentStatus(registrationId);
  }

  @Post(':id/ticket-email/retry')
  @Public()
  retryTicketEmail(@Param('id', ParseUUIDPipe) id: string) {
    return this.paymentsService.retryEventTicketEmail(id);
  }

  @Post(':id/reconcile')
  @Public()
  reconcile(@Param('id', ParseUUIDPipe) id: string) {
    return this.paymentsService.reconcileStkPayment(id);
  }

  @Post('callback/:token')
  @Public()
  callback(@Param('token') token: string, @Body() body: unknown) {
    return this.paymentsService.receiveCallback(token, body);
  }

  @Get(':id/status')
  @Public()
  status(@Param('id', ParseUUIDPipe) id: string) {
    return this.paymentsService.getStatus(id);
  }
}
