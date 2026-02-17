import test from "node:test";
import assert from "node:assert/strict";
import type { CrdtOperation } from "../src/types/compliance.js";
import { mergeCrdtOperations } from "../src/services/crdtMergeService.js";

function op(overrides: Partial<CrdtOperation> & Pick<CrdtOperation, "opId" | "actorId" | "sequence">): CrdtOperation {
  return {
    opId: overrides.opId,
    applicationId: overrides.applicationId ?? "app-1",
    actorId: overrides.actorId,
    sequence: overrides.sequence,
    payload: overrides.payload ?? { field: "x" },
    createdAt: overrides.createdAt ?? "2026-02-17T10:00:00.000Z"
  };
}

test("mergeCrdtOperations is deterministic regardless of incoming order", () => {
  const local: CrdtOperation[] = [op({ opId: "b", actorId: "agent-b", sequence: 2 }), op({ opId: "a", actorId: "agent-a", sequence: 1 })];
  const remoteA: CrdtOperation[] = [op({ opId: "c", actorId: "agent-c", sequence: 2 }), op({ opId: "d", actorId: "agent-a", sequence: 3 })];
  const remoteB = [...remoteA].reverse();

  const first = mergeCrdtOperations(local, remoteA);
  const second = mergeCrdtOperations(local, remoteB);

  assert.deepEqual(first, second);
  assert.deepEqual(
    first.map((entry) => `${entry.sequence}:${entry.actorId}`),
    ["1:agent-a", "2:agent-b", "2:agent-c", "3:agent-a"]
  );
});

test("mergeCrdtOperations is idempotent for duplicate replay", () => {
  const existing = [op({ opId: "1", actorId: "agent-a", sequence: 1, payload: { a: 1 } })];
  const replay = [op({ opId: "2", actorId: "agent-a", sequence: 1, payload: { a: 1 }, createdAt: "2026-02-17T10:00:01.000Z" })];

  const merged = mergeCrdtOperations(existing, replay);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].payload.a, 1);
  assert.equal(merged[0].opId, "1");
});
