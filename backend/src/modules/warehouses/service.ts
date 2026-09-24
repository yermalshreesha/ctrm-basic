import { prisma } from "../../db.js";

export function listWarehouses() {
  return prisma.warehouse.findMany({ orderBy: { name: "asc" } });
}

export function getWarehouseById(id: string) {
  return prisma.warehouse.findUnique({ where: { id } });
}
