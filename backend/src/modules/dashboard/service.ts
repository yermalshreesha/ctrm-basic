import { Prisma, type TradeStatus } from "@prisma/client";
import { prisma } from "../../db.js";

const POSITION_STATUSES: TradeStatus[] = ["CONFIRMED", "COMPLETED"];

export interface Position {
  commodityId: string;
  commodityName: string;
  netPositionMt: string;
}

// AC-7: per commodity, sum(BUY qty, CONFIRMED+COMPLETED) minus sum(SELL
// qty, CONFIRMED+COMPLETED); DRAFT and CANCELLED trades never contribute.
// Only commodities with at least one CONFIRMED/COMPLETED trade appear —
// there's no InventoryBalance-style row to report zero for otherwise.
export async function getPositions(): Promise<Position[]> {
  const grouped = await prisma.trade.groupBy({
    by: ["commodityId", "direction"],
    where: { status: { in: POSITION_STATUSES } },
    _sum: { quantityMt: true },
  });

  const netByCommodity = new Map<string, Prisma.Decimal>();
  for (const row of grouped) {
    const sum = row._sum?.quantityMt ?? new Prisma.Decimal(0);
    const signed = row.direction === "BUY" ? sum : sum.negated();
    netByCommodity.set(row.commodityId, (netByCommodity.get(row.commodityId) ?? new Prisma.Decimal(0)).plus(signed));
  }
  if (netByCommodity.size === 0) return [];

  const commodities = await prisma.commodity.findMany({
    where: { id: { in: [...netByCommodity.keys()] } },
    orderBy: { name: "asc" },
  });

  return commodities.map((commodity) => ({
    commodityId: commodity.id,
    commodityName: commodity.name,
    netPositionMt: (netByCommodity.get(commodity.id) ?? new Prisma.Decimal(0)).toFixed(3),
  }));
}
