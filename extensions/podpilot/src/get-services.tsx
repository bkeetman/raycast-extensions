import { Action, Icon } from "@raycast/api";
import { CommandOutputDetail } from "./components/CommandOutputDetail";
import { BRAND_COLORS, podpilotHeader, tintedIcon } from "./lib/brand";
import { ResourceCommandList } from "./components/ResourceCommandList";
import { getServices } from "./lib/kube-data";
import { serviceSummary } from "./lib/k8s-display";
import { runKubectl } from "./lib/kubectl";
import { resolveItemNamespace } from "./lib/namespace";
import { Service } from "./types";

export default function GetServicesCommand() {
  return (
    <ResourceCommandList<Service>
      navigationTitle="Services"
      resourceLabel="Services"
      loadErrorTitle="Failed to load services"
      loadResources={getServices}
      getItemTitle={(service) => service.metadata.name}
      getItemSubtitle={(service) => serviceSummary(service)}
      renderItemActions={({ item, context, selectedNamespace }) => {
        const effectiveNamespace = resolveItemNamespace(selectedNamespace, item.metadata.namespace);
        return (
          <Action.Push
            title="Show YAML"
            icon={tintedIcon(Icon.Document, BRAND_COLORS.sky)}
            target={
              <CommandOutputDetail
                title={`Service YAML: ${item.metadata.name}`}
                subtitle={`${context}/${effectiveNamespace}`}
                run={async (signal) => {
                  const result = await runKubectl(["get", "service", item.metadata.name, "-o", "yaml"], {
                    context,
                    namespace: effectiveNamespace,
                    signal,
                  });
                  return {
                    markdown: `${podpilotHeader("Service YAML", `${context}/${effectiveNamespace}`)}\`\`\`yaml\n${
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
