-- Hand-written migration (no corresponding schema.prisma change: Prisma's
-- schema language has no CHECK-constraint attribute).
--
-- DB-level backstops for BR-5 (quantityMt > 0) and BR-6
-- (plannedArrivalDate >= plannedDepartureDate, actualArrivalDate >=
-- actualDepartureDate once both are set) on Shipment, per ctrm-standards
-- #4 (business rules enforced in the backend, never only in the UI/app
-- layer) — the app-level checks live in
-- backend/src/modules/shipments/schema.ts and service.ts.

-- CheckConstraint
ALTER TABLE "Shipment" ADD CONSTRAINT "Shipment_quantityMt_positive" CHECK ("quantityMt" > 0);

-- CheckConstraint
ALTER TABLE "Shipment" ADD CONSTRAINT "Shipment_plannedPeriod_valid" CHECK ("plannedArrivalDate" >= "plannedDepartureDate");

-- CheckConstraint
ALTER TABLE "Shipment" ADD CONSTRAINT "Shipment_actualPeriod_valid" CHECK ("actualDepartureDate" IS NULL OR "actualArrivalDate" IS NULL OR "actualArrivalDate" >= "actualDepartureDate");
