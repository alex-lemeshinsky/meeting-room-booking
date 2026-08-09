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

  it("shows a recoverable empty state when a filter has no matches", () => {
    render(<RoomList isFiltered rooms={[]} />);

    expect(
      screen.getByRole("heading", {
        name: "Кімнат із такою місткістю немає"
      })
    ).toBeVisible();
    expect(
      screen.getByRole("link", { name: "Скинути фільтр" })
    ).toHaveAttribute("href", "/rooms");
  });

  it("links each room card to its accessible schedule route", () => {
    render(
      <RoomList
        rooms={[{ id: "room-1", name: "Дніпро", floor: 1, capacity: 6 }]}
      />
    );

    expect(screen.getByRole("heading", { name: "Дніпро" })).toBeVisible();
    expect(screen.getByText("1-й поверх")).toBeVisible();
    expect(screen.getByText("6 місць")).toBeVisible();
    expect(
      screen.getByRole("link", { name: "Відкрити розклад кімнати Дніпро" })
    ).toHaveAttribute("href", "/rooms/room-1");
  });
});
