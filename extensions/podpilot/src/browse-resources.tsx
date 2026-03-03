import { Action, ActionPanel, Icon, List } from "@raycast/api";
import { useEffect, useMemo, useRef, useState } from "react";
import { DeploymentWorkspaceView } from "./components/DeploymentWorkspaceView";
import { ErrorDetail } from "./components/ErrorDetail";
import { PodDetailView, PodLogsDetail } from "./components/PodDetailView";
import { SelectContextList, SelectNamespaceList } from "./components/Selectors";
import { TargetPickerForm } from "./components/TargetPickerForm";
import { clearResourceCache, getCronJobs, getDeployments, getJobs, getPods, getServices } from "./lib/kube-data";
import {
  cronJobSummary,
  deploymentPrimaryImage,
  deploymentReadyStatus,
  jobSummary,
  podReadyStatus,
  podStatus,
  serviceSummary,
} from "./lib/k8s-display";
import { formatNamespaceLabel, isAllNamespaces, resolveItemNamespace } from "./lib/namespace";
import { formatAge } from "./lib/time";
import { useContextNamespace } from "./lib/use-context-namespace";
import { CronJob, Deployment, Job, Pod, Service } from "./types";

interface ResourceState {
  pods: Pod[];
  deployments: Deployment[];
  services: Service[];
  jobs: Job[];
  cronJobs: CronJob[];
  isLoading: boolean;
  error?: unknown;
}

export default function BrowseResourcesCommand() {
  const contextState = useContextNamespace();
  const [refreshToken, setRefreshToken] = useState<number>(0);
  const [resources, setResources] = useState<ResourceState>({
    pods: [],
    deployments: [],
    services: [],
    jobs: [],
    cronJobs: [],
    isLoading: true,
  });
  const activeTargetKeyRef = useRef<string>("");

  useEffect(() => {
    activeTargetKeyRef.current = `${contextState.selectedContext}::${contextState.selectedNamespace}`;
  }, [contextState.selectedContext, contextState.selectedNamespace]);

  useEffect(() => {
    const namespaceReady =
      Boolean(contextState.selectedNamespace) &&
      (isAllNamespaces(contextState.selectedNamespace) || contextState.namespaces.includes(contextState.selectedNamespace));

    if (!contextState.selectedContext || !namespaceReady) {
      setResources({
        pods: [],
        deployments: [],
        services: [],
        jobs: [],
        cronJobs: [],
        isLoading: false,
      });
      return;
    }

    const controller = new AbortController();
    const requestKey = `${contextState.selectedContext}::${contextState.selectedNamespace}`;
    setResources({
      pods: [],
      deployments: [],
      services: [],
      jobs: [],
      cronJobs: [],
      isLoading: true,
      error: undefined,
    });

    Promise.all([
      getPods(contextState.selectedContext, contextState.selectedNamespace, { forceRefresh: refreshToken > 0, signal: controller.signal }),
      getDeployments(contextState.selectedContext, contextState.selectedNamespace, {
        forceRefresh: refreshToken > 0,
        signal: controller.signal,
      }),
      getServices(contextState.selectedContext, contextState.selectedNamespace, {
        forceRefresh: refreshToken > 0,
        signal: controller.signal,
      }),
      getJobs(contextState.selectedContext, contextState.selectedNamespace, { forceRefresh: refreshToken > 0, signal: controller.signal }),
      getCronJobs(contextState.selectedContext, contextState.selectedNamespace, {
        forceRefresh: refreshToken > 0,
        signal: controller.signal,
      }),
    ])
      .then(([pods, deployments, services, jobs, cronJobs]) => {
        if (controller.signal.aborted || requestKey !== activeTargetKeyRef.current) {
          return;
        }

        setResources({
          pods,
          deployments,
          services,
          jobs,
          cronJobs,
          isLoading: false,
        });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted || requestKey !== activeTargetKeyRef.current) {
          return;
        }

        setResources((current) => ({
          ...current,
          isLoading: false,
          error,
        }));
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

  const navSubtitle = useMemo(() => {
    if (!contextState.selectedContext || !contextState.selectedNamespace) {
      return "Loading...";
    }

    return `${contextState.selectedContext} / ${formatNamespaceLabel(contextState.selectedNamespace)}`;
  }, [contextState.selectedContext, contextState.selectedNamespace]);

  if (contextState.error) {
    return <ErrorDetail title="Failed to load contexts or namespaces" error={contextState.error} />;
  }

  if (resources.error) {
    return <ErrorDetail title="Failed to load resources" error={resources.error} />;
  }

  return (
    <List isLoading={contextState.isLoadingContexts || contextState.isLoadingNamespaces || resources.isLoading} navigationTitle="Browse Resources">
      <List.Section title={`Target (${navSubtitle})`}>
        <List.Item
          title="Selected Context"
          subtitle={contextState.selectedContext || "-"}
          icon={Icon.Globe}
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
                icon={Icon.ArrowClockwise}
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
                icon={Icon.TextCursor}
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

      <List.Section title={`Pods (${resources.pods.length})`}>
        {resources.pods.map((pod) => (
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
                  icon={Icon.Terminal}
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

      <List.Section title={`Deployments (${resources.deployments.length})`}>
        {resources.deployments.map((deployment) => (
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
                  icon={Icon.Gear}
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

      <List.Section title={`Services (${resources.services.length})`}>
        {resources.services.map((service) => (
          <List.Item
            key={`${service.metadata.namespace ?? "default"}/${service.metadata.name}`}
            title={service.metadata.name}
            subtitle={serviceSummary(service)}
            accessories={isAllNamespaces(contextState.selectedNamespace) ? [{ text: service.metadata.namespace ?? "default" }] : []}
            actions={
              <ActionPanel>
                <Action title="Refresh" icon={Icon.ArrowClockwise} onAction={refreshData} />
              </ActionPanel>
            }
          />
        ))}
      </List.Section>

      <List.Section title={`Jobs (${resources.jobs.length})`}>
        {resources.jobs.map((job) => (
          <List.Item
            key={`${job.metadata.namespace ?? "default"}/${job.metadata.name}`}
            title={job.metadata.name}
            subtitle={jobSummary(job)}
            accessories={isAllNamespaces(contextState.selectedNamespace) ? [{ text: job.metadata.namespace ?? "default" }] : []}
            actions={
              <ActionPanel>
                <Action title="Refresh" icon={Icon.ArrowClockwise} onAction={refreshData} />
              </ActionPanel>
            }
          />
        ))}
      </List.Section>

      <List.Section title={`CronJobs (${resources.cronJobs.length})`}>
        {resources.cronJobs.map((cronJob) => (
          <List.Item
            key={`${cronJob.metadata.namespace ?? "default"}/${cronJob.metadata.name}`}
            title={cronJob.metadata.name}
            subtitle={cronJobSummary(cronJob)}
            accessories={isAllNamespaces(contextState.selectedNamespace) ? [{ text: cronJob.metadata.namespace ?? "default" }] : []}
            actions={
              <ActionPanel>
                <Action title="Refresh" icon={Icon.ArrowClockwise} onAction={refreshData} />
              </ActionPanel>
            }
          />
        ))}
      </List.Section>
    </List>
  );
}
