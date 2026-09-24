---
name: ctrm-standards
description: Apply the ctrm-basic project's design and coding standards. Use whenever writing specs, designing the data model, APIs or UI, or writing code for the CTRM app.
---
# CTRM standards

1. Numbers: never use floating point for money or quantities. Store
   prices and quantities as decimals (quantity in MT, 3 decimals;
   price, 2 decimals).
2. Records: every table has id, createdAt and updatedAt. Exceptions:
   an append-only ledger table (e.g. an inventory movement log) has no
   updatedAt, since no row is ever updated after it's written; a
   derived/materialized balance table may drop both id and createdAt,
   using a composite key instead, since it has no independent identity
   apart from the keys it's derived from and no creation moment apart
   from theirs.
3. Status: changes follow defined transitions only. Reject invalid
   transitions with a clear error message.
4. Business rules (e.g. inventory never negative) are enforced in the
   backend, never only in the UI.
5. Validation: every API input is validated against a schema.
6. UI: sidebar navigation with Dashboard, Trades, Logistics, Inventory.
   List pages use tables; forms show validation errors next to fields.
7. Tests: every business rule has at least one automated test.
8. Secrets: never print or log passwords, connection strings or keys,
   including in error messages.