const navigationLinks = [
  { href: '/', label: 'Events' },
  { href: '/register', label: 'Register' },
];

export default function SiteNavigation() {
  return (
    <nav aria-label="Main navigation" className="border-b border-white/10 bg-[#213d2a]/95">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-5 py-4">
        <a href="/" className="text-sm font-bold uppercase tracking-[0.2em] text-[#e8c49a]">
          NEYD Events
        </a>
        <div className="flex flex-wrap items-center gap-2 sm:gap-5">
          {navigationLinks.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="rounded-lg px-3 py-2 text-sm font-medium text-[#f7f3ee] transition hover:bg-white/10 hover:text-[#e8c49a] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#e8c49a]"
            >
              {link.label}
            </a>
          ))}
        </div>
      </div>
    </nav>
  );
}
