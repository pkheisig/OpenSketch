import { describe, expect, it } from "vitest";
import { copySvgBlendModes, loadEditableSvg } from "../apps/web/src/editor/svg";

describe("editable SVG rendering", () => {
  it("preserves inline blend modes inherited from SVG groups", async () => {
    const parsed = await loadEditableSvg(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20">
        <rect width="20" height="20" fill="#f7cfc6"/>
        <g style="mix-blend-mode:color">
          <rect width="20" height="20" fill="#8b5f3c"/>
        </g>
      </svg>
    `);

    expect(parsed.objects[1]?.globalCompositeOperation).toBe("color");
    expect(parsed.objects[1]?.objectCaching).toBe(false);
  });

  it("preserves blend modes declared by SVG CSS classes", async () => {
    const parsed = await loadEditableSvg(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20">
        <style>.shade { mix-blend-mode: multiply; }</style>
        <rect width="20" height="20" fill="#ffffff"/>
        <g class="shade">
          <rect width="20" height="20" fill="#808080"/>
        </g>
      </svg>
    `);

    expect(parsed.objects[1]?.globalCompositeOperation).toBe("multiply");
  });

  it("migrates blend modes onto matching saved path trees", async () => {
    const source = await loadEditableSvg(`
      <svg xmlns="http://www.w3.org/2000/svg">
        <rect width="10" height="10"/>
        <rect width="10" height="10" style="mix-blend-mode:color"/>
      </svg>
    `);
    const target = await loadEditableSvg(`
      <svg xmlns="http://www.w3.org/2000/svg">
        <rect width="10" height="10"/>
        <rect width="10" height="10"/>
      </svg>
    `);

    copySvgBlendModes(
      source.objects.flatMap((object) => (object ? [object] : [])),
      target.objects.flatMap((object) => (object ? [object] : []))
    );

    expect(target.objects[1]?.globalCompositeOperation).toBe("color");
    expect(target.objects[1]?.objectCaching).toBe(false);
  });
});
