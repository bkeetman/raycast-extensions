import {
  Action,
  ActionPanel,
  Alert,
  Clipboard,
  Detail,
  Form,
  Icon,
  Toast,
  confirmAlert,
  showToast,
  useNavigation,
} from "@raycast/api";
import { FormValidation, useForm } from "@raycast/utils";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { clearResourceCache } from "../lib/kube-data";
import { formatErrorMarkdown } from "../lib/error-markdown";
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

export function PodDetailView({ context, namespace, pod, onMutated }: PodDetailViewProps) {
  const podName = pod.metadata.name;
  const containers = pod.spec?.containers?.map((container) => container.name) ?? [];
  const ready = pod.status?.containerStatuses?.filter((status) => status.ready).length ?? 0;
  const total = pod.status?.containerStatuses?.length ?? 0;
  const status = pod.status?.phase ?? "Unknown";
  const node = pod.spec?.nodeName ?? "-";

  const markdown = `# ${podName}

- **Context:** ${context}
- **Namespace:** ${namespace}
- **Status:** ${status}
- **Ready:** ${ready}/${total}
- **Node:** ${node}
- **Age:** ${formatAge(pod.metadata.creationTimestamp)}
- **Created:** ${formatTimestamp(pod.metadata.creationTimestamp)}
- **Containers:** ${(containers.length > 0 ? containers.join(", ") : "-")}
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
      navigationTitle={podName}
      markdown={markdown}
      actions={
        <ActionPanel>
          <ActionPanel.Section title="Logs">
            <Action.Push
              title="Tail Logs"
              icon={Icon.Terminal}
              target={<TailLogsForm context={context} namespace={namespace} podName={podName} containers={containers} />}
            />
            <Action.Push
              title="Copy Logs"
              icon={Icon.Clipboard}
              target={<CopyLogsForm context={context} namespace={namespace} podName={podName} containers={containers} />}
            />
          </ActionPanel.Section>

          <ActionPanel.Section title="Pod Access">
            <Action.Push
              title="Exec Shell in Terminal"
              icon={Icon.Window}
              target={<ExecShellForm context={context} namespace={namespace} podName={podName} containers={containers} />}
            />
            <Action.Push
              title="Port-Forward"
              icon={Icon.Link}
              target={<PortForwardForm context={context} namespace={namespace} podName={podName} />}
            />
          </ActionPanel.Section>

          <ActionPanel.Section title="Mutations">
            <Action
              title="Restart Pod (Delete)"
              icon={Icon.Trash}
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
  const containerOptions = containers.length > 0 ? containers : [""];
  const { handleSubmit, itemProps } = useForm<TailLogsValues>({
    initialValues: {
      container: containerOptions[0] ?? "",
      follow: true,
      tailLines: "200",
    },
    validation: {
      tailLines: FormValidation.Required,
    },
    onSubmit: async (values) => {
      const tailLines = Math.max(1, Number.parseInt(values.tailLines, 10) || 200);
      push(
        <PodLogsDetail
          context={context}
          namespace={namespace}
          podName={podName}
          container={values.container || undefined}
          follow={values.follow}
          tailLines={tailLines}
        />,
      );
    },
  });

  return (
    <Form
      navigationTitle="Tail Logs"
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
      navigationTitle="Copy Logs"
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
      navigationTitle="Exec Shell"
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

function PortForwardForm({
  context,
  namespace,
  podName,
}: {
  context: string;
  namespace: string;
  podName: string;
}) {
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
      navigationTitle="Port-Forward"
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
  const [content, setContent] = useState<string>("");
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<unknown>();
  const contentRef = useRef<string>("");

  const append = useCallback((chunk: string) => {
    const next = `${contentRef.current}${chunk}`;
    const trimmed = next.length > 200_000 ? next.slice(next.length - 200_000) : next;
    contentRef.current = trimmed;
    setContent(trimmed);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const args = ["logs", podName, "--tail", `${tailLines}`];

    if (container) {
      args.push("-c", container);
    }

    if (follow) {
      args.push("-f");
    }

    const command = getKubectlCommandString(args, { context, namespace });
    const child = spawnKubectl(args, {
      context,
      namespace,
      signal: controller.signal,
      timeoutMs: follow ? undefined : 60_000,
    });

    child.stdout?.on("data", (chunk: Buffer | string) => {
      append(chunk.toString());
      setIsLoading(false);
    });

    child.stderr?.on("data", (chunk: Buffer | string) => {
      append(`\n[stderr] ${chunk.toString()}`);
      setIsLoading(false);
    });

    child
      .then((result) => {
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
        setError(streamError);
        setIsLoading(false);
      });

    return () => {
      controller.abort();
      child.kill("SIGTERM");
    };
  }, [append, container, context, follow, namespace, podName, tailLines]);

  if (error) {
    return <Detail markdown={formatErrorMarkdown(`Logs for ${podName}`, error)} />;
  }

  const heading = `# Logs: ${podName}${container ? ` (${container})` : ""}`;
  const modeLine = follow ? "\n\nStreaming mode enabled." : "\n\nOne-time log snapshot.";
  const markdown = `${heading}${modeLine}\n\n\`\`\`\n${content || "Waiting for logs..."}\n\`\`\``;

  return (
    <Detail
      markdown={markdown}
      isLoading={isLoading}
      navigationTitle={`Logs: ${podName}`}
      actions={
        <ActionPanel>
          <Action.CopyToClipboard title="Copy Logs" content={content} />
        </ActionPanel>
      }
    />
  );
}
