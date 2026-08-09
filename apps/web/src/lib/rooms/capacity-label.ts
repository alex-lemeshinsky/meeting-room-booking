import { pluralizeUk } from "../ui/plural";

export function capacityLabel(capacity: number): string {
  return `${capacity} ${pluralizeUk(capacity, "місце", "місця", "місць")}`;
}
