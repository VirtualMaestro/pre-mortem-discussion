import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { scaffoldPreMortemSkill } from "../src/index";
import { preMortemAssetsDir } from "../src/paths";
import { sha256Hex } from "../src/hash";
import fsSync from "node:fs";
import pathSync from "node:path";

async function mkTmpDir(): Promise<string> {
  return await fs.mkdtemp(path.join(os.tmpdir(), "pre-mortem-discussion-"));
}

describe("scaffoldPreMortemSkill integration", () => {
  it("loads templates from assets/ (single source of truth)", async () => {
    const cwd = await mkTmpDir();

    await scaffoldPreMortemSkill({ cwd, skillName: "pre-mortem" });

    const skillDir = path.join(cwd, ".claude", "skills", "pre-mortem");

    const assetSkill = fsSync.readFileSync(pathSync.join(preMortemAssetsDir("pre-mortem"), "SKILL.md"), "utf8");
    const writtenSkill = fsSync.readFileSync(pathSync.join(skillDir, "SKILL.md"), "utf8");

    expect(sha256Hex(writtenSkill)).toBe(sha256Hex(assetSkill));
  });

  it("creates 3 files + meta; rerun is idempotent; modified file yields incoming", async () => {
    const cwd = await mkTmpDir();

    const r1 = await scaffoldPreMortemSkill({ cwd, skillName: "pre-mortem" });
    expect(r1.entries.filter((e) => e.action === "WROTE").length).toBe(3);

    const skillDir = path.join(cwd, ".claude", "skills", "pre-mortem");
    const metaPath = path.join(skillDir, ".scaffold-meta.json");
    await expect(fs.stat(metaPath)).resolves.toBeTruthy();

    const r2 = await scaffoldPreMortemSkill({ cwd, skillName: "pre-mortem" });
    expect(r2.entries.every((e) => e.action === "UPDATED" || e.action === "SKIPPED")).toBe(true);

    const skillPath = path.join(skillDir, "SKILL.md");
    await fs.appendFile(skillPath, "\nUSER_EDIT\n", "utf8");

    const r3 = await scaffoldPreMortemSkill({ cwd, skillName: "pre-mortem" });
    const conflict = r3.entries.find((e) => e.action === "CONFLICT" && e.relativePath.endsWith("SKILL.md"));
    expect(conflict).toBeTruthy();

    const incomingPath = path.join(skillDir, "SKILL.md.incoming");
    await expect(fs.stat(incomingPath)).resolves.toBeTruthy();
  });
});
