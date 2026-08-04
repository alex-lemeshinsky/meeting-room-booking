import { renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  useToast,
  type ShowToastOptions
} from "../../components/shell/toast-provider";
import { useNotificationStream } from "./use-notification-stream";

vi.mock("../../components/shell/toast-provider", () => ({
  useToast: vi.fn()
}));

class MockEventSource {
  static instances: MockEventSource[] = [];
  url: string;
  options: EventSourceInit | undefined;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  closed = false;

  constructor(url: string, options?: EventSourceInit) {
    this.url = url;
    this.options = options;
    MockEventSource.instances.push(this);
  }

  close() {
    this.closed = true;
  }
}

describe("useNotificationStream", () => {
  let mockShowToast: (options: ShowToastOptions) => void;
  let showToastSpy: ReturnType<typeof vi.fn>;
  let queryClient: QueryClient;

  beforeEach(() => {
    MockEventSource.instances = [];
    vi.stubGlobal("EventSource", MockEventSource);

    showToastSpy = vi.fn();
    mockShowToast = showToastSpy as unknown as (
      options: ShowToastOptions
    ) => void;
    vi.mocked(useToast).mockReturnValue({ showToast: mockShowToast });

    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false
        }
      }
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  function wrapper({ children }: { children: ReactNode }) {
    return createElement(
      QueryClientProvider,
      { client: queryClient },
      children
    );
  }

  it("initializes EventSource with /events and withCredentials true", () => {
    renderHook(() => useNotificationStream(), { wrapper });

    expect(MockEventSource.instances.length).toBe(1);
    const instance = MockEventSource.instances[0]!;
    expect(instance.url).toBe("/events");
    expect(instance.options).toEqual({ withCredentials: true });
  });

  it("invalidates notifications query and shows toast on notification message", () => {
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
    renderHook(() => useNotificationStream(), { wrapper });

    const instance = MockEventSource.instances[0]!;
    expect(instance.onmessage).toBeDefined();

    instance.onmessage?.({
      data: JSON.stringify({ type: "notification", payload: { id: "1" } })
    } as MessageEvent);

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["notifications"] });
    expect(showToastSpy).toHaveBeenCalledWith({
      message: "У вас нове сповіщення про бронювання",
      type: "info"
    });
  });

  it("ignores non-notification or malformed event messages", () => {
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
    renderHook(() => useNotificationStream(), { wrapper });

    const instance = MockEventSource.instances[0]!;

    instance.onmessage?.({
      data: JSON.stringify({ type: "other" })
    } as MessageEvent);

    instance.onmessage?.({
      data: "invalid json"
    } as MessageEvent);

    expect(invalidateSpy).not.toHaveBeenCalled();
    expect(showToastSpy).not.toHaveBeenCalled();
  });

  it("invalidates notifications query on EventSource error (reconnect attempt)", () => {
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
    renderHook(() => useNotificationStream(), { wrapper });

    const instance = MockEventSource.instances[0]!;
    expect(instance.onerror).toBeDefined();

    instance.onerror?.(new Event("error"));

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["notifications"] });
  });

  it("closes EventSource on unmount", () => {
    const { unmount } = renderHook(() => useNotificationStream(), { wrapper });

    const instance = MockEventSource.instances[0]!;
    expect(instance.closed).toBe(false);

    unmount();

    expect(instance.closed).toBe(true);
  });
});
