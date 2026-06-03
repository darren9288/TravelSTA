const withPWA = require("next-pwa")({
  dest: "public",
  disable: process.env.NODE_ENV === "development",
  register: true,
  skipWaiting: true,
  clientsClaim: true,
  // Pull in our custom push-notification event listeners. The next-pwa
  // generated sw.js will importScripts() this file at runtime so the
  // `push` and `notificationclick` handlers are part of the active SW.
  importScripts: ["/push-sw.js"],
  // Trim the precache list. Default next-pwa precaches the entire Next.js
  // build (50+ files) which on iOS Safari can take 30-60s to install on a
  // fresh registration. Excluding manifests + map files cuts that down so
  // the SW activates faster — pages will still be cached on first visit
  // via the runtimeCaching rules below.
  buildExcludes: [
    /middleware-manifest\.json$/,
    /_buildManifest\.js$/,
    /_ssgManifest\.js$/,
    /\.map$/,
    /app-build-manifest\.json$/,
    /react-loadable-manifest\.json$/,
  ],
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
    // Login + signup + join pages: always fetch fresh. The bug was the SW
    // serving a stale /login that did router.push("/") (ignoring ?next),
    // breaking the invite-link flow. NetworkOnly guarantees post-deploy
    // changes to these pages are picked up on the next visit.
    {
      urlPattern: /\/(login|signup)\/?$/i,
      handler: "NetworkOnly",
    },
    {
      urlPattern: /\/join\//i,
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
    // precacheFallback hands off to /offline when both network and cache miss,
    // so users see our friendly offline page instead of Chrome's default error.
    {
      urlPattern: ({ request }) => request.mode === "navigate",
      handler: "NetworkFirst",
      options: {
        cacheName: "pages",
        networkTimeoutSeconds: 5,
        expiration: { maxEntries: 50, maxAgeSeconds: 60 * 60 * 24 * 7 },
        precacheFallback: { fallbackURL: "/offline" },
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
