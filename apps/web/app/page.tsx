import { getPublicEventPosterUrl } from '../lib/event-poster-url';
import { getServerApiUrl } from '../lib/api-url';

type Event = {
  slug: string;
  title: string;
  date: string | null;
  location: string | null;
  priceKsh: number;
  ticketOptions?: { priceKsh: number | null }[] | null;
  description: string | null;
  posterUrl: string | null;
  highlights: string[] | null;
};

const API_URL = getServerApiUrl();

export const dynamic = 'force-dynamic';

async function getEvents(): Promise<Event[]> {
  const response = await fetch(`${API_URL}/events`, { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(`The event service returned HTTP ${response.status}.`);
  }

  const data: unknown = await response.json();
  if (!Array.isArray(data)) {
    throw new Error('The events API returned an invalid response.');
  }

  return data as Event[];
}

export default async function Home() {
  let events: Event[] = [];
  let eventLoadError = '';

  try {
    events = await getEvents();
  } catch (error) {
    console.error('Unable to load public events:', error);
    eventLoadError = 'Events are temporarily unavailable. Please try again later.';
  }

  return (
    <main id="main-content" className="min-h-screen px-4 py-6 text-[#1a1a1a] sm:px-5 sm:py-10">
      <div className="mx-auto max-w-6xl">
        <header className="relative w-full overflow-hidden rounded-2xl border border-[#3a6b4a]/20 bg-white p-5 shadow-xl sm:rounded-3xl sm:p-8 md:p-12">
          <div aria-hidden="true" className="absolute -right-16 -top-20 h-52 w-52 rounded-full bg-[#d4a574]/20 blur-2xl" />
          <div aria-hidden="true" className="absolute -bottom-24 left-1/3 h-44 w-44 rounded-full bg-[#3a9cb8]/10 blur-2xl" />
          <div className="relative">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#3a6b4a]">Welcome to NEYD Kenya</p>
            <h1 className="mt-4 max-w-3xl text-3xl font-bold leading-tight text-[#1a1a1a] sm:text-4xl md:text-5xl">
              Educating and improving the society in our community.
            </h1>
          </div>

          <p className="mt-5 max-w-2xl text-lg leading-8 text-[#4a4a4a]">
            NEYD Kenya serves poor and vulnerable people through humanitarian support, education and Daawa,
            health programs, orphan care, and women empowerment. Join our upcoming events and be part of the work.
          </p>

          <div className="mt-8 flex flex-wrap gap-3">
            <a href="#events" className="rounded-xl bg-[#3a6b4a] px-5 py-3 font-semibold text-white transition hover:bg-[#2a4e36]">
              Browse events
            </a>
          </div>
          </div>
        </header>

        <section id="events" className="mt-12">
          <div className="mb-6">
            <p className="text-xs uppercase tracking-[0.22em] text-[#3a6b4a]">Available now</p>
            <h2 className="mt-2 text-3xl font-bold text-[#1a1a1a]">Upcoming events</h2>
          </div>

          {eventLoadError ? (
            <p role="alert" className="rounded-xl border border-rose-300 bg-rose-50 p-4 text-rose-800">
              {eventLoadError}
            </p>
          ) : events.length === 0 ? (
            <p className="rounded-xl border border-[#3a6b4a]/20 bg-white p-4 text-[#4a4a4a]">
              There are no events available at the moment.
            </p>
          ) : (
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {events.map((event) => {
                const posterUrl = getPublicEventPosterUrl(event.posterUrl);
                const availablePrices = event.ticketOptions?.length
                  ? event.ticketOptions
                    .map((option) => option.priceKsh)
                    .filter((price): price is number => price !== null)
                  : [event.priceKsh];
                const startingPrice = Math.min(...availablePrices);
                return (
                <article key={event.slug} className="flex h-full flex-col overflow-hidden rounded-2xl border border-[#d9c9af] bg-white shadow-[0_12px_32px_rgba(18,38,27,0.10)]">
                  {posterUrl ? (
                    <img src={posterUrl} alt={`${event.title} event poster`} loading="lazy" decoding="async" className="aspect-[16/9] w-full bg-[#f7f3ee] object-cover" />
                  ) : (
                    <div aria-hidden="true" className="flex aspect-[16/9] items-center justify-center bg-[#193324] text-sm font-semibold uppercase tracking-[0.2em] text-[#e8c49a]">NEYD Events</div>
                  )}
                  <div className="flex flex-1 flex-col p-5">
                  <div className="flex items-center justify-end">
                    <span className="text-sm font-semibold text-[#2a4e36]">
                      {availablePrices.length ? `Tickets from KES ${Number(startingPrice).toLocaleString()}` : 'Ticket prices to be announced'}
                    </span>
                  </div>

                  <h3 className="mt-3 text-2xl font-bold text-[#1a1a1a]">{event.title}</h3>
                  <div className="mt-3 space-y-2 text-sm text-[#4a4a4a]">
                    {event.date && <p>{event.date}</p>}
                    {event.location && <p>{event.location}</p>}
                  </div>

                  {event.description && (
                    <p className="mt-4 text-sm leading-6 text-[#4a4a4a]">{event.description}</p>
                  )}

                  {!!event.highlights?.length && (
                    <ul className="mt-5 flex flex-wrap gap-2">
                      {event.highlights.map((highlight) => (
                        <li key={highlight} className="rounded-full border border-[#3a6b4a]/20 bg-[#f7f3ee] px-2.5 py-1 text-xs text-[#2a4e36]">
                          {highlight}
                        </li>
                      ))}
                    </ul>
                  )}

                  <a
                    href={`/register?event=${encodeURIComponent(event.slug)}`}
                    className="mt-auto inline-flex w-full items-center justify-center rounded-xl bg-[#3a6b4a] px-4 py-3 font-semibold text-white transition hover:bg-[#2a4e36]"
                  >
                    Register now
                  </a>
                  </div>
                </article>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
