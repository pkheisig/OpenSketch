import { describe, expect, it } from "vitest";
import {
  DEFAULT_CANVAS,
  migrateProject,
  migrateProjectForLoad,
  PORTABLE_PROJECT_LIMITS
} from "../packages/editor-core/src";

describe("project migrations", () => {
  const bytesDataUrl = (mimeType: string, bytes: number[]): string =>
    `data:${mimeType};base64,${btoa(String.fromCharCode(...bytes))}`;

  const pngHeaderDataUrl = (width: number, height: number, marker?: number): string => {
    const bytes = new Uint8Array([
      137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 0, 0, 0, 0, 0
    ]);
    const payload = marker === undefined ? bytes : new Uint8Array([...bytes, marker]);
    const view = new DataView(payload.buffer);
    view.setUint32(16, width);
    view.setUint32(20, height);
    return `data:image/png;base64,${btoa(String.fromCharCode(...payload))}`;
  };

  const jpegHeaderDataUrl = (width: number, height: number): string =>
    bytesDataUrl("image/jpeg", [
      0xff,
      0xd8,
      0xff,
      0xc0,
      0x00,
      0x11,
      0x08,
      (height >> 8) & 0xff,
      height & 0xff,
      (width >> 8) & 0xff,
      width & 0xff,
      0x03,
      0x01,
      0x11,
      0x00,
      0x02,
      0x11,
      0x00,
      0x03,
      0x11,
      0x00
    ]);

  const progressiveJpegHeaderDataUrl = (width: number, height: number): string => {
    const jpeg = new Uint8Array([
      0xff,
      0xd8,
      0xff,
      0xc0,
      0x00,
      0x11,
      0x08,
      (height >> 8) & 0xff,
      height & 0xff,
      (width >> 8) & 0xff,
      width & 0xff,
      0x03,
      0x01,
      0x11,
      0x00,
      0x02,
      0x11,
      0x00,
      0x03,
      0x11,
      0x00
    ]);
    const appSegmentLength = 65_535;
    const appSegmentCount = 17;
    const bytes = new Uint8Array(2 + appSegmentCount * (appSegmentLength + 2) + jpeg.length - 2);
    bytes.set(jpeg.subarray(0, 2));
    let offset = 2;
    for (let segment = 0; segment < appSegmentCount; segment += 1) {
      bytes.set([0xff, 0xe1, appSegmentLength >> 8, appSegmentLength & 0xff], offset);
      offset += 2 + appSegmentLength;
    }
    bytes.set(jpeg.subarray(2), offset);
    let binary = "";
    for (let index = 0; index < bytes.length; index += 32_768) {
      binary += String.fromCharCode(...bytes.subarray(index, index + 32_768));
    }
    return `data:image/jpeg;base64,${btoa(binary)}`;
  };

  const webpVp8xHeaderDataUrl = (width: number, height: number): string =>
    bytesDataUrl("image/webp", [
      0x52,
      0x49,
      0x46,
      0x46,
      0x00,
      0x00,
      0x00,
      0x00,
      0x57,
      0x45,
      0x42,
      0x50,
      0x56,
      0x50,
      0x38,
      0x58,
      0x0a,
      0x00,
      0x00,
      0x00,
      0x00,
      0x00,
      0x00,
      0x00,
      (width - 1) & 0xff,
      ((width - 1) >> 8) & 0xff,
      ((width - 1) >> 16) & 0xff,
      (height - 1) & 0xff,
      ((height - 1) >> 8) & 0xff,
      ((height - 1) >> 16) & 0xff
    ]);

  const webpVp8HeaderDataUrl = (width: number, height: number): string =>
    bytesDataUrl("image/webp", [
      0x52,
      0x49,
      0x46,
      0x46,
      0x00,
      0x00,
      0x00,
      0x00,
      0x57,
      0x45,
      0x42,
      0x50,
      0x56,
      0x50,
      0x38,
      0x20,
      0x0a,
      0x00,
      0x00,
      0x00,
      0x00,
      0x00,
      0x00,
      0x9d,
      0x01,
      0x2a,
      width & 0xff,
      (width >> 8) & 0xff,
      height & 0xff,
      (height >> 8) & 0xff
    ]);

  const project = {
    format: "OpenSketch",
    formatVersion: 1,
    version: 1,
    id: "project-1",
    name: "Figure",
    createdAt: "2026-07-26T00:00:00Z",
    updatedAt: "2026-07-26T00:00:00Z",
    canvas: DEFAULT_CANVAS,
    objects: { objects: [] },
    uploads: [],
    usedAssetIds: []
  } as const;

  it("accepts the current format", () => {
    const migrated = migrateProject(project);
    expect(migrated.name).toBe("Figure");
    expect(migrated.formatVersion).toBe(3);
    expect(migrated.kind).toBe("diagram");
    expect(migrated.layout).toBeUndefined();
  });

  it("persists validated layout frames and rejects ambiguous nested ownership", () => {
    const migrated = migrateProject({
      ...project,
      formatVersion: 2,
      kind: "figure",
      objects: { objects: [{ type: "Rect", objectId: "rect" }] },
      layout: {
        version: 1,
        frames: [
          {
            id: "frame",
            bounds: { left: 0, top: 0, width: 100, height: 100 },
            flow: "free",
            children: [{ objectId: "rect", sizing: "content-sized" }]
          }
        ]
      }
    });
    expect(migrated.layout).toMatchObject({
      version: 1,
      frames: [
        {
          id: "frame",
          padding: { top: 0, right: 0, bottom: 0, left: 0 },
          gap: { horizontal: 0, vertical: 0 }
        }
      ]
    });

    expect(() =>
      migrateProject({
        ...project,
        formatVersion: 2,
        kind: "figure",
        objects: {
          objects: [
            {
              type: "Group",
              objectId: "group",
              objects: [{ type: "Rect", objectId: "rect" }]
            }
          ]
        },
        layout: {
          version: 1,
          frames: [
            {
              id: "frame",
              containerObjectId: "group",
              bounds: { left: 0, top: 0, width: 100, height: 100 },
              flow: "free",
              children: [{ objectId: "rect", sizing: "content-sized" }]
            }
          ]
        }
      })
    ).toThrow(/ancestor|descendant|container/i);
  });

  it("does not treat clip-path objects as layout-scene identities", () => {
    expect(() =>
      migrateProject({
        ...project,
        formatVersion: 2,
        kind: "figure",
        objects: {
          objects: [
            {
              type: "Rect",
              objectId: "rect",
              width: 40,
              height: 40,
              clipPath: { type: "Rect", objectId: "clip", width: 20, height: 20 }
            }
          ]
        },
        layout: {
          version: 1,
          frames: [
            {
              id: "frame",
              bounds: { left: 0, top: 0, width: 100, height: 100 },
              flow: "free",
              children: [{ objectId: "clip", sizing: "content-sized" }]
            }
          ]
        }
      })
    ).toThrow(/unknown object|layout frame/i);
  });

  it("does not treat scene-root decoration objects as layout-scene identities", () => {
    for (const key of ["backgroundImage", "overlayImage", "clipPath"] as const) {
      expect(() =>
        migrateProject({
          ...project,
          formatVersion: 2,
          kind: "figure",
          objects: {
            objects: [{ type: "Rect", objectId: "rect", width: 40, height: 40 }],
            [key]: { type: "Rect", objectId: "decoration", width: 20, height: 20 }
          },
          layout: {
            version: 1,
            frames: [
              {
                id: "frame",
                bounds: { left: 0, top: 0, width: 100, height: 100 },
                flow: "free",
                children: [{ objectId: "decoration", sizing: "content-sized" }]
              }
            ]
          }
        })
      ).toThrow(/unknown object|layout frame/i);
    }
  });

  it("preserves an explicit project kind", () => {
    expect(migrateProject({ ...project, formatVersion: 2, kind: "poster" }).kind).toBe("poster");
  });

  it("fails closed for an unknown project kind", () => {
    expect(() => migrateProject({ ...project, formatVersion: 2, kind: "comic" })).toThrow(
      /project kind/i
    );
  });

  it("repairs duplicate descendant IDs and keeps each subtree connector local", () => {
    const connector = {
      type: "Group",
      OpenSketchType: "connector",
      objects: [],
      connector: {
        fromObjectId: "endpoint",
        fromAnchor: "center",
        toObjectId: "target",
        toAnchor: "center",
        startArrowhead: "none",
        endArrowhead: "triangle",
        lineStyle: "solid",
        curvature: 0
      }
    };
    const duplicateProject = {
      ...project,
      objects: {
        objects: [
          {
            type: "Group",
            OpenSketchType: "group",
            objectId: "group-one",
            objects: [
              { type: "Rect", objectId: "endpoint" },
              { type: "Rect", objectId: "target" },
              { ...connector, objectId: "connector-one" }
            ]
          },
          {
            type: "Group",
            OpenSketchType: "group",
            objectId: "group-two",
            objects: [
              { type: "Rect", objectId: "endpoint" },
              { type: "Rect", objectId: "target" },
              { ...structuredClone(connector), objectId: "connector-two" }
            ]
          }
        ]
      }
    };

    expect(() => migrateProject(duplicateProject)).toThrow("duplicated");
    const first = migrateProjectForLoad(duplicateProject);
    const second = migrateProjectForLoad(duplicateProject);
    const objects = first.project.objects.objects as Array<Record<string, unknown>>;
    const firstGroup = objects[0].objects as Array<Record<string, unknown>>;
    const secondGroup = objects[1].objects as Array<Record<string, unknown>>;
    const secondEndpointId = secondGroup[0].objectId;
    const secondTargetId = secondGroup[1].objectId;
    const secondBinding = secondGroup[2].connector as Record<string, unknown>;

    expect(first.identityRepaired).toBe(true);
    expect(first.identityWarnings.some((warning) => warning.includes('"endpoint"'))).toBe(true);
    expect(
      new Set(
        objects.flatMap((group) => [
          group.objectId,
          ...(group.objects as Array<Record<string, unknown>>).map((item) => item.objectId)
        ])
      ).size
    ).toBe(8);
    expect(secondEndpointId).not.toBe("endpoint");
    expect(secondTargetId).not.toBe("target");
    expect(secondBinding.fromObjectId).toBe(secondEndpointId);
    expect(secondBinding.toObjectId).toBe(secondTargetId);
    expect(JSON.stringify(second.project)).toBe(JSON.stringify(first.project));
    expect((firstGroup[2].connector as Record<string, unknown>).fromObjectId).toBe("endpoint");
    const reloaded = migrateProjectForLoad(first.project);
    expect(reloaded.identityRepaired).toBe(false);
    expect(reloaded.project).toEqual(first.project);
  });

  it("rejects oversized or deeply nested scenes before identity repair", () => {
    const tooMany = {
      ...project,
      objects: {
        objects: Array.from(
          { length: PORTABLE_PROJECT_LIMITS.maxSceneObjects + 1 },
          (_, index) => ({
            type: "Rect",
            objectId: `rect-${index}`
          })
        )
      }
    };
    expect(() => migrateProjectForLoad(tooMany)).toThrow("scene contains too many objects");

    let tooDeep: Record<string, unknown> = { type: "Rect" };
    for (let index = 0; index < PORTABLE_PROJECT_LIMITS.maxSceneDepth; index += 1) {
      tooDeep = { type: "Group", objects: [tooDeep] };
    }
    expect(() =>
      migrateProjectForLoad({
        ...project,
        objects: { objects: [tooDeep] }
      })
    ).toThrow("scene nesting limit");
  });

  it("adds the enabled double-click text preference to older projects", () => {
    const legacyCanvas = { ...project.canvas } as Partial<typeof project.canvas>;
    delete legacyCanvas.doubleClickCreatesText;
    expect(
      migrateProject({
        ...project,
        canvas: legacyCanvas
      }).canvas.doubleClickCreatesText
    ).toBe(true);
  });

  it("preserves an explicitly disabled double-click text preference", () => {
    expect(
      migrateProject({
        ...project,
        canvas: { ...project.canvas, doubleClickCreatesText: false }
      }).canvas.doubleClickCreatesText
    ).toBe(false);
  });

  it("rejects unknown future formats", () => {
    expect(() => migrateProject({ format: "OpenSketch", formatVersion: 99 })).toThrow(
      "not supported"
    );
  });

  it("rejects external scene sources in portable projects", () => {
    expect(() =>
      migrateProject({
        ...project,
        objects: {
          objects: [{ type: "Image", src: "https://example.org/tracker.png" }]
        }
      })
    ).toThrow("external or executable");
  });

  it("accepts Fabric gradients, default scale styles, and rejects hidden filter sources", () => {
    expect(() =>
      migrateProject({
        ...project,
        objects: {
          objects: [
            {
              type: "Rect",
              fill: {
                type: "linear",
                id: 0,
                coords: { x1: 0, y1: 0, x2: 10, y2: 0 },
                colorStops: [
                  { offset: 0, color: "#000000" },
                  { offset: 1, color: "#ffffff" }
                ]
              },
              originalGradientFill: {
                type: "linear",
                id: "nih-antibody-gradient",
                coords: { x1: 0, y1: 0, x2: 10, y2: 0 },
                colorStops: [
                  { offset: 0, color: "#000000" },
                  { offset: 1, color: "#ffffff" }
                ]
              },
              defaultElementStyle: {
                properties: { scaleX: 2, scaleY: 0.5 }
              }
            }
          ]
        }
      })
    ).not.toThrow();

    expect(() =>
      migrateProject({
        ...project,
        objects: {
          objects: [
            {
              type: "Rect",
              filters: [
                {
                  type: "BlendImage",
                  image: { type: "Image", src: "https://example.org/filter.png" }
                }
              ]
            }
          ]
        }
      })
    ).toThrow("external or executable");
  });

  it("accepts sanitized SVG anchors with internal targets", () => {
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><a href="#shape"><rect id="shape" width="10" height="10"/></a></svg>';
    expect(() =>
      migrateProject({
        ...project,
        objects: {
          objects: [{ type: "Image", src: `data:image/svg+xml,${encodeURIComponent(svg)}` }]
        }
      })
    ).not.toThrow();
  });

  it("rejects malformed canvas and imported-media records", () => {
    expect(() =>
      migrateProject({
        ...project,
        canvas: { ...project.canvas, width: -1 }
      })
    ).toThrow("canvas width");
    expect(() =>
      migrateProject({
        ...project,
        uploads: [{ id: "x", name: "x", mimeType: "text/html", dataUrl: "javascript:evil()" }]
      })
    ).toThrow("imported media");
  });

  it("rejects non-finite and impractical canvas dimensions", () => {
    expect(() =>
      migrateProject({
        ...project,
        canvas: { ...project.canvas, width: Number.NaN }
      })
    ).toThrow("canvas width");
    expect(() =>
      migrateProject({
        ...project,
        canvas: { ...project.canvas, height: Number.POSITIVE_INFINITY }
      })
    ).toThrow("canvas height");
    expect(() =>
      migrateProject({
        ...project,
        canvas: {
          ...project.canvas,
          width: PORTABLE_PROJECT_LIMITS.maxCanvasDimension + 1
        }
      })
    ).toThrow("canvas width");
  });

  it("rejects weak or oversized scene structures before Fabric sees them", () => {
    expect(() => migrateProject({ ...project, objects: { objects: [null] } })).toThrow(
      "scene.objects[0]"
    );
    expect(() =>
      migrateProject({
        ...project,
        objects: { objects: [{ type: "UnknownFabricType" }] }
      })
    ).toThrow("unsupported");
    expect(() =>
      migrateProject({
        ...project,
        objects: { objects: [{ type: "Rect", executable: "payload" }] }
      })
    ).toThrow("unsupported property");
    expect(() =>
      migrateProject({
        ...project,
        objects: { objects: [{ type: "Rect", assetStyle: "realistic" }] }
      })
    ).toThrow("assetStyle");
    expect(
      migrateProject({
        ...project,
        objects: { objects: [{ type: "Rect", assetStyle: "simplified" }] }
      }).objects.objects[0]
    ).toMatchObject({ assetStyle: "simplified" });

    const nestedLeaf: Record<string, unknown> = { type: "Rect" };
    let nested: Record<string, unknown> = nestedLeaf;
    for (let index = 0; index <= PORTABLE_PROJECT_LIMITS.maxSceneDepth; index += 1) {
      nested = { type: "Group", objects: [nested] };
    }
    expect(() => migrateProject({ ...project, objects: { objects: [nested] } })).toThrow(
      "nesting limit"
    );

    const tooManyObjects = Array.from(
      { length: PORTABLE_PROJECT_LIMITS.maxSceneObjects + 1 },
      () => ({ type: "Rect" })
    );
    expect(() => migrateProject({ ...project, objects: { objects: tooManyObjects } })).toThrow(
      "too many objects"
    );
  });

  it("validates paths, connector metadata, and embedded resource bounds", () => {
    expect(() =>
      migrateProject({
        ...project,
        objects: { objects: [{ type: "Path", path: [["M", 0]] }] }
      })
    ).toThrow("wrong number of coordinates");
    expect(() =>
      migrateProject({
        ...project,
        objects: { objects: [{ type: "Path", path: [["M", Number.NaN, 0]] }] }
      })
    ).toThrow("is invalid");

    const connector = {
      type: "Group",
      OpenSketchType: "connector",
      objects: [],
      connector: {
        fromObjectId: "from",
        fromAnchor: "center",
        toObjectId: "to",
        toAnchor: "center",
        startArrowhead: "none",
        endArrowhead: "triangle",
        lineStyle: "solid",
        curvature: 0
      }
    };
    expect(() =>
      migrateProject({
        ...project,
        objects: {
          objects: [
            { type: "Rect", objectId: "from" },
            { type: "Rect", objectId: "to" },
            { ...connector, connector: { ...connector.connector, curvature: Number.NaN } }
          ]
        }
      })
    ).toThrow("curvature");
    expect(() =>
      migrateProject({
        ...project,
        objects: {
          objects: [
            { type: "Rect", objectId: "from" },
            { type: "Rect", objectId: "to" },
            { ...connector, connector: { ...connector.connector, toObjectId: "missing" } }
          ]
        }
      })
    ).toThrow("unknown object ID");
    expect(() =>
      migrateProject({
        ...project,
        objects: {
          objects: [
            {
              type: "Rect",
              objectId: "member",
              recognizedGroups: [
                {
                  objectId: "historical-group",
                  memberObjectIds: ["missing"],
                  properties: {}
                }
              ]
            }
          ]
        }
      })
    ).not.toThrow();

    expect(() =>
      migrateProject({
        ...project,
        objects: {
          objects: [
            {
              type: "Rect",
              objectId: "member",
              recognizedGroups: [
                {
                  objectId: "historical-group",
                  memberObjectIds: ["member"],
                  properties: { assetStyle: "simplified" }
                }
              ]
            }
          ]
        }
      })
    ).not.toThrow();

    const historicalBinding = {
      fromObjectId: "removed-from",
      fromAnchor: "center",
      toObjectId: "removed-to",
      toAnchor: "center",
      startArrowhead: "none",
      endArrowhead: "triangle",
      lineStyle: "solid",
      curvature: 0
    };
    expect(() =>
      migrateProject({
        ...project,
        objects: {
          objects: [
            {
              type: "Rect",
              recognizedGroups: [
                {
                  objectId: "historical-group",
                  memberObjectIds: ["removed-member"],
                  properties: { connector: historicalBinding }
                }
              ],
              defaultElementStyle: {
                properties: {},
                connector: historicalBinding
              }
            }
          ]
        }
      })
    ).not.toThrow();

    const oversizedSvg = `data:image/svg+xml,${"a".repeat(
      PORTABLE_PROJECT_LIMITS.maxDataUrlBytes + 1
    )}`;
    expect(() =>
      migrateProject({
        ...project,
        uploads: [
          { id: "large", name: "large.svg", mimeType: "image/svg+xml", dataUrl: oversizedSvg }
        ]
      })
    ).toThrow("data URL size limit");

    expect(() =>
      migrateProject({
        ...project,
        uploads: [
          {
            id: "huge-png",
            name: "huge.png",
            mimeType: "image/png",
            dataUrl: pngHeaderDataUrl(PORTABLE_PROJECT_LIMITS.maxRasterDimension + 1, 1)
          }
        ]
      })
    ).toThrow("decoded raster dimension");

    expect(() =>
      migrateProject({
        ...project,
        uploads: [
          {
            id: "wide-png",
            name: "wide.png",
            mimeType: "image/png",
            dataUrl: pngHeaderDataUrl(10_000, 10_001)
          }
        ]
      })
    ).toThrow("decoded raster dimension");

    for (const [name, mimeType, dataUrl] of [
      ["jpeg", "image/jpeg", jpegHeaderDataUrl(10_000, 10_001)],
      ["webp-vp8x", "image/webp", webpVp8xHeaderDataUrl(10_000, 10_001)],
      ["webp-vp8", "image/webp", webpVp8HeaderDataUrl(10_000, 10_001)]
    ] as const) {
      expect(() =>
        migrateProject({
          ...project,
          uploads: [{ id: name, name: `${name}.image`, mimeType, dataUrl }]
        })
      ).toThrow("decoded raster dimension");
    }
  });

  it("validates Fabric scalar fields and required connector enums", () => {
    expect(() =>
      migrateProject({
        ...project,
        objects: {
          objects: [
            {
              type: "Path",
              OpenSketchType: "connector",
              path: [
                ["M", 0, 40],
                ["L", 180, 40]
              ]
            }
          ]
        }
      })
    ).not.toThrow();

    expect(() =>
      migrateProject({
        ...project,
        objects: { objects: [{ type: "Rect", opacity: Number.NaN }] }
      })
    ).toThrow("opacity");
    expect(() =>
      migrateProject({
        ...project,
        objects: { objects: [{ type: "Rect", opacity: 2 }] }
      })
    ).toThrow("opacity");
    expect(() =>
      migrateProject({
        ...project,
        objects: { objects: [{ type: "Rect", exactBoundingBox: "yes" }] }
      })
    ).toThrow("exactBoundingBox");

    expect(() =>
      migrateProject({
        ...project,
        objects: {
          objects: [
            {
              type: "Group",
              objects: [],
              connector: {
                fromObjectId: "from",
                toObjectId: "to",
                toAnchor: "center",
                startArrowhead: "none",
                endArrowhead: "triangle",
                lineStyle: "solid",
                curvature: 0
              }
            }
          ]
        }
      })
    ).toThrow("fromAnchor");
  });

  it("bounds aggregate decoded raster area across unique resources", () => {
    const upload = (index: number) => ({
      id: `raster-${index}`,
      name: `raster-${index}.png`,
      mimeType: "image/png",
      dataUrl: pngHeaderDataUrl(10_000, 10_000, index)
    });

    expect(() =>
      migrateProject({
        ...project,
        uploads: [upload(1), upload(2)]
      })
    ).not.toThrow();
    expect(() =>
      migrateProject({
        ...project,
        uploads: [upload(1), upload(2), upload(3)]
      })
    ).toThrow("total decoded raster area");
  });

  it("bounds aggregate decoded raster area across scene-only image sources", () => {
    const sceneRaster = (index: number) => ({
      type: "Image",
      OpenSketchType: "import",
      src: pngHeaderDataUrl(10_000, 10_000, index),
      crossOrigin: null
    });

    expect(() =>
      migrateProject({
        ...project,
        objects: { objects: [sceneRaster(1), sceneRaster(2), sceneRaster(3)] }
      })
    ).toThrow("total decoded raster area");
  });

  it("keeps portable validation aligned with progressive JPEG inspection", () => {
    expect(() =>
      migrateProject({
        ...project,
        objects: {
          objects: [
            {
              type: "Image",
              OpenSketchType: "import",
              src: progressiveJpegHeaderDataUrl(24, 12),
              crossOrigin: null
            }
          ]
        }
      })
    ).not.toThrow();
  });

  it("keeps supported raster images and free connectors compatible", () => {
    const migrated = migrateProject({
      ...project,
      objects: {
        version: "7.4.0",
        objects: [
          {
            type: "Image",
            OpenSketchType: "import",
            src: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB",
            crossOrigin: null
          },
          {
            type: "Group",
            OpenSketchType: "arrow",
            objects: [
              {
                type: "Path",
                path: [
                  ["M", 0, 0],
                  ["L", 10, 0]
                ]
              },
              { type: "Triangle" }
            ],
            freeConnectorBinding: {
              fromObjectId: "",
              fromAnchor: "center",
              toObjectId: "",
              toAnchor: "center",
              startArrowhead: "none",
              endArrowhead: "triangle",
              lineStyle: "solid",
              routing: "direct",
              pathShape: "straight",
              curvature: 0
            },
            freeConnectorGeometry: {
              from: { x: 0, y: 0 },
              to: { x: 10, y: 0 }
            }
          }
        ]
      }
    });

    expect(migrated.objects).toEqual(expect.objectContaining({ version: "7.4.0" }));
  });

  it("repairs circular arcs saved before free-connector metadata was added", () => {
    const migrated = migrateProjectForLoad({
      ...project,
      objects: {
        version: "7.4.0",
        objects: [
          {
            type: "Group",
            name: "Circular arc",
            OpenSketchType: "curved-arrow",
            objects: [
              {
                type: "Path",
                path: [
                  ["M", 0, 0],
                  ["A", 100, 100, 0, 0, 1, 100, 100]
                ]
              },
              { type: "Triangle" }
            ]
          }
        ]
      }
    });

    expect(migrated.identityRepaired).toBe(true);
    expect(migrated.identityWarnings).toContain(
      "Repaired missing free-connector metadata for circular arc at scene.objects[0]."
    );
    expect(
      (migrated.project.objects as { objects: Array<{ freeConnectorBinding?: unknown }> })
        .objects[0].freeConnectorBinding
    ).toEqual(expect.objectContaining({ pathShape: "circular", endArrowhead: "triangle" }));
  });

  it("returns an isolated candidate and drops non-portable top-level fields", () => {
    const raw = structuredClone(project) as {
      canvas: { width: number };
      extraLocalField?: string;
    };
    raw.extraLocalField = "must not persist";
    const migrated = migrateProject(raw);

    raw.canvas.width = 1;
    expect(migrated.canvas.width).toBe(project.canvas.width);
    expect(migrated.objects).not.toBe(raw.objects);
    expect(migrated).not.toHaveProperty("extraLocalField");
  });

  it("rejects invalid project structure and asset references", () => {
    expect(() => migrateProject(null)).toThrow("not an OpenSketch project");
    expect(() => migrateProject({ ...project, format: "Other" })).toThrow("marker");
    expect(() => migrateProject({ ...project, name: "" })).toThrow("incomplete");
    expect(() => migrateProject({ ...project, canvas: { ...project.canvas, unit: "cm" } })).toThrow(
      "canvas unit"
    );
    expect(() => migrateProject({ ...project, objects: [] })).toThrow("scene is invalid");
    expect(() => migrateProject({ ...project, usedAssetIds: [42] })).toThrow("asset references");
  });

  it("defaults omitted optional media and asset lists", () => {
    const legacy = { ...project, uploads: undefined, usedAssetIds: undefined };
    const migrated = migrateProject(legacy);
    expect(migrated.uploads).toEqual([]);
    expect(migrated.usedAssetIds).toEqual([]);
  });
});
