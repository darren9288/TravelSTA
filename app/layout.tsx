import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ThemeProvider } from "@/components/ThemeProvider";
import ServiceWorkerUpdater from "@/components/ServiceWorkerUpdater";

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
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head><link rel="apple-touch-icon" href="/icons/icon-192.svg" /></head>
      <body className="min-h-screen bg-slate-950">
        <ThemeProvider>
          <ServiceWorkerUpdater />
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
