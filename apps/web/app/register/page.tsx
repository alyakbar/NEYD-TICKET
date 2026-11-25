'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { getPublicEventPosterUrl } from '../../lib/event-poster-url';
import { getBrowserApiUrl } from '../../lib/api-url';

type EventChoice = {
  slug: string;
  title: string;
  date: string;
  location: string;
  priceKsh: number;
  ticketOptions?: TicketOption[] | null;
  posterUrl: string | null;
};

type TicketOption = {
  name: string;
  priceKsh: number | null;
  requiresChildDetails: boolean;
  pricingMode?: 'per_person' | 'family_bundle';
  peoplePerTicket?: number;
};

type ChildEntry = {
  name: string;
  age: string;
};

type RegistrationForm = {
  eventSlug: string;
  eventTitle: string;
  fullName: string;
  email: string;
  phone: string;
  role: string;
  expectations: string;
  dietaryRequirements: string;
  agree: boolean;
};

type PaymentStatus = {
  paymentId?: string;
  status: string;
  receiptNumber: string | null;
  resultDescription: string | null;
};

const API_URL = getBrowserApiUrl();
const INITIAL_RECONCILIATION_DELAY_MS = 60_000;
const MAX_RECONCILIATION_DELAY_MS = 5 * 60_000;
const INITIAL_STATUS_POLL_INTERVAL_MS = 5_000;
const MAX_STATUS_POLL_INTERVAL_MS = 30_000;

function getTicketOptions(event: EventChoice): TicketOption[] {
  return event.ticketOptions?.length
    ? event.ticketOptions
    : [{
        name: 'General Admission',
        priceKsh: Number(event.priceKsh),
        requiresChildDetails: false,
        pricingMode: 'per_person',
        peoplePerTicket: 1,
      }];
}

const defaultForm = (): RegistrationForm => ({
  eventSlug: '',
  eventTitle: '',
  fullName: '',
  email: '',
  phone: '',
  role: '',
  expectations: '',
  dietaryRequirements: '',
  agree: false,
});

