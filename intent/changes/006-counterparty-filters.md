# Change: Filter trades by counterparty
Requested by: Yermal Udaya Shreesha   Date: [today's date]
Status: in progress

## What they asked for
Traders need to see all deals with one counterparty quickly, for
example when a counterparty calls to confirm their open deals, or
before a meeting with them. Today they must scroll the whole Trades
list and pick them out by eye, which is slow and easy to get wrong.

## Details
- A new "Counterparty" dropdown on the Trades list, next to the
  Status, Commodity and Direction filters, after Direction.
- Its options come from the counterparties API, plus "All" (the
  default).
- Choosing a counterparty shows only that counterparty's trades.
- It works together with the other filters (e.g. a counterparty and
  "Confirmed" at the same time).
- Like the other filters, the choice is kept in the URL, so it
  survives a refresh.
- The backend trades list supports filtering by counterparty, with
  the same validation behavior as the existing commodity filter.

## Affects existing
- The trades list API gets one new optional filter.
- The "Clear filters" button (change 004) must now also clear the
  counterparty filter, and must appear when only the counterparty
  filter is set. Its existing tests are updated to cover four
  filters.
- No database or data changes.

## Out of scope
- A counterparty filter on the Logistics list.
- A counterparty profile page, or totals per counterparty.
- Searching counterparties by typing (a plain dropdown is enough).

## Open questions
None.