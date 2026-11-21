'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';

const API_URL = process.env.NEXT_PUBLIC_API_URL
  ?? (process.env.NODE_ENV === 'production' ? '/api' : 'http://localhost:3001/api');

type Operator = {
  email: string;
  role: string;
  organizationId: string | null;
};

type Ticket = {
  id: string;
  title: string;
  description: string;
  status: string;
  priority: string;
  requesterName: string;
  requesterEmail: string;
  assignee?: string;
  department?: string;
  createdAt: string;
};

async function readError(response: Response): Promise<string> {
  const body = await response.json().catch(() => ({}));
  return body.message ?? `Request failed (${response.status}).`;
}

export default function Home() {
  const [operator, setOperator] = useState<Operator | null>(null);
  const [token, setToken] = useState('');
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [assignees, setAssignees] = useState<Record<string, string>>({});
  const [busyTicket, setBusyTicket] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const loadTickets = useCallback(async (accessToken: string) => {
    const response = await fetch(`${API_URL}/tickets`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: 'no-store',
    });
    if (!response.ok) {
      if (response.status === 401) {
        sessionStorage.removeItem('neyd-admin-token');
        setToken('');
        setOperator(null);
      }
      throw new Error(await readError(response));
    }
    setTickets(await response.json());
  }, []);

  useEffect(() => {
    const saved = sessionStorage.getItem('neyd-admin-token');
    const savedOperator = sessionStorage.getItem('neyd-admin-user');
    if (saved && savedOperator) {
      setToken(saved);
      setOperator(JSON.parse(savedOperator) as Operator);
      loadTickets(saved).catch((requestError: Error) => setError(requestError.message));
    }
  }, [loadTickets]);

  const openCount = useMemo(() => tickets.filter((ticket) => !['resolved', 'closed'].includes(ticket.status)).length, [tickets]);

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError('');
    try {
      const response = await fetch(`${API_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      if (!response.ok) throw new Error(await readError(response));
      const result = await response.json();
      sessionStorage.setItem('neyd-admin-token', result.accessToken);
      sessionStorage.setItem('neyd-admin-user', JSON.stringify(result.user));
      setToken(result.accessToken);
      setOperator(result.user);
      setPassword('');
      await loadTickets(result.accessToken);
    } catch (requestError) {
      setError((requestError as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function ticketAction(ticketId: string, action: 'approve' | 'assign') {
    if (!operator) return;
    setBusyTicket(ticketId);
    setError('');
    try {
      const response = await fetch(`${API_URL}/tickets/${ticketId}/${action}`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        ...(action === 'assign' ? { body: JSON.stringify({ assigneeEmail: assignees[ticketId] ?? '' }) } : {}),
      });
      if (!response.ok) throw new Error(await readError(response));
      await loadTickets(token);
    } catch (requestError) {
      setError((requestError as Error).message);
    } finally {
      setBusyTicket('');
    }
  }

  function signOut() {
    sessionStorage.removeItem('neyd-admin-token');
    sessionStorage.removeItem('neyd-admin-user');
    setToken('');
    setOperator(null);
    setTickets([]);
  }

  if (!operator || !token) {
    return (
      <main className="flex min-h-screen items-center justify-center px-6 py-12 text-slate-100">
        <form onSubmit={signIn} className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-8 shadow-2xl">
          <p className="text-xs uppercase tracking-[0.22em] text-sky-400">NEYD Enterprise</p>
          <h1 className="mt-3 text-2xl font-bold text-white">Operator sign in</h1>
          <p className="mt-2 text-sm text-slate-400">Customers do not need an account. Sign in here to manage tickets.</p>
          <label className="mt-6 block text-sm text-slate-300">
            Work email
            <input required type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white" />
          </label>
          <label className="mt-4 block text-sm text-slate-300">
            Password
            <input required type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white" />
          </label>
          {error && <p role="alert" className="mt-4 rounded-lg bg-rose-950/60 p-3 text-sm text-rose-200">{error}</p>}
          <button disabled={loading} className="mt-6 w-full rounded-lg bg-sky-400 px-4 py-2.5 font-semibold text-slate-950 disabled:opacity-60">
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
          <a href="/request" className="mt-5 block text-center text-sm text-sky-300 hover:text-sky-200">Submit a request or purchase without signing in</a>
        </form>
      </main>
    );
  }

  const role = operator.role.toLowerCase();
  const canApprove = ['super-administrator', 'organization-admin', 'it-director', 'department-head', 'it-support-manager'].includes(role);
  const canAssign = ['super-administrator', 'organization-admin', 'it-director', 'department-head', 'it-support-manager', 'it-support-agent'].includes(role);

  return (
    <main className="min-h-screen px-6 py-10 text-slate-100">
      <div className="mx-auto max-w-7xl">
        <header className="mb-8 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-800 bg-slate-900/80 p-5 shadow-xl">
          <div>
            <p className="text-xs uppercase tracking-[0.22em] text-sky-400">NEYD Enterprise</p>
            <h1 className="mt-2 text-3xl font-bold text-white">IT Service Management</h1>
            <p className="mt-1 text-sm text-slate-400">{operator.email} · {operator.role}</p>
          </div>
          <div className="flex items-center gap-3">
            <a href="/admin/events" className="rounded-xl border border-slate-700 px-4 py-2 text-sm text-slate-200 hover:bg-slate-800">Manage events</a>
            <a href="/admin/attendees" className="rounded-xl border border-slate-700 px-4 py-2 text-sm text-slate-200 hover:bg-slate-800">Event attendees</a>
            <a href="/request" className="rounded-xl bg-sky-400 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-sky-300">Public request form</a>
            <button onClick={signOut} className="rounded-xl border border-slate-700 px-4 py-2 text-sm text-slate-200 hover:bg-slate-800">Sign out</button>
          </div>
        </header>

        {error && <p role="alert" className="mb-5 rounded-xl border border-rose-900 bg-rose-950/50 p-4 text-sm text-rose-200">{error}</p>}

        <section className="grid gap-4 md:grid-cols-3">
          {[
            { label: 'Tickets in queue', value: tickets.length },
            { label: 'Open tickets', value: openCount },
            { label: 'Awaiting approval', value: tickets.filter((ticket) => ticket.status === 'new').length },
          ].map((stat) => (
            <div key={stat.label} className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
              <p className="text-sm text-slate-400">{stat.label}</p>
              <p className="mt-3 text-3xl font-bold text-white">{stat.value}</p>
            </div>
          ))}
        </section>

        <section className="mt-8 rounded-2xl border border-slate-800 bg-slate-900 p-5">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold text-white">Ticket queue</h2>
              <p className="mt-1 text-sm text-slate-400">Approve requests and assign approved tickets to operators in your organization.</p>
            </div>
            <button onClick={() => loadTickets(token).catch((requestError: Error) => setError(requestError.message))} className="rounded-lg border border-slate-700 px-3 py-2 text-sm hover:bg-slate-800">Refresh</button>
          </div>
          {tickets.length === 0 ? (
            <p className="rounded-xl border border-dashed border-slate-700 p-8 text-center text-sm text-slate-400">No tickets are available in your organization.</p>
          ) : (
            <div className="space-y-3">
              {tickets.map((ticket) => (
                <article key={ticket.id} className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-semibold text-white">{ticket.title}</h3>
                        <span className="rounded-full border border-sky-700/60 px-2 py-0.5 text-xs text-sky-200">{ticket.status}</span>
                        <span className="rounded-full border border-amber-700/60 px-2 py-0.5 text-xs text-amber-200">{ticket.priority}</span>
                      </div>
                      <p className="mt-2 text-sm text-slate-300">{ticket.description}</p>
                      <p className="mt-2 text-xs text-slate-500">{ticket.requesterName} · {ticket.requesterEmail}{ticket.department ? ` · ${ticket.department}` : ''}</p>
                      {ticket.assignee && ticket.assignee !== 'unassigned' && <p className="mt-1 text-xs text-slate-400">Assigned to {ticket.assignee}</p>}
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {canApprove && ticket.status === 'new' && (
                        <button disabled={busyTicket === ticket.id} onClick={() => ticketAction(ticket.id, 'approve')} className="rounded-lg bg-emerald-500 px-3 py-2 text-sm font-semibold text-slate-950 disabled:opacity-50">Approve</button>
                      )}
                    </div>
                  </div>
                  {canAssign && ticket.status === 'approved' && (
                    <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-800 pt-4">
                      <input type="email" placeholder="Operator email" aria-label={`Operator email for ${ticket.title}`} value={assignees[ticket.id] ?? ''} onChange={(event) => setAssignees((current) => ({ ...current, [ticket.id]: event.target.value }))} className="min-w-64 flex-1 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white" />
                      <button disabled={busyTicket === ticket.id} onClick={() => ticketAction(ticket.id, 'assign')} className="rounded-lg border border-slate-600 px-4 py-2 text-sm font-medium hover:bg-slate-800 disabled:opacity-50">Assign operator</button>
                    </div>
                  )}
                  {ticket.status === 'awaiting-payment' && <p className="mt-4 border-t border-slate-800 pt-3 text-xs text-amber-200">Waiting for the customer to complete M-Pesa payment.</p>}
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
