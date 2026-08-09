/**
 * Ukrainian ordinals agreeing with the masculine `поверх` all end in `-ий`
 * (`перший`, `третій`, `четвертий`), so the numeric form takes `-й` for every
 * floor and no per-number special case is needed.
 */
export function floorLabel(floor: number): string {
  return `${floor}-й поверх`;
}
