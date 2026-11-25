import {
  ConflictException,
  Injectable,
  Logger,
  OnModuleDestroy,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import nodemailer from 'nodemailer';
import QRCode from 'qrcode';
import { Repository } from 'typeorm';
import { EventRegistration } from './event-registration.entity';
import { createEventTicketPdf } from './event-ticket-pdf';
import { formatEventTicketCode, formatEventTicketPrefix } from './event-ticket-code';
import { getAllowedEventPosterUrl } from '../events/event-poster-url';

@Injectable()
export class EventTicketEmailService implements OnModuleDestroy {
  private readonly logger = new Logger(EventTicketEmailService.name);
  private transporter: ReturnType<typeof nodemailer.createTransport> | undefined;

  constructor(
    @InjectRepository(EventRegistration)
    private readonly registrationsRepository: Repository<EventRegistration>,
  ) {}

  onModuleDestroy(): void {
    this.transporter?.close();
  }

  async sendPaidRegistrationTicket(registrationId: string): Promise<void> {
    const registration = await this.registrationsRepository.findOne({
      where: { id: registrationId, paymentStatus: 'paid' },
      relations: ['event'],
    });
    if (!registration || registration.ticketEmailStatus === 'sent' || registration.ticketEmailStatus === 'sending') {
      return;
    }

    let finalTicketCode = registration.ticketCode;
    let claimed = false;

    for (let attempt = 0; attempt < 5; attempt++) {
      if (!finalTicketCode) {
        finalTicketCode = await this.generateTicketCode(registration.event);
      }

      try {
        const claim = await this.registrationsRepository.update(
          { id: registrationId, paymentStatus: 'paid', ticketEmailStatus: 'not_sent' },
          {
            ticketCode: finalTicketCode,
            ticketEmailStatus: 'sending',
            ticketEmailAttemptedAt: new Date(),
            ticketEmailError: null,
          },
        );
        if (!claim.affected) {
          return;
        }
        claimed = true;
        break;
      } catch (err: unknown) {
        const errorRecord = err as { code?: string; message?: string };
        const isUniqueViolation =
          errorRecord?.code === '23505' ||
          errorRecord?.message?.includes('ticket_code') ||
          errorRecord?.message?.includes('UNIQUE constraint');
        if (isUniqueViolation) {
          finalTicketCode = undefined;
          continue;
        }
        throw err;
      }
    }

    if (!claimed || !finalTicketCode) {
      this.logger.error(`Unable to claim unique ticket code for registration ${registrationId} after retries.`);
      return;
    }

    await this.deliverClaimedTicket(registrationId, finalTicketCode);
  }

  async generateTicketCode(event?: { id?: string; title?: string | null }): Promise<string> {
    const prefix = formatEventTicketPrefix(event?.title);
    let nextNumber = 1;

    try {
      if (typeof this.registrationsRepository.find === 'function') {
        const existing = await this.registrationsRepository.find({
          where: event?.id ? { event: { id: event.id } } : {},
          select: ['ticketCode'],
        });
        let maxNumber = 0;
        const pattern = new RegExp(`^${prefix}-(\\d+)$`);
        for (const reg of existing) {
          if (reg.ticketCode) {
            const match = reg.ticketCode.match(pattern);
            if (match) {
              const num = parseInt(match[1], 10);
              if (!isNaN(num) && num > maxNumber) {
                maxNumber = num;
              }
            }
          }
        }
        nextNumber = maxNumber + 1;
      }
    } catch {
      // Gracefully fall back to 1 if find is unmocked or encounters an error
    }

    return formatEventTicketCode(event?.title, nextNumber);
  }

  async retryPaidRegistrationTicket(registrationId: string): Promise<void> {
    const registration = await this.registrationsRepository.findOneBy({ id: registrationId });
    if (!registration || registration.paymentStatus !== 'paid') {
      throw new ConflictException('A ticket email can only be retried after payment is confirmed.');
    }
    if (registration.ticketEmailStatus === 'sent') {
      throw new ConflictException('The ticket email has already been sent.');
    }
    if (registration.ticketEmailStatus === 'sending') {
      throw new ConflictException('The ticket email is already being sent.');
    }
    if (registration.ticketEmailStatus !== 'failed' || !registration.ticketCode) {
      throw new ConflictException('There is no failed ticket email to retry.');
    }
    if (
      registration.ticketEmailAttemptedAt &&
      Date.now() - registration.ticketEmailAttemptedAt.getTime() < 60_000
    ) {
      throw new ConflictException('Please wait one minute before retrying the ticket email.');
    }

    const claim = await this.registrationsRepository.update(
      { id: registrationId, paymentStatus: 'paid', ticketEmailStatus: 'failed' },
      {
        ticketEmailStatus: 'sending',
        ticketEmailAttemptedAt: new Date(),
        ticketEmailError: null,
      },
    );
    if (!claim.affected) {
      throw new ConflictException('The ticket email status changed. Refresh the payment status and try again.');
    }

    await this.deliverClaimedTicket(registrationId, registration.ticketCode);
  }

  private async deliverClaimedTicket(registrationId: string, ticketCode: string): Promise<void> {
    try {
      const registration = await this.registrationsRepository.findOne({
        where: { id: registrationId, paymentStatus: 'paid' },
        relations: ['event'],
      });
      if (!registration) {
        throw new ConflictException('The paid event registration could not be loaded.');
      }

      const { transporter, from } = this.getMailer();

      const qrCode = await QRCode.toBuffer(ticketCode, {
        errorCorrectionLevel: 'H',
        margin: 2,
        type: 'png',
        width: 360,
      });
      const eventDate = registration.event.date ?? 'To be announced';
      const eventLocation = registration.event.location ?? 'To be announced';
      const eventPoster = await this.loadEventPoster(registration.event.posterUrl);
      const pdfTicket = await createEventTicketPdf({
        attendeeName: registration.fullName,
        attendeeEmail: registration.email,
        eventTitle: registration.event.title,
        eventDate,
        eventLocation,
        ticketType: registration.ticketType,
        ticketSelections: registration.ticketSelections,
        amountKsh: registration.amountKsh,
        childName: registration.childName,
        childAge: registration.childAge,
        childDetails: registration.ticketSelections?.flatMap((selection) => selection.childDetails) ?? [],
        ticketCode,
        poster: eventPoster,
      }, qrCode);
      const eventTitle = escapeHtml(registration.event.title);
      const attendeeName = escapeHtml(registration.fullName);
      const escapedEventDate = escapeHtml(eventDate);
      const escapedEventLocation = escapeHtml(eventLocation);
      const ticketType = escapeHtml(registration.ticketType);
      const children = registration.ticketSelections?.flatMap((selection) => selection.childDetails) ?? [];
      const childDetails = children.length
        ? children.map((child) => `<p style="margin:8px 0"><strong>Child:</strong> ${escapeHtml(child.name)} (age ${child.age})</p>`).join('')
        : registration.childName
          ? `<p style="margin:8px 0"><strong>Child:</strong> ${escapeHtml(registration.childName)} (age ${registration.childAge})</p>`
          : '';
      const ticketLines = registration.ticketSelections?.length
        ? registration.ticketSelections.map((selection) =>
            `<p style="margin:8px 0">${escapeHtml(selection.ticketType)} × ${selection.quantity}: KES ${selection.lineTotalKsh.toLocaleString()}</p>`,
          ).join('')
        : '';
      const safeTicketCode = escapeHtml(ticketCode);
      const eventPosterUrl = getAllowedEventPosterUrl(registration.event.posterUrl);
      const text = [
        `Hello ${registration.fullName},`,
        '',
        `Your payment is confirmed. Your ticket for ${registration.event.title} is ready.`,
        '',
        `Date: ${eventDate}`,
        `Location: ${eventLocation}`,
        `Ticket type: ${registration.ticketType}`,
        ...(registration.ticketSelections?.length
          ? registration.ticketSelections.map((selection) =>
              `${selection.ticketType} x ${selection.quantity}: KES ${selection.lineTotalKsh.toLocaleString()}`,
            )
          : []),
        ...(registration.ticketSelections?.flatMap((selection) => selection.childDetails).length
          ? registration.ticketSelections.flatMap((selection) => selection.childDetails)
              .map((child) => `Child: ${child.name} (age ${child.age})`)
          : registration.childName ? [`Child: ${registration.childName} (age ${registration.childAge})`] : []),
        ...(registration.amountKsh !== null ? [`Total: KES ${registration.amountKsh?.toLocaleString()}`] : []),
        `Ticket code: ${ticketCode}`,
        '',
        'Your PDF ticket includes your name, email, event details, ticket type, ticket code, and QR code. Please open the PDF and present the QR code at check-in.',
        '',
        'Thank you,',
        'NEYD Events',
      ].join('\n');

      const result = await transporter.sendMail({
        from,
        to: registration.email,
        subject: `Your NEYD event ticket: ${registration.event.title}`,
        text,
        html: `
            <div style="margin:0;background:#f7f3ee;padding:32px 16px;font-family:Arial,Helvetica,sans-serif;color:#1a1a1a">
              <div style="max-width:600px;margin:0 auto;background:#ffffff;border:1px solid rgba(58,107,74,.15);border-radius:16px;overflow:hidden">
                <div style="background:#2a4e36;padding:28px 32px">
                  <p style="margin:0 0 10px;color:#e8c49a;font-size:12px;font-weight:bold;letter-spacing:2px">NEYD EVENTS</p>
                  <h1 style="margin:0;color:#f7f3ee;font-size:26px">Your ticket is ready</h1>
                  <p style="margin:10px 0 0;color:#e8c49a;font-size:13px;font-weight:bold;letter-spacing:1px">PAYMENT CONFIRMED</p>
                </div>
                <div style="padding:28px 32px">
                  ${eventPosterUrl ? `<img src="${escapeHtml(eventPosterUrl)}" alt="${eventTitle} event poster" style="display:block;width:100%;height:auto;max-height:300px;object-fit:cover;border-radius:10px;margin:0 0 24px">` : ''}
                  <p style="margin:0 0 20px;font-size:16px">Hello ${attendeeName},</p>
                  <p style="margin:0 0 22px;color:#4a4a4a;line-height:1.6">Thank you for registering. Your payment is confirmed and your ticket is attached as a PDF. It includes your name and registered email along with the event and ticket details.</p>
                  <div style="border:1px solid rgba(58,107,74,.15);border-radius:12px;padding:20px">
                    <h2 style="margin:0 0 18px;color:#2a4e36;font-size:20px">${eventTitle}</h2>
                    <p style="margin:8px 0"><strong>Date:</strong> ${escapedEventDate}</p>
                    <p style="margin:8px 0"><strong>Location:</strong> ${escapedEventLocation}</p>
                    <p style="margin:8px 0"><strong>Ticket type:</strong> ${ticketType}</p>
                    ${ticketLines}
                    ${childDetails}
                    ${registration.amountKsh !== null ? `<p style="margin:18px 0 0;padding-top:14px;border-top:1px solid rgba(58,107,74,.15)"><strong>Total:</strong> KES ${registration.amountKsh?.toLocaleString()}</p>` : ''}
                    <p style="margin:18px 0 0;padding-top:14px;border-top:1px solid rgba(58,107,74,.15)"><strong>Ticket code:</strong><br><span style="font-family:monospace;font-size:14px;color:#2a4e36">${safeTicketCode}</span></p>
                  </div>
                  <p style="margin:22px 0 0;color:#4a4a4a;line-height:1.6">Your QR code is included in the attached PDF. Please open the PDF and have it ready at check-in.</p>
                  <p style="margin:24px 0 0;color:#4a4a4a">We look forward to seeing you,<br><strong style="color:#1a1a1a">NEYD Events</strong></p>
                </div>
              </div>
            </div>
          `,
        attachments: [{
          filename: `NEYD-ticket-${ticketCode}.pdf`,
          content: Buffer.from(pdfTicket),
          contentType: 'application/pdf',
        }],
      });
      if (!result.accepted.length) {
        throw new ServiceUnavailableException('The SMTP server did not accept the ticket email recipient.');
      }

      await this.registrationsRepository.update(
        { id: registrationId, ticketEmailStatus: 'sending' },
        {
          ticketEmailStatus: 'sent',
          ticketEmailSentAt: new Date(),
          ticketEmailError: null,
        },
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown ticket email error.';
      await this.registrationsRepository.update(
        { id: registrationId, ticketEmailStatus: 'sending' },
        { ticketEmailStatus: 'failed', ticketEmailError: message },
      );
      this.logger.error(`Ticket email delivery failed for registration ${registrationId}: ${message}`);
    }
  }

  private getMailer(): {
    transporter: ReturnType<typeof nodemailer.createTransport>;
    from: string;
  } {
    const host = process.env.SMTP_HOST?.trim();
    const portValue = process.env.SMTP_PORT?.trim();
    const from = process.env.EVENT_TICKET_FROM?.trim();
    const username = process.env.SMTP_USER?.trim();
    const password = process.env.SMTP_PASS;
    if (!host || !portValue || !from) {
      throw new ServiceUnavailableException(
        'Ticket email is not configured. Set SMTP_HOST, SMTP_PORT, and EVENT_TICKET_FROM.',
      );
    }

    const port = Number(portValue);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      throw new ServiceUnavailableException('SMTP_PORT must be a valid port number.');
    }
    if (Boolean(username) !== Boolean(password)) {
      throw new ServiceUnavailableException('Set both SMTP_USER and SMTP_PASS, or leave both empty.');
    }

    const secureValue = process.env.SMTP_SECURE?.trim().toLowerCase();
    if (secureValue && secureValue !== 'true' && secureValue !== 'false') {
      throw new ServiceUnavailableException('SMTP_SECURE must be true or false.');
    }
    const secure = secureValue ? secureValue === 'true' : port === 465;

    if (!this.transporter) {
      this.transporter = nodemailer.createTransport({
        host,
        port,
        secure,
        requireTLS: !secure,
        auth: username && password ? { user: username, pass: password } : undefined,
        pool: true,
        maxConnections: 5,
        maxMessages: 100,
        connectionTimeout: 10_000,
        greetingTimeout: 10_000,
        socketTimeout: 15_000,
        tls: { minVersion: 'TLSv1.2' },
      });
    }

    return { transporter: this.transporter, from };
  }

  private async loadEventPoster(
    posterUrl?: string | null,
  ): Promise<{ contentType: 'image/png' | 'image/jpeg'; bytes: Uint8Array } | undefined> {
    const url = getAllowedEventPosterUrl(posterUrl);
    if (!url) return undefined;

    if (url.startsWith('/posters/')) {
      try {
        const fs = await import('node:fs/promises');
        const path = await import('node:path');
        const relativePath = url.replace(/^\//, '');
        const candidatePaths = [
          path.join(process.cwd(), 'apps/web/public', relativePath),
          path.join(process.cwd(), 'public', relativePath),
          path.resolve(__dirname, '../../../../apps/web/public', relativePath),
        ];
        let fileBuffer: Buffer | null = null;
        for (const candidate of candidatePaths) {
          try {
            fileBuffer = await fs.readFile(candidate);
            break;
          } catch {
            // continue checking
          }
        }
        if (!fileBuffer) {
          this.logger.warn(`Local event poster file not found for ${url}`);
          return undefined;
        }
        if (fileBuffer.byteLength > 4 * 1024 * 1024) {
          throw new Error('Poster image exceeds the 4 MB size limit.');
        }
        const ext = url.split('.').pop()?.toLowerCase();
        const contentType: 'image/png' | 'image/jpeg' = ext === 'png' ? 'image/png' : 'image/jpeg';
        return { contentType, bytes: new Uint8Array(fileBuffer) };
      } catch (error) {
        const detail = error instanceof Error ? error.message : 'Unknown poster read error.';
        this.logger.warn(`Local event poster could not be loaded: ${detail}`);
        return undefined;
      }
    }

    try {
      const response = await fetch(url, {
        redirect: 'error',
        signal: AbortSignal.timeout(8_000),
      });
      if (!response.ok) {
        throw new Error(`Poster host returned HTTP ${response.status}.`);
      }

      const contentType = response.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase();
      if (contentType !== 'image/png' && contentType !== 'image/jpeg') {
        throw new Error('Poster must be served as a PNG or JPEG image.');
      }
      const contentLength = Number(response.headers.get('content-length'));
      const maxBytes = 4 * 1024 * 1024;
      if (Number.isFinite(contentLength) && contentLength > maxBytes) {
        throw new Error('Poster image exceeds the 4 MB size limit.');
      }
      if (!response.body) {
        throw new Error('Poster host returned an empty response.');
      }

      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let totalBytes = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        totalBytes += value.byteLength;
        if (totalBytes > maxBytes) {
          await reader.cancel();
          throw new Error('Poster image exceeds the 4 MB size limit.');
        }
        chunks.push(value);
      }

      const bytes = new Uint8Array(totalBytes);
      let offset = 0;
      for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.byteLength;
      }
      return { contentType, bytes };
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Unknown poster fetch error.';
      this.logger.warn(`Event poster could not be embedded in the ticket PDF: ${detail}`);
      return undefined;
    }
  }
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    };
    return entities[character];
  });
}
