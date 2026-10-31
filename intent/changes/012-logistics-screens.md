# Change: Two new screens under Logistics
Requested by: Yermal Udaya Shreesha   Date: [today's date]
Status: in progress

## What they asked for
Add two new screens under the Logistics section: "Shipment listing"
and "Sales fulfillment". For now they are empty placeholder screens;
their content will come in later changes.

## Details
- Two new screens, reachable from the Logistics section of the
  navigation:
  - Shipment listing
  - Sales fulfillment
- Each screen shows only its title and a short "Coming soon"
  message. No data, no forms, no API calls.
- Each screen has its own address (URL), so it can be opened
  directly and survives a refresh.
- Follows the look-and-feel rules (rule 9 in ctrm-standards).

## Affects existing
- The sidebar navigation: Logistics gets sub-items (or a sub-menu).
  Rule 6 of the ctrm-standards skill says the sidebar has exactly
  four items, so the skill must be updated to allow sub-items under
  a section.
- The existing Logistics screen stays as it is.

## Out of scope
- Any content on the new screens (tables, filters, data, actions).
- Backend or database changes.
- Changes to the existing Logistics screen.

## Decision
- "Shipment listing" is a new, separate, currently-empty screen —
  not a rename or replacement of the existing Logistics screen, which
  already lists shipments and stays exactly as it is.
- **Revised:** the two new sub-items (Shipment listing, Sales
  fulfillment) are shown only while the current page is within the
  Logistics section (the shipment list, a shipment detail/new form, or
  either placeholder), and hidden while on Dashboard, Trades, or
  Inventory — derived from the current route, not a separate
  expand/collapse click state. (Originally built as always-visible;
  changed after the first implementation per product owner feedback.)
- Routes: `/logistics/shipment-listing` and
  `/logistics/sales-fulfillment`.
- ctrm-standards rule 6 is updated to allow a top-level section to
  have always-visible sub-items. See `intent/plan.md` Phase 25 and
  `intent/spec.md` §8.