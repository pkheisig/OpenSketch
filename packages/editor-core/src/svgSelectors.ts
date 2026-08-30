type SvgIdMapping = ReadonlyMap<string, string>;

const CSS_IDENTIFIER_CHARACTER = /[A-Za-z0-9_-]/;
const CSS_SELECTOR_BOUNDARY = /[\s{},.:#[\]>+~*()]/;

/**
 * Rewrite only local ID selector tokens in CSS rule preambles.
 *
 * Keeping this tokenizer independent of the DOM makes browser imports and
 * build-time asset sanitation use the same bounded selector grammar. In
 * particular, declaration values are never passed through this function, so
 * hexadecimal colors cannot be mistaken for IDs.
 */
export function rewriteSvgCssSelectors(content: string, idMap: SvgIdMapping): string {
  if (idMap.size === 0 || !content.includes("#")) return content;

  const entries = [...idMap.entries()].sort(([left], [right]) => right.length - left.length);
  let output = "";
  let copyStart = 0;
  let segmentStart = 0;
  let bracketDepth = 0;
  let parenthesisDepth = 0;
  let selectorFunctionDepth = 0;
  let quote: "'" | '"' | null = null;

  const rewriteSegment = (end: number): void => {
    const segment = content.slice(segmentStart, end);
    output += content.slice(copyStart, segmentStart);
    output += rewriteSelectorSegment(segment, entries);
    copyStart = end;
  };

  for (let index = 0; index < content.length; index += 1) {
    const character = content[index];
    if (quote) {
      if (character === "\\") index += 1;
      else if (character === quote) quote = null;
      continue;
    }
    if (character === "/" && content[index + 1] === "*") {
      const end = content.indexOf("*/", index + 2);
      index = end < 0 ? content.length : end + 1;
      continue;
    }
    if (character === "'" || character === '"') {
      quote = character;
      continue;
    }
    if (character === "[") {
      bracketDepth += 1;
      continue;
    }
    if (character === "]") {
      bracketDepth = Math.max(0, bracketDepth - 1);
      continue;
    }
    if (character === "(") {
      parenthesisDepth += 1;
      if (isSelectorFunction(content, index)) selectorFunctionDepth += 1;
      continue;
    }
    if (character === ")") {
      parenthesisDepth = Math.max(0, parenthesisDepth - 1);
      if (selectorFunctionDepth > parenthesisDepth) selectorFunctionDepth -= 1;
      continue;
    }
    if (character === ";" && bracketDepth === 0 && parenthesisDepth === 0) {
      segmentStart = index + 1;
      continue;
    }
    if (character === "{") {
      rewriteSegment(index);
      output += "{";
      copyStart = index + 1;
      segmentStart = index + 1;
      bracketDepth = 0;
      parenthesisDepth = 0;
      selectorFunctionDepth = 0;
      continue;
    }
    if (character === "}") {
      output += content.slice(copyStart, index + 1);
      copyStart = index + 1;
      segmentStart = index + 1;
      bracketDepth = 0;
      parenthesisDepth = 0;
      selectorFunctionDepth = 0;
    }
  }

  output += content.slice(copyStart);
  return output;
}

function rewriteSelectorSegment(segment: string, entries: Array<[string, string]>): string {
  const atRule = /^\s*@/.test(segment);
  let output = "";
  let copyStart = 0;
  let bracketDepth = 0;
  let selectorFunctionDepth = 0;
  let parenthesisDepth = 0;
  let quote: "'" | '"' | null = null;

  for (let index = 0; index < segment.length; index += 1) {
    const character = segment[index];
    if (quote) {
      if (character === "\\") index += 1;
      else if (character === quote) quote = null;
      continue;
    }
    if (character === "/" && segment[index + 1] === "*") {
      const end = segment.indexOf("*/", index + 2);
      index = end < 0 ? segment.length : end + 1;
      continue;
    }
    if (character === "'" || character === '"') {
      quote = character;
      continue;
    }
    if (character === "[") {
      bracketDepth += 1;
      continue;
    }
    if (character === "]") {
      bracketDepth = Math.max(0, bracketDepth - 1);
      continue;
    }
    if (character === "(") {
      parenthesisDepth += 1;
      if (isSelectorFunction(segment, index)) selectorFunctionDepth += 1;
      continue;
    }
    if (character === ")") {
      parenthesisDepth = Math.max(0, parenthesisDepth - 1);
      if (selectorFunctionDepth > parenthesisDepth) selectorFunctionDepth -= 1;
      continue;
    }
    if (character !== "#" || bracketDepth > 0 || (atRule && selectorFunctionDepth === 0)) {
      continue;
    }
    const replacement = mappedSelectorAt(segment, index, entries);
    if (!replacement) continue;
    output += segment.slice(copyStart, index);
    output += `#${replacement.value}`;
    index = replacement.end - 1;
    copyStart = replacement.end;
  }

  return output ? `${output}${segment.slice(copyStart)}` : segment;
}

function mappedSelectorAt(
  selector: string,
  hashIndex: number,
  entries: Array<[string, string]>
): { value: string; end: number } | null {
  const start = hashIndex + 1;
  const first = selector[start];
  if (!first) return null;

  for (const [oldId, newId] of entries) {
    if (!selector.startsWith(oldId, start)) continue;
    const end = start + oldId.length;
    const following = selector[end];
    if (following && !CSS_SELECTOR_BOUNDARY.test(following)) continue;
    return { value: newId, end };
  }
  return null;
}

function isSelectorFunction(source: string, parenthesisIndex: number): boolean {
  let end = parenthesisIndex;
  while (end > 0 && /\s/.test(source[end - 1] ?? "")) end -= 1;
  let start = end;
  while (start > 0 && CSS_IDENTIFIER_CHARACTER.test(source[start - 1] ?? "")) start -= 1;
  return source.slice(start, end).toLowerCase() === "selector";
}
