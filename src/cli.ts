#!/usr/bin/env node

import { scaffoldPreMortemSkill } from "./index";

function printHelp() {
  // intentionally minimal; CLI is scaffold-only
  process.stdout.write(
    [
      "pre-mortem-discussion: scaffold Claude Code pre-mortem skill\n",
      "\n",
      "Usage:\n",
      "  npx pre-mortem-discussion\n",
      "\n",
      "Options:\n",
      "  --dir <path>   target project directory (default: cwd)\n",
      "  -h, --help     show help\n",
    ].join("")
  );
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes("-h") || args.includes("--help")) {
    printHelp();
    return;
  }

  let dir: string | undefined;
  const dirIdx = args.indexOf("--dir");
  if (dirIdx >= 0) dir = args[dirIdx + 1];
  const cwd = dir ?? process.cwd();

  const result = await scaffoldPreMortemSkill({ cwd });

  // concise, conflict-forward output
  for (const e of result.entries) {
    const suffix = e.detail ? ` (${e.detail})` : "";
    process.stdout.write(`${e.action}\t${e.relativePath}${suffix}\n`);
  }

  if (result.hadConflicts) process.exitCode = 2;
}

main().catch((err) => {
  process.stderr.write((err as Error)?.stack ? String((err as Error).stack) : String(err));
  process.stderr.write("\n");
  process.exitCode = 1;
});
