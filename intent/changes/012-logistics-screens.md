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

## Open questions
- Is "Shipment listing" different from the existing Logistics screen,
  which already lists shipments? If it's the same thing, should it
  replace or rename it instead of adding a new screen?
- How should the sub-items appear: always visible under Logistics,
  or expanding when Logistics is clicked?