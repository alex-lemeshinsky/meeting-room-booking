import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { useQueryClient } from "@tanstack/react-query";
import { afterEach, describe, expect, it } from "vitest";
import { QueryProvider } from "./query-provider";

const clients: unknown[] = [];

function QueryClientProbe() {
  clients.push(useQueryClient());
  return <span>query ready</span>;
}

afterEach(() => {
  cleanup();
  clients.length = 0;
});

describe("QueryProvider", () => {
  it("keeps one query client for the mounted browser lifecycle", () => {
    const view = render(
      <QueryProvider>
        <QueryClientProbe />
      </QueryProvider>
    );

    view.rerender(
      <QueryProvider>
        <QueryClientProbe />
      </QueryProvider>
    );

    expect(screen.getByText("query ready")).toBeVisible();
    expect(clients).toHaveLength(2);
    expect(clients[1]).toBe(clients[0]);
  });
});
