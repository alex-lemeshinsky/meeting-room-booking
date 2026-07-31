import { describe, expect, it } from "vitest";
import { containTabFocus, lockDocumentScroll } from "./overlay";

describe("overlay behavior", () => {
  it("locks document scrolling and restores the previous inline value", () => {
    document.body.style.overflow = "clip";

    const unlock = lockDocumentScroll(document);

    expect(document.body.style.overflow).toBe("hidden");
    unlock();
    expect(document.body.style.overflow).toBe("clip");
    document.body.style.overflow = "";
  });

  it("wraps forward focus from the last enabled control", () => {
    const overlay = document.createElement("section");
    const first = document.createElement("button");
    const disabled = document.createElement("button");
    const last = document.createElement("button");
    disabled.disabled = true;
    overlay.append(first, disabled, last);
    document.body.append(overlay);
    last.focus();
    let prevented = false;

    containTabFocus({
      currentTarget: overlay,
      key: "Tab",
      preventDefault() {
        prevented = true;
      },
      shiftKey: false
    });

    expect(prevented).toBe(true);
    expect(document.activeElement).toBe(first);
    overlay.remove();
  });

  it("recovers focus when it starts outside the overlay", () => {
    const overlay = document.createElement("section");
    const first = document.createElement("button");
    const last = document.createElement("button");
    const outside = document.createElement("button");
    overlay.append(first, last);
    document.body.append(overlay, outside);
    outside.focus();

    containTabFocus({
      currentTarget: overlay,
      key: "Tab",
      preventDefault() {},
      shiftKey: true
    });

    expect(document.activeElement).toBe(last);
    overlay.remove();
    outside.remove();
  });
});
