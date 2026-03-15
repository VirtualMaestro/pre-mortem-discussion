export type UpdateDecision =
  | { kind: "write" }
  | { kind: "overwrite" }
  | { kind: "skip" }
  | { kind: "conflict" };

// Inputs are hashes (sha256 hex) or null if missing.
export function decideUpdate(opts: {
  existingHash: string | null;
  lastWrittenHash: string | null;
}): UpdateDecision {
  const { existingHash, lastWrittenHash } = opts;

  // missing file
  if (existingHash === null) return { kind: "write" };

  // file exists but we don't know provenance => never overwrite
  if (lastWrittenHash === null) return { kind: "conflict" };

  // safe overwrite only if user hasn't modified since last scaffold
  if (existingHash === lastWrittenHash) return { kind: "overwrite" };

  return { kind: "conflict" };
}
