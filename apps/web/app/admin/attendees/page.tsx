'use client';

import { FormEvent, Fragment, useCallback, useEffect, useMemo, useState } from 'react';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api';

type Attendee = {
  id: string;
  fullName: string;
  email: string;
  phone: string;
  company?: string | null;
  role?: string | null;
  ticketType?: string;
  expectations?: string | null;
  dietaryRequirements?: string | null;
  paymentStatus: string;
  ticketCode?: string | null;
  ticketEmailStatus?: string;
  createdAt: string;
  event?: {
    id: string;
    title: string;
    date?: string | null;
    location?: string | null;
  } | null;
};

type AttendeeForm = {
  fullName: string;
  email: string;
  phone: string;
  company: string;
  role: string;
  ticketType: string;
  expectations: string;
  dietaryRequirements: string;
};

const emptyForm: AttendeeForm = {
  fullName: '',
  email: '',
  phone: '',
  company: '',
  role: '',
  ticketType: 'General Admission',
  expectations: '',
  dietaryRequirements: '',
};

async function responseError(response: Response): Promise<string> {
  const body = await response.json().catch(() => ({}));
  if (typeof body.message === 'string') return body.message;
  if (Array.isArray(body.message)) return body.message.join(', ');
  return `Request failed (${response.status}).`;
}

