import "server-only";

/**
 * Prisma returns `Decimal`-typed columns (`@db.Decimal`) as decimal.js
 * instances and `DateTime`/`@db.Date` columns as JS `Date` objects. The rest
 * of the app's domain types (src/lib/types.ts) - inherited from the old
 * Supabase app's own types.ts - expect plain `number` and ISO date strings,
 * matching what actually goes over JSON. Route Handlers should pass their
 * response payload through this before calling NextResponse.json() so a
 * Decimal never leaks out as a decimal.js object (or, worse, silently
 * serializes via its own toJSON() into a STRING that callers would have to
 * remember to re-parse).
 */
export function serializeForJson<T>(value: T): T {
  if (value === null || value === undefined) return value;
  if (value instanceof Date) return value.toISOString() as unknown as T;
  if (typeof (value as { toNumber?: unknown })?.toNumber === "function") {
    return (value as unknown as { toNumber: () => number }).toNumber() as unknown as T;
  }
  if (Array.isArray(value)) {
    return value.map((v) => serializeForJson(v)) as unknown as T;
  }
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = serializeForJson(v);
    }
    return out as T;
  }
  return value;
}
