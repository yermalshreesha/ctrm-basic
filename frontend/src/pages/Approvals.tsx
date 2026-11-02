// Approvals screen (spec.md §8, intent/changes/014-trade-approvals.md):
// lists every trade currently PENDING_APPROVAL, with Approve/Reject
// actions on each row. Replaces the empty placeholder from
// intent/changes/013-trade-screens.md.

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiClient } from "../api/client";
import { listCommodities, listCounterparties } from "../api/referenceData";
import type { Commodity, Counterparty, Trade } from "../api/types";
import { Banner } from "../components/Banner";

export function Approvals() {
  const [trades, setTrades] = useState<Trade[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [commodities, setCommodities] = useState<Commodity[]>([]);
  const [counterparties, setCounterparties] = useState<Counterparty[]>([]);
  const [pendingId, setPendingId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([listCommodities(), listCounterparties()])
      .then(([commodityList, counterpartyList]) => {
        if (cancelled) return;
        setCommodities(commodityList);
        setCounterparties(counterpartyList);
      })
      .catch(() => {
        // Falling back to raw ids in the table is enough here.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    apiClient
      .get<Trade[]>("/trades?status=PENDING_APPROVAL")
      .then((data) => {
        if (!cancelled) setTrades(data);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load trades");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function commodityName(id: string): string {
    return commodities.find((c) => c.id === id)?.name ?? id;
  }

  function counterpartyName(id: string): string {
    return counterparties.find((c) => c.id === id)?.name ?? id;
  }

  function handleApprove(trade: Trade) {
    if (!window.confirm("Approve this trade? This cannot be undone.")) return;
    setPendingId(trade.id);
    setActionError(null);
    apiClient
      .post(`/trades/${trade.id}/approve`)
      .then(() => setTrades((current) => (current ?? []).filter((t) => t.id !== trade.id)))
      .catch((err) => setActionError(err instanceof Error ? err.message : "Failed to approve trade"))
      .finally(() => setPendingId(null));
  }

  function handleReject(trade: Trade) {
    if (!window.confirm("Reject this trade? It will go back to Draft.")) return;
    setPendingId(trade.id);
    setActionError(null);
    apiClient
      .post(`/trades/${trade.id}/reject`)
      .then(() => setTrades((current) => (current ?? []).filter((t) => t.id !== trade.id)))
      .catch((err) => setActionError(err instanceof Error ? err.message : "Failed to reject trade"))
      .finally(() => setPendingId(null));
  }

  return (
    <div>
      <h1>Approvals</h1>

      {error && <Banner onDismiss={() => setError(null)}>{error}</Banner>}
      {actionError && <Banner onDismiss={() => setActionError(null)}>{actionError}</Banner>}
      {!error && trades === null && <p>Loading trades...</p>}
      {!error && trades !== null && (
        <table className="data-table">
          <thead>
            <tr>
              <th>Commodity</th>
              <th>Direction</th>
              <th>Counterparty</th>
              <th className="col-numeric">Quantity (MT)</th>
              <th className="col-numeric">Price</th>
              <th>Currency</th>
              <th>Delivery period</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {trades.map((trade) => (
              <tr key={trade.id}>
                <td>{commodityName(trade.commodityId)}</td>
                <td>{trade.direction}</td>
                <td>{counterpartyName(trade.counterpartyId)}</td>
                <td className="col-numeric">{trade.quantityMt}</td>
                <td className="col-numeric">{trade.price}</td>
                <td>{trade.currency}</td>
                <td>
                  {trade.deliveryPeriodStart} – {trade.deliveryPeriodEnd}
                </td>
                <td>{trade.status}</td>
                <td>
                  <Link to={`/trades/${trade.id}`}>View trade</Link>{" "}
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={pendingId === trade.id}
                    onClick={() => handleApprove(trade)}
                  >
                    Approve
                  </button>{" "}
                  <button
                    type="button"
                    className="btn btn-secondary"
                    disabled={pendingId === trade.id}
                    onClick={() => handleReject(trade)}
                  >
                    Reject
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
