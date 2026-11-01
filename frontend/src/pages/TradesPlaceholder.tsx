// Trades sub-item screen (spec.md §8, intent/changes/013-trade-screens.md):
// empty placeholder under the Trades section. No data, no forms, no API
// calls — content is deferred to a future change. Named TradesPlaceholder,
// not Trades, to avoid colliding with the existing Trades list page.

export function TradesPlaceholder() {
  return (
    <div>
      <h1>Trades</h1>
      <p>Coming soon.</p>
    </div>
  );
}
