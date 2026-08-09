/**
 * Half-open time intervals `[start, end)` expressed as epoch milliseconds.
 *
 * The half-open convention mirrors the `tstzrange(start_at, end_at, '[)')`
 * exclusion constraint on `bookings`, so client-side availability and the
 * database agree on adjacency: a booking that ends exactly when the next one
 * starts is not a conflict.
 */
export interface Interval {
  readonly start: number;
  readonly end: number;
}

/**
 * Two half-open intervals overlap when each starts strictly before the other
 * ends. Touching endpoints (`10:00-11:00` and `11:00-12:00`) do not overlap.
 */
export function intervalsOverlap(a: Interval, b: Interval): boolean {
  return a.start < b.end && a.end > b.start;
}

/** Builds an interval from the ISO instants used across the API contracts. */
export function parseInterval(startAt: string, endAt: string): Interval {
  return { start: Date.parse(startAt), end: Date.parse(endAt) };
}
