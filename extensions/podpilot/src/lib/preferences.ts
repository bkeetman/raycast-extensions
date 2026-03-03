import { getPreferenceValues } from "@raycast/api";
import path from "node:path";
import { ExtensionPreferences, TerminalApp } from "../types";

const DEFAULT_TIMEOUT_MS = 15_000;

export interface ResolvedPreferences {
  kubectlPath: string;
  awsPath: string;
  terminalApp: TerminalApp;
  execShell: string;
  timeoutMs: number;
}

export function getResolvedPreferences(): ResolvedPreferences {
  const prefs = getPreferenceValues<ExtensionPreferences>();
  const kubectlPath = normalizeText(prefs.kubectlPath, "kubectl");
  const awsPath = normalizeText(prefs.awsPath, "aws");
  const terminalApp: TerminalApp = prefs.terminalApp === "iterm" ? "iterm" : "terminal";
  const execShell = normalizeText(prefs.execShell, "/bin/sh");

  const parsedTimeout = Number.parseInt(normalizeText(prefs.kubectlTimeoutMs, `${DEFAULT_TIMEOUT_MS}`), 10);
  const timeoutMs = Number.isFinite(parsedTimeout) && parsedTimeout > 0 ? parsedTimeout : DEFAULT_TIMEOUT_MS;

  return {
    kubectlPath,
    awsPath,
    terminalApp,
    execShell,
    timeoutMs,
  };
}

export function buildCommandPath(existingPath: string | undefined, kubectlPath: string, awsPath: string): string {
  const fallbackPath = "/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin";
  const parts = (existingPath ?? process.env.PATH ?? fallbackPath).split(path.delimiter).filter(Boolean);
  const prepend = [dirnameIfAbsolute(kubectlPath), dirnameIfAbsolute(awsPath)].filter(Boolean) as string[];
  return [...prepend, ...parts].join(path.delimiter);
}

function dirnameIfAbsolute(binary: string): string | undefined {
  if (!path.isAbsolute(binary)) {
    return undefined;
  }

  return path.dirname(binary);
}

function normalizeText(value: string | undefined, fallback: string): string {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : fallback;
}
