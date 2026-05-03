"use client";
import { useEffect } from "react";

export default function ServiceWorkerUpdater() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    // When a new SW takes control, reload so the user gets fresh content
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      window.location.reload();
    });

    // Each time the app becomes visible (user switches back or reopens),
    // tell the SW to check for a new version right now
    async function checkForUpdate() {
      if (document.visibilityState !== "visible") return;
      const reg = await navigator.serviceWorker.getRegistration();
      reg?.update().catch(() => {});
    }

    document.addEventListener("visibilitychange", checkForUpdate);
    // Also check immediately on first load
    checkForUpdate();

    return () => document.removeEventListener("visibilitychange", checkForUpdate);
  }, []);

  return null;
}
