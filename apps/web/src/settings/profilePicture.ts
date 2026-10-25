/** What Profile accepts as a Profile picture: the browser checks these before anything is uploaded. */
export const PICTURE_TYPES = ["image/jpeg", "image/png", "image/webp"];

export const MAX_PICTURE_BYTES = 5 * 1024 * 1024;

export const PICTURE_HINT = "JPEG, PNG or WebP, up to 5 MB.";

/** For a file too big or of another type, checked in the browser (35e), or refused by the server for the same. */
export const WRONG_FILE = "That file is over 5 MB. Choose a JPEG, PNG or WebP up to 5 MB.";

/** The server's `unreadable_image` (35f). */
export const UNREADABLE = "We couldn’t read that image. Try a different file.";

/** The server's 429 on the 10th-plus upload in an hour (35g); the wait comes from `Retry-After`. */
export function uploadLimitMessage(retryAfterSeconds: number | null): string {
  const minutes = Math.max(1, Math.ceil((retryAfterSeconds ?? 60) / 60));
  return `You've uploaded 10 photos this hour. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`;
}

/** Null when the file can be uploaded, otherwise what to tell the User. */
export function pictureFileError(file: { type: string; size: number }): string | null {
  return PICTURE_TYPES.includes(file.type) && file.size <= MAX_PICTURE_BYTES ? null : WRONG_FILE;
}

/** A part of the image, as react-easy-crop reports it: in pixels for cropping, in percent for previews. */
export type CropArea = { x: number; y: number; width: number; height: number };

/** The size of the square sent up; the server makes its own 256×256 from it. */
const UPLOAD_SIZE = 512;

/** The largest square in the middle of a `width`×`height` image: what the crop window shows before any move. */
export function centredSquare(width: number, height: number): CropArea {
  const side = Math.min(width, height);
  return { x: (width - side) / 2, y: (height - side) / 2, width: side, height: side };
}

/**
 * The chosen square of the photo as a JPEG, transparency on white, drawn by the browser, which also turns a phone
 * photo upright (the server ignores EXIF orientation). Before the crop window has reported a crop, that is the centred
 * square it shows. Only a browser that can't draw it (or decode the photo) sends the file itself.
 */
export async function croppedPicture(
  file: File,
  src: string,
  area: CropArea | null,
): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = UPLOAD_SIZE;
  canvas.height = UPLOAD_SIZE;
  const context = canvas.getContext("2d");
  if (!context) return file;
  try {
    const image = await loadImage(src);
    const square = area ?? centredSquare(image.naturalWidth, image.naturalHeight);
    context.fillStyle = "#fff";
    context.fillRect(0, 0, UPLOAD_SIZE, UPLOAD_SIZE);
    context.imageSmoothingQuality = "high";
    context.drawImage(
      image,
      square.x,
      square.y,
      square.width,
      square.height,
      0,
      0,
      UPLOAD_SIZE,
      UPLOAD_SIZE,
    );
  } catch {
    return file;
  }
  return new Promise((resolve) =>
    canvas.toBlob((blob) => resolve(blob ?? file), "image/jpeg", 0.92),
  );
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = src;
  });
}

/**
 * Where to put the photo in a small round preview so it shows the chosen square: react-easy-crop's area in
 * percent of the image becomes a background size and position.
 */
export function previewStyle(src: string, area: CropArea | null) {
  if (!area)
    return {
      backgroundImage: `url("${src}")`,
      backgroundSize: "cover",
      backgroundPosition: "center",
    };
  const offset = (start: number, size: number) => (size >= 100 ? 0 : (start / (100 - size)) * 100);
  return {
    backgroundImage: `url("${src}")`,
    backgroundSize: `${10000 / area.width}% ${10000 / area.height}%`,
    backgroundPosition: `${offset(area.x, area.width)}% ${offset(area.y, area.height)}%`,
  };
}

/** The letters the initials picture shows: the first letters of the first two words, or of a single word its first two. */
export function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "";
  const letters =
    words.length === 1 ? [...words[0]!].slice(0, 2) : words.slice(0, 2).map((w) => [...w][0]!);
  return letters.join("").toUpperCase();
}

/** "24 Oct 2026", in the same order and spelling wherever the browser is set to. */
export function uploadedOn(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}
