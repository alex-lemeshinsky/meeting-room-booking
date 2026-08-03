import { buildKyivWeeklySeries } from "@mrb/time";

export interface RecurrenceSummary {
  countLabel: string;
  finalDateLabel: string;
}

export function formatOccurrenceCountLabel(count: number): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) {
    return `${count} повторення`;
  }
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) {
    return `${count} повторення`;
  }
  return `${count} повторень`;
}

export function recurrenceSummary(
  startAtIso: string,
  occurrenceCount: number,
  timezone: string
): RecurrenceSummary {
  const countLabel = formatOccurrenceCountLabel(occurrenceCount);

  const dummyEnd = new Date(new Date(startAtIso).getTime() + 30 * 60 * 1000).toISOString();
  const series = buildKyivWeeklySeries(startAtIso, dummyEnd, occurrenceCount);
  const lastOccurrence = series.occurrences[series.occurrences.length - 1]!;

  const formatter = new Intl.DateTimeFormat("uk-UA", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: timezone
  });

  const finalDateLabel = formatter.format(new Date(lastOccurrence.startAt));

  return {
    countLabel,
    finalDateLabel
  };
}
