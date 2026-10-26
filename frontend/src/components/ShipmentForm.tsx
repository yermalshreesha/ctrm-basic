// Create/edit form for a Shipment (PLANNED only — see ShipmentDetail.tsx
// for the read-only view once IN_TRANSIT/DELIVERED). quantityMt is a
// plain text input (inputMode "decimal", never type="number") holding
// whatever the user typed, verbatim, and planned dates are plain
// "YYYY-MM-DD" strings straight out of a native date input (BR-1, BR-6,
// CLAUDE.md). tradeId is not a field here — it's fixed by the page
// (immutable once created, per spec §7) — and commodity isn't either,
// since a shipment reads it from its trade, never storing its own (BR-8).
//
// Client-side validation only checks that required fields are non-empty
// (same product-owner decision as TradeForm, Phase 6); every business
// rule (BR-4a, BR-3's insufficient-stock, date ordering, ...) is left to
// the backend's field-level errors, surfaced here via `fieldErrors`.

import { useEffect, useState, type FormEvent } from "react";
import { listWarehouses } from "../api/referenceData";
import type { FieldError, Shipment, TradeDirection, TransportMode, Warehouse } from "../api/types";
import "./ShipmentForm.css";

export interface ShipmentFormValues {
  warehouseId: string;
  quantityMt: string;
  transportMode: TransportMode;
  origin: string;
  destination: string;
  plannedDepartureDate: string;
  plannedArrivalDate: string;
}

export interface ShipmentFormProps {
  initial?: Shipment;
  // Which free-text field (destination for a BUY trade's shipment, origin
  // for a SELL trade's) gets auto-filled from the selected warehouse's
  // name — see spec §3's warehouse-drift concern.
  tradeDirection: TradeDirection;
  onSubmit: (values: ShipmentFormValues) => void;
  submitting: boolean;
  fieldErrors: FieldError[];
}

const TRANSPORT_MODES: TransportMode[] = ["TRUCK", "RAIL", "VESSEL"];

const REQUIRED_FIELDS: (keyof ShipmentFormValues)[] = [
  "warehouseId",
  "quantityMt",
  "origin",
  "destination",
  "plannedDepartureDate",
  "plannedArrivalDate",
];

function emptyValues(): ShipmentFormValues {
  return {
    warehouseId: "",
    quantityMt: "",
    transportMode: "TRUCK",
    origin: "",
    destination: "",
    plannedDepartureDate: "",
    plannedArrivalDate: "",
  };
}

function valuesFromShipment(shipment: Shipment): ShipmentFormValues {
  return {
    warehouseId: shipment.warehouseId,
    quantityMt: shipment.quantityMt,
    transportMode: shipment.transportMode,
    origin: shipment.origin,
    destination: shipment.destination,
    plannedDepartureDate: shipment.plannedDepartureDate,
    plannedArrivalDate: shipment.plannedArrivalDate,
  };
}

