import { BadRequestException } from '@nestjs/common';

export const EVENT_POSTER_HOSTNAME = 'hosting.alsawwirhub.com';

export function normalizeEventPosterUrl(value?: string | null): string | null {
  const posterUrl = value?.trim();
  if (!posterUrl) return null;

  if (posterUrl.length > 2048) {
    throw new BadRequestException('The event poster URL must be 2048 characters or fewer.');
  }

  if (posterUrl.startsWith('/posters/')) {
    if (posterUrl.includes('..') || !/^\/posters\/[a-zA-Z0-9_.\-]+$/.test(posterUrl)) {
      throw new BadRequestException('Invalid uploaded poster path.');
    }
    return posterUrl;
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(posterUrl);
  } catch {
    throw new BadRequestException('Enter a valid public poster URL.');
  }

  if (
    parsedUrl.protocol !== 'https:' ||
    parsedUrl.hostname.toLowerCase() !== EVENT_POSTER_HOSTNAME ||
    parsedUrl.username ||
    parsedUrl.password ||
    parsedUrl.port ||
    parsedUrl.search ||
    parsedUrl.hash ||
    parsedUrl.pathname === '/'
  ) {
    throw new BadRequestException(
      `The poster must be a public HTTPS image URL on ${EVENT_POSTER_HOSTNAME}, without query parameters.`,
    );
  }

  return parsedUrl.toString();
}

export function getAllowedEventPosterUrl(value?: string | null): string | null {
  try {
    return normalizeEventPosterUrl(value);
  } catch {
    return null;
  }
}
