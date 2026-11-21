const assert = require('node:assert/strict');
const { test } = require('node:test');

test('formats event ticket prefix and code accurately', () => {
  const {
    formatEventTicketPrefix,
    formatEventTicketCode,
  } = require('../dist/event-registrations/event-ticket-code');

  assert.equal(formatEventTicketPrefix('Teen Youth'), 'TEEN-YOUTH');
  assert.equal(formatEventTicketPrefix('teen youth'), 'TEEN-YOUTH');
  assert.equal(formatEventTicketPrefix('  Teen   Youth!  '), 'TEEN-YOUTH');
  assert.equal(formatEventTicketCode('Teen Youth', 1), 'TEEN-YOUTH-0001');
  assert.equal(formatEventTicketCode('Teen Youth', 42), 'TEEN-YOUTH-0042');
  assert.equal(formatEventTicketCode('NEYD Community Summit', 3), 'NEYD-COMMUNITY-SUMMIT-0003');
  assert.equal(formatEventTicketCode('', 1), 'EVENT-0001');
  assert.equal(formatEventTicketCode(null, 5), 'EVENT-0005');
});

