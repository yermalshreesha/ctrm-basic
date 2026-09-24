import { prisma } from "../../db.js";

export function listCounterparties() {
  return prisma.counterparty.findMany({ orderBy: { name: "asc" } });
}

export function getCounterpartyById(id: string) {
  return prisma.counterparty.findUnique({ where: { id } });
}
