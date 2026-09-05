import { readFile } from "node:fs/promises";
import { Group, type FabricObject } from "../apps/web/node_modules/fabric";
import { describe, expect, it } from "vitest";
import { sanitizeImportedSvg } from "../apps/web/src/assets/browserSanitizer";
import {
  copySvgBlendModes,
  loadEditableSvg,
  normalizeSvgForFabric
} from "../apps/web/src/editor/svg";

describe("editable SVG rendering", () => {
  const leaves = (objects: Array<FabricObject | null>): FabricObject[] =>
    objects.flatMap((object) =>
      !object ? [] : object instanceof Group ? leaves(object.getObjects()) : [object]
    );

  it("preserves inline blend modes inherited from SVG groups", async () => {
    const parsed = await loadEditableSvg(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20">
        <rect width="20" height="20" fill="#f7cfc6"/>
        <g style="mix-blend-mode:color">
          <rect width="20" height="20" fill="#8b5f3c"/>
        </g>
      </svg>
    `);

    expect(leaves(parsed.objects)[1]?.globalCompositeOperation).toBe("color");
    expect(leaves(parsed.objects)[1]?.objectCaching).toBe(false);
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

    expect(leaves(parsed.objects)[1]?.globalCompositeOperation).toBe("multiply");
  });

  it("applies a namespaced compound selector during editable SVG loading", async () => {
    const source = sanitizeImportedSvg(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20">
        <style>.parent #shape { fill: #123456; }</style>
        <g class="parent"><rect id="shape" width="10" height="10"/></g>
      </svg>`,
      "render"
    );

    const parsed = await loadEditableSvg(source);

    expect(leaves(parsed.objects)[0]?.fill).toBe("#123456");
  });

  it("keeps Gaussian-blur glow filters on editable Fabric objects", async () => {
    const parsed = await loadEditableSvg(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20">
        <defs>
          <filter id="glow">
            <feGaussianBlur stdDeviation="2"/>
          </filter>
        </defs>
        <circle cx="10" cy="10" r="6" fill="#00d400" filter="url(#glow)"/>
      </svg>
    `);

    expect(leaves(parsed.objects)[0]?.shadow).toMatchObject({
      blur: 4,
      color: "#00d400",
      offsetX: 0,
      offsetY: 0
    });
  });

  it("restores the glow layers in the bundled fluorescent bead asset", async () => {
    const source = await readFile(
      "apps/web/public/assets/bioicons/bioicons-fluoresent-bead-blue-26c811ca.svg",
      "utf8"
    );
    const parsed = await loadEditableSvg(source);
    const glowObjects = leaves(parsed.objects).filter((object) => object.shadow);

    expect(glowObjects).toHaveLength(2);
    expect(
      glowObjects.map((object) => ({
        blur: object.shadow?.blur,
        color: object.shadow?.color
      }))
    ).toEqual(
      expect.arrayContaining([
        { blur: 4.52, color: "rgba(88,102,226,1)" },
        { blur: 4.52, color: "rgba(204,207,247,1)" }
      ])
    );
  });

  it("preserves every source SVG group as a nested editable hierarchy", async () => {
    const parsed = await loadEditableSvg(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 60">
        <rect width="80" height="60" fill="#fff"/>
        <g id="cell">
          <g id="membrane">
            <circle cx="30" cy="30" r="20" fill="#9ad"/>
            <circle cx="30" cy="30" r="16" fill="#cef"/>
          </g>
          <g id="nucleus">
            <circle cx="30" cy="30" r="8" fill="#638"/>
          </g>
        </g>
      </svg>
    `);

    expect(parsed.objects).toHaveLength(2);
    const cell = parsed.objects[1];
    expect(cell).toBeInstanceOf(Group);
    const cellParts = (cell as Group).getObjects();
    expect(cellParts).toHaveLength(2);
    expect(cellParts.every((part) => part instanceof Group)).toBe(true);
    expect((cellParts[0] as Group).getObjects()).toHaveLength(2);
    expect((cellParts[1] as Group).getObjects()).toHaveLength(1);
    expect(leaves(parsed.objects)).toHaveLength(4);
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

  it("flattens nested clip-path references that Fabric cannot resolve", async () => {
    const source = `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20">
        <defs>
          <clipPath id="outer"><rect width="20" height="20"/></clipPath>
          <clipPath id="inner">
            <circle cx="10" cy="10" r="8" style="fill:#fff;clip-path:url(#outer)"/>
          </clipPath>
        </defs>
        <rect width="20" height="20" clip-path="url(#inner)"/>
      </svg>
    `;

    const compatible = normalizeSvgForFabric(source);
    expect(compatible).toContain('clip-path="url(#inner)"');
    expect(compatible).not.toContain("clip-path:url(#outer)");
    await expect(loadEditableSvg(source)).resolves.toMatchObject({
      objects: expect.arrayContaining([expect.anything()])
    });
  });
});
