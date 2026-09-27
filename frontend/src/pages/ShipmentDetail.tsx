// Shipment detail/create page (Phase 7). Handles both
// `/logistics/new?tradeId=<id>` (create) and `/logistics/:id`
// (view/edit/actions) — same split as TradeDetail.tsx.
//
// Depart/Deliver/Delete/Save all update the page directly from that
// action's own response (every Shipment action endpoint already returns
// the full serialized shipment) rather than re-fetching — except Save,
// which additionally re-fetches the parent trade afterward, since editing
// a PLANNED shipment's quantityMt changes the trade's remainingQuantityMt
// (product owner decision, Phase 7).

import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ApiError, apiClient } from "../api/client";
import { listCommodities } from "../api/referenceData";
import type { Commodity, FieldError, Shipment, TradeWithShipments } from "../api/types";
import { Banner } from "../components/Banner";
import { ShipmentForm, type ShipmentFormValues } from "../components/ShipmentForm";
import "./ShipmentDetail.css";

type LoadState = "loading" | "loaded" | "not_found" | "error";
type TradeContextState = "loading" | "loaded" | "missing" | "not_found" | "error";

function extractFieldErrors(err: unknown): FieldError[] | null {
  if (err instanceof ApiError) {
    const body = err.body as { fields?: FieldError[] } | null;
    if (body?.fields) return body.fields;
  }
  return null;
}

// BR-3's insufficient-stock rejection is a message-only 409 (no `fields`
// array, unlike validation_failed) — synthesized into a field-level
// quantityMt error here so it renders next to the quantity field exactly
// like BR-4a's 400 (spec §8).
function extractQuantityError(err: unknown): FieldError | null {
  if (err instanceof ApiError && err.status === 409) {
    const body = err.body as { error?: string; message?: string } | null;
    if (body?.error === "insufficient_stock" && body.message) {
      return { field: "quantityMt", message: body.message };
    }
  }
  return null;
}

function messageFrom(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback;
}

