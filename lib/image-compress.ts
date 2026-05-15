// Browser-side image compression for receipt photos. Phone cameras produce
// 4-10MB images which would (a) blow past Anthropic's 5MB image limit,
// (b) waste tokens, (c) take forever to upload on hotel wifi.
//
// We resize to a max edge of 1280px and re-encode as JPEG ~75% quality.
// That typically takes a 4MB photo down to 200-500KB while keeping receipt
// text crisply readable.
//
// Usage:
//   const compressed = await compressImage(file); // → Blob
//   const base64 = await blobToBase64(compressed); // → "data:image/jpeg;base64,..."

const MAX_EDGE_PX = 1280;
const JPEG_QUALITY = 0.75;

export async function compressImage(file: File | Blob): Promise<Blob> {
  // Decode the image. Use createImageBitmap when available — it's faster and
  // doesn't tie up the main thread; fall back to <img> for older Safari.
  let bitmap: ImageBitmap | HTMLImageElement;
  if (typeof createImageBitmap === "function") {
    bitmap = await createImageBitmap(file);
  } else {
    bitmap = await new Promise<HTMLImageElement>((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(url);
        resolve(img);
      };
      img.onerror = (e) => {
        URL.revokeObjectURL(url);
        reject(e);
      };
      img.src = url;
    });
  }

  const w = (bitmap as ImageBitmap).width ?? (bitmap as HTMLImageElement).naturalWidth;
  const h = (bitmap as ImageBitmap).height ?? (bitmap as HTMLImageElement).naturalHeight;

  // Scale so the longest edge is MAX_EDGE_PX. Don't UPscale tiny images.
  const scale = Math.min(1, MAX_EDGE_PX / Math.max(w, h));
  const targetW = Math.round(w * scale);
  const targetH = Math.round(h * scale);

  const canvas = document.createElement("canvas");
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context unavailable");
  // Background fill — if the source is a PNG with transparency, the JPEG
  // would otherwise render that as black. White matches typical receipts.
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, targetW, targetH);
  ctx.drawImage(bitmap as CanvasImageSource, 0, 0, targetW, targetH);

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error("Failed to encode JPEG"));
      },
      "image/jpeg",
      JPEG_QUALITY
    );
  });
}

export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("FileReader failed"));
    reader.readAsDataURL(blob);
  });
}
