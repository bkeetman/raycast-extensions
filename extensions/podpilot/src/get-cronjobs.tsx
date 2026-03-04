import { Action, Icon } from "@raycast/api";
import { CommandOutputDetail } from "./components/CommandOutputDetail";
import { BRAND_COLORS, podpilotHeader, tintedIcon } from "./lib/brand";
import { ResourceCommandList } from "./components/ResourceCommandList";
import { getCronJobs } from "./lib/kube-data";
import { cronJobSummary } from "./lib/k8s-display";
import { runKubectl } from "./lib/kubectl";
import { resolveItemNamespace } from "./lib/namespace";
import { CronJob } from "./types";

export default function GetCronJobsCommand() {
  return (
    <ResourceCommandList<CronJob>
      navigationTitle="CronJobs"
      resourceLabel="CronJobs"
      loadErrorTitle="Failed to load cronjobs"
      loadResources={getCronJobs}
      getItemTitle={(cronJob) => cronJob.metadata.name}
      getItemSubtitle={(cronJob) => cronJobSummary(cronJob)}
      renderItemActions={({ item, context, selectedNamespace }) => {
        const effectiveNamespace = resolveItemNamespace(selectedNamespace, item.metadata.namespace);
        return (
          <Action.Push
            title="Show YAML"
            icon={tintedIcon(Icon.Document, BRAND_COLORS.sky)}
            target={
              <CommandOutputDetail
                title={`CronJob YAML: ${item.metadata.name}`}
                subtitle={`${context}/${effectiveNamespace}`}
                run={async (signal) => {
                  const result = await runKubectl(["get", "cronjob", item.metadata.name, "-o", "yaml"], {
                    context,
                    namespace: effectiveNamespace,
                    signal,
                  });
                  return {
                    markdown: `${podpilotHeader("CronJob YAML", `${context}/${effectiveNamespace}`)}\`\`\`yaml\n${
                      result.stdout || "(no output)"
                    }\n\`\`\``,
                    raw: result.stdout,
                  };
                }}
              />
            }
          />
        );
      }}
    />
  );
}
