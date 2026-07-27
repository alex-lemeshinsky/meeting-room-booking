export interface Clock {
  now(): Date;
}

export const CLOCK = Symbol("Clock");

export class SystemClock implements Clock {
  now(): Date {
    return new Date();
  }
}

export class FixedClock implements Clock {
  readonly #state: { instant: Date };

  constructor(instant: Date) {
    this.#state = { instant: new Date(instant) };
  }

  now(): Date {
    return new Date(this.#state.instant);
  }

  set(instant: Date): void {
    this.#state.instant = new Date(instant);
  }
}
