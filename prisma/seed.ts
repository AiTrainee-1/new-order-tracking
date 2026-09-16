import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

/**
 * The stage catalog. This is the single source of truth for the 19
 * selectable stages and the role flags that replace every hardcoded
 * `STAGE.key === ...` branch the old chain.ts/progress.ts had - see
 * prisma/schema.prisma's StageDefinition model comment and the plan doc for
 * the full rationale. Order here is presentation order in the catalog/picker
 * UI only; it has no bearing on any order's actual stage sequence.
 */
const STAGE_CATALOG = [
  {
    key: "order_confirmation",
    label: "Order Confirmation",
    unitType: "PCS",
    formType: "confirmation",
    typicalDurationDays: 2,
    isOrderOrigin: true,
    includeInLossRows: false,
  },
  {
    key: "raw_material_planning",
    label: "Raw Material Planning",
    unitType: "KG",
    formType: "material_planning",
    typicalDurationDays: 3,
    isProcurement: true,
    procurementRank: 1,
  },
  {
    key: "po_to_suppliers",
    label: "Purchase Order to Suppliers",
    unitType: "KG",
    formType: "supplier_dc",
    typicalDurationDays: 5,
    isProcurement: true,
    procurementRank: 2,
    includeInLossRows: false,
  },
  {
    key: "raw_material_inward",
    label: "Raw Material Inward",
    unitType: "KG",
    formType: "material_inward",
    typicalDurationDays: 3,
    isProcurement: true,
    procurementRank: 3,
    includeInLossRows: false,
  },
  {
    key: "knitting",
    label: "Knitting",
    unitType: "KG",
    formType: "lot_send_receive",
    typicalDurationDays: 4,
    drawsMaterialBaseline: true,
  },
  {
    key: "dyeing",
    label: "Dyeing",
    unitType: "KG",
    formType: "lot_send_receive",
    typicalDurationDays: 3,
    canBeLotOrigin: true,
  },
  {
    key: "brushing",
    label: "Brushing",
    unitType: "KG",
    formType: "lot_send_receive",
    typicalDurationDays: 2,
  },
  {
    key: "compacting",
    label: "Compacting",
    unitType: "KG",
    formType: "lot_send_receive",
    typicalDurationDays: 2,
  },
  {
    key: "fabric_inhouse",
    label: "In-House",
    unitType: "KG",
    formType: "lot_process",
    typicalDurationDays: 2,
  },
  {
    key: "fabric_inspection",
    label: "Fabric Inspection",
    unitType: "KG",
    formType: "lot_inspection",
    typicalDurationDays: 2,
  },
  {
    key: "fabric_store",
    label: "Fabric Store",
    unitType: "KG",
    formType: "fabric_store",
    typicalDurationDays: 1,
    isFabricCheckpoint: true,
    includeInLossRows: false,
  },
  {
    key: "pattern_marker",
    label: "Pattern Making & Marker Planning",
    unitType: "KG",
    formType: "simple_confirm",
    typicalDurationDays: 2,
    isPassthrough: true,
    includeInLossRows: false,
  },
  {
    key: "cutting",
    label: "Cutting",
    unitType: "PCS",
    formType: "cutting",
    typicalDurationDays: 3,
    noLotTracking: true,
    canBeSizeOrigin: true,
  },
  {
    key: "panel_checking",
    label: "Panel Checking",
    unitType: "PCS",
    formType: "panel_check",
    typicalDurationDays: 1,
    noLotTracking: true,
  },
  {
    key: "embroidery",
    label: "Embroidery",
    unitType: "PCS",
    formType: "embroidery",
    typicalDurationDays: 3,
    noLotTracking: true,
  },
  // Garment Die / Printing / Stone - same send/receive round-trip workflow
  // as Embroidery (formType "embroidery" routes to the same generic form),
  // just three more vendor-processing stages a plan can optionally include.
  {
    key: "garment_die",
    label: "Garment Die",
    unitType: "PCS",
    formType: "embroidery",
    typicalDurationDays: 3,
    noLotTracking: true,
  },
  {
    key: "printing",
    label: "Printing",
    unitType: "PCS",
    formType: "embroidery",
    typicalDurationDays: 3,
    noLotTracking: true,
  },
  {
    key: "stone",
    label: "Stone",
    unitType: "PCS",
    formType: "embroidery",
    typicalDurationDays: 3,
    noLotTracking: true,
  },
  {
    key: "sewing",
    label: "Sewing (Stitching)",
    unitType: "PCS",
    formType: "sewing",
    typicalDurationDays: 5,
    noLotTracking: true,
  },
  {
    key: "checking",
    label: "Checking",
    unitType: "PCS",
    formType: "garment_qc",
    typicalDurationDays: 2,
    noLotTracking: true,
  },
  {
    key: "ironing",
    label: "Ironing",
    unitType: "PCS",
    formType: "garment_process",
    typicalDurationDays: 2,
    noLotTracking: true,
  },
  {
    key: "packing",
    label: "Packing",
    unitType: "PCS",
    formType: "packing",
    typicalDurationDays: 2,
    noLotTracking: true,
    isFinalOutput: true,
  },
] as const;

