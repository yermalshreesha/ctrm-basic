# Change: Trade approval workflow
Requested by: Yermal Udaya Shreesha   Date: 02-11-2026
Status: done 

## What they asked for
Trades must be approved before they become active. Approval happens
in the Approvals screen under Contracts.

## Details
- New status between Draft and Confirmed: "Pending approval".
- A Draft trade can be "Submitted for approval" from its detail page.
  It then becomes Pending approval.
- The Approvals screen lists all trades Pending approval, in the same
  table style as the Trades list, with "Approve" and "Reject" on each
  row (with a confirmation, like Confirm and Cancel today).
- Approve: Pending approval → Confirmed.
- Reject: Pending approval → back to Draft, so it can be edited and
  submitted again.
- A Draft trade can no longer be confirmed directly; the only way to
  Confirmed is through approval.
- Existing Confirmed, Completed and Cancelled trades are unchanged.

## Affects existing
- Business rule BR-7 (allowed status changes) changes: new status and
  new transitions.
- The trade detail page: "Confirm" is replaced by "Submit for
  approval" for Draft trades.
- The database gets a new status value (an additive migration; no
  existing data changes).
- The Approvals placeholder from changes 013/014 gets real content.
- Existing tests about confirming Draft trades must be updated to the
  new flow; tests of other rules stay unchanged.

## Out of scope
- Who is allowed to approve (there is no login yet): anyone can
  approve.
- Approval history or comments.
- Notifications.

## Open questions
- Can a trade be cancelled while Pending approval? Proposed default:
  yes, like a Draft.
- Can notes be edited while Pending approval? Proposed default: no,
  only in Draft (as today, BR-11).
- Should the trade record who approved it and when? Proposed default:
  only when (approvedAt), since there are no users yet.
  