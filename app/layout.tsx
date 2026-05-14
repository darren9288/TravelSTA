import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ThemeProvider } from "@/components/ThemeProvider";
import ServiceWorkerUpdater from "@/components/ServiceWorkerUpdater";
import OfflineBanner from "@/components/OfflineBanner";
import NavigationProgress from "@/components/NavigationProgress";
import { Toaster } from "@/components/Toaster";
import OfflineQueueWatcher from "@/components/OfflineQueueWatcher";

export const metadata: Metadata = {
  title: "TravelSTA",
  description: "Group travel expense tracker",
  manifest: "/manifest.json",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "TravelSTA" },
};

export const viewport: Viewport = {
  themeColor: "#0f172a",
  width: "device-width",
  initialScale: 1,
  // Lock the viewport so the app feels native on phones:
  //   - maximumScale: 1 + userScalable: false → no pinch-to-zoom, no
  //     double-tap zoom, no iOS auto-zoom when focusing an input.
  //   - viewportFit: "cover" → uses the full screen on devices with a
  //     notch (iPhones, modern Androids) so backgrounds extend edge-to-
  //     edge instead of leaving safe-area letterboxing.
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head><link rel="apple-touch-icon" href="/icons/icon-192.svg" /></head>
      <body className="min-h-screen bg-slate-950">
        <ThemeProvider>
          <Toaster>
            <ServiceWorkerUpdater />
            <OfflineBanner />
            <OfflineQueueWatcher />
            <NavigationProgress />
            {children}
          </Toaster>
        </ThemeProvider>
      </body>
    </html>
  );
}
