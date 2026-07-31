import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { RoomCapacityFilter } from "./room-capacity-filter";

afterEach(cleanup);

describe("RoomCapacityFilter", () => {
  it("submits one labelled whole-number filter through the rooms URL", () => {
    const { container } = render(
      <RoomCapacityFilter state={{ kind: "absent", inputValue: "" }} />
    );

    const input = screen.getByRole("spinbutton", {
      name: "Мінімальна місткість"
    });
    const form = container.querySelector("form");
    expect(form).toHaveAttribute("action", "/rooms");
    expect(form).toHaveAttribute("method", "get");
    expect(input).toHaveAttribute("name", "minCapacity");
    expect(input).toHaveAttribute("min", "1");
    expect(input).toHaveAttribute("step", "1");
    expect(screen.getByRole("button", { name: "Застосувати" })).toBeVisible();
    expect(
      screen.queryByRole("link", { name: "Скинути фільтр" })
    ).not.toBeInTheDocument();
  });

  it("preserves a valid value and offers reset", () => {
    render(
      <RoomCapacityFilter
        state={{ kind: "valid", inputValue: "12", minCapacity: 12 }}
      />
    );

    expect(
      screen.getByRole("spinbutton", { name: "Мінімальна місткість" })
    ).toHaveValue(12);
    expect(
      screen.getByRole("link", { name: "Скинути фільтр" })
    ).toHaveAttribute("href", "/rooms");
  });

  it("associates an invalid URL value with an accessible field error", () => {
    render(
      <RoomCapacityFilter
        state={{
          kind: "invalid",
          inputValue: "six",
          error: "Введіть ціле число від 1."
        }}
      />
    );

    const input = screen.getByRole("spinbutton", {
      name: "Мінімальна місткість"
    });
    const alert = screen.getByRole("alert");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAttribute("aria-describedby", alert.id);
    expect(alert).toHaveTextContent("Введіть ціле число від 1.");
    expect(
      screen.getByRole("link", { name: "Скинути фільтр" })
    ).toHaveAttribute("href", "/rooms");
  });
});
