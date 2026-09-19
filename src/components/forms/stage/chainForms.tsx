"use client";

import { useRef, type ReactNode } from "react";
import { useToast } from "@/context/ToastContext";
import { useStageChain } from "@/hooks/useProductionChain";
import type { ChainStage, ProductionChain } from "@/lib/chain";
import { stageQtyLabels } from "@/lib/stageLabels";
import { Loader } from "@/components/ui/Loader";
import { Badge } from "@/components/ui/Badge";
import { StageActions } from "./shared";
import { useStageEntryBuilder } from "@/hooks/useStageEntryBuilder";
import {
  ChainStrip,
  DirectionPanel,
  LotSummaryTable,
  Section,
  StageLedger,
  QtyBox,
  type LedgerConfig,
  type StageLedgerHandle,
} from "./chainShared";
import type { StageFormProps } from "./types";

/**
 * The quantity-recording stages.
 *
 * Knitting through Packing all do the same thing - take a quantity in, send a
 * quantity out, lose a little - so they're one component driven by a
 * LedgerConfig rather than fourteen near-identical files. What genuinely
 * differs between them (a lot vs a size, a vendor vs a sewing line, one
 * quantity column vs three) is exactly what the config expresses.
 */

// ---------------------------------------------------------------------------
// The wrapper every chain stage shares
// ---------------------------------------------------------------------------

