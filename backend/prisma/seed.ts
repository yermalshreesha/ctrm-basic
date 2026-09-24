import { pathToFileURL } from "node:url";
import { prisma } from "../src/db.js";

export const seedCommodities = [
  { name: "Wheat", category: "GRAIN", unit: "MT" },
  { name: "Corn", category: "GRAIN", unit: "MT" },
  { name: "Arabica Coffee", category: "COFFEE", unit: "MT" },
  { name: "Robusta Coffee", category: "COFFEE", unit: "MT" },
  { name: "Sugar ICUMSA 45", category: "SUGAR", unit: "MT" },
] as const;

export const seedCounterparties = [
  { name: "Acme Grain Traders", type: "BUYER" },
  { name: "Global Commodities Ltd", type: "SELLER" },
  { name: "Continental Agri SA", type: "BOTH" },
  { name: "Northwind Exports", type: "SELLER" },
  { name: "Harborview Trading", type: "BUYER" },
] as const;

export const seedWarehouses = [
  { name: "Rotterdam Terminal", location: "Rotterdam, Netherlands" },
  { name: "Santos Port Warehouse", location: "Santos, Brazil" },
  { name: "Houston Grain Elevator", location: "Houston, TX, USA" },
  { name: "Mombasa Bonded Warehouse", location: "Mombasa, Kenya" },
] as const;

export async function seed() {
  for (const commodity of seedCommodities) {
    await prisma.commodity.upsert({
      where: { name: commodity.name },
      update: {},
      create: commodity,
    });
  }

  for (const counterparty of seedCounterparties) {
    await prisma.counterparty.upsert({
      where: { name: counterparty.name },
      update: {},
      create: counterparty,
    });
  }

  for (const warehouse of seedWarehouses) {
    await prisma.warehouse.upsert({
      where: { name: warehouse.name },
      update: {},
      create: warehouse,
    });
  }
}

const isMainModule =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMainModule) {
  seed()
    .then(() => {
      console.log(
        `Seeded ${seedCommodities.length} commodities, ${seedCounterparties.length} counterparties, ${seedWarehouses.length} warehouses.`,
      );
    })
    .catch((error: unknown) => {
      console.error(error);
      process.exitCode = 1;
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
