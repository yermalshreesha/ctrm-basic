# Change: Rename the Trades section to Contracts; give the Trades sub-screen real content

Requested by: Yermal Udaya Shreesha   Date: 02-11-2026
Status: done

## What they asked for

Two gaps found after change 014 shipped, testing the live app:

1. The top-level sidebar section is still labelled "Trades" — change
   014's own description ("Approval happens in the Approvals screen
   under Contracts") implied it should read "Contracts".
2. The "Trades" sub-item under that section (`/trades/trades`) still
   shows the empty "Coming soon" placeholder from
   `intent/changes/013-trade-screens.md` — it should be possible to
   view, create, and edit trades from there, not just from the legacy
   unlinked `/trades` URL.

## Decisions (confirmed with the product owner, 2026-11-02)

- Rename the top-level sidebar section from "Trades" to "Contracts",
  everywhere that label appears (sidebar entry only — the sub-item
  keeps its own, more specific label, "Trades").
- The "Trades" sub-item becomes the real, fully-functional trade list
  (filters, "New trade", "View trade" → detail/edit) — the same screen
  already built in Phase 6, moved here from the legacy unlinked
  `/trades` URL rather than rebuilt. The legacy `/trades` URL now
  redirects to `/trades/trades` instead of rendering a second copy of
  the same list, so old links/bookmarks still work.
- Removing the naming collision (top-level "Trades" vs. sub-item
  "Trades") also removes the reason `/trades/trades-13-trade-screens.md`
  came up with for collapsing the top-level label to plain text while
  inside the section (two adjacent links both reading "Trades"). With
  the top-level label now "Contracts", that collision no longer exists,
  so the top-level entry goes back to always being a normal link — the
  `collapseWhenExpanded` mechanism Phase 26 added is removed as dead
  code rather than kept unused.

## Affects existing

- `frontend/src/components/Sidebar.tsx` / `Sidebar.css`: label rename,
  `collapseWhenExpanded` mechanism removed.
- `frontend/src/App.tsx`: `/trades/trades` now renders the real
  `Trades` list component (not `TradesPlaceholder`, which is deleted);
  `/trades` becomes a `<Navigate>` redirect to `/trades/trades`.
- `intent/spec.md` §8: sidebar description, the Trades (list) bullet,
  and the Trades/Approvals placeholder bullets all need updating — the
  "Trades" sub-item is no longer a placeholder, and the legacy `/trades`
  URL is now a redirect rather than the list's own address.
- `intent/changes/013-trade-screens.md` and `014-trade-approvals.md`
  are unaffected as historical records — this change supersedes the
  specific "Trades placeholder is deferred" decision they made, which
  is noted here rather than edited into them after the fact.

## Out of scope

- No change to the Trade detail/create pages themselves, or to any
  other section (Logistics, Dashboard, Inventory).
- No change to the Approvals screen (already real content per change
  014).
