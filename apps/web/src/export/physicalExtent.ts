const POINTS_PER_INCH = 72;
const MILLIMETERS_PER_INCH = 25.4;
const PHYSICAL_LENGTH_DECIMAL_PLACES = 6;

/** The logical canvas coordinates and stored document density used by exports. */
export interface DocumentCanvasSize {
  width: number;
  height: number;
  dpi: number;
}

export interface DocumentPhysicalExtent extends DocumentCanvasSize {
  widthPoints: number;
  heightPoints: number;
  widthMillimeters: number;
  heightMillimeters: number;
}

/** The largest page dimension supported by the PDF format in points. */
export const PDF_PAGE_MAX_POINTS = 14_400;

export function calculateDocumentPhysicalExtent(size: DocumentCanvasSize): DocumentPhysicalExtent {
  if (![size.width, size.height, size.dpi].every((value) => Number.isFinite(value) && value > 0)) {
    throw new Error("Document dimensions must be finite and positive");
  }

  const widthPoints = (size.width / size.dpi) * POINTS_PER_INCH;
  const heightPoints = (size.height / size.dpi) * POINTS_PER_INCH;
  const widthMillimeters = (size.width / size.dpi) * MILLIMETERS_PER_INCH;
  const heightMillimeters = (size.height / size.dpi) * MILLIMETERS_PER_INCH;
  if (
    ![widthPoints, heightPoints, widthMillimeters, heightMillimeters].every(
      (value) => Number.isFinite(value) && value > 0
    )
  ) {
    throw new Error("Document dimensions are not representable at the requested DPI");
  }

  return {
    ...size,
    widthPoints,
    heightPoints,
    widthMillimeters,
    heightMillimeters
  };
}

export function assertPdfPageSize(extent: DocumentPhysicalExtent): void {
  if (extent.widthPoints > PDF_PAGE_MAX_POINTS || extent.heightPoints > PDF_PAGE_MAX_POINTS) {
    throw new Error(`PDF page dimensions exceed the supported ${PDF_PAGE_MAX_POINTS}-point limit`);
  }
}

export function formatPhysicalMillimeters(millimeters: number): string {
  if (!Number.isFinite(millimeters) || millimeters <= 0) {
    throw new Error("Physical dimensions must be finite and positive");
  }
  return `${millimeters.toFixed(PHYSICAL_LENGTH_DECIMAL_PLACES).replace(/\.?(0+)$/, "")}mm`;
}

function setSvgRootAttribute(root: string, name: "width" | "height", value: string): string {
  const attribute = new RegExp(`\\s${name}\\s*=\\s*(?:"[^"]*"|'[^']*'|[^\\s>]+)`, "i");
  if (attribute.test(root)) return root.replace(attribute, ` ${name}="${value}"`);
  const closingOffset = root.endsWith("/>") ? 2 : 1;
  return `${root.slice(0, -closingOffset)} ${name}="${value}"${root.slice(-closingOffset)}`;
}

export function applyPhysicalSvgViewport(
  svgSource: string,
  extent: DocumentPhysicalExtent
): string {
  const rootMatch = /<svg\b[^>]*>/i.exec(svgSource);
  if (!rootMatch || rootMatch.index === undefined) {
    throw new Error("The SVG source does not contain a root element");
  }
  let root = rootMatch[0];
  root = setSvgRootAttribute(root, "width", formatPhysicalMillimeters(extent.widthMillimeters));
  root = setSvgRootAttribute(root, "height", formatPhysicalMillimeters(extent.heightMillimeters));
  return (
    svgSource.slice(0, rootMatch.index) +
    root +
    svgSource.slice(rootMatch.index + rootMatch[0].length)
  );
}
