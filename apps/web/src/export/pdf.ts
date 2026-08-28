import sourceSansRegularUrl from "@/assets/fonts/source-sans-3-regular.ttf?url";
import sourceSansBoldUrl from "@/assets/fonts/source-sans-3-bold.ttf?url";
import sourceSansItalicUrl from "@/assets/fonts/source-sans-3-italic.ttf?url";
import { provenanceManifestJson, type ProvenanceManifest } from "@/export/provenance";

export interface PdfExportMetadata {
  title: string;
  description: string;
  credit: string;
  provenance: ProvenanceManifest;
}

const fontData = new Map<string, Promise<string>>();

function fetchFontBase64(url: string): Promise<string> {
  const cached = fontData.get(url);
  if (cached) return cached;
  const pending = fetch(url)
    .then((response) => {
      if (!response.ok)
        throw new Error(`Could not load the bundled PDF font (${response.status}).`);
      return response.arrayBuffer();
    })
    .then((buffer) => {
      const bytes = new Uint8Array(buffer);
      let binary = "";
      for (let offset = 0; offset < bytes.length; offset += 0x8000) {
        binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
      }
      return btoa(binary);
    });
  fontData.set(url, pending);
  return pending;
}

async function registerBundledFonts(pdf: import("jspdf").jsPDF): Promise<void> {
  const [regular, bold, italic] = await Promise.all([
    fetchFontBase64(sourceSansRegularUrl),
    fetchFontBase64(sourceSansBoldUrl),
    fetchFontBase64(sourceSansItalicUrl)
  ]);
  pdf.addFileToVFS("SourceSans3-Regular.ttf", regular);
  pdf.addFileToVFS("SourceSans3-Bold.ttf", bold);
  pdf.addFileToVFS("SourceSans3-Italic.ttf", italic);
  for (const weight of [200, 300, 400, 500]) {
    pdf.addFont("SourceSans3-Regular.ttf", "Source Sans 3", "normal", weight);
  }
  for (const weight of [600, 700, 800, 900]) {
    pdf.addFont("SourceSans3-Bold.ttf", "Source Sans 3", "normal", weight);
  }
  for (const weight of [200, 300, 400, 500, 600, 700, 800, 900]) {
    pdf.addFont("SourceSans3-Italic.ttf", "Source Sans 3", "italic", weight);
  }
}

function escapeXml(value: string): string {
  return value.replace(/[<>&'"]/g, (character) => {
    const values: Record<string, string> = {
      "<": "&lt;",
      ">": "&gt;",
      "&": "&amp;",
      "'": "&apos;",
      '"': "&quot;"
    };
    return values[character];
  });
}

export function buildPdfXmpMetadata(metadata: PdfExportMetadata): string {
  const manifest = escapeXml(provenanceManifestJson(metadata.provenance));
  return `<?xpacket begin="\uFEFF" id="W5M0MpCehiHzreSzNTczkc9d"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/">
  <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
    <rdf:Description rdf:about=""
      xmlns:dc="http://purl.org/dc/elements/1.1/"
      xmlns:pdf="http://ns.adobe.com/pdf/1.3/"
      xmlns:opensketch="https://opensketch.app/ns/provenance/1.0/">
      <dc:title><rdf:Alt><rdf:li xml:lang="x-default">${escapeXml(metadata.title)}</rdf:li></rdf:Alt></dc:title>
      <dc:description><rdf:Alt><rdf:li xml:lang="x-default">${escapeXml(metadata.description)}</rdf:li></rdf:Alt></dc:description>
      <dc:creator><rdf:Seq><rdf:li>Paul Heisig</rdf:li></rdf:Seq></dc:creator>
      <pdf:Producer>OpenSketch</pdf:Producer>
      <opensketch:applicationCredit>${escapeXml(metadata.credit)}</opensketch:applicationCredit>
      <opensketch:provenanceManifest>${manifest}</opensketch:provenanceManifest>
    </rdf:Description>
  </rdf:RDF>
</x:xmpmeta>
<?xpacket end="w"?>`;
}

export async function svgToPdfBlob(
  svgSource: string,
  width: number,
  height: number,
  metadata: PdfExportMetadata
): Promise<Blob> {
  const [{ jsPDF }] = await Promise.all([import("jspdf"), import("svg2pdf.js")]);
  const parsed = new DOMParser().parseFromString(svgSource, "image/svg+xml");
  if (parsed.querySelector("parsererror")) {
    throw new Error("The generated SVG could not be parsed for PDF export.");
  }
  const svg = parsed.documentElement;
  const pdf = new jsPDF({
    orientation: width >= height ? "landscape" : "portrait",
    unit: "px",
    format: [width, height],
    hotfixes: ["px_scaling"],
    compress: true,
    putOnlyUsedFonts: true
  });
  pdf.setProperties({
    title: metadata.title,
    subject: [
      metadata.description,
      metadata.credit,
      ...metadata.provenance.assets.map((asset) => asset.credit).filter(Boolean)
    ]
      .filter(Boolean)
      .join("\n\n"),
    author: "Paul Heisig",
    creator: "OpenSketch",
    keywords: "scientific figure, biology, vector illustration"
  });
  pdf.addMetadata(buildPdfXmpMetadata(metadata), true);
  pdf.setDisplayMode("fullpage", "single");
  await registerBundledFonts(pdf);
  await pdf.svg(svg, {
    x: 0,
    y: 0,
    width,
    height,
    loadExternalStyleSheets: false
  });
  return pdf.output("blob");
}
