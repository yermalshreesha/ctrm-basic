-- Change 002 (intent/change-002-add-maize.md): rename the seeded "Corn"
-- commodity to "Maize" — the client's term for the same crop (Zea mays).
-- This is a rename, not an addition: the row's id is untouched, so every
-- existing Trade.commodityId FK pointing at it stays valid and simply
-- resolves to "Maize" afterwards (spec.md §2 decision 5).
--
-- Idempotent: a database with no row named "Corn" (already renamed by an
-- earlier apply of this migration, or a fresh database that seeded
-- "Maize" directly via prisma/seed.ts) is left untouched by this UPDATE.
UPDATE "Commodity" SET name = 'Maize', "updatedAt" = now() WHERE name = 'Corn';
