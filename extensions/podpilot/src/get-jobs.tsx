import { Action, Icon } from "@raycast/api";
import { CommandOutputDetail } from "./components/CommandOutputDetail";
import { BRAND_COLORS, podpilotHeader, tintedIcon } from "./lib/brand";
import { ResourceCommandList } from "./components/ResourceCommandList";
import { getJobs } from "./lib/kube-data";
import { jobSummary } from "./lib/k8s-display";
import { runKubectl } from "./lib/kubectl";
import { resolveItemNamespace } from "./lib/namespace";
import { Job } from "./types";

export default function GetJobsCommand() {
  return (
    <ResourceCommandList<Job>
      navigationTitle="Jobs"
      resourceLabel="Jobs"
      loadErrorTitle="Failed to load jobs"
      loadResources={getJobs}
      getItemTitle={(job) => job.metadata.name}
      getItemSubtitle={(job) => jobSummary(job)}
      renderItemActions={({ item, context, selectedNamespace }) => {
        const effectiveNamespace = resolveItemNamespace(selectedNamespace, item.metadata.namespace);
        return (
          <Action.Push
            title="Describe Job"
            icon={tintedIcon(Icon.Document, BRAND_COLORS.sky)}
            target={
              <CommandOutputDetail
                title={`Job Details: ${item.metadata.name}`}
                subtitle={`${context}/${effectiveNamespace}`}
                run={async (signal) => {
                  const result = await runKubectl(["describe", "job", item.metadata.name], {
                    context,
                    namespace: effectiveNamespace,
                    signal,
                  });
                  return {
                    markdown: `${podpilotHeader("Job Describe", `${context}/${effectiveNamespace}`)}\`\`\`\n${
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
