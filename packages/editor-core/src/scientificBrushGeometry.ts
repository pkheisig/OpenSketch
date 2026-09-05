import { MAX_BRUSH_UNITS, type BrushPoint, type ScientificBrushSpec } from "./scientificBrush";

const distance = (a: BrushPoint, b: BrushPoint) => Math.hypot(b.x - a.x, b.y - a.y);
/** Sample a Catmull–Rom path; spacing is subsequently measured along arc length. */
export function brushPolyline(spec: ScientificBrushSpec): BrushPoint[] {
  const p = spec.points;
  const count = spec.closed ? p.length : p.length - 1;
  if (!spec.smooth) return spec.closed ? [...p, p[0]] : [...p];
  const at = (i: number) =>
    spec.closed ? p[(i + p.length) % p.length] : p[Math.max(0, Math.min(p.length - 1, i))];
  const result: BrushPoint[] = [];
  for (let i = 0; i < count; i++) {
    const a = at(i - 1),
      b = at(i),
      c = at(i + 1),
      d = at(i + 2);
    for (let j = 0; j < 24; j++) {
      const t = j / 24;
      const axis = (k: "x" | "y") =>
        0.5 *
        (2 * b[k] +
          (-a[k] + c[k]) * t +
          (2 * a[k] - 5 * b[k] + 4 * c[k] - d[k]) * t * t +
          (-a[k] + 3 * b[k] - 3 * c[k] + d[k]) * t * t * t);
      result.push({ x: axis("x"), y: axis("y") });
    }
  }
  result.push(spec.closed ? p[0] : p[p.length - 1]);
  return result;
}
export function sampleBrush(spec: ScientificBrushSpec) {
  const points = brushPolyline(spec);
  const cumulative = [0];
  for (let i = 1; i < points.length; i++)
    cumulative.push(cumulative[i - 1] + distance(points[i - 1], points[i]));
  const length = cumulative[cumulative.length - 1];
  const pitch = spec.unitSize * spec.spacing;
  const requested = Math.max(2, Math.floor(length / pitch) + (spec.closed ? 0 : 1));
  if (requested > MAX_BRUSH_UNITS)
    throw new Error(
      `Shorten the path or increase unit size/spacing (maximum ${MAX_BRUSH_UNITS} units).`
    );
  if (length < 1) throw new Error("The path must have a nonzero length.");
  let segment = 1;
  const samples = Array.from({ length: requested }, (_, i) => {
    const target = (length * i) / (spec.closed ? requested : requested - 1);
    while (segment < points.length - 1 && cumulative[segment] < target) segment++;
    const a = points[segment - 1],
      b = points[segment];
    const t =
      (target - cumulative[segment - 1]) /
      Math.max(0.0001, cumulative[segment] - cumulative[segment - 1]);
    return {
      x: a.x + (b.x - a.x) * t,
      y: a.y + (b.y - a.y) * t,
      angle: Math.atan2(b.y - a.y, b.x - a.x)
    };
  });
  return { points, samples, length };
}
