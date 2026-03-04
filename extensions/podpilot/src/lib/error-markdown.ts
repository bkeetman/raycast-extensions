import { KubectlCommandError } from "./kubectl";
import { podpilotHeader } from "./brand";

export function formatErrorMarkdown(title: string, error: unknown): string {
  const normalized = normalizeError(error);
  const stderr = normalized.stderr?.trim() || "(empty)";
  const stdout = normalized.stdout?.trim();

  return `${podpilotHeader(title, "Command execution failed")}
${normalized.message}

## kubectl Command
\`\`\`bash
${normalized.command}
\`\`\`

## stderr
\`\`\`text
${stderr}
\`\`\`

${stdout ? `## stdout\n\`\`\`text\n${stdout}\n\`\`\`` : ""}`;
}

export function normalizeError(error: unknown): {
  message: string;
  command: string;
  stderr?: string;
  stdout?: string;
} {
  if (error instanceof KubectlCommandError) {
    return {
      message: error.message,
      command: error.command,
      stderr: error.stderr,
      stdout: error.stdout,
    };
  }

  if (error instanceof Error) {
    return {
      message: error.message,
      command: "(not available)",
    };
  }

  return {
    message: String(error),
    command: "(not available)",
  };
}
