import "fabric";
import type { ConnectorBinding } from "@workspace/editor-core";
import type { RecognizedGroup } from "@/editor/groupRecognition";
import type { ElementStyleSnapshot } from "@/editor/elementStyles";

declare module "fabric" {
  interface FabricObject {
    objectId?: string;
    name?: string;
    OpenSketchType?: string;
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
    assetColorPreset?: string;
    recognizedGroups?: RecognizedGroup[];
    defaultElementStyle?: ElementStyleSnapshot;
  }
}
