/**
 * Ukrainian selects one of three plural forms from the last digits of the
 * count: `one` for 1, 21, 31… ; `few` for 2-4, 22-24… ; `many` for 0, 5-20,
 * 25-30… . Teens (11-14) always take `many`.
 */
export function pluralizeUk(
  count: number,
  one: string,
  few: string,
  many: string
): string {
  const mod10 = count % 10;
  const mod100 = count % 100;

  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return few;
  return many;
}
