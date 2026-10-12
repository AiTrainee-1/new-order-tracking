/** Order images live in Postgres (bytea), streamed through /api/images/[id] -
 *  the direct replacement for the old app's Supabase Storage publicImageUrl().
 *
 *  Pass `width` (in CSS pixels x2 for sharp screens - 128 for a card thumbnail, 256 for a larger one) wherever
 *  the picture is shown small: the server then sends a resized copy of a few kilobytes instead of the
 *  original upload, which can be several megabytes. Leave it out only where the full picture is wanted
 *  (the share card / download). */
export function orderImageUrl(imageId: string | null | undefined, width?: number): string | null {
  if (!imageId) return null;
  return width ? `/api/images/${imageId}?w=${width}` : `/api/images/${imageId}`;
}
