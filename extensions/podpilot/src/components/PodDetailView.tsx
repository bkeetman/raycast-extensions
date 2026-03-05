import { Action, ActionPanel, Alert, Clipboard, Detail, Form, Icon, Toast, confirmAlert, showToast, useNavigation } from "@raycast/api";
import { FormValidation, useForm } from "@raycast/utils";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BRAND_COLORS, podpilotHeader, podpilotTitle, tintedIcon } from "../lib/brand";
import { clearResourceCache } from "../lib/kube-data";
import { normalizeError } from "../lib/error-markdown";
import { getResolvedPreferences, buildCommandPath } from "../lib/preferences";
import { getKubectlCommandString, KubectlCommandError, runKubectl, spawnKubectl } from "../lib/kubectl";
import { formatCommand, openCommandInTerminal, shellQuote } from "../lib/shell";
import { formatAge, formatTimestamp } from "../lib/time";
import { Pod } from "../types";

interface PodDetailViewProps {
  context: string;
  namespace: string;
  pod: Pod;
  onMutated?: () => Promise<void> | void;
}

interface TailLogsValues {
  container: string;
  follow: boolean;
  tailLines: string;
  openInTerminal: boolean;
}

interface CopyLogsValues {
  container: string;
  tailLines: string;
}

interface ExecShellValues {
  container: string;
  shell: string;
}

interface PortForwardValues {
  localPort: string;
  remotePort: string;
  openBrowser: boolean;
  protocol: string;
}

const MAX_LOG_BUFFER_LINES = 1200;

type LogStreamSource = "stdout" | "stderr";

type LogLine = {
  id: string;
  raw: string;
  timestamp: string;
};

