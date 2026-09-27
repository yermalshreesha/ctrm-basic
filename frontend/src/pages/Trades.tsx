// Trades list (spec.md §8): table with status/commodity/direction
// filters (kept in the URL so they survive refresh/back-forward) and a
// "New trade" link. No client-side pagination/sorting — the backend
// already returns createdAt desc, and this is a single-user local app.

import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { apiClient } from "../api/client";
import { listCommodities, listCounterparties } from "../api/referenceData";
import type { Commodity, Counterparty, Trade, TradeDirection, TradeStatus } from "../api/types";
import { Banner } from "../components/Banner";

const STATUSES: TradeStatus[] = ["DRAFT", "CONFIRMED", "COMPLETED", "CANCELLED"];
const DIRECTIONS: TradeDirection[] = ["BUY", "SELL"];

export function Trades() {
  const [searchParams, setSearchParams] = useSearchParams();
  const status = searchParams.get("status") ?? "";
  const commodityId = searchParams.get("commodityId") ?? "";
  const direction = searchParams.get("direction") ?? "";

  const [trades, setTrades] = useState<Trade[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [commodities, setCommodities] = useState<Commodity[]>([]);
  const [counterparties, setCounterparties] = useState<Counterparty[]>([]);
  const [referenceDataError, setReferenceDataError] = useState<string | null>(null);

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

  useEffect(() => {
    let cancelled = false;
    // Intentional: reset error/trades synchronously as soon as a filter
    // changes, so the page immediately shows "Loading trades..." instead
    // of stale rows from the previous filter while the new request is in
    // flight — the oxlint set-state-in-effect warning is expected here.
    setError(null);
    setTrades(null);

    const query = new URLSearchParams();
    if (status) query.set("status", status);
    if (commodityId) query.set("commodityId", commodityId);
    if (direction) query.set("direction", direction);
    const queryString = query.toString();

    apiClient
      .get<Trade[]>(`/trades${queryString ? `?${queryString}` : ""}`)
      .then((data) => {
        if (!cancelled) setTrades(data);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load trades");
      });

    return () => {
      cancelled = true;
    };
  }, [status, commodityId, direction]);

  function updateFilter(key: string, value: string) {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(key, value);
    else next.delete(key);
    setSearchParams(next);
  }

  function commodityName(id: string): string {
    return commodities.find((c) => c.id === id)?.name ?? id;
  }

  function counterpartyName(id: string): string {
    return counterparties.find((c) => c.id === id)?.name ?? id;
  }

  return (
    <div>
      <h1>Trades</h1>

      <div className="filters">
        <div className="filter">
          <label htmlFor="filter-status">Status</label>
          <select id="filter-status" value={status} onChange={(e) => updateFilter("status", e.target.value)}>
            <option value="">All</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>

        <div className="filter">
          <label htmlFor="filter-commodity">Commodity</label>
          <select
            id="filter-commodity"
            value={commodityId}
            onChange={(e) => updateFilter("commodityId", e.target.value)}
          >
            <option value="">All</option>
            {commodities.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          {referenceDataError && <span className="field-note">{referenceDataError}</span>}
        </div>

        <div className="filter">
          <label htmlFor="filter-direction">Direction</label>
          <select id="filter-direction" value={direction} onChange={(e) => updateFilter("direction", e.target.value)}>
            <option value="">All</option>
            {DIRECTIONS.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </div>

        <Link to="/trades/new" className="btn btn-primary">
          New trade
        </Link>
      </div>

      {error && <Banner onDismiss={() => setError(null)}>{error}</Banner>}
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
                  <Link to={`/trades/${trade.id}`}>View trade</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
