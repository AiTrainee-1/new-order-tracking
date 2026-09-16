/** Order images live in Postgres (bytea), streamed through /api/images/[id] -
 *  the direct replacement for the old app's Supabase Storage publicImageUrl(). */
export function orderImageUrl(imageId: string | null | undefined): string | null {
  return imageId ? `/api/images/${imageId}` : null;
}
