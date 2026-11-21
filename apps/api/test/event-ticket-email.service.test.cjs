// Runtime validation coverage for SMTP ticket delivery.
const assert = require('node:assert/strict');
const { test } = require('node:test');
const nodemailer = require('nodemailer');

test('sends the paid ticket PDF through the configured pooled SMTP transport', async () => {
  const envKeys = [
    'SMTP_HOST',
    'SMTP_PORT',
    'SMTP_SECURE',
    'SMTP_USER',
    'SMTP_PASS',
    'EVENT_TICKET_FROM',
  ];
  const previousEnv = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));
  const originalCreateTransport = nodemailer.createTransport;
  const transportOptions = [];
  const messages = [];
  let service;

  for (const key of envKeys) delete process.env[key];
  Object.assign(process.env, {
    SMTP_HOST: 'smtp.example.test',
    SMTP_PORT: '587',
    SMTP_SECURE: 'false',
    SMTP_USER: 'tickets@example.test',
    SMTP_PASS: 'not-a-real-password',
    EVENT_TICKET_FROM: 'NEYD Events <tickets@example.test>',
  });

  nodemailer.createTransport = (options) => {
    transportOptions.push(options);
    return {
      sendMail: async (message) => {
        messages.push(message);
        return { accepted: [message.to], rejected: [] };
      },
      close: () => {},
    };
  };

  try {
    const { EventTicketEmailService } = require('../dist/event-registrations/event-ticket-email.service');
    const registration = {
      id: 'registration-id',
      paymentStatus: 'paid',
      fullName: 'Test Attendee',
      email: 'attendee@example.test',
      ticketType: 'General Admission',
      event: {
        title: 'NEYD Test Event',
        date: '17 November 2026',
        location: 'Nairobi',
      },
    };
    const updates = [];
    const repository = {
      update: async (_criteria, values) => {
        updates.push(values);
        return { affected: 1 };
      },
      findOne: async () => registration,
    };
    service = new EventTicketEmailService(repository);

    await service.sendPaidRegistrationTicket(registration.id);

    assert.equal(transportOptions.length, 1);
    assert.equal(transportOptions[0].host, 'smtp.example.test');
    assert.equal(transportOptions[0].port, 587);
    assert.equal(transportOptions[0].secure, false);
    assert.equal(transportOptions[0].requireTLS, true);
    assert.equal(transportOptions[0].pool, true);
    assert.equal(messages.length, 1);
    assert.equal(messages[0].to, registration.email);
    assert.equal(messages[0].from, process.env.EVENT_TICKET_FROM);
    assert.equal(messages[0].attachments[0].contentType, 'application/pdf');
    assert.equal(Buffer.isBuffer(messages[0].attachments[0].content), true);
    assert.equal(messages[0].attachments[0].content.subarray(0, 5).toString(), '%PDF-');
    assert.equal(updates.at(-1).ticketEmailStatus, 'sent');
  } finally {
    service?.onModuleDestroy();
    nodemailer.createTransport = originalCreateTransport;
    for (const [key, value] of Object.entries(previousEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
