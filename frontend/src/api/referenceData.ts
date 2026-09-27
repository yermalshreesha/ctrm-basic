// Thin wrappers around the read-only reference-data endpoints (spec.md
// §7) — used to populate Commodity/Counterparty dropdowns on the Trade
// form and to resolve names for display elsewhere.

import { apiClient } from "./client";
import type { Commodity, Counterparty, Warehouse } from "./types";

export function listCommodities() {
  return apiClient.get<Commodity[]>("/commodities");
}

export function listCounterparties() {
  return apiClient.get<Counterparty[]>("/counterparties");
}

export function listWarehouses() {
  return apiClient.get<Warehouse[]>("/warehouses");
}
