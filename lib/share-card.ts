// Turn a canvas into something the user can actually send to the group chat.
//
// Web Share (with files) is the primary path — on an installed iOS PWA a plain
// <a download> is blocked, so sharing is the only route that works there. The
// download fallback covers desktop and Android browsers without file sharing.
export async function exportCanvas(
  canvas: HTMLCanvasElement,
  filename: string,
  text?: string
): Promise<"shared" | "downloaded" | "cancelled" | "failed"> {
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob((b) => resolve(b), "image/png")
  );
  if (!blob) return "failed";

  const file = new File([blob], filename, { type: "image/png" });
  const nav = navigator as Navigator & {
    canShare?: (data: ShareData & { files?: File[] }) => boolean;
    share?: (data: ShareData & { files?: File[] }) => Promise<void>;
  };

  if (nav.canShare?.({ files: [file] }) && nav.share) {
    try {
      await nav.share({ files: [file], text });
      return "shared";
    } catch (e) {
      // The user dismissing the share sheet throws AbortError — that's not a
      // failure, and must not fall through to a surprise download.
      if ((e as Error)?.name === "AbortError") return "cancelled";
    }
  }

  try {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    // Revoke on the next tick — revoking immediately can cancel the download.
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    return "downloaded";
  } catch {
    return "failed";
  }
}

/** Cap the backing store: iOS silently blanks canvases past ~16.7M pixels. */
export function safeDpr(cssW: number, cssH: number, max = 2): number {
  const dpr = Math.min(typeof window === "undefined" ? 1 : window.devicePixelRatio || 1, max);
  const MAX_PIXELS = 16_000_000;
  const wanted = cssW * cssH * dpr * dpr;
  if (wanted <= MAX_PIXELS) return dpr;
  return Math.max(1, Math.sqrt(MAX_PIXELS / (cssW * cssH)));
}
