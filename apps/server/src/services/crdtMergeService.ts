import type { CrdtOperation } from "../types/compliance.js";

export function mergeCrdtOperations(existing: CrdtOperation[], incoming: CrdtOperation[]): CrdtOperation[] {
  const byKey = new Map<string, CrdtOperation>();

  for (const op of [...existing, ...incoming]) {
    const key = operationIdentity(op);
    const current = byKey.get(key);
    if (!current || compareOps(op, current) < 0) {
      byKey.set(key, op);
    }
  }

  return Array.from(byKey.values()).sort(compareOps);
}

function operationIdentity(op: CrdtOperation): string {
  return `${op.applicationId}:${op.actorId}:${op.sequence}`;
}

function compareOps(a: CrdtOperation, b: CrdtOperation): number {
  if (a.sequence !== b.sequence) return a.sequence - b.sequence;
  if (a.actorId !== b.actorId) return a.actorId.localeCompare(b.actorId);
  if (a.createdAt !== b.createdAt) return a.createdAt.localeCompare(b.createdAt);
  return a.opId.localeCompare(b.opId);
}
