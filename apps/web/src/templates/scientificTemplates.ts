import type { ConnectorBinding, ProjectRecord } from "@opensketch/editor-core";
import { createProject } from "@/persistence/database";

export type ScientificTemplateId =
  "signaling-cascade" | "experimental-workflow" | "comparative-panels";

export interface ScientificTemplate {
  id: ScientificTemplateId;
  name: string;
  description: string;
  eyebrow: string;
  preview: "cascade" | "workflow" | "comparison";
}

export const SCIENTIFIC_TEMPLATES: ScientificTemplate[] = [
  {
    id: "signaling-cascade",
    name: "Signaling cascade",
    description: "Receptor-to-nucleus pathway with editable activation and inhibition steps.",
    eyebrow: "PATHWAY",
    preview: "cascade"
  },
  {
    id: "experimental-workflow",
    name: "Experimental workflow",
    description: "A four-stage sample, acquisition, analysis, and interpretation figure.",
    eyebrow: "METHODS",
    preview: "workflow"
  },
  {
    id: "comparative-panels",
    name: "Comparative panels",
    description: "Control and treatment panels with a shared legend and quantitative summary.",
    eyebrow: "RESULTS",
    preview: "comparison"
  }
];

const SERIALIZED_PROPERTIES = ["objectId", "name", "opensketchType", "connector"];

