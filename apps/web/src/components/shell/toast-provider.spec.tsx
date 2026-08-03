import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider, useToast } from "./toast-provider";

function TestComponent({
  message = "Тестове сповіщення",
  type
}: {
  message?: string | undefined;
  type?: "info" | "success" | "danger" | undefined;
}) {
  const { showToast } = useToast();
  return (
    <button onClick={() => showToast({ message, type })}>
      Показати toast
    </button>
  );
}

function MultiToastComponent() {
  const { showToast } = useToast();
  return (
    <div>
      <button onClick={() => showToast({ message: "Toast 1" })}>Btn 1</button>
      <button onClick={() => showToast({ message: "Toast 2" })}>Btn 2</button>
      <button onClick={() => showToast({ message: "Toast 3" })}>Btn 3</button>
      <button onClick={() => showToast({ message: "Toast 4" })}>Btn 4</button>
    </div>
  );
}

describe("ToastProvider", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    act(() => {
      vi.runOnlyPendingTimers();
    });
    vi.useRealTimers();
    cleanup();
  });

  it("renders toast message in status region when triggered", () => {
    render(
      <ToastProvider>
        <TestComponent message="Тестове сповіщення" />
      </ToastProvider>
    );

    fireEvent.click(screen.getByRole("button", { name: "Показати toast" }));

    const statusRegion = screen.getByRole("status");
    expect(statusRegion).toBeInTheDocument();
    expect(within(statusRegion).getByText("Тестове сповіщення")).toBeInTheDocument();
  });

  it("automatically dismisses toast after 8 seconds (8000ms)", () => {
    render(
      <ToastProvider>
        <TestComponent message="Тестове сповіщення" />
      </ToastProvider>
    );

    fireEvent.click(screen.getByRole("button", { name: "Показати toast" }));
    const statusRegion = screen.getByRole("status");
    expect(within(statusRegion).getByText("Тестове сповіщення")).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(8000);
    });

    expect(within(statusRegion).queryByText("Тестове сповіщення")).not.toBeInTheDocument();
  });

  it("limits visible toasts to max 3, removing the oldest one when 4th is added", () => {
    render(
      <ToastProvider>
        <MultiToastComponent />
      </ToastProvider>
    );

    fireEvent.click(screen.getByRole("button", { name: "Btn 1" }));
    fireEvent.click(screen.getByRole("button", { name: "Btn 2" }));
    fireEvent.click(screen.getByRole("button", { name: "Btn 3" }));

    const statusRegion = screen.getByRole("status");
    expect(within(statusRegion).getByText("Toast 1")).toBeInTheDocument();
    expect(within(statusRegion).getByText("Toast 2")).toBeInTheDocument();
    expect(within(statusRegion).getByText("Toast 3")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Btn 4" }));

    expect(within(statusRegion).queryByText("Toast 1")).not.toBeInTheDocument();
    expect(within(statusRegion).getByText("Toast 2")).toBeInTheDocument();
    expect(within(statusRegion).getByText("Toast 3")).toBeInTheDocument();
    expect(within(statusRegion).getByText("Toast 4")).toBeInTheDocument();
  });

  it("throws error when useToast is used outside of ToastProvider", () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<TestComponent />)).toThrow(
      "useToast must be used within a ToastProvider"
    );
    consoleError.mockRestore();
  });
});
