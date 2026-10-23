-- Change 002 (intent/change-002-add-maize.md): rename the seeded "Corn"
-- commodity to "Maize" — the client's term for the same crop (Zea mays).
-- This is a rename, not an addition: the row's id is untouched, so every
-- existing Trade.commodityId FK pointing at it stays valid and simply
-- resolves to "Maize" afterwards (spec.md §2 decision 5).
--
-- Idempotent: a database with no row named "Corn" (already renamed by an
-- earlier apply of this migration, or a fresh database that seeded
-- "Maize" directly via prisma/seed.ts) is left untouched by this UPDATE.
--
-- Guarded: "name" is unique, so if both "Corn" and "Maize" rows already
-- exist (e.g. someone re-ran the seed or added "Maize" by hand before
-- this migration ran), renaming "Corn" would collide. Rather than guess
-- which row to keep, stop with a clear error so a human resolves it.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "Commodity" WHERE name = 'Corn')
     AND EXISTS (SELECT 1 FROM "Commodity" WHERE name = 'Maize') THEN
    RAISE EXCEPTION 'Cannot rename Corn to Maize: both rows already exist. Resolve manually (merge or delete one) before re-running this migration.';
  END IF;

  UPDATE "Commodity" SET name = 'Maize', "updatedAt" = now() WHERE name = 'Corn';
END $$;
