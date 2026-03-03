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
  const filePath = path.join(os.tmpdir(), `kubeops-${Date.now()}.command`);
  const script = `#!/bin/zsh\nset -euo pipefail\n${command}\n`;
  await writeFile(filePath, script, "utf8");
  await chmod(filePath, 0o755);

  const appName = terminalApp === "iterm" ? "iTerm" : "Terminal";
  await execa("open", ["-a", appName, filePath], {
    reject: true,
  });
}
