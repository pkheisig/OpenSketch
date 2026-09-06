/* global URL, process, location, performance, fetch */
// Run against the feature branch's Vite server. Prints eligibility; changes no assets.
// OPENSKETCH_AUDIT_URL=http://127.0.0.1:5198/OpenSketch/ node <this-file>
import { readFile } from "node:fs/promises";
import { chromium } from "playwright";

const manifest = JSON.parse(
  await readFile(
    new URL("../../../apps/web/src/generated/opensketch-generated-manifest.json", import.meta.url),
    "utf8"
  )
);
const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  await page.goto(process.env.OPENSKETCH_AUDIT_URL ?? "http://127.0.0.1:5198/OpenSketch/");
  const assets = await page.evaluate(async (families) => {
    const base = new URL(".", location.href).pathname;
    const { loadEditableSvg } = await import(`${base}src/editor/svg.ts`);
    const { prepareSvgComponents, hasSvgComponents } = await import(
      `${base}src/editor/svgComponents.ts`
    );
    const fabricUrl = performance
      .getEntriesByType("resource")
      .map((r) => r.name)
      .find((url) => /\/fabric\.js\?/.test(url));
    if (!fabricUrl) throw new Error("Run against the Vite development server.");
    const { Group, util } = await import(fabricUrl);
    const rows = [];
    for (const family of families) {
      const response = await fetch(`${base}${family.variants[0].assetPath}`);
      if (!response.ok) throw new Error(`Could not load ${family.title}`);
      const source = await response.text();
      const parsed = await loadEditableSvg(source);
      const object = util.groupSVGElements(parsed.objects.filter(Boolean), parsed.options);
      const group = object instanceof Group ? object : new Group([object]);
      const prepared = await prepareSvgComponents(group);
      rows.push({
        title: family.title,
        parts: hasSvgComponents(prepared) ? prepared.getObjects().length : 0,
        paths: source.match(/<path/g)?.length ?? 0
      });
    }
    return rows;
  }, manifest.families);
  process.stdout.write(
    JSON.stringify(
      { accepted: assets.filter((asset) => asset.parts > 0).length, assets },
      null,
      2
    ) + "\n"
  );
} finally {
  await browser.close();
}
