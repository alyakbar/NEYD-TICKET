'use client';

import { FormEvent, useEffect, useState } from 'react';
import { getBrowserApiUrl } from '../../lib/api-url';

const API_URL = getBrowserApiUrl();

type Organization = { id: string; name: string };
type CatalogItem = { code: string; label: string; amountKsh: number; currency: string };
type PaymentStatus = { status: string; receiptNumber: string | null; resultDescription: string | null };

async function responseError(response: Response): Promise<string> {
  const body = await response.json().catch(() => ({}));
  return body.message ?? `Request failed (${response.status}).`;
}

export default function PublicRequestPage() {
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [organizationId, setOrganizationId] = useState('');
  const [catalogItem, setCatalogItem] = useState('');
  const [requesterName, setRequesterName] = useState('');
  const [requesterEmail, setRequesterEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [department, setDepartment] = useState('');
  const [serviceArea, setServiceArea] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [ticketId, setTicketId] = useState('');
  const [paymentId, setPaymentId] = useState('');
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const selectedItem = catalog.find((item) => item.code === catalogItem);

  useEffect(() => {
    Promise.all([
      fetch(`${API_URL}/organizations/public`).then(async (response) => {
        if (!response.ok) throw new Error(await responseError(response));
        return response.json() as Promise<Organization[]>;
      }),
      fetch(`${API_URL}/payments/catalog`).then(async (response) => {
        if (!response.ok) throw new Error(await responseError(response));
        return response.json() as Promise<CatalogItem[]>;
      }),
    ]).then(([orgs, items]) => {
      setOrganizations(orgs);
      setCatalog(items);
      setOrganizationId(orgs[0]?.id ?? '');
      setCatalogItem(items[0]?.code ?? '');
    }).catch((requestError: Error) => setError(requestError.message));
  }, []);

  useEffect(() => {
    if (!paymentId) return;
    let active = true;
    const refresh = async () => {
      try {
        const response = await fetch(`${API_URL}/payments/${paymentId}/status`, { cache: 'no-store' });
        if (!response.ok) throw new Error(await responseError(response));
        const status = await response.json() as PaymentStatus;
        if (active) setPaymentStatus(status);
      } catch (requestError) {
        if (active) setError((requestError as Error).message);
      }
    };
    void refresh();
    const interval = window.setInterval(() => void refresh(), 5000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [paymentId]);

  async function beginPayment(id: string) {
    const response = await fetch(`${API_URL}/payments/stk-push`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ticketId: id, phoneNumber: phone, catalogItem }),
    });
    if (!response.ok) throw new Error(await responseError(response));
    const payment = await response.json();
    setPaymentId(payment.paymentId);
    setPaymentStatus({ status: payment.status, receiptNumber: null, resultDescription: payment.message });
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError('');
    setTicketId('');
    setPaymentId('');
    setPaymentStatus(null);
    try {
      const response = await fetch(`${API_URL}/tickets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          description,
          priority: 'medium',
          category: 'purchase',
          requesterName,
          requesterEmail,
          phone,
          department,
          serviceArea,
          organization: { id: organizationId },
          purchaseType: catalogItem,
        }),
      });
      if (!response.ok) throw new Error(await responseError(response));
      const ticket = await response.json();
      setTicketId(ticket.id);
      await beginPayment(ticket.id);
    } catch (requestError) {
      setError((requestError as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function retryPayment() {
    setLoading(true);
    setError('');
    try {
      await beginPayment(ticketId);
    } catch (requestError) {
      setError((requestError as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main id="main-content" className="min-h-screen px-4 py-6 text-slate-100 sm:px-5 sm:py-10">
      <div className="mx-auto max-w-3xl">
        <header className="mb-6 sm:mb-7">
          <a href="/" className="text-sm text-sky-300 hover:text-sky-200">← NEYD Service Desk</a>
          <p className="mt-6 text-xs uppercase tracking-[0.22em] text-sky-400">Public checkout</p>
          <h1 className="mt-2 text-3xl font-bold text-white">Submit a request and pay</h1>
          <p className="mt-2 text-slate-400">No account or sign-in is required. Add your contact details and approve the M-Pesa prompt sent to your phone.</p>
        </header>

        {error && <p role="alert" className="mb-5 rounded-xl border border-rose-900 bg-rose-950/50 p-4 text-sm text-rose-200">{error}</p>}
        {catalog.length === 0 ? (
          <div className="rounded-2xl border border-amber-800/70 bg-amber-950/30 p-5 text-sm text-amber-100">
            Checkout is not available until the server has a priced catalog and Daraja M-Pesa credentials configured. No payment amount is accepted from the browser.
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-5 rounded-2xl border border-[#3d5d4b] bg-[#193324] p-4 shadow-[0_18px_44px_rgba(0,0,0,0.18)] sm:p-6">
            <div className="grid gap-4 md:grid-cols-2">
              <label className="text-sm text-slate-300">Organization
                <select required value={organizationId} onChange={(event) => setOrganizationId(event.target.value)} className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white">
                  {organizations.map((organization) => <option key={organization.id} value={organization.id}>{organization.name}</option>)}
                </select>
              </label>
              <label className="text-sm text-slate-300">Request / purchase type
                <select required value={catalogItem} onChange={(event) => setCatalogItem(event.target.value)} className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white">
                  {catalog.map((item) => <option key={item.code} value={item.code}>{item.label} — KES {item.amountKsh.toLocaleString()}</option>)}
                </select>
              </label>
              <label className="text-sm text-slate-300">Full name
                <input required value={requesterName} onChange={(event) => setRequesterName(event.target.value)} className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white" />
              </label>
              <label className="text-sm text-slate-300">Email
                <input required type="email" value={requesterEmail} onChange={(event) => setRequesterEmail(event.target.value)} className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white" />
              </label>
              <label className="text-sm text-slate-300">M-Pesa phone
                <input required type="tel" inputMode="tel" placeholder="07xx xxx xxx or +254…" value={phone} onChange={(event) => setPhone(event.target.value)} className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white" />
              </label>
              <label className="text-sm text-slate-300">Department
                <input required value={department} onChange={(event) => setDepartment(event.target.value)} className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white" />
              </label>
            </div>
            <label className="block text-sm text-slate-300">Request title
              <input required value={title} onChange={(event) => setTitle(event.target.value)} className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white" />
            </label>
            <label className="block text-sm text-slate-300">Service area
              <input required value={serviceArea} onChange={(event) => setServiceArea(event.target.value)} className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white" />
            </label>
            <label className="block text-sm text-slate-300">Description
              <textarea required rows={4} value={description} onChange={(event) => setDescription(event.target.value)} className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white" />
            </label>
            {selectedItem && <p className="rounded-lg bg-slate-950 p-3 text-sm text-slate-300">Total to pay: <strong className="text-white">KES {selectedItem.amountKsh.toLocaleString()}</strong></p>}
            <button disabled={loading || organizations.length === 0} className="w-full rounded-lg bg-[#e8c49a] px-4 py-3 font-semibold text-[#12261b] disabled:opacity-50 enabled:hover:bg-[#d4a574]">
              {loading ? 'Starting checkout…' : 'Submit and pay with M-Pesa'}
            </button>
            <p className="text-xs text-slate-500">The server controls the price. Your ticket is queued for processing after successful payment.</p>
          </form>
        )}

        {ticketId && (
          <section aria-live="polite" className="mt-6 rounded-2xl border border-slate-800 bg-slate-900 p-5">
            <h2 className="font-semibold text-white">Request reference: {ticketId}</h2>
            {paymentStatus?.status === 'paid' ? (
              <p className="mt-2 text-sm text-emerald-300">Payment confirmed{paymentStatus.receiptNumber ? ` · Receipt ${paymentStatus.receiptNumber}` : ''}. Your ticket is now in the service desk queue.</p>
            ) : paymentStatus?.status === 'failed' ? (
              <div className="mt-2">
                <p className="text-sm text-rose-300">{paymentStatus.resultDescription ?? 'Payment was not completed.'}</p>
                <button onClick={retryPayment} disabled={loading} className="mt-3 rounded-lg border border-slate-600 px-4 py-2 text-sm hover:bg-slate-800">Retry M-Pesa payment</button>
              </div>
            ) : paymentStatus?.status === 'pending' ? (
              <p className="mt-2 text-sm text-amber-200">Payment pending. Check your phone and enter your M-Pesa PIN to approve.</p>
            ) : (
              <div className="mt-2">
                <p className="text-sm text-amber-200">The request was saved but payment could not be started. Retry when checkout is available.</p>
                <button onClick={retryPayment} disabled={loading} className="mt-3 rounded-lg border border-slate-600 px-4 py-2 text-sm hover:bg-slate-800">Retry M-Pesa payment</button>
              </div>
            )}
          </section>
        )}
      </div>
    </main>
  );
}