export function ShipmentDetail() {
  const { id } = useParams();
  const isNew = id === undefined;
  const [searchParams] = useSearchParams();
  const tradeIdParam = searchParams.get("tradeId");
  const navigate = useNavigate();

  const [shipment, setShipment] = useState<Shipment | null>(null);
  const [loadState, setLoadState] = useState<LoadState>(isNew ? "loaded" : "loading");
  const [loadErrorMessage, setLoadErrorMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldError[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [departureDateInput, setDepartureDateInput] = useState("");
  const [arrivalDateInput, setArrivalDateInput] = useState("");

  const [tradeContext, setTradeContext] = useState<TradeWithShipments | null>(null);
  const [tradeContextState, setTradeContextState] = useState<TradeContextState>(
    isNew ? (tradeIdParam ? "loading" : "missing") : "loading",
  );
  const [commodities, setCommodities] = useState<Commodity[]>([]);

  useEffect(() => {
    listCommodities()
      .then(setCommodities)
      .catch(() => {
        // Falling back to a raw id in the create-mode summary is enough.
      });
  }, []);

  const loadTradeContext = useCallback((tradeId: string) => {
    setTradeContextState("loading");
    apiClient
      .get<TradeWithShipments>(`/trades/${tradeId}`)
      .then((data) => {
        setTradeContext(data);
        setTradeContextState("loaded");
      })
      .catch((err) => {
        if (err instanceof ApiError && err.status === 404) setTradeContextState("not_found");
        else setTradeContextState("error");
      });
  }, []);

  // Create mode: load the trade named by ?tradeId= (or show a blocking
  // message if it's missing/unknown — no separate fetch to wait for).
  useEffect(() => {
    if (!isNew) return;
    if (!tradeIdParam) {
      setTradeContextState("missing");
      return;
    }
    loadTradeContext(tradeIdParam);
  }, [isNew, tradeIdParam, loadTradeContext]);

  const refetch = useCallback(() => {
    if (!id) return;
    setLoadState("loading");
    apiClient
      .get<Shipment>(`/shipments/${id}`)
      .then((data) => {
        setShipment(data);
        setLoadState("loaded");
      })
      .catch((err) => {
        if (err instanceof ApiError && err.status === 404) {
          setLoadState("not_found");
        } else {
          setLoadErrorMessage(messageFrom(err, "Failed to load shipment"));
          setLoadState("error");
        }
      });
  }, [id]);

  useEffect(() => {
    if (!isNew) refetch();
  }, [isNew, refetch]);

  // Edit mode: once the shipment has loaded, load its (immutable) parent
  // trade too, for the "remaining to ship" line. Intentionally keyed on
  // shipment?.tradeId rather than the whole shipment object: tradeId never
  // changes for an existing shipment, so this fires once per shipment id,
  // not on every shipment update — handleSave explicitly re-triggers it
  // after a successful edit instead. The exhaustive-deps warning here is
  // expected.
  useEffect(() => {
    if (isNew || !shipment) return;
    loadTradeContext(shipment.tradeId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isNew, shipment?.tradeId, loadTradeContext]);

  useEffect(() => {
    setActionError(null);
    setFieldErrors([]);
  }, [id]);

  function handleCreate(values: ShipmentFormValues) {
    if (!tradeIdParam) return;
    setSubmitting(true);
    setFieldErrors([]);
    setActionError(null);
    apiClient
      .post<Shipment>("/shipments", { tradeId: tradeIdParam, ...values })
      .then((created) => {
        navigate(`/logistics/${created.id}`);
      })
      .catch((err) => {
        const fields = extractFieldErrors(err);
        if (fields) setFieldErrors(fields);
        else setActionError(messageFrom(err, "Failed to create shipment"));
      })
      .finally(() => setSubmitting(false));
  }

  function handleSave(values: ShipmentFormValues) {
    if (!id) return;
    setSubmitting(true);
    setFieldErrors([]);
    setActionError(null);
    apiClient
      .patch<Shipment>(`/shipments/${id}`, values)
      .then((updated) => {
        setShipment(updated);
        loadTradeContext(updated.tradeId);
      })
      .catch((err) => {
        const fields = extractFieldErrors(err);
        if (fields) setFieldErrors(fields);
        else setActionError(messageFrom(err, "Failed to save shipment"));
      })
      .finally(() => setSubmitting(false));
  }

  function runAction(request: () => Promise<Shipment>, fallback: string) {
    setSubmitting(true);
    setActionError(null);
    setFieldErrors([]);
    request()
      .then((updated) => setShipment(updated))
      .catch((err) => {
        const quantityError = extractQuantityError(err);
        if (quantityError) setFieldErrors([quantityError]);
        else setActionError(messageFrom(err, fallback));
      })
      .finally(() => setSubmitting(false));
  }

  function handleDepart() {
    if (!window.confirm("Depart this shipment? This cannot be undone.")) return;
    const body = departureDateInput ? { actualDepartureDate: departureDateInput } : undefined;
    runAction(() => apiClient.post<Shipment>(`/shipments/${id}/depart`, body), "Failed to depart shipment");
  }

  function handleDeliver() {
    if (!window.confirm("Deliver this shipment? This cannot be undone.")) return;
    const body = arrivalDateInput ? { actualArrivalDate: arrivalDateInput } : undefined;
    runAction(() => apiClient.post<Shipment>(`/shipments/${id}/deliver`, body), "Failed to deliver shipment");
  }

  function handleDelete() {
    if (!id) return;
    if (!window.confirm("Delete this shipment? This cannot be undone.")) return;
    setSubmitting(true);
    setActionError(null);
    apiClient
      .delete(`/shipments/${id}`)
      .then(() => navigate("/logistics"))
      .catch((err) => setActionError(messageFrom(err, "Failed to delete shipment")))
      .finally(() => setSubmitting(false));
  }

  function commodityName(commodityId: string): string {
    return commodities.find((c) => c.id === commodityId)?.name ?? commodityId;
  }

  if (isNew) {
    if (tradeContextState === "missing") {
      return (
        <div>
          <h1>New shipment</h1>
          <p>A trade must be specified to create a shipment.</p>
        </div>
      );
    }
    if (tradeContextState === "loading") return <p>Loading trade...</p>;
    if (tradeContextState === "not_found") return <p>Trade not found</p>;
    if (tradeContextState === "error") return <p>Failed to load trade.</p>;
    if (!tradeContext) return null;
    if (tradeContext.status !== "CONFIRMED") {
      return (
        <div>
          <h1>New shipment</h1>
          <p>Trade status is {tradeContext.status}, not CONFIRMED — a shipment can only be added to a CONFIRMED trade.</p>
        </div>
      );
    }

    return (
      <div>
        <h1>New shipment</h1>
        {actionError && <Banner onDismiss={() => setActionError(null)}>{actionError}</Banner>}
        <p className="shipment-trade-context">
          Trade: {tradeContext.direction} {commodityName(tradeContext.commodityId)} — remaining to ship:{" "}
          {tradeContext.remainingQuantityMt} MT
        </p>
        <ShipmentForm
          tradeDirection={tradeContext.direction}
          onSubmit={handleCreate}
          submitting={submitting}
          fieldErrors={fieldErrors}
        />
      </div>
    );
  }

  if (loadState === "loading") return <p>Loading shipment...</p>;
  if (loadState === "not_found") return <p>Shipment not found</p>;
  if (loadState === "error")
    return <Banner onDismiss={() => setLoadErrorMessage(null)}>{loadErrorMessage}</Banner>;
  if (!shipment) return null;

  return (
    <div>
      <h1>Shipment</h1>
      {actionError && <Banner onDismiss={() => setActionError(null)}>{actionError}</Banner>}
      {tradeContextState === "loaded" && tradeContext && (
        <p className="shipment-trade-context">Remaining to ship for this trade: {tradeContext.remainingQuantityMt} MT</p>
      )}

      {shipment.status === "PLANNED" ? (
        <ShipmentForm
          key={shipment.updatedAt}
          initial={shipment}
          tradeDirection={shipment.trade.direction}
          onSubmit={handleSave}
          submitting={submitting}
          fieldErrors={fieldErrors}
        />
      ) : (
        <dl className="shipment-summary">
          <div>
            <dt>Commodity</dt>
            <dd>{shipment.commodityName}</dd>
          </div>
          <div>
            <dt>Warehouse</dt>
            <dd>{shipment.warehouseName}</dd>
          </div>
          <div>
            <dt>Quantity (MT)</dt>
            <dd>{shipment.quantityMt}</dd>
          </div>
          <div>
            <dt>Transport mode</dt>
            <dd>{shipment.transportMode}</dd>
          </div>
          <div>
            <dt>Origin</dt>
            <dd>{shipment.origin}</dd>
          </div>
          <div>
            <dt>Destination</dt>
            <dd>{shipment.destination}</dd>
          </div>
          <div>
            <dt>Planned departure</dt>
            <dd>{shipment.plannedDepartureDate}</dd>
          </div>
          <div>
            <dt>Planned arrival</dt>
            <dd>{shipment.plannedArrivalDate}</dd>
          </div>
          <div>
            <dt>Actual departure</dt>
            <dd>{shipment.actualDepartureDate ?? "—"}</dd>
          </div>
          <div>
            <dt>Actual arrival</dt>
            <dd>{shipment.actualArrivalDate ?? "—"}</dd>
          </div>
          <div>
            <dt>Status</dt>
            <dd>{shipment.status}</dd>
          </div>
        </dl>
      )}

      <div className="actions">
        {shipment.status === "PLANNED" && (
          <>
            <div className="field">
              <label htmlFor="actualDepartureDate">Actual departure date (optional, defaults to today)</label>
              <input
                id="actualDepartureDate"
                type="date"
                value={departureDateInput}
                onChange={(e) => setDepartureDateInput(e.target.value)}
              />
            </div>
            <button onClick={handleDepart} disabled={submitting} className="btn btn-primary">
              Depart
            </button>
            <button onClick={handleDelete} disabled={submitting} className="btn btn-secondary">
              Delete
            </button>
          </>
        )}
        {shipment.status === "IN_TRANSIT" && (
          <>
            <div className="field">
              <label htmlFor="actualArrivalDate">Actual arrival date (optional, defaults to today)</label>
              <input
                id="actualArrivalDate"
                type="date"
                value={arrivalDateInput}
                onChange={(e) => setArrivalDateInput(e.target.value)}
              />
            </div>
            <button onClick={handleDeliver} disabled={submitting} className="btn btn-primary">
              Deliver
            </button>
          </>
        )}
      </div>
    </div>
  );
}