export function ShipmentForm({ initial, tradeDirection, onSubmit, submitting, fieldErrors }: ShipmentFormProps) {
  const [values, setValues] = useState<ShipmentFormValues>(() =>
    initial ? valuesFromShipment(initial) : emptyValues(),
  );
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [referenceDataError, setReferenceDataError] = useState<string | null>(null);
  const [requiredErrors, setRequiredErrors] = useState<Partial<Record<keyof ShipmentFormValues, string>>>({});
  // Whichever of origin/destination the user has actually typed into
  // stops being auto-filled from the warehouse selection — see the
  // warehouse `onChange` handler below. A loaded shipment whose
  // origin/destination already drifted from its warehouse's name counts
  // as user-entered too, even though this form instance hasn't touched
  // it itself — otherwise switching the warehouse would clobber it.
  const [originTouched, setOriginTouched] = useState(() =>
    initial ? initial.origin !== initial.warehouseName : false,
  );
  const [destinationTouched, setDestinationTouched] = useState(() =>
    initial ? initial.destination !== initial.warehouseName : false,
  );

  useEffect(() => {
    let cancelled = false;

    listWarehouses()
      .then((warehouseList) => {
        if (cancelled) return;
        setWarehouses(warehouseList);
      })
      .catch((err) => {
        if (cancelled) return;
        setReferenceDataError(err instanceof Error ? err.message : "Failed to load warehouse options");
      });

    return () => {
      cancelled = true;
    };
  }, []);

  function set<K extends keyof ShipmentFormValues>(key: K, value: ShipmentFormValues[K]) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  function handleWarehouseChange(warehouseId: string) {
    set("warehouseId", warehouseId);
    const warehouse = warehouses.find((w) => w.id === warehouseId);
    if (!warehouse) return;
    if (tradeDirection === "BUY" && !destinationTouched) set("destination", warehouse.name);
    if (tradeDirection === "SELL" && !originTouched) set("origin", warehouse.name);
  }

  function fieldMessage(field: keyof ShipmentFormValues): string | undefined {
    return requiredErrors[field] ?? fieldErrors.find((f) => f.field === field)?.message;
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();

    const missing: Partial<Record<keyof ShipmentFormValues, string>> = {};
    for (const field of REQUIRED_FIELDS) {
      if (!values[field]) missing[field] = "This field is required";
    }
    setRequiredErrors(missing);
    if (Object.keys(missing).length > 0) return;

    onSubmit(values);
  }

  return (
    <form onSubmit={handleSubmit} className="shipment-form">
      <fieldset className="form-section">
        <legend>Warehouse &amp; quantity</legend>

        {referenceDataError && <p className="field-note">{referenceDataError}</p>}

        <div className="field">
          <label htmlFor="warehouseId">
            Warehouse<span className="required-mark" aria-hidden="true" />
          </label>
          <select id="warehouseId" value={values.warehouseId} onChange={(e) => handleWarehouseChange(e.target.value)}>
            <option value="">Select a warehouse</option>
            {warehouses.map((warehouse) => (
              <option key={warehouse.id} value={warehouse.id}>
                {warehouse.name}
              </option>
            ))}
          </select>
          {fieldMessage("warehouseId") && (
            <span role="alert" className="field-error">
              {fieldMessage("warehouseId")}
            </span>
          )}
        </div>

        <div className="field">
          <label htmlFor="quantityMt">
            Quantity (MT)<span className="required-mark" aria-hidden="true" />
          </label>
          <input
            id="quantityMt"
            type="text"
            inputMode="decimal"
            value={values.quantityMt}
            onChange={(e) => set("quantityMt", e.target.value)}
          />
          {fieldMessage("quantityMt") && (
            <span role="alert" className="field-error">
              {fieldMessage("quantityMt")}
            </span>
          )}
        </div>

        <div className="field">
          <label htmlFor="transportMode">
            Transport mode<span className="required-mark" aria-hidden="true" />
          </label>
          <select
            id="transportMode"
            value={values.transportMode}
            onChange={(e) => set("transportMode", e.target.value as TransportMode)}
          >
            {TRANSPORT_MODES.map((mode) => (
              <option key={mode} value={mode}>
                {mode}
              </option>
            ))}
          </select>
        </div>
      </fieldset>

      <fieldset className="form-section">
        <legend>Origin &amp; destination</legend>

        <div className="field">
          <label htmlFor="origin">
            Origin<span className="required-mark" aria-hidden="true" />
          </label>
          <input
            id="origin"
            type="text"
            value={values.origin}
            onChange={(e) => {
              setOriginTouched(true);
              set("origin", e.target.value);
            }}
          />
          {fieldMessage("origin") && (
            <span role="alert" className="field-error">
              {fieldMessage("origin")}
            </span>
          )}
        </div>

        <div className="field">
          <label htmlFor="destination">
            Destination<span className="required-mark" aria-hidden="true" />
          </label>
          <input
            id="destination"
            type="text"
            value={values.destination}
            onChange={(e) => {
              setDestinationTouched(true);
              set("destination", e.target.value);
            }}
          />
          {fieldMessage("destination") && (
            <span role="alert" className="field-error">
              {fieldMessage("destination")}
            </span>
          )}
        </div>
      </fieldset>

      <fieldset className="form-section">
        <legend>Planned dates</legend>

        <div className="field">
          <label htmlFor="plannedDepartureDate">
            Planned departure date<span className="required-mark" aria-hidden="true" />
          </label>
          <input
            id="plannedDepartureDate"
            type="date"
            value={values.plannedDepartureDate}
            onChange={(e) => set("plannedDepartureDate", e.target.value)}
          />
          {fieldMessage("plannedDepartureDate") && (
            <span role="alert" className="field-error">
              {fieldMessage("plannedDepartureDate")}
            </span>
          )}
        </div>

        <div className="field">
          <label htmlFor="plannedArrivalDate">
            Planned arrival date<span className="required-mark" aria-hidden="true" />
          </label>
          <input
            id="plannedArrivalDate"
            type="date"
            value={values.plannedArrivalDate}
            onChange={(e) => set("plannedArrivalDate", e.target.value)}
          />
          {fieldMessage("plannedArrivalDate") && (
            <span role="alert" className="field-error">
              {fieldMessage("plannedArrivalDate")}
            </span>
          )}
        </div>
      </fieldset>

      <button type="submit" className="btn btn-primary" disabled={submitting}>
        Save
      </button>
    </form>
  );
}
