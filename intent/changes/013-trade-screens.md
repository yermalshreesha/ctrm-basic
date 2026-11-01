# Change: Two sub-screens under Trades
Requested by: Yermal Udaya Shreesha   Date: [01-11-2026]
Status: done

## What they asked for
Same as change 012 for Logistics: when Trades is clicked in the
navigation, two sub-screens appear: "Trades" and "Approvals". For
now both are placeholder screens; their content will come in later
changes.

## Details
- Under Trades in the navigation, two sub-items:
  - Trades
  - Approvals
- Same behavior and look as the Logistics sub-items from change 012.
- Both screens show only their title and a short "Coming soon"
  message. No data, no forms, no API calls.
- Each screen has its own address (URL), so it can be opened directly
  and survives a refresh.
- Follows the look-and-feel rules (rule 9 in ctrm-standards), and the
  sidebar sub-item rule added in change 012.

## Affects existing
- The sidebar navigation: Trades gets sub-items, like Logistics.
- Decided: the existing Trades list (filters, New trade) is no longer
  reachable from the navigation. Its pages are not deleted; existing
  links to them (for example from the Dashboard and Logistics) must
  keep working.
- Existing tests that open the Trades list through the navigation may
  need updating; tests of the list itself stay unchanged.

## Out of scope
- Deleting or changing the existing Trades list, form or detail pages.
- Any approval workflow, statuses or rules.
- Backend or database changes.

## Open questions
None.