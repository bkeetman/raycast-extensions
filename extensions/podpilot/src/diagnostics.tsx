import { Action, ActionPanel, Detail } from "@raycast/api";
import { useEffect, useMemo, useState } from "react";
import {
  PODPILOT_ACTIVE_THEME,
  PODPILOT_FALLBACK_THEME,
  PODPILOT_THEMES,
  podpilotHeader,
  podpilotStatus,
  podpilotTitle,
  podpilotTwoColumnTable,
} from "./lib/brand";
import { formatErrorMarkdown, normalizeError } from "./lib/error-markdown";
import { getResolvedPreferences } from "./lib/preferences";
import { resolveBinaryPath, runBinaryVersion, runKubectl } from "./lib/kubectl";

export default function DiagnosticsCommand() {
  const prefs = useMemo(() => getResolvedPreferences(), []);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [markdown, setMarkdown] = useState<string>(`${podpilotHeader("Diagnostics")}\nCalibrating mission telemetry...`);
  const [refreshToken, setRefreshToken] = useState<number>(0);

  useEffect(() => {
    const controller = new AbortController();
    setIsLoading(true);

    async function run() {
      const kubectlResolved = await resolveBinaryPath(prefs.kubectlPath);
      const awsResolved = await resolveBinaryPath(prefs.awsPath);

      const [kubectlVersion, awsVersion] = await Promise.all([
        runBinaryVersion(prefs.kubectlPath, ["version", "--client"]),
        runBinaryVersion(prefs.awsPath, ["--version"]),
      ]);

      let currentContext = "(unavailable)";
      let contextError: unknown;
      try {
        const contextResult = await runKubectl(["config", "current-context"], { signal: controller.signal });
        currentContext = contextResult.stdout.trim() || "(empty)";
      } catch (error) {
        contextError = error;
      }

      let namespaceCheckOk = false;
      let namespaceCheckDetails = "";
      try {
        const namespaceResult = await runKubectl(["get", "ns", "-o", "json"], { signal: controller.signal });
        namespaceCheckOk = true;
        namespaceCheckDetails = `\`\`\`json\n${namespaceResult.stdout.slice(0, 2_000)}\n\`\`\``;
      } catch (error) {
        const normalized = normalizeError(error);
        namespaceCheckDetails = `${normalized.message}

\`\`\`bash
${normalized.command}
\`\`\`

\`\`\`text
${normalized.stderr?.trim() || "(empty)"}
\`\`\``;
      }

      const currentContextBlock = contextError
        ? (() => {
            const normalized = normalizeError(contextError);
            return `Failed to resolve current context.

\`\`\`bash
${normalized.command}
\`\`\`

\`\`\`text
${normalized.stderr?.trim() || normalized.message}
\`\`\``;
          })()
        : `\`${currentContext}\``;

      const theme = PODPILOT_THEMES[PODPILOT_ACTIVE_THEME];
      const output = `${podpilotHeader("Diagnostics", "Environment and cluster connectivity")}
${theme.accent} **Theme:** ${theme.label} · fallback \`${PODPILOT_FALLBACK_THEME}\`

## 🛰️ Paths
${podpilotTwoColumnTable(
  [
    ["Configured kubectl", `\`${prefs.kubectlPath}\``],
    ["Detected kubectl", `\`${kubectlResolved}\``],
    ["Configured aws", `\`${prefs.awsPath}\``],
    ["Detected aws", `\`${awsResolved}\``],
  ],
  "Binary",
  "Path",
)}

## 🌌 Health Checks
${podpilotTwoColumnTable(
  [
    ["kubectl --client", podpilotStatus(kubectlVersion.ok, "Ready", "Issue detected")],
    ["aws --version", podpilotStatus(awsVersion.ok, "Ready", "Issue detected")],
    ["kubectl get ns", podpilotStatus(namespaceCheckOk, "Reachable", "Failed")],
  ],
  "Check",
  "Result",
)}

## 🧭 Current Context
${currentContextBlock}

## 📦 kubectl --client
\`\`\`text
${kubectlVersion.output || "(no output)"}
\`\`\`

## ☁️ aws --version
\`\`\`text
${awsVersion.output || "(no output)"}
\`\`\`

## ✨ Namespace Probe
${namespaceCheckDetails}
`;

      if (!controller.signal.aborted) {
        setMarkdown(output);
        setIsLoading(false);
      }
    }

    run().catch((error: unknown) => {
      if (controller.signal.aborted) {
        return;
      }
      setMarkdown(formatErrorMarkdown("Diagnostics failed", error));
      setIsLoading(false);
    });

    return () => {
      controller.abort();
    };
  }, [prefs.awsPath, prefs.kubectlPath, refreshToken]);

  return (
    <Detail
      navigationTitle={podpilotTitle("Diagnostics")}
      markdown={markdown}
      isLoading={isLoading}
      actions={
        <ActionPanel>
          <Action title="Refresh Diagnostics" onAction={() => setRefreshToken((value) => value + 1)} />
          <Action.CopyToClipboard title="Copy Diagnostics" content={markdown} />
        </ActionPanel>
      }
    />
  );
}
