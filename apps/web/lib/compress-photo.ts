"use client";

/** Longest side kept for uploads; the server's display copy is 1600 px, so this leaves room for zooming the original. */
const MAX_SIDE = 2560;
/** Smaller files are sent as they are: re-encoding them saves little and costs quality. */
const MIN_BYTES = 1.5 * 1024 * 1024;
const QUALITY = 0.85;

/**
 * Shrinks a phone photo to at most MAX_SIDE px as a JPEG before upload, so uploads stay fast on mobile data.
 * EXIF orientation is applied while decoding and other metadata (GPS etc.) is dropped. Falls back to the original file
 * whenever the browser can't decode it (e.g. HEIC outside Safari) or the result isn't smaller.
 */
export async function compressPhoto(file: File): Promise<File> {
  if (file.size < MIN_BYTES || typeof createImageBitmap !== "function") return file;
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    return file;
  }
  try {
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.fillStyle = "#ffffff"; // JPEG has no transparency
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(bitmap, 0, 0, width, height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", QUALITY));
    if (!blob || blob.size >= file.size) return file;
    const name = file.name.replace(/\.[^.]*$/, "") + ".jpg";
    return new File([blob], name, { type: "image/jpeg", lastModified: file.lastModified });
  } catch {
    return file;
  } finally {
    bitmap.close();
  }
}
