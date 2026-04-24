import fs from "node:fs";
import path from "node:path";

export type AiProvider = "claude-code" | "codex" | "antigravity";

export const AI_PROVIDERS: { label: string; value: AiProvider }[] = [
  { label: "Claude Code", value: "claude-code" },
  { label: "Codex", value: "codex" },
  { label: "Antigravity", value: "antigravity" },
];

export function skillTargetDir(projectRoot: string, provider: AiProvider, skillName: string): string {
  const base = provider === "claude-code" ? ".claude" : ".agent";
  return path.join(projectRoot, base, "skills", skillName);
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
  ];
}
