// Create/edit form for a Trade. quantityMt/price are plain text inputs
// (inputMode "decimal", never type="number") holding whatever the user
// typed, verbatim — never parsed into a JS number — and delivery-period
// dates are plain "YYYY-MM-DD" strings straight out of a native date
// input, never converted to a JS Date (BR-1, BR-6, CLAUDE.md).
//
// Client-side validation only checks that required fields are non-empty
// (product owner decision, Phase 6) — every business rule (positivity,
// decimal scale, date ordering, foreign-key existence, ...) is left to
// the backend's field-level 400 responses, surfaced here via the
// `fieldErrors` prop.

import { useEffect, useState, type FormEvent } from "react";
import { listCommodities, listCounterparties } from "../api/referenceData";
import type { Commodity, Counterparty, Currency, FieldError, Trade, TradeDirection } from "../api/types";
import "./TradeForm.css";

export interface TradeFormValues {
  commodityId: string;
  direction: TradeDirection;
  counterpartyId: string;
  quantityMt: string;
  price: string;
  currency: Currency;
  deliveryPeriodStart: string;
  deliveryPeriodEnd: string;
}

export interface TradeFormProps {
  initial?: Trade;
  onSubmit: (values: TradeFormValues) => void;
  submitting: boolean;
  fieldErrors: FieldError[];
}

const DIRECTIONS: TradeDirection[] = ["BUY", "SELL"];
const CURRENCIES: Currency[] = ["USD", "EUR", "GBP"];

const REQUIRED_FIELDS: (keyof TradeFormValues)[] = [
  "commodityId",
  "direction",
  "counterpartyId",
  "quantityMt",
  "price",
  "currency",
  "deliveryPeriodStart",
  "deliveryPeriodEnd",
];

function emptyValues(): TradeFormValues {
  return {
    commodityId: "",
    direction: "BUY",
    counterpartyId: "",
    quantityMt: "",
    price: "",
    currency: "USD",
    deliveryPeriodStart: "",
    deliveryPeriodEnd: "",
  };
}

function valuesFromTrade(trade: Trade): TradeFormValues {
  return {
    commodityId: trade.commodityId,
    direction: trade.direction,
    counterpartyId: trade.counterpartyId,
    quantityMt: trade.quantityMt,
    price: trade.price,
    currency: trade.currency,
    deliveryPeriodStart: trade.deliveryPeriodStart,
    deliveryPeriodEnd: trade.deliveryPeriodEnd,
  };
}