const logTimestampFormatter = new Intl.DateTimeFormat(undefined, {
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

function normalizeLogStream(raw: string): string {
  return raw
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\\u001b\[/g, "\u001b[")
    .replace(/\\x1b\[/g, "\u001b[");
}

function restoreBareAnsiSequences(raw: string): string {
  const normalized = normalizeLogStream(raw);
  // eslint-disable-next-line no-control-regex
  const bareAnsiRegex = new RegExp("(^|[^\\u001b])\\[(\\d{1,3}(?:;\\d{1,3})*)m", "g");
  return normalized.replace(bareAnsiRegex, (_match, prefix: string, sgr: string) => {
    return `${prefix}\u001b[${sgr}m`;
  });
}

// eslint-disable-next-line no-control-regex
const ANSI_ESCAPE_REGEX = new RegExp("\\u001b\\[([0-9;]*)m", "g");

function stripAnsiControlCodes(raw: string): string {
  return restoreBareAnsiSequences(raw).replace(ANSI_ESCAPE_REGEX, "");
}

function ansiColorBadge(raw: string): string {
  const line = restoreBareAnsiSequences(raw);
  let activeColor: number | undefined;

  for (const match of line.matchAll(ANSI_ESCAPE_REGEX)) {
    const codes = (match[1] || "0")
      .split(";")
      .map((part) => Number.parseInt(part, 10))
      .filter((value) => Number.isFinite(value));

    for (const code of codes) {
      if (code === 0 || code === 39) {
        activeColor = undefined;
        continue;
      }
      if ((code >= 30 && code <= 37) || (code >= 90 && code <= 97)) {
        activeColor = code;
      }
    }
  }

  if (activeColor === undefined) {
    return "⚪";
  }

  if (activeColor === 31 || activeColor === 91) {
    return "🔴";
  }
  if (activeColor === 32 || activeColor === 92) {
    return "🟢";
  }
  if (activeColor === 33 || activeColor === 93) {
    return "🟡";
  }
  if (activeColor === 34 || activeColor === 94) {
    return "🔵";
  }
  if (activeColor === 35 || activeColor === 95) {
    return "🟣";
  }
  if (activeColor === 36 || activeColor === 96) {
    return "🔹";
  }
  return "⚪";
}

function splitLogChunk(chunk: string, remainder: string): { completeLines: string[]; remainder: string } {
  const merged = `${remainder}${normalizeLogStream(chunk)}`;
  const lines = merged.split("\n");
  const nextRemainder = lines.pop() ?? "";
  return { completeLines: lines, remainder: nextRemainder };
}

function buildPodLogsArgs(
  podName: string,
  tailLines: number,
  options?: {
    container?: string;
    follow?: boolean;
  },
): string[] {
  const args = ["logs", podName, "--tail", `${tailLines}`];
  if (options?.container) {
    args.push("-c", options.container);
  }
  if (options?.follow) {
    args.push("-f");
  }
  return args;
}

async function openPodLogsInTerminal({
  context,
  namespace,
  podName,
  container,
  follow,
  tailLines,
}: {
  context: string;
  namespace: string;
  podName: string;
  container?: string;
  follow: boolean;
  tailLines: number;
}): Promise<void> {
  const prefs = getResolvedPreferences();
  const commandPath = buildCommandPath(process.env.PATH, prefs.kubectlPath, prefs.awsPath);
  const logsArgs = buildPodLogsArgs(podName, tailLines, { container, follow });
  const command = formatCommand(prefs.kubectlPath, ["--context", context, "-n", namespace, ...logsArgs]);
  const script = `export PATH=${shellQuote(commandPath)}\n${command}`;
  await openCommandInTerminal(script, prefs.terminalApp);
}

export function PodDetailView({ context, namespace, pod, onMutated }: PodDetailViewProps) {
  const podName = pod.metadata.name;
  const containers = pod.spec?.containers?.map((container) => container.name) ?? [];
  const ready = pod.status?.containerStatuses?.filter((status) => status.ready).length ?? 0;
  const total = pod.status?.containerStatuses?.length ?? 0;
  const status = pod.status?.phase ?? "Unknown";
  const node = pod.spec?.nodeName ?? "-";

  const markdown = `${podpilotHeader("Pod Workspace", podName)}
## Runtime

- **Status:** ${status}
- **Ready:** ${ready}/${total}
- **Node:** ${node}
- **Age:** ${formatAge(pod.metadata.creationTimestamp)}
- **Created:** ${formatTimestamp(pod.metadata.creationTimestamp)}

## Target

- **Context:** ${context}
- **Namespace:** ${namespace}
- **Containers:** ${containers.length > 0 ? containers.join(", ") : "-"}
`;

  const runMutation = useCallback(
    async (title: string, command: () => Promise<void>) => {
      const toast = await showToast({ style: Toast.Style.Animated, title });

      try {
        await command();
        clearResourceCache(context, namespace);
        await onMutated?.();
        toast.style = Toast.Style.Success;
      } catch (error) {
        toast.style = Toast.Style.Failure;
        toast.message = error instanceof Error ? error.message : String(error);
      }
    },
    [context, namespace, onMutated],
  );

  return (
    <Detail
      navigationTitle={podpilotTitle(`Pod: ${podName}`)}
      markdown={markdown}
      actions={
        <ActionPanel>
          <ActionPanel.Section title="Logs">
            <Action.Push
              title="Tail Logs"
              icon={tintedIcon(Icon.Terminal, BRAND_COLORS.orange)}
              target={<TailLogsForm context={context} namespace={namespace} podName={podName} containers={containers} />}
            />
            <Action.Push
              title="Copy Logs"
              icon={tintedIcon(Icon.Clipboard, BRAND_COLORS.sky)}
              target={<CopyLogsForm context={context} namespace={namespace} podName={podName} containers={containers} />}
            />
          </ActionPanel.Section>

          <ActionPanel.Section title="Pod Access">
            <Action.Push
              title="Exec Shell in Terminal"
              icon={tintedIcon(Icon.Window, BRAND_COLORS.blue)}
              target={<ExecShellForm context={context} namespace={namespace} podName={podName} containers={containers} />}
            />
            <Action.Push
              title="Port-Forward"
              icon={tintedIcon(Icon.Link, BRAND_COLORS.gold)}
              target={<PortForwardForm context={context} namespace={namespace} podName={podName} />}
            />
          </ActionPanel.Section>

          <ActionPanel.Section title="Mutations">
            <Action
              title="Restart Pod (Delete)"
              icon={tintedIcon(Icon.Trash, BRAND_COLORS.danger)}
              style={Action.Style.Destructive}
              onAction={async () => {
                const confirmed = await confirmAlert({
                  title: `Delete pod ${podName}?`,
                  message: "The pod will be terminated. If controlled by a Deployment/ReplicaSet, Kubernetes will recreate it.",
                  primaryAction: {
                    title: "Delete Pod",
                    style: Alert.ActionStyle.Destructive,
                  },
                });

                if (!confirmed) {
                  return;
                }

                await runMutation("Deleting pod", async () => {
                  await runKubectl(["delete", "pod", podName], { context, namespace });
                });
              }}
            />
          </ActionPanel.Section>
        </ActionPanel>
      }
    />
  );
}

function TailLogsForm({
  context,
  namespace,
  podName,
  containers,
}: {
  context: string;
  namespace: string;
  podName: string;
  containers: string[];
}) {
  const { push } = useNavigation();
  const prefs = useMemo(() => getResolvedPreferences(), []);
  const containerOptions = containers.length > 0 ? containers : [""];
  const { handleSubmit, itemProps } = useForm<TailLogsValues>({
    initialValues: {
      container: containerOptions[0] ?? "",
      follow: true,
      tailLines: "200",
      openInTerminal: true,
    },
    validation: {
      tailLines: FormValidation.Required,
    },
    onSubmit: async (values) => {
      const tailLines = Math.max(1, Number.parseInt(values.tailLines, 10) || 200);
      const selectedContainer = values.container || undefined;

      if (values.openInTerminal) {
        await openPodLogsInTerminal({
          context,
          namespace,
          podName,
          container: selectedContainer,
          follow: values.follow,
          tailLines,
        });
        await showToast({
          style: Toast.Style.Success,
          title: "Opened logs in terminal",
          message: prefs.terminalApp === "iterm" ? "iTerm" : prefs.terminalApp === "terminal" ? "Terminal.app" : "System default terminal",
        });
        return;
      }

      push(
        <PodLogsDetail
          context={context}
          namespace={namespace}
          podName={podName}
          container={selectedContainer}
          follow={values.follow}
          tailLines={tailLines}
        />,
      );
    },
  });

  return (
    <Form
      navigationTitle={podpilotTitle("Tail Logs")}
      actions={
        <ActionPanel>
          <Action.SubmitForm title="Open Logs" onSubmit={handleSubmit} />
        </ActionPanel>
      }
    >
      <Form.Dropdown title="Container" {...itemProps.container}>
        {containerOptions.map((container) => (
          <Form.Dropdown.Item key={container || "default"} value={container} title={container || "Default Container"} />
        ))}
      </Form.Dropdown>
      <Form.TextField title="Tail Lines" {...itemProps.tailLines} />
      <Form.Checkbox title="Follow" label="Stream live logs" {...itemProps.follow} />
      <Form.Checkbox title="Open in Terminal" label="Recommended for live streaming" {...itemProps.openInTerminal} />
    </Form>
  );
}

function CopyLogsForm({
  context,
  namespace,
  podName,
  containers,
}: {
  context: string;
  namespace: string;
  podName: string;
  containers: string[];
}) {
  const { pop } = useNavigation();
  const containerOptions = containers.length > 0 ? containers : [""];
  const { handleSubmit, itemProps } = useForm<CopyLogsValues>({
    initialValues: {
      container: containerOptions[0] ?? "",
      tailLines: "200",
    },
    validation: {
      tailLines: FormValidation.Required,
    },
    onSubmit: async (values) => {
      const lines = Math.max(1, Number.parseInt(values.tailLines, 10) || 200);
      const args = ["logs", podName, "--tail", `${lines}`];
      if (values.container) {
        args.push("-c", values.container);
      }

      const toast = await showToast({ style: Toast.Style.Animated, title: "Copying logs" });
      try {
        const result = await runKubectl(args, { context, namespace });
        await Clipboard.copy(result.stdout);
        toast.style = Toast.Style.Success;
        toast.title = "Logs copied";
        toast.message = `${lines} lines from ${podName}`;
        pop();
      } catch (error) {
        toast.style = Toast.Style.Failure;
        toast.title = "Failed to copy logs";
        toast.message = error instanceof Error ? error.message : String(error);
      }
    },
  });

  return (
    <Form
      navigationTitle={podpilotTitle("Copy Logs")}
      actions={
        <ActionPanel>
          <Action.SubmitForm title="Copy" onSubmit={handleSubmit} />
        </ActionPanel>
      }
    >
      <Form.Dropdown title="Container" {...itemProps.container}>
        {containerOptions.map((container) => (
          <Form.Dropdown.Item key={container || "default"} value={container} title={container || "Default Container"} />
        ))}
      </Form.Dropdown>
      <Form.TextField title="Tail Lines" {...itemProps.tailLines} />
    </Form>
  );
}

function ExecShellForm({
  context,
  namespace,
  podName,
  containers,
}: {
  context: string;
  namespace: string;
  podName: string;
  containers: string[];
}) {
  const { pop } = useNavigation();
  const prefs = useMemo(() => getResolvedPreferences(), []);
  const containerOptions = containers.length > 0 ? containers : [""];
  const { handleSubmit, itemProps } = useForm<ExecShellValues>({
    initialValues: {
      container: containerOptions[0] ?? "",
      shell: prefs.execShell,
    },
    validation: {
      shell: FormValidation.Required,
    },
    onSubmit: async (values) => {
      const preferredShell = values.shell.trim() || "/bin/sh";
      const fallbackShell = preferredShell === "/bin/sh" ? "/bin/bash" : "/bin/sh";

      const baseArgs = ["--context", context, "-n", namespace, "exec", "-it", podName];
      if (values.container) {
        baseArgs.push("-c", values.container);
      }

      const preferredCommand = formatCommand(prefs.kubectlPath, [...baseArgs, "--", preferredShell]);
      const fallbackCommand = formatCommand(prefs.kubectlPath, [...baseArgs, "--", fallbackShell]);
      const commandPath = buildCommandPath(process.env.PATH, prefs.kubectlPath, prefs.awsPath);

      const script = `export PATH=${shellQuote(commandPath)}\n${preferredCommand} || ${fallbackCommand}`;
      await openCommandInTerminal(script, prefs.terminalApp);
      await showToast({ style: Toast.Style.Success, title: "Opened terminal" });
      pop();
    },
  });

  return (
    <Form
      navigationTitle={podpilotTitle("Exec Shell")}
      actions={
        <ActionPanel>
          <Action.SubmitForm title="Open Terminal" onSubmit={handleSubmit} />
        </ActionPanel>
      }
    >
      <Form.Dropdown title="Container" {...itemProps.container}>
        {containerOptions.map((container) => (
          <Form.Dropdown.Item key={container || "default"} value={container} title={container || "Default Container"} />
        ))}
      </Form.Dropdown>
      <Form.TextField title="Shell" info="Fallback shell is attempted automatically" {...itemProps.shell} />
    </Form>
  );
}

function PortForwardForm({ context, namespace, podName }: { context: string; namespace: string; podName: string }) {
  const prefs = useMemo(() => getResolvedPreferences(), []);
  const { pop } = useNavigation();
  const { handleSubmit, itemProps } = useForm<PortForwardValues>({
    initialValues: {
      localPort: "8080",
      remotePort: "80",
      openBrowser: true,
      protocol: "http",
    },
    validation: {
      localPort: FormValidation.Required,
      remotePort: FormValidation.Required,
    },
    onSubmit: async (values) => {
      const localPort = Math.max(1, Number.parseInt(values.localPort, 10) || 8080);
      const remotePort = Math.max(1, Number.parseInt(values.remotePort, 10) || 80);

      const commandPath = buildCommandPath(process.env.PATH, prefs.kubectlPath, prefs.awsPath);
      const baseCommand = formatCommand(prefs.kubectlPath, [
        "--context",
        context,
        "-n",
        namespace,
        "port-forward",
        `pod/${podName}`,
        `${localPort}:${remotePort}`,
      ]);

      const scriptLines = [`export PATH=${shellQuote(commandPath)}`];
      if (values.openBrowser && values.protocol !== "none") {
        scriptLines.push(`${baseCommand} &`);
        scriptLines.push("PF_PID=$!");
        scriptLines.push("sleep 2");
        scriptLines.push(`open ${shellQuote(`${values.protocol}://127.0.0.1:${localPort}`)}`);
        scriptLines.push("wait $PF_PID");
      } else {
        scriptLines.push(baseCommand);
      }

      await openCommandInTerminal(scriptLines.join("\n"), prefs.terminalApp);
      await showToast({ style: Toast.Style.Success, title: "Port-forward command opened in terminal" });
      pop();
    },
  });

  return (
    <Form
      navigationTitle={podpilotTitle("Port-Forward")}
      actions={
        <ActionPanel>
          <Action.SubmitForm title="Open Terminal" onSubmit={handleSubmit} />
        </ActionPanel>
      }
    >
      <Form.TextField title="Local Port" {...itemProps.localPort} />
      <Form.TextField title="Remote Port" {...itemProps.remotePort} />
      <Form.Checkbox title="Open Browser" label="Open browser after forward starts" {...itemProps.openBrowser} />
      <Form.Dropdown title="Protocol" {...itemProps.protocol}>
        <Form.Dropdown.Item value="http" title="HTTP" />
        <Form.Dropdown.Item value="https" title="HTTPS" />
        <Form.Dropdown.Item value="none" title="Do Not Open Browser" />
      </Form.Dropdown>
    </Form>
  );
}

export function PodLogsDetail({
  context,
  namespace,
  podName,
  container,
  follow,
  tailLines,
}: {
  context: string;
  namespace: string;
  podName: string;
  container?: string;
  follow: boolean;
  tailLines: number;
}) {
  const [refreshToken, setRefreshToken] = useState(0);
  const [logLines, setLogLines] = useState<LogLine[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<unknown>();
  const logLinesRef = useRef<LogLine[]>([]);
  const lineCounterRef = useRef<number>(0);
  const remaindersRef = useRef<Record<LogStreamSource, string>>({ stdout: "", stderr: "" });
  const logsArgs = useMemo(
    () =>
      buildPodLogsArgs(podName, tailLines, {
        container,
        follow,
      }),
    [container, follow, podName, tailLines],
  );
  const command = useMemo(
    () =>
      getKubectlCommandString(logsArgs, {
        context,
        namespace,
      }),
    [context, logsArgs, namespace],
  );

  const appendLines = useCallback((incomingLines: string[]) => {
    if (incomingLines.length === 0) {
      return;
    }

    const nextLines = incomingLines.map((raw) => {
      lineCounterRef.current += 1;
      return {
        id: `${lineCounterRef.current}`,
        raw,
        timestamp: logTimestampFormatter.format(new Date()),
      };
    });

    // Keep terminal order stable: oldest -> newest.
    const merged = [...logLinesRef.current, ...nextLines];
    const trimmed = merged.length > MAX_LOG_BUFFER_LINES ? merged.slice(-MAX_LOG_BUFFER_LINES) : merged;
    logLinesRef.current = trimmed;
    setLogLines(trimmed);
  }, []);

  const appendChunk = useCallback(
    (chunk: string, source: LogStreamSource) => {
      const { completeLines, remainder } = splitLogChunk(chunk, remaindersRef.current[source]);
      remaindersRef.current[source] = remainder;
      appendLines(completeLines);
      setIsLoading(false);
    },
    [appendLines],
  );

  const flushRemainders = useCallback(() => {
    const pending: Array<{ source: LogStreamSource; text: string }> = [];

    (["stdout", "stderr"] as const).forEach((source) => {
      const text = remaindersRef.current[source];
      if (text) {
        pending.push({ source, text });
      }
      remaindersRef.current[source] = "";
    });

    pending.forEach(({ text }) => appendLines([text]));
  }, [appendLines]);

  useEffect(() => {
    setIsLoading(true);
    setError(undefined);
    setLogLines([]);
    logLinesRef.current = [];
    lineCounterRef.current = 0;
    remaindersRef.current = { stdout: "", stderr: "" };

    const controller = new AbortController();
    const child = spawnKubectl(logsArgs, {
      context,
      namespace,
      signal: controller.signal,
      timeoutMs: follow ? undefined : 60_000,
    });

    child.stdout?.on("data", (chunk: Buffer | string) => {
      appendChunk(chunk.toString(), "stdout");
    });

    child.stderr?.on("data", (chunk: Buffer | string) => {
      appendChunk(chunk.toString(), "stderr");
    });

    child
      .then((result) => {
        flushRemainders();
        if (result.exitCode !== 0) {
          setError(
            new KubectlCommandError("kubectl logs failed", {
              command,
              stderr: result.stderr,
              stdout: result.stdout,
              exitCode: result.exitCode,
            }),
          );
        }
        setIsLoading(false);
      })
      .catch((streamError) => {
        if (controller.signal.aborted) {
          return;
        }
        flushRemainders();
        setError(streamError);
        setIsLoading(false);
      });

    return () => {
      controller.abort();
      child.kill("SIGTERM");
    };
  }, [appendChunk, context, flushRemainders, logsArgs, namespace, refreshToken]);

  const openInTerminal = useCallback(async () => {
    try {
      await openPodLogsInTerminal({
        context,
        namespace,
        podName,
        container,
        follow,
        tailLines,
      });
      await showToast({ style: Toast.Style.Success, title: "Opened logs in terminal" });
    } catch (terminalError) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Failed to open terminal",
        message: terminalError instanceof Error ? terminalError.message : String(terminalError),
      });
    }
  }, [container, context, follow, namespace, podName, tailLines]);

  const refreshTitle = follow ? "Restart Stream" : "Refresh Logs";
  const errorLogs = useMemo(() => {
    if (!error) {
      return "";
    }
    const normalized = normalizeError(error);
    return `${normalized.stdout ?? ""}${normalized.stderr ?? ""}`.trim();
  }, [error]);
  const effectiveLogs = useMemo(
    () => (logLines.length > 0 ? logLines.map((line) => line.raw).join("\n") : errorLogs),
    [errorLogs, logLines],
  );
  const markdown = useMemo(() => {
    if (logLines.length > 0) {
      const stream = logLines
        .map((line) => `${line.timestamp} ${ansiColorBadge(line.raw)} ${stripAnsiControlCodes(line.raw || " ")}`)
        .join("\n");
      return `\`\`\`text\n${stream}\n\`\`\``;
    }

    if (errorLogs) {
      const stream = errorLogs
        .split("\n")
        .map((line) => `${ansiColorBadge(line)} ${stripAnsiControlCodes(line)}`)
        .join("\n");
      return `\`\`\`text\n${stream}\n\`\`\``;
    }

    return `\`\`\`text\n${isLoading ? "Waiting for logs..." : "(no logs received)"}\n\`\`\``;
  }, [errorLogs, isLoading, logLines]);

  return (
    <Detail
      markdown={markdown}
      isLoading={isLoading}
      navigationTitle={podpilotTitle(`Logs: ${podName}${container ? ` (${container})` : ""}`)}
      actions={
        <ActionPanel>
          <Action
            title={refreshTitle}
            icon={tintedIcon(Icon.ArrowClockwise, BRAND_COLORS.sky)}
            onAction={() => setRefreshToken((value) => value + 1)}
          />
          <Action title="Open in Terminal" icon={tintedIcon(Icon.Terminal, BRAND_COLORS.orange)} onAction={openInTerminal} />
          <Action.CopyToClipboard title="Copy kubectl Command" content={command} />
          <Action.CopyToClipboard title="Copy Logs" content={effectiveLogs} />
        </ActionPanel>
      }
    />
  );
}
