import TicketEmailRetry from './ticket-email-retry';
import { getPublicEventPosterUrl } from '../../../lib/event-poster-url';
import { getServerApiUrl } from '../../../lib/api-url';

type RegistrationSuccessPageProps = {
  searchParams: {
    event?: string;
    payment?: string;
    poster?: string;
  };
};

type PaymentStatus = {
  status: string;
  receiptNumber: string | null;
  ticketCode: string | null;
  ticketEmailStatus: string | null;
};

const API_URL = getServerApiUrl();

export const dynamic = 'force-dynamic';

export default async function RegistrationSuccessPage({ searchParams }: RegistrationSuccessPageProps) {
  const eventTitle = searchParams.event || 'the event';
  let paymentStatus: PaymentStatus | null = null;
  let statusUnavailable = false;

  if (searchParams.payment) {
    try {
      const response = await fetch(
        `${API_URL}/payments/${encodeURIComponent(searchParams.payment)}/status`,
        { cache: 'no-store' },
      );
      if (response.ok) {
        paymentStatus = await response.json() as PaymentStatus;
      } else {
        statusUnavailable = true;
      }
    } catch {
      statusUnavailable = true;
    }
  }

  const confirmed = paymentStatus?.status === 'paid';
  const posterUrl = getPublicEventPosterUrl(searchParams.poster);

  return (
    <main id="main-content" className="flex min-h-screen items-center justify-center px-4 py-6 text-slate-100 sm:px-5 sm:py-10">
      <section className={`w-full max-w-xl rounded-2xl border bg-[#193324] p-5 text-center shadow-[0_18px_44px_rgba(0,0,0,0.22)] sm:rounded-3xl sm:p-8 md:p-12 ${confirmed ? 'border-emerald-700' : 'border-[#d4a574]'}`}>
        {posterUrl && <img src={posterUrl} alt={`${eventTitle} event poster`} className="mb-6 aspect-[16/9] w-full rounded-xl object-cover" />}
        <p className={`text-xs uppercase tracking-[0.22em] ${confirmed ? 'text-emerald-300' : 'text-amber-300'}`}>
          {confirmed ? 'Registration confirmed' : 'Payment not confirmed'}
        </p>
        <h1 className="mt-4 text-3xl font-bold text-white md:text-4xl">
          {confirmed ? 'You’re successfully registered' : 'Your registration is not complete yet'}
        </h1>
        <p className="mt-4 text-lg text-slate-300">
          {confirmed
            ? <>Your payment for <strong className="text-white">{eventTitle}</strong> was successful.</>
            : statusUnavailable
              ? 'We could not verify the payment right now. Refresh this page or check your registration again shortly.'
              : 'We have not received confirmation of your payment. Your registration will be complete after Daraja confirms payment.'}
        </p>
        {confirmed && paymentStatus?.receiptNumber && (
          <p className="mt-3 text-sm text-slate-400">M-Pesa receipt: {paymentStatus.receiptNumber}</p>
        )}
        {confirmed && paymentStatus?.ticketCode && (
          <p className="mt-3 text-sm text-slate-300">Ticket code: <strong className="text-white">{paymentStatus.ticketCode}</strong></p>
        )}
        {confirmed && paymentStatus?.ticketEmailStatus === 'sent' && (
          <p className="mt-3 text-sm text-emerald-300">Your ticket and QR code have been sent to the email address used during registration.</p>
        )}
        {confirmed && paymentStatus?.ticketEmailStatus === 'sending' && (
          <p className="mt-3 text-sm text-slate-300">Your ticket and QR code are being emailed.</p>
        )}
        {confirmed && paymentStatus?.ticketEmailStatus === 'failed' && (
          <>
            <p className="mt-3 text-sm text-amber-300">Payment is confirmed, but the ticket email could not be delivered.</p>
            {searchParams.payment && <TicketEmailRetry paymentId={searchParams.payment} />}
          </>
        )}
        {!confirmed && searchParams.payment && (
          <a
            href={`/register/success?payment=${encodeURIComponent(searchParams.payment)}&event=${encodeURIComponent(eventTitle)}`}
            className="mt-6 inline-flex rounded-xl border border-slate-700 px-5 py-3 font-semibold text-slate-200 transition hover:bg-slate-800"
          >
            Check payment status
          </a>
        )}
        <a
          href="/"
          className="mt-8 inline-flex rounded-xl bg-[#e8c49a] px-5 py-3 font-semibold text-[#12261b] transition hover:bg-[#d4a574]"
        >
          Browse more events
        </a>
      </section>
    </main>
  );
}