export function TradeForm({ initial, onSubmit, submitting, fieldErrors }: TradeFormProps) {
  const [values, setValues] = useState<TradeFormValues>(() => (initial ? valuesFromTrade(initial) : emptyValues()));
  const [commodities, setCommodities] = useState<Commodity[]>([]);
  const [counterparties, setCounterparties] = useState<Counterparty[]>([]);
  const [referenceDataError, setReferenceDataError] = useState<string | null>(null);
  const [requiredErrors, setRequiredErrors] = useState<Partial<Record<keyof TradeFormValues, string>>>({});

  useEffect(() => {
    let cancelled = false;

    Promise.all([listCommodities(), listCounterparties()])
      .then(([commodityList, counterpartyList]) => {
        if (cancelled) return;
        setCommodities(commodityList);
        setCounterparties(counterpartyList);
      })
      .catch((err) => {
        if (cancelled) return;
        setReferenceDataError(
          err instanceof Error ? err.message : "Failed to load commodity/counterparty options",
        );
      });

    return () => {
      cancelled = true;
    };
  }, []);

  function set<K extends keyof TradeFormValues>(key: K, value: TradeFormValues[K]) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  function fieldMessage(field: keyof TradeFormValues): string | undefined {
    return requiredErrors[field] ?? fieldErrors.find((f) => f.field === field)?.message;
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();

    const missing: Partial<Record<keyof TradeFormValues, string>> = {};
    for (const field of REQUIRED_FIELDS) {
      if (!values[field]) missing[field] = "This field is required";
    }
    setRequiredErrors(missing);
    if (Object.keys(missing).length > 0) return;

    onSubmit(values);
  }

  return (
    <form onSubmit={handleSubmit} className="trade-form">
      <fieldset className="form-section">
        <legend>Commodity &amp; counterparty</legend>

        {referenceDataError && <p className="field-note">{referenceDataError}</p>}

        <div className="field">
          <label htmlFor="commodityId">
            Commodity<span className="required-mark" aria-hidden="true" />
          </label>
          <select id="commodityId" value={values.commodityId} onChange={(e) => set("commodityId", e.target.value)}>
            <option value="">Select a commodity</option>
            {commodities.map((commodity) => (
              <option key={commodity.id} value={commodity.id}>
                {commodity.name}
              </option>
            ))}
          </select>
          {fieldMessage("commodityId") && (
            <span role="alert" className="field-error">
              {fieldMessage("commodityId")}
            </span>
          )}
        </div>

        <div className="field">
          <label htmlFor="direction">
            Direction<span className="required-mark" aria-hidden="true" />
          </label>
          <select
            id="direction"
            value={values.direction}
            onChange={(e) => set("direction", e.target.value as TradeDirection)}
          >
            {DIRECTIONS.map((direction) => (
              <option key={direction} value={direction}>
                {direction}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label htmlFor="counterpartyId">
            Counterparty<span className="required-mark" aria-hidden="true" />
          </label>
          <select
            id="counterpartyId"
            value={values.counterpartyId}
            onChange={(e) => set("counterpartyId", e.target.value)}
          >
            <option value="">Select a counterparty</option>
            {counterparties.map((counterparty) => (
              <option key={counterparty.id} value={counterparty.id}>
                {counterparty.name}
              </option>
            ))}
          </select>
          {fieldMessage("counterpartyId") && (
            <span role="alert" className="field-error">
              {fieldMessage("counterpartyId")}
            </span>
          )}
        </div>
      </fieldset>

      <fieldset className="form-section">
        <legend>Quantity &amp; price</legend>

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
          <label htmlFor="price">
            Price<span className="required-mark" aria-hidden="true" />
          </label>
          <input
            id="price"
            type="text"
            inputMode="decimal"
            value={values.price}
            onChange={(e) => set("price", e.target.value)}
          />
          {fieldMessage("price") && (
            <span role="alert" className="field-error">
              {fieldMessage("price")}
            </span>
          )}
        </div>

        <div className="field">
          <label htmlFor="currency">
            Currency<span className="required-mark" aria-hidden="true" />
          </label>
          <select id="currency" value={values.currency} onChange={(e) => set("currency", e.target.value as Currency)}>
            {CURRENCIES.map((currency) => (
              <option key={currency} value={currency}>
                {currency}
              </option>
            ))}
          </select>
        </div>
      </fieldset>

      <fieldset className="form-section">
        <legend>Delivery period</legend>

        <div className="field">
          <label htmlFor="deliveryPeriodStart">
            Delivery period start<span className="required-mark" aria-hidden="true" />
          </label>
          <input
            id="deliveryPeriodStart"
            type="date"
            value={values.deliveryPeriodStart}
            onChange={(e) => set("deliveryPeriodStart", e.target.value)}
          />
          {fieldMessage("deliveryPeriodStart") && (
            <span role="alert" className="field-error">
              {fieldMessage("deliveryPeriodStart")}
            </span>
          )}
        </div>

        <div className="field">
          <label htmlFor="deliveryPeriodEnd">
            Delivery period end<span className="required-mark" aria-hidden="true" />
          </label>
          <input
            id="deliveryPeriodEnd"
            type="date"
            value={values.deliveryPeriodEnd}
            onChange={(e) => set("deliveryPeriodEnd", e.target.value)}
          />
          {fieldMessage("deliveryPeriodEnd") && (
            <span role="alert" className="field-error">
              {fieldMessage("deliveryPeriodEnd")}
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
