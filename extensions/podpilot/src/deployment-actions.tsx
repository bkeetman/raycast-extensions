import { Action, ActionPanel, Icon, List } from "@raycast/api";
import { useEffect, useRef, useState } from "react";
import { DeploymentWorkspaceView } from "./components/DeploymentWorkspaceView";
import { ErrorDetail } from "./components/ErrorDetail";
import { SelectContextList, SelectNamespaceList } from "./components/Selectors";
import { TargetPickerForm } from "./components/TargetPickerForm";
import { clearResourceCache, getDeployments } from "./lib/kube-data";
import { deploymentPrimaryImage, deploymentReadyStatus } from "./lib/k8s-display";
import { formatNamespaceLabel, isAllNamespaces, resolveItemNamespace } from "./lib/namespace";
import { formatAge } from "./lib/time";
import { useContextNamespace } from "./lib/use-context-namespace";
import { Deployment } from "./types";

export default function DeploymentActionsCommand() {
  const contextState = useContextNamespace();
  const [deployments, setDeployments] = useState<Deployment[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<unknown>();
  const [refreshToken, setRefreshToken] = useState<number>(0);
  const activeTargetKeyRef = useRef<string>("");

  useEffect(() => {
    activeTargetKeyRef.current = `${contextState.selectedContext}::${contextState.selectedNamespace}`;
  }, [contextState.selectedContext, contextState.selectedNamespace]);

  useEffect(() => {
    const namespaceReady =
      Boolean(contextState.selectedNamespace) &&
      (isAllNamespaces(contextState.selectedNamespace) || contextState.namespaces.includes(contextState.selectedNamespace));

    if (!contextState.selectedContext || !namespaceReady) {
      setDeployments([]);
      setIsLoading(false);
      setError(undefined);
      return;
    }

    const controller = new AbortController();
    const requestKey = `${contextState.selectedContext}::${contextState.selectedNamespace}`;
    setIsLoading(true);
    setDeployments([]);
    setError(undefined);

    getDeployments(contextState.selectedContext, contextState.selectedNamespace, {
      forceRefresh: refreshToken > 0,
      signal: controller.signal,
    })
      .then((items) => {
        if (controller.signal.aborted || requestKey !== activeTargetKeyRef.current) {
          return;
        }
        setDeployments(items);
        setIsLoading(false);
      })
      .catch((deploymentError: unknown) => {
        if (controller.signal.aborted || requestKey !== activeTargetKeyRef.current) {
          return;
        }
        setError(deploymentError);
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
    return <ErrorDetail title="Failed to load deployments" error={error} />;
  }

  return (
    <List isLoading={contextState.isLoadingContexts || contextState.isLoadingNamespaces || isLoading} navigationTitle="Deployment Actions">
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

      <List.Section title={`Deployments (${deployments.length})`}>
        {deployments.map((deployment) => (
          <List.Item
            key={`${deployment.metadata.namespace ?? "default"}/${deployment.metadata.name}`}
            title={deployment.metadata.name}
            subtitle={deploymentPrimaryImage(deployment)}
            accessories={[
              { tag: deploymentReadyStatus(deployment) },
              ...(isAllNamespaces(contextState.selectedNamespace) ? [{ text: deployment.metadata.namespace ?? "default" }] : []),
              { text: formatAge(deployment.metadata.creationTimestamp) },
            ]}
            actions={
              <ActionPanel>
                <Action.Push
                  title="Open Deployment Workspace"
                  target={
                    <DeploymentWorkspaceView
                      context={contextState.selectedContext}
                      namespace={resolveItemNamespace(contextState.selectedNamespace, deployment.metadata.namespace)}
                      deployment={deployment}
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
