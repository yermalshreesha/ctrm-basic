// The server's current LOCAL calendar date (not UTC) as "YYYY-MM-DD" —
// used to default and bound Shipment.actualDepartureDate/actualArrivalDate
// (product owner decision: local date, since a purely UTC "today" could
// disagree with the operator's own calendar date near a day boundary).
export function localToday(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
