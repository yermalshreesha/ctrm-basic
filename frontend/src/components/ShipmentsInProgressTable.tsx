import { Link } from "react-router-dom";
import type { Shipment } from "../api/types";

export interface ShipmentsInProgressTableProps {
  shipments: Shipment[];
}

// Shipments in progress (spec.md §8): trade, transport mode, origin →
// destination, status, planned dates — PLANNED/IN_TRANSIT shipments only
// (GET /api/dashboard/shipments-in-progress). Each row links to both its
// trade and its shipment, via clear link text (ctrm-standards rule 9),
// never the direction/transport-mode values shown in the data columns.
export function ShipmentsInProgressTable({ shipments }: ShipmentsInProgressTableProps) {
  return (
    <table className="data-table">
      <thead>
        <tr>
          <th>Trade</th>
          <th>Transport mode</th>
          <th>Origin → destination</th>
          <th>Status</th>
          <th>Planned</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        {shipments.map((shipment) => (
          <tr key={shipment.id}>
            <td>{shipment.trade.direction}</td>
            <td>{shipment.transportMode}</td>
            <td>
              {shipment.origin} → {shipment.destination}
            </td>
            <td>{shipment.status}</td>
            <td>
              {shipment.plannedDepartureDate} – {shipment.plannedArrivalDate}
            </td>
            <td>
              <Link to={`/trades/${shipment.trade.id}`}>View trade</Link>{" "}
              <Link to={`/logistics/${shipment.id}`}>View shipment</Link>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
