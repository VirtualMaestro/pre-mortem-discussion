import fs from "node:fs";
import path from "node:path";

export function skillTargetDir(projectRoot: string): string {
  return path.join(projectRoot, ".claude", "skills", "pre-mortem");
}

export type AssetTemplate = { fileName: string; content: string };

function packageRootDir(): string {
  // dist/* at runtime; src/* in dev. In both cases, package root is one level up.
  return path.resolve(__dirname, "..");
}

export function preMortemAssetsDir(): string {
  return path.join(packageRootDir(), "assets", "pre-mortem");
}

function readAsset(fileName: string): string {
  const p = path.join(preMortemAssetsDir(), fileName);
  return fs.readFileSync(p, "utf8");
}

export function listSkillAssetTemplates(): AssetTemplate[] {
  return [
    { fileName: "SKILL.md", content: readAsset("SKILL.md") },
    { fileName: "agent-template.md", content: readAsset("agent-template.md") },
    { fileName: "domains.md", content: readAsset("domains.md") },
    { fileName: "domains.generated.md", content: readAsset("domains.generated.md") },
  ];
}
