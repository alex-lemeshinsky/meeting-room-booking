type ReadCurrentTime = () => Date;

export function parseSeedNowOverride(
  value: string | undefined
): Date | undefined {
  if (value === undefined) return undefined;

  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) {
    throw new RangeError(
      "MRB_SEED_NOW must be an ISO 8601 UTC instant with millisecond precision"
    );
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString() !== value) {
    throw new RangeError("MRB_SEED_NOW must be a valid UTC instant");
  }

  return parsed;
}

export function resolveSeedNow(
  override: Date | undefined,
  readCurrentTime: ReadCurrentTime = () => new Date()
): Date {
  return override ?? readCurrentTime();
}
