import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { createElement } from "../apps/web/node_modules/react/index.js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ColorPalettePicker } from "../apps/web/src/components/ColorPalettePicker";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
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

  it("offers an HSV spectrum tab and applies a picked saturation/value color", async () => {
    const onChange = vi.fn();
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      callback(0);
      return 0;
    });
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
      bottom: 100,
      height: 100,
      left: 0,
      right: 100,
      top: 0,
      width: 100,
      x: 0,
      y: 0,
      toJSON: () => ({})
    });

    render(
      createElement(ColorPalettePicker, { ariaLabel: "Fill color", value: "#ff0000", onChange })
    );
    fireEvent.click(screen.getByRole("button", { name: "Fill color" }));
    const palette = screen.getByRole("dialog", { name: "Fill color palette" });
    fireEvent.click(within(palette).getByRole("tab", { name: "Spectrum" }));

    const spectrum = within(palette).getByRole("tabpanel", { name: "Spectrum" });
    expect(within(spectrum).getByRole("slider", { name: "Fill color hue" })).toBeVisible();
    const saturationValue = within(spectrum).getByRole("slider", {
      name: "Fill color saturation and brightness"
    });
    fireEvent(
      saturationValue,
      new MouseEvent("pointerdown", { bubbles: true, clientX: 50, clientY: 50 })
    );
    fireEvent(
      saturationValue,
      new MouseEvent("pointerup", { bubbles: true, clientX: 50, clientY: 50 })
    );

    await waitFor(() => expect(onChange).toHaveBeenLastCalledWith("#804040"));
  });
});
