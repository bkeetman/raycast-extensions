import { Action, ActionPanel, Icon, List } from "@raycast/api";
import { useEffect, useState } from "react";
import { ErrorDetail } from "./components/ErrorDetail";
import { PodDetailView, PodLogsDetail } from "./components/PodDetailView";
import { SelectContextList, SelectNamespaceList } from "./components/Selectors";
import { TargetPickerForm } from "./components/TargetPickerForm";
import { clearResourceCache, getPods } from "./lib/kube-data";
import { podReadyStatus, podStatus } from "./lib/k8s-display";
import { formatNamespaceLabel, isAllNamespaces, resolveItemNamespace } from "./lib/namespace";
import { formatAge } from "./lib/time";
import { useContextNamespace } from "./lib/use-context-namespace";
import { Pod } from "./types";

export default function PodActionsCommand() {
  const contextState = useContextNamespace();
  const [pods, setPods] = useState<Pod[]>([]);
  const [isLoadingPods, setIsLoadingPods] = useState<boolean>(true);
  const [error, setError] = useState<unknown>();
  const [refreshToken, setRefreshToken] = useState<number>(0);

  useEffect(() => {
    const namespaceReady =
      Boolean(contextState.selectedNamespace) &&
      (isAllNamespaces(contextState.selectedNamespace) || contextState.namespaces.includes(contextState.selectedNamespace));

    if (!contextState.selectedContext || !namespaceReady) {
      setPods([]);
      setIsLoadingPods(false);
      setError(undefined);
      return;
    }

    const controller = new AbortController();
    setIsLoadingPods(true);
    setPods([]);
    setError(undefined);

    getPods(contextState.selectedContext, contextState.selectedNamespace, {
      forceRefresh: refreshToken > 0,
      signal: controller.signal,
    })
      .then((items) => {
        if (controller.signal.aborted) {
          return;
        }
        setPods(items);
        setIsLoadingPods(false);
      })
      .catch((podError: unknown) => {
        if (controller.signal.aborted) {
          return;
        }
        setError(podError);
        setIsLoadingPods(false);
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
    return <ErrorDetail title="Failed to load pods" error={error} />;
  }

  return (
    <List
      isLoading={contextState.isLoadingContexts || contextState.isLoadingNamespaces || isLoadingPods}
      navigationTitle="Pod Actions"
      searchBarPlaceholder="Search pods"
    >
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

      <List.Section title={`Pods (${pods.length})`}>
        {pods.map((pod) => (
          <List.Item
            key={`${pod.metadata.namespace ?? "default"}/${pod.metadata.name}`}
            title={pod.metadata.name}
            subtitle={podStatus(pod)}
            accessories={[
              { tag: podReadyStatus(pod) },
              ...(isAllNamespaces(contextState.selectedNamespace) ? [{ text: pod.metadata.namespace ?? "default" }] : []),
              { text: pod.spec?.nodeName ?? "-" },
              { text: formatAge(pod.metadata.creationTimestamp) },
            ]}
            actions={
              <ActionPanel>
                <Action.Push
                  title="Tail Logs (Live)"
                  icon={Icon.Terminal}
                  target={
                    <PodLogsDetail
                      context={contextState.selectedContext}
                      namespace={resolveItemNamespace(contextState.selectedNamespace, pod.metadata.namespace)}
                      podName={pod.metadata.name}
                      follow
                      tailLines={200}
                    />
                  }
                />
                <Action.Push
                  title="Open Pod Actions"
                  target={
                    <PodDetailView
                      context={contextState.selectedContext}
                      namespace={resolveItemNamespace(contextState.selectedNamespace, pod.metadata.namespace)}
                      pod={pod}
                      onMutated={refreshData}
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
