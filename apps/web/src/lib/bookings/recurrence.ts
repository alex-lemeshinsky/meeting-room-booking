import { buildKyivWeeklySeries } from "@mrb/time";
import { pluralizeUk } from "../ui/plural";

export interface RecurrenceSummary {
  countLabel: string;
  finalDateLabel: string;
}

export function formatOccurrenceCountLabel(count: number): string {
  return `${count} ${pluralizeUk(count, "повторення", "повторення", "повторень")}`;
}

export function recurrenceSummary(
  startAtIso: string,
  occurrenceCount: number,
  timezone: string
): RecurrenceSummary {
  const countLabel = formatOccurrenceCountLabel(occurrenceCount);

  const dummyEnd = new Date(
    new Date(startAtIso).getTime() + 30 * 60 * 1000
  ).toISOString();
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
