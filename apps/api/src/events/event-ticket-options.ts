import type { EventEntity } from './event.entity';

export interface EventTicketOption {
  name: string;
  priceKsh: number | null;
  requiresChildDetails: boolean;
  pricingMode: 'per_person' | 'family_bundle';
  peoplePerTicket: number;
}

export const DEFAULT_EVENT_TICKET_OPTIONS: EventTicketOption[] = [
  { name: 'General Admission', priceKsh: null, requiresChildDetails: false, pricingMode: 'per_person', peoplePerTicket: 1 },
  { name: 'Parent', priceKsh: null, requiresChildDetails: false, pricingMode: 'per_person', peoplePerTicket: 1 },
  { name: 'Child', priceKsh: null, requiresChildDetails: true, pricingMode: 'per_person', peoplePerTicket: 1 },
];

export function getEventTicketOptions(
  event: Pick<EventEntity, 'ticketOptions' | 'priceKsh'>,
): EventTicketOption[] {
  const configuredOptions = event.ticketOptions?.filter(
    (option) => option.name.trim().toLowerCase() !== 'parent + child',
  );
  if (configuredOptions?.length) return configuredOptions;
  return [{
    name: 'General Admission',
    priceKsh: Number(event.priceKsh),
    requiresChildDetails: false,
    pricingMode: 'per_person',
    peoplePerTicket: 1,
  }];
}

export function findEventTicketOption(
  event: Pick<EventEntity, 'ticketOptions' | 'priceKsh'>,
  ticketType: string,
): EventTicketOption | undefined {
  const normalizedType = ticketType.trim().toLowerCase();
  const option = getEventTicketOptions(event).find((item) => item.name.trim().toLowerCase() === normalizedType);
  if (!option) return undefined;
  return {
    ...option,
    pricingMode: option.pricingMode ?? 'per_person',
    peoplePerTicket: option.peoplePerTicket ?? 1,
  };
}

export function calculateTicketLineTotal(
  option: EventTicketOption,
  quantity: number,
): number {
  const peoplePerTicket = option.pricingMode === 'family_bundle' ? 1 : (option.peoplePerTicket ?? 1);
  return Number(option.priceKsh) * quantity * peoplePerTicket;
}
