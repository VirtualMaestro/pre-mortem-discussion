import fs from "node:fs/promises";

export type ScaffoldMeta = {
  version: 1;
  files: Record<string, { lastWrittenHash: string }>;
};

export async function readMeta(metaPath: string): Promise<ScaffoldMeta | null> {
  try {
    const raw = await fs.readFile(metaPath, "utf8");
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.version !== 1 || typeof parsed.files !== "object") return null;
    return parsed as ScaffoldMeta;
  } catch (e: any) {
    if (e && e.code === "ENOENT") return null;
    throw e;
  }
}

export async function writeMeta(metaPath: string, meta: ScaffoldMeta): Promise<void> {
  const body = JSON.stringify(meta, null, 2) + "\n";
  await fs.writeFile(metaPath, body, "utf8");
}
