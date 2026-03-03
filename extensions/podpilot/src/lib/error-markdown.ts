import { KubectlCommandError } from "./kubectl";

export function formatErrorMarkdown(title: string, error: unknown): string {
  const normalized = normalizeError(error);
  const stderr = normalized.stderr?.trim() || "(empty)";

  return `# ${title}

${normalized.message}

<details>
<summary>Command details</summary>

\`\`\`bash
${normalized.command}
\`\`\`

**stderr**
\`\`\`
${stderr}
\`\`\`

${normalized.stdout ? `**stdout**\n\`\`\`\n${normalized.stdout}\n\`\`\`` : ""}

</details>`;
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
