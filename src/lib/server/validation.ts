import "server-only";
import { z } from "zod";
import type { NextResponse } from "next/server";
import { apiError } from "./http";

/**
 * Request-body schemas shared by the create (POST) and correct (PATCH) routes of the same record, so the two
 * can no longer drift apart - and a bad body is a 400 with a readable message, never a Prisma 500.
 * Dates are only checked for shape here; badDateError/isSaneDate still decide whether they are real days.
 */

/** A number as the forms send it: a JSON number, or a numeric string from an input box. */
const numeric = (label: string) =>
  z.preprocess(
    (v) => (typeof v === "string" && v.trim() !== "" ? Number(v) : v),
    z.number({ invalid_type_error: `Enter a valid ${label}.`, required_error: `Enter a ${label}.` }).finite(`Enter a valid ${label}.`),
  );
const quantity = (label = "quantity") => numeric(label).pipe(z.number().min(0, `The ${label} can't be negative.`));
const positiveQuantity = (label = "quantity") => numeric(label).pipe(z.number().gt(0, `Enter a ${label} greater than zero.`));

/** Optional free text: missing, null and blank all become null. */
const optionalText = z
  .string()
  .nullish()
  .transform((v) => (v && v.trim() ? v : null));
const requiredText = (message: string) => z.string({ required_error: message, invalid_type_error: message }).trim().min(1, message);
const id = (label: string) => requiredText(`${label} is required.`);
// A select with nothing picked can send "" - that, null and missing all mean "none".
const optionalId = z
  .string()
  .nullish()
  .transform((v) => v || null);
const optionalDate = z.string().nullish();

/** Parse a body against a schema - the parsed value, or a 400 naming the first problem. */
export function parseBody<T extends z.ZodTypeAny>(schema: T, body: unknown): { data: z.output<T> } | { error: NextResponse } {
  const result = schema.safeParse(body ?? {});
  if (result.success) return { data: result.data };
  const issue = result.error.issues[0];
  if (!issue) return { error: apiError(400, "Invalid request body.") };
  // Our own messages read as sentences; zod's built-in ones ("Required", "Expected number, received string")
  // mean nothing without the field, so name it.
  const generic = /^(Required|Expected |Invalid )/.test(issue.message);
  return { error: apiError(400, generic && issue.path.length ? `${issue.path.join(".")}: ${issue.message}` : issue.message) };
}

// --- Yarn/fabric procurement ledger ---------------------------------------------------------------------

const materialRequirementFields = {
  category: z.enum(["yarn", "fabric"], { errorMap: () => ({ message: "Category must be yarn or fabric." }) }),
  name: requiredText("Enter a material name."),
  requiredQty: quantity("required quantity"),
  unit: requiredText("unit is required."),
  supplier: optionalText,
  sortOrder: z.number().int().optional(),
  isCompleted: z.boolean().optional(),
  notes: optionalText,
};
export const materialRequirementCreate = z.object({ orderId: id("orderId"), poId: optionalId, ...materialRequirementFields });
export const materialRequirementPatch = z.object(materialRequirementFields).partial();

const materialEntryFields = {
  entryType: z.enum(["plan", "dc", "receipt", "inward"], { errorMap: () => ({ message: "Invalid entry type." }) }),
  qty: positiveQuantity(),
  entryDate: optionalDate,
  supplier: optionalText,
  docNo: optionalText,
  docDate: optionalDate,
  lotRef: optionalText,
  notes: optionalText,
};
export const materialEntryCreate = z.object({ requirementId: id("requirementId"), ...materialEntryFields });
export const materialEntryPatch = z.object(materialEntryFields).partial();

// --- Accessories tracker ---------------------------------------------------------------------------------

export const accessoryRequirementCreate = z.object({
  orderId: id("orderId"),
  poId: optionalId,
  name: requiredText("Enter an accessory name."),
  requiredQty: quantity(),
  // Free string (CONE, METERS, GROSS, ...) rather than the KG/PCS enum.
  unit: requiredText("unit is required."),
  requiredDate: optionalDate,
  sortOrder: z.number().int().optional(),
  sizeBreakdown: z.unknown().optional(),
  notes: optionalText,
});