function ChainStageForm({
  props,
  config,
  intro,
  extra,
}: {
  props: StageFormProps;
  config: LedgerConfig;
  intro?: string;
  /** Rendered above the ledger - used where a stage needs context its
   * neighbours don't, like Fabric Store's whole-journey roll-up. */
  extra?: (cs: ChainStage, chain: NonNullable<ReturnType<typeof useStageChain>["chain"]>) => ReactNode;
}) {
  const { order, assignment, stageProgress, onForwarded } = props;
  const { chain, cs, lots, sizes, isLoading, isError } = useStageChain(order.id, assignment.poId, assignment.sectionId);
  const { submitMovement, isPending } = useStageEntryBuilder(order, assignment);
  const ledger = useRef<StageLedgerHandle>(null);
  const toast = useToast();

  if (isLoading) return <Loader label="Loading this stage…" />;
  if (isError || !cs || !chain) return <p className="text-sm text-status-bad">Couldn&apos;t load this stage&apos;s data.</p>;

  /**
   * Forwarding writes a stage_entry purely so the gating layer knows this stage
   * has moved. The quantities on it are a DELTA against what earlier entries
   * already logged, so progress.ts's running sum always equals the ledger's
   * output - the two layers stay in step instead of double-counting when a
   * stage is forwarded more than once.
   *
   * Pending rows are committed first. Forwarding a stage while a typed-but-
   * unsaved row sat above it would hand on a quantity the next stage can't see.
   */
  async function forward(isFinal: boolean) {
    if (!(await ledger.current?.save())) return;
    const alreadyLogged = stageProgress?.qtyForwarded ?? 0;
    await submitMovement({
      base: {
        qtyReceived: cs!.input,
        qtyCompletedToday: Math.max(cs!.output - alreadyLogged, 0),
        qtyForwarded: Math.max(cs!.output - alreadyLogged, 0),
        qtyRejected: Math.max(cs!.rejected - (stageProgress?.qtyRejected ?? 0), 0),
        notes: null,
      },
      action: isFinal ? "complete" : "forward",
    });
    onForwarded();
  }

  /** Records what's been entered and stops. Nothing moves on, so the stage
   * shows as in progress rather than partial. */
  async function savePlan() {
    const hadPending = ledger.current?.hasPending() ?? false;
    if (!(await ledger.current?.save())) return;
    await submitMovement({
      base: { qtyReceived: cs!.input, qtyForwarded: 0, notes: "Plan saved - nothing forwarded." },
      action: "plan",
    });
    onForwarded();
    if (!hadPending) toast.show("Progress saved. Nothing moved on.", "success");
  }

  return (
    <div className="space-y-5">
      {props.showDetails && intro && <p className="text-xs leading-relaxed text-ink-500">{intro}</p>}

      <StageLedger
        ref={ledger}
        orderId={order.id}
        poId={assignment.poId}
        sectionId={assignment.sectionId}
        unit={cs.unit}
        cs={cs}
        lots={lots}
        sizes={sizes}
        config={config}
        onSaved={onForwarded}
        showDetails={props.showDetails}
      >
        {extra?.(cs, chain)}
      </StageLedger>

      <StageActions
        sectionLabel={assignment.section?.label ?? "This stage"}
        unitType={cs.unit}
        balance={cs.balance}
        isLoading={isPending}
        onSavePlan={savePlan}
        onMoveForward={() => forward(false)}
        onComplete={() => forward(true)}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Fabric processing - KG, lot-wise
// ---------------------------------------------------------------------------

/** Fabric In-House is the one stage of this shape left: a lot goes in, a
 * slightly lighter lot comes out (Knitting/Dyeing/Compacting moved to
 * LotSendReceiveForm below). */
export function LotProcessForm(props: StageFormProps) {
  const labels = stageQtyLabels(props.assignment.section?.key);
  return (
    <ChainStageForm
      props={props}
      intro="Fabric coming back into the factory. Record what was actually received against each lot so any shortfall in transit is visible."
      config={{
        lot: "required",
        size: "none",
        inLabel: labels.in,
        outLabel: labels.out,
        rejectedLabel: labels.rejected,
        reworkLabel: labels.rework,
        ref: { label: "Unit / Party", presets: [], placeholder: "In-house or vendor" },
        docLabel: false,
        txnType: "process",
        // Compacting's received quantity for this lot is what should be
        // arriving back here - carried forward rather than re-typed.
        lotAvailable: true,
      }}
    />
  );
}

/**
 * Knitting, Dyeing and Compacting are all the same shape: material physically
 * leaves this point to a processing unit (Sending), and comes back lighter
 * (Receiving) - two events, not one, and both worth recording. This is the
 * same pattern EmbroideryForm already uses (two ledgers, txnType 'send' and
 * 'receive'), generalized so the other three round-trip stages share it
 * instead of re-implementing it.
 *
 * Sending writes to qtyIn (this is genuinely what the stage "received in and
 * sent onward" - the chain's normal recordedIn), Receiving writes to qtyOut
 * (what's actually available to the next stage). Keeping them on SEPARATE
 * columns is what lets the chain's ordinary carry-over and mismatch banner work
 * here: the next stage inherits Receiving's total, not Sending-plus-Receiving
 * combined.
 *
 * Only Dyeing's Sending ledger may raise a brand new lot - Knitting has no lot
 * dimension at all (see SEND_RECEIVE_COPY below, lotMode: "none"), and
 * Compacting/Brushing always pick from the existing register.
 */
export function LotSendReceiveForm(props: StageFormProps) {
  const { order, assignment, stageProgress, onForwarded } = props;
  const key = assignment.section?.key;
  const { chain, cs, lots, sizes, isLoading, isError } = useStageChain(order.id, assignment.poId, assignment.sectionId);
  const { submitMovement, isPending } = useStageEntryBuilder(order, assignment);
  const sendLedger = useRef<StageLedgerHandle>(null);
  const receiveLedger = useRef<StageLedgerHandle>(null);
  const toast = useToast();

  if (isLoading) return <Loader label="Loading this stage…" />;
  if (isError || !cs) return <p className="text-sm text-status-bad">Couldn&apos;t load this stage&apos;s data.</p>;

  const copy = SEND_RECEIVE_COPY[key ?? ""] ?? SEND_RECEIVE_COPY.default;
  const labels = stageQtyLabels(key);
  // A stage that follows the plan only has lots to pick from once the plan's
  // lot-origin stage (Dyeing) has come before it; ahead of that - or in a plan
  // with no lot origin at all - there is no lot to select, so it's a plain
  // total-quantity round trip, same as Knitting.
  const lotOriginSeq = chain?.stages.find((s) => s.stage.isLotOrigin)?.stage.seq ?? null;
  const lotsExistHere = lotOriginSeq !== null && cs.stage.seq > lotOriginSeq;
  const lotMode = copy.lotFollowsPlan && !lotsExistHere ? "none" : (copy.lotMode ?? "required");
  const sent = cs.txns.filter((t) => t.txnType === "send").reduce((s, t) => s + t.qtyIn, 0);
  const received = cs.txns.filter((t) => t.txnType === "receive").reduce((s, t) => s + t.qtyOut, 0);
  const withParty = Math.max(sent - received, 0);
  const rejected = cs.txns.filter((t) => t.txnType === "receive").reduce((s, t) => s + t.qtyRejected, 0);

  async function saveBoth(): Promise<boolean> {
    if (!(await sendLedger.current?.save())) return false;
    return (await receiveLedger.current?.save()) ?? true;
  }

  async function forward(isFinal: boolean) {
    if (!(await saveBoth())) return;
    const alreadyLogged = stageProgress?.qtyForwarded ?? 0;
    await submitMovement({
      base: {
        qtyReceived: cs!.input,
        qtyCompletedToday: Math.max(received - alreadyLogged, 0),
        qtyForwarded: Math.max(received - alreadyLogged, 0),
        qtyRejected: Math.max(rejected - (stageProgress?.qtyRejected ?? 0), 0),
        isSentOutside: true,
        notes: null,
      },
      action: isFinal ? "complete" : "forward",
    });
    onForwarded();
  }

  async function savePlan() {
    const hadPending = (sendLedger.current?.hasPending() ?? false) || (receiveLedger.current?.hasPending() ?? false);
    if (!(await saveBoth())) return;
    await submitMovement({
      base: { qtyReceived: cs!.input, qtyForwarded: 0, notes: "Plan saved - nothing forwarded." },
      action: "plan",
    });
    onForwarded();
    if (!hadPending) toast.show("Progress saved. Nothing moved on.", "success");
  }

  return (
    <div className="space-y-6">
      {props.showDetails && (
        <>
          <p className="text-xs leading-relaxed text-ink-500">{copy.intro}</p>

          <ChainStrip cs={cs} inputHint="sent so far" />

          <div className="grid grid-cols-3 gap-2">
            <QtyBox label="Sent" value={sent} unit={cs.unit} />
            <QtyBox label="Received back" value={received} unit={cs.unit} tone="good" />
            <QtyBox label={copy.withPartyLabel} value={withParty} unit={cs.unit} tone={withParty > 0 ? "warn" : "good"} />
          </div>

          {cs.byLot.length > 0 && (
            <Section title="Lot-wise position">
              <LotSummaryTable cs={cs} />
            </Section>
          )}
        </>
      )}

      <DirectionPanel direction="out" step={1} title="Sending Out" subtitle={copy.sendingHeading}>
        <StageLedger
          ref={sendLedger}
          orderId={order.id}
          poId={assignment.poId}
          sectionId={assignment.sectionId}
          unit={cs.unit}
          cs={cs}
          lots={lots}
          sizes={sizes}
          onSaved={onForwarded}
          showDetails={props.showDetails}
          config={{
            lot: lotMode,
            size: "none",
            inLabel: labels.in,
            outLabel: false,
            rejectedLabel: false,
            reworkLabel: false,
            ref: { label: "Sent To", presets: copy.presets, placeholder: "Unit / vendor name" },
            docLabel: "Doc / DC No",
            txnType: "send",
            filterByTxnType: true,
            allowCreateLot: copy.allowCreateLot,
            // Dyeing originates a lot's quantity, so there is nothing
            // upstream to ration it against. From Brushing onward the lot can
            // only send on what the previous section received for it. Knitting
            // has no lot dimension (lotMode "none"), so this never applies to
            // it either way.
            lotAvailable: !copy.allowCreateLot,
          }}
        />
      </DirectionPanel>

      <DirectionPanel direction="in" step={2} title="Receiving Back" subtitle={copy.receivingHeading}>
        <StageLedger
          ref={receiveLedger}
          orderId={order.id}
          poId={assignment.poId}
          sectionId={assignment.sectionId}
          unit={cs.unit}
          cs={cs}
          lots={lots}
          sizes={sizes}
          onSaved={onForwarded}
          showDetails={props.showDetails}
          config={{
            lot: lotMode,
            size: "none",
            inLabel: false,
            outLabel: labels.out,
            rejectedLabel: copy.noRejected ? false : labels.rejected,
            reworkLabel: false,
            ref: { label: "Received From", presets: copy.presets, placeholder: "Unit / vendor name" },
            docLabel: "Doc / DC No",
            txnType: "receive",
            filterByTxnType: true,
            allowCreateLot: false,
          }}
        />
      </DirectionPanel>

      <StageActions
        sectionLabel={assignment.section?.label ?? "This stage"}
        unitType={cs.unit}
        balance={withParty}
        isLoading={isPending}
        onSavePlan={savePlan}
        onMoveForward={() => forward(false)}
        onComplete={() => forward(true)}
      />
    </div>
  );
}

interface SendReceiveCopy {
  intro: string;
  sendingHeading: string;
  receivingHeading: string;
  withPartyLabel: string;
  rejectedLabel: string;
  presets: string[];
  allowCreateLot: boolean;
  /** "none" removes the lot picker from both panels entirely - used by
   * Knitting (tracks a total quantity, no lot of its own yet). Every other
   * stage defaults to "required" via the `copy.lotMode ?? "required"`
   * fallback where this is read. */
  lotMode?: "required" | "none";
  /** Ignores `lotMode` and derives it from where this stage sits in the
   * order's plan instead - "required" once the lot-origin stage has come
   * before it, "none" otherwise. For the stages a plan may place on either
   * side of Dyeing (see vendorWashCopy below); the original four keep their
   * fixed `lotMode` and never set this. */
  lotFollowsPlan?: boolean;
  /** Drops the Receiving panel's Rejected column. Off by default - Knitting,
   * Dyeing, Brushing and Compacting all track a real physical loss on return
   * and keep it. */
  noRejected?: boolean;
}

/** Acid Wash, Heat Setting, Washing, CPL Wash and Lubricant Wash: one shape,
 * only the wording differs. Unlike Brushing/Compacting these can sit on either
 * side of Dyeing, so the lot picker follows the plan (lotFollowsPlan). */
function vendorWashCopy(process: string, unit: string, doneLabel: string): SendReceiveCopy {
  return {
    intro: `Fabric is sent out for ${process} and comes back a slightly lighter batch - the difference is this stage's process loss. Once Dyeing has raised lots, pick the lot each entry belongs to.`,
    sendingHeading: `Sending to the ${unit} unit`,
    receivingHeading: `${doneLabel} fabric received back`,
    withPartyLabel: "With Vendor",
    rejectedLabel: "Rejected",
    presets: [],
    allowCreateLot: false,
    lotFollowsPlan: true,
  };
}

const SEND_RECEIVE_COPY: Record<string, SendReceiveCopy> = {
  acid_wash: vendorWashCopy("acid washing", "acid wash", "Acid washed"),
  heat_setting: vendorWashCopy("heat setting", "heat setting", "Heat set"),
  washing: vendorWashCopy("washing", "washing", "Washed"),
  cpl_wash: vendorWashCopy("CPL washing", "CPL wash", "CPL washed"),
  lubricant_wash: vendorWashCopy("lubricant washing", "lubricant wash", "Lubricant washed"),
  knitting: {
    intro:
      "Yarn is sent out to be knitted and fabric comes back as a physical batch. This stage tracks the total quantity sent and received - the lot number isn't raised until Dyeing, once the fabric moves on from here.",
    sendingHeading: "Sending yarn to the knitting unit",
    receivingHeading: "Fabric received back",
    withPartyLabel: "With Knitter",
    rejectedLabel: "Wastage",
    presets: ["JKR", "Texwell"],
    allowCreateLot: false,
    // Yarn hasn't become a traceable batch yet - that happens at Dyeing.
    // Removing the lot picker entirely (rather than just disabling creation)
    // is what keeps this stage a plain total-quantity round trip.
    lotMode: "none",
  },
  dyeing: {
    intro:
      "Raise a lot when you send fabric out to be dyed - every stage after this one, right through to Packing, is traced by that lot number. Each lot comes back a slightly lighter lot; the difference is this stage's process loss.",
    sendingHeading: "Sending to the dyeing unit",
    receivingHeading: "Dyed fabric received back",
    withPartyLabel: "With Dyer",
    rejectedLabel: "Rejected",
    presets: [],
    allowCreateLot: true,
  },
  brushing: {
    intro:
      "Each dyed lot is sent out to be brushed - the fleece is raised on the back of the fabric - and comes back a slightly lighter lot. It sits between Dyeing and Compacting, so what it receives is what the dyer returned, and what it returns is what the compactor gets.",
    sendingHeading: "Sending to the brushing unit",
    receivingHeading: "Brushed fabric received back",
    withPartyLabel: "With Brusher",
    rejectedLabel: "Rejected",
    presets: [],
    allowCreateLot: false,
  },
  compacting: {
    intro: "Each lot is sent out for compacting to its final GSM and width, and comes back a slightly lighter lot.",
    sendingHeading: "Sending to the compacting unit",
    receivingHeading: "Compacted fabric received back",
    withPartyLabel: "With Compactor",
    rejectedLabel: "Rejected",
    presets: [],
    allowCreateLot: false,
  },
  default: {
    intro: "Record what was sent out and what came back - the difference is this stage's process loss.",
    sendingHeading: "Sending out",
    receivingHeading: "Received back",
    withPartyLabel: "Outstanding",
    rejectedLabel: "Rejected",
    presets: [],
    allowCreateLot: false,
  },
};

/** Passed + Rejected should equal what was sent for testing - the passed
 * quantity (qtyOut) is what carries forward to Fabric Store; rejected never
 * does, since it's excluded from output by construction. */
export function LotInspectionForm(props: StageFormProps) {
  const { order, assignment } = props;
  const labels = stageQtyLabels(assignment.section?.key);
  const { cs, isLoading, isError } = useStageChain(order.id, assignment.poId, assignment.sectionId);

  return (
    <ChainStageForm
      props={props}
      intro="Four-point inspection, lot by lot. Passed plus rejected should equal what was sent for testing - anything left over is unaccounted and shows as balance. Only the passed quantity moves on to the store."
      config={{
        lot: "required",
        size: "none",
        inLabel: labels.in,
        outLabel: labels.out,
        rejectedLabel: labels.rejected,
        reworkLabel: labels.rework,
        ref: false,
        docLabel: false,
        txnType: "process",
        // Only what Fabric In-House received for this lot can be sent for
        // testing.
        lotAvailable: true,
      }}
      extra={() => (!isLoading && !isError && cs && cs.byLot.length > 0 ? <LotStatusStrip cs={cs} /> : null)}
    />
  );
}

export function lotStatus(l: ChainStage["byLot"][number]): { label: string; tone: "good" | "bad" | "warn" | "neutral" } {
  if (l.qtyIn === 0) return { label: "Not Started", tone: "neutral" };
  if (l.qtyOut > 0 && l.qtyRejected === 0 && l.balance === 0) return { label: "Passed", tone: "good" };
  if (l.qtyOut === 0 && l.qtyRejected > 0) return { label: "Rejected", tone: "bad" };
  return { label: "Partial", tone: "warn" };
}

function LotStatusStrip({ cs }: { cs: ChainStage }) {
  return (
    <Section title="Lot status">
      <div className="flex flex-wrap gap-2">
        {cs.byLot.map((l) => {
          const status = lotStatus(l);
          return (
            <div key={l.lotId} className="flex items-center gap-2 rounded-xl border border-white/70 bg-white/70 px-3 py-2">
              <span className="text-xs font-semibold text-ink-900">{l.lotNo}</span>
              <Badge tone={status.tone}>{status.label}</Badge>
            </div>
          );
        })}
      </div>
    </Section>
  );
}

/**
 * Fabric Store is a simple record, not a re-count: it states the final
 * approved quantity for each passed lot (visible above, from Fabric
 * Inspection's own Lot-wise position table, via showDetails) and which unit
 * or location is holding it. One entry per lot - no separate "issued to
 * Cutting" step, since Cutting reads this stage's output the same way every
 * other stage reads its predecessor's.
 */
export function FabricStoreForm(props: StageFormProps) {
  const labels = stageQtyLabels(props.assignment.section?.key);
  return (
    <ChainStageForm
      props={props}
      intro="Record the final approved quantity for each lot - check the Lot-wise position above for what Fabric Inspection passed - and which unit or location is holding it."
      config={{
        lot: "optional",
        size: "none",
        inLabel: false,
        outLabel: labels.out,
        rejectedLabel: false,
        reworkLabel: false,
        ref: { label: "Stored At", presets: [], placeholder: "Unit / location" },
        docLabel: false,
        txnType: "process",
        allowCreateLot: false,
        // What Fabric Inspection passed for this lot is the final approved
        // quantity - shown on selecting the lot so it isn't looked up by hand,
        // and the ceiling for what can be recorded into store.
        lotAvailable: true,
      }}
    />
  );
}

// ---------------------------------------------------------------------------
// Garment production - PCS, lot + size
// ---------------------------------------------------------------------------

/**
 * Cutting is where the unit changes. Everything before it is weighed in KG;
 * everything after is counted in pieces, size by size. Cutting is done lot by
 * lot rather than against the whole PO, so the size grid is entered per lot.
 */
export function CuttingForm(props: StageFormProps) {
  const labels = stageQtyLabels(props.assignment.section?.key);
  return (
    <ChainStageForm
      props={props}
      intro="Fabric becomes pieces here - KG stops, PCS begins. Enter the vendor, DC number and the pieces cut for each size in one table - no lot to pick. What you enter here becomes the fixed reference quantity every stage after this one measures against."
      config={{
        lot: "none",
        size: "required",
        inLabel: false,
        outLabel: labels.out,
        rejectedLabel: false,
        reworkLabel: false,
        ref: { label: "Vendor Name", presets: [], placeholder: "Unit / vendor name" },
        docLabel: "DC Name",
        dateField: true,
        txnType: "process",
        sizeGrid: true,
        // Cutting originates the size axis - it measures against the PO, not
        // against an upstream cell.
        sizeGridOrigin: true,
      }}
    />
  );
}

export function PanelCheckForm(props: StageFormProps) {
  const labels = stageQtyLabels(props.assignment.section?.key);
  return (
    <ChainStageForm
      props={props}
      intro="Cut panels are checked before they reach the line. Enter the vendor, DC number and what was checked, accepted, rejected and sent for rework, size by size in one table - no lot to pick."
      config={{
        lot: "none",
        size: "required",
        inLabel: labels.in,
        outLabel: labels.out,
        rejectedLabel: labels.rejected,
        reworkLabel: labels.rework,
        ref: { label: "Vendor Name", presets: [], placeholder: "Unit / vendor name" },
        docLabel: "DC Name",
        dateField: true,
        txnType: "process",
        sizeGrid: true,
      }}
    />
  );
}

/**
 * Embroidery, Sewing, Checking, Ironing and Packing: pick nothing (no lot,
 * same as Cutting and Panel Checking above), enter Vendor Name / Line Name,
 * DC Name and a quantity for every size in one table. Each size's ceiling is
 * cutQty - Cutting's own output for that size (chain.ts's SizeFlow.cutQty) -
 * not what the immediately previous stage happens to have recorded, since
 * none of these stages are necessarily filled in strict lockstep with each
 * other.
 */

/** Any stage whose formType is "embroidery" (Embroidery itself, plus
 * Garment Die / Printing / Stone / Bit Cutting) is still a round trip - pieces leave and
 * come back - so it keeps two ledgers over one stage, each its own bulk
 * size grid. */
export function EmbroideryForm(props: StageFormProps) {
  const { order, assignment, stageProgress, onForwarded } = props;
  const labels = stageQtyLabels(assignment.section?.key);
  const { cs, lots, sizes, isLoading, isError } = useStageChain(order.id, assignment.poId, assignment.sectionId);
  const { submitMovement, isPending } = useStageEntryBuilder(order, assignment);
  const sendLedger = useRef<StageLedgerHandle>(null);
  const returnLedger = useRef<StageLedgerHandle>(null);
  const toast = useToast();

  if (isLoading) return <Loader label="Loading this stage…" />;
  if (isError || !cs) return <p className="text-sm text-status-bad">Couldn&apos;t load this stage&apos;s data.</p>;

  // Dispatch is recorded on qtyIn, the return on qtyOut - see the send
  // ledger's config below for why they must not share a column.
  const sent = cs.txns.filter((t) => t.txnType === "send").reduce((s, t) => s + t.qtyIn, 0);
  const received = cs.txns.filter((t) => t.txnType === "receive").reduce((s, t) => s + t.qtyOut, 0);
  const withVendor = Math.max(sent - received, 0);

  async function saveBoth(): Promise<boolean> {
    if (!(await sendLedger.current?.save())) return false;
    return (await returnLedger.current?.save()) ?? true;
  }

  async function forward(isFinal: boolean) {
    if (!(await saveBoth())) return;
    const alreadyLogged = stageProgress?.qtyForwarded ?? 0;
    await submitMovement({
      base: {
        qtyReceived: cs!.input,
        qtyCompletedToday: Math.max(received - alreadyLogged, 0),
        qtyForwarded: Math.max(received - alreadyLogged, 0),
        qtyRejected: Math.max(cs!.rejected - (stageProgress?.qtyRejected ?? 0), 0),
        isSentOutside: true,
        notes: null,
      },
      action: isFinal ? "complete" : "forward",
    });
    onForwarded();
  }

  async function savePlan() {
    const hadPending = (sendLedger.current?.hasPending() ?? false) || (returnLedger.current?.hasPending() ?? false);
    if (!(await saveBoth())) return;
    await submitMovement({
      base: { qtyReceived: cs!.input, qtyForwarded: 0, notes: "Plan saved - nothing forwarded." },
      action: "plan",
    });
    onForwarded();
    if (!hadPending) toast.show("Progress saved. Nothing moved on.", "success");
  }

  return (
    <div className="space-y-6">
      {props.showDetails && (
        <p className="text-xs leading-relaxed text-ink-500">
          Pieces go out to {assignment.section?.label ? `the ${assignment.section.label.toLowerCase()}` : "this stage's"} vendor and come back. Enter the vendor, DC number and the
          quantity for every size in one table - the same bulk layout as Cutting. No lot to pick.
        </p>
      )}

      {props.showDetails && (
        <div className="grid grid-cols-3 gap-2">
          <QtyBox label="Sent out" value={sent} unit="PCS" />
          <QtyBox label="Received back" value={received} unit="PCS" tone="good" />
          <QtyBox label="With vendor" value={withVendor} unit="PCS" tone={withVendor > 0 ? "warn" : "good"} />
        </div>
      )}

      <DirectionPanel direction="out" step={1} title="Sending Out" subtitle="Vendor, DC number, and the quantity sent for every size in one table.">
        <StageLedger
          ref={sendLedger}
          orderId={order.id}
          poId={assignment.poId}
          sectionId={assignment.sectionId}
          unit="PCS"
          cs={cs}
          lots={lots}
          sizes={sizes}
          onSaved={onForwarded}
          showDetails={props.showDetails}
          config={{
            lot: "none",
            size: "required",
            inLabel: labels.in,
            outLabel: false,
            rejectedLabel: false,
            reworkLabel: false,
            ref: { label: "Vendor Name", presets: [], placeholder: "Unit / vendor name" },
            docLabel: "DC Name",
            txnType: "send",
            filterByTxnType: true,
            sizeGrid: true,
          }}
        />
      </DirectionPanel>

      <DirectionPanel direction="in" step={2} title="Receiving Back" subtitle="Vendor, DC number, and the quantity received for every size in one table.">
        <StageLedger
          ref={returnLedger}
          orderId={order.id}
          poId={assignment.poId}
          sectionId={assignment.sectionId}
          unit="PCS"
          cs={cs}
          lots={lots}
          sizes={sizes}
          onSaved={onForwarded}
          showDetails={props.showDetails}
          config={{
            lot: "none",
            size: "required",
            inLabel: false,
            outLabel: labels.out,
            rejectedLabel: false,
            reworkLabel: false,
            ref: { label: "Vendor Name", presets: [], placeholder: "Unit / vendor name" },
            docLabel: "DC Name",
            txnType: "receive",
            filterByTxnType: true,
            sizeGrid: true,
            // Rework is discovered on inspection at the point pieces come
            // back, not while they're still with the vendor - tracked here
            // only, not on the Sending panel above.
            reworkTracking: true,
          }}
        />
      </DirectionPanel>

      <StageActions
        sectionLabel={assignment.section?.label ?? "This stage"}
        unitType="PCS"
        balance={withVendor}
        isLoading={isPending}
        onSavePlan={savePlan}
        onMoveForward={() => forward(false)}
        onComplete={() => forward(true)}
      />
    </div>
  );
}

export function SewingForm(props: StageFormProps) {
  const labels = stageQtyLabels(props.assignment.section?.key);
  return (
    <ChainStageForm
      props={props}
      intro="Vendor or line name, DC number, and the quantity produced for every size in one table. No lot to pick."
      config={{
        lot: "none",
        size: "required",
        inLabel: false,
        outLabel: labels.out,
        rejectedLabel: false,
        reworkLabel: false,
        ref: { label: "Line Name", presets: ["Line 01", "Line 02", "Line 03"], placeholder: "e.g. Line 01" },
        docLabel: "DC Name",
        dateField: true,
        txnType: "process",
        sizeGrid: true,
        reworkTracking: true,
      }}
    />
  );
}

export function GarmentQcForm(props: StageFormProps) {
  const labels = stageQtyLabels(props.assignment.section?.key);
  return (
    <ChainStageForm
      props={props}
      intro="Vendor name, DC number, and the quantity checked for every size in one table. No lot to pick."
      config={{
        lot: "none",
        size: "required",
        inLabel: false,
        outLabel: labels.out,
        rejectedLabel: false,
        reworkLabel: false,
        ref: { label: "Vendor Name", presets: [], placeholder: "Unit / vendor name" },
        docLabel: "DC Name",
        dateField: true,
        txnType: "process",
        sizeGrid: true,
        reworkTracking: true,
      }}
    />
  );
}

export function GarmentProcessForm(props: StageFormProps) {
  const labels = stageQtyLabels(props.assignment.section?.key);
  return (
    <ChainStageForm
      props={props}
      intro="Vendor name, DC number, and the quantity pressed for every size in one table. No lot to pick."
      config={{
        lot: "none",
        size: "required",
        inLabel: false,
        outLabel: labels.out,
        rejectedLabel: false,
        reworkLabel: false,
        ref: { label: "Vendor Name", presets: [], placeholder: "Unit / vendor name" },
        docLabel: "DC Name",
        dateField: true,
        txnType: "process",
        sizeGrid: true,
        reworkTracking: true,
      }}
    />
  );
}

export function PackingForm(props: StageFormProps) {
  const labels = stageQtyLabels(props.assignment.section?.key);
  return (
    <ChainStageForm
      props={props}
      intro="The last stage. Vendor name, DC number, and the quantity packed for every size in one table - this is the figure the Output dashboard compares against the original order."
      config={{
        lot: "none",
        size: "required",
        inLabel: false,
        outLabel: labels.out,
        rejectedLabel: false,
        reworkLabel: false,
        ref: { label: "Vendor Name", presets: [], placeholder: "Unit / vendor name" },
        docLabel: "DC Name",
        dateField: true,
        txnType: "process",
        sizeGrid: true,
        reworkTracking: true,
      }}
      extra={(cs, chain) => <PackedAgainstOrder cs={cs} chain={chain} />}
    />
  );
}

function PackedAgainstOrder({ cs, chain }: { cs: ChainStage; chain: ProductionChain }) {
  // Was cs.bySize.reduce(...poQty) - correct only while Packing itself kept a
  // size grid. Packing now records one overall figure, so bySize is always
  // empty here; the order's total lives on the chain instead.
  const ordered = chain.totalPcs;
  const packed = cs.output;
  return (
    <Section title="Against the order">
      <div className="grid grid-cols-3 gap-2">
        <QtyBox label="Ordered" value={ordered} unit="PCS" />
        <QtyBox label="Packed" value={packed} unit="PCS" tone="good" />
        <QtyBox label="Short" value={Math.max(ordered - packed, 0)} unit="PCS" tone={ordered - packed > 0 ? "warn" : "good"} />
      </div>
    </Section>
  );
}

export { ChainStrip };
