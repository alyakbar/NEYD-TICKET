const assert = require('node:assert/strict');
const { test } = require('node:test');
const { BadRequestException, ConflictException } = require('@nestjs/common');
const { calculateTicketLineTotal, findEventTicketOption } = require('../dist/events/event-ticket-options');
const { EventRegistrationsService } = require('../dist/event-registrations/event-registrations.service');
const { EventsService } = require('../dist/events/events.service');

const event = {
  id: 'event-id',
  slug: 'family-day',
  isArchived: false,
  priceKsh: 500,
  ticketOptions: [
    { name: 'General Admission', priceKsh: 500, requiresChildDetails: false },
    { name: 'Parent', priceKsh: 350, requiresChildDetails: false, pricingMode: 'per_person', peoplePerTicket: 1 },
    { name: 'Child', priceKsh: null, requiresChildDetails: true, pricingMode: 'per_person', peoplePerTicket: 1 },
    { name: 'Parent + Child', priceKsh: 750, requiresChildDetails: true, pricingMode: 'family_bundle', peoplePerTicket: 2 },
  ],
};

test('finds configured ticket prices and hides the removed Parent + Child category', () => {
  assert.equal(findEventTicketOption(event, 'Parent').priceKsh, 350);
  assert.equal(findEventTicketOption(event, 'Child').priceKsh, null);
  assert.equal(findEventTicketOption(event, 'Parent + Child'), undefined);
  assert.equal(findEventTicketOption(event, 'Unknown'), undefined);
  assert.equal(findEventTicketOption({ priceKsh: 300, ticketOptions: null }, 'General Admission').priceKsh, 300);
});

test('rejects adding the removed Parent + Child ticket type to an event', () => {
  const service = new EventsService({});
  assert.throws(
    () => service.cleanTicketOptions([
      { name: 'Parent + Child', priceKsh: 750, requiresChildDetails: true },
    ], 500),
    (error) => error instanceof BadRequestException && error.message.includes('separate Parent and Child'),
  );
});

test('calculates per-person ticket quantities', () => {
  const parent = findEventTicketOption(event, 'Parent');
  const child = { name: 'Child', priceKsh: 200, requiresChildDetails: true, pricingMode: 'per_person', peoplePerTicket: 1 };
  assert.equal(calculateTicketLineTotal(parent, 1), 350);
  assert.equal(calculateTicketLineTotal(child, 3), 600);
});

test('requires child name and age for child ticket types and persists both details', async () => {
  const registrationsRepository = {
    create: (registration) => registration,
    save: async (registration) => registration,
  };
  const eventsRepository = {
    findOne: async () => ({
      ...event,
      ticketOptions: event.ticketOptions.map((option) =>
        option.name === 'Child' ? { ...option, priceKsh: 200 } : option,
      ),
    }),
  };
  const service = new EventRegistrationsService(registrationsRepository, eventsRepository);
  const registration = {
    eventSlug: event.slug,
    fullName: 'Test Parent',
    email: 'parent@example.test',
    phone: '+254700000000',
    ticketType: 'Child',
    agree: true,
  };

  await assert.rejects(
    service.create(registration),
    (error) => error instanceof BadRequestException && error.message.includes('Enter child name and age'),
  );

  const saved = await service.create({
    ...registration,
    childName: 'Test Child',
    childAge: 8,
  });
  assert.equal(saved.ticketType, 'Child');
  assert.equal(saved.childName, 'Test Child');
  assert.equal(saved.childAge, 8);
});

test('prices mixed ticket selections on the server and saves all child details', async () => {
  const registrationsRepository = {
    create: (registration) => registration,
    save: async (registration) => registration,
  };
  const eventsRepository = {
    findOne: async () => ({
      ...event,
      ticketOptions: [
        ...event.ticketOptions.filter((option) => option.name !== 'Child'),
        { name: 'Child', priceKsh: 200, requiresChildDetails: true, pricingMode: 'per_person', peoplePerTicket: 1 },
      ],
    }),
  };
  const service = new EventRegistrationsService(registrationsRepository, eventsRepository);
  const saved = await service.create({
    eventSlug: event.slug,
    fullName: 'Test Parent',
    email: 'parent@example.test',
    phone: '+254700000000',
    agree: true,
    ticketSelections: [
      { ticketType: 'Parent', quantity: 1 },
      {
        ticketType: 'Child',
        quantity: 2,
        childDetails: [{ name: 'Child Two', age: 6 }, { name: 'Child Three', age: 4 }],
      },
    ],
  });

  assert.equal(saved.amountKsh, 750);
  assert.equal(saved.ticketSelections.length, 2);
  assert.deepEqual(
    saved.ticketSelections.flatMap((selection) => selection.childDetails).map((child) => child.name),
    ['Child Two', 'Child Three'],
  );
});

test('blocks deleting events that have attendee registrations', async () => {
  const eventsRepository = {
    findOneBy: async () => ({ id: 'event-id' }),
    createQueryBuilder: () => ({
      leftJoin() { return this; },
      where() { return this; },
      select() { return this; },
      getRawOne: async () => ({ count: '1' }),
    }),
    delete: async () => ({ affected: 1 }),
  };
  const service = new EventsService(eventsRepository);

  await assert.rejects(
    service.delete('event-id'),
    (error) => error instanceof ConflictException && error.message.includes('Archive it'),
  );
});
