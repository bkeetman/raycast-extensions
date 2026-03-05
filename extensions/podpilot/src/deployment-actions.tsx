import { Action, ActionPanel, Icon, List } from "@raycast/api";
import { useEffect, useRef, useState } from "react";
import { DeploymentWorkspaceView } from "./components/DeploymentWorkspaceView";
import { ErrorDetail } from "./components/ErrorDetail";
import { TargetSection } from "./components/TargetSection";
import { BRAND_COLORS, podpilotTitle, readyColor, tintedIcon } from "./lib/brand";
import { clearResourceCache, getDeployments } from "./lib/kube-data";
import { deploymentPrimaryImage, deploymentReadyStatus } from "./lib/k8s-display";
import { isAllNamespaces, resolveItemNamespace } from "./lib/namespace";
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

  const refreshResources = async () => {
    if (contextState.selectedContext && contextState.selectedNamespace) {
      clearResourceCache(contextState.selectedContext, contextState.selectedNamespace);
    }

    setRefreshToken((value) => value + 1);
  };

  const reloadTargets = async () => {
    await contextState.refresh();
  };

  if (contextState.error) {
    return <ErrorDetail title="Failed to load contexts or namespaces" error={contextState.error} />;
  }

  if (error) {
    return <ErrorDetail title="Failed to load deployments" error={error} />;
  }

  return (
    <List
      isLoading={contextState.isLoadingContexts || contextState.isLoadingNamespaces || isLoading}
      navigationTitle={podpilotTitle("Deployment Actions")}
    >
      <TargetSection state={contextState} onRefreshResources={refreshResources} onReloadTargets={reloadTargets} />

      <List.Section title={`Deployments (${deployments.length})`}>
        {deployments.map((deployment) => {
          const ready = deploymentReadyStatus(deployment);
          return (
            <List.Item
              key={`${deployment.metadata.namespace ?? "default"}/${deployment.metadata.name}`}
              title={deployment.metadata.name}
              subtitle={deploymentPrimaryImage(deployment)}
              icon={tintedIcon(Icon.Gear, BRAND_COLORS.blue)}
              accessories={[
                { tag: { value: ready, color: readyColor(ready) } },
                ...(isAllNamespaces(contextState.selectedNamespace) ? [{ text: deployment.metadata.namespace ?? "default" }] : []),
                { text: formatAge(deployment.metadata.creationTimestamp) },
              ]}
              actions={
                <ActionPanel>
                  <Action.Push
                    title="Open Deployment Workspace"
                    icon={tintedIcon(Icon.AppWindow, BRAND_COLORS.blue)}
                    target={
                      <DeploymentWorkspaceView
                        context={contextState.selectedContext}
                        namespace={resolveItemNamespace(contextState.selectedNamespace, deployment.metadata.namespace)}
                        deployment={deployment}
                        onMutated={refreshResources}
                      />
                    }
                  />
                  <Action title="Refresh Resources" icon={tintedIcon(Icon.ArrowClockwise, BRAND_COLORS.sky)} onAction={refreshResources} />
                </ActionPanel>
              }
            />
          );
        })}
      </List.Section>
    </List>
  );
}
