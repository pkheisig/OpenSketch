import "fabric";

declare module "fabric" {
  interface FabricObject {
    objectId?: string;
    name?: string;
    opensketchType?: string;
    assetId?: string;
    familyId?: string;
    provenance?: Record<string, string>;
    originalPalette?: Record<string, string>;
    originalFill?: string;
    originalStroke?: string;
    connector?: Record<string, string>;
  }
}
