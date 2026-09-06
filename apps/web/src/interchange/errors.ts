import type { InterchangeFidelityReport, InterchangeProbe } from "@workspace/editor-core";

export class InterchangeImportError extends Error {
  readonly code: string;
  readonly probe?: InterchangeProbe;
  readonly report?: InterchangeFidelityReport;
  readonly slideIndices?: readonly number[];

  constructor(
    message: string,
    options: {
      code: string;
      probe?: InterchangeProbe;
      report?: InterchangeFidelityReport;
      slideIndices?: readonly number[];
    }
  ) {
    super(message);
    this.name = "InterchangeImportError";
    this.code = options.code;
    this.probe = options.probe;
    this.report = options.report;
    this.slideIndices = options.slideIndices;
  }
}
