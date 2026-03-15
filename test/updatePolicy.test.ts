import { describe, expect, it } from "vitest";

import { decideUpdate } from "../src/updatePolicy";

describe("decideUpdate", () => {
  it("writes when missing", () => {
    expect(decideUpdate({ existingHash: null, lastWrittenHash: null })).toEqual({ kind: "write" });
  });

  it("conflicts when exists but no meta", () => {
    expect(decideUpdate({ existingHash: "a", lastWrittenHash: null })).toEqual({ kind: "conflict" });
  });

  it("overwrites when unmodified since last scaffold", () => {
    expect(decideUpdate({ existingHash: "a", lastWrittenHash: "a" })).toEqual({ kind: "overwrite" });
  });

  it("conflicts when modified", () => {
    expect(decideUpdate({ existingHash: "a", lastWrittenHash: "b" })).toEqual({ kind: "conflict" });
  });
});
