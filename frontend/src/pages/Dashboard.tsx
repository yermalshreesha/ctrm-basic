// Dashboard screen (spec.md §8): net position per commodity, inventory by
// warehouse, and shipments in progress — three independent read-only
// widgets, built last (Phase 9) so their numbers can be cross-checked
// against the Trades/Logistics/Inventory screens already in the UI. Each
// section calls its own dashboard endpoint and loads/errors independently
// (a failure in one never blocks the others), rendering the API's values
// exactly as returned — no calculation happens here.

import { useEffect, useState } from "react";
import { apiClient } from "../api/client";
import type { DashboardPosition, InventoryBalance, Shipment } from "../api/types";
import { Banner } from "../components/Banner";
import { InventorySummaryTable } from "../components/InventorySummaryTable";
import { PositionsTable } from "../components/PositionsTable";
import { ShipmentsInProgressTable } from "../components/ShipmentsInProgressTable";

export function Dashboard() {
  const [positions, setPositions] = useState<DashboardPosition[] | null>(null);
  const [positionsError, setPositionsError] = useState<string | null>(null);

  const [balances, setBalances] = useState<InventoryBalance[] | null>(null);
  const [balancesError, setBalancesError] = useState<string | null>(null);

  const [shipments, setShipments] = useState<Shipment[] | null>(null);
  const [shipmentsError, setShipmentsError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiClient
      .get<DashboardPosition[]>("/dashboard/positions")
      .then((data) => {
        if (!cancelled) setPositions(data);
      })
      .catch((err) => {
        if (!cancelled) setPositionsError(err instanceof Error ? err.message : "Failed to load positions");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    apiClient
      .get<InventoryBalance[]>("/dashboard/inventory-summary")
      .then((data) => {
        if (!cancelled) setBalances(data);
      })
      .catch((err) => {
        if (!cancelled) setBalancesError(err instanceof Error ? err.message : "Failed to load inventory summary");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    apiClient
      .get<Shipment[]>("/dashboard/shipments-in-progress")
      .then((data) => {
        if (!cancelled) setShipments(data);
      })
      .catch((err) => {
        if (!cancelled)
          setShipmentsError(err instanceof Error ? err.message : "Failed to load shipments in progress");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div>
      <h1>Dashboard</h1>

      <section className="page-section">
        <h2>Net position by commodity</h2>
        {positionsError && <Banner onDismiss={() => setPositionsError(null)}>{positionsError}</Banner>}
        {!positionsError && positions === null && <p>Loading positions...</p>}
        {!positionsError && positions !== null && positions.length === 0 && <p>No open positions.</p>}
        {!positionsError && positions !== null && positions.length > 0 && <PositionsTable positions={positions} />}
      </section>

      <section className="page-section">
        <h2>Inventory by warehouse</h2>
        {balancesError && <Banner onDismiss={() => setBalancesError(null)}>{balancesError}</Banner>}
        {!balancesError && balances === null && <p>Loading inventory summary...</p>}
        {!balancesError && balances !== null && balances.length === 0 && <p>No stock currently in inventory.</p>}
        {!balancesError && balances !== null && balances.length > 0 && <InventorySummaryTable balances={balances} />}
      </section>

      <section className="page-section">
        <h2>Shipments in progress</h2>
        {shipmentsError && <Banner onDismiss={() => setShipmentsError(null)}>{shipmentsError}</Banner>}
        {!shipmentsError && shipments === null && <p>Loading shipments in progress...</p>}
        {!shipmentsError && shipments !== null && shipments.length === 0 && <p>No shipments in progress.</p>}
        {!shipmentsError && shipments !== null && shipments.length > 0 && (
          <ShipmentsInProgressTable shipments={shipments} />
        )}
      </section>
    </div>
  );
}
