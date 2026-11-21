// Runtime validation coverage for event poster URL handling.
const assert = require('node:assert/strict');
const { test } = require('node:test');
const {
  getAllowedEventPosterUrl,
  normalizeEventPosterUrl,
} = require('../dist/events/event-poster-url');

test('accepts and normalizes a public HTTPS poster URL from the configured host', () => {
  assert.equal(
    normalizeEventPosterUrl('https://hosting.alsawwirhub.com/events/summit-poster.webp'),
    'https://hosting.alsawwirhub.com/events/summit-poster.webp',
  );
  assert.equal(
    normalizeEventPosterUrl('https://store.public.blob.vercel-storage.com/posters/event.jpg'),
    'https://store.public.blob.vercel-storage.com/posters/event.jpg',
  );
  assert.equal(
    normalizeEventPosterUrl('/posters/neyd-event-poster.jpg'),
    '/posters/neyd-event-poster.jpg',
  );
  assert.equal(normalizeEventPosterUrl('  '), null);
});

test('rejects insecure, off-host, credentialed, and query-bearing poster URLs', () => {
  for (const url of [
    'http://hosting.alsawwirhub.com/poster.jpg',
    'https://example.com/poster.jpg',
    'https://hosting.alsawwirhub.com.evil.example/poster.jpg',
    'https://user:pass@hosting.alsawwirhub.com/poster.jpg',
    'https://hosting.alsawwirhub.com/poster.jpg?token=private',
    'https://hosting.alsawwirhub.com/',
    '/posters/../secret.jpg',
    '/posters/bad path.jpg',
  ]) {
    assert.throws(() => normalizeEventPosterUrl(url));
  }
  assert.equal(getAllowedEventPosterUrl('javascript:alert(1)'), null);
});
