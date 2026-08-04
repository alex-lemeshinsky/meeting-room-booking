import "@testing-library/jest-dom/vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WeekStartForm } from "./week-start-form";

const showToast = vi.fn();
const refresh = vi.fn();
const updateWeekStartsOn = vi.fn();

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("../shell/toast-provider", () => ({ useToast: () => ({ showToast }) }));
vi.mock("../../lib/api/me", () => ({
  updateWeekStartsOn: (value: number) => updateWeekStartsOn(value)
}));

afterEach(() => {
  cleanup();
});

describe("WeekStartForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("preselects the stored week start", () => {
    render(<WeekStartForm initialWeekStartsOn={7} />);

    expect(screen.getByLabelText("Перший день тижня")).toHaveValue("7");
  });

  it("saves the selected day, toasts, and refreshes", async () => {
    updateWeekStartsOn.mockResolvedValue({ user: { weekStartsOn: 3 } });
    render(<WeekStartForm initialWeekStartsOn={1} />);

    fireEvent.change(screen.getByLabelText("Перший день тижня"), {
      target: { value: "3" }
    });
    fireEvent.click(screen.getByRole("button", { name: "Зберегти" }));

    await waitFor(() => expect(updateWeekStartsOn).toHaveBeenCalledWith(3));
    expect(showToast).toHaveBeenCalledWith({
      message: "Перший день тижня збережено.",
      type: "success"
    });
    expect(refresh).toHaveBeenCalled();
  });

  it("shows an error and keeps the selection when saving fails", async () => {
    updateWeekStartsOn.mockRejectedValue(new Error("boom"));
    render(<WeekStartForm initialWeekStartsOn={1} />);

    fireEvent.change(screen.getByLabelText("Перший день тижня"), {
      target: { value: "5" }
    });
    fireEvent.click(screen.getByRole("button", { name: "Зберегти" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Не вдалося зберегти налаштування. Спробуйте ще раз."
    );
    expect(screen.getByLabelText("Перший день тижня")).toHaveValue("5");
    expect(screen.getByRole("button", { name: "Зберегти" })).toBeEnabled();
  });
});
