import { prisma } from "../../db.js";

export function listCommodities() {
  return prisma.commodity.findMany({ orderBy: { name: "asc" } });
}
