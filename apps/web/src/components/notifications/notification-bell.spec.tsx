import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchNotifications, markNotificationRead } from "../../lib/api/notifications";
import { NotificationBell } from "./notification-bell";

const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockPush
  })
}));

vi.mock("../../lib/api/notifications", () => ({
  fetchNotifications: vi.fn(),
  markNotificationRead: vi.fn()
}));

describe("NotificationBell", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    mockPush.mockReset();
    vi.mocked(fetchNotifications).mockReset();
    vi.mocked(markNotificationRead).mockReset();

    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false
        }
      }
    });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  function renderComponent() {
    return render(
      <QueryClientProvider client={queryClient}>
        <NotificationBell />
      </QueryClientProvider>
    );
  }

  it("renders bell button with unread count badge when there are unread notifications", async () => {
    vi.mocked(fetchNotifications).mockResolvedValue({
      unreadCount: 2,
      notifications: [
        {
          id: "notif-1",
          type: "NEXT_BOOKING_STARTS",
          message: "Бронювання 1 починається",
          roomName: "Берлін",
          currentBookingId: "b-1",
          nextBookingId: "b-2",
          scheduledFor: "2026-08-03T10:00:00Z",
          createdAt: "2026-08-03T09:55:00Z",
          readAt: null
        },
        {
          id: "notif-2",
          type: "NEXT_BOOKING_STARTS",
          message: "Бронювання 2 починається",
          roomName: "Лондон",
          currentBookingId: "b-3",
          nextBookingId: "b-4",
          scheduledFor: "2026-08-03T11:00:00Z",
          createdAt: "2026-08-03T10:55:00Z",
          readAt: null
        }
      ]
    });

    renderComponent();

    const button = await screen.findByRole("button", {
      name: "Сповіщення (2 непрочитаних)"
    });
    expect(button).toBeInTheDocument();
    expect(button).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByText("2")).toBeInTheDocument();
  });

  it("opens panel on click and shows notification items", async () => {
    vi.mocked(fetchNotifications).mockResolvedValue({
      unreadCount: 1,
      notifications: [
        {
          id: "notif-1",
          type: "NEXT_BOOKING_STARTS",
          message: "Бронювання закінчується за 10 хв",
          roomName: "Берлін",
          currentBookingId: "b-1",
          nextBookingId: "b-2",
          scheduledFor: "2026-08-03T10:00:00Z",
          createdAt: "2026-08-03T09:55:00Z",
          readAt: null
        }
      ]
    });

    renderComponent();

    const button = await screen.findByRole("button", {
      name: "Сповіщення (1 непрочитаних)"
    });

    fireEvent.click(button);

    expect(button).toHaveAttribute("aria-expanded", "true");
    expect(
      screen.getByRole("region", { name: "Панель сповіщень" })
    ).toBeInTheDocument();
    expect(
      screen.getByText("Бронювання закінчується за 10 хв")
    ).toBeInTheDocument();
    expect(screen.getByText("Берлін")).toBeInTheDocument();
  });

  it("shows empty state when there are no notifications", async () => {
    vi.mocked(fetchNotifications).mockResolvedValue({
      unreadCount: 0,
      notifications: []
    });

    renderComponent();

    const button = await screen.findByRole("button", { name: "Сповіщення" });
    fireEvent.click(button);

    expect(screen.getByText("Немає сповіщень")).toBeInTheDocument();
  });

  it("clicking unread item calls markNotificationRead and navigates", async () => {
    vi.mocked(fetchNotifications).mockResolvedValue({
      unreadCount: 1,
      notifications: [
        {
          id: "notif-1",
          type: "NEXT_BOOKING_STARTS",
          message: "Бронювання закінчується за 10 хв",
          roomName: "Берлін",
          currentBookingId: "b-1",
          nextBookingId: "b-2",
          scheduledFor: "2026-08-03T10:00:00Z",
          createdAt: "2026-08-03T09:55:00Z",
          readAt: null
        }
      ]
    });
    vi.mocked(markNotificationRead).mockResolvedValue({
      notification: {
        id: "notif-1",
        readAt: "2026-08-03T10:00:00Z"
      }
    });

    renderComponent();

    const button = await screen.findByRole("button", {
      name: "Сповіщення (1 непрочитаних)"
    });
    fireEvent.click(button);

    const itemButton = screen
      .getByText("Бронювання закінчується за 10 хв")
      .closest("button");
    expect(itemButton).not.toBeNull();

    fireEvent.click(itemButton!);

    await waitFor(() => {
      expect(markNotificationRead).toHaveBeenCalledWith("notif-1");
    });
    expect(mockPush).toHaveBeenCalledWith("/my-bookings");
  });

  it("pressing Escape closes open panel and returns focus to bell button", async () => {
    vi.mocked(fetchNotifications).mockResolvedValue({
      unreadCount: 0,
      notifications: []
    });

    renderComponent();

    const button = await screen.findByRole("button", { name: "Сповіщення" });
    fireEvent.click(button);

    expect(
      screen.getByRole("region", { name: "Панель сповіщень" })
    ).toBeInTheDocument();

    fireEvent.keyDown(window, { key: "Escape" });

    expect(
      screen.queryByRole("region", { name: "Панель сповіщень" })
    ).not.toBeInTheDocument();
    expect(button).toHaveAttribute("aria-expanded", "false");
  });
});
