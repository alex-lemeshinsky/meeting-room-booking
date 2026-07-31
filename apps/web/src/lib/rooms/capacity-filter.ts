const CAPACITY_ERROR = "Введіть ціле число від 1.";

export type CapacityFilterState =
  | { kind: "absent"; inputValue: "" }
  | { kind: "valid"; inputValue: string; minCapacity: number }
  | { kind: "invalid"; inputValue: string; error: string };

export function parseMinCapacity(
  value: string | string[] | undefined
): CapacityFilterState {
  if (value === undefined) {
    return { kind: "absent", inputValue: "" };
  }

  if (Array.isArray(value)) {
    return {
      kind: "invalid",
      inputValue: "",
      error: "Вкажіть одну мінімальну місткість."
    };
  }

  if (!/^[1-9]\d*$/.test(value)) {
    return { kind: "invalid", inputValue: value, error: CAPACITY_ERROR };
  }

  const minCapacity = Number(value);
  if (!Number.isSafeInteger(minCapacity)) {
    return { kind: "invalid", inputValue: value, error: CAPACITY_ERROR };
  }

  return { kind: "valid", inputValue: value, minCapacity };
}
