import { Action, ActionPanel, Icon, List } from "@raycast/api";
import { useEffect, useRef, useState } from "react";
import { BRAND_COLORS, podpilotTitle, tintedIcon } from "../lib/brand";
import { clearResourceCache } from "../lib/kube-data";
import { isAllNamespaces } from "../lib/namespace";
import { useContextNamespace } from "../lib/use-context-namespace";
import { ErrorDetail } from "./ErrorDetail";
import { TargetSection } from "./TargetSection";

interface ResourceQueryOptions {
  forceRefresh: boolean;
  signal?: AbortSignal;
}

interface NamespacedResource {
  metadata: {
    name: string;
    namespace?: string;
  };
}

interface ResourceCommandListProps<T extends NamespacedResource> {
  navigationTitle: string;
  resourceLabel: string;
  loadErrorTitle: string;
  loadResources: (context: string, namespace: string, options: ResourceQueryOptions) => Promise<T[]>;
  getItemTitle: (item: T) => string;
  getItemSubtitle: (item: T) => string;
  renderItemActions: (args: {
    item: T;
    context: string;
    selectedNamespace: string;
    refreshResources: () => Promise<void>;
  }) => ActionPanel.Children;
}

export function ResourceCommandList<T extends NamespacedResource>({
  navigationTitle,
  resourceLabel,
  loadErrorTitle,
  loadResources,
  getItemTitle,
  getItemSubtitle,
  renderItemActions,
}: ResourceCommandListProps<T>) {
  const contextState = useContextNamespace();
  const [items, setItems] = useState<T[]>([]);
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
      setItems([]);
      setIsLoading(false);
      setError(undefined);
      return;
    }

    const controller = new AbortController();
    const requestKey = `${contextState.selectedContext}::${contextState.selectedNamespace}`;
    setIsLoading(true);
    setItems([]);
    setError(undefined);

    loadResources(contextState.selectedContext, contextState.selectedNamespace, {
      forceRefresh: refreshToken > 0,
      signal: controller.signal,
    })
      .then((loaded) => {
        if (controller.signal.aborted || requestKey !== activeTargetKeyRef.current) {
          return;
        }
        setItems(loaded);
        setIsLoading(false);
      })
      .catch((loadError: unknown) => {
        if (controller.signal.aborted || requestKey !== activeTargetKeyRef.current) {
          return;
        }
        setError(loadError);
        setIsLoading(false);
      });

    return () => {
      controller.abort();
    };
  }, [contextState.namespaces, contextState.selectedContext, contextState.selectedNamespace, loadResources, refreshToken]);

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
    return <ErrorDetail title={loadErrorTitle} error={error} />;
  }

  return (
    <List
      isLoading={contextState.isLoadingContexts || contextState.isLoadingNamespaces || isLoading}
      navigationTitle={podpilotTitle(navigationTitle)}
    >
      <TargetSection state={contextState} onRefreshResources={refreshResources} onReloadTargets={reloadTargets} />

      <List.Section title={`${resourceLabel} (${items.length})`}>
        {items.map((item) => (
          <List.Item
            key={`${item.metadata.namespace ?? "default"}/${item.metadata.name}`}
            title={getItemTitle(item)}
            subtitle={getItemSubtitle(item)}
            icon={tintedIcon(Icon.Circle, BRAND_COLORS.sky)}
            accessories={isAllNamespaces(contextState.selectedNamespace) ? [{ text: item.metadata.namespace ?? "default" }] : []}
            actions={
              <ActionPanel>
                {renderItemActions({
                  item,
                  context: contextState.selectedContext,
                  selectedNamespace: contextState.selectedNamespace,
                  refreshResources,
                })}
                <Action title="Refresh Resources" icon={tintedIcon(Icon.ArrowClockwise, BRAND_COLORS.sky)} onAction={refreshResources} />
              </ActionPanel>
            }
          />
        ))}
      </List.Section>
    </List>
  );
}
