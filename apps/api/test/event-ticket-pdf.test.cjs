// Runtime validation coverage for event ticket PDF composition.
const assert = require('node:assert/strict');
const { test } = require('node:test');
const QRCode = require('qrcode');
const { createEventTicketPdf } = require('../dist/event-registrations/event-ticket-pdf');

test('embeds the event poster image alongside the QR code in the ticket PDF', async () => {
  const image = await QRCode.toBuffer('poster-and-qr-test');
  const details = {
    attendeeName: 'Test Attendee',
    attendeeEmail: 'attendee@example.test',
    eventTitle: 'NEYD Test Event',
    eventDate: '20 November 2026',
    eventLocation: 'Nairobi',
    ticketType: 'General Admission',
    ticketCode: 'test-ticket-code',
  };
  const withoutPoster = await createEventTicketPdf(details, image);
  const withPoster = await createEventTicketPdf({
    ...details,
    poster: { contentType: 'image/png', bytes: image },
  }, image);

  assert.ok(withPoster.byteLength > withoutPoster.byteLength);
});
