"use client";

import { OrderQtyBanner } from "./chainShared";
import { ConfirmationForm } from "./ConfirmationForm";
import { MaterialPlanningForm } from "./MaterialPlanningForm";
import { SupplierDcForm } from "./SupplierDcForm";
import { MaterialInwardForm } from "./MaterialInwardForm";
import { SimpleConfirmForm } from "./SimpleConfirmForm";
import {
  CuttingForm,
  EmbroideryForm,
  FabricStoreForm,
  GarmentProcessForm,
  GarmentQcForm,
  LotInspectionForm,
  LotProcessForm,
  LotSendReceiveForm,
  PackingForm,
  PanelCheckForm,
  SewingForm,
} from "./chainForms";
import type { StageFormProps } from "./types";

/** Picks the data-entry form for whichever stage the assignment is scoped to.
 * Stages that record the same shape of movement share a form driven by a
 * config (see chainForms.tsx); the ones that genuinely differ - confirmation,
 * procurement - have their own. */
export function StageFormRouter(props: StageFormProps) {
  return (
    <div className="space-y-4">
      {props.showDetails && <OrderQtyBanner order={props.order} assignment={props.assignment} />}
      {renderStageForm(props)}
    </div>
  );
}

function renderStageForm(props: StageFormProps) {
  switch (props.assignment.section?.formType) {
    case "confirmation":
      return <ConfirmationForm {...props} />;
    case "material_planning":
      return <MaterialPlanningForm {...props} />;
    case "supplier_dc":
      return <SupplierDcForm {...props} />;
    case "material_inward":
      return <MaterialInwardForm {...props} />;
    case "knitting":
    case "lot_send_receive":
      return <LotSendReceiveForm {...props} />;
    case "lot_process":
      return <LotProcessForm {...props} />;
    case "lot_inspection":
      return <LotInspectionForm {...props} />;
    case "fabric_store":
      return <FabricStoreForm {...props} />;
    case "simple_confirm":
      return <SimpleConfirmForm {...props} />;
    case "cutting":
      return <CuttingForm {...props} />;
    case "panel_check":
      return <PanelCheckForm {...props} />;
    case "embroidery":
      return <EmbroideryForm {...props} />;
    case "sewing":
      return <SewingForm {...props} />;
    case "garment_qc":
      return <GarmentQcForm {...props} />;
    case "garment_process":
      return <GarmentProcessForm {...props} />;
    case "packing":
      return <PackingForm {...props} />;
    default:
      return <p className="text-sm text-status-bad">Unknown stage form type.</p>;
  }
}
