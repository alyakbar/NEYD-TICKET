export function formatEventTicketPrefix(title?: string | null): string {
  const normalized = (title || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  const prefix = normalized.slice(0, 32).replace(/-+$/, '');
  return prefix || 'EVENT';
}

export function formatEventTicketCode(title: string | null | undefined, number: number): string {
  const prefix = formatEventTicketPrefix(title);
  const formattedNumber = String(Math.max(1, Math.floor(number))).padStart(4, '0');
  return `${prefix}-${formattedNumber}`;
}

