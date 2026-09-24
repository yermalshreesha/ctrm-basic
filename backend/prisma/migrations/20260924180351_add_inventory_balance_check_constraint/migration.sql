-- Hand-written migration (no corresponding schema.prisma change: Prisma's
-- schema language has no CHECK-constraint attribute).
--
-- DB-level backstop for the inventory never-negative rule (BR-3) on
-- InventoryBalance, per ctrm-standards #4 (business rules enforced in the
-- backend, never only in the UI/app layer) — the app-level check lives in
-- backend/src/modules/inventory/service.ts.

-- CheckConstraint
ALTER TABLE "InventoryBalance" ADD CONSTRAINT "InventoryBalance_quantityMt_nonnegative" CHECK ("quantityMt" >= 0);
