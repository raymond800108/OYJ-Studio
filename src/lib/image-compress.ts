/**
 * Client-side image compression. Resizes huge product photos before
 * upload so /api/upload doesn't return 4xx and so downstream FAL
 * models don't reject `image_too_large`.
 *
 * Pass-through for files already under `softLimitBytes`. Otherwise
 * draws the image to a canvas scaled so the long edge is <= `maxEdge`,
 * then re-encodes as JPEG at `quality`.
 *
 * Returns the original File if compression isn't beneficial or the
 * environment doesn't support canvas (server, very old browsers).
 */
export async function compressImage(
  file: File,
  opts: {
    /** Files smaller than this are returned as-is. Default 1.5 MB. */
    softLimitBytes?: number;
    /** Long-edge resize cap in pixels. Default 2048. */
    maxEdge?: number;
    /** JPEG quality 0–1. Default 0.9. */
    quality?: number;
  } = {}
): Promise<File> {
  const softLimitBytes = opts.softLimitBytes ?? 1_500_000;
  const maxEdge = opts.maxEdge ?? 2048;
  const quality = opts.quality ?? 0.9;

  if (typeof window === "undefined") return file;
  if (!file.type.startsWith("image/")) return file;
  if (file.size <= softLimitBytes) return file;

  try {
    const bitmap = await createImageBitmap(file).catch(() => null);
    if (!bitmap) return file;

    const longEdge = Math.max(bitmap.width, bitmap.height);
    const scale = longEdge > maxEdge ? maxEdge / longEdge : 1;
    const w = Math.round(bitmap.width * scale);
    const h = Math.round(bitmap.height * scale);

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      bitmap.close?.();
      return file;
    }
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close?.();

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((b) => resolve(b), "image/jpeg", quality);
    });
    if (!blob) return file;
    if (blob.size >= file.size) return file; // compression didn't help

    const baseName = file.name.replace(/\.[^.]+$/, "");
    return new File([blob], `${baseName}.jpg`, { type: "image/jpeg" });
  } catch {
    return file;
  }
}
