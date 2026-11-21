const navigationLinks = [
  { href: '/', label: 'Events' },
  { href: '/register', label: 'Register' },
];

export default function SiteNavigation() {
  return (
    <nav aria-label="Main navigation" className="sticky top-0 z-40 border-b border-[#3d5d4b] bg-[#12261b]/95 shadow-[0_8px_24px_rgba(0,0,0,0.12)] backdrop-blur">
      <div className="mx-auto flex min-h-16 max-w-7xl items-center justify-between gap-3 px-4 py-3 sm:px-5">
        <a href="/" className="shrink-0 text-xs font-bold uppercase tracking-[0.16em] text-[#e8c49a] sm:text-sm sm:tracking-[0.2em]" aria-label="NEYD Events home">
          NEYD Events
        </a>
        <div className="flex flex-wrap items-center gap-2 sm:gap-5">
          {navigationLinks.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="rounded-lg px-2.5 py-2 text-sm font-medium text-[#f7f3ee] transition hover:bg-white/10 hover:text-[#e8c49a] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#e8c49a] sm:px-3"
            >
              {link.label}
            </a>
          ))}
        </div>
      </div>
    </nav>
  );
}