export async function instantiateScientificTemplate(
  templateId: ScientificTemplateId
): Promise<ProjectRecord> {
  const fabric = await import("fabric");
  const [{ createConnectorObject }, { anchorPoint }] = await Promise.all([
    import("@/editor/connectors"),
    import("@/editor/geometry")
  ]);
  const template = SCIENTIFIC_TEMPLATES.find((item) => item.id === templateId);
  if (!template) throw new Error(`Unknown scientific template: ${templateId}`);

  type TemplateObject = InstanceType<typeof fabric.FabricObject>;
  const objects: TemplateObject[] = [];
  const identity = (object: TemplateObject, name: string, type: string) => {
    object.objectId = crypto.randomUUID();
    object.name = name;
    object.opensketchType = type;
    object.setCoords();
    return object;
  };
  const text = (value: string, left: number, top: number, options: Record<string, unknown> = {}) =>
    identity(
      new fabric.IText(value, {
        left,
        top,
        originX: "center",
        originY: "center",
        fill: "#183133",
        fontFamily: "Source Sans 3",
        fontSize: 34,
        ...options
      }),
      value,
      "text"
    );
  const box = (
    name: string,
    left: number,
    top: number,
    width: number,
    height: number,
    options: Record<string, unknown> = {}
  ) =>
    identity(
      new fabric.Rect({
        left,
        top,
        width,
        height,
        originX: "center",
        originY: "center",
        rx: 24,
        ry: 24,
        fill: "#edf6f2",
        stroke: "#275d5b",
        strokeWidth: 4,
        ...options
      }),
      name,
      "shape"
    );
  const circle = (
    name: string,
    left: number,
    top: number,
    radius: number,
    options: Record<string, unknown> = {}
  ) =>
    identity(
      new fabric.Circle({
        left,
        top,
        radius,
        originX: "center",
        originY: "center",
        fill: "#d7eee7",
        stroke: "#275d5b",
        strokeWidth: 4,
        ...options
      }),
      name,
      "shape"
    );
  const connect = (
    fromObject: TemplateObject,
    toObject: TemplateObject,
    overrides: Partial<ConnectorBinding> = {}
  ) => {
    const fromCenter = fromObject.getCenterPoint();
    const toCenter = toObject.getCenterPoint();
    const horizontal = Math.abs(toCenter.x - fromCenter.x) >= Math.abs(toCenter.y - fromCenter.y);
    const forward = horizontal ? toCenter.x >= fromCenter.x : toCenter.y >= fromCenter.y;
    const binding: ConnectorBinding = {
      fromObjectId: fromObject.objectId!,
      fromAnchor: horizontal ? (forward ? "right" : "left") : forward ? "bottom" : "top",
      toObjectId: toObject.objectId!,
      toAnchor: horizontal ? (forward ? "left" : "right") : forward ? "top" : "bottom",
      startArrowhead: "none",
      endArrowhead: "triangle",
      lineStyle: "solid",
      routing: "orthogonal",
      curvature: 0,
      ...overrides
    };
    const obstacles = objects
      .filter((object) => object !== fromObject && object !== toObject && !object.connector)
      .map((object) => object.getBoundingRect());
    const connector = createConnectorObject(
      anchorPoint(fromObject.getBoundingRect(), binding.fromAnchor),
      anchorPoint(toObject.getBoundingRect(), binding.toAnchor),
      binding,
      { color: "#275d5b", width: 4, opacity: 1 },
      obstacles
    );
    return identity(connector, "Connector", "connector");
  };

  if (templateId === "signaling-cascade") {
    objects.push(
      text("RECEPTOR SIGNALING CASCADE", 100, 75, {
        originX: "left",
        fontSize: 22,
        fontWeight: 700,
        charSpacing: 150,
        fill: "#a9682e"
      }),
      text(
        "Ligand engagement propagates a cytosolic signal to a transcriptional response.",
        100,
        118,
        {
          originX: "left",
          fontSize: 25,
          fill: "#5d706c"
        }
      )
    );
    const receptor = box("Membrane receptor", 300, 360, 230, 120, {
      fill: "#d6ece7"
    });
    const kinase = circle("Kinase complex", 670, 360, 88, {
      fill: "#f1d7a8",
      stroke: "#a9682e"
    });
    const effector = box("Effector", 1020, 360, 220, 120, {
      fill: "#e9e0f4",
      stroke: "#69568a"
    });
    const nucleus = circle("Nucleus", 1340, 360, 120, {
      fill: "#d8e7f2",
      stroke: "#3c6683"
    });
    const inhibitor = box("Inhibitor", 670, 665, 190, 90, {
      fill: "#f6ded7",
      stroke: "#9a5147"
    });
    objects.push(receptor, kinase, effector, nucleus, inhibitor);
    objects.unshift(
      connect(receptor, kinase),
      connect(kinase, effector),
      connect(effector, nucleus),
      connect(inhibitor, kinase, {
        fromAnchor: "top",
        toAnchor: "bottom",
        endArrowhead: "open",
        lineStyle: "dashed"
      })
    );
    objects.push(
      text("Membrane\nreceptor", 300, 360, { fontSize: 29, textAlign: "center" }),
      text("Kinase\ncomplex", 670, 360, { fontSize: 28, textAlign: "center" }),
      text("Effector", 1020, 360, { fontSize: 30 }),
      text("Transcriptional\nresponse", 1340, 360, {
        fontSize: 27,
        textAlign: "center"
      }),
      text("Inhibitor", 670, 665, { fontSize: 27, fill: "#813f37" }),
      text("Plasma membrane", 98, 805, {
        originX: "left",
        fontSize: 22,
        fontStyle: "italic",
        fill: "#5d706c"
      }),
      identity(
        new fabric.Line([90, 770, 1510, 770], {
          stroke: "#8eb9af",
          strokeWidth: 7,
          strokeDashArray: [3, 9]
        }),
        "Plasma membrane",
        "shape"
      )
    );
  } else if (templateId === "experimental-workflow") {
    objects.push(
      text("EXPERIMENTAL WORKFLOW", 90, 75, {
        originX: "left",
        fontSize: 22,
        fontWeight: 700,
        charSpacing: 150,
        fill: "#a9682e"
      }),
      text("Replace each stage with your biological material, instrument, and analysis.", 90, 118, {
        originX: "left",
        fontSize: 25,
        fill: "#5d706c"
      })
    );
    const stages = [
      box("01 Sample", 245, 425, 270, 300, { fill: "#deefe9" }),
      box("02 Acquisition", 615, 425, 270, 300, {
        fill: "#f3e2c2",
        stroke: "#9f7137"
      }),
      box("03 Analysis", 985, 425, 270, 300, {
        fill: "#e6e0f0",
        stroke: "#69568a"
      }),
      box("04 Interpretation", 1355, 425, 270, 300, {
        fill: "#dce8f1",
        stroke: "#3c6683"
      })
    ];
    objects.push(...stages);
    objects.unshift(
      ...stages.slice(0, -1).map((stage, index) => connect(stage, stages[index + 1]))
    );
    const titles = ["SAMPLE", "ACQUISITION", "ANALYSIS", "INTERPRETATION"];
    const notes = [
      "Prepare cells\nor tissue",
      "Measure with\nyour instrument",
      "Transform and\nquantify",
      "Report the\nbiological result"
    ];
    stages.forEach((stage, index) => {
      objects.push(
        text(`0${index + 1}`, stage.left!, 330, {
          fontFamily: "Source Serif 4",
          fontSize: 58,
          fill: index === 1 ? "#9f7137" : index === 2 ? "#69568a" : "#275d5b"
        }),
        text(titles[index], stage.left!, 420, {
          fontSize: 21,
          fontWeight: 700,
          charSpacing: 110
        }),
        text(notes[index], stage.left!, 505, {
          fontSize: 27,
          textAlign: "center",
          lineHeight: 1.25,
          fill: "#526663"
        })
      );
    });
    objects.push(
      text("TIP", 95, 700, {
        originX: "left",
        fontSize: 18,
        fontWeight: 700,
        charSpacing: 120,
        fill: "#a9682e"
      }),
      text("Select two stages and add an arrow to create another attached connector.", 155, 700, {
        originX: "left",
        fontSize: 22,
        fill: "#5d706c"
      })
    );
  } else {
    objects.push(
      text("COMPARATIVE RESPONSE", 90, 70, {
        originX: "left",
        fontSize: 22,
        fontWeight: 700,
        charSpacing: 150,
        fill: "#a9682e"
      }),
      text("Paired qualitative panels and a quantitative summary", 90, 112, {
        originX: "left",
        fontSize: 25,
        fill: "#5d706c"
      })
    );
    const control = box("Control panel", 405, 400, 610, 470, {
      rx: 8,
      ry: 8,
      fill: "#f7f8f4",
      stroke: "#a7b6b1",
      strokeWidth: 3
    });
    const treatment = box("Treatment panel", 1130, 400, 610, 470, {
      rx: 8,
      ry: 8,
      fill: "#f7f8f4",
      stroke: "#a7b6b1",
      strokeWidth: 3
    });
    objects.push(control, treatment);
    objects.push(
      text("A", 125, 205, {
        fontFamily: "Source Serif 4",
        fontSize: 42,
        fontWeight: 700
      }),
      text("CONTROL", 190, 205, {
        originX: "left",
        fontSize: 22,
        fontWeight: 700,
        charSpacing: 130
      }),
      text("B", 850, 205, {
        fontFamily: "Source Serif 4",
        fontSize: 42,
        fontWeight: 700
      }),
      text("TREATMENT", 915, 205, {
        originX: "left",
        fontSize: 22,
        fontWeight: 700,
        charSpacing: 130
      })
    );
    const cellPositions = [
      [280, 345],
      [455, 305],
      [360, 505],
      [520, 510]
    ];
    cellPositions.forEach(([left, top], index) => {
      objects.push(circle(`Control cell ${index + 1}`, left, top, 47, { strokeWidth: 3 }));
      objects.push(
        circle(`Treatment cell ${index + 1}`, left + 725, top, index === 1 ? 73 : 57, {
          fill: "#efc881",
          stroke: "#a9682e",
          strokeWidth: 3
        })
      );
    });
    objects.push(
      text("C", 125, 708, {
        fontFamily: "Source Serif 4",
        fontSize: 42,
        fontWeight: 700
      }),
      text("QUANTIFICATION", 190, 708, {
        originX: "left",
        fontSize: 22,
        fontWeight: 700,
        charSpacing: 130
      })
    );
    [190, 290, 390, 490].forEach((left, index) => {
      objects.push(
        identity(
          new fabric.Rect({
            left,
            top: 810 - index * 18,
            width: 62,
            height: 70 + index * 36,
            originX: "center",
            originY: "bottom",
            fill: index < 2 ? "#7db9ad" : "#dfa456",
            stroke: "",
            rx: 5,
            ry: 5
          }),
          `Quantification bar ${index + 1}`,
          "shape"
        )
      );
    });
    objects.push(
      text("Control", 650, 760, { originX: "left", fontSize: 23 }),
      circle("Control legend", 625, 760, 10, { fill: "#7db9ad", stroke: "" }),
      text("Treatment", 650, 805, { originX: "left", fontSize: 23 }),
      circle("Treatment legend", 625, 805, 10, { fill: "#dfa456", stroke: "" }),
      text("Replace with your statistical summary and significance annotation.", 900, 782, {
        originX: "left",
        fontSize: 22,
        fill: "#5d706c"
      })
    );
  }

  const project = createProject(template.name);
  return {
    ...project,
    description: template.description,
    canvas: {
      ...project.canvas,
      width: 1600,
      height: 900,
      dpi: 300,
      background: "#fffef9",
      transparent: false
    },
    objects: {
      version: fabric.version,
      objects: objects.map((object) => object.toObject(SERIALIZED_PROPERTIES))
    }
  };
}
