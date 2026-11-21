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
        <SiteNavigation />
        {children}
      </body>
    </html>
  );
}
