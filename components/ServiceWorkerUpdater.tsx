"use client";
import { useEffect } from "react";

export default function ServiceWorkerUpdater() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    // When a NEW sw takes over from an existing one, reload so the user gets
    // fresh content.
    //
    // Two guards, both needed:
    //  - `wasControlled`: the generated sw.js calls clientsClaim(), so the
    //    very first install claims this page and fires controllerchange even
    //    though nothing is stale. Reloading there means a pointless reload on
    //    a user's first visit (mid-form, potentially).
    //  - `reloading`: controllerchange can fire more than once; without this
    //    the handler can kick off a second reload during the first.
    const wasControlled = !!navigator.serviceWorker.controller;
    let reloading = false;
    const onControllerChange = () => {
      if (!wasControlled || reloading) return;
      reloading = true;
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);

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

    return () => {
      document.removeEventListener("visibilitychange", checkForUpdate);
      navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
    };
  }, []);

  return null;
}
