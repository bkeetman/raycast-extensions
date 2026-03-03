import { Action, ActionPanel, Icon, List } from "@raycast/api";
import { useEffect, useState } from "react";
import { CommandOutputDetail } from "./components/CommandOutputDetail";
import { ErrorDetail } from "./components/ErrorDetail";
import { SelectContextList, SelectNamespaceList } from "./components/Selectors";
import { TargetPickerForm } from "./components/TargetPickerForm";
import { clearResourceCache, getServices } from "./lib/kube-data";
import { serviceSummary } from "./lib/k8s-display";
import { runKubectl } from "./lib/kubectl";
import { formatNamespaceLabel, isAllNamespaces, resolveItemNamespace } from "./lib/namespace";
import { useContextNamespace } from "./lib/use-context-namespace";
import { Service } from "./types";

export default function GetServicesCommand() {
  const contextState = useContextNamespace();
  const [services, setServices] = useState<Service[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<unknown>();
  const [refreshToken, setRefreshToken] = useState<number>(0);

  useEffect(() => {
    const namespaceReady =
      Boolean(contextState.selectedNamespace) &&
      (isAllNamespaces(contextState.selectedNamespace) || contextState.namespaces.includes(contextState.selectedNamespace));

    if (!contextState.selectedContext || !namespaceReady) {
      setServices([]);
      setIsLoading(false);
      setError(undefined);
      return;
    }

    const controller = new AbortController();
    setIsLoading(true);
    setServices([]);
    setError(undefined);

    getServices(contextState.selectedContext, contextState.selectedNamespace, {
      forceRefresh: refreshToken > 0,
      signal: controller.signal,
    })
      .then((items) => {
        if (controller.signal.aborted) {
          return;
        }

        setServices(items);
        setIsLoading(false);
      })
      .catch((loadError: unknown) => {
        if (controller.signal.aborted) {
          return;
        }

        setError(loadError);
        setIsLoading(false);
      });

    return () => {
      controller.abort();
    };
  }, [contextState.selectedContext, contextState.selectedNamespace, contextState.namespaces, refreshToken]);

  const refreshData = async () => {
    if (contextState.selectedContext && contextState.selectedNamespace) {
      clearResourceCache(contextState.selectedContext, contextState.selectedNamespace);
    }

    await contextState.refresh();
    setRefreshToken((value) => value + 1);
  };

  if (contextState.error) {
    return <ErrorDetail title="Failed to load contexts or namespaces" error={contextState.error} />;
  }

  if (error) {
    return <ErrorDetail title="Failed to load services" error={error} />;
  }

  return (
    <List isLoading={contextState.isLoadingContexts || contextState.isLoadingNamespaces || isLoading} navigationTitle="Get Services">
      <List.Section title="Target">
        <List.Item
          title={contextState.selectedContext || "No context"}
          subtitle={formatNamespaceLabel(contextState.selectedNamespace)}
          icon={Icon.Globe}
          accessories={[{ text: "Context / Namespace" }]}
          actions={
            <ActionPanel>
              <Action.Push
                title="Change Target (Context + Namespace)"
                icon={Icon.BullsEye}
                target={
                  <TargetPickerForm
                    contexts={contextState.contexts}
                    initialContext={contextState.selectedContext}
                    initialNamespace={contextState.selectedNamespace}
                    onApply={(context, namespace) => {
                      contextState.setSelectedContext(context);
                      contextState.setSelectedNamespace(namespace);
                    }}
                    includeAllNamespaces
                  />
                }
              />
              <Action.Push
                title="Switch Context"
                target={
                  <SelectContextList
                    contexts={contextState.contexts}
                    selectedContext={contextState.selectedContext}
                    favoriteContexts={contextState.favoriteContexts}
                    onSelect={contextState.setSelectedContext}
                    onToggleFavorite={contextState.toggleContextFavorite}
                  />
                }
              />
              <Action.Push
                title="Switch Namespace"
                target={
                  <SelectNamespaceList
                    namespaces={contextState.namespaces}
                    selectedNamespace={contextState.selectedNamespace}
                    favoriteNamespaces={contextState.favoriteNamespaces}
                    onSelect={contextState.setSelectedNamespace}
                    onToggleFavorite={contextState.toggleNamespaceFavorite}
                    includeAllOption
                  />
                }
              />
              <Action title="Refresh" icon={Icon.ArrowClockwise} onAction={refreshData} />
            </ActionPanel>
          }
        />
      </List.Section>

      <List.Section title={`Services (${services.length})`}>
        {services.map((service) => (
          <List.Item
            key={`${service.metadata.namespace ?? "default"}/${service.metadata.name}`}
            title={service.metadata.name}
            subtitle={serviceSummary(service)}
            accessories={isAllNamespaces(contextState.selectedNamespace) ? [{ text: service.metadata.namespace ?? "default" }] : []}
            actions={
              <ActionPanel>
                <Action.Push
                  title="Show YAML"
                  icon={Icon.Document}
                  target={
                    <CommandOutputDetail
                      title={`Service YAML: ${service.metadata.name}`}
                      subtitle={`${contextState.selectedContext}/${resolveItemNamespace(
                        contextState.selectedNamespace,
                        service.metadata.namespace,
                      )}`}
                      run={async (signal) => {
                        const effectiveNamespace = resolveItemNamespace(contextState.selectedNamespace, service.metadata.namespace);
                        const result = await runKubectl(["get", "service", service.metadata.name, "-o", "yaml"], {
                          context: contextState.selectedContext,
                          namespace: effectiveNamespace,
                          signal,
                        });
                        return {
                          markdown: `# Service YAML\n\n\`\`\`yaml\n${result.stdout || "(no output)"}\n\`\`\``,
                          raw: result.stdout,
                        };
                      }}
                    />
                  }
                />
                <Action title="Refresh" icon={Icon.ArrowClockwise} onAction={refreshData} />
              </ActionPanel>
            }
          />
        ))}
      </List.Section>
    </List>
  );
}
