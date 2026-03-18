import fs from "node:fs";
import path from "node:path";

export function skillTargetDir(projectRoot: string, skillName: string): string {
  return path.join(projectRoot, ".claude", "skills", skillName);
}

export type AssetTemplate = { fileName: string; content: string };

function packageRootDir(): string {
  // dist/* at runtime; src/* in dev. In both cases, package root is one level up.
  return path.resolve(__dirname, "..");
}

export function preMortemAssetsDir(skillName: string): string {
  return path.join(packageRootDir(), "assets", skillName);
}

function readAsset(skillName: string, fileName: string): string {
  const p = path.join(preMortemAssetsDir(skillName), fileName);
  return fs.readFileSync(p, "utf8");
}

export function listSkillAssetTemplates(skillName: string): AssetTemplate[] {
  return [
    { fileName: "SKILL.md", content: readAsset(skillName, "SKILL.md") },
    { fileName: "agent-template.md", content: readAsset(skillName, "agent-template.md") },
    { fileName: "domains.md", content: readAsset(skillName, "domains.md") },
    { fileName: "domains.generated.md", content: readAsset(skillName, "domains.generated.md") },
  ];
}
