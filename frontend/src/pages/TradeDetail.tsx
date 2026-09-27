// Trade detail/create page (Phase 6). Handles both `/trades/new`
// (create) and `/trades/:id` (view/edit/actions), since both share the
// same fields and the same TradeForm.
//
// After every action (Save, Confirm, Cancel, Complete) the page
// re-fetches GET /api/trades/:id rather than using the action's own
// response body, since the action endpoints return a bare Trade without
// the nested `shipments` this page also needs to redraw (product owner
// decision, Phase 6).

import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ApiError, apiClient } from "../api/client";
import { listCommodities, listCounterparties } from "../api/referenceData";
import type { Commodity, Counterparty, FieldError, Trade, TradeWithShipments } from "../api/types";
import { Banner } from "../components/Banner";
import { TradeForm, type TradeFormValues } from "../components/TradeForm";
import "./TradeDetail.css";

type LoadState = "loading" | "loaded" | "not_found" | "error";

function extractFieldErrors(err: unknown): FieldError[] | null {
  if (err instanceof ApiError) {
    const body = err.body as { fields?: FieldError[] } | null;
    if (body?.fields) return body.fields;
  }
  return null;
}

function messageFrom(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback;
}

export function TradeDetail() {
  const { id } = useParams();
  const isNew = id === undefined;
  const navigate = useNavigate();

  const [trade, setTrade] = useState<TradeWithShipments | null>(null);
  const [loadState, setLoadState] = useState<LoadState>(isNew ? "loaded" : "loading");
  const [loadErrorMessage, setLoadErrorMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldError[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [commodities, setCommodities] = useState<Commodity[]>([]);
  const [counterparties, setCounterparties] = useState<Counterparty[]>([]);

  useEffect(() => {
    let cancelled = false;
    Promise.all([listCommodities(), listCounterparties()])
      .then(([commodityList, counterpartyList]) => {
        if (cancelled) return;
        setCommodities(commodityList);
        setCounterparties(counterpartyList);
      })
      .catch(() => {
        // Falling back to raw ids in the read-only view is enough here.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const refetch = useCallback(() => {
    if (!id) return;
    // Intentional: reset to "loading" synchronously before the fetch
    // starts, so Confirm/Cancel/Complete/Save all show a loading state
    // right away instead of the previous trade's data lingering while
    // the refetch is in flight — the oxlint set-state-in-effect warning
    // is expected here (refetch is invoked from the effect below).
    setLoadState("loading");
    apiClient
      .get<TradeWithShipments>(`/trades/${id}`)
      .then((data) => {
        setTrade(data);
        setLoadState("loaded");
      })
      .catch((err) => {
        if (err instanceof ApiError && err.status === 404) {
          setLoadState("not_found");
        } else {
          setLoadErrorMessage(messageFrom(err, "Failed to load trade"));
          setLoadState("error");
        }
      });
  }, [id]);

  // Intentional: this effect's only job is to kick off the fetch on
  // mount/id-change; refetch's own setLoadState("loading") call (above)
  // is what oxlint is flagging here, not a separate render-only state
  // derivation — the warning is expected.
  useEffect(() => {
    if (!isNew) refetch();
  }, [isNew, refetch]);

  // Intentional: a stale action/field error from a previous trade
  // shouldn't linger when the user navigates to a different trade id —
  // the oxlint set-state-in-effect warning is expected here too.
  useEffect(() => {
    setActionError(null);
    setFieldErrors([]);
  }, [id]);

  function handleCreate(values: TradeFormValues) {
    setSubmitting(true);
    setFieldErrors([]);
    setActionError(null);
    apiClient
      .post<Trade>("/trades", values)
      .then((created) => {
        navigate(`/trades/${created.id}`);
      })
      .catch((err) => {
        const fields = extractFieldErrors(err);
        if (fields) setFieldErrors(fields);
        else setActionError(messageFrom(err, "Failed to create trade"));
      })
      .finally(() => setSubmitting(false));
  }

  function handleSave(values: TradeFormValues) {
    if (!id) return;
    setSubmitting(true);
    setFieldErrors([]);
    setActionError(null);
    apiClient
      .patch(`/trades/${id}`, values)
      .then(() => refetch())
      .catch((err) => {
        const fields = extractFieldErrors(err);
        if (fields) setFieldErrors(fields);
        else setActionError(messageFrom(err, "Failed to save trade"));
      })
      .finally(() => setSubmitting(false));
  }

  function runAction(request: () => Promise<unknown>, fallback: string) {
    setSubmitting(true);
    setActionError(null);
    request()
      .then(() => refetch())
      .catch((err) => setActionError(messageFrom(err, fallback)))
      .finally(() => setSubmitting(false));
  }

  function handleConfirm() {
    runAction(() => apiClient.post(`/trades/${id}/confirm`), "Failed to confirm trade");
  }

  function handleCancel() {
    if (!window.confirm("Cancel this trade? This cannot be undone.")) return;
    runAction(() => apiClient.post(`/trades/${id}/cancel`), "Failed to cancel trade");
  }

  function handleComplete() {
    if (!window.confirm("Complete this trade? This cannot be undone.")) return;
    runAction(() => apiClient.post(`/trades/${id}/complete`), "Failed to complete trade");
  }

  function commodityName(commodityId: string): string {
    return commodities.find((c) => c.id === commodityId)?.name ?? commodityId;
  }

  function counterpartyName(counterpartyId: string): string {
    return counterparties.find((c) => c.id === counterpartyId)?.name ?? counterpartyId;
  }

  if (isNew) {
    return (
      <div>
        <h1>New trade</h1>
        {actionError && <Banner onDismiss={() => setActionError(null)}>{actionError}</Banner>}
        <TradeForm onSubmit={handleCreate} submitting={submitting} fieldErrors={fieldErrors} />
      </div>
    );
  }

  if (loadState === "loading") return <p>Loading trade...</p>;
  if (loadState === "not_found") return <p>Trade not found</p>;
  if (loadState === "error")
    return <Banner onDismiss={() => setLoadErrorMessage(null)}>{loadErrorMessage}</Banner>;
  if (!trade) return null;

  return (
    <div>
      <h1>Trade</h1>
      {actionError && <Banner onDismiss={() => setActionError(null)}>{actionError}</Banner>}

      {trade.status === "DRAFT" ? (
        <TradeForm
          key={trade.updatedAt}
          initial={trade}
          onSubmit={handleSave}
          submitting={submitting}
          fieldErrors={fieldErrors}
        />
      ) : (
        <dl className="trade-summary">
          <div>
            <dt>Commodity</dt>
            <dd>{commodityName(trade.commodityId)}</dd>
          </div>
          <div>
            <dt>Direction</dt>
            <dd>{trade.direction}</dd>
          </div>
          <div>
            <dt>Counterparty</dt>
            <dd>{counterpartyName(trade.counterpartyId)}</dd>
          </div>
          <div>
            <dt>Quantity (MT)</dt>
            <dd>{trade.quantityMt}</dd>
          </div>
          <div>
            <dt>Price</dt>
            <dd>{trade.price}</dd>
          </div>
          <div>
            <dt>Currency</dt>
            <dd>{trade.currency}</dd>
          </div>
          <div>
            <dt>Delivery period</dt>
            <dd>
              {trade.deliveryPeriodStart} – {trade.deliveryPeriodEnd}
            </dd>
          </div>
          <div>
            <dt>Status</dt>
            <dd>{trade.status}</dd>
          </div>
        </dl>
      )}

      <div className="actions">
        {trade.status === "DRAFT" && (
          <>
            <button onClick={handleConfirm} disabled={submitting} className="btn btn-primary">
              Confirm
            </button>
            <button onClick={handleCancel} disabled={submitting} className="btn btn-secondary">
              Cancel
            </button>
          </>
        )}
        {trade.status === "CONFIRMED" && (
          <>
            <button onClick={handleComplete} disabled={submitting} className="btn btn-primary">
              Complete
            </button>
            <button onClick={handleCancel} disabled={submitting} className="btn btn-secondary">
              Cancel
            </button>
          </>
        )}
      </div>

      {trade.shipments.length > 0 && (
        <table className="data-table">
          <caption>Shipments</caption>
          <thead>
            <tr>
              <th>Status</th>
              <th>Quantity (MT)</th>
              <th>Warehouse</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {trade.shipments.map((shipment) => (
              <tr key={shipment.id}>
                <td>{shipment.status}</td>
                <td>{shipment.quantityMt}</td>
                <td>{shipment.warehouseName}</td>
                <td>
                  <Link to={`/logistics/${shipment.id}`}>View shipment</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {trade.status === "CONFIRMED" && (
        <p className="shipments-note">
          Remaining to ship: {trade.remainingQuantityMt} MT — <Link to={`/logistics/new?tradeId=${trade.id}`}>Add shipment</Link>
        </p>
      )}
    </div>
  );
}
