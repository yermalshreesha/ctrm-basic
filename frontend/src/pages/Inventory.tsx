// Inventory screen (spec.md §8): current stock table (warehouse ×
// commodity × MT) plus, below it, the movements ledger (date, warehouse,
// commodity, +/− MT, linked shipment) for traceability. The two tables
// come from independent endpoints (GET /api/inventory, GET
// /api/inventory/movements) and load/error independently — a failure in
// one never blocks the other from rendering.

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiClient } from "../api/client";
import type { InventoryBalance, InventoryMovement } from "../api/types";
import { Banner } from "../components/Banner";

export function Inventory() {
  const [balances, setBalances] = useState<InventoryBalance[] | null>(null);
  const [balancesError, setBalancesError] = useState<string | null>(null);

  const [movements, setMovements] = useState<InventoryMovement[] | null>(null);
  const [movementsError, setMovementsError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiClient
      .get<InventoryBalance[]>("/inventory")
      .then((data) => {
        if (!cancelled) setBalances(data);
      })
      .catch((err) => {
        if (!cancelled) setBalancesError(err instanceof Error ? err.message : "Failed to load inventory");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    apiClient
      .get<InventoryMovement[]>("/inventory/movements")
      .then((data) => {
        if (!cancelled) setMovements(data);
      })
      .catch((err) => {
        if (!cancelled) setMovementsError(err instanceof Error ? err.message : "Failed to load inventory movements");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div>
      <h1>Inventory</h1>

      <section className="page-section">
        <h2>Current stock</h2>
        {balancesError && <Banner onDismiss={() => setBalancesError(null)}>{balancesError}</Banner>}
        {!balancesError && balances === null && <p>Loading inventory...</p>}
        {!balancesError && balances !== null && balances.length === 0 && <p>No stock currently in inventory.</p>}
        {!balancesError && balances !== null && balances.length > 0 && (
          <table className="data-table">
            <thead>
              <tr>
                <th>Warehouse</th>
                <th>Commodity</th>
                <th className="col-numeric">Quantity (MT)</th>
              </tr>
            </thead>
            <tbody>
              {balances.map((balance) => (
                <tr key={`${balance.warehouseId}-${balance.commodityId}`}>
                  <td>{balance.warehouseName}</td>
                  <td>{balance.commodityName}</td>
                  <td className="col-numeric">{balance.quantityMt}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="page-section">
        <h2>Movements</h2>
        {movementsError && <Banner onDismiss={() => setMovementsError(null)}>{movementsError}</Banner>}
        {!movementsError && movements === null && <p>Loading movements...</p>}
        {!movementsError && movements !== null && movements.length === 0 && <p>No stock movements yet.</p>}
        {!movementsError && movements !== null && movements.length > 0 && (
          <table className="data-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Warehouse</th>
                <th>Commodity</th>
                <th className="col-numeric">Quantity (MT)</th>
                <th>Shipment</th>
              </tr>
            </thead>
            <tbody>
              {movements.map((movement) => (
                <tr key={movement.id}>
                  <td>{new Date(movement.createdAt).toLocaleString()}</td>
                  <td>{movement.warehouseName}</td>
                  <td>{movement.commodityName}</td>
                  <td className="col-numeric">{movement.quantityMt}</td>
                  <td>
                    <Link to={`/logistics/${movement.shipmentId}`}>{movement.shipmentId}</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
