import path from "node:path";

import { listSkillAssetTemplates, skillTargetDir } from "./paths";
import { readMeta, writeMeta, type ScaffoldMeta } from "./meta";
import { sha256Hex } from "./hash";
import { ensureDir, readFileIfExists, atomicWriteFile } from "./io";
import { decideUpdate } from "./updatePolicy";
import { findAvailableIncomingPath } from "./incoming";

export type ScaffoldAction = "WROTE" | "UPDATED" | "SKIPPED" | "CONFLICT";

export type ScaffoldEntry = {
  action: ScaffoldAction;
  relativePath: string;
  detail?: string;
};

export type ScaffoldResult = {
  entries: ScaffoldEntry[];
  hadConflicts: boolean;
};

export async function scaffoldPreMortemSkill(opts: { cwd: string }): Promise<ScaffoldResult> {
  const cwd = opts.cwd;
  const targetDir = skillTargetDir(cwd);
  await ensureDir(targetDir);

  const metaPath = path.join(targetDir, ".scaffold-meta.json");
  const meta: ScaffoldMeta = (await readMeta(metaPath)) ?? { version: 1, files: {} };

  const entries: ScaffoldEntry[] = [];
  let hadConflicts = false;

  for (const t of listSkillAssetTemplates()) {
    const relativePath = path.join(".claude", "skills", "pre-mortem", t.fileName).replace(/\\/g, "/");
    const dstPath = path.join(targetDir, t.fileName);

    const desired = t.content;
    const desiredHash = sha256Hex(desired);

    const existing = await readFileIfExists(dstPath);
    const existingHash = existing === null ? null : sha256Hex(existing);
    const lastWrittenHash = meta.files[t.fileName]?.lastWrittenHash ?? null;

    const decision = decideUpdate({ existingHash, lastWrittenHash });

    if (decision.kind === "write") {
      await atomicWriteFile(dstPath, desired);
      meta.files[t.fileName] = { lastWrittenHash: desiredHash };
      entries.push({ action: "WROTE", relativePath });
      continue;
    }

    if (decision.kind === "overwrite") {
      await atomicWriteFile(dstPath, desired);
      meta.files[t.fileName] = { lastWrittenHash: desiredHash };
      entries.push({ action: "UPDATED", relativePath });
      continue;
    }

    if (decision.kind === "skip") {
      entries.push({ action: "SKIPPED", relativePath });
      continue;
    }

    // conflict
    hadConflicts = true;
    const incomingPath = await findAvailableIncomingPath(dstPath);
    await atomicWriteFile(incomingPath, desired);
    entries.push({
      action: "CONFLICT",
      relativePath,
      detail: path.basename(incomingPath),
    });
  }

  await writeMeta(metaPath, meta);

  return { entries, hadConflicts };
}
