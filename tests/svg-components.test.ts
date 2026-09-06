import { describe, expect, it } from "vitest";
import { Group, Rect } from "../apps/web/node_modules/fabric";
import { hasSvgComponents, proposeSvgComponents } from "../apps/web/src/editor/svgComponents";
import { loadEditableSvg } from "../apps/web/src/editor/svg";

describe("broad SVG components", () => {
  it("attaches small details to a large containing region", () => {
    const body = new Rect({ width: 100, height: 100 });
    const region = new Rect({ left: 30, top: 30, width: 35, height: 35 });
    const detail = new Rect({ left: 40, top: 40, width: 2, height: 2 });
    expect(proposeSvgComponents([body, region, detail])).toEqual([[body], [region, detail]]);
  });
  it("leaves a field of tiny fragments whole", () => {
    const objects = Array.from(
      { length: 100 },
      (_, i) =>
        new Rect({
          left: (i % 10) * 10,
          top: Math.floor(i / 10) * 10,
          width: 1,
          height: 1
        })
    );
    expect(proposeSvgComponents(objects)).toBeNull();
  });
  it("requires two to eight explicit boundaries, independent of user names", () => {
    const parts = Array.from({ length: 2 }, () => new Group([new Rect({ width: 10, height: 10 })]));
    parts.forEach((part, i) => {
      part.svgComponent = `part-${i}`;
      part.name = "Renamed";
    });
    expect(hasSvgComponents(new Group(parts))).toBe(true);
    expect(hasSvgComponents(new Group([new Rect()]))).toBe(false);
  });
  it("retains authored boundaries while keeping deeper SVG groups inside them", async () => {
    const parsed =
      await loadEditableSvg(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
      <g data-component="Body"><rect width="100" height="100"/></g>
      <g data-component="Nucleus"><g><circle cx="50" cy="50" r="20"/><circle cx="50" cy="50" r="2"/></g></g>
    </svg>`);
    const group = new Group(
      parsed.objects.filter((part): part is NonNullable<typeof part> => Boolean(part))
    );
    expect(hasSvgComponents(group)).toBe(true);
    expect(group.getObjects()[1].svgComponent).toBe("Nucleus");
  });
});
