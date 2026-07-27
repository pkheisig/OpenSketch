export interface RecognizedGroup {
  objectId: string;
  memberObjectIds: string[];
  properties: Record<string, unknown>;
}

interface RecognizableObject {
  objectId?: string;
  recognizedGroups?: RecognizedGroup[];
}

function sameMembers(left: string[], right: string[]): boolean {
  if (left.length !== right.length) return false;
  const expected = new Set(left);
  return expected.size === right.length && right.every((id) => expected.has(id));
}

export function findRecognizedGroup(
  objects: RecognizableObject[]
): RecognizedGroup | undefined {
  const memberObjectIds = objects
    .map((object) => object.objectId)
    .filter((id): id is string => Boolean(id));
  if (memberObjectIds.length !== objects.length || objects.length === 0) return undefined;

  const candidates = objects[0].recognizedGroups ?? [];
  return [...candidates].reverse().find(
    (candidate) =>
      sameMembers(candidate.memberObjectIds, memberObjectIds) &&
      objects.every((object) =>
        object.recognizedGroups?.some(
          (record) =>
            record.objectId === candidate.objectId &&
            sameMembers(record.memberObjectIds, candidate.memberObjectIds)
        )
      )
  );
}

export function rememberRecognizedGroup(
  objects: RecognizableObject[],
  recognition: RecognizedGroup
): void {
  objects.forEach((object) => {
    object.recognizedGroups = [
      ...(object.recognizedGroups ?? []).filter(
        (record) => record.objectId !== recognition.objectId
      ),
      recognition
    ];
  });
}

export function consumeRecognizedGroup(
  objects: RecognizableObject[],
  recognition: RecognizedGroup
): void {
  objects.forEach((object) => {
    const remaining = object.recognizedGroups?.filter(
      (record) => record.objectId !== recognition.objectId
    );
    object.recognizedGroups = remaining?.length ? remaining : undefined;
  });
}
