import { Action, ActionPanel, Alert, Form, Icon, List, Toast, confirmAlert, showToast, useNavigation } from "@raycast/api";
import { FormValidation, useForm } from "@raycast/utils";
import { useCallback, useEffect, useMemo, useState } from "react";
import { BRAND_COLORS, podPhaseColor, podpilotHeader, podpilotTitle, readyColor, tintedIcon } from "../lib/brand";
import { clearResourceCache, getDeploymentEvents, getPodsForDeployment } from "../lib/kube-data";
import { deploymentImages, deploymentPrimaryImage, deploymentReadyStatus, podReadyStatus, podStatus } from "../lib/k8s-display";
import { runKubectl } from "../lib/kubectl";
import { formatAge, formatTimestamp } from "../lib/time";
import { Deployment, Pod } from "../types";
import { CommandOutputDetail } from "./CommandOutputDetail";
import { ErrorDetail } from "./ErrorDetail";
import { PodDetailView, PodLogsDetail } from "./PodDetailView";

interface DeploymentWorkspaceViewProps {
  context: string;
  namespace: string;
  deployment: Deployment;
  onMutated?: () => Promise<void> | void;
}

interface ScaleValues {
  replicas: string;
}

export function DeploymentWorkspaceView({ context, namespace, deployment, onMutated }: DeploymentWorkspaceViewProps) {
  const name = deployment.metadata.name;
  const [pods, setPods] = useState<Pod[]>([]);
  const [isLoadingPods, setIsLoadingPods] = useState<boolean>(true);
  const [podsError, setPodsError] = useState<unknown>();
  const [refreshToken, setRefreshToken] = useState<number>(0);

  useEffect(() => {
    const controller = new AbortController();
    setIsLoadingPods(true);
    setPods([]);
    setPodsError(undefined);

    getPodsForDeployment(context, namespace, deployment, {
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
      .catch((error: unknown) => {
        if (controller.signal.aborted) {
          return;
        }

        setPodsError(error);
        setIsLoadingPods(false);
      });

    return () => {
      controller.abort();
    };
  }, [context, namespace, deployment, refreshToken]);

  const refreshData = useCallback(async () => {
    clearResourceCache(context, namespace);
    setRefreshToken((value) => value + 1);
    await onMutated?.();
  }, [context, namespace, onMutated]);

  const runMutation = useCallback(
    async (title: string, command: () => Promise<void>) => {
      const toast = await showToast({ style: Toast.Style.Animated, title });
      try {
        await command();
        await refreshData();
        toast.style = Toast.Style.Success;
      } catch (error) {
        toast.style = Toast.Style.Failure;
        toast.message = error instanceof Error ? error.message : String(error);
      }
    },
    [refreshData],
  );

  const summary = useMemo(
    () =>
      `Ready ${deploymentReadyStatus(deployment)} • ${formatAge(deployment.metadata.creationTimestamp)} • ${deploymentPrimaryImage(deployment)}`,
    [deployment],
  );

  if (podsError) {
    return <ErrorDetail title={`Failed to load pods for deployment ${name}`} error={podsError} />;
  }

  return (
    <List isLoading={isLoadingPods} navigationTitle={podpilotTitle(`Deployment: ${name}`)} searchBarPlaceholder="Find actions or pods">
      <List.Section title="Deployment Overview">
        <List.Item
          title={name}
          subtitle={summary}
          icon={tintedIcon(Icon.Gear, BRAND_COLORS.blue)}
          accessories={[{ text: deploymentImages(deployment) }, { text: `${context} / ${namespace}` }]}
          actions={
            <ActionPanel>
              <Action title="Refresh Workspace" icon={tintedIcon(Icon.ArrowClockwise, BRAND_COLORS.sky)} onAction={refreshData} />
            </ActionPanel>
          }
        />
      </List.Section>

      <List.Section title="Deployment Controls">
        <List.Item
          title="Rollout Restart"
          icon={tintedIcon(Icon.RotateClockwise, BRAND_COLORS.orange)}
          subtitle="kubectl rollout restart"
          actions={
            <ActionPanel>
              <Action
                title="Run Rollout Restart"
                icon={tintedIcon(Icon.RotateClockwise, BRAND_COLORS.orange)}
                onAction={async () => {
                  await runMutation("Restarting rollout", async () => {
                    await runKubectl(["rollout", "restart", `deploy/${name}`], { context, namespace });
                  });
                }}
              />
              <Action title="Refresh Workspace" icon={tintedIcon(Icon.ArrowClockwise, BRAND_COLORS.sky)} onAction={refreshData} />
            </ActionPanel>
          }
        />

        <List.Item
          title="Rollout Status"
          icon={tintedIcon(Icon.ArrowClockwise, BRAND_COLORS.sky)}
          subtitle="kubectl rollout status"
          actions={
            <ActionPanel>
              <Action.Push
                title="Open Rollout Status"
                target={
                  <CommandOutputDetail
                    title={`Rollout Status: ${name}`}
                    subtitle={`${context}/${namespace}`}
                    run={async (signal) => {
                      const result = await runKubectl(["rollout", "status", `deploy/${name}`], {
                        context,
                        namespace,
                        signal,
                      });
                      return {
                        markdown: `${podpilotHeader("Rollout Status", `${context}/${namespace}`)}\`\`\`\n${result.stdout || "(no output)"}\n\`\`\``,
                        raw: result.stdout,
                      };
                    }}
                  />
                }
              />
            </ActionPanel>
          }
        />

        <List.Item
          title="Scale Replicas"
          icon={tintedIcon(Icon.BarChart, BRAND_COLORS.gold)}
          subtitle="Set desired replica count"
          actions={
            <ActionPanel>
              <Action.Push
                title="Scale Deployment"
                target={
                  <ScaleDeploymentForm
                    context={context}
                    namespace={namespace}
                    deploymentName={name}
                    currentReplicas={deployment.spec?.replicas ?? deployment.status?.replicas ?? 1}
                    onMutated={refreshData}
                  />
                }
              />
            </ActionPanel>
          }
        />

        <List.Item
          title="Undo Rollout"
          icon={tintedIcon(Icon.ArrowClockwise, BRAND_COLORS.warning)}
          subtitle="Revert to previous deployment revision"
          actions={
            <ActionPanel>
              <Action
                title="Undo Rollout"
                style={Action.Style.Destructive}
                onAction={async () => {
                  const confirmed = await confirmAlert({
                    title: `Undo rollout for ${name}?`,
                    message: "This reverts to the previous deployment revision.",
                    primaryAction: {
                      title: "Undo Rollout",
                      style: Alert.ActionStyle.Destructive,
                    },
                  });

                  if (!confirmed) {
                    return;
                  }

                  await runMutation("Undoing rollout", async () => {
                    await runKubectl(["rollout", "undo", `deploy/${name}`], { context, namespace });
                  });
                }}
              />
            </ActionPanel>
          }
        />

        <List.Item
          title="Show Events"
          icon={tintedIcon(Icon.List, BRAND_COLORS.sky)}
          subtitle="Deployment-related events"
          actions={
            <ActionPanel>
              <Action.Push
                title="Open Events"
                target={
                  <CommandOutputDetail
                    title={`Deployment Events: ${name}`}
                    subtitle={`${context}/${namespace}`}
                    run={async () => {
                      const output = await getDeploymentEvents(context, namespace, name);
                      return {
                        markdown: `${podpilotHeader("Deployment Events", `${context}/${namespace}`)}\`\`\`\n${
                          output || "(no events found)"
                        }\n\`\`\``,
                        raw: output,
                      };
                    }}
                  />
                }
              />
            </ActionPanel>
          }
        />
      </List.Section>

      <List.Section title={`Pods (${pods.length})`}>
        {pods.length === 0 ? (
          <List.Item
            title="No Pods Found"
            subtitle="No pods currently match the deployment selector"
            icon={tintedIcon(Icon.Info, BRAND_COLORS.gold)}
            actions={
              <ActionPanel>
                <Action title="Refresh Workspace" icon={tintedIcon(Icon.ArrowClockwise, BRAND_COLORS.sky)} onAction={refreshData} />
              </ActionPanel>
            }
          />
        ) : null}

        {pods.map((pod) => {
          const status = podStatus(pod);
          const ready = podReadyStatus(pod);
          return (
            <List.Item
              key={pod.metadata.name}
              title={pod.metadata.name}
              subtitle={status}
              icon={tintedIcon(Icon.Circle, podPhaseColor(status))}
              accessories={[
                { tag: { value: ready, color: readyColor(ready) } },
                { text: pod.spec?.nodeName ?? "-" },
                { text: formatAge(pod.metadata.creationTimestamp) },
              ]}
              actions={
                <ActionPanel>
                  <Action.Push
                    title="Tail Logs (Live)"
                    icon={tintedIcon(Icon.Terminal, BRAND_COLORS.orange)}
                    target={<PodLogsDetail context={context} namespace={namespace} podName={pod.metadata.name} follow tailLines={200} />}
                  />
                  <Action.Push
                    title="Open Pod Workspace"
                    icon={tintedIcon(Icon.AppWindow, BRAND_COLORS.blue)}
                    target={<PodDetailView context={context} namespace={namespace} pod={pod} onMutated={refreshData} />}
                  />
                  <Action title="Refresh Workspace" icon={tintedIcon(Icon.ArrowClockwise, BRAND_COLORS.sky)} onAction={refreshData} />
                </ActionPanel>
              }
            />
          );
        })}
      </List.Section>

      <List.Section title="Details">
        <List.Item
          title="Created"
          subtitle={formatTimestamp(deployment.metadata.creationTimestamp)}
          icon={tintedIcon(Icon.Calendar, BRAND_COLORS.sky)}
          actions={
            <ActionPanel>
              <Action title="Refresh Workspace" icon={tintedIcon(Icon.ArrowClockwise, BRAND_COLORS.sky)} onAction={refreshData} />
            </ActionPanel>
          }
        />
      </List.Section>
    </List>
  );
}

function ScaleDeploymentForm({
  context,
  namespace,
  deploymentName,
  currentReplicas,
  onMutated,
}: {
  context: string;
  namespace: string;
  deploymentName: string;
  currentReplicas: number;
  onMutated?: () => Promise<void> | void;
}) {
  const { pop } = useNavigation();
  const { handleSubmit, itemProps } = useForm<ScaleValues>({
    initialValues: {
      replicas: `${currentReplicas}`,
    },
    validation: {
      replicas: FormValidation.Required,
    },
    onSubmit: async (values) => {
      const replicas = Number.parseInt(values.replicas, 10);
      if (!Number.isFinite(replicas) || replicas < 0) {
        await showToast({ style: Toast.Style.Failure, title: "Replicas must be a non-negative integer" });
        return;
      }

      const confirmed = await confirmAlert({
        title: `Scale ${deploymentName} to ${replicas}?`,
        message: "Scaling changes live traffic behavior. Confirm before applying.",
        primaryAction: {
          title: "Scale Deployment",
          style: Alert.ActionStyle.Destructive,
        },
      });

      if (!confirmed) {
        return;
      }

      const toast = await showToast({ style: Toast.Style.Animated, title: "Scaling deployment" });
      try {
        await runKubectl(["scale", `deploy/${deploymentName}`, `--replicas=${replicas}`], { context, namespace });
        await onMutated?.();
        toast.style = Toast.Style.Success;
        toast.title = "Deployment scaled";
        pop();
      } catch (error) {
        toast.style = Toast.Style.Failure;
        toast.title = "Failed to scale deployment";
        toast.message = error instanceof Error ? error.message : String(error);
      }
    },
  });

  return (
    <Form
      navigationTitle={podpilotTitle("Scale Deployment")}
      actions={
        <ActionPanel>
          <Action.SubmitForm title="Scale" onSubmit={handleSubmit} />
        </ActionPanel>
      }
    >
      <Form.TextField title="Replicas" {...itemProps.replicas} />
    </Form>
  );
}
