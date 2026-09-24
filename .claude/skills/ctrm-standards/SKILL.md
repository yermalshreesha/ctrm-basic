---
name: ctrm-standards
description: Apply the ctrm-basic project's design and coding standards. Use whenever writing specs, designing the data model, APIs or UI, or writing code for the CTRM app.
---
# CTRM standards

1. Numbers: never use floating point for money or quantities. Store
   prices and quantities as decimals (quantity in MT, 3 decimals;
   price, 2 decimals).
2. Records: every table has id, createdAt and updatedAt.
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