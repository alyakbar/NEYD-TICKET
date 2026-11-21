const allowedPosterHostname = 'hosting.alsawwirhub.com';
const vercelBlobHostnameSuffix = '.public.blob.vercel-storage.com';

export function getPublicEventPosterUrl(value?: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();

  if (trimmed.startsWith('/posters/')) {
    if (trimmed.includes('..') || !/^\/posters\/[a-zA-Z0-9_.\-]+$/.test(trimmed)) {
      return null;
    }
    return trimmed;
  }

  try {
    const url = new URL(trimmed);
    if (
      url.protocol !== 'https:' ||
      (
        url.hostname.toLowerCase() !== allowedPosterHostname &&
        !url.hostname.toLowerCase().endsWith(vercelBlobHostnameSuffix)
      ) ||
      url.username ||
      url.password ||
      url.port ||
      url.search ||
      url.hash ||
      url.pathname === '/'
    ) {
      return null;
    }

    return url.toString();
  } catch {
    return null;
  }
}
