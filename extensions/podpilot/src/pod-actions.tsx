import { Action, ActionPanel, Icon, List } from "@raycast/api";
import { useEffect, useRef, useState } from "react";
import { ErrorDetail } from "./components/ErrorDetail";
import { PodDetailView, PodLogsDetail } from "./components/PodDetailView";
import { TargetSection } from "./components/TargetSection";
import { BRAND_COLORS, podPhaseColor, podpilotTitle, readyColor, tintedIcon } from "./lib/brand";
import { clearResourceCache, getPods } from "./lib/kube-data";
import { podReadyStatus, podStatus } from "./lib/k8s-display";
import { isAllNamespaces, resolveItemNamespace } from "./lib/namespace";
import { formatAge } from "./lib/time";
import { useContextNamespace } from "./lib/use-context-namespace";
import { Pod } from "./types";

export default function PodActionsCommand() {
  const contextState = useContextNamespace();
  const [pods, setPods] = useState<Pod[]>([]);
  const [isLoadingPods, setIsLoadingPods] = useState<boolean>(true);
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
      setPods([]);
      setIsLoadingPods(false);
      setError(undefined);
      return;
    }

    const controller = new AbortController();
    const requestKey = `${contextState.selectedContext}::${contextState.selectedNamespace}`;
    setIsLoadingPods(true);
    setPods([]);
    setError(undefined);

    getPods(contextState.selectedContext, contextState.selectedNamespace, {
      forceRefresh: refreshToken > 0,
      signal: controller.signal,
    })
      .then((items) => {
        if (controller.signal.aborted || requestKey !== activeTargetKeyRef.current) {
          return;
        }
        setPods(items);
        setIsLoadingPods(false);
      })
      .catch((podError: unknown) => {
        if (controller.signal.aborted || requestKey !== activeTargetKeyRef.current) {
          return;
        }
        setError(podError);
        setIsLoadingPods(false);
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
    return <ErrorDetail title="Failed to load pods" error={error} />;
  }

  return (
    <List
      isLoading={contextState.isLoadingContexts || contextState.isLoadingNamespaces || isLoadingPods}
      navigationTitle={podpilotTitle("Pod Actions")}
      searchBarPlaceholder="Search pods"
    >
      <TargetSection state={contextState} onRefreshResources={refreshResources} onReloadTargets={reloadTargets} />

      <List.Section title={`Pods (${pods.length})`}>
        {pods.map((pod) => {
          const status = podStatus(pod);
          const ready = podReadyStatus(pod);

          return (
            <List.Item
              key={`${pod.metadata.namespace ?? "default"}/${pod.metadata.name}`}
              title={pod.metadata.name}
              subtitle={status}
              icon={tintedIcon(Icon.Circle, podPhaseColor(status))}
              accessories={[
                { tag: { value: ready, color: readyColor(ready) } },
                ...(isAllNamespaces(contextState.selectedNamespace) ? [{ text: pod.metadata.namespace ?? "default" }] : []),
                { text: pod.spec?.nodeName ?? "-" },
                { text: formatAge(pod.metadata.creationTimestamp) },
              ]}
              actions={
                <ActionPanel>
                  <Action.Push
                    title="Tail Logs (Live)"
                    icon={tintedIcon(Icon.Terminal, BRAND_COLORS.orange)}
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
                    icon={tintedIcon(Icon.AppWindow, BRAND_COLORS.blue)}
                    target={
                      <PodDetailView
                        context={contextState.selectedContext}
                        namespace={resolveItemNamespace(contextState.selectedNamespace, pod.metadata.namespace)}
                        pod={pod}
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
