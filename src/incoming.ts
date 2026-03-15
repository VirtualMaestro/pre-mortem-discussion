import fs from "node:fs/promises";
import path from "node:path";

async function exists(p: string): Promise<boolean> {
  try {
    await fs.stat(p);
    return true;
  } catch (e: any) {
    if (e && e.code === "ENOENT") return false;
    throw e;
  }
}

export async function findAvailableIncomingPath(dstPath: string): Promise<string> {
  const dir = path.dirname(dstPath);
  const base = path.basename(dstPath);

  const first = path.join(dir, `${base}.incoming`);
  if (!(await exists(first))) return first;

  for (let i = 2; i < 1000; i++) {
    const p = path.join(dir, `${base}.incoming${i}`);
    if (!(await exists(p))) return p;
  }

  // should never happen
  return path.join(dir, `${base}.incoming-${Date.now()}`);
}