export default function EventAttendeesPage() {
  const [attendees, setAttendees] = useState<Attendee[]>([]);
  const [token, setToken] = useState('');
  const [authReady, setAuthReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [editingId, setEditingId] = useState('');
  const [form, setForm] = useState<AttendeeForm>(emptyForm);
  const [search, setSearch] = useState('');
  const [eventFilter, setEventFilter] = useState('');

  const loadAttendees = useCallback(async (accessToken: string) => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch(`${API_URL}/event-registrations`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        cache: 'no-store',
      });
      if (!response.ok) {
        if (response.status === 401) {
          sessionStorage.removeItem('neyd-admin-token');
          sessionStorage.removeItem('neyd-admin-user');
          setToken('');
        }
        throw new Error(await responseError(response));
      }
      const data: unknown = await response.json();
      if (!Array.isArray(data)) throw new Error('The attendees API returned an invalid response.');
      setAttendees(data as Attendee[]);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to load attendees.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const savedToken = sessionStorage.getItem('neyd-admin-token');
    setAuthReady(true);
    if (savedToken) {
      setToken(savedToken);
      void loadAttendees(savedToken);
    } else {
      setLoading(false);
    }
  }, [loadAttendees]);

  const eventOptions = useMemo(() => {
    const options = new Map<string, string>();
    for (const attendee of attendees) {
      if (attendee.event) options.set(attendee.event.id, attendee.event.title);
    }
    return [...options.entries()].map(([id, title]) => ({ id, title }));
  }, [attendees]);

  const filteredAttendees = useMemo(() => {
    const term = search.trim().toLowerCase();
    return attendees.filter((attendee) => {
      const matchesEvent = !eventFilter || attendee.event?.id === eventFilter;
      const matchesSearch = !term ||
        attendee.fullName.toLowerCase().includes(term) ||
        attendee.email.toLowerCase().includes(term) ||
        attendee.phone.toLowerCase().includes(term);
      return matchesEvent && matchesSearch;
    });
  }, [attendees, eventFilter, search]);

  function startEditing(attendee: Attendee) {
    setEditingId(attendee.id);
    setForm({
      fullName: attendee.fullName,
      email: attendee.email,
      phone: attendee.phone,
      company: attendee.company ?? '',
      role: attendee.role ?? '',
      ticketType: attendee.ticketType ?? 'General Admission',
      expectations: attendee.expectations ?? '',
      dietaryRequirements: attendee.dietaryRequirements ?? '',
    });
    setError('');
    setNotice('');
  }

  async function saveAttendee(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingId || !token) return;
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const response = await fetch(`${API_URL}/event-registrations/${encodeURIComponent(editingId)}`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(form),
      });
      if (!response.ok) throw new Error(await responseError(response));
      const updated: Attendee = await response.json();
      setAttendees((current) => current.map((attendee) => attendee.id === updated.id ? updated : attendee));
      setEditingId('');
      setNotice('Attendee details updated. Payment status and existing tickets were not changed.');
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to update attendee.');
    } finally {
      setSaving(false);
    }
  }

  if (!authReady || (loading && !token)) {
    return <main className="min-h-screen p-8 text-slate-300">Loading organizer access…</main>;
  }

  if (!token) {
    return (
      <main className="flex min-h-screen items-center justify-center px-5 py-10 text-slate-100">
        <section className="w-full max-w-lg rounded-2xl border border-slate-800 bg-slate-900 p-8 text-center">
          <p className="text-xs uppercase tracking-[0.22em] text-sky-400">Organizer admin</p>
          <h1 className="mt-3 text-2xl font-bold text-white">Sign in to view attendees</h1>
          <p className="mt-3 text-slate-300">Event registration details are available to authorized administrators.</p>
          <a href="/admin" className="mt-6 inline-flex rounded-xl bg-sky-400 px-5 py-3 font-semibold text-slate-950 hover:bg-sky-300">
            Go to admin sign in
          </a>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen px-5 py-10 text-slate-100">
      <div className="mx-auto max-w-7xl">
        <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <div>
            <a href="/" className="text-sm text-sky-300 hover:text-sky-200">← Back to events</a>
            <p className="mt-4 text-xs uppercase tracking-[0.22em] text-sky-400">Organizer admin</p>
            <h1 className="mt-2 text-3xl font-bold text-white">Event attendees</h1>
            <p className="mt-2 text-sm text-slate-400">{attendees.length} registration{attendees.length === 1 ? '' : 's'} across all events</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <a href="/admin/events" className="rounded-xl border border-slate-700 px-4 py-2 text-sm text-slate-200 hover:bg-slate-800">
              Manage events
            </a>
            <button
              type="button"
              onClick={() => void loadAttendees(token)}
              disabled={loading}
              className="rounded-xl border border-slate-700 px-4 py-2 text-sm text-slate-200 hover:bg-slate-800 disabled:opacity-50"
            >
              {loading ? 'Refreshing…' : 'Refresh'}
            </button>
            <a href="/admin" className="rounded-xl border border-slate-700 px-4 py-2 text-sm text-slate-200 hover:bg-slate-800">
              Ticket dashboard
            </a>
          </div>
        </header>

        {error && <p role="alert" className="mb-5 rounded-xl border border-rose-900 bg-rose-950/40 p-4 text-sm text-rose-200">{error}</p>}
        {notice && <p role="status" className="mb-5 rounded-xl border border-emerald-900 bg-emerald-950/40 p-4 text-sm text-emerald-200">{notice}</p>}

        <section className="mb-5 grid gap-3 rounded-2xl border border-slate-800 bg-slate-900 p-4 md:grid-cols-[1fr_18rem]">
          <label className="text-sm text-slate-300">
            Search attendee
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Name, email, or phone"
              className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white"
            />
          </label>
          <label className="text-sm text-slate-300">
            Event
            <select
              value={eventFilter}
              onChange={(event) => setEventFilter(event.target.value)}
              className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white"
            >
              <option value="">All events</option>
              {eventOptions.map((option) => <option key={option.id} value={option.id}>{option.title}</option>)}
            </select>
          </label>
        </section>

        {loading ? (
          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6 text-slate-300">Loading attendees…</div>
        ) : filteredAttendees.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-700 bg-slate-900 p-8 text-center text-slate-400">
            {attendees.length === 0 ? 'No attendees have registered yet.' : 'No registrations match these filters.'}
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900">
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-slate-950 text-slate-300">
                  <tr>
                    <th className="px-4 py-3">Attendee</th>
                    <th className="px-4 py-3">Event</th>
                    <th className="px-4 py-3">Contact</th>
                    <th className="px-4 py-3">Ticket</th>
                    <th className="px-4 py-3">Payment</th>
                    <th className="px-4 py-3">Email</th>
                    <th className="px-4 py-3">Registered</th>
                    <th className="px-4 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredAttendees.map((attendee) => (
                    <Fragment key={attendee.id}>
                      <tr className="border-t border-slate-800 text-slate-200">
                        <td className="px-4 py-3">
                          <div className="font-medium text-white">{attendee.fullName}</div>
                          {attendee.company && <div className="text-xs text-slate-400">{attendee.company}</div>}
                          {attendee.role && <div className="text-xs text-slate-500">{attendee.role}</div>}
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-medium text-white">{attendee.event?.title ?? 'Event'}</div>
                          {attendee.event?.date && <div className="text-xs text-slate-400">{attendee.event.date}</div>}
                          {attendee.event?.location && <div className="text-xs text-slate-500">{attendee.event.location}</div>}
                        </td>
                        <td className="px-4 py-3">
                          <div>{attendee.email}</div>
                          <div className="text-xs text-slate-400">{attendee.phone}</div>
                        </td>
                        <td className="px-4 py-3">
                          <div>{attendee.ticketType ?? 'General Admission'}</div>
                          {attendee.ticketCode && <div className="mt-1 font-mono text-xs text-slate-400">{attendee.ticketCode}</div>}
                          {attendee.dietaryRequirements && <div className="mt-1 text-xs text-slate-400">Diet: {attendee.dietaryRequirements}</div>}
                        </td>
                        <td className="px-4 py-3 capitalize">{attendee.paymentStatus}</td>
                        <td className="px-4 py-3 capitalize">{attendee.ticketEmailStatus?.replace('_', ' ') ?? 'Not sent'}</td>
                        <td className="px-4 py-3">{new Date(attendee.createdAt).toLocaleDateString()}</td>
                        <td className="px-4 py-3">
                          <button
                            type="button"
                            onClick={() => startEditing(attendee)}
                            className="rounded-lg border border-sky-700 px-3 py-2 text-sm text-sky-200 hover:bg-sky-950"
                          >
                            Edit
                          </button>
                        </td>
                      </tr>
                      {editingId === attendee.id && (
                        <tr className="border-t border-slate-800">
                          <td colSpan={8} className="p-4">
                            <form onSubmit={saveAttendee} className="rounded-xl border border-slate-700 bg-slate-950 p-5">
                              <h2 className="mb-4 text-lg font-semibold text-white">Update attendee details</h2>
                              <div className="grid gap-4 md:grid-cols-2">
                                <label className="text-sm text-slate-300">Full name
                                  <input required minLength={2} maxLength={120} value={form.fullName} onChange={(event) => setForm({ ...form, fullName: event.target.value })} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-white" />
                                </label>
                                <label className="text-sm text-slate-300">Email
                                  <input required type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-white" />
                                </label>
                                <label className="text-sm text-slate-300">Phone
                                  <input required minLength={7} maxLength={25} value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-white" />
                                </label>
                                <label className="text-sm text-slate-300">Ticket type
                                  <input required maxLength={80} value={form.ticketType} onChange={(event) => setForm({ ...form, ticketType: event.target.value })} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-white" />
                                </label>
                                <label className="text-sm text-slate-300">Company
                                  <input maxLength={120} value={form.company} onChange={(event) => setForm({ ...form, company: event.target.value })} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-white" />
                                </label>
                                <label className="text-sm text-slate-300">Role
                                  <input maxLength={120} value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value })} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-white" />
                                </label>
                                <label className="text-sm text-slate-300 md:col-span-2">Dietary requirements
                                  <textarea maxLength={1000} rows={2} value={form.dietaryRequirements} onChange={(event) => setForm({ ...form, dietaryRequirements: event.target.value })} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-white" />
                                </label>
                                <label className="text-sm text-slate-300 md:col-span-2">Expectations
                                  <textarea maxLength={4000} rows={3} value={form.expectations} onChange={(event) => setForm({ ...form, expectations: event.target.value })} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-white" />
                                </label>
                              </div>
                              <p className="mt-4 text-xs text-slate-400">Payment status, ticket code, and event assignment cannot be changed here.</p>
                              <div className="mt-4 flex gap-3">
                                <button type="submit" disabled={saving} className="rounded-lg bg-sky-400 px-4 py-2 font-semibold text-slate-950 disabled:opacity-50">
                                  {saving ? 'Saving…' : 'Save attendee'}
                                </button>
                                <button type="button" onClick={() => setEditingId('')} className="rounded-lg border border-slate-700 px-4 py-2 text-slate-200 hover:bg-slate-800">
                                  Cancel
                                </button>
                              </div>
                            </form>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
