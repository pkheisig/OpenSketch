import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { createElement } from "../apps/web/node_modules/react/index.js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ColorPalettePicker } from "../apps/web/src/components/ColorPalettePicker";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ColorPalettePicker screen picker", () => {
  it("applies the sRGB color returned by the native screen picker", async () => {
    const onChange = vi.fn();
    const open = vi.fn().mockResolvedValue({ sRGBHex: "#A1B2C3" });
    vi.stubGlobal(
      "EyeDropper",
      class {
        open = open;
      }
    );
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      callback(0);
      return 0;
    });

    render(
      createElement(ColorPalettePicker, { ariaLabel: "Fill color", value: "#ffffff", onChange })
    );
    fireEvent.click(screen.getByRole("button", { name: "Fill color" }));
    const palette = screen.getByRole("dialog", { name: "Fill color palette" });
    fireEvent.click(within(palette).getByRole("button", { name: "Pick fill color from screen" }));

    await waitFor(() => expect(onChange).toHaveBeenCalledWith("#a1b2c3"));
    expect(open).toHaveBeenCalledWith(expect.objectContaining({ signal: expect.any(AbortSignal) }));
  });

  it("explains when screen color picking is unavailable", async () => {
    render(
      createElement(ColorPalettePicker, {
        ariaLabel: "Stroke color",
        value: "#ffffff",
        onChange: vi.fn()
      })
    );
    fireEvent.click(screen.getByRole("button", { name: "Stroke color" }));
    const palette = screen.getByRole("dialog", { name: "Stroke color palette" });
    fireEvent.click(within(palette).getByRole("button", { name: "Pick stroke color from screen" }));

    expect(await screen.findByRole("status")).toHaveTextContent(
      "Screen picking is unavailable in this browser."
    );
  });
});
