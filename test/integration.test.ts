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

  it("creates 4 files + meta; rerun is idempotent; modified file yields incoming", async () => {
    const cwd = await mkTmpDir();

    const r1 = await scaffoldPreMortemSkill({ cwd, skillName: "pre-mortem" });
    expect(r1.entries.filter((e) => e.action === "WROTE").length).toBe(4);

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

  it("scaffolds both skills independently with separate metadata", async () => {
    const cwd = await mkTmpDir();

    const r1 = await scaffoldPreMortemSkill({ cwd, skillName: "pre-mortem" });
    const r2 = await scaffoldPreMortemSkill({ cwd, skillName: "pre-mortem-auto" });

    expect(r1.entries.filter((e) => e.action === "WROTE").length).toBe(4);
    expect(r2.entries.filter((e) => e.action === "WROTE").length).toBe(4);

    const skillDir1 = path.join(cwd, ".claude", "skills", "pre-mortem");
    const skillDir2 = path.join(cwd, ".claude", "skills", "pre-mortem-auto");

    await expect(fs.stat(path.join(skillDir1, ".scaffold-meta.json"))).resolves.toBeTruthy();
    await expect(fs.stat(path.join(skillDir2, ".scaffold-meta.json"))).resolves.toBeTruthy();

    await expect(fs.stat(path.join(skillDir1, "SKILL.md"))).resolves.toBeTruthy();
    await expect(fs.stat(path.join(skillDir2, "SKILL.md"))).resolves.toBeTruthy();
  });

  it("conflict detection works independently per skill", async () => {
    const cwd = await mkTmpDir();

    await scaffoldPreMortemSkill({ cwd, skillName: "pre-mortem" });
    await scaffoldPreMortemSkill({ cwd, skillName: "pre-mortem-auto" });

    const skillPath1 = path.join(cwd, ".claude", "skills", "pre-mortem", "SKILL.md");
    await fs.appendFile(skillPath1, "\nUSER_EDIT_1\n", "utf8");

    const r1 = await scaffoldPreMortemSkill({ cwd, skillName: "pre-mortem" });
    const r2 = await scaffoldPreMortemSkill({ cwd, skillName: "pre-mortem-auto" });

    const conflict1 = r1.entries.find((e) => e.action === "CONFLICT");
    const conflict2 = r2.entries.find((e) => e.action === "CONFLICT");

    expect(conflict1).toBeTruthy();
    expect(conflict2).toBeUndefined();
  });
});
