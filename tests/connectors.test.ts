import { describe, expect, it } from "vitest";
import { routeOrthogonal } from "../apps/web/src/editor/connectors";

describe("orthogonal connector routing", () => {
  it("keeps a direct route compact when the path is clear", () => {
    expect(routeOrthogonal({ x: 0, y: 40 }, { x: 300, y: 40 }, "right", "left", [])).toEqual([
      { x: 0, y: 40 },
      { x: 300, y: 40 }
    ]);
  });

  it("routes around expanded intervening object bounds", () => {
    const obstacle = { left: 120, top: 0, width: 60, height: 80 };
    const route = routeOrthogonal({ x: 0, y: 40 }, { x: 300, y: 40 }, "right", "left", [obstacle]);

    expect(route.length).toBeGreaterThanOrEqual(4);
    expect(route.some((point) => point.y <= -18 || point.y >= 98)).toBe(true);
    for (let index = 1; index < route.length; index += 1) {
      const from = route[index - 1];
      const to = route[index];
      expect(from.x === to.x || from.y === to.y).toBe(true);
      if (from.y === to.y && from.y > -18 && from.y < 98) {
        expect(Math.max(from.x, to.x) <= 102 || Math.min(from.x, to.x) >= 198).toBe(true);
      }
    }
  });

  it("honors the exit direction of attached edge anchors", () => {
    const route = routeOrthogonal({ x: 80, y: 100 }, { x: 260, y: 300 }, "top", "right", [
      { left: 120, top: 100, width: 90, height: 130 }
    ]);

    expect(route[1].x).toBe(80);
    expect(route[1].y).toBeLessThan(100);
    expect(route.at(-2)?.x).toBeGreaterThan(260);
    expect(route.at(-2)?.y).toBe(300);
  });

  it("stays interactive in a dense one-hundred-object scene", () => {
    const obstacles = Array.from({ length: 100 }, (_, index) => ({
      left: 90 + (index % 10) * 105,
      top: -45 + Math.floor(index / 10) * 95,
      width: 58,
      height: 58
    }));
    const started = performance.now();
    const route = routeOrthogonal({ x: 0, y: 0 }, { x: 1200, y: 0 }, "right", "left", obstacles);

    expect(performance.now() - started).toBeLessThan(1000);
    expect(route.length).toBeGreaterThanOrEqual(4);
    route.slice(1).forEach((point, index) => {
      const previous = route[index];
      expect(point.x === previous.x || point.y === previous.y).toBe(true);
    });
  });
});
