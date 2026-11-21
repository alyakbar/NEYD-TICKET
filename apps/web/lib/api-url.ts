export function getBrowserApiUrl(): string {
  if (process.env.NEXT_PUBLIC_API_URL) {
    return process.env.NEXT_PUBLIC_API_URL.replace(/\/+$/, '');
  }
  return process.env.NODE_ENV === 'production'
    ? '/api'
    : 'http://localhost:3001/api';
}

export function getServerApiUrl(): string {
  if (process.env.API_SERVICE_URL) {
    return `${process.env.API_SERVICE_URL.replace(/\/+$/, '')}/api`;
  }
  if (process.env.API_SERVER_URL) {
    return process.env.API_SERVER_URL.replace(/\/+$/, '');
  }
  if (process.env.NEXT_PUBLIC_API_URL) {
    return process.env.NEXT_PUBLIC_API_URL.replace(/\/+$/, '');
  }
  if (process.env.NODE_ENV === 'production') {
    const host = process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL;
    if (host) return `https://${host.replace(/^https?:\/\//, '')}/api`;
  }
  return 'http://localhost:3001/api';
}
