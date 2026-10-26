// Logistics (Shipment) list (spec.md §8): table of shipments across all
// trades, with status/warehouse filters kept in the URL so they survive
// refresh/back-forward — same pattern as Trades.tsx. No client-side
// pagination/sorting — renders rows in the order the API returns them.

import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { apiClient } from "../api/client";
import { listWarehouses } from "../api/referenceData";
import type { Shipment, ShipmentStatus, Warehouse } from "../api/types";
import { Banner } from "../components/Banner";

const STATUSES: ShipmentStatus[] = ["PLANNED", "IN_TRANSIT", "DELIVERED"];

export function Logistics() {
  const [searchParams, setSearchParams] = useSearchParams();
  const status = searchParams.get("status") ?? "";
  const warehouseId = searchParams.get("warehouseId") ?? "";

  const [shipments, setShipments] = useState<Shipment[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [referenceDataError, setReferenceDataError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    listWarehouses()
      .then((data) => {
        if (!cancelled) setWarehouses(data);
      })
      .catch((err) => {
        if (!cancelled) setReferenceDataError(err instanceof Error ? err.message : "Failed to load warehouse options");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    // Intentional: reset error/shipments synchronously as soon as a
    // filter changes — same rationale as Trades.tsx's identical effect.
    setError(null);
    setShipments(null);

    const query = new URLSearchParams();
    if (status) query.set("status", status);
    if (warehouseId) query.set("warehouseId", warehouseId);
    const queryString = query.toString();

    apiClient
      .get<Shipment[]>(`/shipments${queryString ? `?${queryString}` : ""}`)
      .then((data) => {
        if (!cancelled) setShipments(data);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load shipments");
      });

    return () => {
      cancelled = true;
    };
  }, [status, warehouseId]);

  function updateFilter(key: string, value: string) {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(key, value);
    else next.delete(key);
    setSearchParams(next);
  }

  return (
    <div>
      <h1>Logistics</h1>

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
          <label htmlFor="filter-warehouse">Warehouse</label>
          <select
            id="filter-warehouse"
            value={warehouseId}
            onChange={(e) => updateFilter("warehouseId", e.target.value)}
          >
            <option value="">All</option>
            {warehouses.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
          {referenceDataError && <span className="field-note">{referenceDataError}</span>}
        </div>

        {(status || warehouseId) && (
          <button type="button" className="btn btn-secondary" onClick={() => setSearchParams(new URLSearchParams())}>
            Clear filters
          </button>
        )}
      </div>

      {error && <Banner onDismiss={() => setError(null)}>{error}</Banner>}
      {!error && shipments === null && <p>Loading shipments...</p>}
      {!error && shipments !== null && (
        <table className="data-table">
          <thead>
            <tr>
              <th>Trade</th>
              <th>Commodity</th>
              <th>Warehouse</th>
              <th>Transport mode</th>
              <th>Origin</th>
              <th>Destination</th>
              <th>Planned</th>
              <th>Actual</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {shipments.map((shipment) => (
              <tr key={shipment.id}>
                <td>{shipment.trade.direction}</td>
                <td>{shipment.commodityName}</td>
                <td>{shipment.warehouseName}</td>
                <td>{shipment.transportMode}</td>
                <td>{shipment.origin}</td>
                <td>{shipment.destination}</td>
                <td>
                  {shipment.plannedDepartureDate} – {shipment.plannedArrivalDate}
                </td>
                <td>
                  {shipment.actualDepartureDate ?? "—"} – {shipment.actualArrivalDate ?? "—"}
                </td>
                <td>{shipment.status}</td>
                <td>
                  <Link to={`/trades/${shipment.tradeId}`}>View trade</Link>{" "}
                  <Link to={`/logistics/${shipment.id}`}>View shipment</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
