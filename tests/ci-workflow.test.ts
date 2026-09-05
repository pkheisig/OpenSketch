import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const workflow = readFileSync(resolve(process.cwd(), ".github/workflows/ci.yml"), "utf8");
const policy = JSON.parse(
  readFileSync(resolve(process.cwd(), ".github/repository-policy.json"), "utf8")
) as { canonicalReleaseBranch: string };
const architecture = readFileSync(resolve(process.cwd(), "docs/architecture.md"), "utf8");

function configuredPushBranches(source: string): string[] {
  const match = source.match(/^ {2}push:\n {4}branches:\s*\[([^\]]*)\]/m);
  if (!match) {
    throw new Error("Expected ci.yml to declare push.branches as an inline list");
  }

  return match[1]
    .split(",")
    .map((branch) => branch.trim())
    .filter(Boolean);
}

describe("GitHub Pages workflow policy", () => {
  it("keeps the Pages trigger aligned with the canonical release branch", () => {
    expect(policy.canonicalReleaseBranch).toEqual(expect.any(String));
    expect(policy.canonicalReleaseBranch).not.toBe("");
    expect(configuredPushBranches(workflow)).toEqual([policy.canonicalReleaseBranch]);
    expect(workflow).not.toContain("main2");
    expect(architecture).toContain(
      `canonical release branch (\`${policy.canonicalReleaseBranch}\`,`
    );
    expect(architecture).toContain("declared in `.github/repository-policy.json`");
  });

  it("runs verification for pull requests while reserving Pages steps for pushes", () => {
    expect(workflow).toMatch(/^ {2}pull_request:\s*$/m);

    const testAndBuildJob = workflow.slice(
      workflow.indexOf("  test-and-build:"),
      workflow.indexOf("\n  deploy:")
    );
    const deployJob = workflow.slice(workflow.indexOf("  deploy:"));

    expect(testAndBuildJob).not.toMatch(/^ {4}if:/m);
    expect(testAndBuildJob).toContain(
      "if: github.event_name == 'push'\n        uses: actions/configure-pages"
    );
    expect(testAndBuildJob).toContain(
      "if: github.event_name == 'push'\n        uses: actions/upload-pages-artifact"
    );
    expect(deployJob).toMatch(/^ {4}if: github\.event_name == 'push'$/m);
  });
});
