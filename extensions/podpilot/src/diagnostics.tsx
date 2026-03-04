import { Action, ActionPanel, Detail } from "@raycast/api";
import { useEffect, useMemo, useState } from "react";
import { podpilotHeader, podpilotTitle } from "./lib/brand";
import { formatErrorMarkdown } from "./lib/error-markdown";
import { getResolvedPreferences } from "./lib/preferences";
import { resolveBinaryPath, runBinaryVersion, runKubectl } from "./lib/kubectl";

export default function DiagnosticsCommand() {
  const prefs = useMemo(() => getResolvedPreferences(), []);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [markdown, setMarkdown] = useState<string>(`${podpilotHeader("Diagnostics")}\nLoading...`);
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

      let namespaceCheck = "failed";
      let namespaceCheckDetails = "";
      try {
        const namespaceResult = await runKubectl(["get", "ns", "-o", "json"], { signal: controller.signal });
        namespaceCheck = "success";
        namespaceCheckDetails = `\nOutput snippet:\n\`\`\`json\n${namespaceResult.stdout.slice(0, 2_000)}\n\`\`\``;
      } catch (error) {
        namespaceCheckDetails = `\n${formatErrorMarkdown("kubectl get ns failed", error)}`;
      }

      const currentContextBlock = contextError
        ? `Failed to resolve current context.\n\n${formatErrorMarkdown("Current context failed", contextError)}`
        : `\`${currentContext}\``;

      const output = `${podpilotHeader("Diagnostics", "Environment and cluster connectivity")}
## Paths

- **Configured kubectl:** \`${prefs.kubectlPath}\`
- **Detected kubectl:** \`${kubectlResolved}\`
- **Configured aws:** \`${prefs.awsPath}\`
- **Detected aws:** \`${awsResolved}\`

## Versions

- **kubectl:** ${kubectlVersion.ok ? "OK" : "FAIL"}
\`\`\`
${kubectlVersion.output || "(no output)"}
\`\`\`

- **aws:** ${awsVersion.ok ? "OK" : "FAIL"}
\`\`\`
${awsVersion.output || "(no output)"}
\`\`\`

## Cluster Access

### Current Context
${currentContextBlock}

### kubectl get ns
**${namespaceCheck.toUpperCase()}**
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
