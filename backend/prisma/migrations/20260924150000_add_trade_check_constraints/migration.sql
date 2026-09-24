-- Hand-written migration (no corresponding schema.prisma change: Prisma's
-- schema language has no CHECK-constraint attribute).
--
-- DB-level backstops for BR-5 (quantityMt/price > 0) and BR-6
-- (deliveryPeriodEnd >= deliveryPeriodStart) on Trade, per ctrm-standards
-- #4 (business rules enforced in the backend, never only in the UI/app
-- layer) — the app-level checks live in backend/src/modules/trades/schema.ts.

-- CheckConstraint
ALTER TABLE "Trade" ADD CONSTRAINT "Trade_quantityMt_positive" CHECK ("quantityMt" > 0);

-- CheckConstraint
ALTER TABLE "Trade" ADD CONSTRAINT "Trade_price_positive" CHECK ("price" > 0);

-- CheckConstraint
ALTER TABLE "Trade" ADD CONSTRAINT "Trade_deliveryPeriod_valid" CHECK ("deliveryPeriodEnd" >= "deliveryPeriodStart");
