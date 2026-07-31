const DEFAULT_FOCUSABLE =
  "a[href], button:not(:disabled), input:not(:disabled), " +
  "select:not(:disabled), textarea:not(:disabled), " +
  '[tabindex]:not([tabindex="-1"])';

interface FocusContainmentEvent {
  currentTarget: HTMLElement;
  key: string;
  preventDefault(): void;
  shiftKey: boolean;
}

export function lockDocumentScroll(target: Document = document): () => void {
  const previousOverflow = target.body.style.overflow;
  target.body.style.overflow = "hidden";

  return () => {
    target.body.style.overflow = previousOverflow;
  };
}

export function containTabFocus(
  event: FocusContainmentEvent,
  selector = DEFAULT_FOCUSABLE
): void {
  if (event.key !== "Tab") return;

  const focusable = Array.from(
    event.currentTarget.querySelectorAll<HTMLElement>(selector)
  );
  const first = focusable[0];
  const last = focusable.at(-1);
  if (first === undefined || last === undefined) return;

  const activeElement = document.activeElement;
  if (
    !(activeElement instanceof HTMLElement) ||
    !focusable.includes(activeElement)
  ) {
    event.preventDefault();
    (event.shiftKey ? last : first).focus();
  } else if (event.shiftKey && activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}
