import type { DashboardPosition } from "../api/types";

export interface PositionsTableProps {
  positions: DashboardPosition[];
}

// Net position per commodity (spec.md §8): bought MT minus sold MT,
// computed entirely backend-side (dashboard/service.ts's getPositions) —
// rendered here exactly as returned, no client-side arithmetic.
export function PositionsTable({ positions }: PositionsTableProps) {
  return (
    <table className="data-table">
      <thead>
        <tr>
          <th>Commodity</th>
          <th className="col-numeric">Net position (MT)</th>
        </tr>
      </thead>
      <tbody>
        {positions.map((position) => (
          <tr key={position.commodityId}>
            <td>{position.commodityName}</td>
            <td className="col-numeric">{position.netPositionMt}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
