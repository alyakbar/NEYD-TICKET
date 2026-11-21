'use client';

import { useState } from 'react';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api';

export default function TicketEmailRetry({ paymentId }: { paymentId: string }) {
  const [isSending, setIsSending] = useState(false);
  const [message, setMessage] = useState('');

  async function retryEmail() {
    setIsSending(true);
    setMessage('');
    try {
      const response = await fetch(`${API_URL}/payments/${encodeURIComponent(paymentId)}/ticket-email/retry`, {
        method: 'POST',
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(result.message ?? 'Could not resend the ticket email.');
      }
      setMessage(
        result.ticketEmailStatus === 'sent'
          ? 'Your ticket email has been sent.'
          : 'Email delivery did not succeed. Check the email configuration and try again later.',
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not resend the ticket email.');
    } finally {
      setIsSending(false);
    }
  }

  return (
    <div className="mt-4">
      <button
        type="button"
        onClick={retryEmail}
        disabled={isSending}
        className="rounded-xl border border-amber-700 px-5 py-3 font-semibold text-amber-100 transition hover:bg-amber-950 disabled:opacity-50"
      >
        {isSending ? 'Sending ticket email…' : 'Resend ticket email'}
      </button>
      {message && <p role="status" className="mt-3 text-sm text-slate-300">{message}</p>}
    </div>
  );
}
