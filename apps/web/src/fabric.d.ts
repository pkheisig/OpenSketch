import "fabric";
import type { ConnectorBinding } from "@workspace/editor-core";
import type { RecognizedGroup } from "@/editor/groupRecognition";
import type { ElementStyleSnapshot } from "@/editor/elementStyles";
import type { SemanticMetadata, SemanticRelation } from "@/semantic/composition";

declare module "fabric" {
  interface FabricObject {
    svgComponent?: string;
    assetColorRole?: import("@workspace/editor-core").AssetColorRole;
    scientificBrush?: import("@/editor/scientific/catalog").ScientificBrushSpec;
    objectId?: string;
    name?: string;
    OpenSketchType?: string;
    assetId?: string;
    familyId?: string;
    assetStyle?: import("@workspace/editor-core").AssetStyle;
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
    freeConnectorBinding?: ConnectorBinding;
    freeConnectorGeometry?: {
      from: { x: number; y: number };
      to: { x: number; y: number };
    };
    connectorHeadOffsetVersion?: number;
    assetTint?: string;
    assetTintAmount?: number;
    assetSaturation?: number;
    assetBrightness?: number;
    assetColorPreset?: string;
    recognizedGroups?: RecognizedGroup[];
    defaultElementStyle?: ElementStyleSnapshot;
    semanticMetadata?: SemanticMetadata;
    semanticRelations?: SemanticRelation[];
    particleFieldSpec?: Record<string, unknown>;
    semanticConnector?: {
      version: 1;
      fromPortId: string;
      toPortId: string;
      routeType: "straight" | "orthogonal" | "bezier" | "outside" | "circular-arc" | "cycle-arc";
      clearance: number;
      routeContext?: {
        center?: { x: number; y: number };
        radius?: number;
        axes?: { x: number; y: number };
        direction?: "clockwise" | "counterclockwise";
      };
    };
  }
}
