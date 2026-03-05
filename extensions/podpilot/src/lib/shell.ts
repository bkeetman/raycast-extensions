import { chmod, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execa } from "execa";
import { TerminalApp } from "../types";

export function shellQuote(value: string): string {
  if (/^[A-Za-z0-9_./:@%-]+$/.test(value)) {
    return value;
  }

  return `'${value.replace(/'/g, `'\\''`)}'`;
}

export function formatCommand(command: string, args: string[]): string {
  return [command, ...args].map(shellQuote).join(" ");
}

export async function openCommandInTerminal(command: string, terminalApp: TerminalApp): Promise<void> {
  const filePath = path.join(os.tmpdir(), `podpilot-${Date.now()}.command`);
  const script = `#!/bin/zsh
set -euo pipefail
(sleep 30; rm -f -- "$0") >/dev/null 2>&1 &
${command}
`;
  await writeFile(filePath, script, "utf8");
  await chmod(filePath, 0o755);

  if (terminalApp === "default") {
    await execa("open", [filePath], { reject: true });
    return;
  }

  const appName = terminalApp === "iterm" ? "iTerm" : "Terminal";
  await execa("open", ["-a", appName, filePath], { reject: true });
}
