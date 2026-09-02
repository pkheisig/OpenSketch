import { describe, expect, it } from "vitest";
import {
  DEFAULT_PUBLIC_BASE,
  normalizePublicBase,
  publicAssetPattern,
  publicPath
} from "../apps/web/src/deploymentBase";

describe("deployment base", () => {
  it("keeps the GitHub Pages base as the default and normalizes path slashes", () => {
    expect(normalizePublicBase()).toBe(DEFAULT_PUBLIC_BASE);
    expect(normalizePublicBase("OpenSketch")).toBe("/OpenSketch/");
    expect(normalizePublicBase("///OpenSketch///")).toBe("/OpenSketch/");
    expect(normalizePublicBase("/")).toBe("/");
  });

  it.each([
    "",
    "https://example.test/",
    "//example.test/",
    "/OpenSketch/?x=1",
    "/OpenSketch/#app",
    "/OpenSketch\\app",
    "/Open Sketch/",
    "/OpenSketch/../",
    "/Open%2FSketch/"
  ])("rejects malformed public base %j", (value) => {
    expect(() => normalizePublicBase(value)).toThrow();
  });

  it("builds paths without introducing a second slash", () => {
    expect(publicPath("/OpenSketch/", "/index.html")).toBe("/OpenSketch/index.html");
    expect(publicPath("/", "/index.html")).toBe("/index.html");
  });

  it("matches only assets under the configured deployment base", () => {
    const pages = publicAssetPattern("/OpenSketch/", "[^/]+\\.woff2?$");
    const root = publicAssetPattern("/", "[^/]+\\.woff2?$");

    expect(pages.test("https://example.test/OpenSketch/assets/inter.woff2")).toBe(true);
    expect(pages.test("https://example.test/assets/inter.woff2")).toBe(false);
    expect(root.test("https://example.test/assets/inter.woff2")).toBe(true);
    expect(root.test("https://example.test/OpenSketch/assets/inter.woff2")).toBe(false);
    expect(root.test("https://example.test/assets/inter.woff2?version=1")).toBe(true);
  });
});
