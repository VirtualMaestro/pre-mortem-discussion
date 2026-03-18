#!/usr/bin/env node

import { scaffoldPreMortemSkill } from "./index";

function printHelp() {
  // intentionally minimal; CLI is scaffold-only
  process.stdout.write(
    [
      "pre-mortem-discussion: scaffold Claude Code pre-mortem skills\n",
      "\n",
      "Usage:\n",
      "  npx pre-mortem-discussion\n",
      "\n",
      "Options:\n",
      "  --skill <name>  which skill(s) to scaffold: both (default), pre-mortem, pre-mortem-auto\n",
      "  -h, --help      show help\n",
    ].join("")
  );
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes("-h") || args.includes("--help")) {
    printHelp();
    return;
  }

  let skillArg = "both";
  const skillIdx = args.indexOf("--skill");
  if (skillIdx >= 0) skillArg = args[skillIdx + 1] ?? "both";

  const cwd = process.cwd();

  const validSkills = ["both", "pre-mortem", "pre-mortem-auto"];
  if (!validSkills.includes(skillArg)) {
    process.stderr.write(`Invalid --skill value: ${skillArg}\n`);
    process.stderr.write(`Valid options: ${validSkills.join(", ")}\n`);
    process.exitCode = 1;
    return;
  }

  const skillsToScaffold = skillArg === "both" ? ["pre-mortem", "pre-mortem-auto"] : [skillArg];

  let hadAnyConflicts = false;

  for (const skillName of skillsToScaffold) {
    const result = await scaffoldPreMortemSkill({ cwd, skillName });

    // concise, conflict-forward output
    for (const e of result.entries) {
      const suffix = e.detail ? ` (${e.detail})` : "";
      process.stdout.write(`${e.action}\t${e.relativePath}${suffix}\n`);
    }

    if (result.hadConflicts) hadAnyConflicts = true;
  }

  if (hadAnyConflicts) process.exitCode = 2;
}

main().catch((err) => {
  process.stderr.write((err as Error)?.stack ? String((err as Error).stack) : String(err));
  process.stderr.write("\n");
  process.exitCode = 1;
});