export default function RegisterPage() {
  const [events, setEvents] = useState<EventChoice[]>([]);
  const [selectedEventSlug, setSelectedEventSlug] = useState('');
  const [isLoadingEvents, setIsLoadingEvents] = useState(true);
  const [eventLoadError, setEventLoadError] = useState('');
  const [ticketQuantities, setTicketQuantities] = useState<Record<string, number>>({});
  const [ticketChildren, setTicketChildren] = useState<Record<string, ChildEntry[]>>({});

  const selectedEvent = useMemo(
    () => events.find((event) => event.slug === selectedEventSlug),
    [selectedEventSlug, events],
  );
  const [form, setForm] = useState<RegistrationForm>(defaultForm());
  const availableTicketOptions = selectedEvent
    ? getTicketOptions(selectedEvent).filter((option) => option.priceKsh !== null)
    : [];
  const selectedTicketLines = availableTicketOptions
    .filter((option) => (ticketQuantities[option.name] ?? 0) > 0)
    .map((option) => {
      const quantity = ticketQuantities[option.name];
      const lineTotal = Number(option.priceKsh) * quantity *
        (option.pricingMode === 'family_bundle' ? 1 : (option.peoplePerTicket ?? 1));
      return {
        option,
        quantity,
        lineTotal,
        childDetails: ticketChildren[option.name] ?? [],
      };
    });
  const totalPriceKsh = selectedTicketLines.reduce((total, line) => total + line.lineTotal, 0);
  const missingChildren = selectedTicketLines.some(({ option, quantity, childDetails }) =>
    option.requiresChildDetails &&
    (childDetails.length !== quantity || childDetails.some((child) =>
      !child.name.trim() || child.age === '' || !Number.isInteger(Number(child.age)) ||
      Number(child.age) < 0 || Number(child.age) > 17)),
  );
  const selectedPosterUrl = getPublicEventPosterUrl(selectedEvent?.posterUrl);

  const [registrationId, setRegistrationId] = useState('');
  const [paymentId, setPaymentId] = useState('');
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [reconciliationError, setReconciliationError] = useState('');

  useEffect(() => {
    fetch(`${API_URL}/events`)
      .then(async (response) => {
        if (!response.ok) throw new Error('Could not load events');
        return response.json();
      })
      .then((data) => {
        if (!Array.isArray(data)) throw new Error('The events API returned an invalid response.');
        const databaseEvents: EventChoice[] = data;
        setEvents(databaseEvents);
        const requestedSlug = new URLSearchParams(window.location.search).get('event');
        const initialEvent = databaseEvents.find((event) => event.slug === requestedSlug) ?? databaseEvents[0];
        if (initialEvent) setSelectedEventSlug(initialEvent.slug);
      })
      .catch((requestError: unknown) => {
        setEventLoadError(requestError instanceof Error ? requestError.message : 'Could not load events.');
      })
      .finally(() => setIsLoadingEvents(false));
  }, []);

  useEffect(() => {
    if (!selectedEvent) return;
    const availableOptions = getTicketOptions(selectedEvent).filter((option) => option.priceKsh !== null);
    const defaultOption = availableOptions.find((option) => option.name === 'General Admission') ?? availableOptions[0];
    setForm((current) => ({
      ...current,
      eventSlug: selectedEvent.slug,
      eventTitle: selectedEvent.title,
    }));
    setTicketQuantities(defaultOption ? { [defaultOption.name]: 1 } : {});
    setTicketChildren({});
  }, [selectedEvent]);

  useEffect(() => {
    if (!registrationId || !paymentId) return;
    let active = true;
    let isRefreshing = false;
    let isTerminal = false;
    let statusPollIntervalMs = INITIAL_STATUS_POLL_INTERVAL_MS;
    let statusPollTimer: number | undefined;
    let requestController: AbortController | undefined;
    let reconciliationDelayMs = INITIAL_RECONCILIATION_DELAY_MS;
    let nextReconciliationAt = Date.now() + reconciliationDelayMs;

    const scheduleNextRefresh = () => {
      if (!active || isTerminal || document.visibilityState === 'hidden') return;
      statusPollTimer = window.setTimeout(() => {
        statusPollIntervalMs = Math.min(statusPollIntervalMs * 2, MAX_STATUS_POLL_INTERVAL_MS);
        void refresh();
      }, statusPollIntervalMs);
    };

    const refresh = async () => {
      if (!active || isTerminal || isRefreshing || document.visibilityState === 'hidden') return;
      isRefreshing = true;
      requestController = new AbortController();
      try {
        const response = await fetch(`${API_URL}/payments/event-registration/${registrationId}/status`, {
          cache: 'no-store',
          signal: requestController.signal,
        });
        if (!response.ok) {
          const body = await response.json().catch(() => ({}));
          throw new Error(body.message ?? 'Unable to check payment status.');
        }
        let status = await response.json() as PaymentStatus;
        if (status.paymentId && active) setPaymentId(status.paymentId);
        if (status.status === 'pending' && status.paymentId && Date.now() >= nextReconciliationAt) {
          const currentDelay = reconciliationDelayMs;
          nextReconciliationAt = Date.now() + currentDelay;
          reconciliationDelayMs = Math.min(currentDelay * 2, MAX_RECONCILIATION_DELAY_MS);
          const reconcileResponse = await fetch(`${API_URL}/payments/${status.paymentId}/reconcile`, {
            method: 'POST',
            signal: requestController.signal,
          });
          if (!reconcileResponse.ok) {
            const body = await reconcileResponse.json().catch(() => ({}));
            const detail = typeof body.message === 'string' ? body.message : '';
            const retryAfterSeconds = Number(body.retryAfterSeconds);
            if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0) {
              nextReconciliationAt = Date.now() + Math.max(currentDelay, retryAfterSeconds * 1000);
            }
            if (active) {
              setReconciliationError(
                detail && detail !== 'Service Unavailable'
                  ? detail
                  : 'M-Pesa is temporarily unavailable. We will check the payment again automatically.',
              );
            }
          } else {
            status = await reconcileResponse.json() as PaymentStatus;
            if (active) setReconciliationError('');
          }
        }
        if (active) {
          setPaymentStatus(status);
          setError('');
          isTerminal = status.status === 'paid' || status.status === 'failed';
        }
      } catch (requestError) {
        if (active && !(requestError instanceof DOMException && requestError.name === 'AbortError')) {
          setError((requestError as Error).message);
        }
      } finally {
        isRefreshing = false;
        requestController = undefined;
        scheduleNextRefresh();
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        if (statusPollTimer !== undefined) window.clearTimeout(statusPollTimer);
        requestController?.abort();
        return;
      }
      if (statusPollTimer !== undefined) window.clearTimeout(statusPollTimer);
      void refresh();
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    void refresh();
    return () => {
      active = false;
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (statusPollTimer !== undefined) window.clearTimeout(statusPollTimer);
      requestController?.abort();
    };
  }, [paymentId, registrationId]);

  useEffect(() => {
    if (paymentStatus?.status !== 'paid') return;
    const confirmedPaymentId = paymentStatus.paymentId ?? paymentId;
    if (!confirmedPaymentId) return;
    const query = new URLSearchParams({ event: selectedEvent?.title ?? 'the event', payment: confirmedPaymentId });
    const posterUrl = getPublicEventPosterUrl(selectedEvent?.posterUrl);
    if (posterUrl) query.set('poster', posterUrl);
    window.location.replace(`/register/success?${query.toString()}`);
  }, [paymentId, paymentStatus, selectedEvent]);

  function handleChange<K extends keyof RegistrationForm>(field: K, value: RegistrationForm[K]) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function beginPayment(id: string) {
    const response = await fetch(`${API_URL}/payments/event-stk-push`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ registrationId: id }),
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      if (body.paymentId && body.status) {
        setPaymentId(body.paymentId);
        setPaymentStatus({
          paymentId: body.paymentId,
          status: body.status,
          receiptNumber: null,
          resultDescription: body.resultDescription ?? body.message ?? null,
        });
        return;
      }
      throw new Error(body.message ?? 'Unable to start M-Pesa payment.');
    }

    const payment = await response.json();
    setPaymentId(payment.paymentId);
    setPaymentStatus({
      paymentId: payment.paymentId,
      status: payment.status,
      receiptNumber: null,
      resultDescription: payment.message,
    });
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');

    if (!selectedEvent) {
      setError('Select an event from the database before registering.');
      return;
    }
    if (selectedTicketLines.length === 0) {
      setError('Select at least one ticket to register.');
      return;
    }
    if (missingChildren) {
      setError('Enter a name and a valid age for every child ticket selected.');
      return;
    }
    if (!Number.isInteger(totalPriceKsh) || totalPriceKsh < 1 || totalPriceKsh > 250000) {
      setError('The total ticket price must be between KES 1 and KES 250,000.');
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch(`${API_URL}/event-registrations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          eventSlug: selectedEvent.slug,
          eventTitle: selectedEvent.title,
          ticketSelections: selectedTicketLines.map(({ option, quantity, childDetails }) => ({
            ticketType: option.name,
            quantity,
            ...(option.requiresChildDetails
              ? { childDetails: childDetails.map((child) => ({ name: child.name.trim(), age: Number(child.age) })) }
              : {}),
          })),
        }),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.message ?? 'Unable to save registration.');
      }

      const registration = await response.json();
      setRegistrationId(registration.id);
      setForm(defaultForm());
      await beginPayment(registration.id);
    } catch (requestError) {
      setError((requestError as Error).message);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function retryPayment() {
    if (!registrationId) return;
    setError('');
    setIsSubmitting(true);
    try {
      await beginPayment(registrationId);
    } catch (requestError) {
      setError((requestError as Error).message);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main id="main-content" className="min-h-screen px-4 py-6 text-slate-100 sm:px-5 sm:py-10">
      <div className="mx-auto max-w-5xl">
        <header className="mb-6 flex items-start justify-between gap-3 sm:mb-8">
          <div>
            <a href="/" className="text-sm text-sky-300 hover:text-sky-200">← Back to events</a>
            <p className="mt-4 text-xs uppercase tracking-[0.22em] text-sky-400">Event registration</p>
            <h1 className="mt-2 text-3xl font-bold text-white md:text-4xl">Reserve your spot</h1>
          </div>
        </header>

        <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <form onSubmit={handleSubmit} className="w-full space-y-5 rounded-2xl border border-[#3d5d4b] bg-[#193324] p-4 shadow-[0_18px_44px_rgba(0,0,0,0.18)] sm:p-6">
            {error && (
              <div className="rounded-lg border border-rose-800 bg-rose-950/40 p-3 text-sm text-rose-200">{error}</div>
            )}
            {eventLoadError && (
              <div role="alert" className="rounded-lg border border-rose-800 bg-rose-950/40 p-3 text-sm text-rose-200">
                {eventLoadError}
              </div>
            )}

            <label className="block text-sm text-slate-300">
              Select event
              <select
                value={selectedEvent?.slug ?? ''}
                onChange={(event) => {
                  const next = events.find((item) => item.slug === event.target.value);
                  if (!next) return;
                  setSelectedEventSlug(next.slug);
                  setForm((current) => ({ ...current, eventSlug: next.slug, eventTitle: next.title }));
                  window.history.replaceState({}, '', `/register?event=${encodeURIComponent(next.slug)}`);
                }}
                disabled={isLoadingEvents || events.length === 0}
                className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white outline-none"
              >
                {isLoadingEvents && <option value="">Loading events...</option>}
                {!isLoadingEvents && events.length === 0 && <option value="">No events available</option>}
                {events.map((event) => (
                  <option key={event.slug} value={event.slug}>{event.title}</option>
                ))}
              </select>
            </label>

            <div className="grid gap-4 md:grid-cols-2">
              <label className="text-sm text-slate-300">
                Full name
                <input
                  required
                  value={form.fullName}
                  onChange={(event) => handleChange('fullName', event.target.value)}
                  className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white outline-none placeholder:text-slate-500"
                  placeholder="Jane Doe"
                />
              </label>

              <label className="text-sm text-slate-300">
                Email address
                <input
                  required
                  type="email"
                  value={form.email}
                  onChange={(event) => handleChange('email', event.target.value)}
                  className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white outline-none placeholder:text-slate-500"
                  placeholder="jane@example.com"
                />
              </label>

              <label className="text-sm text-slate-300">
                Phone number
                <input
                  required
                  type="tel"
                  value={form.phone}
                  onChange={(event) => handleChange('phone', event.target.value)}
                  className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white outline-none placeholder:text-slate-500"
                  placeholder="+254 712 345 678"
                />
              </label>

              <label className="text-sm text-slate-300 md:col-span-2">
                Role
                <input
                  value={form.role}
                  onChange={(event) => handleChange('role', event.target.value)}
                  className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white outline-none placeholder:text-slate-500"
                  placeholder="Parent and child or Student"
                />
              </label>

              <section className="md:col-span-2" aria-labelledby="registration-tickets-heading">
                <h2 id="registration-tickets-heading" className="text-sm font-semibold text-slate-200">Choose tickets</h2>
                <p className="mt-1 text-xs text-slate-400">
                  Select the ticket types and quantities you need. Add one Child ticket for each child attending.
                </p>
                {availableTicketOptions.length === 0 ? (
                  <p className="mt-3 rounded-lg border border-rose-900 bg-rose-950/30 p-3 text-sm text-rose-200">This event has no priced tickets available.</p>
                ) : (
                  <div className="mt-3 space-y-3">
                    {availableTicketOptions.map((option) => {
                      const quantity = ticketQuantities[option.name] ?? 0;
                      return (
                        <div key={option.name} className="rounded-xl border border-slate-700 bg-slate-950/60 p-3">
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <div>
                              <h3 className="font-medium text-white">{option.name}</h3>
                              <p className="mt-1 text-xs text-slate-400">
                                KES {Number(option.priceKsh).toLocaleString()} {option.pricingMode === 'family_bundle'
                                  ? 'per family bundle'
                                  : `per person${(option.peoplePerTicket ?? 1) > 1 ? ` · ${option.peoplePerTicket} people per ticket` : ''}`}
                              </p>
                            </div>
                            <label className="flex items-center gap-2 text-sm text-slate-300">
                              Quantity
                              <input
                                type="number"
                                min={0}
                                max={50}
                                step={1}
                                value={quantity}
                                onChange={(event) => {
                                  const nextQuantity = Math.max(0, Math.min(50, Number(event.target.value) || 0));
                                  setTicketQuantities((current) => ({ ...current, [option.name]: nextQuantity }));
                                  if (option.requiresChildDetails) {
                                    setTicketChildren((current) => {
                                      const existing = current[option.name] ?? [];
                                      return {
                                        ...current,
                                        [option.name]: Array.from({ length: nextQuantity }, (_, index) =>
                                          existing[index] ?? { name: '', age: '' },
                                        ),
                                      };
                                    });
                                  }
                                }}
                                className="w-20 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white"
                                aria-label={`${option.name} quantity`}
                              />
                            </label>
                          </div>
                          {option.requiresChildDetails && quantity > 0 && (
                            <div className="mt-4 space-y-3 border-t border-slate-800 pt-3">
                              <p className="text-xs font-medium text-slate-300">Child details ({quantity})</p>
                              {(ticketChildren[option.name] ?? []).map((child, index) => (
                                <div key={`${option.name}-${index}`} className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_8rem]">
                                  <label className="text-xs text-slate-400">
                                    Child {index + 1} name
                                    <input
                                      required
                                      maxLength={120}
                                      value={child.name}
                                      onChange={(event) => setTicketChildren((current) => ({
                                        ...current,
                                        [option.name]: (current[option.name] ?? []).map((entry, entryIndex) =>
                                          entryIndex === index ? { ...entry, name: event.target.value } : entry,
                                        ),
                                      }))}
                                      className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
                                    />
                                  </label>
                                  <label className="text-xs text-slate-400">
                                    Age
                                    <input
                                      required
                                      type="number"
                                      min={0}
                                      max={17}
                                      step={1}
                                      value={child.age}
                                      onChange={(event) => setTicketChildren((current) => ({
                                        ...current,
                                        [option.name]: (current[option.name] ?? []).map((entry, entryIndex) =>
                                          entryIndex === index ? { ...entry, age: event.target.value } : entry,
                                        ),
                                      }))}
                                      className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
                                    />
                                  </label>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>

              <label className="text-sm text-slate-300 md:col-span-2">
                What do you need from this event?
                <textarea
                  rows={4}
                  value={form.expectations}
                  onChange={(event) => handleChange('expectations', event.target.value)}
                  className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white outline-none placeholder:text-slate-500"
                  placeholder="Describe what you need or what you hope to learn."
                />
              </label>

              <label className="text-sm text-slate-300 md:col-span-2">
                Dietary / accessibility requirements
                <textarea
                  rows={3}
                  value={form.dietaryRequirements}
                  onChange={(event) => handleChange('dietaryRequirements', event.target.value)}
                  className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white outline-none placeholder:text-slate-500"
                  placeholder="Vegetarian meal, wheelchair access, interpreter support..."
                />
              </label>
            </div>

            <label className="flex items-start gap-3 rounded-xl border border-slate-700 bg-slate-950/60 p-3 text-sm text-slate-300">
              <input
                required
                type="checkbox"
                checked={form.agree}
                onChange={(event) => handleChange('agree', event.target.checked)}
                className="mt-1 h-4 w-4 rounded border-slate-600 bg-slate-900 text-sky-400"
              />
              <span>
                I agree to receive event updates and confirm that the information above is correct.
              </span>
            </label>

            <button disabled={!selectedEvent || selectedTicketLines.length === 0 || missingChildren || isSubmitting || !!registrationId} type="submit" className="w-full rounded-lg bg-[#e8c49a] px-4 py-3 font-semibold text-[#12261b] shadow-[0_8px_20px_rgba(232,196,154,0.14)] transition enabled:hover:bg-[#d4a574] disabled:cursor-not-allowed disabled:opacity-50">
              {isSubmitting ? 'Starting M-Pesa payment…' : selectedTicketLines.length > 0 ? `Register and pay KES ${totalPriceKsh.toLocaleString()}` : 'Select tickets to continue'}
            </button>
            <p className="text-xs text-slate-500">The server charges the saved price for your selected ticket type. Approve the STK prompt on the M-Pesa phone number you entered.</p>
          </form>

          <aside className="w-full rounded-2xl border border-[#3d5d4b] bg-[#193324] p-4 shadow-[0_18px_44px_rgba(0,0,0,0.18)] sm:p-6">
            <p className="text-xs uppercase tracking-[0.22em] text-sky-400">Selected event</p>
            {selectedEvent ? (
              <>
                {selectedPosterUrl && <img src={selectedPosterUrl} alt={`${selectedEvent.title} event poster`} loading="lazy" className="mb-4 aspect-[16/9] w-full rounded-xl border border-slate-700 bg-slate-950 object-contain" />}
                <h2 className="mt-3 text-2xl font-bold text-white">{selectedEvent.title}</h2>
                <p className="mt-2 text-sm text-slate-300">{selectedEvent.date}</p>
                <p className="mt-1 text-sm text-slate-300">{selectedEvent.location}</p>
                <div className="mt-4 rounded-lg border border-slate-700 bg-slate-950 px-3 py-3 text-sm text-slate-200">
                  <p className="font-medium">Ticket total: KES {totalPriceKsh.toLocaleString()}</p>
                  {selectedTicketLines.map((line) => (
                    <p key={line.option.name} className="mt-1 text-xs text-slate-400">
                      {line.option.name} × {line.quantity}: KES {line.lineTotal.toLocaleString()}
                    </p>
                  ))}
                </div>
              </>
            ) : (
              <p className="mt-3 text-sm text-slate-300">
                {isLoadingEvents ? 'Loading events from the database...' : 'No event is currently selected.'}
              </p>
            )}

            {registrationId && (
              <div className="mt-6 rounded-xl border border-emerald-800 bg-emerald-950/30 p-4 text-sm text-emerald-200">
                <p>Registration saved for {selectedEvent?.title ?? 'the selected event'}.</p>
                {paymentStatus?.status === 'paid' ? (
                  <p className="mt-2">Payment successful{paymentStatus.receiptNumber ? ` · M-Pesa receipt ${paymentStatus.receiptNumber}` : ''}.</p>
                ) : paymentStatus?.status === 'pending' ? (
                  <p className="mt-2">
                    Daraja accepted the STK request, but that does not confirm a prompt reached your phone. Check your M-Pesa messages; we will recheck automatically. Please do not start another attempt while this one is pending.
                    {paymentStatus.resultDescription && ` Latest detail: ${paymentStatus.resultDescription}`}
                    {reconciliationError && ` Latest check: ${reconciliationError}`}
                  </p>
                ) : paymentStatus?.status === 'failed' ? (
                  <div className="mt-2">
                    <p>
                      Payment was not completed; no successful payment has been confirmed for this attempt.
                      {paymentStatus.resultDescription && /transaction does not exist/i.test(paymentStatus.resultDescription)
                        ? ' M-Pesa has no record of this checkout.'
                        : paymentStatus.resultDescription
                          ? ` M-Pesa reported: ${paymentStatus.resultDescription}`
                          : ''}
                    </p>
                    <p className="mt-2">
                      Check your M-Pesa messages to confirm whether your account was debited. If there was no debit, you can retry below.
                    </p>
                    <button type="button" onClick={retryPayment} disabled={isSubmitting} className="mt-3 rounded-lg border border-emerald-700 px-3 py-2 hover:bg-emerald-900 disabled:opacity-50">
                      {isSubmitting ? 'Starting payment…' : 'Retry M-Pesa payment'}
                    </button>
                  </div>
                ) : (
                  <div className="mt-2">
                    <p>{paymentStatus?.resultDescription ?? 'Payment has not started yet.'}</p>
                    <button type="button" onClick={retryPayment} disabled={isSubmitting} className="mt-3 rounded-lg border border-emerald-700 px-3 py-2 hover:bg-emerald-900 disabled:opacity-50">
                      {isSubmitting ? 'Starting payment…' : 'Start / retry M-Pesa payment'}
                    </button>
                  </div>
                )}
              </div>
            )}
          </aside>
        </div>
      </div>
    </main>
  );
}