export const accessoryEntryCreate = z.object({
  requirementId: id("requirementId"),
  entryType: z.enum(["purchase", "inward", "dispatch"], { errorMap: () => ({ message: "Invalid entry type." }) }),
  qty: positiveQuantity(),
  entryDate: optionalDate,
  vendor: optionalText,
  docNo: optionalText,
  sentTo: optionalText,
  sizeBreakdown: z.unknown().optional(),
  notes: optionalText,
});

// --- Production ledger and stage entries -----------------------------------------------------------------

const unitType = z.enum(["KG", "PCS"], { errorMap: () => ({ message: "Unit must be KG or PCS." }) });

export const txnRow = z.object({
  orderId: id("orderId"),
  poId: optionalId,
  sectionId: id("sectionId"),
  lotId: optionalId,
  sizeCode: z.string().nullish().transform((v) => v ?? null),
  txnType: z.enum(["process", "send", "receive", "rework"], { errorMap: () => ({ message: "Invalid transaction type." }) }),
  unit: unitType,
  qtyIn: quantity("quantity in").default(0),
  qtyOut: quantity("quantity out").default(0),
  qtyRejected: quantity("rejected quantity").default(0),
  qtyRework: quantity("rework quantity").default(0),
  qtyCount: quantity("count").default(0),
  refName: optionalText,
  docNo: optionalText,
  dcName: optionalText,
  entryDate: z.string({ required_error: "An entry date is required." }),
  notes: optionalText,
  isJobWork: z.boolean().optional(),
});
export const txnBatch = z.object({ rows: z.array(txnRow).max(500, "Too many rows in one save.").default([]) });

export const stageEntryRow = z.object({
  orderId: id("orderId"),
  poId: optionalId,
  sectionId: id("sectionId"),
  entryDate: z.string({ required_error: "An entry date is required." }),
  unitType,
  qtyReceived: quantity("received quantity").default(0),
  qtyCompletedToday: quantity("completed quantity").default(0),
  qtyForwarded: quantity("forwarded quantity").default(0),
  qtyShortage: quantity("shortage quantity").default(0),
  qtyRejected: quantity("rejected quantity").default(0),
  qtyReturned: quantity("returned quantity").default(0),
  isExternal: z.boolean().default(false),
  externalUnitName: optionalText,
  isSentOutside: z.boolean().default(false),
  isReturned: z.boolean().default(false),
  isForwarded: z.boolean().default(false),
  isCompleted: z.boolean().default(false),
  branch: optionalText,
  unitName: optionalText,
  transferType: z.enum(["none", "branch", "unit", "outside", "others"], { errorMap: () => ({ message: "Invalid transfer type." }) }).default("none"),
  transferTo: optionalText,
  notes: optionalText,
  forwardedToUserId: optionalId,
});
export const stageEntryBody = z
  .object({ entry: stageEntryRow.optional(), entries: z.array(stageEntryRow).max(500, "Too many rows in one save.").optional() })
  .transform((b) => b.entries ?? (b.entry ? [b.entry] : []));

/** A correction to one production row - only the fields the ledger lets you change after the fact. */
export const txnPatch = txnRow
  .pick({ lotId: true, sizeCode: true, qtyIn: true, qtyOut: true, qtyRejected: true, qtyRework: true, qtyCount: true, dcName: true, refName: true, docNo: true, entryDate: true })
  .partial();

export const lotCreate = z.object({
  orderId: id("orderId"),
  poId: optionalId,
  lotNo: requiredText("orderId and lotNo are required."),
  fabricType: optionalText,
  notes: optionalText,
});

/** One audit-trail row written by a form after its save (see useRecordAudit). */
export const auditCreate = z.object({
  orderId: id("orderId"),
  poId: optionalId,
  sectionId: optionalId,
  entity: requiredText("entity is required.").pipe(z.string().max(64)),
  entityId: optionalId,
  action: z.enum(["create", "update", "delete"], { errorMap: () => ({ message: "Invalid audit action." }) }),
  summary: requiredText("summary is required.").pipe(z.string().max(2000)),
  changes: z.record(z.unknown()).nullish(),
  notes: optionalText,
});
