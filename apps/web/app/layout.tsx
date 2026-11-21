import './globals.css';
import type { Metadata } from 'next';
import SiteNavigation from '../components/site-navigation';

export const metadata: Metadata = {
  title: {
    default: 'NEYD Events',
    template: '%s | NEYD Events',
  },
  description: 'Discover NEYD events, register securely, and receive your event ticket.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <a
          href="#main-content"
          className="fixed left-3 top-3 z-[100] -translate-y-20 rounded-lg bg-[#e8c49a] px-4 py-3 font-semibold text-[#12261b] focus:translate-y-0"
        >
          Skip to content
        </a>
        <SiteNavigation />
        {children}
      </body>
    </html>
  );
}
