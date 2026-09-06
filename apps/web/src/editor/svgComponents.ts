import { Group, Path, Point, util, type FabricObject } from "fabric";

const PREFIX = "Component: ";
const MAX_COMPONENTS = 8;

/** Persisted groups are the editing boundary; their descendants are never targets. */
export function hasSvgComponents(group: Group): boolean {
  const parts = group.getObjects();
  return (
    parts.length > 0 &&
    parts.every((part) => part instanceof Group && Boolean(part.svgComponent))
  );
}

function unpack(group: Group): FabricObject[] {
  return group.removeAll().flatMap((part) => (part instanceof Group ? unpack(part) : [part]));
}

function bounds(objects: FabricObject[]) {
  const boxes = objects.map((object) => object.getBoundingRect());
  const left = Math.min(...boxes.map((box) => box.left));
  const top = Math.min(...boxes.map((box) => box.top));
  return {
    left,
    top,
    width: Math.max(...boxes.map((box) => box.left + box.width)) - left,
    height: Math.max(...boxes.map((box) => box.top + box.height)) - top
  };
}

/** Geometry proposes regions, not anatomical labels. Small marks follow a containing region. */
export function proposeSvgComponents(
  objects: FabricObject[],
  solidRegion: (object: FabricObject) => boolean = () => true,
  insideRegion: (region: FabricObject, detail: FabricObject) => boolean = () => true
): FabricObject[][] | null {
  if (objects.length < 3 || objects.length > 5000) return null;
  const overall = bounds(objects);
  const area = overall.width * overall.height;
  if (!area) return null;
  const boxes = objects.map((object) => object.getBoundingRect());
  const contains = (a: typeof overall, b: typeof overall) => {
    const margin = Math.max(1, Math.min(a.width, a.height) * 0.03);
    return (
      b.left >= a.left - margin &&
      b.top >= a.top - margin &&
      b.left + b.width <= a.left + a.width + margin &&
      b.top + b.height <= a.top + a.height + margin
    );
  };
  const anchors: number[] = [];
  boxes
    .map((box, index) => ({ index, area: box.width * box.height }))
    .filter((box) => {
      const object = objects[box.index];
      return box.area >= area * 0.035 && box.area <= area * 0.85 && solidRegion(object);
    })
    .sort((a, b) => b.area - a.area)
    .forEach(({ index }) => {
      const box = boxes[index];
      if (anchors.length >= 5) return;
      const overlaps = anchors.some((other) => {
        const a = boxes[other];
        const overlap =
          Math.max(
            0,
            Math.min(a.left + a.width, box.left + box.width) - Math.max(a.left, box.left)
          ) *
          Math.max(0, Math.min(a.top + a.height, box.top + box.height) - Math.max(a.top, box.top));
        return overlap > Math.min(a.width * a.height, box.width * box.height) * 0.15;
      });
      if (!overlaps) anchors.push(index);
    });
  if (!anchors.length) return null;
  const groups: FabricObject[][] = Array.from({ length: anchors.length + 1 }, () => []);
  objects.forEach((object, index) => {
    const anchor = anchors.findIndex(
      (candidate) =>
        contains(boxes[candidate], boxes[index]) &&
        (candidate === index || insideRegion(objects[candidate], object))
    );
    groups[anchor + 1].push(object);
  });
  const nonempty = groups.filter((group) => group.length);
  if (nonempty.length < 2) return null;
  // Preserve each region's internal paint order. A pixel comparison below vetoes
  // any visible change caused by bringing interleaved regions together.
  return nonempty.sort((a, b) => objects.indexOf(a[0]) - objects.indexOf(b[0]));
}

/** A contour embedded in another compound path cannot move with this region. */
function hasStrandedContour(regions: FabricObject[][]): boolean {
  const all = regions.flat();
  const overall = bounds(all);
  for (const region of regions) {
    const box = bounds(region);
    if (box.width * box.height > overall.width * overall.height * 0.85) continue;
    for (const object of all) {
      if (!(object instanceof Path) || region.includes(object)) continue;
      const starts = object.path.flatMap((command, index) => (command[0] === "M" ? [index] : []));
      if (starts.length < 2) continue;
      for (let i = 0; i < starts.length; i++) {
        const contour = new Path(object.path.slice(starts[i], starts[i + 1] ?? object.path.length));
        const local = contour.getBoundingRect();
        const matrix = object.calcTransformMatrix();
        const corners = [
          [local.left, local.top],
          [local.left + local.width, local.top],
          [local.left, local.top + local.height],
          [local.left + local.width, local.top + local.height]
        ].map(([x, y]) =>
          util.transformPoint(new Point(x - object.pathOffset.x, y - object.pathOffset.y), matrix)
        );
        const left = Math.min(...corners.map((p) => p.x)),
          top = Math.min(...corners.map((p) => p.y));
        const width = Math.max(...corners.map((p) => p.x)) - left;
        const height = Math.max(...corners.map((p) => p.y)) - top;
        if (
          width / box.width > 0.8 &&
          width / box.width < 1.25 &&
          height / box.height > 0.8 &&
          height / box.height < 1.25 &&
          Math.abs(left + width / 2 - box.left - box.width / 2) < box.width * 0.1 &&
          Math.abs(top + height / 2 - box.top - box.height / 2) < box.height * 0.1
        )
          return true;
      }
    }
  }
  return false;
}

