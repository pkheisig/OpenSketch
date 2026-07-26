import "fabric";
import type { ConnectorBinding } from "@opensketch/editor-core";

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
    effectBaseFill?: string;
    effectBaseStroke?: string;
    originalGradientFill?: Record<string, unknown>;
    originalGradientStroke?: Record<string, unknown>;
    effectBaseGradientFill?: Record<string, unknown>;
    effectBaseGradientStroke?: Record<string, unknown>;
    connector?: ConnectorBinding;
    assetTint?: string;
    assetTintAmount?: number;
    assetSaturation?: number;
    assetBrightness?: number;
  }
}
