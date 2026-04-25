import readline from "node:readline";
import process from "node:process";

export type Choice = { label: string; value: string };

function render(message: string, choices: Choice[], cursor: number, selected: Set<number>, isFirst: boolean): void {
  if (!isFirst) {
    process.stdout.write(`\x1b[${choices.length + 1}A`);
  }
  process.stdout.write(`\x1b[2K${message}\n`);
  for (let i = 0; i < choices.length; i++) {
    const mark = selected.has(i) ? "[x]" : "[ ]";
    const arrow = i === cursor ? ">" : " ";
    process.stdout.write(`\x1b[2K${arrow} ${mark} ${choices[i].label}\n`);
  }
}

export async function multiSelect(message: string, choices: Choice[]): Promise<string[]> {
  if (!process.stdin.isTTY) {
    return choices.map((c) => c.value);
  }

  const selected = new Set<number>();
  let cursor = 0;

  readline.emitKeypressEvents(process.stdin);
  process.stdin.setRawMode(true);

  render(message, choices, cursor, selected, true);

  return new Promise((resolve) => {
    const onKey = (_str: string, key: { name: string; ctrl: boolean }) => {
      if (!key) return;

      if (key.name === "up") {
        cursor = (cursor - 1 + choices.length) % choices.length;
        render(message, choices, cursor, selected, false);
      } else if (key.name === "down") {
        cursor = (cursor + 1) % choices.length;
        render(message, choices, cursor, selected, false);
      } else if (key.name === "space") {
        if (selected.has(cursor)) selected.delete(cursor);
        else selected.add(cursor);
        render(message, choices, cursor, selected, false);
      } else if (key.name === "return") {
        process.stdin.removeListener("keypress", onKey);
        process.stdin.setRawMode(false);
        process.stdin.pause();
        resolve(choices.filter((_, i) => selected.has(i)).map((c) => c.value));
      } else if (key.ctrl && key.name === "c") {
        process.stdin.removeListener("keypress", onKey);
        process.stdin.setRawMode(false);
        process.stdin.pause();
        process.exit(0);
      }
    };

    process.stdin.on("keypress", onKey);
  });
}
