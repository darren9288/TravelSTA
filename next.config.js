const withPWA = require("next-pwa")({
  dest: "public",
  disable: process.env.NODE_ENV === "development",
  register: true,
  skipWaiting: true,
  clientsClaim: true,
  // Auth/admin endpoints must always hit the network — never serve a cached response.
  runtimeCaching: [
    {
      urlPattern: /\/api\/admin\/.*/i,
      handler: "NetworkOnly",
    },
    {
      urlPattern: /\/auth\/.*/i,
      handler: "NetworkOnly",
    },
    {
      urlPattern: /^https:\/\/.*\.supabase\.co\/auth\/.*/i,
      handler: "NetworkOnly",
    },
    // Supabase data — StaleWhileRevalidate so old data is shown instantly while a refresh runs.
    // When offline, the cached copy is what you see.
    {
      urlPattern: /^https:\/\/.*\.supabase\.co\/.*/i,
      handler: "StaleWhileRevalidate",
      options: {
        cacheName: "supabase-data",
        expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 7 }, // 1 week
        cacheableResponse: { statuses: [0, 200] },
      },
    },
    // Our API routes — same strategy: cached responses keep the app readable offline.
    {
      urlPattern: /\/api\/.*/i,
      handler: "StaleWhileRevalidate",
      options: {
        cacheName: "api-data",
        expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 7 },
        cacheableResponse: { statuses: [0, 200] },
      },
    },
    // App shell + Next.js assets — fall back to cache when network fails.
    {
      urlPattern: /\.(?:js|css|woff2?|ttf|otf)$/i,
      handler: "StaleWhileRevalidate",
      options: { cacheName: "static-assets" },
    },
    {
      urlPattern: /\.(?:png|jpg|jpeg|svg|gif|webp|ico)$/i,
      handler: "CacheFirst",
      options: {
        cacheName: "images",
        expiration: { maxEntries: 100, maxAgeSeconds: 60 * 60 * 24 * 30 },
      },
    },
    // HTML pages — try network first, fall back to cached page if offline.
    {
      urlPattern: ({ request }) => request.mode === "navigate",
      handler: "NetworkFirst",
      options: {
        cacheName: "pages",
        networkTimeoutSeconds: 5,
        expiration: { maxEntries: 50, maxAgeSeconds: 60 * 60 * 24 * 7 },
      },
    },
  ],
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    // Keep visited dynamic pages in the Next.js Router Cache for 30 seconds
    // so back/forward + tab navigation feels instant. The data inside each
    // page is still kept fresh by SWR + realtime — the router cache only
    // controls how quickly the page *shell* renders, not stale data
    // displayed to the user.
    staleTimes: {
      dynamic: 30,
    },
  },
};

module.exports = withPWA(nextConfig);
