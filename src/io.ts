import fs from "node:fs/promises";
import path from "node:path";

export async function ensureDir(dirPath: string): Promise<void> {
  await fs.mkdir(dirPath, { recursive: true });
}

export async function readFileIfExists(filePath: string): Promise<string | null> {
  try {
    return await fs.readFile(filePath, "utf8");
  } catch (e: any) {
    if (e && (e.code === "ENOENT" || e.code === "ENOTDIR")) return null;
    throw e;
  }
}

export async function atomicWriteFile(filePath: string, content: string): Promise<void> {
  const dir = path.dirname(filePath);
  await ensureDir(dir);

  const tmp = path.join(dir, `.${path.basename(filePath)}.tmp-${process.pid}-${Date.now()}`);
  await fs.writeFile(tmp, content, "utf8");

  try {
    // Windows cannot atomically replace existing; remove first.
    await fs.unlink(filePath);
  } catch (e: any) {
    if (!(e && e.code === "ENOENT")) throw e;
  }

  await fs.rename(tmp, filePath);
}
