import { BadRequestException, ConflictException, ForbiddenException, HttpException, HttpStatus, Injectable, NotFoundException, OnModuleInit, ServiceUnavailableException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { isUUID } from 'class-validator';
import { timingSafeEqual } from 'node:crypto';
import { Repository } from 'typeorm';
import { EventRegistration } from '../event-registrations/event-registration.entity';
import { EventTicketEmailService } from '../event-registrations/event-ticket-email.service';
import { Ticket } from '../tickets/ticket.entity';
import { Payment } from './payment.entity';

interface CatalogItem {
  code: string;
  label: string;
  amountKsh: number;
}

interface DarajaStkResponse {
  MerchantRequestID?: string;
  CheckoutRequestID?: string;
  ResponseCode?: string;
  ResponseDescription?: string;
  errorMessage?: string;
}

interface DarajaStkQueryResponse {
  CheckoutRequestID?: string;
  ResponseCode?: string;
  ResponseDescription?: string;
  ResultCode?: string | number | null;
  ResultDesc?: string;
  errorMessage?: string;
}

class DarajaRateLimitException extends HttpException {
  constructor(
    message: string,
    readonly retryAfterSeconds: number,
    details: Record<string, unknown> = {},
  ) {
    super({ message, retryAfterSeconds, ...details }, HttpStatus.TOO_MANY_REQUESTS);
  }
}

@Injectable()
export class PaymentsService implements OnModuleInit {
  private cachedAccessToken?: { token: string; expiresAt: number };
  private readonly eventPaymentStartCooldowns = new Map<string, number>();
  private readonly reconciliationCooldowns = new Map<string, number>();
  private nextDarajaQueryAt = 0;

  constructor(
    @InjectRepository(Payment)
    private readonly paymentsRepository: Repository<Payment>,
    @InjectRepository(Ticket)
    private readonly ticketsRepository: Repository<Ticket>,
    @InjectRepository(EventRegistration)
    private readonly registrationsRepository: Repository<EventRegistration>,
    private readonly eventTicketEmailService: EventTicketEmailService,
  ) {}

  onModuleInit() {
    if (process.env.NODE_ENV === 'production') {
      this.darajaConfiguration();
    }
  }

  getCatalog() {
    const catalog = this.catalog();
    if (catalog.length > 0) {
      this.darajaConfiguration();
    }
    return catalog.map(({ code, label, amountKsh }) => ({ code, label, amountKsh, currency: 'KES' }));
  }

  async initiateStkPush(ticketId: string, phoneNumber: string, catalogItemCode: string) {
    if (!isUUID(ticketId)) {
      throw new BadRequestException('A valid ticket ID is required.');
    }
    const ticket = await this.ticketsRepository.findOneBy({ id: ticketId });
    if (!ticket) {
      throw new NotFoundException(`Ticket ${ticketId} was not found.`);
    }
    if (ticket.status !== 'awaiting-payment') {
      throw new ConflictException('This ticket is not awaiting payment.');
    }

    const catalogItem = this.catalog().find((item) => item.code === catalogItemCode);
    if (!catalogItem) {
      throw new BadRequestException('The selected item is not available in the server payment catalog.');
    }
    if (ticket.purchaseType !== catalogItem.code) {
      throw new BadRequestException('The payment item must match the item selected for this ticket.');
    }
    const normalizedPhone = this.normalizePhone(phoneNumber);
    const existingPending = await this.paymentsRepository.findOne({
      where: { ticket: { id: ticket.id }, status: 'pending' },
      order: { createdAt: 'DESC' },
    });
    if (existingPending) {
      if (existingPending.phoneNumber !== normalizedPhone || existingPending.catalogItem !== catalogItem.code) {
        throw new ConflictException('A payment request is already pending for this ticket.');
      }
      return {
        paymentId: existingPending.id,
        ticketId: ticket.id,
        status: existingPending.status,
        amountKsh: Number(existingPending.amountKsh),
        currency: existingPending.currency,
        checkoutRequestId: existingPending.checkoutRequestId,
        message: 'A payment prompt is already pending for this ticket.',
      };
    }
    const payment = await this.paymentsRepository.save(
      this.paymentsRepository.create({
        ticket,
        catalogItem: catalogItem.code,
        amountKsh: catalogItem.amountKsh.toFixed(2),
        currency: 'KES',
        status: 'pending',
        phoneNumber: normalizedPhone,
      }),
    );

    try {
      await this.sendStkPush(
        payment,
        catalogItem.amountKsh,
        `NEYD${ticket.id.replaceAll('-', '').slice(0, 8)}`,
        'TicketPayment',
      );
      return {
        paymentId: payment.id,
        ticketId: ticket.id,
        status: payment.status,
        amountKsh: catalogItem.amountKsh,
        currency: 'KES',
        checkoutRequestId: payment.checkoutRequestId,
        message: 'A payment prompt has been sent to the supplied M-Pesa number.',
      };
    } catch (error) {
      throw await this.paymentStartError(error, payment);
    }
  }

  async initiateEventRegistrationStkPush(registrationId: string) {
    if (!isUUID(registrationId)) {
      throw new BadRequestException('A valid event registration ID is required.');
    }

    const registration = await this.registrationsRepository.findOne({
      where: { id: registrationId },
      relations: ['event'],
    });
    if (!registration) {
      throw new NotFoundException(`Event registration ${registrationId} was not found.`);
    }
    if (registration.paymentStatus === 'paid') {
      throw new ConflictException('This event registration has already been paid.');
    }

    const amountKsh = Number(registration.event.priceKsh);
    if (!Number.isInteger(amountKsh) || amountKsh < 1 || amountKsh > 250000) {
      throw new BadRequestException('The event price must be a whole KES amount between 1 and 250,000 to accept payment.');
    }

    const existingPending = await this.paymentsRepository.findOne({
      where: { eventRegistration: { id: registration.id }, status: 'pending' },
      order: { createdAt: 'DESC' },
    });
    if (existingPending) {
      return {
        paymentId: existingPending.id,
        registrationId: registration.id,
        status: existingPending.status,
        amountKsh: Number(existingPending.amountKsh),
        currency: existingPending.currency,
        checkoutRequestId: existingPending.checkoutRequestId,
        message: 'A payment prompt is already pending for this registration.',
      };
    }

    const now = Date.now();
    const retryAt = this.eventPaymentStartCooldowns.get(registration.id);
    if (retryAt && retryAt > now) {
      const retryAfterSeconds = Math.ceil((retryAt - now) / 1000);
      throw new DarajaRateLimitException(
        `M-Pesa is rate-limiting payment prompts. Wait ${retryAfterSeconds} seconds before retrying.`,
        retryAfterSeconds,
      );
    }
    if (retryAt) this.eventPaymentStartCooldowns.delete(registration.id);

    const phoneNumber = this.normalizePhone(registration.phone);
    const payment = await this.paymentsRepository.save(
      this.paymentsRepository.create({
        eventRegistration: registration,
        catalogItem: registration.event.slug.slice(0, 64),
        amountKsh: amountKsh.toFixed(2),
        currency: 'KES',
        status: 'pending',
        phoneNumber,
      }),
    );
    registration.paymentStatus = 'pending';
    await this.registrationsRepository.save(registration);

    try {
      await this.sendStkPush(
        payment,
        amountKsh,
        `EVT${registration.id.replaceAll('-', '').slice(0, 8)}`,
        'EventTicket',
      );
      return {
        paymentId: payment.id,
        registrationId: registration.id,
        status: payment.status,
        amountKsh,
        currency: 'KES',
        checkoutRequestId: payment.checkoutRequestId,
        message: 'A payment prompt has been sent to your M-Pesa number.',
      };
    } catch (error) {
      const startError = await this.paymentStartError(error, payment);
      if (payment.status === 'failed') {
        registration.paymentStatus = 'failed';
        await this.registrationsRepository.save(registration);
      }
      const retryAfterSeconds =
        startError instanceof DarajaRateLimitException ? startError.retryAfterSeconds : undefined;
      if (startError instanceof DarajaRateLimitException) {
        const cooldownSeconds = Math.max(60, retryAfterSeconds ?? 60);
        this.eventPaymentStartCooldowns.set(registration.id, Date.now() + cooldownSeconds * 1000);
      }
      const failure = {
        message: startError.message,
        paymentId: payment.id,
        status: payment.status,
        resultDescription: payment.resultDescription ?? startError.message,
        ...(retryAfterSeconds ? { retryAfterSeconds } : {}),
      };
      if (startError instanceof DarajaRateLimitException) {
        throw new DarajaRateLimitException(startError.message, retryAfterSeconds ?? 60, {
          paymentId: payment.id,
          status: payment.status,
          resultDescription: payment.resultDescription ?? startError.message,
        });
      }
      throw new ServiceUnavailableException(failure);
    }
  }

  async getEventRegistrationPaymentStatus(registrationId: string) {
    if (!isUUID(registrationId)) {
      throw new BadRequestException('A valid event registration ID is required.');
    }

    const payment = await this.paymentsRepository.findOne({
      where: { eventRegistration: { id: registrationId } },
      order: { createdAt: 'DESC' },
    });
    if (!payment) {
      throw new NotFoundException(`No payment was found for event registration ${registrationId}.`);
    }

    return this.getStatus(payment.id);
  }

  async reconcileStkPayment(id: string) {
    if (!isUUID(id)) {
      throw new BadRequestException('A valid payment ID is required.');
    }

    const payment = await this.paymentsRepository.findOne({
      where: { id },
      relations: ['ticket', 'eventRegistration'],
    });
    if (!payment) {
      throw new NotFoundException(`Payment ${id} was not found.`);
    }
    if (payment.status !== 'pending') {
      return this.getStatus(id);
    }
    if (!payment.checkoutRequestId) {
      throw new ConflictException('This payment has no Daraja checkout reference to verify.');
    }

    const now = Date.now();
    for (const [paymentId, nextAllowedAt] of this.reconciliationCooldowns) {
      if (nextAllowedAt <= now) this.reconciliationCooldowns.delete(paymentId);
    }
    const nextAllowedAt = Math.max(
      this.reconciliationCooldowns.get(payment.id) ?? 0,
      this.nextDarajaQueryAt,
    );
    if (now < nextAllowedAt) {
      const retryAfterSeconds = Math.ceil((nextAllowedAt - now) / 1000);
      throw new DarajaRateLimitException(
        'M-Pesa status was checked recently. Please wait before checking again.',
        retryAfterSeconds,
      );
    }
    this.reconciliationCooldowns.set(payment.id, now + 60_000);
    this.nextDarajaQueryAt = now + 10_000;

    const { shortCode, passkey } = this.darajaConfiguration();
    const timestamp = this.nairobiTimestamp();
    const password = Buffer.from(`${shortCode}${passkey}${timestamp}`).toString('base64');
    const markAsNotFound = async (description: string) => {
      await this.paymentsRepository.manager.transaction(async (manager) => {
        const update = await manager.getRepository(Payment).update(
          { id: payment.id, status: 'pending' },
          { status: 'failed', resultDescription: description },
        );
        if (update.affected && payment.eventRegistration) {
          await manager.getRepository(EventRegistration).update(
            { id: payment.eventRegistration.id },
            { paymentStatus: 'failed' },
          );
        }
      });
      return this.getStatus(payment.id);
    };

    let result: DarajaStkQueryResponse;
    try {
      result = await this.darajaRequest<DarajaStkQueryResponse>('/mpesa/stkpushquery/v1/query', {
        BusinessShortCode: shortCode,
        Password: password,
        Timestamp: timestamp,
        CheckoutRequestID: payment.checkoutRequestId,
      });
    } catch (error) {
      if (error instanceof DarajaRateLimitException) {
        this.reconciliationCooldowns.set(
          payment.id,
          Date.now() + Math.max(60, error.retryAfterSeconds) * 1000,
        );
        throw error;
      }
      if (error instanceof ServiceUnavailableException && /transaction does not exist/i.test(error.message)) {
        return markAsNotFound(error.message);
      }
      throw error;
    }

    if (String(result.ResponseCode) !== '0') {
      const description = result.errorMessage ?? result.ResponseDescription ?? 'Daraja could not verify this payment yet.';
      if (/transaction does not exist/i.test(description)) {
        return markAsNotFound(description);
      }
      throw new ServiceUnavailableException(description);
    }
    if (result.CheckoutRequestID && result.CheckoutRequestID !== payment.checkoutRequestId) {
      throw new ServiceUnavailableException('Daraja returned a different checkout reference while verifying payment.');
    }

    if (result.ResultCode !== undefined && result.ResultCode !== null && result.ResultCode !== '') {
      const resultCode = Number(result.ResultCode);
      if (!Number.isInteger(resultCode)) {
        throw new ServiceUnavailableException('Daraja returned an invalid payment result.');
      }

      const paid = resultCode === 0;
      await this.paymentsRepository.manager.transaction(async (manager) => {
        const update = await manager.getRepository(Payment).update(
          { id: payment.id, status: 'pending' },
          {
            resultCode,
            resultDescription: result.ResultDesc ?? result.ResponseDescription,
            status: paid ? 'paid' : 'failed',
          },
        );
        if (!update.affected) return;

        if (payment.eventRegistration) {
          await manager.getRepository(EventRegistration).update(
            { id: payment.eventRegistration.id },
            { paymentStatus: paid ? 'paid' : 'failed' },
          );
        }

        if (paid && payment.ticket?.status === 'awaiting-payment') {
          const statusHistory = [
            ...(Array.isArray(payment.ticket.statusHistory) ? payment.ticket.statusHistory : []),
            `${new Date().toISOString()}:new`,
          ];
          await manager.getRepository(Ticket).update(
            { id: payment.ticket.id, status: 'awaiting-payment' },
            { status: 'new', statusHistory },
          );
        }
      });
    }

    return this.getStatus(id);
  }

  async receiveCallback(callbackToken: string, body: unknown) {
    const expectedToken = process.env.MPESA_CALLBACK_TOKEN ?? '';
    const supplied = Buffer.from(callbackToken);
    const expected = Buffer.from(expectedToken);
    if (!expectedToken || supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
      throw new ForbiddenException('Invalid payment callback token.');
    }

    const callback = body as {
      Body?: {
        stkCallback?: {
          CheckoutRequestID?: string;
          ResultCode?: number;
          ResultDesc?: string;
          CallbackMetadata?: { Item?: Array<{ Name?: string; Value?: string | number }> };
        };
      };
    };
    const stkCallback = callback?.Body?.stkCallback;
    if (!stkCallback?.CheckoutRequestID || typeof stkCallback.ResultCode !== 'number') {
      throw new BadRequestException('The M-Pesa callback payload is invalid.');
    }

    const payment = await this.paymentsRepository.findOne({
      where: { checkoutRequestId: stkCallback.CheckoutRequestID },
      relations: ['ticket', 'eventRegistration'],
    });
    if (!payment) {
      throw new NotFoundException('The payment callback does not match an initiated payment.');
    }
    if (payment.status === 'paid' || payment.status === 'failed') {
      if (payment.status === 'paid' && payment.eventRegistration) {
        await this.eventTicketEmailService.sendPaidRegistrationTicket(payment.eventRegistration.id);
      }
      return { ResultCode: 0, ResultDesc: 'Callback already processed.' };
    }

    const metadata = new Map((stkCallback.CallbackMetadata?.Item ?? []).map((item) => [item.Name, item.Value]));
    const paid = stkCallback.ResultCode === 0;
    const receipt = metadata.get('MpesaReceiptNumber');
    if (paid) {
      const callbackAmount = metadata.get('Amount');
      const callbackPhone = metadata.get('PhoneNumber');
      if (
        Number(callbackAmount) !== Number(payment.amountKsh) ||
        typeof receipt !== 'string' ||
        !callbackPhone ||
        this.normalizePhone(String(callbackPhone)) !== payment.phoneNumber
      ) {
        throw new BadRequestException('The successful payment callback does not match the requested amount and phone number.');
      }
    }

    await this.paymentsRepository.manager.transaction(async (manager) => {
      const update = await manager.getRepository(Payment).update(
        { id: payment.id, status: 'pending' },
        {
          resultCode: stkCallback.ResultCode,
          resultDescription: stkCallback.ResultDesc,
          callbackData: JSON.stringify(callback),
          status: paid ? 'paid' : 'failed',
          mpesaReceiptNumber: typeof receipt === 'string' ? receipt : undefined,
        },
      );
      if (!update.affected) {
        return;
      }

      if (payment.eventRegistration) {
        await manager.getRepository(EventRegistration).update(
          { id: payment.eventRegistration.id },
          { paymentStatus: paid ? 'paid' : 'failed' },
        );
      }

      if (!paid || payment.ticket?.status !== 'awaiting-payment') return;

      payment.ticket.status = 'new';
      payment.ticket.statusHistory = [
        ...(Array.isArray(payment.ticket.statusHistory) ? payment.ticket.statusHistory : []),
        `${new Date().toISOString()}:new`,
      ];
      await manager.getRepository(Ticket).update(
        { id: payment.ticket.id, status: 'awaiting-payment' },
        { status: payment.ticket.status, statusHistory: payment.ticket.statusHistory },
      );
    });
    if (paid && payment.eventRegistration) {
      await this.eventTicketEmailService.sendPaidRegistrationTicket(payment.eventRegistration.id);
    }
    return { ResultCode: 0, ResultDesc: 'Accepted.' };
  }

  async getStatus(id: string) {
    let payment = await this.paymentsRepository.findOne({ where: { id }, relations: ['ticket', 'eventRegistration'] });
    if (!payment) {
      throw new NotFoundException(`Payment ${id} was not found.`);
    }
    if (payment.status === 'paid' && payment.eventRegistration) {
      await this.eventTicketEmailService.sendPaidRegistrationTicket(payment.eventRegistration.id);
      payment = await this.paymentsRepository.findOne({ where: { id }, relations: ['ticket', 'eventRegistration'] });
      if (!payment) {
        throw new NotFoundException(`Payment ${id} was not found.`);
      }
    }
    return {
      paymentId: payment.id,
      ticketId: payment.ticket?.id ?? null,
      registrationId: payment.eventRegistration?.id ?? null,
      status: payment.status,
      amountKsh: Number(payment.amountKsh),
      currency: payment.currency,
      receiptNumber: payment.mpesaReceiptNumber ?? null,
      resultDescription: payment.resultDescription ?? null,
      ticketCode: payment.eventRegistration?.ticketCode ?? null,
      ticketEmailStatus: payment.eventRegistration?.ticketEmailStatus ?? null,
      createdAt: payment.createdAt,
    };
  }

  async retryEventTicketEmail(paymentId: string) {
    if (!isUUID(paymentId)) {
      throw new BadRequestException('A valid payment ID is required.');
    }
    const payment = await this.paymentsRepository.findOne({
      where: { id: paymentId },
      relations: ['eventRegistration'],
    });
    if (!payment) {
      throw new NotFoundException(`Payment ${paymentId} was not found.`);
    }
    if (payment.status !== 'paid' || !payment.eventRegistration) {
      throw new ConflictException('A ticket email can only be retried after an event payment is confirmed.');
    }

    await this.eventTicketEmailService.retryPaidRegistrationTicket(payment.eventRegistration.id);
    return this.getStatus(paymentId);
  }

  private async sendStkPush(payment: Payment, amountKsh: number, accountReference: string, transactionDesc: string) {
    const { shortCode, passkey, callbackBaseUrl, callbackToken } = this.darajaConfiguration();
    const timestamp = this.nairobiTimestamp();
    const password = Buffer.from(`${shortCode}${passkey}${timestamp}`).toString('base64');
    const response = await this.darajaRequest<DarajaStkResponse>('/mpesa/stkpush/v1/processrequest', {
      BusinessShortCode: shortCode,
      Password: password,
      Timestamp: timestamp,
      TransactionType: process.env.MPESA_TRANSACTION_TYPE ?? 'CustomerPayBillOnline',
      Amount: amountKsh,
      PartyA: payment.phoneNumber,
      PartyB: shortCode,
      PhoneNumber: payment.phoneNumber,
      CallBackURL: `${callbackBaseUrl.replace(/\/+$/, '')}/${encodeURIComponent(callbackToken)}`,
      AccountReference: accountReference,
      TransactionDesc: transactionDesc,
    });

    if (String(response.ResponseCode) !== '0' || !response.CheckoutRequestID) {
      payment.status = 'failed';
      payment.resultDescription = response.ResponseDescription ?? response.errorMessage ?? 'Daraja did not accept the STK request.';
      await this.paymentsRepository.save(payment);
      throw new ServiceUnavailableException('M-Pesa did not accept the payment request. Please try again.');
    }

    payment.merchantRequestId = response.MerchantRequestID;
    payment.checkoutRequestId = response.CheckoutRequestID;
    payment.resultDescription = response.ResponseDescription;
    await this.paymentsRepository.save(payment);
  }

  private async paymentStartError(error: unknown, payment: Payment): Promise<Error> {
    if (payment.status === 'pending') {
      if (error instanceof ServiceUnavailableException || error instanceof DarajaRateLimitException) {
        payment.status = 'failed';
        payment.resultDescription = error.message || 'M-Pesa request could not be started.';
      } else {
        payment.resultDescription = 'Daraja response was not confirmed. Check payment status before attempting another charge.';
      }
      await this.paymentsRepository.save(payment);
    }

    if (
      error instanceof ServiceUnavailableException ||
      error instanceof BadRequestException ||
      error instanceof DarajaRateLimitException
    ) {
      return error;
    }
    return new ServiceUnavailableException('M-Pesa is temporarily unavailable. Please try again.');
  }

  private catalog(): CatalogItem[] {
    const raw = process.env.MPESA_CATALOG_JSON;
    if (!raw) {
      return [];
    }

    let entries: unknown;
    try {
      entries = JSON.parse(raw);
    } catch {
      throw new ServiceUnavailableException('MPESA_CATALOG_JSON must contain a valid JSON array.');
    }
    if (!Array.isArray(entries)) {
      throw new ServiceUnavailableException('MPESA_CATALOG_JSON must contain a JSON array.');
    }

    const items = entries as CatalogItem[];
    const seenCodes = new Set<string>();
    for (const item of items) {
      if (
        !item ||
        typeof item.code !== 'string' ||
        !/^[a-z0-9][a-z0-9-]{1,63}$/.test(item.code) ||
        typeof item.label !== 'string' ||
        !item.label.trim() ||
        !Number.isInteger(item.amountKsh) ||
        item.amountKsh < 1 ||
        item.amountKsh > 250000 ||
        seenCodes.has(item.code)
      ) {
        throw new ServiceUnavailableException('M-Pesa catalog entries require unique codes, labels, and whole KES amounts from 1 to 250,000.');
      }
      seenCodes.add(item.code);
    }
    return items;
  }

  private normalizePhone(value: string): string {
    const digits = (value ?? '').replace(/\D/g, '');
    const normalized = digits.startsWith('254') ? digits : digits.startsWith('0') ? `254${digits.slice(1)}` : '';
    if (!/^254[17]\d{8}$/.test(normalized)) {
      throw new BadRequestException('Enter a valid Kenyan M-Pesa mobile number.');
    }
    return normalized;
  }

  private darajaConfiguration() {
    const { MPESA_CONSUMER_KEY, MPESA_CONSUMER_SECRET, MPESA_SHORTCODE, MPESA_PASSKEY, MPESA_CALLBACK_BASE_URL, MPESA_CALLBACK_TOKEN } = process.env;
    if (!MPESA_CONSUMER_KEY || !MPESA_CONSUMER_SECRET || !MPESA_SHORTCODE || !MPESA_PASSKEY || !MPESA_CALLBACK_BASE_URL || !MPESA_CALLBACK_TOKEN) {
      throw new ServiceUnavailableException('M-Pesa is not configured. Set Daraja credentials, callback URL/token, and server-side catalog prices.');
    }
    let callbackUrl: URL;
    try {
      callbackUrl = new URL(MPESA_CALLBACK_BASE_URL);
    } catch {
      throw new ServiceUnavailableException('MPESA_CALLBACK_BASE_URL must be an absolute HTTPS URL.');
    }
    if (callbackUrl.protocol !== 'https:' && process.env.NODE_ENV === 'production') {
      throw new ServiceUnavailableException('M-Pesa callbacks require HTTPS in production.');
    }
    const environment = process.env.MPESA_ENVIRONMENT ?? 'sandbox';
    if (environment !== 'sandbox' && environment !== 'live') {
      throw new ServiceUnavailableException('MPESA_ENVIRONMENT must be sandbox or live.');
    }
    return {
      consumerKey: MPESA_CONSUMER_KEY,
      consumerSecret: MPESA_CONSUMER_SECRET,
      shortCode: MPESA_SHORTCODE,
      passkey: MPESA_PASSKEY,
      callbackBaseUrl: MPESA_CALLBACK_BASE_URL,
      callbackToken: MPESA_CALLBACK_TOKEN,
    };
  }

  private async darajaRequest<T>(path: string, body?: Record<string, unknown>): Promise<T> {
    const accessToken = await this.getAccessToken();
    const baseUrl = process.env.MPESA_ENVIRONMENT === 'live' ? 'https://api.safaricom.co.ke' : 'https://sandbox.safaricom.co.ke';
    const response = await fetch(`${baseUrl}${path}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    });
    const responseBody = await response.json() as T & { errorMessage?: string };
    if (response.status === 429) {
      throw this.darajaRateLimitException(response);
    }
    if (!response.ok) {
      throw new ServiceUnavailableException(responseBody.errorMessage ?? `Daraja request failed with HTTP ${response.status}.`);
    }
    return responseBody;
  }

  private async getAccessToken(): Promise<string> {
    if (this.cachedAccessToken && this.cachedAccessToken.expiresAt > Date.now() + 30000) {
      return this.cachedAccessToken.token;
    }
    const { consumerKey, consumerSecret } = this.darajaConfiguration();
    const baseUrl = process.env.MPESA_ENVIRONMENT === 'live' ? 'https://api.safaricom.co.ke' : 'https://sandbox.safaricom.co.ke';
    const credentials = Buffer.from(`${consumerKey}:${consumerSecret}`).toString('base64');
    const response = await fetch(`${baseUrl}/oauth/v1/generate?grant_type=client_credentials`, {
      headers: { Authorization: `Basic ${credentials}` },
      signal: AbortSignal.timeout(15000),
    });
    const result = await response.json() as { access_token?: string; expires_in?: string };
    if (response.status === 429) {
      throw this.darajaRateLimitException(response);
    }
    if (!response.ok || !result.access_token) {
      throw new ServiceUnavailableException(`Daraja OAuth failed with HTTP ${response.status}.`);
    }
    this.cachedAccessToken = {
      token: result.access_token,
      expiresAt: Date.now() + Number(result.expires_in ?? 3600) * 1000,
    };
    return result.access_token;
  }

  private darajaRateLimitException(response: Response) {
    const retryAfterHeader = response.headers.get('retry-after');
    const parsedRetryAfter = retryAfterHeader ? Number(retryAfterHeader) : NaN;
    const retryAfterSeconds =
      Number.isFinite(parsedRetryAfter) && parsedRetryAfter > 0
        ? Math.ceil(parsedRetryAfter)
        : 60;
    return new DarajaRateLimitException(
      'Daraja is rate-limiting requests. We will automatically retry after the cooldown.',
      retryAfterSeconds,
    );
  }

  private nairobiTimestamp(): string {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Africa/Nairobi',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(new Date());
    const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
    return `${values.year}${values.month}${values.day}${values.hour}${values.minute}${values.second}`;
  }
}