async function seedStageCatalog() {
  for (const stage of STAGE_CATALOG) {
    await prisma.stageDefinition.upsert({
      where: { key: stage.key },
      update: stage,
      create: stage,
    });
  }
  console.log(`Seeded ${STAGE_CATALOG.length} stage definitions.`);
}

/** The "everything, in the original fixed order" template - the closest
 *  equivalent to how every order behaved before stage plans were dynamic,
 *  offered as a one-click starting point in the order-creation picker. */
async function seedStandardTemplate() {
  // One-time migration: this template used to be named with the catalog
  // count baked in. Rename the old row in place if it's still there, so
  // adopting the count-free name below doesn't leave it behind as an
  // orphaned duplicate. A no-op on every run after the first.
  await prisma.stagePlanTemplate.updateMany({
    where: { name: "Standard - All 19 Stages" },
    data: { name: "Standard - All Stages" },
  });

  // The name deliberately omits the catalog count - a `name` is this
  // template's stable identity (the upsert's `where` key), and baking a
  // count into it means every future catalog change either goes stale or
  // needs a one-time migration to rename it without creating a duplicate.
  // The count only ever appears in the description, which isn't a key.
  const description = `Every stage (currently ${STAGE_CATALOG.length}), in the order the app used before per-order stage plans existed.`;
  const template = await prisma.stagePlanTemplate.upsert({
    where: { name: "Standard - All Stages" },
    update: { description },
    create: { name: "Standard - All Stages", description },
  });

  // Regenerated wholesale rather than updated item-by-item: inserting a
  // stage into the middle of STAGE_CATALOG shifts every later seq, and
  // updating one row at a time hits the (templateId, seq) unique
  // constraint the moment two items would transiently share a position.
  // Deleting and recreating the set is simpler and just as safe for a seed.
  await prisma.stagePlanTemplateItem.deleteMany({ where: { templateId: template.id } });

  const defs = await prisma.stageDefinition.findMany({
    where: { key: { in: STAGE_CATALOG.map((s) => s.key) } },
  });
  const defByKey = new Map(defs.map((d) => [d.key, d]));

  await prisma.stagePlanTemplateItem.createMany({
    data: STAGE_CATALOG.map((stage, index) => ({
      templateId: template.id,
      stageDefinitionId: defByKey.get(stage.key)!.id,
      seq: index + 1,
    })),
  });
  console.log(`Seeded the standard (all ${STAGE_CATALOG.length} stages) plan template.`);
}

async function seedAdmin() {
  const username = process.env.DEFAULT_ADMIN_USERNAME || "admin";
  const password = process.env.DEFAULT_ADMIN_PASSWORD || "admin123";
  const passwordHash = await bcrypt.hash(password, 10);

  await prisma.appUser.upsert({
    where: { username },
    update: { passwordHash, passwordPlain: password, role: "admin", isActive: true },
    create: {
      name: "Host Admin",
      username,
      passwordHash,
      passwordPlain: password,
      role: "admin",
      isMonitorOnly: false,
      isActive: true,
    },
  });
  console.log(`Seeded admin user "${username}".`);
}

async function main() {
  await seedStageCatalog();
  await seedStandardTemplate();
  await seedAdmin();
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
