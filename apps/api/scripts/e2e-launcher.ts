export interface E2ePostgres {
  stop(): Promise<void>;
}

export interface E2eApiProcess {
  exitCode: number | null;
  killed: boolean;
  signalCode: NodeJS.Signals | null;
  kill(signal: NodeJS.Signals): boolean;
  once(event: "error", listener: (error: Error) => void): E2eApiProcess;
  once(
    event: "exit",
    listener: (code: number | null, signal: NodeJS.Signals | null) => void
  ): E2eApiProcess;
}

export interface E2eApiExit {
  code: number | null;
  error: boolean;
  signal: NodeJS.Signals | null;
}

export function getE2eApiExitDiagnostic(
  exit: E2eApiExit,
  shutdownRequested: boolean
): string | undefined {
  if (exit.error) {
    return "E2E API process failed to start.";
  }

  if (!shutdownRequested && (exit.code !== 0 || exit.signal !== null)) {
    return "E2E API process exited unexpectedly.";
  }

  return undefined;
}

interface E2eLifecycleOptions {
  terminationTimeoutMs?: number;
}

export class E2eLifecycle {
  private api: E2eApiProcess | undefined;
  private apiExit: Promise<E2eApiExit> | undefined;
  private apiTermination: Promise<boolean> | undefined;
  private postgres: E2ePostgres | undefined;
  private shutdownRequested = false;
  private readonly terminationTimeoutMs: number;

  exitCode = 0;

  constructor(options: E2eLifecycleOptions = {}) {
    this.terminationTimeoutMs = options.terminationTimeoutMs ?? 5_000;
  }

  get isShutdownRequested(): boolean {
    return this.shutdownRequested;
  }

  attachPostgres(postgres: E2ePostgres): void {
    this.postgres = postgres;
  }

  attachApi(api: E2eApiProcess): void {
    this.api = api;
  }

  requestShutdown(exitCode: number): void {
    this.shutdownRequested = true;
    this.exitCode = this.exitCode === 0 ? exitCode : this.exitCode;
    void this.terminateApi();
  }

  waitForApiExit(): Promise<E2eApiExit> {
    if (!this.api) {
      throw new Error("API process has not started.");
    }

    if (this.api.exitCode !== null || this.api.signalCode !== null) {
      return Promise.resolve({
        code: this.api.exitCode,
        error: false,
        signal: this.api.signalCode
      });
    }

    this.apiExit ??= new Promise<E2eApiExit>((resolve) => {
      const api = this.api;
      if (!api) return;

      api.once("error", () => {
        resolve({ code: null, error: true, signal: null });
      });
      api.once("exit", (code, signal) => {
        resolve({ code, error: false, signal });
      });
    });

    return this.apiExit;
  }

  async finalize(): Promise<boolean> {
    const apiStopped = await this.terminateApi();
    await this.postgres?.stop();
    return apiStopped;
  }

  private async terminateApi(): Promise<boolean> {
    const api = this.api;
    if (!api || api.exitCode !== null || api.signalCode !== null) {
      return true;
    }

    this.apiTermination ??= this.terminate(api);
    return this.apiTermination;
  }

  private async terminate(api: E2eApiProcess): Promise<boolean> {
    const exit = this.waitForApiExit();
    api.kill("SIGTERM");

    if (await this.waitForExit(exit)) {
      return true;
    }

    if (api.exitCode === null && api.signalCode === null) {
      api.kill("SIGKILL");
    }

    return this.waitForExit(exit);
  }

  private async waitForExit(exit: Promise<E2eApiExit>): Promise<boolean> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const exited = await Promise.race([
      exit.then(() => true),
      new Promise<boolean>((resolve) => {
        timer = setTimeout(() => resolve(false), this.terminationTimeoutMs);
      })
    ]);

    if (timer) clearTimeout(timer);
    return exited;
  }
}
