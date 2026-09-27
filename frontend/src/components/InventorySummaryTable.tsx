import type { InventoryBalance } from "../api/types";

export interface InventorySummaryTableProps {
  balances: InventoryBalance[];
}

// Inventory by warehouse (spec.md §8) — the same InventoryBalance rows as
// the Inventory screen's stock table (GET /api/dashboard/inventory-summary
// reuses GET /api/inventory's data, per dashboard/routes.ts), rendered
// exactly as returned.
export function InventorySummaryTable({ balances }: InventorySummaryTableProps) {
  return (
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
  );
}
