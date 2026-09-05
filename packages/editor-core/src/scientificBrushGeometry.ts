import { MAX_BRUSH_UNITS, type BrushPoint, type ScientificBrushSpec } from "./scientificBrush";

const distance = (a: BrushPoint, b: BrushPoint) => Math.hypot(b.x - a.x, b.y - a.y);
/** Sample a Catmull–Rom path; spacing is subsequently measured along arc length. */
export function brushPolyline(spec: ScientificBrushSpec): BrushPoint[] {
  if (spec.arcSweep !== undefined) {
    const circle = circularBrushGeometry(spec);
    const steps = Math.max(16, Math.ceil(Math.abs(spec.arcSweep)));
    return Array.from({ length: steps + 1 }, (_, i) => circle.position(i / steps));
  }
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
  if (spec.arcSweep !== undefined) {
    const circle = circularBrushGeometry(spec);
    const requested = Math.max(
      2,
      Math.floor(circle.length / (spec.unitSize * spec.spacing)) + (spec.closed ? 0 : 1)
    );
    if (requested > MAX_BRUSH_UNITS)
      throw new Error(`Shorten the arc or increase spacing (maximum ${MAX_BRUSH_UNITS} units).`);
    const samples = Array.from({ length: requested }, (_, i) => {
      const fraction = i / (spec.closed ? requested : requested - 1);
      return {
        ...circle.position(fraction),
        angle: circle.start + circle.sweep * fraction + (Math.sign(circle.sweep) * Math.PI) / 2
      };
    });
    return { points, samples, length: circle.length };
  }
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

export function circularBrushGeometry(spec: ScientificBrushSpec) {
  const [center, handle] = spec.points;
  const radius = distance(center, handle);
  const start = Math.atan2(handle.y - center.y, handle.x - center.x);
  const sweep = ((spec.arcSweep ?? 360) * Math.PI) / 180;
  return {
    radius,
    start,
    sweep,
    length: radius * Math.abs(sweep),
    position: (fraction: number) => ({
      x: center.x + radius * Math.cos(start + sweep * fraction),
      y: center.y + radius * Math.sin(start + sweep * fraction)
    })
  };
}

/** Set a uniform circular bend while keeping the two open endpoints fixed. */
export function withBrushCurvature(
  spec: ScientificBrushSpec,
  degrees: number
): ScientificBrushSpec {
  if (spec.closed) throw new Error("Open the path before changing its bend angle.");
  if (!Number.isFinite(degrees) || Math.abs(degrees) > 330)
    throw new Error("Curvature must be between -330 and 330 degrees.");
  const circle = spec.arcSweep === undefined ? undefined : circularBrushGeometry(spec);
  const a = circle ? circle.position(0) : spec.points[0];
  const b = circle ? circle.position(1) : spec.points[spec.points.length - 1];
  const chord = distance(a, b);
  if (chord < 1) throw new Error("Separate the endpoints before adjusting curvature.");
  if (Math.abs(degrees) < 1)
    return {
      ...spec,
      arcSweep: undefined,
      points: [{ ...a }, { ...b }],
      smooth: false,
      closed: false
    };
  const radians = (degrees * Math.PI) / 180;
  const offset = chord / (2 * Math.tan(radians / 2));
  const center = {
    x: (a.x + b.x) / 2 - ((b.y - a.y) / chord) * offset,
    y: (a.y + b.y) / 2 + ((b.x - a.x) / chord) * offset
  };
  return { ...spec, points: [center, { ...a }], arcSweep: degrees, smooth: true, closed: false };
}
export function brushCurvature(spec: ScientificBrushSpec): number {
  if (spec.arcSweep !== undefined) return spec.arcSweep;
  if (spec.points.length < 3) return 0;
  const a = spec.points[0],
    b = spec.points[spec.points.length - 1],
    m = spec.points[Math.floor(spec.points.length / 2)];
  const chord = distance(a, b);
  if (chord < 1) return 0;
  const sagitta =
    ((m.x - (a.x + b.x) / 2) * (b.y - a.y) - (m.y - (a.y + b.y) / 2) * (b.x - a.x)) / chord;
  return Math.max(-330, Math.min(330, (4 * Math.atan((2 * sagitta) / chord) * 180) / Math.PI));
}