function snapshot(group: Group): Uint8ClampedArray {
  const canvas = group.toCanvasElement({
    multiplier: Math.min(1, 512 / Math.max(group.width, group.height, 1)),
    enableRetinaScaling: false
  });
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Component preview unavailable");
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
  canvas.width = canvas.height = 0;
  return pixels;
}

/** Fresh insertions only. Keep the untouched source group when inference is uncertain. */
export async function prepareSvgComponents(original: Group): Promise<Group> {
  try {
    const candidate = await original.clone(["name", "assetColorRole", "svgComponent"]);
    let authored = candidate;
    while (authored.getObjects().length === 1 && authored.getObjects()[0] instanceof Group) {
      authored = authored.getObjects()[0] as Group;
    }
    let result: Group;
    if (hasSvgComponents(authored)) {
      // Remove wrapper transforms by releasing each enclosing group in order.
      let root = candidate;
      while (root !== authored) root = root.removeAll()[0] as Group;
      result = root;
    } else {
      const leaves = unpack(candidate);
      if (
        leaves.some(
          (part) => part.clipPath || part.shadow || part.globalCompositeOperation !== "source-over"
        )
      )
        return original;
      const masks = new Map<
        FabricObject,
        { pixels: Uint8ClampedArray; width: number; height: number }
      >();
      const regions = proposeSvgComponents(
        leaves,
        (part) => {
          const preview = part.toCanvasElement({
            multiplier: Math.min(1, 128 / Math.max(part.width, part.height, 1)),
            enableRetinaScaling: false
          });
          const context = preview.getContext("2d");
          if (!context) return false;
          const { width, height } = preview;
          const pixels = context.getImageData(0, 0, width, height).data;
          let covered = 0,
            intersection = 0,
            union = 0;
          for (let y = 0; y < height; y++)
            for (let x = 0; x < width; x++) {
              const ink = pixels[(y * width + x) * 4 + 3] > 127;
              const oval =
                ((x + 0.5 - width / 2) / (width / 2)) ** 2 +
                  ((y + 0.5 - height / 2) / (height / 2)) ** 2 <=
                1;
              if (ink) covered++;
              if (ink && oval) intersection++;
              if (ink || oval) union++;
            }
          preview.width = preview.height = 0;
          // Prefer complete oval or rectangular regions. A large bounding box
          // alone can represent disconnected trace islands or a shading patch.
          const solid = covered / (width * height) >= 0.92 || intersection / union >= 0.9;
          if (solid) masks.set(part, { pixels, width, height });
          return solid;
        },
        (region, detail) => {
          const mask = masks.get(region);
          if (!mask) return false;
          const box = region.getBoundingRect();
          const center = detail.getCenterPoint();
          const x = Math.floor(((center.x - box.left) / box.width) * mask.width);
          const y = Math.floor(((center.y - box.top) / box.height) * mask.height);
          return (
            x >= 0 &&
            y >= 0 &&
            x < mask.width &&
            y < mask.height &&
            mask.pixels[(y * mask.width + x) * 4 + 3] > 127
          );
        }
      );
      if (!regions || hasStrandedContour(regions)) return original;
      result = new Group(
        regions.map((region, index) => {
          const group = new Group(region);
          group.svgComponent = `region-${index + 1}`;
          group.name = `${PREFIX}Region ${index + 1}`;
          return group;
        })
      );
    }
    const beforeBounds = original.getBoundingRect();
    const afterBounds = result.getBoundingRect();
    if (
      ["left", "top", "width", "height"].some(
        (key) =>
          Math.abs(
            beforeBounds[key as keyof typeof beforeBounds] -
              afterBounds[key as keyof typeof afterBounds]
          ) > 0.001
      )
    )
      return original;
    const before = snapshot(original);
    const after = snapshot(result);
    if (before.length !== after.length) return original;
    let totalDifference = 0;
    let changedChannels = 0;
    before.forEach((value, index) => {
      const difference = Math.abs(value - after[index]);
      totalDifference += difference;
      if (difference > 8) changedChannels++;
    });
    // Allow only negligible edge antialiasing from Fabric's serialized precision.
    if (totalDifference / before.length > 0.02 || changedChannels / before.length > 0.0001)
      return original;
    return result;
  } catch {
    // Missing canvas support or an unsupported SVG feature must not prevent insertion.
    return original;
  }
}
