import path from "node:path";
import { execa } from "execa";
import { buildCommandPath, getResolvedPreferences } from "./preferences";
import { formatCommand } from "./shell";
import { KubectlResult } from "../types";

export interface RunKubectlOptions {
  context?: string;
  namespace?: string;
  timeoutMs?: number;
  signal?: AbortSignal;
}

type ExecaErrorLike = {
  stderr?: string;
  stdout?: string;
  shortMessage?: string;
  exitCode?: number;
};

export class KubectlCommandError extends Error {
  command: string;
  stderr: string;
  stdout: string;
  exitCode?: number;

  constructor(message: string, details: { command: string; stderr: string; stdout: string; exitCode?: number }) {
    super(message);
    this.name = "KubectlCommandError";
    this.command = details.command;
    this.stderr = details.stderr;
    this.stdout = details.stdout;
    this.exitCode = details.exitCode;
  }
}

interface Invocation {
  command: string;
  args: string[];
  env: NodeJS.ProcessEnv;
  timeoutMs: number;
}

function resolveInvocation(args: string[], options?: RunKubectlOptions): Invocation {
  const prefs = getResolvedPreferences();
  const prefix: string[] = [];

  if (options?.context) {
    prefix.push("--context", options.context);
  }
  if (options?.namespace) {
    prefix.push("-n", options.namespace);
  }

  const fullArgs = [...prefix, ...args];
  const env = {
    ...process.env,
    PATH: buildCommandPath(process.env.PATH, prefs.kubectlPath, prefs.awsPath),
  };

  return {
    command: prefs.kubectlPath,
    args: fullArgs,
    env,
    timeoutMs: options?.timeoutMs ?? prefs.timeoutMs,
  };
}

export function getKubectlCommandString(args: string[], options?: RunKubectlOptions): string {
  const invocation = resolveInvocation(args, options);
  return formatCommand(invocation.command, invocation.args);
}

export async function runKubectl(args: string[], options?: RunKubectlOptions): Promise<KubectlResult> {
  const invocation = resolveInvocation(args, options);
  const command = formatCommand(invocation.command, invocation.args);

  try {
    const result = await execa(invocation.command, invocation.args, {
      env: invocation.env,
      timeout: invocation.timeoutMs,
      reject: true,
      signal: options?.signal,
      stripFinalNewline: false,
    });

    return {
      stdout: result.stdout,
      stderr: result.stderr,
      command,
    };
  } catch (error) {
    throw toKubectlError(error, command);
  }
}

export async function runKubectlJson<T>(args: string[], options?: RunKubectlOptions): Promise<T> {
  const result = await runKubectl([...args, "-o", "json"], options);

  try {
    return JSON.parse(result.stdout) as T;
  } catch {
    throw new KubectlCommandError("kubectl returned invalid JSON", {
      command: result.command,
      stderr: result.stderr,
      stdout: result.stdout,
    });
  }
}

export function spawnKubectl(args: string[], options?: RunKubectlOptions) {
  const invocation = resolveInvocation(args, options);

  return execa(invocation.command, invocation.args, {
    env: invocation.env,
    timeout: options?.timeoutMs,
    reject: false,
    signal: options?.signal,
    stripFinalNewline: false,
  });
}

export async function resolveBinaryPath(binary: string): Promise<string> {
  if (path.isAbsolute(binary)) {
    return binary;
  }

  try {
    const { stdout } = await execa("which", [binary], {
      reject: true,
    });
    return stdout.trim() || binary;
  } catch {
    return binary;
  }
}

export async function runBinaryVersion(binary: string, args: string[]): Promise<{ command: string; output: string; ok: boolean }> {
  const command = formatCommand(binary, args);

  try {
    const { stdout, stderr } = await execa(binary, args, {
      reject: true,
      timeout: 10_000,
      stripFinalNewline: false,
    });

    return {
      command,
      output: `${stdout}${stderr ? `\n${stderr}` : ""}`.trim(),
      ok: true,
    };
  } catch (error) {
    const execaError = error as ExecaErrorLike;
    return {
      command,
      output: `${execaError.stderr ?? execaError.shortMessage ?? String(error)}`,
      ok: false,
    };
  }
}

function toKubectlError(error: unknown, command: string): KubectlCommandError {
  if (error instanceof KubectlCommandError) {
    return error;
  }

  const execaError = error as ExecaErrorLike;
  const stderr = execaError.stderr ?? "";
  const stdout = execaError.stdout ?? "";
  const message = execaError.shortMessage ?? "kubectl command failed";

  return new KubectlCommandError(message, {
    command,
    stderr,
    stdout,
    exitCode: execaError.exitCode,
  });
}
