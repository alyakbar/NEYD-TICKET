'use client';

import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { getPublicEventPosterUrl } from '../../../lib/event-poster-url';
import { getBrowserApiUrl } from '../../../lib/api-url';

const API_URL = getBrowserApiUrl();

type EventRecord = {
  id: string;
  slug: string;
  title: string;
  date: string | null;
  location: string | null;
  priceKsh: number;
  description: string | null;
  posterUrl: string | null;
  highlights: string[] | null;
  isArchived: boolean;
};

type EventForm = {
  slug: string;
  title: string;
  date: string;
  location: string;
  priceKsh: string;
  description: string;
  posterUrl: string;
  highlights: string;
};

const emptyForm: EventForm = {
  slug: '',
  title: '',
  date: '',
  location: '',
  priceKsh: '5',
  description: '',
  posterUrl: '',
  highlights: '',
};

function toDateInputValue(value: string | null): string {
  if (!value) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '';
  const year = parsed.getUTCFullYear();
  const month = String(parsed.getUTCMonth() + 1).padStart(2, '0');
  const day = String(parsed.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

async function responseError(response: Response): Promise<string> {
  const body = await response.json().catch(() => ({}));
  if (typeof body.message === 'string') return body.message;
  if (Array.isArray(body.message)) return body.message.join(', ');
  return `Request failed (${response.status}).`;
}

export default function AdminEventsPage() {
  const [events, setEvents] = useState<EventRecord[]>([]);
  const [token, setToken] = useState('');
  const [authReady, setAuthReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busyEventId, setBusyEventId] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [editingId, setEditingId] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<EventForm>(emptyForm);
  const [uploading, setUploading] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  const loadEvents = useCallback(async (accessToken: string) => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch(`${API_URL}/events/admin`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        cache: 'no-store',
      });
      if (!response.ok) {
        if (response.status === 404) {
          throw new Error('The running API does not include event management routes. Restart the API with the latest code.');
        }
        if (response.status === 401) {
          sessionStorage.removeItem('neyd-admin-token');
          sessionStorage.removeItem('neyd-admin-user');
          setToken('');
        }
        throw new Error(await responseError(response));
      }
      const data: unknown = await response.json();
      if (!Array.isArray(data)) throw new Error('The events API returned an invalid response.');
      setEvents(data as EventRecord[]);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to load events.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const savedToken = sessionStorage.getItem('neyd-admin-token');
    setAuthReady(true);
    if (savedToken) {
      setToken(savedToken);
      void loadEvents(savedToken);
    } else {
      setLoading(false);
    }
  }, [loadEvents]);

  function startCreate() {
    setEditingId('');
    setForm(emptyForm);
    setShowForm(true);
    setError('');
    setNotice('');
    setTimeout(() => {
      formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 50);
  }

  async function handleFileUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.type)) {
      setError('Please select a PNG, JPEG, WEBP, or GIF image.');
      return;
    }
    if (file.size > 4 * 1024 * 1024) {
      setError('Image must be 4 MB or smaller.');
      return;
    }

    setUploading(true);
    setError('');
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch('/api/upload-poster', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: formData,
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || 'Upload failed.');
      }
      const data = await res.json();
      setForm((prev) => ({ ...prev, posterUrl: data.url }));
      setNotice('Poster image uploaded successfully.');
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : 'Image upload failed.');
    } finally {
      setUploading(false);
      event.target.value = '';
    }
  }

  function startEditing(event: EventRecord) {
    setEditingId(event.id);
    setForm({
      slug: event.slug,
      title: event.title,
      date: toDateInputValue(event.date),
      location: event.location ?? '',
      priceKsh: String(event.priceKsh),
      description: event.description ?? '',
      posterUrl: event.posterUrl ?? '',
      highlights: (event.highlights ?? []).join('\n'),
    });
    setShowForm(true);
    setError('');
    setNotice('');
    setTimeout(() => {
      formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 50);
  }

  async function saveEvent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError('');
    setNotice('');
    const payload = {
      ...form,
      slug: form.slug.trim().toLowerCase(),
      title: form.title.trim(),
      date: form.date.trim(),
      location: form.location.trim(),
      priceKsh: Number(form.priceKsh),
      description: form.description.trim(),
      posterUrl: form.posterUrl.trim() || null,
      highlights: form.highlights.split('\n').map((item) => item.trim()).filter(Boolean),
    };
    try {
      const response = await fetch(
        `${API_URL}/events${editingId ? `/${encodeURIComponent(editingId)}` : ''}`,
        {
          method: editingId ? 'PATCH' : 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        },
      );
      if (!response.ok) throw new Error(await responseError(response));
      setShowForm(false);
      setEditingId('');
      setForm(emptyForm);
      setNotice(editingId ? 'Event updated.' : 'Event created and published.');
      await loadEvents(token);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to save event.');
    } finally {
      setSaving(false);
    }
  }

  async function changeArchiveState(event: EventRecord) {
    const action = event.isArchived ? 'restore' : 'archive';
    const prompt = event.isArchived
      ? `Restore "${event.title}" to the public events page?`
      : `Archive "${event.title}"? It will disappear from public listings, but registrations and payment history will be preserved.`;
    if (!window.confirm(prompt)) return;

    setBusyEventId(event.id);
    setError('');
    setNotice('');
    try {
      const response = await fetch(`${API_URL}/events/${encodeURIComponent(event.id)}/${action}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error(await responseError(response));
      setNotice(event.isArchived ? 'Event restored to public listings.' : 'Event archived. Registrations and payment history were preserved.');
      await loadEvents(token);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to change event status.');
    } finally {
      setBusyEventId('');
    }
  }

  const formPosterUrl = getPublicEventPosterUrl(form.posterUrl);

  if (!authReady || (loading && !token)) {
    return <main id="main-content" className="min-h-screen px-4 py-6 text-slate-300 sm:px-5 sm:py-10">Loading organizer access…</main>;
  }

  if (!token) {
    return (
      <main id="main-content" className="flex min-h-screen items-center justify-center px-4 py-8 text-slate-100 sm:px-5 sm:py-10">
        <section className="w-full max-w-lg rounded-2xl border border-slate-800 bg-slate-900 p-4 text-center sm:p-8">
          <p className="text-xs uppercase tracking-[0.22em] text-sky-400">Organizer admin</p>
          <h1 className="mt-3 text-2xl font-bold text-white">Sign in to manage events</h1>
          <p className="mt-3 text-slate-300">Only authorized administrators can create, edit, or archive events.</p>
          <a href="/admin" className="mt-6 inline-flex rounded-xl bg-sky-400 px-5 py-3 font-semibold text-slate-950 hover:bg-sky-300">
            Go to admin sign in
          </a>
        </section>
      </main>
    );
  }

  return (
    <main id="main-content" className="min-h-screen px-4 py-6 text-slate-100 sm:px-5 sm:py-10">
      <div className="mx-auto max-w-6xl">
        <header className="mb-6 flex flex-wrap items-center justify-between gap-4 sm:mb-8">
          <div>
            <a href="/admin" className="text-sm text-sky-300 hover:text-sky-200">← Back to dashboard</a>
            <p className="mt-4 text-xs uppercase tracking-[0.22em] text-sky-400">Organizer admin</p>
            <h1 className="mt-2 text-3xl font-bold text-white">Manage events</h1>
            <p className="mt-2 text-sm text-slate-400">Archived events are hidden publicly; registrations and payment records are kept.</p>
          </div>
          <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:flex-wrap">
            <button type="button" onClick={() => void loadEvents(token)} disabled={loading} className="rounded-xl border border-slate-700 px-4 py-2 text-sm hover:bg-slate-800 disabled:opacity-50">
              {loading ? 'Refreshing…' : 'Refresh'}
            </button>
            <a href="/admin/attendees" className="rounded-xl border border-slate-700 px-4 py-2 text-sm hover:bg-slate-800">
              Event attendees
            </a>
            <button type="button" onClick={startCreate} className="rounded-xl bg-sky-400 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-sky-300">
              Create event
            </button>
          </div>
        </header>

        {error && <p role="alert" className="mb-5 rounded-xl border border-rose-900 bg-rose-950/40 p-4 text-sm text-rose-200">{error}</p>}
        {notice && <p role="status" className="mb-5 rounded-xl border border-emerald-900 bg-emerald-950/40 p-4 text-sm text-emerald-200">{notice}</p>}

        {showForm && (
          <form ref={formRef} onSubmit={saveEvent} className="mb-8 rounded-2xl border border-[#4f715c] bg-[#193324] p-4 scroll-mt-6 shadow-[0_18px_44px_rgba(0,0,0,0.16)] sm:p-6">
            <h2 className="text-xl font-semibold text-white">{editingId ? 'Edit event' : 'Create event'}</h2>
            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <label className="text-sm text-slate-300">Event title
                <input required minLength={3} maxLength={255} value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white" />
              </label>
              <label className="text-sm text-slate-300">URL slug
                <input required pattern="[a-z0-9]+(?:-[a-z0-9]+)*" value={form.slug} onChange={(event) => setForm({ ...form, slug: event.target.value })} placeholder="community-summit" className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white" />
              </label>
              <label className="text-sm text-slate-300">Date
                <input type="date" value={form.date} onChange={(event) => setForm({ ...form, date: event.target.value })} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white" />
              </label>
              <label className="text-sm text-slate-300">Location
                <input maxLength={255} value={form.location} onChange={(event) => setForm({ ...form, location: event.target.value })} placeholder="Venue, city" className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white" />
              </label>
              <label className="text-sm text-slate-300">Price (KES)
                <input required type="number" min={1} max={250000} step={1} value={form.priceKsh} onChange={(event) => setForm({ ...form, priceKsh: event.target.value })} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white" />
              </label>
              <label className="text-sm text-slate-300 md:col-span-2">Description
                <textarea maxLength={5000} rows={3} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white" />
              </label>
              <div className="text-sm text-slate-300 md:col-span-2">
                <span className="font-medium">Poster image</span>
                <div className="mt-2 flex flex-wrap items-center gap-3">
                  <label className="cursor-pointer inline-flex items-center gap-2 rounded-lg border border-sky-500/40 bg-sky-950/40 px-4 py-2 text-sm font-semibold text-sky-200 transition hover:bg-sky-900/60 hover:text-white">
                    {uploading ? 'Uploading…' : '📁 Upload image file'}
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp,image/gif"
                      onChange={handleFileUpload}
                      disabled={uploading}
                      className="hidden"
                    />
                  </label>
                  <span className="text-xs text-slate-400">or paste a URL / path below</span>
                </div>
                <input
                  type="text"
                  maxLength={2048}
                  value={form.posterUrl}
                  onChange={(event) => setForm({ ...form, posterUrl: event.target.value })}
                  placeholder="/posters/neyd-event-poster.jpg or https://..."
                  className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white"
                />
                <span className="mt-1 block text-xs text-slate-400">
                  Upload a PNG, JPEG, WEBP, or GIF image (up to 4 MB), or enter a public hosted HTTPS URL.
                </span>
                {formPosterUrl && (
                  <div className="mt-3">
                    <span className="block text-xs text-slate-400 mb-1">Preview:</span>
                    <img
                      src={formPosterUrl}
                      alt="Poster preview"
                      loading="lazy"
                      className="aspect-[16/9] max-h-64 rounded-lg border border-slate-700 bg-slate-950 object-contain"
                    />
                  </div>
                )}
              </div>
              <label className="text-sm text-slate-300 md:col-span-2">Highlights (one per line)
                <textarea rows={3} value={form.highlights} onChange={(event) => setForm({ ...form, highlights: event.target.value })} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white" />
              </label>
            </div>
            <div className="mt-5 flex gap-3">
              <button type="submit" disabled={saving} className="rounded-lg bg-[#e8c49a] px-4 py-2 font-semibold text-[#12261b] disabled:opacity-50 enabled:hover:bg-[#d4a574]">
                {saving ? 'Saving…' : editingId ? 'Save changes' : 'Create event'}
              </button>
              <button type="button" onClick={() => { setShowForm(false); setEditingId(''); }} className="rounded-lg border border-slate-700 px-4 py-2 text-slate-200 hover:bg-slate-800">
                Cancel
              </button>
            </div>
          </form>
        )}

        {loading ? (
          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6 text-slate-300">Loading events…</div>
        ) : error && events.length === 0 ? (
          <div className="rounded-2xl border border-rose-900 bg-rose-950/40 p-6 text-rose-200">
            Event data could not be loaded. Restart or check the API, then use Refresh.
          </div>
        ) : events.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-700 bg-slate-900 p-8 text-center text-slate-400">
            No events exist yet. Create an event to publish it on the event page.
          </div>
        ) : (
          <div className="space-y-4">
            {events.map((event) => {
              const posterUrl = getPublicEventPosterUrl(event.posterUrl);
              return (
              <article key={event.id} className={`w-full rounded-2xl border bg-slate-900 p-4 sm:p-5 ${event.isArchived ? 'border-amber-900/70 opacity-80' : 'border-slate-800'}`}>
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    {posterUrl && <img src={posterUrl} alt={`${event.title} event poster`} loading="lazy" className="mb-4 aspect-[16/9] max-h-56 rounded-lg border border-slate-700 bg-slate-950 object-contain" />}
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-xl font-semibold text-white">{event.title}</h2>
                      <span className={`rounded-full border px-2.5 py-1 text-xs ${event.isArchived ? 'border-amber-700 text-amber-200' : 'border-emerald-700 text-emerald-200'}`}>
                        {event.isArchived ? 'Archived' : 'Published'}
                      </span>
                    </div>
                    <p className="mt-1 font-mono text-xs text-slate-500">/{event.slug}</p>
                    <p className="mt-3 text-sm text-slate-300">
                      {[event.date, event.location].filter(Boolean).join(' · ') || 'Date and location not set'}
                      {' · '}KES {Number(event.priceKsh).toLocaleString()}
                    </p>
                    {event.description && <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-400">{event.description}</p>}
                    {!!event.highlights?.length && (
                      <ul className="mt-3 flex flex-wrap gap-2">
                        {event.highlights.map((highlight) => <li key={highlight} className="rounded-full border border-slate-700 px-2.5 py-1 text-xs text-slate-300">{highlight}</li>)}
                      </ul>
                    )}
                  </div>
                  <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto">
                    <button type="button" onClick={() => startEditing(event)} className="rounded-lg border border-slate-700 px-3 py-2 text-sm hover:bg-slate-800">
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => void changeArchiveState(event)}
                      disabled={busyEventId === event.id}
                      className="rounded-lg border border-amber-800 px-3 py-2 text-sm text-amber-200 hover:bg-amber-950 disabled:opacity-50"
                    >
                      {busyEventId === event.id ? 'Saving…' : event.isArchived ? 'Restore' : 'Archive'}
                    </button>
                  </div>
                </div>
              </article>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
