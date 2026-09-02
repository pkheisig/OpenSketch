import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "vitest";
import { SEMANTIC_COMMANDS } from "../apps/web/src/semantic/semanticCommands";

const guide = readFileSync(resolve(process.cwd(), "docs/webmcp.md"), "utf8");

test("the WebMCP guide lists exactly the public semantic commands", () => {
  const documentedCommands = [...guide.matchAll(/^\|\s*`([^`]+)`\s*\|/gm)].map(
    ([, command]) => command
  );

  expect(documentedCommands).toEqual(SEMANTIC_COMMANDS.map((command) => command.name));
  expect(new Set(documentedCommands).size).toBe(documentedCommands.length);
});
