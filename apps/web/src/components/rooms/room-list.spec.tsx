import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { RoomList } from "./room-list";

afterEach(cleanup);

describe("RoomList", () => {
  it("shows an empty state when there are no rooms", () => {
    render(<RoomList rooms={[]} />);

    expect(
      screen.getByRole("heading", { name: "Кімнат поки немає" })
    ).toBeVisible();
  });

  it("shows each room's name, floor, and capacity without schedule links", () => {
    render(
      <RoomList
        rooms={[{ id: "room-1", name: "Дніпро", floor: 1, capacity: 6 }]}
      />
    );

    expect(screen.getByRole("heading", { name: "Дніпро" })).toBeVisible();
    expect(screen.getByText("1 поверх")).toBeVisible();
    expect(screen.getByText("6 місць")).toBeVisible();
    expect(
      screen.queryByRole("link", { name: /розклад/i })
    ).not.toBeInTheDocument();
  });
});
