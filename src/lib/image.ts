export const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/avif"];
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export type ImageCheck = "ok" | "type" | "size";

export function checkImage(file: File): ImageCheck {
  if (!IMAGE_TYPES.includes(file.type)) return "type";
  if (file.size > MAX_IMAGE_BYTES) return "size";
  return "ok";
}

/**
 * Downscale to at most `max` px on the longest side and re-encode as WebP, so menu photos
 * stay light on mobile data. Falls back to the original file if the browser can't encode.
 */
export async function optimiseImage(file: File, max = 1600, quality = 0.85): Promise<{ blob: Blob; ext: string; type: string }> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", quality));
    if (blob && blob.type === "image/webp") return { blob, ext: "webp", type: "image/webp" };
  } catch {
    // fall through to the original file
  }
  const ext = file.type.split("/")[1] === "jpeg" ? "jpg" : (file.type.split("/")[1] ?? "jpg");
  return { blob: file, ext, type: file.type };
}
